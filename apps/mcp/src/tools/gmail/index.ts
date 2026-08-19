import { utils } from '@ganju/utils';
import type { GmailSendRequest, GmailSendResponse } from '@ganju/utils';
import { getResourceHandler } from '@ganju/containers';

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

    const resolved = await utils.resolveAttachment(resource, async key => {
      const obj = await context.bucket.get(key);
      return obj ? await obj.arrayBuffer() : null;
    });
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
    "Send a brand-new email from the connected Gmail account. Use only when starting a fresh thread; to continue an existing conversation use gmail-reply-email so threading and References headers are preserved. Body is treated as HTML and Content-Type is set to text/html. Non-ASCII subjects and bodies are encoded automatically. Pass attachmentUris (URIs from list-resources or search-resources) to attach files from the MCP's resources — combined raw size must stay under ~18 MB to fit Gmail's 24 MB encoded limit. Returns the new message ID and thread ID.",
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
    'Reply to an existing email, preserving its Gmail thread by setting In-Reply-To, References, and threadId. Subject is auto-prefixed with "Re:" if not already present. Set replyAll=true to also include the original To and Cc recipients. Pass attachmentUris (from list-resources or search-resources) to attach files. Use this — not gmail-send-email — whenever continuing an existing conversation, so the reply lands in the same thread on the recipient side. Returns the new message ID and thread ID.',
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
    'Forward an existing email to a new recipient. Pulls the original body (text/plain when available, falls back to text/html), prepends an optional intro, and adds a "Fwd:" subject prefix. The forwarded copy starts a new thread — it does NOT continue the original conversation; use gmail-reply-email for that. Use this when the user wants to share an email with someone outside the original thread.',
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
    'List inbox messages, optionally filtered with Gmail search syntax (e.g. "is:unread", "from:user@example.com", "subject:invoice", "after:2025/01/01", "label:LABEL_ID", "has:attachment"). Returns up to maxResults summary lines (from / subject / date / message ID) — default 10, max 50. Use for triage; call gmail-read-email with a returned ID to view a specific message in full. For conversation-level browsing prefer gmail-list-threads.',
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
    'Read the full contents of one Gmail message by ID. Returns from / to / cc / subject / date / threadId and the decoded body (prefers text/plain, falls back to text/html). Use after gmail-list-emails returns a candidate ID. To read every message in a conversation, prefer gmail-get-thread to scan summaries first and then call this for the specific message you want to dig into.',
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
    'Move a Gmail message to Trash. Reversible — Gmail keeps trashed messages for 30 days before purging them, so prefer this whenever the user asks to "delete" an email. Idempotent: calling on an already-trashed message is a safe no-op. Returns confirmation with the message ID.',
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
    'List every label (folder) on the Gmail account, including system labels (INBOX, UNREAD, STARRED, IMPORTANT, SENT, DRAFT, TRASH, SPAM) and user-created labels. Returns name, type (system|user), and the label ID for each. Call this first to discover the IDs you need before invoking gmail-modify-labels or gmail-batch-modify-labels — those tools take label IDs, not names.',
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
    'Add or remove labels on a single Gmail message. Common operations: archive = remove INBOX; mark as read = remove UNREAD; star = add STARRED; mark important = add IMPORTANT. Pass label IDs (not names) — discover them with gmail-list-labels. At least one of addLabelIds / removeLabelIds is required. For >10 messages, use gmail-batch-modify-labels instead to avoid one HTTP call per message.',
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
    'Add or remove labels on up to 1000 Gmail messages in one call. Far cheaper than calling gmail-modify-labels in a loop. Same label-ID semantics: pass IDs from gmail-list-labels, and at least one of addLabelIds / removeLabelIds. Returns no per-message detail — Gmail applies it as all-or-nothing. Common use cases: bulk archive, mark-all-as-read, label a batch of search results.',
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
    'List Gmail threads (conversations), optionally filtered with Gmail search syntax. Returns thread ID + last-message snippet for each, up to maxResults (default 10, max 50). Use this when the user is asking about an ongoing conversation or back-and-forth, then call gmail-get-thread to drill in. Prefer gmail-list-emails when the user is asking about individual messages rather than conversations.',
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
    'Get a per-message summary of every message in a Gmail thread (threadId from gmail-list-threads or returned by gmail-read-email). Returns one line per message with date / from / subject / snippet plus the message ID. Does NOT return full bodies — call gmail-read-email afterwards with a specific message ID when you need the full content. Use this to scan a conversation cheaply.',
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
    "Create a draft email saved in Gmail's Drafts folder. The draft is NOT sent — call gmail-send-draft when the user is ready, gmail-update-draft to revise, or gmail-delete-draft to abandon. Pass attachmentUris (from list-resources or search-resources) to attach files. Use whenever the user wants to compose now and review/send later, or whenever you are unsure if the user wants to actually send. Returns the draft ID.",
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
  description:
    "List drafts saved in Gmail's Drafts folder, up to maxResults (default 10, max 50). Returns draft ID, recipient, subject, and the underlying message ID for each. Use to find a draft to send (gmail-send-draft), edit (gmail-update-draft), inspect (gmail-get-draft), or delete (gmail-delete-draft).",
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
    'Read the full contents of a draft by its draft ID — recipient, cc, subject, and decoded body. Use to confirm exactly what will be sent before calling gmail-send-draft, especially for drafts the user wrote earlier and may want to verify.',
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
    'Replace the contents of an existing draft entirely. This does NOT merge — every field you pass overwrites the previous draft, so include the full to / subject / body even when only revising one of them. Pass attachmentUris (from list-resources or search-resources) to attach files; omitting it removes any previously-attached files. Use after gmail-get-draft when the user requests changes. Does not send the draft (use gmail-send-draft for that).',
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
    'Permanently delete a draft email (the unsent draft itself — NOT a sent message). Cannot be undone; the draft does not go to Trash. Use only when the user has explicitly abandoned a draft. To send the draft instead, use gmail-send-draft. To trash an already-sent message, use gmail-trash-email.',
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
    'Send an existing draft as-is. The draft is moved out of Drafts and delivered to its recipient(s). Returns the resulting Gmail message ID — usable afterwards with gmail-reply-email, gmail-trash-email, gmail-modify-labels, etc. Prefer this over gmail-send-email when the user has already drafted the message and is asking to "send it now".',
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
    "Get the connected Gmail account's profile: email address, total messages, total threads, and current history ID. Use to confirm WHICH Gmail account is connected (helpful when the user asks 'what email is this connected to?'), or to capture the user's address for use in a signature or self-reference.",
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
