import http from 'node:http';
import { utils } from '@anju/utils';

import { utils as serverUtils } from './utils/index.js';

// types
import type { SlackSendRequest, SlackSendResponse } from '@anju/utils';

interface SlackEnvelope {
  ok: boolean;
  error?: string;
  warning?: string;
  response_metadata?: {
    messages?: string[];
    // Cursor pagination on conversations.list and friends.
    next_cursor?: string;
  };
  [k: string]: any;
}

const SLACK_BASE = utils.constants.SLACK_API_BASE;
const MAX_UPLOAD = utils.constants.SLACK_MAX_UPLOAD_BYTES;

const slackFetch = async (
  token: string,
  path: string,
  init?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    formUrlEncoded?: boolean;
  }
): Promise<SlackEnvelope> => {
  const url = path.startsWith('http') ? path : `${SLACK_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...(init?.headers || {})
  };
  let body: string | undefined;
  if (init?.body !== undefined) {
    if (init.formUrlEncoded) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(
        init.body as Record<string, string>
      ).toString();
    } else {
      headers['Content-Type'] = 'application/json; charset=utf-8';
      body = JSON.stringify(init.body);
    }
  }
  const response = await fetch(url, {
    method: init?.method || 'GET',
    headers,
    body
  });
  const text = await response.text();
  if (!text) {
    return {
      ok: false,
      error: `slack returned empty body (${response.status})`
    };
  }
  try {
    return JSON.parse(text) as SlackEnvelope;
  } catch {
    return {
      ok: false,
      error: `slack returned non-JSON (${response.status}): ${text.slice(0, 200)}`
    };
  }
};

const handlePostMessage = async (
  req: SlackSendRequest
): Promise<{ status: number; body: SlackSendResponse | { error: string } }> => {
  if (!req.text && !req.blocks) {
    return {
      status: 400,
      body: { error: 'post-message requires text or blocks' }
    };
  }

  const payload: Record<string, unknown> = { channel: req.channel };
  if (req.text) payload.text = req.text;
  if (req.blocks) payload.blocks = req.blocks;
  if (req.threadTs) payload.thread_ts = req.threadTs;
  if (req.mrkdwn === false) payload.mrkdwn = false;

  const res = await slackFetch(req.accessToken, '/chat.postMessage', {
    method: 'POST',
    body: payload
  });
  if (!res.ok) {
    return { status: 502, body: { error: `slack: ${res.error || 'unknown'}` } };
  }
  return {
    status: 200,
    body: {
      id: res.ts || '',
      channel: res.channel,
      ts: res.ts
    }
  };
};

// Slack IDs start with C (public), G (private/group), or D (DM).
// chat.postMessage resolves names server-side; files.completeUploadExternal
// does not — pass it a name and it returns invalid_arguments.
const CHANNEL_ID_PATTERN = /^[CGD][A-Z0-9]+$/;

const resolveChannelId = async (
  token: string,
  input: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> => {
  if (CHANNEL_ID_PATTERN.test(input)) {
    return { ok: true, id: input };
  }
  const name = input.startsWith('#') ? input.slice(1) : input;

  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const body: Record<string, string> = {
      types: 'public_channel,private_channel',
      limit: '200',
      exclude_archived: 'true'
    };
    if (cursor) body.cursor = cursor;

    const res = await slackFetch(token, '/conversations.list', {
      method: 'POST',
      formUrlEncoded: true,
      body
    });
    if (!res.ok) {
      return { ok: false, error: res.error || 'conversations.list failed' };
    }
    const channels =
      (res.channels as Array<{ id: string; name?: string }>) || [];
    const hit = channels.find(c => c.name === name);
    if (hit) return { ok: true, id: hit.id };

    cursor = res.response_metadata?.next_cursor;
    if (!cursor) break;
  }
  return { ok: false, error: `channel "${input}" not found in workspace` };
};

export const handleUploadFile = async (
  req: SlackSendRequest,
  attachment: { name: string; contentType: string; bytes: Buffer } | undefined
): Promise<{ status: number; body: SlackSendResponse | { error: string } }> => {
  if (!attachment) {
    return {
      status: 400,
      body: { error: 'upload-file requires an attachment' }
    };
  }
  if (attachment.bytes.byteLength > MAX_UPLOAD) {
    return {
      status: 413,
      body: {
        error: `attachment ${attachment.name} exceeds the ${Math.round(MAX_UPLOAD / (1024 * 1024))}MB upload cap`
      }
    };
  }

  const resolved = await resolveChannelId(req.accessToken, req.channel);
  if (!resolved.ok) {
    return { status: 400, body: { error: `slack: ${resolved.error}` } };
  }
  const channelId = resolved.id;

  // Step 1: ask Slack for an upload URL + file id.
  const getUrlRes = await slackFetch(
    req.accessToken,
    '/files.getUploadURLExternal',
    {
      method: 'POST',
      formUrlEncoded: true,
      body: {
        filename: attachment.name,
        length: String(attachment.bytes.byteLength)
      }
    }
  );
  if (!getUrlRes.ok || !getUrlRes.upload_url || !getUrlRes.file_id) {
    return {
      status: 502,
      body: {
        error: `slack getUploadURL: ${getUrlRes.error || 'no upload_url'}`
      }
    };
  }

  // Step 2: PUT raw bytes to the signed URL. Slack returns 200 with "OK"
  // text or sometimes an empty body — we only care that 2xx came back.
  const putRes = await fetch(getUrlRes.upload_url, {
    method: 'POST',
    headers: { 'Content-Type': attachment.contentType },
    body: attachment.bytes
  });
  if (putRes.status >= 300) {
    const errText = await putRes.text().catch(() => '');
    return {
      status: 502,
      body: { error: `slack upload PUT failed (${putRes.status}) ${errText}` }
    };
  }

  // Step 3: complete the upload and post into the channel.
  // Slack's completeUploadExternal expects `files` as a JSON-encoded string
  // (form-urlencoded body works most reliably — passing files as a native
  // array in a JSON body triggers `invalid_arguments` for some workspaces).
  // channel_id must be a real channel ID (C…/G…/D…), not a name.
  const completeForm: Record<string, string> = {
    files: JSON.stringify([
      { id: getUrlRes.file_id, title: req.title || attachment.name }
    ])
  };
  completeForm.channel_id = channelId;
  if (req.initialComment) completeForm.initial_comment = req.initialComment;
  if (req.threadTs) completeForm.thread_ts = req.threadTs;

  const completeRes = await slackFetch(
    req.accessToken,
    '/files.completeUploadExternal',
    {
      method: 'POST',
      formUrlEncoded: true,
      body: completeForm
    }
  );
  if (!completeRes.ok) {
    console.error('slack completeUploadExternal failed', {
      error: completeRes.error,
      channelInput: req.channel,
      channelId,
      fileId: getUrlRes.file_id
    });
    return {
      status: 502,
      body: { error: `slack completeUpload: ${completeRes.error || 'unknown'}` }
    };
  }

  const file = completeRes.files?.[0];
  return {
    status: 200,
    body: {
      id: file?.id || getUrlRes.file_id,
      channel: req.channel,
      permalink: file?.permalink
    }
  };
};

export const handleSlackSend = async (
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

  let metadata: SlackSendRequest;
  try {
    metadata = JSON.parse(metadataRaw) as SlackSendRequest;
  } catch (err) {
    serverUtils.sendJson(res, 400, {
      error: `metadata field is not valid JSON: ${(err as Error).message}`
    });
    return;
  }

  if (!metadata.accessToken) {
    serverUtils.sendJson(res, 401, {
      error: 'missing accessToken in metadata'
    });
    return;
  }
  if (!metadata.channel) {
    serverUtils.sendJson(res, 400, { error: 'metadata must include channel' });
    return;
  }

  const attachmentField = form.get('attachment');
  let attachment:
    | { name: string; contentType: string; bytes: Buffer }
    | undefined;
  if (attachmentField && typeof attachmentField !== 'string') {
    const file = attachmentField as File;
    attachment = {
      name: file.name || 'attachment',
      contentType:
        file.type || utils.constants.MIMETYPE_APPLICATION_OCTET_STREAM,
      bytes: Buffer.from(await file.arrayBuffer())
    };
  }

  let result: { status: number; body: SlackSendResponse | { error: string } };
  switch (metadata.operation) {
    case 'post-message':
      result = await handlePostMessage(metadata);
      break;
    case 'upload-file':
      result = await handleUploadFile(metadata, attachment);
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
