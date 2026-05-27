import http from 'node:http';
import { utils } from '@anju/utils';
import type {
  OutlookSendRequest,
  OutlookSendResponse
} from '@anju/utils';

import { utils as serverUtils } from './utils/index.js';

const GRAPH_BASE = utils.constants.MICROSOFT_GRAPH_API_BASE;
const INLINE_THRESHOLD = utils.constants.OUTLOOK_ATTACHMENT_INLINE_THRESHOLD;
const MAX_BYTES = utils.constants.OUTLOOK_MAX_ATTACHMENT_BYTES;
const CHUNK_BYTES = utils.constants.OUTLOOK_UPLOAD_CHUNK_BYTES;

interface ParsedAttachment {
  name: string;
  contentType: string;
  bytes: Buffer;
}

interface GraphMessage {
  id: string;
  conversationId?: string;
}

const parseRecipients = (raw: string | undefined) => {
  if (!raw) return undefined;
  const addrs = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return addrs.length
    ? addrs.map(address => ({ emailAddress: { address } }))
    : undefined;
};

const buildMessageBody = (req: OutlookSendRequest) => {
  const recipients = {
    toRecipients: parseRecipients(req.to),
    ccRecipients: parseRecipients(req.cc),
    bccRecipients: parseRecipients(req.bcc)
  };
  const message: Record<string, unknown> = {
    body: {
      contentType: (req.contentType ?? 'html').toUpperCase() === 'TEXT'
        ? 'Text'
        : 'HTML',
      content: req.body
    }
  };
  if (req.subject !== undefined) message.subject = req.subject;
  if (recipients.toRecipients) message.toRecipients = recipients.toRecipients;
  if (recipients.ccRecipients) message.ccRecipients = recipients.ccRecipients;
  if (recipients.bccRecipients) message.bccRecipients = recipients.bccRecipients;
  return message;
};

const graphFetch = async (
  token: string,
  path: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> }
): Promise<{ status: number; body: unknown }> => {
  const isAbsolute = path.startsWith('http');
  const url = isAbsolute ? path : `${GRAPH_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...(init?.headers || {})
  };
  if (init?.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(url, {
    method: init?.method || 'GET',
    headers,
    body: init?.body === undefined ? undefined : JSON.stringify(init.body)
  });
  if (response.status === 204) return { status: 204, body: null };
  if (response.status === 202) return { status: 202, body: null };
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: response.status, body: parsed };
};

const graphError = (status: number, body: unknown): string => {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error: { message?: string; code?: string } }).error;
    return `Graph ${status}: ${err.code ?? ''} ${err.message ?? ''}`.trim();
  }
  return `Graph ${status}`;
};

// Inline-attachment path: bundle each file as fileAttachment in the message
// JSON. Only valid when every file is ≤3MB.
const inlineAttachments = (attachments: ParsedAttachment[]) =>
  attachments.map(a => ({
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: a.name,
    contentType: a.contentType,
    contentBytes: a.bytes.toString('base64')
  }));

// Upload a single large attachment to a draft via createUploadSession +
// chunked PUT. Graph requires `Content-Range: bytes start-end/total`.
const uploadLargeAttachment = async (
  token: string,
  draftId: string,
  attachment: ParsedAttachment
): Promise<{ ok: true } | { ok: false; error: string }> => {
  const sessionRes = await graphFetch(
    token,
    `/me/messages/${encodeURIComponent(draftId)}/attachments/createUploadSession`,
    {
      method: 'POST',
      body: {
        AttachmentItem: {
          attachmentType: 'file',
          name: attachment.name,
          size: attachment.bytes.byteLength,
          contentType: attachment.contentType
        }
      }
    }
  );
  if (sessionRes.status >= 300 || !sessionRes.body) {
    return { ok: false, error: graphError(sessionRes.status, sessionRes.body) };
  }
  const uploadUrl = (sessionRes.body as { uploadUrl?: string }).uploadUrl;
  if (!uploadUrl) {
    return { ok: false, error: 'createUploadSession returned no uploadUrl' };
  }

  const total = attachment.bytes.byteLength;
  let offset = 0;
  while (offset < total) {
    const end = Math.min(offset + CHUNK_BYTES, total) - 1;
    const chunk = attachment.bytes.subarray(offset, end + 1);
    const chunkRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(chunk.byteLength),
        'Content-Range': `bytes ${offset}-${end}/${total}`,
        'Content-Type': 'application/octet-stream'
      },
      body: chunk
    });
    if (chunkRes.status >= 300) {
      const errText = await chunkRes.text().catch(() => '');
      return {
        ok: false,
        error: `upload PUT failed (${chunkRes.status}) ${errText}`
      };
    }
    offset = end + 1;
  }
  return { ok: true };
};

const addAttachmentsToDraft = async (
  token: string,
  draftId: string,
  attachments: ParsedAttachment[]
): Promise<{ ok: true } | { ok: false; error: string }> => {
  const inline: ParsedAttachment[] = [];
  const large: ParsedAttachment[] = [];
  for (const a of attachments) {
    (a.bytes.byteLength <= INLINE_THRESHOLD ? inline : large).push(a);
  }

  for (const a of inline) {
    const res = await graphFetch(
      token,
      `/me/messages/${encodeURIComponent(draftId)}/attachments`,
      {
        method: 'POST',
        body: {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: a.name,
          contentType: a.contentType,
          contentBytes: a.bytes.toString('base64')
        }
      }
    );
    if (res.status >= 300) {
      return { ok: false, error: graphError(res.status, res.body) };
    }
  }
  for (const a of large) {
    const res = await uploadLargeAttachment(token, draftId, a);
    if (!res.ok) return res;
  }
  return { ok: true };
};

const sendDraft = async (
  token: string,
  draftId: string
): Promise<{ ok: true } | { ok: false; error: string }> => {
  const res = await graphFetch(
    token,
    `/me/messages/${encodeURIComponent(draftId)}/send`,
    { method: 'POST' }
  );
  if (res.status >= 300) {
    return { ok: false, error: graphError(res.status, res.body) };
  }
  return { ok: true };
};

// send-email: inline path uses POST /me/sendMail (no draft created); the
// large-attachment path falls back to draft+uploadSession+send because
// sendMail doesn't accept uploadSession attachments.
const handleSendEmail = async (
  req: OutlookSendRequest,
  attachments: ParsedAttachment[]
): Promise<{ status: number; body: OutlookSendResponse | { error: string } }> => {
  const anyLarge = attachments.some(a => a.bytes.byteLength > INLINE_THRESHOLD);

  if (!anyLarge) {
    const message = buildMessageBody(req);
    if (attachments.length) {
      (message as Record<string, unknown>).attachments =
        inlineAttachments(attachments);
    }
    const res = await graphFetch(req.accessToken, '/me/sendMail', {
      method: 'POST',
      body: { message, saveToSentItems: true }
    });
    if (res.status >= 300) {
      return { status: res.status, body: { error: graphError(res.status, res.body) } };
    }
    // sendMail returns 202 with no body — no message id available.
    return { status: 200, body: { id: '' } };
  }

  // Large path: build a draft, attach, send.
  const draftRes = await graphFetch(req.accessToken, '/me/messages', {
    method: 'POST',
    body: buildMessageBody(req)
  });
  if (draftRes.status >= 300 || !draftRes.body) {
    return {
      status: draftRes.status,
      body: { error: graphError(draftRes.status, draftRes.body) }
    };
  }
  const draft = draftRes.body as GraphMessage;
  const attached = await addAttachmentsToDraft(
    req.accessToken,
    draft.id,
    attachments
  );
  if (!attached.ok) return { status: 502, body: { error: attached.error } };
  const sent = await sendDraft(req.accessToken, draft.id);
  if (!sent.ok) return { status: 502, body: { error: sent.error } };
  return {
    status: 200,
    body: { id: draft.id, conversationId: draft.conversationId }
  };
};

// reply-email / forward-email: create a draft via createReply[All] /
// createForward, PATCH body + recipients, attach, send.
const handleReplyOrForward = async (
  req: OutlookSendRequest,
  attachments: ParsedAttachment[]
): Promise<{ status: number; body: OutlookSendResponse | { error: string } }> => {
  if (!req.messageId) {
    return { status: 400, body: { error: 'messageId is required' } };
  }
  const createPath =
    req.operation === 'forward-email'
      ? `/me/messages/${encodeURIComponent(req.messageId)}/createForward`
      : req.replyAll
        ? `/me/messages/${encodeURIComponent(req.messageId)}/createReplyAll`
        : `/me/messages/${encodeURIComponent(req.messageId)}/createReply`;

  const draftRes = await graphFetch(req.accessToken, createPath, {
    method: 'POST'
  });
  if (draftRes.status >= 300 || !draftRes.body) {
    return {
      status: draftRes.status,
      body: { error: graphError(draftRes.status, draftRes.body) }
    };
  }
  const draft = draftRes.body as GraphMessage;

  // Patch the draft: createReply/createForward seed an empty body and the
  // quoted original; we replace the body with the user's message. Forward
  // also needs recipients (createForward doesn't accept them up front).
  const patchBody: Record<string, unknown> = {
    body: {
      contentType: (req.contentType ?? 'html').toUpperCase() === 'TEXT'
        ? 'Text'
        : 'HTML',
      content: req.body
    }
  };
  if (req.operation === 'forward-email') {
    const toRecipients = parseRecipients(req.to);
    const ccRecipients = parseRecipients(req.cc);
    if (!toRecipients) {
      return { status: 400, body: { error: 'forward-email requires "to"' } };
    }
    patchBody.toRecipients = toRecipients;
    if (ccRecipients) patchBody.ccRecipients = ccRecipients;
  }
  const patchRes = await graphFetch(
    req.accessToken,
    `/me/messages/${encodeURIComponent(draft.id)}`,
    { method: 'PATCH', body: patchBody }
  );
  if (patchRes.status >= 300) {
    return {
      status: patchRes.status,
      body: { error: graphError(patchRes.status, patchRes.body) }
    };
  }

  if (attachments.length) {
    const attached = await addAttachmentsToDraft(
      req.accessToken,
      draft.id,
      attachments
    );
    if (!attached.ok) return { status: 502, body: { error: attached.error } };
  }

  const sent = await sendDraft(req.accessToken, draft.id);
  if (!sent.ok) return { status: 502, body: { error: sent.error } };
  return {
    status: 200,
    body: { id: draft.id, conversationId: draft.conversationId }
  };
};

const handleCreateDraft = async (
  req: OutlookSendRequest,
  attachments: ParsedAttachment[]
): Promise<{ status: number; body: OutlookSendResponse | { error: string } }> => {
  const draftRes = await graphFetch(req.accessToken, '/me/messages', {
    method: 'POST',
    body: buildMessageBody(req)
  });
  if (draftRes.status >= 300 || !draftRes.body) {
    return {
      status: draftRes.status,
      body: { error: graphError(draftRes.status, draftRes.body) }
    };
  }
  const draft = draftRes.body as GraphMessage;

  if (attachments.length) {
    const attached = await addAttachmentsToDraft(
      req.accessToken,
      draft.id,
      attachments
    );
    if (!attached.ok) return { status: 502, body: { error: attached.error } };
  }
  return {
    status: 200,
    body: { id: draft.id, conversationId: draft.conversationId }
  };
};

// update-draft replaces body/recipients via PATCH and resets attachments —
// to mirror the Gmail "pass attachmentUris or they get cleared" semantic,
// we list existing attachments and delete them before re-adding.
const handleUpdateDraft = async (
  req: OutlookSendRequest,
  attachments: ParsedAttachment[]
): Promise<{ status: number; body: OutlookSendResponse | { error: string } }> => {
  if (!req.draftId) {
    return { status: 400, body: { error: 'draftId is required' } };
  }
  const patchRes = await graphFetch(
    req.accessToken,
    `/me/messages/${encodeURIComponent(req.draftId)}`,
    { method: 'PATCH', body: buildMessageBody(req) }
  );
  if (patchRes.status >= 300 || !patchRes.body) {
    return {
      status: patchRes.status,
      body: { error: graphError(patchRes.status, patchRes.body) }
    };
  }
  const draft = patchRes.body as GraphMessage;

  // Clear existing attachments then re-add. Skip the clear step if the
  // caller didn't pass any — leaves existing files intact when the agent
  // updates body-only.
  if (attachments.length) {
    const listRes = await graphFetch(
      req.accessToken,
      `/me/messages/${encodeURIComponent(req.draftId)}/attachments?$select=id`
    );
    if (listRes.status < 300 && listRes.body) {
      const items =
        (listRes.body as { value?: Array<{ id: string }> }).value || [];
      for (const item of items) {
        await graphFetch(
          req.accessToken,
          `/me/messages/${encodeURIComponent(req.draftId)}/attachments/${encodeURIComponent(item.id)}`,
          { method: 'DELETE' }
        );
      }
    }
    const attached = await addAttachmentsToDraft(
      req.accessToken,
      req.draftId,
      attachments
    );
    if (!attached.ok) return { status: 502, body: { error: attached.error } };
  }

  return {
    status: 200,
    body: { id: req.draftId, conversationId: draft.conversationId }
  };
};

export const handleOutlookSend = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> => {
  let form: FormData;
  try {
    form = await serverUtils.parseMultipartRequest(req);
  } catch (err) {
    serverUtils.sendJson(res, 400, {
      error: `failed to parse multipart body: ${(err as Error).message}`
    });
    return;
  }

  const metadataRaw = form.get('metadata');
  if (typeof metadataRaw !== 'string') {
    serverUtils.sendJson(res, 400, { error: 'missing metadata field' });
    return;
  }

  let metadata: OutlookSendRequest;
  try {
    metadata = JSON.parse(metadataRaw) as OutlookSendRequest;
  } catch (err) {
    serverUtils.sendJson(res, 400, {
      error: `metadata field is not valid JSON: ${(err as Error).message}`
    });
    return;
  }

  if (!metadata.accessToken) {
    serverUtils.sendJson(res, 401, { error: 'missing accessToken in metadata' });
    return;
  }
  if (!metadata.body && metadata.operation !== 'update-draft') {
    serverUtils.sendJson(res, 400, { error: 'metadata must include body' });
    return;
  }

  const attachments: ParsedAttachment[] = [];
  for (const value of form.getAll('attachment')) {
    if (typeof value === 'string') continue;
    const file = value as File;
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      serverUtils.sendJson(res, 413, {
        error: `attachment ${file.name || '(unnamed)'} exceeds the ${Math.round(MAX_BYTES / (1024 * 1024))}MB per-file cap`
      });
      return;
    }
    attachments.push({
      name: file.name || 'attachment',
      contentType:
        file.type || utils.constants.MIMETYPE_APPLICATION_OCTET_STREAM,
      bytes: buf
    });
  }

  let result: { status: number; body: OutlookSendResponse | { error: string } };
  switch (metadata.operation) {
    case 'send-email':
      result = await handleSendEmail(metadata, attachments);
      break;
    case 'reply-email':
    case 'forward-email':
      result = await handleReplyOrForward(metadata, attachments);
      break;
    case 'create-draft':
      result = await handleCreateDraft(metadata, attachments);
      break;
    case 'update-draft':
      result = await handleUpdateDraft(metadata, attachments);
      break;
    default:
      result = {
        status: 400,
        body: {
          error: `unknown operation: ${(metadata as { operation: string }).operation}`
        }
      };
  }

  serverUtils.sendJson(res, result.status, result.body);
};
