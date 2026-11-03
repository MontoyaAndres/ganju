import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { utils } from '@ganju/utils';

import * as schema from './schema';
import type { DbExecutor } from './usage';

const { constants } = utils;

// Messages a function or a trigger sends on a project's channels: to a
// customer the bot has spoken with, or to a chat the bot is in (the staff
// group). The channel's tokens stay here; user code names a participant or a
// chat. Each message is recorded on its conversation as the bot's, tagged
// with where it came from, so the bot's next turn knows the customer was
// told. Not counted or billed as an assistant reply.

export class ChannelSendError extends Error {
  readonly status: 400 | 403 | 404 | 409 | 429 | 502;

  constructor(message: string, status: ChannelSendError['status'] = 400) {
    super(message);
    this.name = 'ChannelSendError';
    this.status = status;
  }
}

export interface ChannelMessageSource {
  // A function's own ctx.channels call, or a trigger's chat / customer
  // message.
  kind: 'function' | 'trigger';
  name: string;
}

export interface ChannelTemplate {
  name: string;
  language: string;
  params?: string[];
}

export interface ChannelSendResult {
  messageId: string;
  conversationId: string;
  channelId: string;
  platform: string;
  // What went out: free text, or the template outside WhatsApp's window.
  sent: 'text' | 'template';
}

// Where a message's metadata says it came from: 'function' or 'trigger'.
export const CHANNEL_MESSAGE_SOURCE_KEY = 'source';

// WhatsApp takes free-form messages only within 24 hours of the customer's
// last message.
export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_TEXT = 4000;

type ChannelRow = typeof schema.channel.$inferSelect;

interface Credentials {
  botToken?: string;
  accessToken?: string;
  phoneNumberId?: string;
}

const credentialsOf = (
  channel: ChannelRow,
  encryptionKey: string
): Credentials => {
  try {
    return JSON.parse(
      utils.decryptString(channel.credentials, encryptionKey)
    ) as Credentials;
  } catch {
    throw new ChannelSendError(
      "This channel's credentials can't be read; connect it again.",
      409
    );
  }
};

const cleanText = (text: unknown): string => {
  if (typeof text !== 'string' || !text.trim()) {
    throw new ChannelSendError('A message needs "text".');
  }
  if (text.length > MAX_TEXT) {
    throw new ChannelSendError(`A message is at most ${MAX_TEXT} characters.`);
  }
  return text.trim();
};

// Long text goes out in pieces each platform accepts, cut at a line break
// or a space when there is one.
const pieces = (text: string, limit: number): string[] => {
  const out: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(' ', limit);
    if (cut < limit / 2) cut = limit;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
};

const readJson = async (
  response: Response | null
): Promise<Record<string, unknown>> =>
  response
    ? ((await response.json().catch(() => ({}))) as Record<string, unknown>)
    : {};

const failed = (platform: string, detail: unknown) =>
  new ChannelSendError(
    `${platform} refused the message${detail ? `: ${String(detail).slice(0, 300)}` : '.'}`,
    502
  );

// One plain-text message, never markup: what a function or a row says is
// sent as written. Returns the platform's id of the last piece.
const sendText = async (
  channel: ChannelRow,
  credentials: Credentials,
  chatId: string,
  text: string
): Promise<string> => {
  let lastId = '';
  if (channel.platform === constants.CHANNEL_PLATFORM_TELEGRAM) {
    for (const piece of pieces(text, constants.TELEGRAM_MESSAGE_LIMIT)) {
      const response = await fetch(
        `${constants.TELEGRAM_API_BASE}/bot${credentials.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: piece,
            link_preview_options: { is_disabled: true }
          })
        }
      ).catch(() => null);
      const body = await readJson(response);
      if (!response?.ok || body.ok !== true)
        throw failed('Telegram', body.description);
      lastId = String(
        (body.result as { message_id?: number } | undefined)?.message_id ?? ''
      );
    }
    return lastId;
  }
  if (channel.platform === constants.CHANNEL_PLATFORM_WHATSAPP) {
    for (const piece of pieces(text, constants.WHATSAPP_MESSAGE_LIMIT)) {
      lastId = await postWhatsapp(credentials, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: chatId,
        type: 'text',
        text: { body: piece, preview_url: false }
      });
    }
    return lastId;
  }
  if (channel.platform === constants.CHANNEL_PLATFORM_SLACK) {
    // Slack reads <!channel>, <@U…> and links in any text: escaped, they
    // show as typed and ping nobody. Each piece on its own, so a cut never
    // falls inside an entity.
    const escape = (piece: string) =>
      piece.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    for (const raw of pieces(text, constants.SLACK_MESSAGE_LIMIT)) {
      const piece = escape(raw);
      const response = await fetch(
        `${constants.SLACK_API_BASE}/chat.postMessage`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${credentials.botToken}`,
            'Content-Type': 'application/json; charset=utf-8'
          },
          // mrkdwn off: the text is shown as written.
          body: JSON.stringify({
            channel: chatId,
            text: piece,
            mrkdwn: false,
            unfurl_links: false,
            unfurl_media: false
          })
        }
      ).catch(() => null);
      const body = await readJson(response);
      if (body.ok !== true) throw failed('Slack', body.error);
      lastId = String(body.ts ?? '');
    }
    return lastId;
  }
  if (channel.platform === constants.CHANNEL_PLATFORM_DISCORD) {
    for (const piece of pieces(text, constants.DISCORD_MESSAGE_LIMIT)) {
      const response = await fetch(
        `${constants.DISCORD_API_BASE}/channels/${encodeURIComponent(chatId)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bot ${credentials.botToken}`,
            'Content-Type': 'application/json'
          },
          // Never pings anyone.
          body: JSON.stringify({
            content: piece,
            allowed_mentions: { parse: [] }
          })
        }
      ).catch(() => null);
      const body = await readJson(response);
      if (!response?.ok) throw failed('Discord', body.message);
      lastId = String(body.id ?? '');
    }
    return lastId;
  }
  throw new ChannelSendError(
    `Ganju can't send messages on ${channel.platform} channels.`
  );
};

const postWhatsapp = async (
  credentials: Credentials,
  payload: Record<string, unknown>
): Promise<string> => {
  const response = await fetch(
    `${constants.WHATSAPP_API_BASE}/${constants.WHATSAPP_API_VERSION}/${credentials.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  ).catch(() => null);
  const body = await readJson(response);
  if (!response?.ok) {
    const error = body.error as
      | { message?: string; error_data?: { details?: string } }
      | undefined;
    throw failed('WhatsApp', error?.error_data?.details ?? error?.message);
  }
  return String(
    (body.messages as { id?: string }[] | undefined)?.[0]?.id ?? ''
  );
};

const loadChannel = async (
  executor: DbExecutor,
  artifactId: string,
  channelId: string
): Promise<ChannelRow> => {
  const [channel] = await executor
    .select()
    .from(schema.channel)
    .where(
      and(
        eq(schema.channel.id, channelId),
        eq(schema.channel.artifactId, artifactId)
      )
    )
    .limit(1);
  if (!channel) {
    throw new ChannelSendError(
      `There is no channel ${channelId} in this project.`,
      404
    );
  }
  if (channel.status !== constants.STATUS_ACTIVE) {
    throw new ChannelSendError(
      `The ${channel.platform} channel is paused.`,
      409
    );
  }
  return channel;
};

const record = async (
  executor: DbExecutor,
  input: {
    channelId: string;
    conversationId: string;
    participantId: string | null;
    content: string;
    externalMessageId: string;
    source: ChannelMessageSource;
    template?: ChannelTemplate;
  }
) => {
  const [row] = await executor
    .insert(schema.channelMessage)
    .values({
      role: constants.ROLE_MESSAGE_ASSISTANT,
      content: input.content,
      externalMessageId: input.externalMessageId || null,
      conversationId: input.conversationId,
      participantId: input.participantId,
      metadata: {
        [CHANNEL_MESSAGE_SOURCE_KEY]: input.source.kind,
        [input.source.kind]: input.source.name,
        ...(input.template ? { template: input.template } : {})
      }
    })
    .returning({ id: schema.channelMessage.id });
  await executor
    .update(schema.channelConversation)
    .set({
      messageCount: sql`(${schema.channelConversation.messageCount}::int + 1)::int`,
      lastMessageAt: new Date()
    })
    .where(eq(schema.channelConversation.id, input.conversationId));
  await executor
    .update(schema.channel)
    .set({ messageCount: sql`(${schema.channel.messageCount}::int + 1)::int` })
    .where(eq(schema.channel.id, input.channelId));
  return row.id;
};

const notLimitNotice = sql`(${schema.channelMessage.metadata}->>${utils.PARTICIPANT_LIMIT_METADATA_KEY}) is null`;

/**
 * Messages a customer the bot has spoken with, in their private chat. On
 * WhatsApp, outside the 24 hours after their last message only an approved
 * template may go out: `template` is sent then, and without one the send
 * fails saying so. With both, Ganju picks per customer. The channel's daily
 * limit per customer applies.
 */
export const sendToParticipant = async (
  executor: DbExecutor,
  input: {
    artifactId: string;
    encryptionKey: string;
    participantId: string;
    text?: string | null;
    template?: ChannelTemplate | null;
    source: ChannelMessageSource;
    now?: Date;
  }
): Promise<ChannelSendResult> => {
  const now = input.now ?? new Date();
  const [found] = await executor
    .select({ participant: schema.channelParticipant, channel: schema.channel })
    .from(schema.channelParticipant)
    .innerJoin(
      schema.channel,
      eq(schema.channel.id, schema.channelParticipant.channelId)
    )
    .where(
      and(
        eq(schema.channelParticipant.id, input.participantId),
        eq(schema.channel.artifactId, input.artifactId)
      )
    )
    .limit(1);
  if (!found) {
    throw new ChannelSendError(
      `There is no customer ${input.participantId} on this project's channels.`,
      404
    );
  }
  const { participant } = found;
  const channel = await loadChannel(
    executor,
    input.artifactId,
    found.channel.id
  );
  if (!input.text && !input.template) {
    throw new ChannelSendError(
      'A message needs "text", a "template", or both.'
    );
  }
  const text = input.text ? cleanText(input.text) : null;

  // Their private chat: the latest one they wrote in.
  const [conversation] = await executor
    .select({
      id: schema.channelConversation.id,
      externalConversationId: schema.channelConversation.externalConversationId
    })
    .from(schema.channelMessage)
    .innerJoin(
      schema.channelConversation,
      eq(schema.channelConversation.id, schema.channelMessage.conversationId)
    )
    .where(
      and(
        eq(schema.channelMessage.participantId, participant.id),
        eq(schema.channelMessage.role, constants.ROLE_MESSAGE_USER),
        eq(
          schema.channelConversation.scope,
          constants.CHANNEL_CONVERSATION_SCOPE_PRIVATE
        )
      )
    )
    .orderBy(desc(schema.channelMessage.createdAt))
    .limit(1);
  if (!conversation) {
    throw new ChannelSendError(
      'This customer has never written to the bot privately, so there is no chat to message them in.',
      409
    );
  }

  const limit = utils.resolveParticipantDailyLimit(channel.config);
  if (limit !== null) {
    const [usage] = await executor
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.channelMessage)
      .where(
        and(
          eq(schema.channelMessage.participantId, participant.id),
          eq(schema.channelMessage.role, constants.ROLE_MESSAGE_ASSISTANT),
          notLimitNotice,
          gt(
            schema.channelMessage.createdAt,
            new Date(now.getTime() - utils.PARTICIPANT_DAILY_LIMIT_WINDOW_MS)
          )
        )
      );
    if ((usage?.n ?? 0) >= limit) {
      throw new ChannelSendError(
        `This customer already got the channel's ${limit} messages for the last 24 hours.`,
        429
      );
    }
  }

  let useTemplate = false;
  if (channel.platform === constants.CHANNEL_PLATFORM_WHATSAPP) {
    const [last] = await executor
      .select({ at: schema.channelMessage.createdAt })
      .from(schema.channelMessage)
      .where(
        and(
          eq(schema.channelMessage.participantId, participant.id),
          eq(schema.channelMessage.role, constants.ROLE_MESSAGE_USER)
        )
      )
      .orderBy(desc(schema.channelMessage.createdAt))
      .limit(1);
    const inside =
      !!last &&
      now.getTime() - new Date(last.at).getTime() < WHATSAPP_WINDOW_MS;
    if (!inside) {
      if (!input.template) {
        throw new ChannelSendError(
          "Outside WhatsApp's 24-hour window (this customer last wrote more than 24 hours ago); use an approved template.",
          409
        );
      }
      useTemplate = true;
    } else if (!text) {
      useTemplate = true;
    }
  } else if (!text) {
    throw new ChannelSendError(
      `Templates are for WhatsApp; ${channel.platform} takes "text".`
    );
  }

  const credentials = credentialsOf(channel, input.encryptionKey);
  const chatId = conversation.externalConversationId;
  let externalId: string;
  let content: string;
  if (useTemplate) {
    const template = input.template!;
    const params = (template.params ?? []).map(p => String(p).slice(0, 1024));
    externalId = await postWhatsapp(credentials, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: chatId,
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.language },
        ...(params.length
          ? {
              components: [
                {
                  type: 'body',
                  parameters: params.map(text => ({ type: 'text', text }))
                }
              ]
            }
          : {})
      }
    });
    content =
      text ??
      `[template ${template.name}${params.length ? `: ${params.join(' · ')}` : ''}]`;
  } else {
    externalId = await sendText(channel, credentials, chatId, text!);
    content = text!;
  }
  const messageId = await record(executor, {
    channelId: channel.id,
    conversationId: conversation.id,
    participantId: participant.id,
    content,
    externalMessageId: externalId,
    source: input.source,
    ...(useTemplate ? { template: input.template! } : {})
  });
  return {
    messageId,
    conversationId: conversation.id,
    channelId: channel.id,
    platform: channel.platform,
    sent: useTemplate ? 'template' : 'text'
  };
};

/**
 * Posts to a chat on one of the project's channels: a Telegram group, a
 * Slack or Discord channel the bot is in. Recorded on that chat's
 * conversation when the bot has one.
 */
export const postToChat = async (
  executor: DbExecutor,
  input: {
    artifactId: string;
    encryptionKey: string;
    channelId: string;
    chatId: string;
    text: string;
    source: ChannelMessageSource;
  }
): Promise<ChannelSendResult> => {
  const channel = await loadChannel(
    executor,
    input.artifactId,
    input.channelId
  );
  const text = cleanText(input.text);
  const chatId = String(input.chatId ?? '').trim();
  if (!chatId) throw new ChannelSendError('A post needs "chatId".');
  if (channel.platform === constants.CHANNEL_PLATFORM_WHATSAPP) {
    throw new ChannelSendError(
      'WhatsApp has no group chats for bots; message a customer with send().'
    );
  }
  const credentials = credentialsOf(channel, input.encryptionKey);
  const externalId = await sendText(channel, credentials, chatId, text);
  const [conversation] = await executor
    .select({ id: schema.channelConversation.id })
    .from(schema.channelConversation)
    .where(
      and(
        eq(schema.channelConversation.channelId, channel.id),
        eq(schema.channelConversation.externalConversationId, chatId)
      )
    )
    .limit(1);
  const messageId = conversation
    ? await record(executor, {
        channelId: channel.id,
        conversationId: conversation.id,
        participantId: null,
        content: text,
        externalMessageId: externalId,
        source: input.source
      })
    : '';
  return {
    messageId,
    conversationId: conversation?.id ?? '',
    channelId: channel.id,
    platform: channel.platform,
    sent: 'text'
  };
};
