import { Context } from 'hono';
import { utils } from '@ganju/utils';

import type {
  BufferedChannelMessage,
  ChannelBufferEnvelope
} from '@ganju/utils';
import type { AppEnv } from '../../types';

// The webhook side of message debouncing. Each platform handler decides what a
// message *is* (mentions stripped, bot posts ignored, slash commands resolved)
// and then either buffers it here or — for an explicit command — drains the
// buffer and answers immediately. The MessageBufferDO holds the burst; the
// `/channel/:id/ingest/debounced` route runs the turn once it flushes.

const bufferStub = (
  c: Context<AppEnv>,
  envelope: Pick<
    ChannelBufferEnvelope,
    'channelId' | 'externalConversationId' | 'externalParticipantId'
  >
) => {
  const ns = c.env.MESSAGE_BUFFER;
  return ns.get(
    ns.idFromName(
      utils.channelBufferKey(
        envelope.channelId,
        envelope.externalConversationId,
        envelope.externalParticipantId
      )
    )
  );
};

// Hold one inbound message until the participant stops typing. Returns false
// when the caller should answer it inline instead — either because this channel
// has buffering turned off (`config.debounceMs === 0`), or because the buffer
// couldn't be reached. Falling back to an immediate answer degrades to the old
// message-at-a-time behavior, which is far better than dropping what the user
// said because a Durable Object was unavailable.
export const bufferChannelMessage = async (
  c: Context<AppEnv>,
  channelConfig: unknown,
  envelope: ChannelBufferEnvelope,
  message: BufferedChannelMessage
): Promise<boolean> => {
  const debounceMs = utils.resolveDebounceMs(channelConfig);
  if (debounceMs === utils.constants.CHANNEL_DEBOUNCE_DISABLED) return false;

  try {
    await bufferStub(c, envelope).push(envelope, message, debounceMs);
    return true;
  } catch (error) {
    console.error('Failed to buffer channel message; answering inline', error);
    return false;
  }
};

// Take whatever the participant typed just before an explicit command, so those
// messages ride along in the same turn instead of being answered separately a
// moment later. Best-effort: if the buffer can't be reached the command still
// runs, it just doesn't pick up the pending text.
export const drainChannelBuffer = async (
  c: Context<AppEnv>,
  envelope: Pick<
    ChannelBufferEnvelope,
    'channelId' | 'externalConversationId' | 'externalParticipantId'
  >
): Promise<BufferedChannelMessage[]> => {
  try {
    return await bufferStub(c, envelope).drain();
  } catch {
    return [];
  }
};

// A buffered batch (or a drained one) as the runner wants it.
export const toRunUserMessages = (
  messages: BufferedChannelMessage[]
): Array<{ text: string; externalMessageId: string | null }> =>
  messages.map(message => ({
    text: message.text,
    externalMessageId: message.externalMessageId
  }));
