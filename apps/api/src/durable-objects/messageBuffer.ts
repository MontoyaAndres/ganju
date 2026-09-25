import { DurableObject } from 'cloudflare:workers';
import { utils } from '@ganju/utils';

import type {
  BufferedChannelMessage,
  ChannelBufferEnvelope,
  ChannelBufferFlush
} from '@ganju/utils';
import type { Bindings } from '../types';

// One MessageBufferDO per (channel, conversation, participant) — see
// `channelBufferKey`. People type in bursts, and answering each fragment
// separately gives three half-informed replies (and bills three assistant
// turns). This holds a burst until the typist pauses, then hands the whole
// batch to the worker so the agent answers it once.
//
// The DO never talks to a chat platform. On flush it POSTs the batch to the
// worker's own `/channel/:id/ingest/debounced` route (via the API service
// binding), where the platform handlers run the turn and post the reply —
// exactly the split DiscordGatewayDO uses for inbound Gateway messages.

// The batch a hand-off is carrying, written before the hand-off starts and
// removed once it ends. If the object restarts mid-turn (a deploy restarts it
// along with the worker), the retried alarm finds this and re-sends the same
// batch under the same id, rather than a fresh one the worker can't recognise
// as a turn it may already have answered.
interface InFlightBatch {
  batchId: string;
  count: number;
}

export class MessageBufferDO extends DurableObject<Bindings> {
  // A hand-off lasts as long as the turn it runs — half a minute for a long
  // answer — and storage is only cleared once it returns. A second flush in
  // that window (the message cap reached mid-turn) would read the same batch
  // and answer it twice, so it waits for the first instead. In memory is
  // enough: the object stays alive while its own request is in flight.
  private flushing = false;

  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env);
  }

  // Append one inbound message and (re)arm the flush. Called from the webhook
  // handler, which has already verified the platform signature.
  async push(
    envelope: ChannelBufferEnvelope,
    message: BufferedChannelMessage,
    debounceMs: number
  ): Promise<void> {
    const messages =
      (await this.ctx.storage.get<BufferedChannelMessage[]>('messages')) || [];

    // Platform webhook resends repeat a message we may already hold (Slack
    // retries, Meta resends). Same id = same message, so drop the repeat rather
    // than answering it twice within one batch.
    if (
      message.externalMessageId &&
      messages.some(
        existing => existing.externalMessageId === message.externalMessageId
      )
    ) {
      return;
    }

    messages.push(message);

    const now = Date.now();
    const firstAt = (await this.ctx.storage.get<number>('firstAt')) ?? now;

    // Kept so a flush that leaves messages behind can re-arm on the channel's
    // own window rather than falling back to the default.
    await this.ctx.storage.put({
      messages,
      envelope,
      firstAt,
      debounceMs
    });

    // A burst long enough to hit the message cap is answered now rather than
    // waiting out the window — past this many fragments the user is clearly
    // done making their point.
    if (messages.length >= utils.constants.CHANNEL_DEBOUNCE_MAX_MESSAGES) {
      await this.flush();
      return;
    }

    // The window restarts on every message so it tracks the typist, but never
    // past MAX_WAIT from the first one — otherwise someone who keeps typing
    // never gets an answer. A batch holding an immediate message (a command, or
    // a channel with buffering off) flushes now, and a plain message typed
    // right after it must not push that back.
    const target = messages.some(m => m.immediate)
      ? now
      : Math.min(
          now + debounceMs,
          firstAt + utils.constants.CHANNEL_DEBOUNCE_MAX_WAIT_MS
        );
    await this.ctx.storage.setAlarm(target);
  }

  async alarm(): Promise<void> {
    await this.flush();
  }

  private async clear(): Promise<void> {
    await this.ctx.storage.delete([
      'messages',
      'envelope',
      'firstAt',
      'debounceMs',
      'inFlight'
    ]);
    await this.ctx.storage.deleteAlarm();
  }

  private async flush(): Promise<void> {
    if (this.flushing) {
      // Not the channel's window, which may be zero: this only has to outlast
      // the flush in flight, which re-arms for whatever it leaves behind.
      await this.ctx.storage.setAlarm(
        Date.now() + utils.constants.CHANNEL_DEBOUNCE_RETRY_MS
      );
      return;
    }
    this.flushing = true;
    try {
      await this.flushBatch();
    } finally {
      this.flushing = false;
    }
  }

  private async flushBatch(): Promise<void> {
    const messages =
      (await this.ctx.storage.get<BufferedChannelMessage[]>('messages')) || [];
    const envelope =
      await this.ctx.storage.get<ChannelBufferEnvelope>('envelope');
    if (messages.length === 0 || !envelope) {
      await this.clear();
      return;
    }

    const secret = utils.getEnv({ env: this.env }, 'MCP_INTERNAL_SECRET');
    if (!secret) {
      // Without the internal secret the ingest route would reject us on every
      // retry, so drop the batch rather than spinning an alarm against a
      // misconfigured deployment.
      console.error(
        'MessageBufferDO: MCP_INTERNAL_SECRET is not set — dropping batch'
      );
      await this.clear();
      return;
    }

    // A batch whose hand-off already started keeps its id and its size: the
    // messages pushed since then are the next batch, not part of this one.
    const pending = await this.ctx.storage.get<InFlightBatch>('inFlight');
    const inFlight: InFlightBatch =
      pending && pending.count > 0 && pending.count <= messages.length
        ? pending
        : { batchId: crypto.randomUUID(), count: messages.length };
    if (inFlight !== pending) await this.ctx.storage.put('inFlight', inFlight);
    const batch = messages.slice(0, inFlight.count);

    const body: ChannelBufferFlush = {
      envelope,
      messages: batch,
      batchId: inFlight.batchId
    };
    const delivered = await this.deliver(secret, body);

    if (delivered) {
      // A push can land while the fetch above is in flight — the input gate
      // doesn't cover network I/O — so keep anything that arrived after the
      // batch we just handed off instead of clearing wholesale.
      const current =
        (await this.ctx.storage.get<BufferedChannelMessage[]>('messages')) ||
        [];
      const leftover = current.slice(batch.length);
      await this.ctx.storage.delete(['attempts', 'inFlight']);
      if (leftover.length === 0) {
        await this.clear();
        return;
      }
      const debounceMs =
        (await this.ctx.storage.get<number>('debounceMs')) ??
        utils.constants.CHANNEL_DEBOUNCE_DEFAULT_MS;
      await this.ctx.storage.put({ messages: leftover, firstAt: Date.now() });
      await this.ctx.storage.setAlarm(
        Date.now() + (leftover.some(m => m.immediate) ? 0 : debounceMs)
      );
      return;
    }

    // Hand-off failed. Keep the batch and try again shortly — a dropped batch
    // reads to the user as the bot ignoring them. The retry carries the same
    // batch id, because the worker may have answered before the failure. Give
    // up after a few attempts so a permanently broken route can't loop forever.
    const attempts =
      ((await this.ctx.storage.get<number>('attempts')) ?? 0) + 1;
    if (attempts >= utils.constants.CHANNEL_DEBOUNCE_MAX_ATTEMPTS) {
      console.error(
        `MessageBufferDO: dropping ${messages.length} message(s) for channel ${envelope.channelId} after ${attempts} failed hand-offs`
      );
      await this.ctx.storage.delete('attempts');
      await this.clear();
      return;
    }
    await this.ctx.storage.put('attempts', attempts);
    await this.ctx.storage.setAlarm(
      Date.now() + utils.constants.CHANNEL_DEBOUNCE_RETRY_MS * attempts
    );
  }

  private async deliver(
    secret: string,
    body: ChannelBufferFlush
  ): Promise<boolean> {
    try {
      const response = await this.env.API.fetch(
        `https://ganju-message-buffer/channel/${body.envelope.channelId}/ingest/debounced`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [utils.constants.MCP_INTERNAL_HEADER]: secret
          },
          body: JSON.stringify(body)
        }
      );
      // Read the body even though only the status matters. Left unread, it
      // holds the ingest request open until this object shuts down, and the
      // turn that already answered is logged as canceled.
      await response.arrayBuffer().catch(() => undefined);
      return response.ok;
    } catch {
      return false;
    }
  }
}
