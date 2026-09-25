import { Context } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@ganju/db';
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

// Decide whether a batch the buffer handed over still needs a turn. The buffer
// re-sends a batch whenever a hand-off didn't come back ok — including one that
// was cut off after the turn had already replied, which a deploy mid-turn does
// to both sides at once. The runner tags the batch's rows with its id, so:
//
// - an assistant row with the id means the turn got through: skip it, or the
//   participant gets the same answer twice;
// - user rows with no assistant row mean the turn died before answering: drop
//   those rows (nothing counted them yet) and run it again, or they would reach
//   the model twice — once as history, once as the question.
//
// The one case this can't save is a turn cut between writing its reply and
// sending it to the platform; that answer is lost rather than doubled.
export const claimBufferedBatch = async (
  dbInstance: ReturnType<typeof db.create>,
  channelId: string,
  externalConversationId: string,
  batchId: string
): Promise<'run' | 'answered'> => {
  const [conversation] = await dbInstance
    .select({ id: db.schema.channelConversation.id })
    .from(db.schema.channelConversation)
    .where(
      and(
        eq(db.schema.channelConversation.channelId, channelId),
        eq(
          db.schema.channelConversation.externalConversationId,
          externalConversationId
        )
      )
    )
    .limit(1);
  if (!conversation) return 'run';

  const tagged = and(
    eq(db.schema.channelMessage.conversationId, conversation.id),
    sql`${db.schema.channelMessage.metadata}->>'bufferBatchId' = ${batchId}`
  );
  const rows = await dbInstance
    .select({
      id: db.schema.channelMessage.id,
      role: db.schema.channelMessage.role
    })
    .from(db.schema.channelMessage)
    .where(tagged);

  if (rows.some(row => row.role === utils.constants.ROLE_MESSAGE_ASSISTANT)) {
    return 'answered';
  }
  if (rows.length > 0) {
    await dbInstance.delete(db.schema.channelMessage).where(tagged);
  }
  return 'run';
};

// A buffered batch as the runner wants it.
export const toRunUserMessages = (
  messages: BufferedChannelMessage[]
): Array<{ text: string; externalMessageId: string | null }> =>
  messages.map(message => ({
    text: message.text,
    externalMessageId: message.externalMessageId
  }));
