import { Context } from 'hono';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';
import { getResourceHandler } from '@ganju/containers';

// types
import type { Database } from '@ganju/db';
import type {
  CustomCodeSendFile,
  GmailSendRequest,
  OutlookSendRequest,
  SlackSendRequest
} from '@ganju/utils';
import type { AppEnv } from '../types';

export type SendFileResult =
  | { ok: true; result: unknown }
  | { ok: false; status: 400 | 404 | 413 | 502; error: string };

// Per-destination byte ceilings, the same ones the native handlers enforce.
// Checked here rather than left to the vendor because the failure a user sees
// otherwise is a 400 from Gmail after the bytes have already been read out of
// R2, paid for, and pushed through two isolates.
const LIMITS = {
  [utils.constants.CUSTOM_CODE_SEND_FILE_TARGET_GMAIL]: {
    // Gmail's cap is on the COMBINED raw size — its 25MB limit applies after
    // base64 expansion, which is what makes the raw ceiling ~18MB.
    perFile: Number.POSITIVE_INFINITY,
    total: utils.constants.GMAIL_MAX_RAW_ATTACHMENT_BYTES,
    label: 'Gmail'
  },
  [utils.constants.CUSTOM_CODE_SEND_FILE_TARGET_OUTLOOK]: {
    perFile: utils.constants.OUTLOOK_MAX_ATTACHMENT_BYTES,
    total: utils.constants.OUTLOOK_MAX_ATTACHMENT_BYTES,
    label: 'Outlook'
  },
  [utils.constants.CUSTOM_CODE_SEND_FILE_TARGET_SLACK]: {
    // Slack uploads each file on its own, so only the per-file cap applies.
    perFile: utils.constants.SLACK_MAX_UPLOAD_BYTES,
    total: Number.POSITIVE_INFINITY,
    label: 'Slack'
  }
} as const;

const megabytes = (bytes: number): number => Math.round(bytes / (1024 * 1024));

/**
 * Build the `metadata` field the resource-handler container parses.
 *
 * Each destination gets exactly one operation. sendFile moves bytes a script
 * cannot hold; replying, forwarding and editing drafts are ordinary API calls a
 * script can make itself with ctx.connection().
 */
const buildMetadata = (
  request: CustomCodeSendFile,
  accessToken: string
): GmailSendRequest | OutlookSendRequest | SlackSendRequest => {
  if (request.to === utils.constants.CUSTOM_CODE_SEND_FILE_TARGET_GMAIL) {
    return {
      accessToken,
      operation: 'send-email',
      to: request.message.to,
      body: request.message.body,
      subject: request.message.subject,
      cc: request.message.cc,
      bcc: request.message.bcc,
      contentType: request.message.contentType,
      threadId: request.message.threadId
    };
  }

  if (request.to === utils.constants.CUSTOM_CODE_SEND_FILE_TARGET_OUTLOOK) {
    return {
      accessToken,
      operation: 'send-email',
      to: request.message.to,
      body: request.message.body,
      subject: request.message.subject,
      cc: request.message.cc,
      bcc: request.message.bcc,
      contentType: request.message.contentType
    };
  }

  return {
    accessToken,
    operation: 'upload-file',
    channel: request.message.channel,
    threadTs: request.message.threadTs,
    title: request.message.title,
    initialComment: request.message.initialComment
  };
};

/**
 * Deliver one or more of the artifact's resources to a connected destination.
 *
 * This is the capability a user script cannot reproduce: it is capped at 128MiB,
 * holds no R2 binding, and has no path to the resource-handler container. So the
 * script names resources and a destination, and the bytes travel R2 → broker →
 * container without ever entering the isolate that asked for them.
 *
 * The multipart shape is the one the three native handlers already speak, and
 * the container owns everything hard about it — MIME assembly for Gmail, Graph's
 * chunked upload sessions for Outlook, Slack's three-call external-upload flow.
 * Reimplementing any of that here is precisely what routing through the
 * container avoids.
 */
export const sendFile = async (
  c: Context<AppEnv>,
  dbInstance: Database,
  input: {
    artifactId: string;
    accessToken: string;
    request: CustomCodeSendFile;
  }
): Promise<SendFileResult> => {
  const { request } = input;
  const limits = LIMITS[request.to];

  const rows = await dbInstance
    .select()
    .from(db.schema.artifactResource)
    .where(
      and(
        eq(db.schema.artifactResource.artifactId, input.artifactId),
        inArray(db.schema.artifactResource.uri, request.uris)
      )
    );

  // Indexed and then walked in the caller's order: attachments arrive in the
  // order a mail client lists them, and a script that sends a cover page first
  // means it.
  //
  // Filtered first, and it matters: a website seed shares its page's uri and
  // carries no bytes, so an unfiltered map keyed by uri would resolve roughly
  // half of all crawled urls to the empty row and refuse to send a file that is
  // plainly there. Building the map from exposed rows only also makes the answer
  // the same one ctx.resources.read gives.
  const byUri = new Map(
    rows.filter(row => utils.isExposedResource(row)).map(row => [row.uri, row])
  );
  const missing = request.uris.filter(uri => !byUri.has(uri));
  if (missing.length > 0) {
    return {
      ok: false,
      status: 404,
      error: `Resource not found on this artifact: ${missing.join(', ')}`
    };
  }

  const form = new FormData();
  form.append(
    'metadata',
    JSON.stringify(buildMetadata(request, input.accessToken))
  );

  const bucket = c.env.STORAGE_BUCKET;
  let total = 0;

  for (const uri of request.uris) {
    const resource = byUri.get(uri)!;

    const resolved = await utils.resolveAttachment(
      resource,
      async key => {
        if (!bucket) return null;
        const object = await bucket.get(key);
        return object ? await object.arrayBuffer() : null;
      },
      request.to === utils.constants.CUSTOM_CODE_SEND_FILE_TARGET_SLACK
        ? 'upload'
        : 'attach'
    );

    if (!resolved.ok) {
      return { ok: false, status: 404, error: resolved.error };
    }

    const { bytes, mimeType, filename } = resolved.attachment;
    total += bytes.byteLength;

    if (bytes.byteLength > limits.perFile) {
      return {
        ok: false,
        status: 413,
        error: `"${filename}" exceeds ${limits.label}'s ${megabytes(limits.perFile)}MB per-file limit.`
      };
    }
    if (total > limits.total) {
      return {
        ok: false,
        status: 413,
        error: `These files exceed ${limits.label}'s ${megabytes(limits.total)}MB combined limit.`
      };
    }

    form.append('attachment', new Blob([bytes], { type: mimeType }), filename);
  }

  const path = utils.constants.CUSTOM_CODE_SEND_FILE_PATHS[request.to];
  const handler = getResourceHandler(c.env);
  const response = await handler.fetch(`http://resource-handler${path}`, {
    method: 'POST',
    body: form
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    return {
      ok: false,
      // 502 regardless of what the vendor said: the script asked us to send, and
      // the failure happened downstream of it. Passing a 401 straight back would
      // read inside the isolate as "your broker token is bad" when it means the
      // artifact's Gmail connection was revoked.
      status: 502,
      error: utils.describeVendorError(
        body,
        `${limits.label} rejected the send (${response.status})`
      )
    };
  }

  return { ok: true, result: await response.json() };
};
