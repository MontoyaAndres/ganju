import { constants } from './constants';

// How a burst of messages from one participant is coalesced into a single turn.
// The buffer lives in a Durable Object keyed by (channel, conversation,
// participant) — these helpers are the pieces both sides of that boundary share:
// the webhook that pushes into the buffer and the DO that flushes it.

// A single inbound message held in the buffer. `externalMessageId` is the
// platform's own id (Telegram message_id, Slack ts, wamid, Discord message id) —
// it dedupes platform webhook resends and is recorded on the channel_message row.
export interface BufferedChannelMessage {
  text: string;
  externalMessageId: string | null;
  receivedAt: number;
  // Answer without waiting for the burst to settle: an explicit command, or a
  // message on a channel with buffering turned off. It still goes through the
  // buffer — that is what runs the turn under a caller patient enough for a
  // long answer — it just flushes at once, taking any pending text with it.
  immediate?: boolean;
  // The prompt this message invoked, when it was a slash command.
  command?: BufferedChannelCommand | null;
  // Where this message must be answered, when that isn't the envelope's
  // `delivery` — a Discord interaction waiting on its deferred response. Kept
  // on the message because the envelope is replaced by every newer push, and a
  // plain message typed a moment later must not orphan the interaction.
  reply?: Record<string, unknown> | null;
}

// A resolved slash-command prompt, carried with the message that invoked it so
// the flush can run it exactly as the webhook would have.
export interface BufferedChannelCommand {
  promptId: string;
  artifactPromptId: string | null;
  promptTitle: string;
  args: Record<string, string>;
}

// The prompt a batch runs: the newest command in it, since that is the one the
// participant asked for last. Null for a batch of plain text.
export const batchCommand = (
  messages: BufferedChannelMessage[]
): BufferedChannelCommand | null => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const command = messages[i].command;
    if (command) return command;
  }
  return null;
};

// Everything the flush needs to run the turn and deliver the reply, minus the
// message texts themselves. The newest push wins: a display name or thread id
// can change mid-burst, and the freshest is the one to answer against.
// `delivery` is opaque here — each platform stores what its own send path needs
// (chat id + reply-to, Slack channel + thread_ts, …).
export interface ChannelBufferEnvelope {
  channelId: string;
  platform: string;
  externalConversationId: string;
  conversationTitle: string | null;
  conversationScope: string;
  externalParticipantId: string;
  participantDisplayName: string | null;
  participantMetadata: Record<string, unknown> | null;
  delivery: Record<string, unknown>;
}

// The payload the DO hands back to the worker when a batch is ready.
export interface ChannelBufferFlush {
  envelope: ChannelBufferEnvelope;
  messages: BufferedChannelMessage[];
  // Stable across every hand-off of the same batch, so the worker can tell a
  // retry of a turn it already answered from a new one.
  batchId: string;
}

// Read the channel's debounce window off its `config`, clamped to the supported
// range. An unset value takes the default; an explicit 0 disables buffering, so
// the channel answers every message as it arrives. Anything malformed (a string,
// a negative, a value past the cap) falls back to the default rather than
// throwing — a bad config row must not take a live bot down.
export const resolveDebounceMs = (config: unknown): number => {
  const raw = (config as { debounceMs?: unknown } | null)?.debounceMs;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return constants.CHANNEL_DEBOUNCE_DEFAULT_MS;
  }
  if (raw === constants.CHANNEL_DEBOUNCE_DISABLED) {
    return constants.CHANNEL_DEBOUNCE_DISABLED;
  }
  if (raw < constants.CHANNEL_DEBOUNCE_MIN_MS) {
    return constants.CHANNEL_DEBOUNCE_DEFAULT_MS;
  }
  return Math.min(raw, constants.CHANNEL_DEBOUNCE_MAX_MS);
};

// The DO instance name for one participant's burst. Keyed by participant, not
// just conversation: in a group chat two people asking at once are two separate
// questions, and merging them into one turn would answer neither well.
export const channelBufferKey = (
  channelId: string,
  externalConversationId: string,
  externalParticipantId: string
): string => `${channelId}:${externalConversationId}:${externalParticipantId}`;

// Collapse buffered messages into the single user turn the model sees. Blank
// fragments are dropped (a bare @mention among real text carries nothing).
export const joinBufferedMessages = (
  messages: Array<{ text: string }>
): string =>
  messages
    .map(message => message.text.trim())
    .filter(Boolean)
    .join(constants.CHANNEL_DEBOUNCE_JOIN);
