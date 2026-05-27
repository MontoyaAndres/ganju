import { utils } from '@anju/utils';
import type { OutlookSendRequest, OutlookSendResponse } from '@anju/utils';
import { getResourceHandler } from '@anju/containers';

import { ToolContext, ToolDefinition } from '../types';

const GRAPH_BASE = utils.constants.MICROSOFT_GRAPH_API_BASE;

type ToolResult = { content: Array<{ type: 'text'; text: string }> };

const text = (value: string): ToolResult => ({
  content: [{ type: 'text', text: value }]
});

interface GraphRecipient {
  emailAddress?: { name?: string; address?: string };
}

interface GraphMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  body?: { contentType?: 'html' | 'text'; content?: string };
  parentFolderId?: string;
}

interface GraphFolder {
  id: string;
  displayName: string;
  parentFolderId?: string;
  totalItemCount?: number;
  unreadItemCount?: number;
  wellKnownName?: string;
}

const getAccessToken = (
  context: ToolContext
): { ok: true; token: string } | { ok: false; response: ToolResult } => {
  const credential = context.credentials[0];
  if (!credential) {
    return {
      ok: false,
      response: text('Error: Microsoft Outlook credential not connected')
    };
  }
  return { ok: true, token: credential.accessToken };
};

const graphFetch = async (
  token: string,
  path: string,
  init?: RequestInit
): Promise<Response> => {
  const url = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...((init?.headers as Record<string, string>) || {})
  };
  if (init?.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, { ...init, headers });
};

const formatRecipient = (r: GraphRecipient | undefined): string => {
  if (!r?.emailAddress) return 'unknown';
  const { name, address } = r.emailAddress;
  if (name && address) return `${name} <${address}>`;
  return address || name || 'unknown';
};

const formatRecipients = (rs: GraphRecipient[] | undefined): string =>
  (rs || []).map(formatRecipient).join(', ');

const stripHtml = (html: string): string =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const extractBodyText = (
  body: GraphMessage['body']
): { text: string; contentType: string } => {
  if (!body?.content) return { text: '', contentType: '' };
  if (body.contentType === 'html') {
    return { text: stripHtml(body.content), contentType: 'text/html' };
  }
  return { text: body.content, contentType: 'text/plain' };
};

// All write operations route through the resource-handler container so the
// upload-session flow for >3MB attachments has the memory + CPU headroom it
// needs. The container also handles the create-reply/forward → patch body →
// send dance, keeping the Worker-side handler thin.
const sendViaContainer = async (
  context: ToolContext,
  request: OutlookSendRequest,
  attachmentUris: string[]
): Promise<
  { ok: true; result: OutlookSendResponse } | { ok: false; error: string }
> => {
  const form = new FormData();
  form.append('metadata', JSON.stringify(request));

  let totalRaw = 0;
  for (const uri of attachmentUris) {
    const resource = context.resources.find(r => r.uri === uri);
    if (!resource) return { ok: false, error: `Resource not found: ${uri}` };

    let arrayBuffer: ArrayBuffer;
    let mimeType: string;
    let filename: string;

    if (resource.fileKey) {
      const obj = await context.bucket.get(resource.fileKey);
      if (!obj) {
        return {
          ok: false,
          error: `Resource bytes missing in storage for ${uri} (fileKey: ${resource.fileKey})`
        };
      }
      arrayBuffer = await obj.arrayBuffer();
      mimeType =
        resource.mimeType || utils.constants.MIMETYPE_APPLICATION_OCTET_STREAM;
      filename =
        resource.fileName ||
        resource.title ||
        uri.split('/').pop() ||
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
        error: `Resource ${uri} has no inline content and no file in storage; cannot attach.`
      };
    }

    totalRaw += arrayBuffer.byteLength;
    if (arrayBuffer.byteLength > utils.constants.OUTLOOK_MAX_ATTACHMENT_BYTES) {
      return {
        ok: false,
        error: `Attachment ${filename} exceeds Outlook's ${Math.round(utils.constants.OUTLOOK_MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB per-file cap.`
      };
    }

    form.append(
      'attachment',
      new Blob([arrayBuffer], { type: mimeType }),
      filename
    );
  }

  // Outlook's practical per-message cap. Graph rejects combined >150MB.
  if (totalRaw > utils.constants.OUTLOOK_MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      error: `Combined attachments exceed Outlook's ${Math.round(utils.constants.OUTLOOK_MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB cap.`
    };
  }

  const handler = getResourceHandler(context.env);
  const response = await handler.fetch('http://resource-handler/outlook/send', {
    method: 'POST',
    body: form
  });

  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    return {
      ok: false,
      error: errBody.error || `Outlook send failed (${response.status})`
    };
  }

  const result = (await response.json()) as OutlookSendResponse;
  return { ok: true, result };
};

export const sendEmail: ToolDefinition = {
  title: 'Outlook: Send Email',
  description:
    "Send a brand-new email from the connected Outlook (Microsoft 365) account. Use only when starting a fresh thread; to continue an existing conversation use outlook-reply-email so threading and conversationId are preserved. Body is treated as HTML by default — pass contentType='text' for plain text. Pass attachmentUris (URIs from list-resources or search-resources) to attach files; individual files >150MB are rejected, and files >3MB are uploaded via Graph's chunked upload session. Returns the resulting message ID and conversation ID (empty ID is returned when Graph 202s sendMail without saveToSentItems metadata).",
  schema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient email address.' },
      subject: { type: 'string', description: 'Email subject line.' },
      body: {
        type: 'string',
        description:
          'Email body. HTML by default; pass contentType="text" for plain text.'
      },
      cc: {
        type: 'string',
        description: 'Optional Cc recipient(s), comma-separated.'
      },
      bcc: {
        type: 'string',
        description: 'Optional Bcc recipient(s), comma-separated.'
      },
      contentType: {
        type: 'string',
        enum: ['html', 'text'],
        description: 'Body content type. Defaults to "html".'
      },
      attachmentUris: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional list of resource URIs (from list-resources or search-resources) to attach as files. Per-file cap is 150MB.'
      }
    },
    required: ['to', 'subject', 'body']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const uris = utils.toStringArray(args.attachmentUris);
    const sent = await sendViaContainer(
      context,
      {
        accessToken: auth.token,
        operation: 'send-email',
        to: String(args.to),
        subject: String(args.subject),
        body: String(args.body),
        cc: args.cc ? String(args.cc) : undefined,
        bcc: args.bcc ? String(args.bcc) : undefined,
        contentType: args.contentType === 'text' ? 'text' : 'html'
      },
      uris
    );
    if (!sent.ok) return text(`Error sending email: ${sent.error}`);

    const attachNote = uris.length ? ` with ${uris.length} attachment(s)` : '';
    const idNote = sent.result.id
      ? `Message ID: ${sent.result.id}`
      : 'Sent (no message ID returned by Graph)';
    const convoNote = sent.result.conversationId
      ? ` (conversation ${sent.result.conversationId})`
      : '';
    return text(`Email sent${attachNote}. ${idNote}${convoNote}`);
  }
};

export const replyEmail: ToolDefinition = {
  title: 'Outlook: Reply',
  description:
    'Reply to an existing Outlook message, preserving its conversation via Graph\'s createReply / createReplyAll flow. Set replyAll=true to include all original recipients. Pass attachmentUris (from list-resources or search-resources) to attach files. Use this — not outlook-send-email — whenever continuing an existing conversation, so the reply lands in the same thread on the recipient side. Returns the new message ID and conversation ID.',
  schema: {
    type: 'object',
    properties: {
      messageId: {
        type: 'string',
        description: 'Outlook message ID being replied to.'
      },
      body: {
        type: 'string',
        description:
          'Reply body. HTML by default; pass contentType="text" for plain text.'
      },
      replyAll: {
        type: 'boolean',
        description:
          'If true, reply to all original recipients (To + Cc). Defaults to false.'
      },
      contentType: {
        type: 'string',
        enum: ['html', 'text'],
        description: 'Body content type. Defaults to "html".'
      },
      attachmentUris: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of resource URIs to attach as files.'
      }
    },
    required: ['messageId', 'body']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const uris = utils.toStringArray(args.attachmentUris);
    const sent = await sendViaContainer(
      context,
      {
        accessToken: auth.token,
        operation: 'reply-email',
        messageId: String(args.messageId),
        body: String(args.body),
        replyAll: args.replyAll === true,
        contentType: args.contentType === 'text' ? 'text' : 'html'
      },
      uris
    );
    if (!sent.ok) return text(`Error sending reply: ${sent.error}`);

    const attachNote = uris.length ? ` with ${uris.length} attachment(s)` : '';
    return text(
      `Reply sent${attachNote}. Message ID: ${sent.result.id} (conversation ${sent.result.conversationId ?? 'unknown'})`
    );
  }
};

export const forwardEmail: ToolDefinition = {
  title: 'Outlook: Forward',
  description:
    "Forward an existing Outlook message to a new recipient via Graph's createForward flow. The forwarded copy starts a new conversation — it does NOT continue the original; use outlook-reply-email for that. Optional intro body is prepended above the quoted original (Graph keeps the quoted original automatically). Use when the user wants to share an email with someone outside the original thread.",
  schema: {
    type: 'object',
    properties: {
      messageId: {
        type: 'string',
        description: 'Outlook message ID to forward.'
      },
      to: { type: 'string', description: 'Recipient email address.' },
      body: {
        type: 'string',
        description:
          'Optional intro text prepended above the quoted forwarded content. HTML by default.'
      },
      cc: { type: 'string', description: 'Optional Cc recipient(s).' },
      contentType: {
        type: 'string',
        enum: ['html', 'text'],
        description: 'Body content type. Defaults to "html".'
      },
      attachmentUris: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of resource URIs to attach as files.'
      }
    },
    required: ['messageId', 'to']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const uris = utils.toStringArray(args.attachmentUris);
    const sent = await sendViaContainer(
      context,
      {
        accessToken: auth.token,
        operation: 'forward-email',
        messageId: String(args.messageId),
        to: String(args.to),
        cc: args.cc ? String(args.cc) : undefined,
        body: args.body ? String(args.body) : '',
        contentType: args.contentType === 'text' ? 'text' : 'html'
      },
      uris
    );
    if (!sent.ok) return text(`Error forwarding email: ${sent.error}`);

    const attachNote = uris.length ? ` with ${uris.length} attachment(s)` : '';
    return text(`Forwarded${attachNote}. Message ID: ${sent.result.id}`);
  }
};

export const listEmails: ToolDefinition = {
  title: 'Outlook: List Emails',
  description:
    'List Outlook inbox messages, optionally filtered with a full-text search query (Graph $search). Examples: "invoice", "from:user@example.com" (note: Graph $search treats the colon as a literal — for field-scoped search prefer outlook-list-folders + folder-scoped read). Returns up to maxResults summary lines (from / subject / received date / message ID), default 10 / max 50. Use for triage; call outlook-read-email with a returned ID to view a specific message in full. For conversation-level browsing prefer outlook-list-threads.',
  schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Optional full-text search query. Leave empty to list recent inbox messages by receivedDateTime.'
      },
      folderId: {
        type: 'string',
        description:
          'Optional folder ID (from outlook-list-folders) to restrict the listing. Defaults to the inbox.'
      },
      maxResults: {
        type: 'number',
        minimum: 1,
        maximum: 50,
        description:
          'Maximum number of messages to return (1-50). Defaults to 10.'
      }
    }
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const requested = Number(args.maxResults) || 10;
    const maxResults = Math.max(1, Math.min(50, requested));

    const params = new URLSearchParams();
    params.set('$top', String(maxResults));
    params.set(
      '$select',
      'id,subject,from,receivedDateTime,bodyPreview,conversationId'
    );
    if (args.query) {
      params.set('$search', `"${String(args.query).replace(/"/g, '\\"')}"`);
    } else {
      params.set('$orderby', 'receivedDateTime desc');
    }

    const folder = args.folderId ? String(args.folderId) : 'inbox';
    const response = await graphFetch(
      auth.token,
      `/me/mailFolders/${encodeURIComponent(folder)}/messages?${params.toString()}`,
      // Graph requires the eventual consistency hint when $search is used.
      args.query
        ? { headers: { ConsistencyLevel: 'eventual' } }
        : undefined
    );
    if (!response.ok)
      return text(
        `Error listing emails: ${await utils.parseHttpErrorMessage(response)}`
      );

    const data = (await response.json()) as { value?: GraphMessage[] };
    const messages = data.value || [];
    if (messages.length === 0) return text('No emails found.');

    const lines = messages.map(
      m =>
        `- From: ${formatRecipient(m.from)} | Subject: ${m.subject || '(no subject)'} | Date: ${m.receivedDateTime || 'unknown'} | ID: ${m.id}`
    );
    return text(`Found ${messages.length} email(s):\n\n${lines.join('\n')}`);
  }
};

export const readEmail: ToolDefinition = {
  title: 'Outlook: Read Email',
  description:
    'Read the full contents of one Outlook message by ID — from / to / cc / subject / date / conversationId and the decoded body. HTML bodies are stripped to plain text for the model. Use after outlook-list-emails returns a candidate ID. To read every message in a conversation, prefer outlook-get-thread to scan summaries first and then call this for the specific message you want to dig into.',
  schema: {
    type: 'object',
    properties: {
      messageId: { type: 'string', description: 'Outlook message ID.' }
    },
    required: ['messageId']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const params = new URLSearchParams();
    params.set(
      '$select',
      'id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,conversationId,body'
    );

    const response = await graphFetch(
      auth.token,
      `/me/messages/${encodeURIComponent(String(args.messageId))}?${params.toString()}`
    );
    if (!response.ok)
      return text(
        `Error reading email: ${await utils.parseHttpErrorMessage(response)}`
      );

    const detail = (await response.json()) as GraphMessage;
    const body = extractBodyText(detail.body);

    const out = [
      `From: ${formatRecipient(detail.from)}`,
      `To: ${formatRecipients(detail.toRecipients) || 'unknown'}`,
      detail.ccRecipients?.length
        ? `Cc: ${formatRecipients(detail.ccRecipients)}`
        : null,
      `Subject: ${detail.subject || '(no subject)'}`,
      `Date: ${detail.receivedDateTime || detail.sentDateTime || 'unknown'}`,
      `Conversation ID: ${detail.conversationId || 'unknown'}`,
      body.contentType ? `Body MIME: ${body.contentType}` : null,
      '',
      body.text || '(no text content)'
    ]
      .filter(Boolean)
      .join('\n');

    return text(out);
  }
};

export const trashEmail: ToolDefinition = {
  title: 'Outlook: Move to Trash',
  description:
    "Move an Outlook message to Deleted Items. Reversible — restore from the Deleted Items folder until Outlook purges it. Idempotent: calling on an already-trashed message returns 404 from Graph and is reported as an error. Returns confirmation with the message ID. Prefer this whenever the user asks to 'delete' an email.",
  schema: {
    type: 'object',
    properties: {
      messageId: {
        type: 'string',
        description: 'Outlook message ID to move to Deleted Items.'
      }
    },
    required: ['messageId']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const response = await graphFetch(
      auth.token,
      `/me/messages/${encodeURIComponent(String(args.messageId))}/move`,
      {
        method: 'POST',
        body: JSON.stringify({ destinationId: 'deleteditems' })
      }
    );
    if (!response.ok)
      return text(
        `Error trashing email: ${await utils.parseHttpErrorMessage(response)}`
      );

    return text(`Email ${args.messageId} moved to Deleted Items.`);
  }
};

export const listFolders: ToolDefinition = {
  title: 'Outlook: List Folders',
  description:
    'List every mail folder on the Outlook account, including well-known system folders (inbox, drafts, sentitems, deleteditems, junkemail, archive) and user-created folders. Returns name, total/unread counts, and the folder ID for each. Call this first to discover the IDs you need before invoking outlook-move-message or scoping outlook-list-emails / outlook-list-drafts to a specific folder.',
  schema: { type: 'object', properties: {} },
  handler: async (_args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const response = await graphFetch(
      auth.token,
      '/me/mailFolders?$top=200&$select=id,displayName,parentFolderId,totalItemCount,unreadItemCount,wellKnownName'
    );
    if (!response.ok)
      return text(
        `Error listing folders: ${await utils.parseHttpErrorMessage(response)}`
      );

    const data = (await response.json()) as { value?: GraphFolder[] };
    const folders = data.value || [];
    if (folders.length === 0) return text('No folders found.');

    const lines = folders.map(f => {
      const counts = `total ${f.totalItemCount ?? '?'}, unread ${f.unreadItemCount ?? '?'}`;
      const wkn = f.wellKnownName ? ` (system: ${f.wellKnownName})` : '';
      return `- ${f.displayName}${wkn} [${counts}] [${f.id}]`;
    });
    return text(lines.join('\n'));
  }
};

export const moveMessage: ToolDefinition = {
  title: 'Outlook: Move Message',
  description:
    'Move a single Outlook message to a different folder. Common operations: archive = move to the "archive" well-known folder; mark spam = move to "junkemail"; restore from trash = move out of "deleteditems" back to "inbox" or a user folder. Pass either a well-known name (inbox, drafts, sentitems, deleteditems, junkemail, archive) or a folder ID from outlook-list-folders. For >10 messages prefer outlook-batch-move-messages.',
  schema: {
    type: 'object',
    properties: {
      messageId: { type: 'string', description: 'Outlook message ID to move.' },
      destinationId: {
        type: 'string',
        description:
          'Target folder. Either a well-known name (inbox, drafts, sentitems, deleteditems, junkemail, archive) or a folder ID from outlook-list-folders.'
      }
    },
    required: ['messageId', 'destinationId']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const response = await graphFetch(
      auth.token,
      `/me/messages/${encodeURIComponent(String(args.messageId))}/move`,
      {
        method: 'POST',
        body: JSON.stringify({ destinationId: String(args.destinationId) })
      }
    );
    if (!response.ok)
      return text(
        `Error moving message: ${await utils.parseHttpErrorMessage(response)}`
      );

    return text(
      `Message ${args.messageId} moved to folder ${args.destinationId}.`
    );
  }
};

export const batchMoveMessages: ToolDefinition = {
  title: 'Outlook: Batch Move Messages',
  description:
    'Move up to 20 Outlook messages to the same destination folder in one call. Graph has no native batch endpoint for /move, so this loops the per-message call under the hood — still cheaper than the model invoking outlook-move-message in a loop. Same destination semantics as outlook-move-message. Returns success/failure counts.',
  schema: {
    type: 'object',
    properties: {
      messageIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Outlook message IDs to move (max 20 per call).'
      },
      destinationId: {
        type: 'string',
        description:
          'Target folder. Either a well-known name or a folder ID from outlook-list-folders.'
      }
    },
    required: ['messageIds', 'destinationId']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const ids = utils.toStringArray(args.messageIds).slice(0, 20);
    if (ids.length === 0) return text('Error: messageIds is empty.');

    const destinationId = String(args.destinationId);
    const results = await Promise.all(
      ids.map(async id => {
        const res = await graphFetch(
          auth.token,
          `/me/messages/${encodeURIComponent(id)}/move`,
          { method: 'POST', body: JSON.stringify({ destinationId }) }
        );
        return { id, ok: res.ok, status: res.status };
      })
    );
    const ok = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok);
    const failNote = failed.length
      ? `\nFailed: ${failed.map(f => `${f.id} (HTTP ${f.status})`).join(', ')}`
      : '';
    return text(
      `Moved ${ok}/${ids.length} message(s) to ${destinationId}.${failNote}`
    );
  }
};

export const listThreads: ToolDefinition = {
  title: 'Outlook: List Threads',
  description:
    "List Outlook conversation threads in the inbox, optionally filtered by search. Returns one entry per unique conversationId (the most recent message of each thread) with the thread's conversationId, last subject, last sender, and last receivedDateTime. Use this when the user is asking about an ongoing back-and-forth, then call outlook-get-thread with the conversationId to drill in. Prefer outlook-list-emails when the user is asking about individual messages rather than conversations.",
  schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Optional full-text search query.' },
      maxResults: {
        type: 'number',
        minimum: 1,
        maximum: 50,
        description:
          'Maximum number of threads to return (1-50). Defaults to 10. Graph is queried for ~3x messages to dedupe by conversationId.'
      }
    }
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const requested = Number(args.maxResults) || 10;
    const maxThreads = Math.max(1, Math.min(50, requested));
    // Outlook has no thread-list endpoint; we pull recent messages and dedupe
    // on conversationId. Over-fetch so a few threads with multiple recent
    // messages don't crowd the result down to <maxThreads unique threads.
    const fetchCount = Math.min(150, maxThreads * 3);

    const params = new URLSearchParams();
    params.set('$top', String(fetchCount));
    params.set(
      '$select',
      'id,subject,from,receivedDateTime,bodyPreview,conversationId'
    );
    if (args.query) {
      params.set('$search', `"${String(args.query).replace(/"/g, '\\"')}"`);
    } else {
      params.set('$orderby', 'receivedDateTime desc');
    }

    const response = await graphFetch(
      auth.token,
      `/me/mailFolders/inbox/messages?${params.toString()}`,
      args.query ? { headers: { ConsistencyLevel: 'eventual' } } : undefined
    );
    if (!response.ok)
      return text(
        `Error listing threads: ${await utils.parseHttpErrorMessage(response)}`
      );

    const data = (await response.json()) as { value?: GraphMessage[] };
    const messages = data.value || [];
    if (messages.length === 0) return text('No threads found.');

    const seen = new Map<string, GraphMessage>();
    for (const m of messages) {
      if (!m.conversationId) continue;
      if (!seen.has(m.conversationId)) seen.set(m.conversationId, m);
      if (seen.size >= maxThreads) break;
    }

    const lines = Array.from(seen.values()).map(
      m =>
        `- Thread ${m.conversationId} :: ${m.subject || '(no subject)'} — last from ${formatRecipient(m.from)} at ${m.receivedDateTime || 'unknown'} :: ${m.bodyPreview?.slice(0, 120) || ''}`
    );
    return text(
      `Found ${seen.size} thread(s):\n\n${lines.join('\n')}`
    );
  }
};

export const getThread: ToolDefinition = {
  title: 'Outlook: Get Thread',
  description:
    'Get a per-message summary of every message in an Outlook conversation (conversationId from outlook-list-threads or returned by outlook-read-email). Returns one line per message with date / from / subject / snippet plus the message ID. Does NOT return full bodies — call outlook-read-email afterwards with a specific message ID when you need the full content. Use this to scan a conversation cheaply.',
  schema: {
    type: 'object',
    properties: {
      conversationId: {
        type: 'string',
        description:
          'Outlook conversation ID (from outlook-list-threads or outlook-read-email).'
      }
    },
    required: ['conversationId']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const params = new URLSearchParams();
    params.set(
      '$filter',
      `conversationId eq '${String(args.conversationId).replace(/'/g, "''")}'`
    );
    params.set('$top', '100');
    params.set('$orderby', 'receivedDateTime asc');
    params.set(
      '$select',
      'id,subject,from,toRecipients,receivedDateTime,bodyPreview'
    );

    const response = await graphFetch(
      auth.token,
      `/me/messages?${params.toString()}`
    );
    if (!response.ok)
      return text(
        `Error loading thread: ${await utils.parseHttpErrorMessage(response)}`
      );

    const data = (await response.json()) as { value?: GraphMessage[] };
    const messages = data.value || [];
    if (messages.length === 0) return text('Thread has no messages.');

    const lines = messages.map((m, i) => {
      return `${i + 1}. [${m.id}] ${m.receivedDateTime || ''} — From: ${formatRecipient(m.from)} — Subject: ${m.subject || '(no subject)'}\n   Snippet: ${m.bodyPreview || ''}`;
    });

    return text(
      `Thread ${args.conversationId} — ${messages.length} message(s):\n\n${lines.join('\n\n')}`
    );
  }
};

export const createDraft: ToolDefinition = {
  title: 'Outlook: Create Draft',
  description:
    "Create a draft email saved in Outlook's Drafts folder. The draft is NOT sent — call outlook-send-draft when the user is ready, outlook-update-draft to revise, or outlook-delete-draft to abandon. Pass attachmentUris (from list-resources or search-resources) to attach files; >3MB files are uploaded via Graph's chunked upload session. Use whenever the user wants to compose now and review/send later, or whenever you are unsure if the user actually wants to send. Returns the draft ID.",
  schema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient email address.' },
      subject: { type: 'string', description: 'Email subject line.' },
      body: {
        type: 'string',
        description: 'Email body. HTML by default.'
      },
      cc: { type: 'string', description: 'Optional Cc recipient(s).' },
      bcc: { type: 'string', description: 'Optional Bcc recipient(s).' },
      contentType: {
        type: 'string',
        enum: ['html', 'text'],
        description: 'Body content type. Defaults to "html".'
      },
      attachmentUris: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of resource URIs to attach as files.'
      }
    },
    required: ['to', 'subject', 'body']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const uris = utils.toStringArray(args.attachmentUris);
    const sent = await sendViaContainer(
      context,
      {
        accessToken: auth.token,
        operation: 'create-draft',
        to: String(args.to),
        subject: String(args.subject),
        body: String(args.body),
        cc: args.cc ? String(args.cc) : undefined,
        bcc: args.bcc ? String(args.bcc) : undefined,
        contentType: args.contentType === 'text' ? 'text' : 'html'
      },
      uris
    );
    if (!sent.ok) return text(`Error creating draft: ${sent.error}`);

    const attachNote = uris.length ? ` with ${uris.length} attachment(s)` : '';
    return text(`Draft created${attachNote}. Draft ID: ${sent.result.id}`);
  }
};

export const listDrafts: ToolDefinition = {
  title: 'Outlook: List Drafts',
  description:
    "List drafts saved in Outlook's Drafts folder, up to maxResults (default 10, max 50). Returns draft message ID, recipient, subject, and last modified time for each. Use to find a draft to send (outlook-send-draft), edit (outlook-update-draft), inspect (outlook-get-draft), or delete (outlook-delete-draft).",
  schema: {
    type: 'object',
    properties: {
      maxResults: {
        type: 'number',
        minimum: 1,
        maximum: 50,
        description:
          'Maximum number of drafts to return (1-50). Defaults to 10.'
      }
    }
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const requested = Number(args.maxResults) || 10;
    const maxResults = Math.max(1, Math.min(50, requested));

    const params = new URLSearchParams();
    params.set('$top', String(maxResults));
    params.set('$orderby', 'lastModifiedDateTime desc');
    params.set('$select', 'id,subject,toRecipients,lastModifiedDateTime');

    const response = await graphFetch(
      auth.token,
      `/me/mailFolders/drafts/messages?${params.toString()}`
    );
    if (!response.ok)
      return text(
        `Error listing drafts: ${await utils.parseHttpErrorMessage(response)}`
      );

    const data = (await response.json()) as {
      value?: Array<GraphMessage & { lastModifiedDateTime?: string }>;
    };
    const drafts = data.value || [];
    if (drafts.length === 0) return text('No drafts found.');

    const lines = drafts.map(
      d =>
        `- Draft ${d.id} -> To: ${formatRecipients(d.toRecipients) || 'unset'} | Subject: ${d.subject || '(no subject)'} | Last modified: ${d.lastModifiedDateTime || 'unknown'}`
    );
    return text(`Found ${drafts.length} draft(s):\n\n${lines.join('\n')}`);
  }
};

export const getDraft: ToolDefinition = {
  title: 'Outlook: Get Draft',
  description:
    'Read the full contents of a draft by its draft (message) ID — recipient, cc, subject, and decoded body. Use to confirm exactly what will be sent before calling outlook-send-draft, especially for drafts the user wrote earlier and may want to verify.',
  schema: {
    type: 'object',
    properties: {
      draftId: {
        type: 'string',
        description: 'Outlook draft (message) ID.'
      }
    },
    required: ['draftId']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const params = new URLSearchParams();
    params.set(
      '$select',
      'id,subject,toRecipients,ccRecipients,bccRecipients,body,lastModifiedDateTime,conversationId'
    );

    const response = await graphFetch(
      auth.token,
      `/me/messages/${encodeURIComponent(String(args.draftId))}?${params.toString()}`
    );
    if (!response.ok)
      return text(
        `Error reading draft: ${await utils.parseHttpErrorMessage(response)}`
      );

    const detail = (await response.json()) as GraphMessage & {
      lastModifiedDateTime?: string;
      bccRecipients?: GraphRecipient[];
    };
    const body = extractBodyText(detail.body);

    const out = [
      `Draft ID: ${detail.id}`,
      `To: ${formatRecipients(detail.toRecipients) || 'unset'}`,
      detail.ccRecipients?.length
        ? `Cc: ${formatRecipients(detail.ccRecipients)}`
        : null,
      detail.bccRecipients?.length
        ? `Bcc: ${formatRecipients(detail.bccRecipients)}`
        : null,
      `Subject: ${detail.subject || '(no subject)'}`,
      `Last modified: ${detail.lastModifiedDateTime || 'unknown'}`,
      body.contentType ? `Body MIME: ${body.contentType}` : null,
      '',
      body.text || '(no text content)'
    ]
      .filter(Boolean)
      .join('\n');
    return text(out);
  }
};

export const updateDraft: ToolDefinition = {
  title: 'Outlook: Update Draft',
  description:
    "Replace the contents of an existing Outlook draft. Body, subject, and recipients you pass overwrite the previous draft. If you pass attachmentUris, every existing attachment is deleted and replaced with the new list — omit attachmentUris (don't pass an empty array) to leave existing attachments untouched. Use after outlook-get-draft when the user requests changes. Does NOT send the draft (use outlook-send-draft for that).",
  schema: {
    type: 'object',
    properties: {
      draftId: {
        type: 'string',
        description: 'Outlook draft (message) ID to update.'
      },
      to: { type: 'string', description: 'Recipient email address.' },
      subject: { type: 'string', description: 'Email subject line.' },
      body: { type: 'string', description: 'Email body. HTML by default.' },
      cc: { type: 'string', description: 'Optional Cc recipient(s).' },
      bcc: { type: 'string', description: 'Optional Bcc recipient(s).' },
      contentType: {
        type: 'string',
        enum: ['html', 'text'],
        description: 'Body content type. Defaults to "html".'
      },
      attachmentUris: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional list of resource URIs to attach. If provided, replaces all prior attachments on the draft. Omit to leave existing attachments untouched.'
      }
    },
    required: ['draftId', 'to', 'subject', 'body']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const uris = utils.toStringArray(args.attachmentUris);
    const sent = await sendViaContainer(
      context,
      {
        accessToken: auth.token,
        operation: 'update-draft',
        draftId: String(args.draftId),
        to: String(args.to),
        subject: String(args.subject),
        body: String(args.body),
        cc: args.cc ? String(args.cc) : undefined,
        bcc: args.bcc ? String(args.bcc) : undefined,
        contentType: args.contentType === 'text' ? 'text' : 'html'
      },
      uris
    );
    if (!sent.ok) return text(`Error updating draft: ${sent.error}`);

    const attachNote = uris.length
      ? ` (with ${uris.length} attachment(s) — prior attachments cleared)`
      : ' (existing attachments left as-is)';
    return text(`Draft ${args.draftId} updated${attachNote}.`);
  }
};

export const deleteDraft: ToolDefinition = {
  title: 'Outlook: Delete Draft',
  description:
    'Permanently delete an Outlook draft (the unsent draft itself — NOT a sent message). The draft is removed immediately, not moved to Deleted Items. Use only when the user has explicitly abandoned a draft. To send the draft instead, use outlook-send-draft. To move an already-sent message to Deleted Items, use outlook-trash-email.',
  schema: {
    type: 'object',
    properties: {
      draftId: {
        type: 'string',
        description: 'Outlook draft (message) ID to delete.'
      }
    },
    required: ['draftId']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const response = await graphFetch(
      auth.token,
      `/me/messages/${encodeURIComponent(String(args.draftId))}`,
      { method: 'DELETE' }
    );
    if (!response.ok)
      return text(
        `Error deleting draft: ${await utils.parseHttpErrorMessage(response)}`
      );

    return text(`Draft ${args.draftId} deleted.`);
  }
};

export const sendDraft: ToolDefinition = {
  title: 'Outlook: Send Draft',
  description:
    'Send an existing Outlook draft as-is. The draft is moved out of Drafts and delivered to its recipient(s). Returns confirmation. Prefer this over outlook-send-email when the user has already drafted the message and is asking to "send it now".',
  schema: {
    type: 'object',
    properties: {
      draftId: {
        type: 'string',
        description: 'Outlook draft (message) ID to send.'
      }
    },
    required: ['draftId']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const response = await graphFetch(
      auth.token,
      `/me/messages/${encodeURIComponent(String(args.draftId))}/send`,
      { method: 'POST' }
    );
    if (!response.ok)
      return text(
        `Error sending draft: ${await utils.parseHttpErrorMessage(response)}`
      );

    return text(`Draft ${args.draftId} sent.`);
  }
};

export const getProfile: ToolDefinition = {
  title: 'Outlook: Get Profile',
  description:
    "Get the connected Outlook account's profile: display name, email address (mail), userPrincipalName, and inbox totals. Use to confirm WHICH Outlook account is connected (helpful when the user asks 'what email is this connected to?'), or to capture the user's address for use in a signature or self-reference.",
  schema: { type: 'object', properties: {} },
  handler: async (_args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const meRes = await graphFetch(
      auth.token,
      '/me?$select=displayName,mail,userPrincipalName,id'
    );
    if (!meRes.ok)
      return text(
        `Error loading profile: ${await utils.parseHttpErrorMessage(meRes)}`
      );
    const me = (await meRes.json()) as {
      displayName?: string;
      mail?: string;
      userPrincipalName?: string;
      id?: string;
    };

    const inboxRes = await graphFetch(
      auth.token,
      '/me/mailFolders/inbox?$select=totalItemCount,unreadItemCount'
    );
    const inbox = inboxRes.ok
      ? ((await inboxRes.json()) as {
          totalItemCount?: number;
          unreadItemCount?: number;
        })
      : { totalItemCount: undefined, unreadItemCount: undefined };

    return text(
      [
        `Display name: ${me.displayName ?? 'unknown'}`,
        `Email: ${me.mail ?? me.userPrincipalName ?? 'unknown'}`,
        `User principal name: ${me.userPrincipalName ?? 'unknown'}`,
        `User ID: ${me.id ?? 'unknown'}`,
        `Inbox total: ${inbox.totalItemCount ?? '?'}`,
        `Inbox unread: ${inbox.unreadItemCount ?? '?'}`
      ].join('\n')
    );
  }
};
