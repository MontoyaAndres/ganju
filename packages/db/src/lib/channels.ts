import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { utils } from '@ganju/utils';

import * as schema from './schema';
import { lastTemplatesRead, syncWhatsappTemplates } from './whatsappTemplates';
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

// The owner's test of a customer message, sent to themselves: left out of
// the daily limits and labelled in the bot's history.
export const CHANNEL_MESSAGE_SOURCE_TRIGGER_TEST = 'trigger-test' as const;

export interface ChannelMessageSource {
  // A function's own ctx.channels call, a trigger's chat / customer message,
  // or the owner's test of a customer message, sent to themselves.
  kind: 'function' | 'trigger' | typeof CHANNEL_MESSAGE_SOURCE_TRIGGER_TEST;
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

// Where a message's metadata says it came from: 'function', 'trigger' or
// 'trigger-test'.
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
  businessAccountId?: string;
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
      | { code?: number; message?: string; error_data?: { details?: string } }
      | undefined;
    // Meta's codes in words; one a retry won't fix is final.
    const { text, retry } = utils.whatsappSendError(
      error?.code,
      error?.error_data?.details ?? error?.message
    );
    throw new ChannelSendError(`WhatsApp: ${text}`, retry ? 502 : 409);
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

type TemplateRow = typeof schema.channelWhatsappTemplate.$inferSelect;

const findTemplate = async (
  executor: DbExecutor,
  channelId: string,
  name: string,
  language: string
): Promise<TemplateRow | undefined> => {
  const [row] = await executor
    .select()
    .from(schema.channelWhatsappTemplate)
    .where(
      and(
        eq(schema.channelWhatsappTemplate.channelId, channelId),
        eq(schema.channelWhatsappTemplate.name, name),
        eq(schema.channelWhatsappTemplate.language, language)
      )
    )
    .limit(1);
  return row;
};

// Meta is read at most this often per channel for sends, whether the last
// read worked or not: a misspelled name in a busy trigger, or a token that
// can't read templates, would otherwise call Meta on every row.
const TEMPLATE_RESYNC_MS = 5 * 60 * 1000;

/**
 * The template, checked against what Meta last said about it. Refused only
 * when Ganju knows: Meta's status isn't approved, the list was read and it
 * isn't there, or Ganju can't fill it. Null when the list can't be read (a
 * token without whatsapp_business_management, no business account known):
 * then the template goes to Meta as given and Meta decides. A stored one
 * that isn't approved is read again once it's 5 minutes old, in case Meta
 * approved it and no webhook said so.
 */
const checkedTemplate = async (
  executor: DbExecutor,
  channel: ChannelRow,
  credentials: Credentials,
  template: ChannelTemplate,
  now: Date
): Promise<TemplateRow | null> => {
  let row = await findTemplate(
    executor,
    channel.id,
    template.name,
    template.language
  );
  const canRead =
    !!credentials.businessAccountId &&
    !!credentials.accessToken &&
    !!credentials.phoneNumberId;
  if (!canRead) return row ?? null;
  const stale =
    !row ||
    (row.status !== utils.WHATSAPP_TEMPLATE_STATUS_APPROVED &&
      now.getTime() - new Date(row.syncedAt).getTime() >= TEMPLATE_RESYNC_MS);
  let readOk: boolean;
  const last = lastTemplatesRead(channel.metadata);
  if (
    stale &&
    !(last && now.getTime() - new Date(last.at).getTime() < TEMPLATE_RESYNC_MS)
  ) {
    try {
      await syncWhatsappTemplates(executor, channel.id, {
        accessToken: credentials.accessToken!,
        phoneNumberId: credentials.phoneNumberId!,
        businessAccountId: credentials.businessAccountId
      });
      readOk = true;
    } catch (error) {
      console.error(
        'whatsapp-template-sync-failed',
        channel.id,
        error instanceof Error ? error.message : String(error)
      );
      readOk = false;
    }
    row = await findTemplate(
      executor,
      channel.id,
      template.name,
      template.language
    );
  } else {
    // Not read now: the stored row, or the last read's answer, decides.
    readOk = last ? last.ok : !!row;
  }
  // Missing from a list Ganju couldn't read: Meta decides.
  if (!row && !readOk) return null;
  const label = `The WhatsApp template ${template.name} (${template.language})`;
  if (!row) {
    throw new ChannelSendError(
      `${label} isn't on this channel's WhatsApp Business account. Create it in the channel's Message templates, or check its name and language.`,
      409
    );
  }
  if (row.status !== utils.WHATSAPP_TEMPLATE_STATUS_APPROVED) {
    const status = row.status.toLowerCase().replace(/_/g, ' ');
    const why =
      row.status === 'PENDING'
        ? "is still in Meta's review"
        : row.status === 'REJECTED'
          ? `was rejected by Meta${row.rejectedReason ? ` (${row.rejectedReason})` : ''}`
          : `is ${status} by Meta${row.rejectedReason ? ` (${row.rejectedReason})` : ''}`;
    throw new ChannelSendError(
      `${label} ${why}; only approved templates can be sent.`,
      409
    );
  }
  if (!utils.whatsappTemplateSendable(row.components)) {
    throw new ChannelSendError(
      `${label} has a media header, a header variable or a button that takes a value; Ganju only fills the message's variables. Make a version without them.`,
      409
    );
  }
  return row;
};

/**
 * The approved WhatsApp templates on a project's channels that Ganju can
 * send, for ctx.channels.templates(). Read from the cache the dashboard and the hourly
 * sync keep.
 */
export const listApprovedTemplates = async (
  executor: DbExecutor,
  artifactId: string
) => {
  const rows = await executor
    .select({ template: schema.channelWhatsappTemplate })
    .from(schema.channelWhatsappTemplate)
    .innerJoin(
      schema.channel,
      eq(schema.channel.id, schema.channelWhatsappTemplate.channelId)
    )
    .where(
      and(
        eq(schema.channel.artifactId, artifactId),
        eq(
          schema.channelWhatsappTemplate.status,
          utils.WHATSAPP_TEMPLATE_STATUS_APPROVED
        )
      )
    );
  // Only the ones Ganju can fill: media headers and buttons with values
  // would be refused by Meta.
  return rows
    .filter(({ template }) =>
      utils.whatsappTemplateSendable(template.components)
    )
    .map(({ template }) => {
      const content = utils.whatsappTemplateContent(template.components);
      const labels = Array.isArray(template.variableLabels)
        ? (template.variableLabels as unknown[]).map(l => String(l ?? ''))
        : [];
      return {
        channelId: template.channelId,
        name: template.name,
        language: template.language,
        category: template.category,
        text: content.body,
        variables: Array.from(
          { length: utils.whatsappTemplateVariableCount(content.body) },
          (_, i) => ({
            n: i + 1,
            label: labels[i] || null,
            example: content.examples[i] ?? null
          })
        )
      };
    });
};

const notLimitNotice = sql`(${schema.channelMessage.metadata}->>${utils.PARTICIPANT_LIMIT_METADATA_KEY}) is null`;
// An owner's test sends go to their own chat and don't use up the limit.
const notTriggerTest = sql`(${schema.channelMessage.metadata}->>${CHANNEL_MESSAGE_SOURCE_KEY}) is distinct from ${CHANNEL_MESSAGE_SOURCE_TRIGGER_TEST}`;

/**
 * Messages a customer the bot has spoken with, in their private chat. On
 * WhatsApp, outside the 24 hours after their last message only an approved
 * template may go out: `template` is sent then, and without one the send
 * fails saying so. With both, Ganju picks per customer, unless `prefer` is
 * 'template': then the template goes out inside the window too. The
 * channel's daily limit per customer applies.
 */
export const sendToParticipant = async (
  executor: DbExecutor,
  input: {
    artifactId: string;
    encryptionKey: string;
    participantId: string;
    text?: string | null;
    template?: ChannelTemplate | null;
    prefer?: 'template';
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
          notTriggerTest,
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
    } else if (!text || (input.prefer === 'template' && input.template)) {
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
    const known = await checkedTemplate(
      executor,
      channel,
      credentials,
      template,
      now
    );
    const body = known
      ? utils.whatsappTemplateContent(known.components).body
      : '';
    const expected = utils.whatsappTemplateVariableCount(body);
    const params = (template.params ?? []).map(
      utils.cleanWhatsappTemplateParam
    );
    // Only a template Ganju has read can be counted; Meta checks the rest.
    if (known && params.length !== expected) {
      throw new ChannelSendError(
        `The WhatsApp template ${template.name} has ${expected} ${expected === 1 ? 'variable' : 'variables'}; ${params.length} ${params.length === 1 ? 'value was' : 'values were'} given.`
      );
    }
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
    // What the customer read, so the bot's next turn knows.
    content = body
      ? utils.fillWhatsappTemplate(body, params)
      : `[template ${template.name}${params.length ? `: ${params.join(' · ')}` : ''}]`;
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
