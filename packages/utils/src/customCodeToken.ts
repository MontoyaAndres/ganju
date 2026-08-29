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
 * The legacy dispatch-namespace script name for an artifact: `artifact_<id>`.
 *
 * The id, never the slug — slugs are user-editable and a rename would orphan the
 * deployed script while the database still pointed at a live version.
 *
 * Nothing uploads to this name any more; every deploy mints its own. It survives
 * as the fallback for a version published before `script_name` existed, whose
 * bundle really is sitting under this name. Tightening a rule must never stop an
 * already-published version from serving, because that failure is invisible to
 * whoever owns it — the same reason the boot loop still accepts a stored tool key
 * the current catalog no longer offers.
 */
export const customCodeScriptName = (artifactId: string): string =>
  `${constants.CUSTOM_CODE_SCRIPT_NAME_PREFIX}${artifactId}`;

/**
 * The legacy preview script name: `artifact_<id>_preview`.
 *
 * Kept for the same reason as the one above, and for one more: it is the prefix
 * the sweep matches to recognise a preview script left behind by a test run that
 * did not clean up after itself.
 */
export const customCodePreviewScriptName = (artifactId: string): string =>
  `${customCodeScriptName(artifactId)}${constants.CUSTOM_CODE_PREVIEW_SCRIPT_SUFFIX}`;

/**
 * A dispatch-namespace name no upload has ever used:
 * `artifact_<id>_<12 hex chars>`.
 *
 * Minted rather than derived, and that is the entire design. Uploading over an
 * existing name is not read-your-writes — a replacement can serve the previous
 * edition for tens of seconds — so a deploy that always writes to a new name is
 * correct by construction rather than by waiting to see whether it worked.
 *
 * The suffix deliberately carries no meaning. The two candidates that did are
 * both wrong: the bundle digest collides whenever a deploy reverts to bytes that
 * shipped before, which is exactly what a rollback is, and the version id is one
 * string across every re-upload of a single draft, which is every test run of it.
 *
 * Twelve hex characters is what fits. Worker names cap at 63 and
 * `artifact_<uuid>` spends 45 of them.
 */
export const customCodeUploadName = (artifactId: string): string =>
  mintUploadName(customCodeScriptName(artifactId));

/**
 * A preview name no test run has ever used:
 * `artifact_<id>_preview_<12 hex chars>`.
 *
 * The sharper version of the same race. Every test used to deploy over one
 * preview name, so a test could report the run before it — which reads as "my
 * edit did nothing" from the one tool whose whole job is to say what an edit
 * does. Nothing stores this: it is minted, used, and deleted inside one request.
 */
export const customCodePreviewUploadName = (artifactId: string): string =>
  mintUploadName(customCodePreviewScriptName(artifactId));

/**
 * Append `_<hex>` to a base name, spending whatever the 63-character ceiling
 * leaves and no more.
 *
 * The budget is genuinely tight, and the two names spend it differently:
 *
 * | name | base | separator | suffix | total |
 * |---|---|---|---|---|
 * | live | `artifact_<uuid>` = 45 | 1 | 12 | 58 |
 * | preview | + `_preview` = 53 | 1 | 8 | 62 |
 *
 * Twelve hex characters is 48 bits and eight is 32, against a namespace holding
 * a few hundred names for any one artifact — and a preview name lives for the
 * seconds one test run takes. Neither is a collision worth checking for, and an
 * upload to a name already in use fails loudly rather than quietly serving the
 * wrong code, which is the failure that matters.
 *
 * The ceiling is asserted rather than assumed: it is one number away from being
 * silently exceeded by a longer prefix, and a name Cloudflare refuses would
 * surface as a failed publish with nothing explaining why.
 */
const mintUploadName = (base: string): string => {
  const available = constants.CUSTOM_CODE_SCRIPT_NAME_MAX - base.length - 1;
  // Even, because each byte renders as two hex characters.
  const chars =
    Math.min(constants.CUSTOM_CODE_UPLOAD_SUFFIX_CHARS, available) & ~1;

  if (chars < 4) {
    throw new Error(
      `A dispatch script name based on "${base}" leaves no room for a unique suffix.`
    );
  }

  const bytes = new Uint8Array(chars / 2);
  crypto.getRandomValues(bytes);

  return `${base}_${Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')}`;
};
