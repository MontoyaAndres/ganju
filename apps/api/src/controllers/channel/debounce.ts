import { Context } from 'hono';
import { utils } from '@ganju/utils';

import type {
  BufferedChannelMessage,
  ChannelBufferEnvelope
} from '@ganju/utils';
import type { AppEnv } from '../../types';

// The webhook side of message debouncing. Each platform handler decides what a
// message *is* (mentions stripped, bot posts ignored, slash commands resolved)
// and hands it to the MessageBufferDO, which holds a burst until the typist
// pauses and then runs the turn through the `/channel/:id/ingest/debounced`
// route. Commands go through it too, flagged to flush at once.
//
// The buffer is also what makes a long turn safe. Its alarm waits on the ingest
// route for as long as the turn takes, while a webhook that ran the turn in
// waitUntil would be cancelled about 30 seconds after answering the platform —
// and platforms want an answer within a few seconds.

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

// Hand one inbound message to the buffer. It waits for the burst to settle,
// unless the message is `immediate` or the channel has buffering turned off
// (`config.debounceMs === 0`), in which case it flushes at once — with any text
// the participant typed just before it. Returns false only when the buffer
// couldn't be reached: the caller then answers inline, which is far better than
// dropping what the user said because a Durable Object was unavailable.
export const bufferChannelMessage = async (
  c: Context<AppEnv>,
  channelConfig: unknown,
  envelope: ChannelBufferEnvelope,
  message: BufferedChannelMessage
): Promise<boolean> => {
  const debounceMs = utils.resolveDebounceMs(channelConfig);
  const immediate =
    message.immediate === true ||
    debounceMs === utils.constants.CHANNEL_DEBOUNCE_DISABLED;

  try {
    await bufferStub(c, envelope).push(
      envelope,
      { ...message, immediate },
      debounceMs
    );
    return true;
  } catch (error) {
    console.error('Failed to buffer channel message; answering inline', error);
    return false;
  }
};

// A buffered batch as the runner wants it.
export const toRunUserMessages = (
  messages: BufferedChannelMessage[]
): Array<{ text: string; externalMessageId: string | null }> =>
  messages.map(message => ({
    text: message.text,
    externalMessageId: message.externalMessageId
  }));
