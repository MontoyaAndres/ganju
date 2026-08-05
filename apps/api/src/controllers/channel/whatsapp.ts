import { Context } from 'hono';
import { and, eq } from 'drizzle-orm';
import { db, utils as dbUtils } from '@ganju/db';
import { utils } from '@ganju/utils';
import type {
  ChannelNotifier,
  WhatsappSendRequest,
  WhatsappSendRemoteResourceRequest
} from '@ganju/utils';
import { getResourceHandler } from '@ganju/containers';

import { runChannelTurn } from './runner';
import { resolveSlashPrompt } from './slashPrompt';
import {
  bufferChannelMessage,
  drainChannelBuffer,
  toRunUserMessages
} from './debounce';
import { markdownToWhatsapp } from '../../utils';
import { startChannelLink } from './link';

import type { ChannelAttachment, RunUserMessage } from './runner';
import type { ParsedSlashCommand } from './slashPrompt';
import type {
  BufferedChannelMessage,
  ChannelBufferEnvelope
} from '@ganju/utils';
import type { AppEnv, Bindings } from '../../types';

const WHATSAPP_BASE = `${utils.constants.WHATSAPP_API_BASE}/${utils.constants.WHATSAPP_API_VERSION}`;

interface WhatsappCredentials {
  accessToken: string;
  phoneNumberId: string;
  // The token the tenant types into the Meta app dashboard's webhook config; we
  // echo hub.challenge only when the GET handshake presents this value.
  verifyToken: string;
  // The Meta app secret — used to verify the x-hub-signature-256 on every POST.
  appSecret: string;
}

export interface WhatsappBotInfo {
  // The Cloud API phone-number id — what inbound webhooks are addressed to and
  // the key for duplicate-connection detection.
  id: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
}

// Inbound webhook payload (Cloud API). We only care about message events; status
// receipts (sent/delivered/read) arrive under `value.statuses` and are ignored.
interface WhatsappInboundMessage {
  from: string;
  id: string;
  timestamp?: string;
  type: string;
  text?: { body?: string };
}

interface WhatsappWebhookValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: WhatsappInboundMessage[];
  statuses?: unknown[];
}

interface WhatsappWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{ field?: string; value?: WhatsappWebhookValue }>;
  }>;
}

const loadCredentials = (
  c: Context<AppEnv>,
  encrypted: string
): WhatsappCredentials => {
  const encryptionKey = utils.getCredentialEncryptionKey(c);
  return JSON.parse(
    utils.decryptString(encrypted, encryptionKey)
  ) as WhatsappCredentials;
};

// The GET handshake Meta performs when you save the Callback URL in the app
// dashboard: echo hub.challenge verbatim when hub.verify_token matches the
// channel's stored token (and hub.mode is "subscribe"). Works regardless of the
// channel's status so the URL can always be (re)verified.
export const handleWhatsappVerification = async (c: Context<AppEnv>) => {
  const channelId = c.req.param('channelId');
  if (!channelId) return c.json({ ok: false }, 400);

  const dbInstance = db.create(c);
  const [channelRow] = await dbInstance
    .select()
    .from(db.schema.channel)
    .where(eq(db.schema.channel.id, channelId))
    .limit(1);

  if (!channelRow) return c.json({ ok: false }, 404);
  if (channelRow.platform !== utils.constants.CHANNEL_PLATFORM_WHATSAPP) {
    return c.json({ ok: false, error: 'Wrong platform' }, 400);
  }

  const mode = c.req.query(utils.constants.WHATSAPP_HUB_MODE_PARAM);
  const token = c.req.query(utils.constants.WHATSAPP_HUB_VERIFY_TOKEN_PARAM);
  const challenge = c.req.query(utils.constants.WHATSAPP_HUB_CHALLENGE_PARAM);

  const { verifyToken } = loadCredentials(c, channelRow.credentials);
  if (
    mode !== utils.constants.WHATSAPP_HUB_MODE_SUBSCRIBE ||
    !token ||
    !challenge ||
    !utils.timingSafeEqual(token, verifyToken)
  ) {
    return c.json({ ok: false, error: 'Verification failed' }, 403);
  }

  // Meta expects the raw challenge string echoed back as plain text.
  return c.text(challenge);
};

export const handleWhatsappWebhook = async (c: Context<AppEnv>) => {
  const channelId = c.req.param('channelId');
  if (!channelId) throw new Error('Missing channelId');

  const dbInstance = db.create(c);
  const [channelRow] = await dbInstance
    .select()
    .from(db.schema.channel)
    .where(eq(db.schema.channel.id, channelId))
    .limit(1);

  if (!channelRow) return c.json({ ok: false }, 404);
  if (channelRow.platform !== utils.constants.CHANNEL_PLATFORM_WHATSAPP) {
    return c.json({ ok: false, error: 'Wrong platform' }, 400);
  }

  const credentials = loadCredentials(c, channelRow.credentials);

  // Meta signs every webhook with the app secret over the RAW body — read it
  // once as text (we must not consume it again with c.req.json()).
  const rawBody = await c.req.text();
  const signature = c.req.header(utils.constants.WHATSAPP_SIGNATURE_HEADER);
  const signatureValid = await verifyWhatsappSignature(
    credentials.appSecret,
    signature,
    rawBody
  );
  if (!signatureValid) {
    return c.json({ ok: false, error: 'Invalid signature' }, 401);
  }

  if (channelRow.status !== utils.constants.STATUS_ACTIVE) {
    return c.json({ ok: true, skipped: 'disabled' });
  }

  let payload: WhatsappWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsappWebhookPayload;
  } catch {
    return c.json({ ok: true });
  }

  const value = payload.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  // Only react to inbound text messages — ignore status receipts and the
  // media/interactive types we don't render (mirrors Telegram's text-only rule).
  if (!message || message.type !== 'text' || !message.text?.body) {
    return c.json({ ok: true });
  }

  // Meta resends a webhook when we don't 200 in time, and the resend repeats a
  // message we may already be handling. Unlike Slack there's no retry header, so
  // we dedupe on the message id (wamid): if we've already recorded it for this
  // channel, drop it. (Meta spaces retries out by minutes, by which point the
  // runner's user-message insert exists, so this catches the common case.) A
  // resend that arrives while the message is still buffered hasn't been written
  // yet — the buffer dedupes that one on the same wamid when it's pushed.
  if (await isMessageAlreadyHandled(dbInstance, channelRow.id, message.id)) {
    return c.json({ ok: true });
  }

  const contact = value?.contacts?.[0];
  const displayName = contact?.profile?.name || `user-${message.from}`;

  // Run the turn after acking so Meta doesn't time out and resend (which would
  // duplicate the work). Mirrors the Slack path.
  c.executionCtx.waitUntil(
    processWhatsappMessage(c, channelRow, credentials, {
      from: message.from,
      messageId: message.id,
      text: message.text.body,
      displayName
    }).catch(err =>
      dbUtils.handleError(c, err, {
        service: utils.constants.SERVICE_NAME_API,
        metadata: {
          source: 'channel-runner',
          platform: utils.constants.CHANNEL_PLATFORM_WHATSAPP,
          channelId: channelRow.id,
          from: message.from,
          messageId: message.id
        }
      })
    )
  );

  return c.json({ ok: true });
};

// Has this wamid already been recorded for the channel? Scoped through the
// conversation so the lookup rides the conversationId index. Used to drop Meta's
// webhook resends (it has no x-slack-retry-num equivalent).
const isMessageAlreadyHandled = async (
  dbInstance: ReturnType<typeof db.create>,
  channelId: string,
  externalMessageId: string
): Promise<boolean> => {
  const [existing] = await dbInstance
    .select({ id: db.schema.channelMessage.id })
    .from(db.schema.channelMessage)
    .innerJoin(
      db.schema.channelConversation,
      eq(
        db.schema.channelMessage.conversationId,
        db.schema.channelConversation.id
      )
    )
    .where(
      and(
        eq(db.schema.channelConversation.channelId, channelId),
        eq(db.schema.channelMessage.externalMessageId, externalMessageId)
      )
    )
    .limit(1);
  return !!existing;
};

interface IncomingWhatsappMessage {
  from: string;
  messageId: string;
  text: string;
  displayName: string;
}

const processWhatsappMessage = async (
  c: Context<AppEnv>,
  channelRow: { id: string; artifactId: string; config: unknown },
  credentials: WhatsappCredentials,
  message: IncomingWhatsappMessage
): Promise<void> => {
  // Show the user we received it (best-effort read receipt + typing bubble).
  await markReadWithTyping(credentials, message.messageId);

  const cleanText = message.text.trim();
  const slashCommand = parseSlashCommandText(cleanText);

  if (slashCommand?.name === utils.constants.BOT_COMMAND_LINK) {
    // WhatsApp Cloud API conversations are always 1:1, so a link code is never
    // exposed to anyone but the requester — no group restriction needed.
    const replyText = await startChannelLink(c, {
      provider: utils.constants.CHANNEL_PLATFORM_WHATSAPP,
      externalId: message.from,
      channelId: channelRow.id,
      displayName: message.displayName
    });
    await sendWhatsappMessage(
      c,
      channelRow.id,
      credentials,
      message.from,
      message.messageId,
      replyText
    );
    return;
  }

  if (!cleanText && !slashCommand) return;

  const promptMatch = slashCommand
    ? await resolveSlashPrompt(c, channelRow.artifactId, slashCommand)
    : null;

  const envelope: ChannelBufferEnvelope = {
    channelId: channelRow.id,
    platform: utils.constants.CHANNEL_PLATFORM_WHATSAPP,
    // Every WhatsApp conversation is a 1:1 keyed by the user's wa_id.
    externalConversationId: message.from,
    conversationTitle: `DM · ${message.displayName}`,
    conversationScope: utils.constants.CHANNEL_CONVERSATION_SCOPE_PRIVATE,
    externalParticipantId: message.from,
    participantDisplayName: message.displayName,
    participantMetadata: null,
    // Quote the burst's newest message on the reply.
    delivery: { to: message.from, replyToMessageId: message.messageId }
  };

  const buffered: BufferedChannelMessage = {
    text: cleanText,
    externalMessageId: message.messageId,
    receivedAt: Date.now()
  };

  // A command is answered immediately and takes any pending text with it;
  // plain text waits for the burst to settle.
  if (!promptMatch) {
    const held = await bufferChannelMessage(
      c,
      channelRow.config,
      envelope,
      buffered
    );
    if (held) return;
  }

  const pending = promptMatch ? await drainChannelBuffer(c, envelope) : [];

  await runWhatsappTurnAndReply(
    c,
    channelRow,
    credentials,
    envelope,
    [...toRunUserMessages(pending), buffered],
    promptMatch
  );
};

// Called by the MessageBufferDO (through the internal ingest route) once a
// participant's burst has settled.
export const handleWhatsappDebouncedBatch = async (
  c: Context<AppEnv>,
  channelRow: { id: string; artifactId: string; credentials: string },
  envelope: ChannelBufferEnvelope,
  messages: BufferedChannelMessage[]
): Promise<void> => {
  const credentials = loadCredentials(c, channelRow.credentials);
  await runWhatsappTurnAndReply(
    c,
    channelRow,
    credentials,
    envelope,
    toRunUserMessages(messages),
    null
  );
};

const readWhatsappDelivery = (
  envelope: ChannelBufferEnvelope
): { to: string; replyToMessageId: string | null } => {
  const delivery = envelope.delivery as {
    to?: unknown;
    replyToMessageId?: unknown;
  };
  return {
    to:
      typeof delivery.to === 'string'
        ? delivery.to
        : envelope.externalConversationId,
    replyToMessageId:
      typeof delivery.replyToMessageId === 'string'
        ? delivery.replyToMessageId
        : null
  };
};

type WhatsappPromptMatch = Awaited<ReturnType<typeof resolveSlashPrompt>>;

// Run one turn and post the reply. Shared by the inline path (commands,
// buffering disabled) and the debounced flush.
const runWhatsappTurnAndReply = async (
  c: Context<AppEnv>,
  channelRow: { id: string },
  credentials: WhatsappCredentials,
  envelope: ChannelBufferEnvelope,
  userMessages: RunUserMessage[],
  promptMatch: WhatsappPromptMatch
): Promise<void> => {
  const { to, replyToMessageId } = readWhatsappDelivery(envelope);

  let replyText: string;
  let attachments: ChannelAttachment[] = [];
  let sourcesFooter: string | null = null;
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
      notifier: createWhatsappNotifier(credentials, to)
    });
    replyText = result.assistantText;
    attachments = result.attachments;
    sourcesFooter = result.sourcesFooter;
  } catch (error: any) {
    const { refId } = await dbUtils.handleError(c, error, {
      service: utils.constants.SERVICE_NAME_API,
      metadata: {
        source: 'channel-runner',
        platform: utils.constants.CHANNEL_PLATFORM_WHATSAPP,
        channelId: channelRow.id,
        from: to,
        messageId: replyToMessageId
      }
    });
    replyText = `Sorry, something went wrong while processing your message (ref: ${refId}). The team has been notified.`;
  }

  await sendWhatsappMessage(
    c,
    channelRow.id,
    credentials,
    to,
    replyToMessageId,
    replyText,
    sourcesFooter
  );

  for (const attachment of attachments) {
    await sendWhatsappAttachment(
      credentials,
      to,
      replyToMessageId,
      attachment,
      c.env
    ).catch(err =>
      dbUtils.handleError(c, err, {
        service: utils.constants.SERVICE_NAME_API,
        metadata: {
          source: 'sendWhatsappAttachment',
          channelId: channelRow.id,
          from: to,
          resourceId:
            attachment.kind === 'artifact'
              ? attachment.resource.id
              : attachment.uri
        }
      })
    );
  }
};

const postWhatsapp = async (
  credentials: WhatsappCredentials,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; body: unknown }> => {
  const response = await fetch(
    `${WHATSAPP_BASE}/${credentials.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  ).catch(() => null);
  if (!response) {
    return { ok: false, status: 0, body: { error: 'network error' } };
  }
  const respBody = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body: respBody };
};

// Send one (or more, when chunked) text messages. The first chunk quotes the
// user's message (context.message_id) so the reply threads onto it, mirroring
// Telegram's reply_to. Sources are appended to the final chunk as a text footer
// (WhatsApp can't render a row of URL buttons), mirroring Slack.
const sendWhatsappMessage = async (
  c: Context<AppEnv>,
  channelId: string,
  credentials: WhatsappCredentials,
  to: string,
  replyToMessageId: string | null,
  markdown: string,
  sourcesFooter?: string | null
) => {
  let body = markdownToWhatsapp(markdown);
  if (sourcesFooter) {
    body = `${body}\n\n${markdownToWhatsapp(sourcesFooter)}`;
  }
  const chunks = chunkMessage(body);

  for (let i = 0; i < chunks.length; i++) {
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: chunks[i], preview_url: false }
    };
    // Quote the user's message on the first chunk only.
    if (i === 0 && replyToMessageId) {
      payload.context = { message_id: replyToMessageId };
    }
    const result = await postWhatsapp(credentials, payload);
    // The Cloud API rejects a send for reasons the user must act on (recipient
    // not in the test allow-list = 131030, expired/again token = 190, number not
    // registered, …). The turn already persisted, so a silent failure looks like
    // "saved but nothing arrived" — surface Meta's error so it's diagnosable.
    if (!result.ok) {
      await dbUtils.handleError(
        c,
        new Error(
          `WhatsApp send failed: ${result.status} ${JSON.stringify(result.body)}`
        ),
        {
          service: utils.constants.SERVICE_NAME_API,
          metadata: {
            source: 'sendWhatsappMessage',
            platform: utils.constants.CHANNEL_PLATFORM_WHATSAPP,
            channelId,
            to
          }
        }
      );
    }
  }
};

const sendWhatsappAttachment = async (
  credentials: WhatsappCredentials,
  to: string,
  replyToMessageId: string | null,
  attachment: ChannelAttachment,
  env: Bindings
) => {
  const caption = attachment.caption;
  const metadata: WhatsappSendRequest = {
    accessToken: credentials.accessToken,
    phoneNumberId: credentials.phoneNumberId,
    to,
    replyToMessageId: replyToMessageId || undefined,
    caption: caption ? markdownToWhatsapp(caption).slice(0, 1024) : undefined
  };

  const handler = getResourceHandler(env);

  if (attachment.kind === 'remote-resource') {
    // A proxied (remote) resource: hand the container only the connection
    // details + resolved auth header. It reads, decodes, uploads to the Cloud
    // API's /media endpoint, and sends the file itself, so the bytes never
    // transit this worker (no 128 MiB ceiling).
    const payload: WhatsappSendRemoteResourceRequest = {
      whatsapp: metadata,
      remote: { ...attachment.remote, uri: attachment.uri }
    };
    const response = await handler.fetch(
      'http://resource-handler/whatsapp/send-remote-resource',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `WhatsApp remote-resource send via container failed: ${response.status} ${text}`
      );
    }
    return;
  }

  // An artifact resource: the worker holds the bytes (R2 object or row content)
  // and posts them as multipart to the container's media upload + send flow.
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
    const baseName = resource.fileName || resource.title || 'file';
    filename = /\.[a-z0-9]+$/i.test(baseName) ? baseName : `${baseName}.txt`;
  } else {
    throw new Error(`Resource has no content or fileKey: ${resource.uri}`);
  }

  const form = new FormData();
  form.append('metadata', JSON.stringify(metadata));
  form.append('file', new Blob([arrayBuffer], { type: mime }), filename);

  const response = await handler.fetch(
    'http://resource-handler/whatsapp/send',
    { method: 'POST', body: form }
  );
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `WhatsApp send via container failed: ${response.status} ${text}`
    );
  }
};

const createWhatsappNotifier = (
  credentials: WhatsappCredentials,
  to: string
): ChannelNotifier => ({
  toolStarted: async ({ toolName }) => {
    const message = utils.getToolStatusMessage(toolName);
    if (!message) return;
    await postWhatsapp(credentials, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: `_${message}_`, preview_url: false }
    }).catch(() => undefined);
  }
});

// Mark the inbound message read and show a typing bubble while we work — the
// WhatsApp analog of Telegram's "typing" chat action. Best-effort.
const markReadWithTyping = async (
  credentials: WhatsappCredentials,
  messageId: string
): Promise<void> => {
  await postWhatsapp(credentials, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
    typing_indicator: { type: 'text' }
  }).catch(() => undefined);
};

// Parse a leading `/word args` out of plain message text. WhatsApp has no native
// slash-command surface, so — like the Slack/Discord text fallback — a user
// simply types `/link` (or a prompt name) into a normal message.
const parseSlashCommandText = (text: string): ParsedSlashCommand | null => {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const match = trimmed.match(/^\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  return {
    name: match[1].toLowerCase(),
    trailingText: (match[2] || '').trim()
  };
};

const chunkMessage = (text: string): string[] => {
  if (!text) return ['...'];
  const limit = utils.constants.WHATSAPP_MESSAGE_LIMIT;
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf('\n\n', limit);
    if (cut < limit / 2) cut = remaining.lastIndexOf('\n', limit);
    if (cut < limit / 2) cut = remaining.lastIndexOf(' ', limit);
    if (cut <= 0) cut = limit;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
};

const verifyWhatsappSignature = async (
  appSecret: string,
  signature: string | undefined,
  rawBody: string
): Promise<boolean> => {
  if (
    !signature ||
    !signature.startsWith(utils.constants.WHATSAPP_SIGNATURE_PREFIX)
  ) {
    return false;
  }
  const expected = `${utils.constants.WHATSAPP_SIGNATURE_PREFIX}${await utils.hmacSha256Hex(
    appSecret,
    rawBody
  )}`;
  return utils.timingSafeEqual(expected, signature);
};

// `GET /<phoneNumberId>` — confirms the access token can act for the number and
// returns its identity, used at channel-create time for the bot card + duplicate
// connection detection.
export const getWhatsappBotInfo = async (
  accessToken: string,
  phoneNumberId: string
): Promise<WhatsappBotInfo> => {
  const response = await fetch(
    `${WHATSAPP_BASE}/${phoneNumberId}?fields=display_phone_number,verified_name,id`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = (await response.json().catch(() => ({}))) as {
    id?: string;
    display_phone_number?: string;
    verified_name?: string;
    error?: { message?: string };
  };
  if (!response.ok || !data.id) {
    throw new Error(
      `WhatsApp phone-number lookup failed: ${data.error?.message || 'unknown'}`
    );
  }
  return {
    id: data.id,
    phoneNumberId: data.id,
    displayPhoneNumber: data.display_phone_number,
    verifiedName: data.verified_name
  };
};
