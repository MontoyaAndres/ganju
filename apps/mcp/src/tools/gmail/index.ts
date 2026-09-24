import { utils } from '@ganju/utils';
import type { GmailSendRequest, GmailSendResponse } from '@ganju/utils';
import { getResourceHandler } from '@ganju/containers';

import { withResourceContent } from '../../utils';
import { ToolContext, ToolDefinition } from '../types';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

type ToolResult = { content: Array<{ type: 'text'; text: string }> };

const text = (value: string): ToolResult => ({
  content: [{ type: 'text', text: value }]
});

interface GmailPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: Array<{ name: string; value: string }>;
}

const findPartByMime = (
  part: GmailPart | undefined,
  target: string
): GmailPart | null => {
  if (!part) return null;
  if (part.mimeType === target && part.body?.data) return part;
  for (const sub of part.parts || []) {
    const found = findPartByMime(sub, target);
    if (found) return found;
  }
  return null;
};

const extractBodyText = (
  payload: GmailPart | undefined
): { text: string; mimeType: string } => {
  if (!payload) return { text: '', mimeType: '' };

  const plain = findPartByMime(payload, 'text/plain');
  if (plain?.body?.data) {
    return {
      text: utils.base64UrlToUtf8(plain.body.data),
      mimeType: 'text/plain'
    };
  }

  const html = findPartByMime(payload, 'text/html');
  if (html?.body?.data) {
    return {
      text: utils.base64UrlToUtf8(html.body.data),
      mimeType: 'text/html'
    };
  }

  if (payload.body?.data) {
    return {
      text: utils.base64UrlToUtf8(payload.body.data),
      mimeType: payload.mimeType || ''
    };
  }

  return { text: '', mimeType: '' };
};

const parseHeaders = (
  headers: Array<{ name: string; value: string }> | undefined
): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const h of headers || []) map[h.name.toLowerCase()] = h.value;
  return map;
};

const getAccessToken = (
  context: ToolContext
): { ok: true; token: string } | { ok: false; response: ToolResult } => {
  const credential = context.credentials[0];
  if (!credential) {
    return {
      ok: false,
      response: text('Error: Google credential not connected')
    };
  }
  return { ok: true, token: credential.accessToken };
};

const gmailFetch = async (
  token: string,
  path: string,
  init?: RequestInit
): Promise<Response> => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...((init?.headers as Record<string, string>) || {})
  };
  if (init?.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(`${GMAIL_API_BASE}${path}`, { ...init, headers });
};

const sendViaContainer = async (
  context: ToolContext,
  request: GmailSendRequest,
  attachmentUris: string[]
): Promise<
  { ok: true; result: GmailSendResponse } | { ok: false; error: string }
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
    if (totalRaw > utils.constants.GMAIL_MAX_RAW_ATTACHMENT_BYTES) {
      return {
        ok: false,
        error: `Attachments exceed Gmail's ${Math.round(utils.constants.GMAIL_MAX_RAW_ATTACHMENT_BYTES / (1024 * 1024))}MB raw cap.`
      };
    }

    form.append('attachment', new Blob([bytes], { type: mimeType }), filename);
  }

  const handler = getResourceHandler(context.env);
  const response = await handler.fetch('http://resource-handler/gmail/send', {
    method: 'POST',
    body: form
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => null);
    return {
      ok: false,
      error: utils.describeVendorError(
        errBody,
        `Gmail send failed (${response.status})`
      )
    };
  }

  const result = (await response.json()) as GmailSendResponse;
  return { ok: true, result };
};

const fetchMessageMetadata = async (
  token: string,
  messageId: string,
  headers: string[]
) => {
  const params = new URLSearchParams();
  params.set('format', 'metadata');
  for (const h of headers) params.append('metadataHeaders', h);
  const res = await gmailFetch(
    token,
    `/messages/${messageId}?${params.toString()}`
  );
  if (!res.ok) throw new Error(await utils.parseHttpErrorMessage(res));
  return (await res.json()) as {
    id: string;
    threadId: string;
    payload?: GmailPart;
  };
};

const buildReferencesChain = (
  existing: string | undefined,
  messageIdHeader: string
): string => {
  const chain = (existing || '').trim();
  return chain ? `${chain} ${messageIdHeader}` : messageIdHeader;
};

const ensurePrefix = (subject: string, prefix: string): string => {
  const trimmed = subject.trim();
  return trimmed.toLowerCase().startsWith(prefix.toLowerCase())
    ? trimmed
    : `${prefix} ${trimmed}`;
};

export const sendEmail: ToolDefinition = {
  title: 'Gmail: Send Email',
  description:
    'Send a new email, starting a new thread. To answer an existing email use gmail-reply-email instead, so it stays in the same thread. If you are not sure the user wants it sent now, use gmail-create-draft.',
  schema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient email address.' },
      subject: { type: 'string', description: 'Email subject line.' },
      body: {
        type: 'string',
        description:
          'Email body. HTML is supported (Content-Type is text/html).'
      },
      cc: {
        type: 'string',
        description: 'Optional Cc recipient(s), comma-separated.'
      },
      bcc: {
        type: 'string',
        description: 'Optional Bcc recipient(s), comma-separated.'
      },
      attachmentUris: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional list of resource URIs (from list-resources or search-resources) to attach as files. Combined raw size must be < ~18 MB.'
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
        bcc: args.bcc ? String(args.bcc) : undefined
      },
      uris
    );
    if (!sent.ok) return text(`Error sending email: ${sent.error}`);

    const attachNote = uris.length ? ` with ${uris.length} attachment(s)` : '';
    return text(
      `Email sent${attachNote}. Message ID: ${sent.result.id} (thread ${sent.result.threadId})`
    );
  }
};

export const replyEmail: ToolDefinition = {
  title: 'Gmail: Reply',
  description:
    'Reply to an email in its existing thread (replyAll=true also includes the original To and Cc). Use this, not gmail-send-email, whenever continuing a conversation.',
  schema: {
    type: 'object',
    properties: {
      messageId: {
        type: 'string',
        description: 'Gmail message ID of the message being replied to.'
      },
      body: { type: 'string', description: 'Reply body. HTML is supported.' },
      replyAll: {
        type: 'boolean',
        description: 'If true, also reply to the original To and Cc recipients.'
      },
      attachmentUris: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional list of resource URIs to attach as files. Combined raw size must be < ~18 MB.'
      }
    },
    required: ['messageId', 'body']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const messageId = String(args.messageId);
    const replyAll = args.replyAll === true;

    let original;
    try {
      original = await fetchMessageMetadata(auth.token, messageId, [
        'Message-ID',
        'Subject',
        'From',
        'To',
        'Cc',
        'References'
      ]);
    } catch (err) {
      return text(`Error loading original message: ${(err as Error).message}`);
    }

    const headers = parseHeaders(original.payload?.headers);
    const originalMessageId = headers['message-id'];
    if (!originalMessageId) {
      return text(
        'Error: original message has no Message-ID header; cannot thread reply.'
      );
    }

    const replyTo = headers['from'] || '';
    const cc = replyAll
      ? [headers['to'], headers['cc']].filter(Boolean).join(', ')
      : '';

    const uris = utils.toStringArray(args.attachmentUris);
    const sent = await sendViaContainer(
      context,
      {
        accessToken: auth.token,
        operation: 'reply-email',
        to: replyTo,
        cc: cc || undefined,
        subject: ensurePrefix(headers['subject'] || '(no subject)', 'Re:'),
        body: String(args.body),
        inReplyTo: originalMessageId,
        references: buildReferencesChain(
          headers['references'],
          originalMessageId
        ),
        threadId: original.threadId
      },
      uris
    );
    if (!sent.ok) return text(`Error sending reply: ${sent.error}`);

    const attachNote = uris.length ? ` with ${uris.length} attachment(s)` : '';
    return text(
      `Reply sent${attachNote}. Message ID: ${sent.result.id} (thread ${sent.result.threadId})`
    );
  }
};

export const forwardEmail: ToolDefinition = {
  title: 'Gmail: Forward',
  description:
    'Forward an email to someone new, with an optional intro above it. Starts a new thread; to continue the original conversation use gmail-reply-email.',
  schema: {
    type: 'object',
    properties: {
      messageId: {
        type: 'string',
        description: 'Gmail message ID to forward.'
      },
      to: { type: 'string', description: 'Recipient email address.' },
      body: {
        type: 'string',
        description:
          'Optional intro text prepended above the forwarded content.'
      },
      cc: { type: 'string', description: 'Optional Cc recipient(s).' }
    },
    required: ['messageId', 'to']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const messageId = String(args.messageId);

    const fullRes = await gmailFetch(
      auth.token,
      `/messages/${messageId}?format=full`
    );
    if (!fullRes.ok)
      return text(
        `Error loading message: ${await utils.parseHttpErrorMessage(fullRes)}`
      );
    const full: any = await fullRes.json();

    const headers = parseHeaders(full.payload?.headers);
    const { text: originalBody, mimeType } = extractBodyText(full.payload);

    const intro = args.body ? `${String(args.body)}\n\n` : '';
    const divider =
      mimeType === 'text/html'
        ? '<br><br>--------- Forwarded message ---------<br>'
        : '\n\n--------- Forwarded message ---------\n';
    const meta =
      mimeType === 'text/html'
        ? `From: ${headers['from'] || 'unknown'}<br>Date: ${headers['date'] || 'unknown'}<br>Subject: ${headers['subject'] || '(no subject)'}<br>To: ${headers['to'] || ''}<br><br>`
        : `From: ${headers['from'] || 'unknown'}\nDate: ${headers['date'] || 'unknown'}\nSubject: ${headers['subject'] || '(no subject)'}\nTo: ${headers['to'] || ''}\n\n`;

    const body = `${intro}${divider}${meta}${originalBody}`;

    const sent = await sendViaContainer(
      context,
      {
        accessToken: auth.token,
        operation: 'send-email',
        to: String(args.to),
        cc: args.cc ? String(args.cc) : undefined,
        subject: ensurePrefix(headers['subject'] || '(no subject)', 'Fwd:'),
        body,
        contentType:
          mimeType === utils.constants.MIMETYPE_TEXT_HTML
            ? utils.constants.MIMETYPE_TEXT_HTML
            : utils.constants.MIMETYPE_TEXT
      },
      []
    );
    if (!sent.ok) return text(`Error forwarding email: ${sent.error}`);

    return text(`Forwarded. Message ID: ${sent.result.id}`);
  }
};

export const listEmails: ToolDefinition = {
  title: 'Gmail: List Emails',
  description:
    'List messages (from, subject, date, ID), filtered with Gmail search syntax such as "is:unread", "from:a@b.com", "after:2025/01/01", "has:attachment". Open one with gmail-read-email; for conversations use gmail-list-threads.',
  schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Gmail search query. Leave empty to list recent inbox messages.'
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
    if (args.query) params.set('q', String(args.query));
    params.set('maxResults', String(maxResults));

    const response = await gmailFetch(
      auth.token,
      `/messages?${params.toString()}`
    );
    if (!response.ok)
      return text(
        `Error listing emails: ${await utils.parseHttpErrorMessage(response)}`
      );

    const data: any = await response.json();
    const messages: Array<{ id: string }> = data.messages || [];
    if (messages.length === 0) return text('No emails found.');

    const details = await Promise.all(
      messages.map(async msg => {
        try {
          const meta = await fetchMessageMetadata(auth.token, msg.id, [
            'Subject',
            'From',
            'Date'
          ]);
          const h = parseHeaders(meta.payload?.headers);
          return `- From: ${h['from'] || 'unknown'} | Subject: ${h['subject'] || '(no subject)'} | Date: ${h['date'] || 'unknown'} | ID: ${msg.id}`;
        } catch {
          return `- [${msg.id}] (failed to load)`;
        }
      })
    );

    return text(
      `Found ${data.resultSizeEstimate ?? messages.length} emails (showing ${details.length}):\n\n${details.join('\n')}`
    );
  }
};

export const readEmail: ToolDefinition = {
  title: 'Gmail: Read Email',
  description:
    'Read one message in full by ID (from gmail-list-emails or gmail-get-thread).',
  schema: {
    type: 'object',
    properties: {
      messageId: { type: 'string', description: 'Gmail message ID.' }
    },
    required: ['messageId']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const response = await gmailFetch(
      auth.token,
      `/messages/${String(args.messageId)}?format=full`
    );
    if (!response.ok)
      return text(
        `Error reading email: ${await utils.parseHttpErrorMessage(response)}`
      );

    const detail: any = await response.json();
    const headers = parseHeaders(detail.payload?.headers);
    const body = extractBodyText(detail.payload);

    const out = [
      `From: ${headers['from'] || 'unknown'}`,
      `To: ${headers['to'] || 'unknown'}`,
      headers['cc'] ? `Cc: ${headers['cc']}` : null,
      `Subject: ${headers['subject'] || '(no subject)'}`,
      `Date: ${headers['date'] || 'unknown'}`,
      `Thread ID: ${detail.threadId}`,
      body.mimeType ? `Body MIME: ${body.mimeType}` : null,
      '',
      body.text || '(no text content)'
    ]
      .filter(Boolean)
      .join('\n');

    return text(out);
  }
};

export const trashEmail: ToolDefinition = {
  title: 'Gmail: Move to Trash',
  description:
    'Move a message to Trash, where Gmail keeps it for 30 days. Use this when the user asks to delete an email.',
  schema: {
    type: 'object',
    properties: {
      messageId: { type: 'string', description: 'Gmail message ID to trash.' }
    },
    required: ['messageId']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const response = await gmailFetch(
      auth.token,
      `/messages/${String(args.messageId)}/trash`,
      { method: 'POST' }
    );
    if (!response.ok)
      return text(
        `Error trashing email: ${await utils.parseHttpErrorMessage(response)}`
      );

    return text(`Email ${args.messageId} moved to Trash.`);
  }
};

export const listLabels: ToolDefinition = {
  title: 'Gmail: List Labels',
  description:
    'List all labels with their IDs, including system ones (INBOX, UNREAD, STARRED, IMPORTANT, SPAM). Call before gmail-modify-labels or gmail-batch-modify-labels, which take label IDs, not names.',
  schema: { type: 'object', properties: {} },
  handler: async (_args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const response = await gmailFetch(auth.token, '/labels');
    if (!response.ok)
      return text(
        `Error listing labels: ${await utils.parseHttpErrorMessage(response)}`
      );

    const data: any = await response.json();
    const labels = (data.labels || [])
      .map((l: any) => `- ${l.name} (${l.type}) [${l.id}]`)
      .join('\n');
    return text(labels || 'No labels found.');
  }
};

export const modifyLabels: ToolDefinition = {
  title: 'Gmail: Modify Labels',
  description:
    'Add or remove labels on one message: archive = remove INBOX, mark read = remove UNREAD, star = add STARRED. Takes label IDs from gmail-list-labels. For more than a few messages use gmail-batch-modify-labels.',
  schema: {
    type: 'object',
    properties: {
      messageId: { type: 'string', description: 'Gmail message ID to modify.' },
      addLabelIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Label IDs to add. Use list-labels to discover IDs.'
      },
      removeLabelIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Label IDs to remove.'
      }
    },
    required: ['messageId']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const addLabelIds = utils.toStringArray(args.addLabelIds);
    const removeLabelIds = utils.toStringArray(args.removeLabelIds);
    if (addLabelIds.length === 0 && removeLabelIds.length === 0) {
      return text(
        'Error: provide at least one of addLabelIds or removeLabelIds.'
      );
    }

    const response = await gmailFetch(
      auth.token,
      `/messages/${String(args.messageId)}/modify`,
      {
        method: 'POST',
        body: JSON.stringify({ addLabelIds, removeLabelIds })
      }
    );
    if (!response.ok)
      return text(
        `Error modifying labels: ${await utils.parseHttpErrorMessage(response)}`
      );

    return text(`Labels updated for message ${args.messageId}.`);
  }
};

export const batchModifyLabels: ToolDefinition = {
  title: 'Gmail: Batch Modify Labels',
  description:
    'Add or remove labels on up to 1000 messages in one call (bulk archive, mark all read). Same label IDs as gmail-modify-labels.',
  schema: {
    type: 'object',
    properties: {
      messageIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Gmail message IDs to modify.'
      },
      addLabelIds: { type: 'array', items: { type: 'string' } },
      removeLabelIds: { type: 'array', items: { type: 'string' } }
    },
    required: ['messageIds']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const ids = utils.toStringArray(args.messageIds);
    if (ids.length === 0) return text('Error: messageIds is empty.');

    const addLabelIds = utils.toStringArray(args.addLabelIds);
    const removeLabelIds = utils.toStringArray(args.removeLabelIds);
    if (addLabelIds.length === 0 && removeLabelIds.length === 0) {
      return text(
        'Error: provide at least one of addLabelIds or removeLabelIds.'
      );
    }

    const response = await gmailFetch(auth.token, '/messages/batchModify', {
      method: 'POST',
      body: JSON.stringify({ ids, addLabelIds, removeLabelIds })
    });
    if (!response.ok)
      return text(
        `Error in batch modify: ${await utils.parseHttpErrorMessage(response)}`
      );

    return text(`Updated labels on ${ids.length} message(s).`);
  }
};

export const listThreads: ToolDefinition = {
  title: 'Gmail: List Threads',
  description:
    'List conversations (thread ID and latest snippet), filtered with Gmail search syntax. Open one with gmail-get-thread. For individual messages use gmail-list-emails.',
  schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Optional Gmail search query.' },
      maxResults: {
        type: 'number',
        minimum: 1,
        maximum: 50,
        description:
          'Maximum number of threads to return (1-50). Defaults to 10.'
      }
    }
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const requested = Number(args.maxResults) || 10;
    const maxResults = Math.max(1, Math.min(50, requested));

    const params = new URLSearchParams();
    if (args.query) params.set('q', String(args.query));
    params.set('maxResults', String(maxResults));

    const response = await gmailFetch(
      auth.token,
      `/threads?${params.toString()}`
    );
    if (!response.ok)
      return text(
        `Error listing threads: ${await utils.parseHttpErrorMessage(response)}`
      );

    const data: any = await response.json();
    const threads: Array<{ id: string; snippet?: string; historyId?: string }> =
      data.threads || [];
    if (threads.length === 0) return text('No threads found.');

    const lines = threads.map(t => `- Thread ${t.id} :: ${t.snippet || ''}`);
    return text(`Found ${threads.length} thread(s):\n\n${lines.join('\n')}`);
  }
};

export const getThread: ToolDefinition = {
  title: 'Gmail: Get Thread',
  description:
    'Summarize every message in a thread (date, from, subject, snippet, message ID) without full bodies; then read one with gmail-read-email.',
  schema: {
    type: 'object',
    properties: {
      threadId: { type: 'string', description: 'Gmail thread ID.' }
    },
    required: ['threadId']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const params = new URLSearchParams();
    params.set('format', 'metadata');
    for (const h of ['Subject', 'From', 'To', 'Date'])
      params.append('metadataHeaders', h);

    const response = await gmailFetch(
      auth.token,
      `/threads/${String(args.threadId)}?${params.toString()}`
    );
    if (!response.ok)
      return text(
        `Error loading thread: ${await utils.parseHttpErrorMessage(response)}`
      );

    const data: any = await response.json();
    const messages: any[] = data.messages || [];
    if (messages.length === 0) return text('Thread has no messages.');

    const lines = messages.map((m, i) => {
      const h = parseHeaders(m.payload?.headers);
      return `${i + 1}. [${m.id}] ${h['date'] || ''} — From: ${h['from'] || 'unknown'} — Subject: ${h['subject'] || '(no subject)'}\n   Snippet: ${m.snippet || ''}`;
    });

    return text(
      `Thread ${data.id} — ${messages.length} message(s):\n\n${lines.join('\n\n')}`
    );
  }
};

export const createDraft: ToolDefinition = {
  title: 'Gmail: Create Draft',
  description:
    'Save an email as a draft without sending it. Use when the user wants to review first, or when you are unsure they want it sent; send later with gmail-send-draft.',
  schema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient email address.' },
      subject: { type: 'string', description: 'Email subject line.' },
      body: { type: 'string', description: 'Email body. HTML is supported.' },
      cc: { type: 'string', description: 'Optional Cc recipient(s).' },
      bcc: { type: 'string', description: 'Optional Bcc recipient(s).' },
      attachmentUris: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional list of resource URIs to attach as files. Combined raw size must be < ~18 MB.'
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
        bcc: args.bcc ? String(args.bcc) : undefined
      },
      uris
    );
    if (!sent.ok) return text(`Error creating draft: ${sent.error}`);

    const attachNote = uris.length ? ` with ${uris.length} attachment(s)` : '';
    return text(`Draft created${attachNote}. Draft ID: ${sent.result.id}`);
  }
};

export const listDrafts: ToolDefinition = {
  title: 'Gmail: List Drafts',
  description: 'List drafts with their draft IDs, recipients and subjects.',
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
    params.set('maxResults', String(maxResults));

    const response = await gmailFetch(
      auth.token,
      `/drafts?${params.toString()}`
    );
    if (!response.ok)
      return text(
        `Error listing drafts: ${await utils.parseHttpErrorMessage(response)}`
      );

    const data: any = await response.json();
    const drafts: Array<{ id: string; message?: { id: string } }> =
      data.drafts || [];
    if (drafts.length === 0) return text('No drafts found.');

    const lines = await Promise.all(
      drafts.map(async d => {
        if (!d.message?.id) return `- Draft ${d.id} (no message)`;
        try {
          const meta = await fetchMessageMetadata(auth.token, d.message.id, [
            'Subject',
            'To'
          ]);
          const h = parseHeaders(meta.payload?.headers);
          return `- Draft ${d.id} -> To: ${h['to'] || 'unset'} | Subject: ${h['subject'] || '(no subject)'} | Message ID: ${d.message.id}`;
        } catch {
          return `- Draft ${d.id} (failed to load message ${d.message.id})`;
        }
      })
    );
    return text(`Found ${drafts.length} draft(s):\n\n${lines.join('\n')}`);
  }
};

export const getDraft: ToolDefinition = {
  title: 'Gmail: Get Draft',
  description:
    'Read a draft in full by draft ID, e.g. to confirm what will be sent before gmail-send-draft.',
  schema: {
    type: 'object',
    properties: {
      draftId: { type: 'string', description: 'Gmail draft ID.' }
    },
    required: ['draftId']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const response = await gmailFetch(
      auth.token,
      `/drafts/${String(args.draftId)}?format=full`
    );
    if (!response.ok)
      return text(
        `Error reading draft: ${await utils.parseHttpErrorMessage(response)}`
      );

    const data: any = await response.json();
    const headers = parseHeaders(data.message?.payload?.headers);
    const body = extractBodyText(data.message?.payload);

    const out = [
      `Draft ID: ${data.id}`,
      `Message ID: ${data.message?.id || 'unknown'}`,
      `To: ${headers['to'] || 'unset'}`,
      headers['cc'] ? `Cc: ${headers['cc']}` : null,
      `Subject: ${headers['subject'] || '(no subject)'}`,
      body.mimeType ? `Body MIME: ${body.mimeType}` : null,
      '',
      body.text || '(no text content)'
    ]
      .filter(Boolean)
      .join('\n');
    return text(out);
  }
};

export const updateDraft: ToolDefinition = {
  title: 'Gmail: Update Draft',
  description:
    'Replace a draft entirely: pass the full to, subject and body even when changing one of them, and attachmentUris again to keep attachments — anything omitted is removed. Does not send it.',
  schema: {
    type: 'object',
    properties: {
      draftId: { type: 'string', description: 'Gmail draft ID to update.' },
      to: { type: 'string', description: 'Recipient email address.' },
      subject: { type: 'string', description: 'Email subject line.' },
      body: { type: 'string', description: 'Email body. HTML is supported.' },
      cc: { type: 'string', description: 'Optional Cc recipient(s).' },
      bcc: { type: 'string', description: 'Optional Bcc recipient(s).' },
      attachmentUris: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional list of resource URIs to attach. Replaces any prior attachments on the draft. Combined raw size must be < ~18 MB.'
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
        bcc: args.bcc ? String(args.bcc) : undefined
      },
      uris
    );
    if (!sent.ok) return text(`Error updating draft: ${sent.error}`);

    const attachNote = uris.length
      ? ` (with ${uris.length} attachment(s))`
      : '';
    return text(`Draft ${args.draftId} updated${attachNote}.`);
  }
};

export const deleteDraft: ToolDefinition = {
  title: 'Gmail: Delete Draft',
  description:
    'Permanently delete an unsent draft; it does not go to Trash. Only when the user has abandoned it. For a sent email use gmail-trash-email.',
  schema: {
    type: 'object',
    properties: {
      draftId: { type: 'string', description: 'Gmail draft ID to delete.' }
    },
    required: ['draftId']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const response = await gmailFetch(
      auth.token,
      `/drafts/${String(args.draftId)}`,
      {
        method: 'DELETE'
      }
    );
    if (!response.ok)
      return text(
        `Error deleting draft: ${await utils.parseHttpErrorMessage(response)}`
      );

    return text(`Draft ${args.draftId} deleted.`);
  }
};

export const sendDraft: ToolDefinition = {
  title: 'Gmail: Send Draft',
  description:
    'Send an existing draft as it is. Use when the user has a draft ready and says to send it.',
  schema: {
    type: 'object',
    properties: {
      draftId: { type: 'string', description: 'Gmail draft ID to send.' }
    },
    required: ['draftId']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const response = await gmailFetch(auth.token, '/drafts/send', {
      method: 'POST',
      body: JSON.stringify({ id: String(args.draftId) })
    });
    if (!response.ok)
      return text(
        `Error sending draft: ${await utils.parseHttpErrorMessage(response)}`
      );

    const result: any = await response.json();
    return text(`Draft sent. Message ID: ${result.id}`);
  }
};

export const getProfile: ToolDefinition = {
  title: 'Gmail: Get Profile',
  description:
    "Get the connected Gmail account's address and message counts — e.g. when asked which account is connected.",
  schema: { type: 'object', properties: {} },
  handler: async (_args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const response = await gmailFetch(auth.token, '/profile');
    if (!response.ok)
      return text(
        `Error loading profile: ${await utils.parseHttpErrorMessage(response)}`
      );

    const data: any = await response.json();
    return text(
      [
        `Email: ${data.emailAddress}`,
        `Messages total: ${data.messagesTotal}`,
        `Threads total: ${data.threadsTotal}`,
        `History ID: ${data.historyId}`
      ].join('\n')
    );
  }
};
