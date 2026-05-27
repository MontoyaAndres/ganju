import http from 'node:http';
import { utils } from '@anju/utils';
import type {
  GmailSendRequest,
  MimeAttachment,
  MimeMessageInput
} from '@anju/utils';

import { utils as serverUtils } from './utils/index.js';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

const dispatchGmail = async (
  req: GmailSendRequest,
  raw: string
): Promise<{ status: number; body: unknown }> => {
  let url: string;
  let method: 'POST' | 'PUT';
  let payload: Record<string, unknown>;

  switch (req.operation) {
    case 'send-email':
      url = `${GMAIL_API_BASE}/messages/send`;
      method = 'POST';
      payload = req.threadId ? { raw, threadId: req.threadId } : { raw };
      break;
    case 'reply-email':
      if (!req.threadId) {
        return { status: 400, body: { error: 'reply-email requires threadId' } };
      }
      url = `${GMAIL_API_BASE}/messages/send`;
      method = 'POST';
      payload = { raw, threadId: req.threadId };
      break;
    case 'create-draft':
      url = `${GMAIL_API_BASE}/drafts`;
      method = 'POST';
      payload = { message: { raw } };
      break;
    case 'update-draft':
      if (!req.draftId) {
        return { status: 400, body: { error: 'update-draft requires draftId' } };
      }
      url = `${GMAIL_API_BASE}/drafts/${encodeURIComponent(req.draftId)}`;
      method = 'PUT';
      payload = { message: { raw } };
      break;
    default:
      return {
        status: 400,
        body: { error: `unknown operation: ${(req as { operation: string }).operation}` }
      };
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${req.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const responseBody = await response.json().catch(() => ({}));
  return { status: response.status, body: responseBody };
};

export const handleGmailSend = async (
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

  let metadata: GmailSendRequest;
  try {
    metadata = JSON.parse(metadataRaw) as GmailSendRequest;
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
  if (!metadata.to || !metadata.body) {
    serverUtils.sendJson(res, 400, { error: 'metadata must include to and body' });
    return;
  }

  const attachments: MimeAttachment[] = [];
  let totalRaw = 0;
  for (const value of form.getAll('attachment')) {
    if (typeof value === 'string') continue;
    const file = value as File;
    const buf = Buffer.from(await file.arrayBuffer());
    totalRaw += buf.byteLength;
    if (totalRaw > utils.constants.GMAIL_MAX_RAW_ATTACHMENT_BYTES) {
      serverUtils.sendJson(res, 413, {
        error: `attachments exceed Gmail's ${Math.round(
          utils.constants.GMAIL_MAX_RAW_ATTACHMENT_BYTES / (1024 * 1024)
        )}MB raw cap`
      });
      return;
    }
    attachments.push({
      filename: file.name || 'attachment',
      mimeType:
        file.type || utils.constants.MIMETYPE_APPLICATION_OCTET_STREAM,
      base64: buf.toString('base64')
    });
  }

  const mimeInput: MimeMessageInput = {
    to: metadata.to,
    subject: metadata.subject || '(no subject)',
    body: metadata.body,
    cc: metadata.cc,
    bcc: metadata.bcc,
    contentType: metadata.contentType,
    inReplyTo: metadata.inReplyTo,
    references: metadata.references,
    attachments: attachments.length ? attachments : undefined
  };

  const mime = utils.buildMimeMessage(mimeInput);
  const raw = utils.utf8ToBase64Url(mime);

  const { status, body } = await dispatchGmail(metadata, raw);
  serverUtils.sendJson(res, status, body);
};
