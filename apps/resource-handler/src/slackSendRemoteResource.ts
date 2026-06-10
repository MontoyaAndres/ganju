import http from 'node:http';
import { utils } from '@anju/utils';
import type { SlackSendRemoteResourceRequest, SlackSendRequest } from '@anju/utils';

import { utils as serverUtils } from './utils/index.js';
import { connectRemoteMcpClient } from './remoteMcpClient.js';
import { handleUploadFile } from './slackSend.js';

// Name a forwarded resource file: prefer the uri's last path segment, then give
// it an extension from its mime type so the file shows a sensible name in Slack.
const filenameForResource = (uri: string, mimeType: string): string => {
  let base = uri;
  try {
    const segment = new URL(uri).pathname.split('/').filter(Boolean).pop();
    if (segment) base = decodeURIComponent(segment);
  } catch {
    base = uri.split(/[?#]/)[0].split('/').filter(Boolean).pop() || uri;
  }
  base = utils.sanitizeFilename(base).slice(0, 80);
  if (/\.[a-z0-9]+$/i.test(base)) return base;
  const ext =
    utils.constants.EXTENSION_BY_MIME[mimeType] ||
    (mimeType.startsWith('text/') ? 'txt' : 'bin');
  return `${base}.${ext}`;
};

// Read a PROXIED (remote MCP) resource and deliver it to Slack as a file —
// entirely inside the container, so the bytes never transit the 128 MiB worker.
// The worker hands over only the connection details + resolved auth header as
// JSON; this connects to the remote MCP server, reads the resource, decodes its
// blob/text, and forwards it through the shared Slack external-upload flow.
export const handleSlackSendRemoteResource = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> => {
  let body: SlackSendRemoteResourceRequest;
  try {
    body =
      await serverUtils.parseJsonBody<SlackSendRemoteResourceRequest>(req);
  } catch (err) {
    serverUtils.sendJson(res, 400, {
      error: `invalid JSON body: ${(err as Error).message}`
    });
    return;
  }

  const slack = body?.slack;
  const remote = body?.remote;
  if (!slack?.accessToken) {
    serverUtils.sendJson(res, 401, { error: 'missing accessToken in slack' });
    return;
  }
  if (!slack.channel) {
    serverUtils.sendJson(res, 400, { error: 'missing channel in slack' });
    return;
  }
  if (!remote?.url || !remote?.uri) {
    serverUtils.sendJson(res, 400, {
      error: 'missing remote.url or remote.uri'
    });
    return;
  }

  let handle;
  try {
    handle = await connectRemoteMcpClient({
      url: remote.url,
      transport: remote.transport,
      authHeader: remote.authHeader ?? null,
      timeoutMs: remote.timeoutMs || 10000
    });
  } catch (err) {
    serverUtils.sendJson(res, 502, {
      error: `could not reach the remote MCP server: ${(err as Error).message}`
    });
    return;
  }

  try {
    const read = (await handle.client.readResource({ uri: remote.uri })) as {
      contents?: unknown;
    };
    const contents = Array.isArray(read.contents) ? read.contents : [];

    let bytes: Buffer | null = null;
    let mimeType: string = utils.constants.MIMETYPE_APPLICATION_OCTET_STREAM;
    for (const raw of contents) {
      const content =
        raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      const declaredMime =
        typeof content.mimeType === 'string' && content.mimeType
          ? content.mimeType
          : null;
      // Prefer binary blobs (base64); fall back to text.
      if (typeof content.blob === 'string' && content.blob) {
        mimeType =
          declaredMime || utils.constants.MIMETYPE_APPLICATION_OCTET_STREAM;
        bytes = Buffer.from(utils.base64ToBytes(content.blob));
        break;
      }
      if (typeof content.text === 'string') {
        mimeType = declaredMime || utils.constants.MIMETYPE_TEXT;
        bytes = Buffer.from(content.text, 'utf-8');
        break;
      }
    }

    if (!bytes) {
      serverUtils.sendJson(res, 422, {
        error: 'resource has no deliverable content'
      });
      return;
    }

    const uploadRequest: SlackSendRequest = {
      accessToken: slack.accessToken,
      operation: 'upload-file',
      channel: slack.channel,
      threadTs: slack.threadTs,
      title: slack.title,
      initialComment: slack.initialComment
    };

    const result = await handleUploadFile(uploadRequest, {
      name: filenameForResource(remote.uri, mimeType),
      contentType: mimeType,
      bytes
    });
    serverUtils.sendJson(res, result.status, result.body);
  } catch (err) {
    serverUtils.sendJson(res, 502, {
      error: `remote resource read/send failed: ${(err as Error).message}`
    });
  } finally {
    await handle.close();
  }
};
