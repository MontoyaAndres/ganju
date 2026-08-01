import { utils } from '@ganju/utils';

// types
import type { EnvSource } from '@ganju/utils';

/**
 * Amazon SES v2 over `fetch`, signed with SigV4 using Web Crypto.
 *
 * The AWS SDK is not an option here: it pulls in Node built-ins and tens of
 * megabytes that a 128 MiB Worker shouldn't carry to send one email. SigV4 is
 * four HMACs and a hash, so it's signed inline instead.
 *
 * Credentials come from secrets, never from wrangler.toml:
 *   wrangler secret put AWS_SES_ACCESS_KEY_ID     --env production
 *   wrangler secret put AWS_SES_SECRET_ACCESS_KEY --env production
 */

const SERVICE = 'ses';
const ALGORITHM = 'AWS4-HMAC-SHA256';
const encoder = new TextEncoder();

const toHex = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
};

const hmac = async (
  key: ArrayBuffer | Uint8Array,
  data: string
): Promise<ArrayBuffer> => {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
};

// kSecret → kDate → kRegion → kService → kSigning, per the SigV4 spec.
const signingKey = async (
  secretAccessKey: string,
  dateStamp: string,
  region: string
): Promise<ArrayBuffer> => {
  const kDate = await hmac(encoder.encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, SERVICE);
  return hmac(kService, 'aws4_request');
};

export interface SesConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Read the SES configuration, or null when it isn't fully set — which is the
 * signal for callers to fall back to the Cloudflare `send_email` binding.
 */
export const getSesConfig = (source: EnvSource): SesConfig | null => {
  const region = utils.getEnv(source, 'AWS_SES_REGION');
  const accessKeyId = utils.getEnv(source, 'AWS_SES_ACCESS_KEY_ID');
  const secretAccessKey = utils.getEnv(source, 'AWS_SES_SECRET_ACCESS_KEY');

  if (!region || !accessKeyId || !secretAccessKey) return null;
  return { region, accessKeyId, secretAccessKey };
};

export interface SesEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export const sendViaSes = async (
  config: SesConfig,
  email: SesEmail
): Promise<boolean> => {
  const { region, accessKeyId, secretAccessKey } = config;
  const host = `email.${region}.amazonaws.com`;
  const path = '/v2/email/outbound-emails';

  const body = JSON.stringify({
    FromEmailAddress: email.from,
    Destination: { ToAddresses: [email.to] },
    ...(email.replyTo ? { ReplyToAddresses: [email.replyTo] } : {}),
    Content: {
      Simple: {
        Subject: { Data: email.subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: email.text, Charset: 'UTF-8' },
          ...(email.html
            ? { Html: { Data: email.html, Charset: 'UTF-8' } }
            : {})
        }
      }
    }
  });

  // 2026-08-01T12:00:00.000Z → 20260801T120000Z, and the 20260801 date stamp.
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = await utils.sha256Hex(body);
  const canonicalHeaders =
    `content-type:application/json\n` +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-date';

  const canonicalRequest = [
    'POST',
    path,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const scope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    ALGORITHM,
    amzDate,
    scope,
    await utils.sha256Hex(canonicalRequest)
  ].join('\n');

  const signature = toHex(
    await hmac(
      await signingKey(secretAccessKey, dateStamp, region),
      stringToSign
    )
  );

  const authorization =
    `${ALGORITHM} Credential=${accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Amz-Date': amzDate,
      Authorization: authorization
    },
    body
  });

  if (!response.ok) {
    // The response body carries SES's reason (unverified identity, sandbox
    // restriction, throttling) — worth logging, and it contains no secrets.
    const detail = await response.text().catch(() => '');
    console.error(`SES send failed (${response.status}): ${detail}`);
    return false;
  }

  return true;
};
