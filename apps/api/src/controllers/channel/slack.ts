import { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { db, utils as dbUtils } from '@anju/db';
import { utils } from '@anju/utils';
import type {
  ChannelNotifier,
  SlackSendRequest,
  SlackSendRemoteResourceRequest
} from '@anju/utils';
import { getResourceHandler } from '@anju/containers';

import { runChannelTurn } from './runner';
import { resolveSlashPrompt } from './slashPrompt';
import { markdownToSlackMrkdwn, createAuth } from '../../utils';

import type { ChannelAttachment } from './runner';
import type { ParsedSlashCommand } from './slashPrompt';
import type { AppEnv, Bindings } from '../../types';

const SLACK_BASE = utils.constants.SLACK_API_BASE;

interface SlackEventMessage {
  type: string;
  subtype?: string;
  bot_id?: string;
  user?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  channel: string;
  channel_type?: string;
}

interface SlackEventCallback {
  type: string;
  team_id?: string;
  event?: SlackEventMessage;
  challenge?: string;
}

export interface SlackBotInfo {
  // The bot's user id (U…) — what `<@…>` mentions resolve to, so we can detect
  // when a message addresses the bot and strip the mention.
  userId: string;
  botId?: string;
  teamId: string;
  teamName?: string;
  username?: string;
  url?: string;
}

// Slack channel ids encode the conversation kind in their first letter:
// D = direct message, G = private channel / mpim, C = public channel.
const scopeForChannel = (
  channelId: string,
  channelType?: string
): string => {
  if (channelType === 'im' || channelId.startsWith('D')) {
    return utils.constants.CHANNEL_CONVERSATION_SCOPE_PRIVATE;
  }
  if (
    channelType === 'group' ||
    channelType === 'mpim' ||
    channelId.startsWith('G')
  ) {
    return utils.constants.CHANNEL_CONVERSATION_SCOPE_GROUP;
  }
  return utils.constants.CHANNEL_CONVERSATION_SCOPE_CHANNEL;
};

export const handleSlackWebhook = async (c: Context<AppEnv>) => {
  const channelId = c.req.param('channelId');
  if (!channelId) throw new Error('Missing channelId');

  const dbInstance = db.create(c);
  const [channelRow] = await dbInstance
    .select()
    .from(db.schema.channel)
    .where(eq(db.schema.channel.id, channelId))
    .limit(1);

  if (!channelRow) return c.json({ ok: false }, 404);
  if (channelRow.platform !== utils.constants.CHANNEL_PLATFORM_SLACK) {
    return c.json({ ok: false, error: 'Wrong platform' }, 400);
  }

  const encryptionKey = utils.getCredentialEncryptionKey(c);
  const credentials = JSON.parse(
    utils.decryptString(channelRow.credentials, encryptionKey)
  ) as { botToken: string; signingSecret: string };

  // Slack signs every request with the app signing secret over the RAW body —
  // read it once as text (we must not consume it again with c.req.json()).
  const rawBody = await c.req.text();
  const timestamp = c.req.header(utils.constants.SLACK_TIMESTAMP_HEADER);
  const signature = c.req.header(utils.constants.SLACK_SIGNATURE_HEADER);
  const signatureValid = await verifySlackSignature(
    credentials.signingSecret,
    timestamp,
    signature,
    rawBody
  );
  if (!signatureValid) {
    return c.json({ ok: false, error: 'Invalid signature' }, 401);
  }

  const contentType = c.req.header('content-type') || '';
  const botMeta =
    (channelRow.metadata as { slack?: { bot?: SlackBotInfo } } | null)?.slack
      ?.bot || null;

  // Slash commands arrive form-encoded; Events API payloads arrive as JSON.
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return handleSlashCommand(c, channelRow, credentials.botToken, rawBody);
  }

  let payload: SlackEventCallback;
  try {
    payload = JSON.parse(rawBody) as SlackEventCallback;
  } catch {
    return c.json({ ok: true });
  }

  // The one-time handshake Slack performs when you save the Request URL — echo
  // the challenge so the URL verifies. Works regardless of channel status.
  if (payload.type === 'url_verification' && payload.challenge) {
    return c.json({ challenge: payload.challenge });
  }

  if (channelRow.status !== utils.constants.STATUS_ACTIVE) {
    return c.json({ ok: true, skipped: 'disabled' });
  }

  // We ack within Slack's 3s window and process asynchronously, so any retry
  // (delivered with this header) is a duplicate of work already in flight.
  if (c.req.header(utils.constants.SLACK_RETRY_NUM_HEADER)) {
    return c.json({ ok: true });
  }

  if (payload.type !== 'event_callback' || !payload.event) {
    return c.json({ ok: true });
  }

  const event = payload.event;

  if (!shouldHandleEvent(event, botMeta)) {
    return c.json({ ok: true });
  }

  // Run the turn after acking so Slack doesn't time out and retry.
  c.executionCtx.waitUntil(
    processSlackEvent(c, channelRow, credentials.botToken, botMeta, {
      ...event,
      team_id: payload.team_id
    }).catch(err =>
      dbUtils.handleError(c, err, {
        service: utils.constants.SERVICE_NAME_API,
        metadata: {
          source: 'channel-runner',
          platform: utils.constants.CHANNEL_PLATFORM_SLACK,
          channelId: channelRow.id,
          channel: event.channel,
          ts: event.ts
        }
      })
    )
  );

  return c.json({ ok: true });
};

// Only react to a real, human, addressed-to-us message: DMs (message.im) and
// channel @mentions (app_mention). Ignore the bot's own posts, edits/deletes
// and other subtypes, and channel chatter we weren't mentioned in.
const shouldHandleEvent = (
  event: SlackEventMessage,
  bot: SlackBotInfo | null
): boolean => {
  if (!event.channel || !event.user) return false;
  if (event.bot_id) return false;
  if (bot && event.user === bot.userId) return false;
  if (event.type === 'app_mention') return true;
  if (event.type === 'message') {
    if (event.subtype) return false; // edits, deletes, joins, bot posts…
    return event.channel_type === 'im';
  }
  return false;
};

type IncomingSlackEvent = SlackEventMessage & { team_id?: string };

const processSlackEvent = async (
  c: Context<AppEnv>,
  channelRow: { id: string; artifactId: string },
  botToken: string,
  botMeta: SlackBotInfo | null,
  event: IncomingSlackEvent
): Promise<void> => {
  const scope = scopeForChannel(event.channel, event.channel_type);
  const displayName = await getSlackUserDisplayName(botToken, event.user!);
  const participantLabel = displayName || `user-${event.user}`;
  const conversationTitle = await getSlackConversationTitle(
    botToken,
    event.channel,
    scope,
    participantLabel
  );

  const cleanText = stripBotMention(event.text || '', botMeta?.userId);
  const slashCommand = parseSlashCommandText(cleanText);
  // Telegram replies to the user's message; the Slack analog is threading the
  // reply on it (thread_ts) so an existing thread is continued and a top-level
  // message starts one.
  const replyThreadTs = event.thread_ts || event.ts;

  if (slashCommand?.name === utils.constants.BOT_COMMAND_LINK) {
    // A link code must never be posted where others can read it — restrict to
    // DMs, mirroring the Telegram rule (a Slack channel message is public).
    const isPrivate =
      scope === utils.constants.CHANNEL_CONVERSATION_SCOPE_PRIVATE;
    const replyText = isPrivate
      ? await startSlackLink(c, {
          externalId: event.user!,
          channelId: channelRow.id,
          displayName: displayName || ''
        })
      : 'For your security, account linking only works in a direct message — open a DM with me and send /link there.';
    await sendSlackMessage(botToken, event.channel, replyThreadTs, replyText);
    return;
  }

  // A bare @mention with no text and no command — nothing to act on.
  if (!cleanText && !slashCommand) return;

  const promptMatch = slashCommand
    ? await resolveSlashPrompt(c, channelRow.artifactId, slashCommand)
    : null;

  await runSlackTurnAndReply(
    c,
    channelRow,
    botToken,
    {
      channelId: channelRow.id,
      externalConversationId: event.channel,
      conversationTitle,
      conversationScope: scope,
      externalParticipantId: event.user!,
      participantDisplayName: displayName,
      participantMetadata: {
        teamId: event.team_id,
        channelType: event.channel_type
      },
      externalMessageId: event.ts,
      userText: cleanText,
      promptId: promptMatch?.promptId || null,
      promptArtifactId: promptMatch?.artifactPromptId ?? null,
      promptArgs: promptMatch?.args || undefined
    },
    event.channel,
    replyThreadTs
  );
};

// Native Slack slash command — a form-encoded POST to the same Request URL.
// Already signature-verified by the caller. `/link` replies ephemerally (only
// the invoker sees it, so it's safe even in a channel); anything else resolves
// to a prompt (or is treated as a plain message) and the answer is posted back.
const handleSlashCommand = async (
  c: Context<AppEnv>,
  channelRow: { id: string; artifactId: string; status: string },
  botToken: string,
  rawBody: string
) => {
  if (channelRow.status !== utils.constants.STATUS_ACTIVE) {
    return c.json({
      response_type: 'ephemeral',
      text: 'This channel is currently disabled.'
    });
  }

  const params = new URLSearchParams(rawBody);
  const name = (params.get('command') || '').replace(/^\//, '').toLowerCase();
  const trailingText = (params.get('text') || '').trim();
  const externalParticipantId = params.get('user_id') || '';
  const conversationId = params.get('channel_id') || '';
  const channelName = params.get('channel_name') || '';

  if (!name || !externalParticipantId || !conversationId) {
    return c.json({ ok: true });
  }

  const scope =
    channelName === 'directmessage' || conversationId.startsWith('D')
      ? utils.constants.CHANNEL_CONVERSATION_SCOPE_PRIVATE
      : scopeForChannel(conversationId);

  if (name === utils.constants.BOT_COMMAND_LINK) {
    const replyText = await startSlackLink(c, {
      externalId: externalParticipantId,
      channelId: channelRow.id,
      displayName: ''
    });
    return c.json({ response_type: 'ephemeral', text: replyText });
  }

  const promptMatch = await resolveSlashPrompt(c, channelRow.artifactId, {
    name,
    trailingText
  });

  // Slash commands carry no message ts to thread on, so the reply is posted
  // top-level into the originating channel.
  c.executionCtx.waitUntil(
    runSlackTurnAndReply(
      c,
      channelRow,
      botToken,
      {
        channelId: channelRow.id,
        externalConversationId: conversationId,
        conversationScope: scope,
        externalParticipantId,
        participantMetadata: { viaSlashCommand: true },
        userText: trailingText || `/${name}`,
        promptId: promptMatch?.promptId || null,
        promptArtifactId: promptMatch?.artifactPromptId ?? null,
        promptArgs: promptMatch?.args || undefined
      },
      conversationId
    ).catch(err =>
      dbUtils.handleError(c, err, {
        service: utils.constants.SERVICE_NAME_API,
        metadata: {
          source: 'channel-runner',
          platform: utils.constants.CHANNEL_PLATFORM_SLACK,
          channelId: channelRow.id,
          channel: conversationId,
          command: name
        }
      })
    )
  );

  return c.json({ response_type: 'ephemeral', text: 'On it…' });
};

interface SlackRunOptions {
  channelId: string;
  externalConversationId: string;
  conversationTitle?: string | null;
  conversationScope: string;
  externalParticipantId: string;
  participantDisplayName?: string | null;
  participantMetadata?: Record<string, unknown>;
  externalMessageId?: string | null;
  userText: string;
  promptId?: string | null;
  promptArtifactId?: string | null;
  promptArgs?: Record<string, string>;
}

const runSlackTurnAndReply = async (
  c: Context<AppEnv>,
  channelRow: { id: string },
  botToken: string,
  options: SlackRunOptions,
  replyChannel: string,
  replyThreadTs?: string
): Promise<void> => {
  let replyText: string;
  let attachments: ChannelAttachment[] = [];
  let sourcesFooter: string | null = null;
  try {
    const result = await runChannelTurn(c, {
      ...options,
      notifier: createSlackNotifier(botToken, replyChannel, replyThreadTs)
    });
    replyText = result.assistantText;
    attachments = result.attachments;
    sourcesFooter = result.sourcesFooter;
  } catch (error: any) {
    const { refId } = await dbUtils.handleError(c, error, {
      service: utils.constants.SERVICE_NAME_API,
      metadata: {
        source: 'channel-runner',
        platform: utils.constants.CHANNEL_PLATFORM_SLACK,
        channelId: channelRow.id,
        channel: replyChannel
      }
    });
    replyText = `Sorry, something went wrong while processing your message (ref: ${refId}). The team has been notified.`;
  }

  await sendSlackMessage(
    botToken,
    replyChannel,
    replyThreadTs,
    replyText,
    sourcesFooter
  );

  for (const attachment of attachments) {
    await sendSlackAttachment(
      botToken,
      replyChannel,
      replyThreadTs,
      attachment,
      c.env
    ).catch(err =>
      dbUtils.handleError(c, err, {
        service: utils.constants.SERVICE_NAME_API,
        metadata: {
          source: 'sendSlackAttachment',
          channelId: channelRow.id,
          channel: replyChannel,
          resourceId:
            attachment.kind === 'artifact'
              ? attachment.resource.id
              : attachment.uri
        }
      })
    );
  }
};

interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  elements?: unknown[];
}

const postSlackMessage = async (
  botToken: string,
  body: Record<string, unknown>
): Promise<boolean> => {
  const response = await fetch(`${SLACK_BASE}/chat.postMessage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(body)
  }).catch(() => null);
  if (!response) return false;
  const data = (await response.json().catch(() => ({}))) as { ok?: boolean };
  return data.ok === true;
};

const sendSlackMessage = async (
  botToken: string,
  channel: string,
  threadTs: string | undefined,
  markdown: string,
  sourcesFooter?: string | null
) => {
  const mrkdwn = markdownToSlackMrkdwn(markdown);
  const chunks = chunkMessage(mrkdwn);

  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const blocks: SlackBlock[] = [
      { type: 'section', text: { type: 'mrkdwn', text: chunks[i] } }
    ];
    // Mirror Telegram's source buttons with a context block of mrkdwn links —
    // clickable, and no Slack interactivity configuration required.
    if (isLast && sourcesFooter) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: markdownToSlackMrkdwn(sourcesFooter).slice(
              0,
              utils.constants.SLACK_MESSAGE_LIMIT
            )
          }
        ]
      });
    }

    const base = { channel, ...(threadTs && { thread_ts: threadTs }) };
    const ok = await postSlackMessage(botToken, {
      ...base,
      text: chunks[i],
      blocks,
      unfurl_links: false,
      unfurl_media: false
    });
    // Fallback: a malformed block (e.g. an over-long run) shouldn't drop the
    // reply — resend as plain text.
    if (!ok) {
      await postSlackMessage(botToken, {
        ...base,
        text: chunks[i],
        unfurl_links: false,
        unfurl_media: false
      });
    }
  }
};

const sendSlackAttachment = async (
  botToken: string,
  channel: string,
  threadTs: string | undefined,
  attachment: ChannelAttachment,
  env: Bindings
) => {
  const caption = attachment.caption;
  const handler = getResourceHandler(env);

  if (attachment.kind === 'remote-resource') {
    // A proxied (remote) resource: hand the container only the connection
    // details + resolved auth header. It reads, decodes, and uploads the file
    // itself, so the bytes never transit this worker (no 128 MiB ceiling).
    const payload: SlackSendRemoteResourceRequest = {
      slack: {
        accessToken: botToken,
        channel,
        threadTs,
        initialComment: caption
      },
      remote: { ...attachment.remote, uri: attachment.uri }
    };
    const response = await handler.fetch(
      'http://resource-handler/slack/send-remote-resource',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Slack remote-resource send via container failed: ${response.status} ${text}`
      );
    }
    return;
  }

  // An artifact resource: the worker holds the bytes (R2 object or row content)
  // and posts them as multipart to the container's external-upload flow.
  const { resource } = attachment;
  const mime =
    resource.mimeType || utils.constants.MIMETYPE_APPLICATION_OCTET_STREAM;
  let arrayBuffer: ArrayBuffer;
  let filename: string;
  if (resource.fileKey) {
    const object = await env.STORAGE_BUCKET.get(resource.fileKey);
    if (!object) {
      throw new Error(`Resource file not found in storage: ${resource.fileKey}`);
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

  const metadata: SlackSendRequest = {
    accessToken: botToken,
    operation: 'upload-file',
    channel,
    threadTs,
    initialComment: caption
  };

  const form = new FormData();
  form.append('metadata', JSON.stringify(metadata));
  form.append('attachment', new Blob([arrayBuffer], { type: mime }), filename);

  const response = await handler.fetch('http://resource-handler/slack/send', {
    method: 'POST',
    body: form
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Slack send via container failed: ${response.status} ${text}`
    );
  }
};

const createSlackNotifier = (
  botToken: string,
  channel: string,
  threadTs: string | undefined
): ChannelNotifier => ({
  toolStarted: async ({ toolName }) => {
    const message = utils.getToolStatusMessage(toolName);
    if (!message) return;
    await postSlackMessage(botToken, {
      channel,
      ...(threadTs && { thread_ts: threadTs }),
      text: `_${message}_`,
      mrkdwn: true,
      unfurl_links: false,
      unfurl_media: false
    }).catch(() => undefined);
  }
});

// Strip a leading/embedded `<@BOTID>` mention (Slack's wire form for @bot).
const stripBotMention = (text: string, botUserId?: string): string => {
  if (!botUserId) return text.trim();
  const pattern = new RegExp(`<@${botUserId}(?:\\|[^>]+)?>`, 'g');
  return text.replace(pattern, '').replace(/\s+/g, ' ').trim();
};

// Parse a leading `/word args` out of plain message text. Slack delivers a real
// slash command via a separate form-encoded POST; this fallback handles a user
// who simply types `/link` (or a prompt name) into a message.
const parseSlashCommandText = (text: string): ParsedSlashCommand | null => {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const match = trimmed.match(/^\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  return { name: match[1].toLowerCase(), trailingText: (match[2] || '').trim() };
};

const chunkMessage = (text: string): string[] => {
  if (!text) return ['...'];
  const limit = utils.constants.SLACK_MESSAGE_LIMIT;
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

interface ExternalLinkApi {
  startExternalLink: (args: {
    body: {
      provider: string;
      externalId: string;
      channelId: string;
      displayName?: string;
      client_id?: string;
      client_secret?: string;
    };
  }) => Promise<{ code: string }>;
}

// `/link` connects this Slack user to an Anju account for THIS channel. Calls
// the bot-client link endpoint in-process (a Worker self-fetch to its own
// hostname times out) and returns a code to redeem on the web.
const startSlackLink = async (
  c: Context<AppEnv>,
  args: { externalId: string; channelId: string; displayName: string }
): Promise<string> => {
  const webUrl = utils.getEnv(c, 'NEXT_PUBLIC_WEB_URL');
  const clientId = utils.getEnv(c, 'BOT_OAUTH_CLIENT_ID');
  const clientSecret = utils.getEnv(c, 'BOT_OAUTH_CLIENT_SECRET');
  if (!webUrl || !clientId || !clientSecret) {
    return 'Account linking is not available right now.';
  }

  try {
    const auth = createAuth(c);
    const api = auth.api as unknown as ExternalLinkApi;
    const result = await api.startExternalLink({
      body: {
        provider: utils.constants.CHANNEL_PLATFORM_SLACK,
        externalId: args.externalId,
        channelId: args.channelId,
        displayName: args.displayName || undefined,
        client_id: clientId,
        client_secret: clientSecret
      }
    });

    return [
      'Link this Slack account to your Anju account.',
      '',
      `Open ${webUrl}/link?code=${result.code}`,
      `(or go to ${webUrl}/link and enter the code ${result.code})`,
      '',
      'The code expires in 10 minutes.'
    ].join('\n');
  } catch (error) {
    await dbUtils.handleError(c, error, {
      service: utils.constants.SERVICE_NAME_API,
      metadata: {
        source: 'startSlackLink',
        platform: utils.constants.CHANNEL_PLATFORM_SLACK,
        channelId: args.channelId,
        externalId: args.externalId
      }
    });
    return 'Could not start account linking. Please try again later.';
  }
};

const verifySlackSignature = async (
  signingSecret: string,
  timestamp: string | undefined,
  signature: string | undefined,
  rawBody: string
): Promise<boolean> => {
  if (!timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > utils.constants.SLACK_SIGNATURE_MAX_SKEW_SECONDS) {
    return false;
  }
  const base = `${utils.constants.SLACK_SIGNATURE_VERSION}:${timestamp}:${rawBody}`;
  const expected = `${utils.constants.SLACK_SIGNATURE_VERSION}=${await utils.hmacSha256Hex(
    signingSecret,
    base
  )}`;
  return utils.timingSafeEqual(expected, signature);
};

// Best-effort display name (needs users:read). Never fatal — falls back to the
// Slack user id, mirroring how Telegram degrades to `user-<id>`.
const getSlackUserDisplayName = async (
  botToken: string,
  userId: string
): Promise<string | null> => {
  try {
    const response = await fetch(`${SLACK_BASE}/users.info?user=${userId}`, {
      headers: { Authorization: `Bearer ${botToken}` }
    });
    const data = (await response.json()) as {
      ok?: boolean;
      user?: {
        real_name?: string;
        name?: string;
        profile?: { display_name?: string };
      };
    };
    if (!data.ok || !data.user) return null;
    return (
      data.user.real_name ||
      data.user.profile?.display_name ||
      data.user.name ||
      null
    );
  } catch {
    return null;
  }
};

// Best-effort conversation title (needs channels:read / groups:read). DMs use
// the participant label; channels fall back to their id when not readable.
const getSlackConversationTitle = async (
  botToken: string,
  channelId: string,
  scope: string,
  fallbackLabel: string
): Promise<string> => {
  if (scope === utils.constants.CHANNEL_CONVERSATION_SCOPE_PRIVATE) {
    return `DM · ${fallbackLabel}`;
  }
  try {
    const response = await fetch(
      `${SLACK_BASE}/conversations.info?channel=${channelId}`,
      { headers: { Authorization: `Bearer ${botToken}` } }
    );
    const data = (await response.json()) as {
      ok?: boolean;
      channel?: { name?: string };
    };
    if (data.ok && data.channel?.name) return `#${data.channel.name}`;
  } catch {
    // fall through
  }
  return `${scope} · ${channelId}`;
};

// `auth.test` — confirms the bot token and returns the bot's identity, used at
// channel-create time for the bot card + duplicate-connection detection.
export const getSlackBotInfo = async (
  botToken: string
): Promise<SlackBotInfo> => {
  const response = await fetch(`${SLACK_BASE}/auth.test`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    url?: string;
    team?: string;
    user?: string;
    team_id?: string;
    user_id?: string;
    bot_id?: string;
  };
  if (!data.ok || !data.user_id || !data.team_id) {
    throw new Error(`Slack auth.test failed: ${data.error || 'unknown error'}`);
  }
  return {
    userId: data.user_id,
    botId: data.bot_id,
    teamId: data.team_id,
    teamName: data.team,
    username: data.user,
    url: data.url
  };
};
