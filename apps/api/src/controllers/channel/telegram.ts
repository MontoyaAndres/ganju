import { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { db, utils as dbUtils } from '@ganju/db';
import { utils } from '@ganju/utils';
import type {
  ChannelNotifier,
  SourceButton,
  TelegramSendRequest,
  TelegramSendRemoteResourceRequest
} from '@ganju/utils';
import { getResourceHandler } from '@ganju/containers';

import { runChannelTurn } from './runner';
import { resolveSlashPrompt } from './slashPrompt';
import { startChannelLink } from './link';
import {
  bufferChannelMessage,
  drainChannelBuffer,
  toRunUserMessages
} from './debounce';
import { markdownToTelegramHtml } from '../../utils';

import type { ParsedSlashCommand } from './slashPrompt';

import type { ChannelAttachment, RunUserMessage } from './runner';
import type {
  BufferedChannelMessage,
  ChannelBufferEnvelope
} from '@ganju/utils';
import type { AppEnv, Bindings } from '../../types';

interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  user?: { id: number };
  url?: string;
}

interface TelegramIncomingMessage {
  message_id: number;
  from: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  };
  chat: { id: number; type: string; title?: string };
  text?: string;
  date: number;
  entities?: TelegramMessageEntity[];
  reply_to_message?: { from?: { id: number; is_bot?: boolean } };
}

interface TelegramUpdate {
  message?: TelegramIncomingMessage;
}

export interface TelegramBotInfo {
  id: number;
  isBot: boolean;
  firstName: string;
  username?: string;
  canJoinGroups?: boolean;
  canReadAllGroupMessages?: boolean;
  supportsInlineQueries?: boolean;
}

export const handleTelegramWebhook = async (c: Context<AppEnv>) => {
  const channelId = c.req.param('channelId');
  if (!channelId) throw new Error('Missing channelId');

  const dbInstance = db.create(c);
  const [channelRow] = await dbInstance
    .select()
    .from(db.schema.channel)
    .where(eq(db.schema.channel.id, channelId))
    .limit(1);

  if (!channelRow) return c.json({ ok: false }, 404);
  if (channelRow.platform !== utils.constants.CHANNEL_PLATFORM_TELEGRAM) {
    return c.json({ ok: false, error: 'Wrong platform' }, 400);
  }
  if (channelRow.status !== utils.constants.STATUS_ACTIVE) {
    return c.json({ ok: true, skipped: 'disabled' });
  }

  const providedSecret = c.req.header(utils.constants.TELEGRAM_SECRET_HEADER);
  if (!providedSecret) {
    return c.json({ ok: false, error: 'Invalid signature' }, 401);
  }
  const providedHash = await utils.sha256Hex(providedSecret);
  if (!utils.timingSafeEqual(providedHash, channelRow.webhookSecret)) {
    return c.json({ ok: false, error: 'Invalid signature' }, 401);
  }

  const update: TelegramUpdate = await c.req.json();
  const message = update.message;
  if (!message?.text || !message.chat) {
    return c.json({ ok: true });
  }

  const encryptionKey = utils.getCredentialEncryptionKey(c);
  const credentials = JSON.parse(
    utils.decryptString(channelRow.credentials, encryptionKey)
  ) as { botToken: string };

  const botMeta =
    (channelRow.metadata as { telegram?: { bot?: TelegramBotInfo } } | null)
      ?.telegram?.bot || null;

  if (
    message.chat.type !== utils.constants.CHANNEL_CONVERSATION_SCOPE_PRIVATE &&
    !messageAddressesBot(message, botMeta)
  ) {
    return c.json({ ok: true });
  }

  const displayName = [message.from.first_name, message.from.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  const participantLabel =
    displayName ||
    (message.from.username ? `@${message.from.username}` : null) ||
    `user-${message.from.id}`;
  const conversationTitle =
    message.chat.title ||
    (message.chat.type === utils.constants.CHANNEL_CONVERSATION_SCOPE_PRIVATE
      ? `DM · ${participantLabel}`
      : `${message.chat.type} · ${message.chat.id}`);

  const cleanText = stripBotMention(message.text, botMeta?.username);

  const slashCommand = parseSlashCommand(message, botMeta?.username);

  if (slashCommand?.name === utils.constants.BOT_COMMAND_LINK) {
    // The link code must never be posted in a group — anyone who reads it
    // could redeem it and bind that Telegram identity to their own account.
    const isPrivateChat =
      message.chat.type === utils.constants.CHANNEL_CONVERSATION_SCOPE_PRIVATE;
    const replyText = isPrivateChat
      ? await startChannelLink(c, {
          provider: utils.constants.CHANNEL_PLATFORM_TELEGRAM,
          externalId: String(message.from.id),
          channelId: channelRow.id,
          displayName: displayName || message.from.username || ''
        })
      : 'For your security, account linking only works in a private chat — open a direct message with me and send /link there.';
    await sendTelegramMessage(
      credentials.botToken,
      message.chat.id,
      message.message_id,
      replyText
    );
    return c.json({ ok: true });
  }

  const promptMatch = slashCommand
    ? await resolveSlashPrompt(c, channelRow.artifactId, slashCommand)
    : null;

  // Acknowledge straight away — the typing bubble is the only signal the user
  // gets while a burst is still being collected.
  await sendChatAction(credentials.botToken, message.chat.id, 'typing');

  const envelope: ChannelBufferEnvelope = {
    channelId: channelRow.id,
    platform: utils.constants.CHANNEL_PLATFORM_TELEGRAM,
    externalConversationId: String(message.chat.id),
    conversationTitle,
    conversationScope: message.chat.type,
    externalParticipantId: String(message.from.id),
    participantDisplayName: displayName || message.from.username || null,
    participantMetadata: {
      username: message.from.username,
      languageCode: message.from.language_code
    },
    // Reply under the newest message of the burst — the envelope is overwritten
    // on every push, so this is always the latest one.
    delivery: {
      chatId: message.chat.id,
      replyToMessageId: message.message_id
    }
  };

  const buffered: BufferedChannelMessage = {
    text: cleanText,
    externalMessageId: String(message.message_id),
    receivedAt: Date.now()
  };

  // A command is an explicit "answer me now", so it skips the buffer — but it
  // takes any messages typed just before it along for the ride, so nothing the
  // user said is answered separately a moment later.
  if (!promptMatch) {
    const held = await bufferChannelMessage(
      c,
      channelRow.config,
      envelope,
      buffered
    );
    if (held) return c.json({ ok: true });
  }

  const pending = promptMatch ? await drainChannelBuffer(c, envelope) : [];

  await runTelegramTurnAndReply(
    c,
    channelRow,
    credentials.botToken,
    envelope,
    [...toRunUserMessages(pending), buffered],
    promptMatch
  );

  return c.json({ ok: true });
};

// Called by the MessageBufferDO (through the internal ingest route) once a
// participant's burst has settled. Everything platform-specific was captured on
// the envelope at push time, so this only has to reload the bot token.
export const handleTelegramDebouncedBatch = async (
  c: Context<AppEnv>,
  channelRow: { id: string; artifactId: string; credentials: string },
  envelope: ChannelBufferEnvelope,
  messages: BufferedChannelMessage[]
): Promise<void> => {
  const encryptionKey = utils.getCredentialEncryptionKey(c);
  const credentials = JSON.parse(
    utils.decryptString(channelRow.credentials, encryptionKey)
  ) as { botToken: string };

  const { chatId } = readTelegramDelivery(envelope);
  await sendChatAction(credentials.botToken, chatId, 'typing');

  await runTelegramTurnAndReply(
    c,
    channelRow,
    credentials.botToken,
    envelope,
    toRunUserMessages(messages),
    null
  );
};

const readTelegramDelivery = (
  envelope: ChannelBufferEnvelope
): { chatId: number; replyToMessageId: number } => {
  const delivery = envelope.delivery as {
    chatId?: unknown;
    replyToMessageId?: unknown;
  };
  return {
    chatId: Number(delivery.chatId),
    replyToMessageId: Number(delivery.replyToMessageId)
  };
};

type TelegramPromptMatch = Awaited<ReturnType<typeof resolveSlashPrompt>>;

// Run one turn for this conversation and post the reply. Shared by the inline
// path (commands, buffering disabled) and the debounced flush, so both deliver
// identically.
const runTelegramTurnAndReply = async (
  c: Context<AppEnv>,
  channelRow: { id: string },
  botToken: string,
  envelope: ChannelBufferEnvelope,
  userMessages: RunUserMessage[],
  promptMatch: TelegramPromptMatch
): Promise<void> => {
  const { chatId, replyToMessageId } = readTelegramDelivery(envelope);

  let replyText: string;
  let attachments: ChannelAttachment[] = [];
  let sourceButtons: SourceButton[] = [];
  try {
    const result = await runChannelTurn(c, {
      channelId: envelope.channelId,
      externalConversationId: envelope.externalConversationId,
      conversationTitle: envelope.conversationTitle,
      conversationScope: envelope.conversationScope,
      externalParticipantId: envelope.externalParticipantId,
      participantDisplayName: envelope.participantDisplayName,
      participantMetadata: envelope.participantMetadata || undefined,
      userMessages,
      promptId: promptMatch?.promptId || null,
      promptArtifactId: promptMatch?.artifactPromptId ?? null,
      promptTitle: promptMatch?.promptTitle ?? null,
      promptArgs: promptMatch?.args || undefined,
      notifier: createTelegramNotifier(botToken, chatId, replyToMessageId)
    });
    replyText = result.assistantText;
    attachments = result.attachments;
    sourceButtons = result.sourceButtons;
  } catch (error: any) {
    const { refId } = await dbUtils.handleError(c, error, {
      service: utils.constants.SERVICE_NAME_API,
      metadata: {
        source: 'channel-runner',
        platform: utils.constants.CHANNEL_PLATFORM_TELEGRAM,
        channelId: channelRow.id,
        chatId,
        chatType: envelope.conversationScope,
        messageId: replyToMessageId
      }
    });
    replyText = `Sorry, something went wrong while processing your message (ref: ${refId}). The team has been notified.`;
  }

  const chunks = chunkMessage(replyText);
  const replyMarkup =
    sourceButtons.length > 0
      ? {
          inline_keyboard: sourceButtons.map(button => [
            { text: button.text, url: button.url }
          ])
        }
      : undefined;

  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    await sendTelegramMessage(
      botToken,
      chatId,
      replyToMessageId,
      chunks[i],
      isLast ? replyMarkup : undefined
    );
  }

  for (const attachment of attachments) {
    await sendTelegramAttachment(
      botToken,
      chatId,
      replyToMessageId,
      attachment,
      c.env
    ).catch(err =>
      dbUtils.handleError(c, err, {
        service: utils.constants.SERVICE_NAME_API,
        metadata: {
          source: 'sendTelegramAttachment',
          channelId: channelRow.id,
          chatId,
          messageId: replyToMessageId,
          resourceId:
            attachment.kind === 'artifact'
              ? attachment.resource.id
              : attachment.uri
        }
      })
    );
  }
};

interface TelegramReplyMarkup {
  inline_keyboard: Array<Array<{ text: string; url: string }>>;
}

const sendTelegramMessage = async (
  botToken: string,
  chatId: number,
  replyToMessageId: number,
  markdown: string,
  replyMarkup?: TelegramReplyMarkup
) => {
  const html = markdownToTelegramHtml(markdown);
  const send = async (body: Record<string, unknown>) =>
    fetch(`${utils.constants.TELEGRAM_API_BASE}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

  const response = await send({
    chat_id: chatId,
    text: html,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_to_message_id: replyToMessageId,
    ...(replyMarkup && { reply_markup: replyMarkup })
  });

  if (!response.ok) {
    await send({
      chat_id: chatId,
      text: markdown,
      reply_to_message_id: replyToMessageId,
      ...(replyMarkup && { reply_markup: replyMarkup })
    });
  }
};

const sendTelegramAttachment = async (
  botToken: string,
  chatId: number,
  replyToMessageId: number,
  attachment: ChannelAttachment,
  env: Bindings
) => {
  const caption = attachment.caption;
  const metadata: TelegramSendRequest = {
    botToken,
    chatId,
    replyToMessageId,
    caption: caption
      ? markdownToTelegramHtml(caption).slice(0, 1024)
      : undefined,
    parseMode: caption ? 'HTML' : undefined
  };

  const handler = getResourceHandler(env);

  if (attachment.kind === 'remote-resource') {
    // A proxied (remote) resource: hand the container only the connection
    // details + resolved auth header. It reads, decodes, and sends the file
    // itself, so the bytes never transit this worker (no 128 MiB ceiling).
    const payload: TelegramSendRemoteResourceRequest = {
      telegram: metadata,
      remote: { ...attachment.remote, uri: attachment.uri }
    };
    const response = await handler.fetch(
      'http://resource-handler/telegram/send-remote-resource',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Telegram remote-resource send via container failed: ${response.status} ${body}`
      );
    }
    return;
  }

  // An artifact resource: the worker holds the bytes (R2 object or row content)
  // and posts them as multipart. These are owner-uploaded and already bounded.
  const { resource } = attachment;
  const mime =
    resource.mimeType || utils.constants.MIMETYPE_APPLICATION_OCTET_STREAM;
  let arrayBuffer: ArrayBuffer;
  let filename: string;
  if (resource.fileKey) {
    const object = await env.STORAGE_BUCKET.get(resource.fileKey);
    if (!object) {
      throw new Error(
        `Resource file not found in storage: ${resource.fileKey}`
      );
    }
    arrayBuffer = await object.arrayBuffer();
    filename = resource.fileName || resource.title || 'file';
  } else if (resource.content != null) {
    const bytes = new TextEncoder().encode(resource.content);
    arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    const base = resource.fileName || resource.title || 'file';
    filename = /\.[a-z0-9]+$/i.test(base) ? base : `${base}.txt`;
  } else {
    throw new Error(`Resource has no content or fileKey: ${resource.uri}`);
  }

  const form = new FormData();
  form.append('metadata', JSON.stringify(metadata));
  form.append('file', new Blob([arrayBuffer], { type: mime }), filename);

  const response = await handler.fetch(
    'http://resource-handler/telegram/send',
    { method: 'POST', body: form }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Telegram send via container failed: ${response.status} ${body}`
    );
  }
};

const createTelegramNotifier = (
  botToken: string,
  chatId: number,
  replyToMessageId: number
): ChannelNotifier => ({
  toolStarted: async ({ toolName }) => {
    const message = utils.getToolStatusMessage(toolName);
    if (!message) return;
    await fetch(
      `${utils.constants.TELEGRAM_API_BASE}/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `<i>${escapeTelegramHtml(message)}</i>`,
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          reply_to_message_id: replyToMessageId,
          disable_notification: true
        })
      }
    ).catch(() => undefined);
  }
});

const escapeTelegramHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const sendChatAction = async (
  botToken: string,
  chatId: number,
  action: 'typing'
) => {
  await fetch(
    `${utils.constants.TELEGRAM_API_BASE}/bot${botToken}/sendChatAction`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action })
    }
  ).catch(() => undefined);
};

const parseSlashCommand = (
  message: TelegramIncomingMessage,
  botUsername: string | undefined
): ParsedSlashCommand | null => {
  const text = message.text || '';
  const entities = message.entities || [];
  const cmdEntity = entities.find(
    e => e.type === 'bot_command' && e.offset === 0
  );
  if (!cmdEntity) return null;

  const raw = text.slice(cmdEntity.offset, cmdEntity.offset + cmdEntity.length);
  if (!raw.startsWith('/')) return null;

  let name = raw.slice(1);
  const atIndex = name.indexOf('@');
  if (atIndex !== -1) {
    const target = name.slice(atIndex + 1);
    if (botUsername && target.toLowerCase() !== botUsername.toLowerCase()) {
      return null;
    }
    name = name.slice(0, atIndex);
  }

  const trailingText = text.slice(cmdEntity.offset + cmdEntity.length).trim();
  return { name: name.toLowerCase(), trailingText };
};

const messageAddressesBot = (
  message: TelegramIncomingMessage,
  bot: TelegramBotInfo | null
): boolean => {
  if (!bot) return true;

  if (message.reply_to_message?.from?.id === bot.id) return true;

  const text = message.text || '';
  const entities = message.entities || [];

  for (const entity of entities) {
    if (entity.type === 'mention') {
      const mention = text.slice(entity.offset, entity.offset + entity.length);
      if (
        bot.username &&
        mention.toLowerCase() === `@${bot.username.toLowerCase()}`
      ) {
        return true;
      }
    }

    if (entity.type === 'text_mention' && entity.user?.id === bot.id) {
      return true;
    }

    if (entity.type === 'text_link' && entity.url && bot.username) {
      const match = entity.url.toLowerCase().match(/t\.me\/([a-z0-9_]+)/);
      if (match && match[1] === bot.username.toLowerCase()) {
        return true;
      }
    }

    if (entity.type === 'bot_command' && bot.username) {
      const raw = text.slice(entity.offset, entity.offset + entity.length);
      const atIndex = raw.indexOf('@');
      if (
        atIndex !== -1 &&
        raw.slice(atIndex + 1).toLowerCase() === bot.username.toLowerCase()
      ) {
        return true;
      }
    }
  }

  return false;
};

const stripBotMention = (text: string, botUsername?: string): string => {
  if (!botUsername) return text;
  const pattern = new RegExp(`@${botUsername}\\b`, 'gi');
  return text.replace(pattern, '').replace(/\s+/g, ' ').trim();
};

const chunkMessage = (text: string): string[] => {
  if (!text) return ['...'];
  if (text.length <= utils.constants.TELEGRAM_MESSAGE_LIMIT) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > utils.constants.TELEGRAM_MESSAGE_LIMIT) {
    let cut = remaining.lastIndexOf(
      '\n\n',
      utils.constants.TELEGRAM_MESSAGE_LIMIT
    );
    if (cut < utils.constants.TELEGRAM_MESSAGE_LIMIT / 2) {
      cut = remaining.lastIndexOf('\n', utils.constants.TELEGRAM_MESSAGE_LIMIT);
    }
    if (cut < utils.constants.TELEGRAM_MESSAGE_LIMIT / 2) {
      cut = remaining.lastIndexOf(' ', utils.constants.TELEGRAM_MESSAGE_LIMIT);
    }
    if (cut <= 0) cut = utils.constants.TELEGRAM_MESSAGE_LIMIT;

    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }

  if (remaining.length) chunks.push(remaining);
  return chunks;
};

export const registerTelegramWebhook = async (
  botToken: string,
  webhookUrl: string,
  secret: string
) => {
  const response = await fetch(
    `${utils.constants.TELEGRAM_API_BASE}/bot${botToken}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ['message']
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram setWebhook failed: ${error}`);
  }
};

export const getTelegramBotInfo = async (
  botToken: string
): Promise<TelegramBotInfo> => {
  const response = await fetch(
    `${utils.constants.TELEGRAM_API_BASE}/bot${botToken}/getMe`
  );
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram getMe failed: ${error}`);
  }
  const data: {
    result: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username: string;
      can_join_groups: boolean;
      can_read_all_group_messages: boolean;
      supports_inline_queries: boolean;
    };
  } = await response.json();
  const bot = data.result;
  return {
    id: bot.id,
    isBot: bot.is_bot,
    firstName: bot.first_name,
    username: bot.username,
    canJoinGroups: bot.can_join_groups,
    canReadAllGroupMessages: bot.can_read_all_group_messages,
    supportsInlineQueries: bot.supports_inline_queries
  };
};
