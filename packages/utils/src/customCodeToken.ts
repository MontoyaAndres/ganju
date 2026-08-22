import {
  bytesToBase64,
  toBase64Url,
  fromBase64Url,
  base64ToBytes
} from './base64';
import { constants } from './constants';

// The credential a deployed user script uses to call the broker.
//
// A service binding carries no caller identity — the broker sees a request from
// "some script in the namespace" and nothing more — so the script has to present
// something that names it. That something is minted here at publish time,
// injected as the script's `GANJU_TOOL_TOKEN` secret binding, and verified by the
// broker on every call.
//
// It is a signed value rather than a random string checked against a table for
// one reason: revocation is already free. The token names the version it was
// minted for, and the broker refuses any token whose version is no longer the
// artifact's active one — a check it performs against a row it has to read
// anyway (the tool config, for the connection allow-list). Publishing a new
// version therefore invalidates every older token without a second write, and
// there is no token table to keep in step with the version table.
export interface CustomCodeTokenPayload {
  // Token format version, so a future change to the payload can be rejected
  // rather than misread.
  v: string;
  artifactId: string;
  // The artifact_tool_version this token was minted for. Checked against
  // config.activeVersionId by the broker, which is what makes rotation real.
  versionId: string;
  // Issued-at, seconds. Not used as an expiry — the version check is the
  // lifetime — but it makes two tokens for the same version distinguishable in
  // logs, and gives an operator something to reason about.
  iat: number;
  // Minted for a test run rather than for a published version.
  //
  // The distinction matters to the broker and nowhere else: a preview token
  // names a version that is deliberately NOT the active one, so the check that
  // gives a live token its lifetime cannot apply to it. In exchange it carries
  // an expiry, which a live token does not need.
  preview?: boolean;
  // Expiry, seconds. Present on preview tokens, absent on live ones. Checked
  // whenever present, so adding it to live tokens later needs no broker change.
  exp?: number;
}

const encoder = new TextEncoder();

const importKey = (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );

const signPayload = async (
  encodedPayload: string,
  secret: string
): Promise<string> => {
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(encodedPayload)
  );
  return toBase64Url(bytesToBase64(new Uint8Array(signature)));
};

/**
 * Mint a tool token for one artifact + version. Called by the publish pipeline
 * immediately before upload; the result is written as a `secret_text` binding so
 * it never appears in the bundle the user can read back.
 */
export const mintCustomCodeToken = async (
  payload: Omit<CustomCodeTokenPayload, 'v' | 'iat' | 'exp'> & {
    ttlMs?: number;
  },
  secret: string,
  issuedAt: number = Date.now()
): Promise<string> => {
  const body: CustomCodeTokenPayload = {
    v: constants.CUSTOM_CODE_TOKEN_VERSION,
    artifactId: payload.artifactId,
    versionId: payload.versionId,
    iat: Math.floor(issuedAt / 1000),
    ...(payload.preview ? { preview: true } : {}),
    // Rounded up, not down: `exp` is in seconds, and truncating would make a
    // stated ten-minute lifetime end up to a second early. A ceiling means the
    // TTL is a floor, which is what the caller asked for.
    ...(payload.ttlMs
      ? { exp: Math.ceil((issuedAt + payload.ttlMs) / 1000) }
      : {})
  };
  const encodedPayload = toBase64Url(
    bytesToBase64(encoder.encode(JSON.stringify(body)))
  );
  const signature = await signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
};

/**
 * Verify a tool token and return its payload, or null when it is malformed, of
 * an unknown format version, or not signed by this deployment's secret.
 *
 * Returning null rather than throwing keeps the broker's failure path uniform:
 * every rejection is the same 401, so a caller learns nothing about which check
 * failed.
 */
export const verifyCustomCodeToken = async (
  token: string,
  secret: string,
  now?: number
): Promise<CustomCodeTokenPayload | null> => {
  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;

  const encodedPayload = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const key = await importKey(secret);
  let valid: boolean;
  try {
    // Copied into a fresh view so its backing store is a plain ArrayBuffer —
    // base64ToBytes is typed against ArrayBufferLike, which subtle.verify's
    // BufferSource parameter does not accept.
    const signatureBytes = new Uint8Array(
      base64ToBytes(fromBase64Url(signature))
    );
    valid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      encoder.encode(encodedPayload)
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder().decode(base64ToBytes(fromBase64Url(encodedPayload)))
    );
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const candidate = parsed as Partial<CustomCodeTokenPayload>;
  if (candidate.v !== constants.CUSTOM_CODE_TOKEN_VERSION) return null;
  if (typeof candidate.artifactId !== 'string' || !candidate.artifactId) {
    return null;
  }
  if (typeof candidate.versionId !== 'string' || !candidate.versionId) {
    return null;
  }

  // Checked here rather than in the broker so every caller gets it: a token past
  // its expiry is as good as unsigned.
  if (
    typeof candidate.exp === 'number' &&
    candidate.exp * 1000 <= (now ?? Date.now())
  ) {
    return null;
  }

  return {
    v: candidate.v,
    artifactId: candidate.artifactId,
    versionId: candidate.versionId,
    iat: typeof candidate.iat === 'number' ? candidate.iat : 0,
    ...(candidate.preview === true ? { preview: true } : {}),
    ...(typeof candidate.exp === 'number' ? { exp: candidate.exp } : {})
  };
};

/**
 * The dispatch-namespace script name for an artifact: `artifact_<id>`.
 *
 * The id, never the slug — slugs are user-editable and a rename would orphan the
 * deployed script while the database still pointed at a live version.
 */
export const customCodeScriptName = (artifactId: string): string =>
  `${constants.CUSTOM_CODE_SCRIPT_NAME_PREFIX}${artifactId}`;

/**
 * The script name a test run deploys into: `artifact_<id>_preview`.
 *
 * A second script rather than a second version of the live one, because a test
 * must not be able to disturb what MCP clients are being served — and the only
 * way to be certain of that is for it to run under a name nothing dispatches to.
 */
export const customCodePreviewScriptName = (artifactId: string): string =>
  `${customCodeScriptName(artifactId)}${constants.CUSTOM_CODE_PREVIEW_SCRIPT_SUFFIX}`;
