import { utils } from '@ganju/utils';
import type { OutlookSendRequest, OutlookSendResponse } from '@ganju/utils';
import { getResourceHandler } from '@ganju/containers';

import { withResourceContent } from '../../utils';
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

    const resolved = await utils.resolveAttachment(
      resource.fileKey
        ? resource
        : await withResourceContent(context.db, resource),
      async key => {
        const obj = await context.bucket.get(key);
        return obj ? await obj.arrayBuffer() : null;
      }
    );
    if (!resolved.ok) return { ok: false, error: resolved.error };

    const { bytes, mimeType, filename } = resolved.attachment;

    totalRaw += bytes.byteLength;
    if (bytes.byteLength > utils.constants.OUTLOOK_MAX_ATTACHMENT_BYTES) {
      return {
        ok: false,
        error: `Attachment ${filename} exceeds Outlook's ${Math.round(utils.constants.OUTLOOK_MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB per-file cap.`
      };
    }

    form.append('attachment', new Blob([bytes], { type: mimeType }), filename);
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
    const errBody = await response.json().catch(() => null);
    return {
      ok: false,
      error: utils.describeVendorError(
        errBody,
        `Outlook send failed (${response.status})`
      )
    };
  }

  const result = (await response.json()) as OutlookSendResponse;
  return { ok: true, result };
};

export const sendEmail: ToolDefinition = {
  title: 'Outlook: Send Email',
  description:
    'Send a new email, starting a new conversation. To answer an existing email use outlook-reply-email instead, so it stays in the same conversation. If you are not sure the user wants it sent now, use outlook-create-draft.',
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
    'Reply to a message in its existing conversation (replyAll=true includes all original recipients). Use this, not outlook-send-email, whenever continuing a conversation.',
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
    'Forward a message to someone new, with an optional intro above it. Starts a new conversation; to continue the original use outlook-reply-email.',
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
    'List messages (from, subject, date, ID), optionally with a full-text search. Field operators like "from:" are matched as literal text, not as filters. Open one with outlook-read-email; for conversations use outlook-list-threads.',
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
      args.query ? { headers: { ConsistencyLevel: 'eventual' } } : undefined
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
    'Read one message in full by ID (from outlook-list-emails or outlook-get-thread).',
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
    'Move a message to Deleted Items, where it can still be restored. Use this when the user asks to delete an email.',
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
    'List all mail folders with their IDs and unread counts, including inbox, archive, junkemail and deleteditems. Use to find a folder for outlook-move-message or outlook-list-emails.',
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
    'Move one message to another folder: archive = "archive", spam = "junkemail", restore = move out of "deleteditems". For more than a few messages use outlook-batch-move-messages.',
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
  description: 'Move up to 20 messages to the same folder in one call.',
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
    'List conversations (conversation ID, latest subject and sender). Open one with outlook-get-thread. For individual messages use outlook-list-emails.',
  schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Optional full-text search query.'
      },
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
    return text(`Found ${seen.size} thread(s):\n\n${lines.join('\n')}`);
  }
};

export const getThread: ToolDefinition = {
  title: 'Outlook: Get Thread',
  description:
    'Summarize every message in a conversation (date, from, subject, snippet, message ID) without full bodies; then read one with outlook-read-email.',
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
    'Save an email as a draft without sending it. Use when the user wants to review first, or when you are unsure they want it sent; send later with outlook-send-draft.',
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
    'List drafts with their IDs, recipients, subjects and last-modified times.',
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
    'Read a draft in full by ID, e.g. to confirm what will be sent before outlook-send-draft.',
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
    'Change a draft: the fields you pass overwrite the old ones. Passing attachmentUris replaces every attachment; omit it to keep them. Does not send it.',
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
    'Permanently delete an unsent draft; it does not go to Deleted Items. Only when the user has abandoned it. For a sent email use outlook-trash-email.',
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
    'Send an existing draft as it is. Use when the user has a draft ready and says to send it.',
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
    "Get the connected Outlook account's name, address and inbox counts — e.g. when asked which account is connected.",
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
