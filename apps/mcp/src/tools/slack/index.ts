import { utils } from '@anju/utils';
import { getResourceHandler } from '@anju/containers';

// types
import type { SlackSendRequest, SlackSendResponse } from '@anju/utils';
import { ToolContext, ToolDefinition } from '../types';

const SLACK_BASE = utils.constants.SLACK_API_BASE;

type ToolResult = { content: Array<{ type: 'text'; text: string }> };

const text = (value: string): ToolResult => ({
  content: [{ type: 'text', text: value }]
});

const getAccessToken = (
  context: ToolContext
): { ok: true; token: string } | { ok: false; response: ToolResult } => {
  const credential = context.credentials[0];
  if (!credential) {
    return {
      ok: false,
      response: text('Error: Slack credential not connected')
    };
  }
  return { ok: true, token: credential.accessToken };
};

interface SlackEnvelope {
  ok: boolean;
  error?: string;
  warning?: string;
  [k: string]: any;
}

// Slack always returns HTTP 200 with { ok, error } — http status alone isn't
// enough to know if the call succeeded. Centralize that here.
const slackFetch = async (
  token: string,
  method: 'GET' | 'POST',
  path: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<SlackEnvelope> => {
  const url = new URL(`${SLACK_BASE}${path}`);
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  };

  if (params) {
    if (method === 'GET') {
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    } else {
      const form = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        form.set(k, String(v));
      }
      (init.headers as Record<string, string>)['Content-Type'] =
        'application/x-www-form-urlencoded';
      init.body = form.toString();
    }
  }

  const response = await fetch(url, init);
  const body = await response.text();
  if (!body) {
    return {
      ok: false,
      error: `slack returned empty body (${response.status})`
    };
  }
  try {
    return JSON.parse(body) as SlackEnvelope;
  } catch {
    return {
      ok: false,
      error: `slack non-JSON response (${response.status}): ${body.slice(0, 200)}`
    };
  }
};

const slackError = (env: SlackEnvelope): string => {
  if (env.error === 'not_allowed_token_type') {
    return 'slack: this endpoint requires a user token (xoxp), but a bot token is connected. Re-authorize Slack with the matching user scopes.';
  }
  if (env.error === 'missing_scope') {
    const needed = env.needed || env.response_metadata?.scopes_needed;
    return `slack: missing OAuth scope${needed ? ` (needs: ${Array.isArray(needed) ? needed.join(', ') : needed})` : ''}. Re-link Slack with the required scopes.`;
  }
  return `slack: ${env.error || 'unknown error'}`;
};

// Write operations route through the resource-handler container — same shape
// as gmail/outlook. The container handles the multi-step external-upload flow
// for files so the Worker bundle stays lean.
const sendViaContainer = async (
  context: ToolContext,
  request: SlackSendRequest,
  attachmentUri?: string
): Promise<
  { ok: true; result: SlackSendResponse } | { ok: false; error: string }
> => {
  const form = new FormData();
  form.append('metadata', JSON.stringify(request));

  if (attachmentUri) {
    const resource = context.resources.find(r => r.uri === attachmentUri);
    if (!resource) {
      return { ok: false, error: `Resource not found: ${attachmentUri}` };
    }

    let arrayBuffer: ArrayBuffer;
    let mimeType: string;
    let filename: string;

    if (resource.fileKey) {
      const obj = await context.bucket.get(resource.fileKey);
      if (!obj) {
        return {
          ok: false,
          error: `Resource bytes missing in storage for ${attachmentUri} (fileKey: ${resource.fileKey})`
        };
      }
      arrayBuffer = await obj.arrayBuffer();
      mimeType =
        resource.mimeType || utils.constants.MIMETYPE_APPLICATION_OCTET_STREAM;
      filename =
        resource.fileName ||
        resource.title ||
        attachmentUri.split('/').pop() ||
        'attachment';
    } else if (resource.content !== null && resource.content !== undefined) {
      const bytes = new TextEncoder().encode(resource.content);
      arrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;
      mimeType = resource.mimeType || 'text/plain';
      const base = resource.fileName || resource.title || 'attachment';
      filename = /\.[a-z0-9]+$/i.test(base) ? base : `${base}.txt`;
    } else {
      return {
        ok: false,
        error: `Resource ${attachmentUri} has no inline content and no file in storage; cannot upload.`
      };
    }

    if (arrayBuffer.byteLength > utils.constants.SLACK_MAX_UPLOAD_BYTES) {
      return {
        ok: false,
        error: `Attachment ${filename} exceeds Slack's ${Math.round(utils.constants.SLACK_MAX_UPLOAD_BYTES / (1024 * 1024))}MB upload cap.`
      };
    }

    form.append(
      'attachment',
      new Blob([arrayBuffer], { type: mimeType }),
      filename
    );
  }

  const handler = getResourceHandler(context.env);
  const response = await handler.fetch('http://resource-handler/slack/send', {
    method: 'POST',
    body: form
  });

  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    return {
      ok: false,
      error: errBody.error || `Slack send failed (${response.status})`
    };
  }

  const result = (await response.json()) as SlackSendResponse;
  return { ok: true, result };
};

export const sendMessage: ToolDefinition = {
  title: 'Slack: Send Message',
  description:
    "Post a message to a Slack channel, DM, or thread via chat.postMessage. `channel` accepts a channel ID (C…/G…/D…) or name (#general); IDs are preferred because Slack resolves them faster and unambiguously. Set `threadTs` to reply inside an existing thread (use the `ts` returned by an earlier slack-send-message or surfaced by slack-search-messages). `text` is plain text by default with Slack's mrkdwn formatting; pass mrkdwn=false to disable. Returns the message ts so the caller can thread later replies onto it.",
  schema: {
    type: 'object',
    properties: {
      channel: {
        type: 'string',
        description:
          'Slack channel ID (C…/G…/D…) or name (#general). IDs preferred.'
      },
      text: {
        type: 'string',
        description:
          'Message body. Slack mrkdwn by default — *bold*, _italic_, `code`, <@U123>, <#C123|name>.'
      },
      threadTs: {
        type: 'string',
        description:
          'Optional parent message ts to reply inside a thread (omit for a new top-level message).'
      },
      mrkdwn: {
        type: 'boolean',
        description:
          'If false, Slack treats the text literally (no *bold*, no auto-linking). Defaults to true.'
      }
    },
    required: ['channel', 'text']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const sent = await sendViaContainer(context, {
      accessToken: auth.token,
      operation: 'post-message',
      channel: String(args.channel),
      text: String(args.text),
      threadTs: args.threadTs ? String(args.threadTs) : undefined,
      mrkdwn: args.mrkdwn === false ? false : undefined
    });
    if (!sent.ok) return text(`Error sending message: ${sent.error}`);

    const channel = sent.result.channel || args.channel;
    const threadNote = args.threadTs ? ` in thread ${args.threadTs}` : '';
    return text(
      `Message sent to ${channel}${threadNote}. ts: ${sent.result.ts || sent.result.id || 'unknown'}`
    );
  }
};

export const listChannels: ToolDefinition = {
  title: 'Slack: List Channels',
  description:
    'List Slack conversations the connected token can see — public channels by default, plus private channels / multi-party DMs / DMs when included via `types`. Returns up to maxResults (default 50, max 200) with name, member count, archived state, topic, and the channel ID. Use this BEFORE slack-send-message when the user names a channel by string and you need the ID, and to discover where the agent is allowed to post. Excludes archived by default; pass includeArchived=true to include them.',
  schema: {
    type: 'object',
    properties: {
      types: {
        type: 'string',
        description:
          'Comma-separated channel types. Defaults to "public_channel,private_channel". Allowed: public_channel, private_channel, mpim, im.'
      },
      maxResults: {
        type: 'number',
        minimum: 1,
        maximum: 200,
        description:
          'Maximum number of channels to return (1-200). Defaults to 50.'
      },
      includeArchived: {
        type: 'boolean',
        description: 'If true, include archived channels. Defaults to false.'
      },
      query: {
        type: 'string',
        description:
          'Optional substring to filter the resulting channel names (client-side; Slack has no server-side name filter).'
      }
    }
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const requested = Number(args.maxResults) || 50;
    const limit = Math.max(1, Math.min(200, requested));

    const res = await slackFetch(auth.token, 'GET', '/conversations.list', {
      types: args.types ? String(args.types) : 'public_channel,private_channel',
      exclude_archived: args.includeArchived === true ? 'false' : 'true',
      limit: String(limit)
    });
    if (!res.ok) return text(`Error listing channels: ${slackError(res)}`);

    const channels =
      (res.channels as Array<{
        id: string;
        name?: string;
        is_archived?: boolean;
        is_private?: boolean;
        is_im?: boolean;
        num_members?: number;
        topic?: { value?: string };
      }>) || [];

    const filter = args.query ? String(args.query).toLowerCase() : null;
    const filtered = filter
      ? channels.filter(c => (c.name || '').toLowerCase().includes(filter))
      : channels;

    if (filtered.length === 0) return text('No channels found.');

    const lines = filtered.map(c => {
      const flags = [
        c.is_private ? 'private' : 'public',
        c.is_archived ? 'archived' : null,
        c.is_im ? 'dm' : null
      ]
        .filter(Boolean)
        .join(', ');
      const topic = c.topic?.value ? ` :: ${c.topic.value}` : '';
      return `- #${c.name || c.id} [${flags}] (${c.num_members ?? '?'} members) [${c.id}]${topic}`;
    });
    return text(`Found ${filtered.length} channel(s):\n\n${lines.join('\n')}`);
  }
};

export const searchMessages: ToolDefinition = {
  title: 'Slack: Search Messages',
  description:
    'Search messages across the workspace via search.messages. Backed by the separate `slack-user` provider (user/xoxp token) — Slack does not allow bot tokens to call search. The user must connect "Slack Search" once on the Tools page; if not connected the call returns the standard credential-not-connected error. `query` accepts Slack\'s modifiers (in:#channel, from:@user, before:YYYY-MM-DD, has:link). Returns up to maxResults matches with channel, user, ts, text snippet, and permalink. Use to find prior context ("what did support say about X?") before composing a reply.',
  schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Search query. Supports Slack modifiers: in:#channel, from:@user, before:YYYY-MM-DD, has:link.'
      },
      maxResults: {
        type: 'number',
        minimum: 1,
        maximum: 50,
        description:
          'Maximum number of matches to return (1-50). Defaults to 10.'
      },
      sort: {
        type: 'string',
        enum: ['score', 'timestamp'],
        description:
          'Sort order — "score" for relevance (default) or "timestamp" for most recent.'
      }
    },
    required: ['query']
  },
  handler: async (args, context) => {
    // The slack-search-messages tool belongs to a tool_group whose provider
    // is slack-user, so credentials[0].accessToken is already the xoxp
    // token — no special unpacking needed.
    const credential = context.credentials[0];
    if (!credential) {
      return text(
        'Error: Slack Search not connected. Open the Tools page and connect "Slack Search" to grant the search:read user scope.'
      );
    }

    const requested = Number(args.maxResults) || 10;
    const count = Math.max(1, Math.min(50, requested));

    const res = await slackFetch(
      credential.accessToken,
      'GET',
      '/search.messages',
      {
        query: String(args.query),
        count: String(count),
        sort: args.sort === 'timestamp' ? 'timestamp' : 'score',
        sort_dir: 'desc'
      }
    );
    if (!res.ok) return text(`Error searching messages: ${slackError(res)}`);

    const matches =
      (res.messages?.matches as Array<{
        ts: string;
        user?: string;
        username?: string;
        text?: string;
        permalink?: string;
        channel?: { id?: string; name?: string };
      }>) || [];

    if (matches.length === 0) return text('No matches.');

    const lines = matches.map(m => {
      const who = m.username || m.user || 'unknown';
      const where = m.channel?.name
        ? `#${m.channel.name}`
        : m.channel?.id || 'unknown';
      const snippet = (m.text || '').replace(/\s+/g, ' ').slice(0, 200);
      return `- ${where} ${m.ts} — @${who}: ${snippet}\n  ${m.permalink || ''}`;
    });
    return text(`Found ${matches.length} match(es):\n\n${lines.join('\n')}`);
  }
};

export const getUser: ToolDefinition = {
  title: 'Slack: Get User',
  description:
    'Look up a Slack user by user ID (users.info) OR by email (users.lookupByEmail). Pass exactly ONE of `userId` or `email`. Returns the user ID, display name, real name, email (if visible to the token), bot flag, deleted flag, and status. Use to translate a mention or email into a Slack ID before composing a DM, or to confirm an account is still active.',
  schema: {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'Slack user ID (U… or W…). Mutually exclusive with email.'
      },
      email: {
        type: 'string',
        description:
          "User's email address. Mutually exclusive with userId. Requires users:read.email."
      }
    }
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    if (!args.userId && !args.email) {
      return text('Error: pass either userId or email.');
    }
    if (args.userId && args.email) {
      return text('Error: pass userId OR email, not both.');
    }

    const res = args.email
      ? await slackFetch(auth.token, 'GET', '/users.lookupByEmail', {
          email: String(args.email)
        })
      : await slackFetch(auth.token, 'GET', '/users.info', {
          user: String(args.userId)
        });
    if (!res.ok) return text(`Error looking up user: ${slackError(res)}`);

    const u = res.user as
      | {
          id?: string;
          name?: string;
          real_name?: string;
          deleted?: boolean;
          is_bot?: boolean;
          is_admin?: boolean;
          profile?: {
            email?: string;
            display_name?: string;
            status_text?: string;
            title?: string;
          };
        }
      | undefined;
    if (!u) return text('Error: user payload missing in Slack response.');

    return text(
      [
        `User ID: ${u.id ?? 'unknown'}`,
        `Username: ${u.name ?? 'unknown'}`,
        `Real name: ${u.real_name ?? u.profile?.display_name ?? 'unknown'}`,
        `Email: ${u.profile?.email ?? '(not visible to this token)'}`,
        u.profile?.title ? `Title: ${u.profile.title}` : null,
        u.profile?.status_text ? `Status: ${u.profile.status_text}` : null,
        `Bot: ${u.is_bot ? 'yes' : 'no'}`,
        `Admin: ${u.is_admin ? 'yes' : 'no'}`,
        `Deleted: ${u.deleted ? 'yes' : 'no'}`
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
};

export const uploadFile: ToolDefinition = {
  title: 'Slack: Upload File',
  description:
    "Upload a file from an Anju resource to Slack and share it in the given channel via Slack's external-upload flow (files.getUploadURLExternal + completeUploadExternal). Pass `resourceUri` (from list-resources / search-resources), the destination `channel`, and optionally an `initialComment` (message body posted alongside the file) and `threadTs` to drop the file inside an existing thread. Per-file cap is 100MB. Returns the new file ID and a permalink. Use this — not slack-send-message — when the user wants to share a document/image, not just text.",
  schema: {
    type: 'object',
    properties: {
      channel: {
        type: 'string',
        description: 'Destination channel ID (C…/G…/D…) or name (#general).'
      },
      resourceUri: {
        type: 'string',
        description:
          'Anju resource URI (from list-resources or search-resources) to upload.'
      },
      title: {
        type: 'string',
        description:
          "Optional title shown in Slack's file viewer. Defaults to the resource filename."
      },
      initialComment: {
        type: 'string',
        description:
          'Optional message body posted in-channel alongside the file. Slack mrkdwn formatting.'
      },
      threadTs: {
        type: 'string',
        description:
          'Optional parent message ts to upload the file inside an existing thread.'
      }
    },
    required: ['channel', 'resourceUri']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const sent = await sendViaContainer(
      context,
      {
        accessToken: auth.token,
        operation: 'upload-file',
        channel: String(args.channel),
        title: args.title ? String(args.title) : undefined,
        initialComment: args.initialComment
          ? String(args.initialComment)
          : undefined,
        threadTs: args.threadTs ? String(args.threadTs) : undefined
      },
      String(args.resourceUri)
    );
    if (!sent.ok) return text(`Error uploading file: ${sent.error}`);

    const linkNote = sent.result.permalink ? ` (${sent.result.permalink})` : '';
    return text(
      `File uploaded to ${sent.result.channel || args.channel}. File ID: ${sent.result.id}${linkNote}`
    );
  }
};
