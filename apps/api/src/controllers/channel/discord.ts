import { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { db, utils as dbUtils } from '@ganju/db';
import { utils } from '@ganju/utils';
import type {
  ChannelNotifier,
  SourceButton,
  DiscordSendRequest,
  DiscordSendRemoteResourceRequest
} from '@ganju/utils';
import { getResourceHandler } from '@ganju/containers';

import { runChannelTurn } from './runner';
import { resolveSlashPrompt } from './slashPrompt';
import {
  bufferChannelMessage,
  drainChannelBuffer,
  toRunUserMessages
} from './debounce';
import { markdownToDiscord } from '../../utils';
import { startChannelLink } from './link';

import type { ChannelAttachment, RunUserMessage } from './runner';
import type { ParsedSlashCommand } from './slashPrompt';
import type {
  BufferedChannelMessage,
  ChannelBufferEnvelope
} from '@ganju/utils';
import type { AppEnv, Bindings } from '../../types';

const DISCORD_BASE = utils.constants.DISCORD_API_BASE;

export interface DiscordBotInfo {
  // The bot's user id — what `<@…>` mentions resolve to (mention stripping +
  // self-message detection) and the key for duplicate-connection detection.
  id: string;
  username?: string;
  globalName?: string | null;
  discriminator?: string;
  applicationId?: string;
}

interface DiscordCredentials {
  botToken: string;
  applicationId: string;
  publicKey: string;
}

const loadCredentials = (
  c: Context<AppEnv>,
  encrypted: string
): DiscordCredentials => {
  const encryptionKey = utils.getCredentialEncryptionKey(c);
  return JSON.parse(
    utils.decryptString(encrypted, encryptionKey)
  ) as DiscordCredentials;
};

// Guild messages map to the channel scope; DMs / group DMs are private.
const scopeForDiscord = (isDm: boolean): string =>
  isDm
    ? utils.constants.CHANNEL_CONVERSATION_SCOPE_PRIVATE
    : utils.constants.CHANNEL_CONVERSATION_SCOPE_CHANNEL;

// Strip a leading/embedded `<@ID>` or `<@!ID>` bot mention (Discord's wire form).
const stripBotMention = (text: string, botUserId?: string | null): string => {
  if (!botUserId) return text.trim();
  const pattern = new RegExp(`<@!?${botUserId}>`, 'g');
  return text.replace(pattern, '').replace(/\s+/g, ' ').trim();
};

// Parse a leading `/word args` out of plain message text (the Gateway path).
// Native slash commands arrive as interactions instead; this mirrors Slack's
// text fallback for a user who simply types `/link` (or a prompt name).
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
  const limit = utils.constants.DISCORD_MESSAGE_LIMIT;
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

// Source links become a single action row of link buttons (≤5), mirroring
// Telegram's inline keyboard.
const buttonComponents = (buttons: SourceButton[]) => {
  if (buttons.length === 0) return undefined;
  return [
    {
      type: 1,
      components: buttons
        .slice(0, utils.constants.DISCORD_MAX_SOURCE_BUTTONS)
        .map(b => ({
          type: 2,
          style: 5,
          label: b.text.slice(0, 80),
          url: b.url
        }))
    }
  ];
};

const sendDiscordMessage = async (
  botToken: string,
  channelId: string,
  replyToMessageId: string | null,
  markdown: string,
  sourceButtons?: SourceButton[]
): Promise<void> => {
  const content = markdownToDiscord(markdown);
  const chunks = chunkMessage(content);
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const body: Record<string, unknown> = {
      content: chunks[i],
      // Never ping @everyone/roles/users from the bot's replies.
      allowed_mentions: { parse: [] }
    };
    // Reply-reference only the first chunk to the user's message.
    if (i === 0 && replyToMessageId) {
      body.message_reference = {
        message_id: replyToMessageId,
        fail_if_not_exists: false
      };
    }
    if (isLast && sourceButtons && sourceButtons.length > 0) {
      const components = buttonComponents(sourceButtons);
      if (components) body.components = components;
    }
    await fetch(`${DISCORD_BASE}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }).catch(() => undefined);
  }
};

const sendDiscordTyping = async (
  botToken: string,
  channelId: string
): Promise<void> => {
  await fetch(`${DISCORD_BASE}/channels/${channelId}/typing`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}` }
  }).catch(() => undefined);
};

const createDiscordNotifier = (
  botToken: string,
  channelId: string
): ChannelNotifier => ({
  toolStarted: async ({ toolName }) => {
    const message = utils.getToolStatusMessage(toolName);
    if (!message) return;
    await fetch(`${DISCORD_BASE}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: `*${message}*`,
        allowed_mentions: { parse: [] }
      })
    }).catch(() => undefined);
  }
});

const sendDiscordAttachment = async (
  botToken: string,
  channelId: string,
  replyToMessageId: string | null,
  attachment: ChannelAttachment,
  env: Bindings
): Promise<void> => {
  const handler = getResourceHandler(env);
  const metadata: DiscordSendRequest = {
    botToken,
    channelId,
    replyToMessageId: replyToMessageId || undefined,
    content: attachment.caption
      ? markdownToDiscord(attachment.caption).slice(
          0,
          utils.constants.DISCORD_MESSAGE_LIMIT
        )
      : undefined
  };

  if (attachment.kind === 'remote-resource') {
    // A proxied (remote) resource: hand the container only the connection
    // details + resolved auth header. It reads, decodes, and uploads the file
    // itself, so the bytes never transit this worker (no 128 MiB ceiling).
    const payload: DiscordSendRemoteResourceRequest = {
      discord: metadata,
      remote: { ...attachment.remote, uri: attachment.uri }
    };
    const response = await handler.fetch(
      'http://resource-handler/discord/send-remote-resource',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Discord remote-resource send via container failed: ${response.status} ${text}`
      );
    }
    return;
  }

  // An artifact resource: the worker holds the bytes (R2 object or row content)
  // and posts them as multipart to the container's Discord upload flow.
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

  const response = await handler.fetch('http://resource-handler/discord/send', {
    method: 'POST',
    body: form
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Discord send via container failed: ${response.status} ${text}`
    );
  }
};

interface DiscordRunOptions {
  channelId: string;
  externalConversationId: string;
  conversationTitle?: string | null;
  conversationScope: string;
  externalParticipantId: string;
  participantDisplayName?: string | null;
  participantMetadata?: Record<string, unknown>;
  userMessages: RunUserMessage[];
  promptId?: string | null;
  promptArtifactId?: string | null;
  promptTitle?: string | null;
  promptArgs?: Record<string, string>;
}

interface DiscordTurnResult {
  replyText: string;
  attachments: ChannelAttachment[];
  sourceButtons: SourceButton[];
}

// Run a channel turn and capture the reply pieces (text/attachments/buttons),
// converting any failure into a user-facing ref message — the two callers (the
// Gateway ingest path and the interaction path) deliver them differently.
const runDiscordTurn = async (
  c: Context<AppEnv>,
  channelRow: { id: string },
  botToken: string,
  options: DiscordRunOptions
): Promise<DiscordTurnResult> => {
  try {
    const result = await runChannelTurn(c, {
      ...options,
      notifier: createDiscordNotifier(botToken, options.externalConversationId)
    });
    return {
      replyText: result.assistantText,
      attachments: result.attachments,
      sourceButtons: result.sourceButtons
    };
  } catch (error: any) {
    const { refId } = await dbUtils.handleError(c, error, {
      service: utils.constants.SERVICE_NAME_API,
      metadata: {
        source: 'channel-runner',
        platform: utils.constants.CHANNEL_PLATFORM_DISCORD,
        channelId: channelRow.id,
        channel: options.externalConversationId
      }
    });
    return {
      replyText: `Sorry, something went wrong while processing your message (ref: ${refId}). The team has been notified.`,
      attachments: [],
      sourceButtons: []
    };
  }
};

// Gateway ingest (free-form messages / @mentions / DMs)
interface IngestBody {
  message?: {
    id: string;
    channelId: string;
    guildId: string | null;
    isDm: boolean;
    content: string;
    botUserId: string | null;
    author: {
      id: string;
      displayName?: string | null;
      username?: string | null;
    };
  };
}

// Called by the DiscordGatewayDO (via the SELF service binding) with a
// normalized message it received over the Gateway. Guarded by the internal
// secret — never exposed to Discord or the public.
export const handleDiscordIngest = async (c: Context<AppEnv>) => {
  const provided = c.req.header(utils.constants.MCP_INTERNAL_HEADER);
  const expected = utils.getEnv(c, 'MCP_INTERNAL_SECRET');
  if (!expected || provided !== expected) {
    return c.json({ ok: false, error: 'unauthorized' }, 401);
  }

  const channelId = c.req.param('channelId');
  if (!channelId) return c.json({ ok: false }, 400);

  const dbInstance = db.create(c);
  const [channelRow] = await dbInstance
    .select()
    .from(db.schema.channel)
    .where(eq(db.schema.channel.id, channelId))
    .limit(1);
  if (!channelRow) return c.json({ ok: false }, 404);
  if (channelRow.platform !== utils.constants.CHANNEL_PLATFORM_DISCORD) {
    return c.json({ ok: false, error: 'Wrong platform' }, 400);
  }
  if (channelRow.status !== utils.constants.STATUS_ACTIVE) {
    return c.json({ ok: true, skipped: 'disabled' });
  }

  const body = (await c.req.json().catch(() => ({}))) as IngestBody;
  const message = body.message;
  if (!message?.channelId || !message.author?.id) {
    return c.json({ ok: true });
  }

  const credentials = loadCredentials(c, channelRow.credentials);
  const scope = scopeForDiscord(message.isDm);
  const displayName = message.author.displayName || `user-${message.author.id}`;
  const conversationTitle = message.isDm
    ? `DM · ${displayName}`
    : `${scope} · ${message.channelId}`;

  const cleanText = stripBotMention(message.content || '', message.botUserId);
  const slashCommand = parseSlashCommandText(cleanText);

  if (slashCommand?.name === utils.constants.BOT_COMMAND_LINK) {
    // A link code must never be posted where others can read it — DMs only.
    const replyText = message.isDm
      ? await startChannelLink(c, {
          provider: utils.constants.CHANNEL_PLATFORM_DISCORD,
          externalId: message.author.id,
          channelId: channelRow.id,
          displayName
        })
      : 'For your security, account linking only works in a direct message — DM me and send /link there.';
    await sendDiscordMessage(
      credentials.botToken,
      message.channelId,
      message.id,
      replyText
    );
    return c.json({ ok: true });
  }

  // A bare @mention with no text and no command — nothing to act on.
  if (!cleanText && !slashCommand) return c.json({ ok: true });

  const promptMatch = slashCommand
    ? await resolveSlashPrompt(c, channelRow.artifactId, slashCommand)
    : null;

  // Acknowledge straight away — the typing indicator is the only signal the
  // user gets while a burst is still being collected.
  await sendDiscordTyping(credentials.botToken, message.channelId);

  const envelope: ChannelBufferEnvelope = {
    channelId: channelRow.id,
    platform: utils.constants.CHANNEL_PLATFORM_DISCORD,
    externalConversationId: message.channelId,
    conversationTitle,
    conversationScope: scope,
    externalParticipantId: message.author.id,
    participantDisplayName: displayName,
    participantMetadata: {
      guildId: message.guildId,
      username: message.author.username
    },
    // Reply-reference the burst's newest message.
    delivery: { replyToMessageId: message.id }
  };

  const buffered: BufferedChannelMessage = {
    text: cleanText,
    externalMessageId: message.id,
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
    if (held) return c.json({ ok: true });
  }

  const pending = promptMatch ? await drainChannelBuffer(c, envelope) : [];

  await runDiscordBatchAndReply(
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
// participant's burst has settled.
export const handleDiscordDebouncedBatch = async (
  c: Context<AppEnv>,
  channelRow: { id: string; artifactId: string; credentials: string },
  envelope: ChannelBufferEnvelope,
  messages: BufferedChannelMessage[]
): Promise<void> => {
  const credentials = loadCredentials(c, channelRow.credentials);
  await sendDiscordTyping(
    credentials.botToken,
    envelope.externalConversationId
  );
  await runDiscordBatchAndReply(
    c,
    channelRow,
    credentials.botToken,
    envelope,
    toRunUserMessages(messages),
    null
  );
};

type DiscordPromptMatch = Awaited<ReturnType<typeof resolveSlashPrompt>>;

// Run one turn for a Gateway conversation and post the reply into the Discord
// channel. Shared by the inline path (commands, buffering disabled) and the
// debounced flush. The interaction path replies differently (it edits its
// deferred response), so it keeps using runDiscordTurn directly.
const runDiscordBatchAndReply = async (
  c: Context<AppEnv>,
  channelRow: { id: string },
  botToken: string,
  envelope: ChannelBufferEnvelope,
  userMessages: RunUserMessage[],
  promptMatch: DiscordPromptMatch
): Promise<void> => {
  const delivery = envelope.delivery as { replyToMessageId?: unknown };
  const replyToMessageId =
    typeof delivery.replyToMessageId === 'string'
      ? delivery.replyToMessageId
      : null;
  const conversationId = envelope.externalConversationId;

  const result = await runDiscordTurn(c, channelRow, botToken, {
    channelId: envelope.channelId,
    externalConversationId: conversationId,
    conversationTitle: envelope.conversationTitle,
    conversationScope: envelope.conversationScope,
    externalParticipantId: envelope.externalParticipantId,
    participantDisplayName: envelope.participantDisplayName,
    participantMetadata: envelope.participantMetadata || undefined,
    userMessages,
    promptId: promptMatch?.promptId || null,
    promptArtifactId: promptMatch?.artifactPromptId ?? null,
    promptTitle: promptMatch?.promptTitle ?? null,
    promptArgs: promptMatch?.args || undefined
  });

  await sendDiscordMessage(
    botToken,
    conversationId,
    replyToMessageId,
    result.replyText,
    result.sourceButtons
  );

  for (const attachment of result.attachments) {
    await sendDiscordAttachment(
      botToken,
      conversationId,
      replyToMessageId,
      attachment,
      c.env
    ).catch(err =>
      dbUtils.handleError(c, err, {
        service: utils.constants.SERVICE_NAME_API,
        metadata: {
          source: 'sendDiscordAttachment',
          channelId: channelRow.id,
          channel: conversationId,
          resourceId:
            attachment.kind === 'artifact'
              ? attachment.resource.id
              : attachment.uri
        }
      })
    );
  }
};

// Interactions endpoint (native slash commands)

interface DiscordInteraction {
  type: number;
  token: string;
  data?: {
    name?: string;
    options?: Array<{ name: string; value?: unknown }>;
  };
  channel_id?: string;
  guild_id?: string;
  member?: { user?: { id: string; username?: string; global_name?: string } };
  user?: { id: string; username?: string; global_name?: string };
}

const verifyDiscordSignature = async (
  publicKey: string,
  signature: string | undefined,
  timestamp: string | undefined,
  rawBody: string
): Promise<boolean> => {
  if (!signature || !timestamp || !publicKey) return false;
  try {
    const keyBytes = utils.hexToBytes(publicKey) as BufferSource;
    const sigBytes = utils.hexToBytes(signature) as BufferSource;
    const msgBytes = new TextEncoder().encode(
      timestamp + rawBody
    ) as BufferSource;
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify('Ed25519', key, sigBytes, msgBytes);
  } catch {
    return false;
  }
};

// Edit the deferred interaction's original response with the final answer +
// optional source buttons.
const editInteractionOriginal = async (
  applicationId: string,
  token: string,
  markdown: string,
  sourceButtons: SourceButton[]
): Promise<void> => {
  const chunks = chunkMessage(markdownToDiscord(markdown));
  const components = buttonComponents(sourceButtons);
  const body: Record<string, unknown> = {
    content: chunks[0],
    allowed_mentions: { parse: [] }
  };
  if (chunks.length === 1 && components) body.components = components;
  await fetch(
    `${DISCORD_BASE}/webhooks/${applicationId}/${token}/messages/@original`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  ).catch(() => undefined);

  // Remaining chunks (and buttons on the last) go out as follow-up messages.
  for (let i = 1; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const followBody: Record<string, unknown> = {
      content: chunks[i],
      allowed_mentions: { parse: [] }
    };
    if (isLast && components) followBody.components = components;
    await fetch(`${DISCORD_BASE}/webhooks/${applicationId}/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(followBody)
    }).catch(() => undefined);
  }
};

const interactionUserId = (i: DiscordInteraction): string | null =>
  i.member?.user?.id || i.user?.id || null;

const interactionUserName = (i: DiscordInteraction): string | null => {
  const u = i.member?.user || i.user;
  return u?.global_name || u?.username || null;
};

export const handleDiscordInteraction = async (c: Context<AppEnv>) => {
  const channelId = c.req.param('channelId');
  if (!channelId) return c.json({ error: 'Missing channelId' }, 400);

  const dbInstance = db.create(c);
  const [channelRow] = await dbInstance
    .select()
    .from(db.schema.channel)
    .where(eq(db.schema.channel.id, channelId))
    .limit(1);
  if (!channelRow) return c.json({ ok: false }, 404);
  if (channelRow.platform !== utils.constants.CHANNEL_PLATFORM_DISCORD) {
    return c.json({ ok: false, error: 'Wrong platform' }, 400);
  }

  const credentials = loadCredentials(c, channelRow.credentials);

  // Discord signs every interaction (Ed25519 over `{timestamp}{rawBody}`).
  const rawBody = await c.req.text();
  const signature = c.req.header(utils.constants.DISCORD_SIGNATURE_HEADER);
  const timestamp = c.req.header(utils.constants.DISCORD_TIMESTAMP_HEADER);
  const valid = await verifyDiscordSignature(
    credentials.publicKey,
    signature,
    timestamp,
    rawBody
  );
  if (!valid) {
    return c.json({ error: 'invalid request signature' }, 401);
  }

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(rawBody) as DiscordInteraction;
  } catch {
    return c.json({ error: 'bad payload' }, 400);
  }

  // The endpoint-verification handshake Discord performs when you save the
  // Interactions URL — must always be answered.
  if (interaction.type === utils.constants.DISCORD_INTERACTION_TYPE_PING) {
    return c.json({ type: utils.constants.DISCORD_INTERACTION_RESPONSE_PONG });
  }

  if (
    interaction.type !==
    utils.constants.DISCORD_INTERACTION_TYPE_APPLICATION_COMMAND
  ) {
    return c.json({ type: utils.constants.DISCORD_INTERACTION_RESPONSE_PONG });
  }

  // Ephemeral reply helper (flags: 64 = ephemeral, type 4 = message w/ source).
  const ephemeral = (content: string) =>
    c.json({ type: 4, data: { content, flags: 64 } });

  if (channelRow.status !== utils.constants.STATUS_ACTIVE) {
    return ephemeral('This channel is currently disabled.');
  }

  const name = (interaction.data?.name || '').toLowerCase();
  const userId = interactionUserId(interaction);
  const conversationId = interaction.channel_id;
  if (!name || !userId || !conversationId) {
    return ephemeral('Sorry, I could not read that command.');
  }

  const textOption = (interaction.data?.options || []).find(
    o => o.name === 'text'
  );
  const trailingText =
    typeof textOption?.value === 'string' ? textOption.value.trim() : '';

  if (name === utils.constants.BOT_COMMAND_LINK) {
    // A slash command reply is ephemeral (only the invoker sees it), so a link
    // code is safe even in a server channel.
    const replyText = await startChannelLink(c, {
      provider: utils.constants.CHANNEL_PLATFORM_DISCORD,
      externalId: userId,
      channelId: channelRow.id,
      displayName: interactionUserName(interaction) || ''
    });
    return ephemeral(replyText);
  }

  const promptMatch = await resolveSlashPrompt(c, channelRow.artifactId, {
    name,
    trailingText
  });

  const scope = scopeForDiscord(!interaction.guild_id);
  const displayName = interactionUserName(interaction);
  const interactionToken = interaction.token;

  // Ack with a deferred response so Discord doesn't time out (3s), then edit the
  // original message once the turn finishes.
  c.executionCtx.waitUntil(
    (async () => {
      const result = await runDiscordTurn(c, channelRow, credentials.botToken, {
        channelId: channelRow.id,
        externalConversationId: conversationId,
        conversationScope: scope,
        externalParticipantId: userId,
        participantDisplayName: displayName,
        participantMetadata: {
          viaSlashCommand: true,
          guildId: interaction.guild_id || null
        },
        userMessages: [{ text: trailingText || `/${name}` }],
        promptId: promptMatch?.promptId || null,
        promptArtifactId: promptMatch?.artifactPromptId ?? null,
        promptTitle: promptMatch?.promptTitle ?? null,
        promptArgs: promptMatch?.args || undefined
      });
      await editInteractionOriginal(
        credentials.applicationId,
        interactionToken,
        result.replyText,
        result.sourceButtons
      );
      for (const attachment of result.attachments) {
        await sendDiscordAttachment(
          credentials.botToken,
          conversationId,
          null,
          attachment,
          c.env
        ).catch(() => undefined);
      }
    })().catch(err =>
      dbUtils.handleError(c, err, {
        service: utils.constants.SERVICE_NAME_API,
        metadata: {
          source: 'channel-runner',
          platform: utils.constants.CHANNEL_PLATFORM_DISCORD,
          channelId: channelRow.id,
          channel: conversationId,
          command: name
        }
      })
    )
  );

  return c.json({
    type: utils.constants.DISCORD_INTERACTION_RESPONSE_DEFERRED
  });
};

// account linking
// bot identity + gateway control

// `GET /users/@me` — confirms the bot token and returns the bot's identity, used
// at channel-create time for the bot card + duplicate-connection detection.
export const getDiscordBotInfo = async (
  botToken: string
): Promise<DiscordBotInfo> => {
  const response = await fetch(`${DISCORD_BASE}/users/@me`, {
    headers: { Authorization: `Bot ${botToken}` }
  });
  const data = (await response.json().catch(() => ({}))) as {
    id?: string;
    username?: string;
    global_name?: string | null;
    discriminator?: string;
    message?: string;
  };
  if (!response.ok || !data.id) {
    throw new Error(`Discord users/@me failed: ${data.message || 'unknown'}`);
  }
  return {
    id: data.id,
    username: data.username,
    globalName: data.global_name,
    discriminator: data.discriminator
  };
};

// Start (or restart) the persistent Gateway connection for a channel. One DO
// per channelId. Best-effort — a gateway hiccup must not fail the channel write.
export const startGateway = async (
  c: Context<AppEnv>,
  channelId: string
): Promise<void> => {
  try {
    const ns = c.env.DISCORD_GATEWAY;
    const stub = ns.get(ns.idFromName(channelId));
    await stub.start(channelId);
  } catch (error) {
    // Not fatal to create() — the channel still works once the gateway is up,
    // but record the failure so a bot that never comes online is diagnosable.
    await dbUtils.handleError(c, error, {
      service: utils.constants.SERVICE_NAME_API,
      metadata: {
        source: 'startGateway',
        platform: utils.constants.CHANNEL_PLATFORM_DISCORD,
        channelId
      }
    });
  }
};

export const stopGateway = async (
  c: Context<AppEnv>,
  channelId: string
): Promise<void> => {
  try {
    const ns = c.env.DISCORD_GATEWAY;
    const stub = ns.get(ns.idFromName(channelId));
    await stub.stop();
  } catch {
    // Nothing to stop / already gone.
  }
};
