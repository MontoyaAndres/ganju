import {
  bytesToBase64,
  toBase64Url,
  fromBase64Url,
  base64ToBytes
} from './base64';
import { constants } from './constants';

// The capability carried by the "stop these tools" link in a usage alert.
//
// The alert reaches whoever is on call wherever they are; until this existed the
// response did not — every containment step needed a shell holding the
// production database URL, so an abuse notice arriving away from a desk was an
// abuse notice nobody could act on for hours.
//
// A signed value rather than a row, for the same reason the tool token is one:
// there is nothing to revoke. The link lives minutes, does one narrow and fully
// reversible thing, and names in its own payload the only organization it can do
// it to.
//
// Two properties this must have, and both are about it travelling through email:
//
// - **Purpose-bound.** The payload carries `p`, checked on verify, so a token
//   signed with this deployment's secret for one job can never be replayed as
//   another. Domain separation is what makes sharing one secret safe.
// - **Not a GET.** Mail clients, link scanners and chat previews fetch URLs
//   without being asked. The link opens a page; a form POST on that page is what
//   acts. A capability that fires on preview is a capability someone else holds.
export interface ContainmentTokenPayload {
  // Token format version, so a future change to the payload is rejected rather
  // than misread.
  v: string;
  // Purpose. One value today; present so there can be a second.
  p: string;
  organizationId: string;
  iat: number;
  exp: number;
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

/**
 * Mint a containment link token for one organization.
 *
 * The lifetime is deliberately short. This is not a login: it is a thing you act
 * on while reading the mail that carried it, and an expiry measured in hours
 * means a forwarded thread or an archived inbox stops being a way in.
 */
export const mintContainmentToken = async (
  organizationId: string,
  secret: string,
  issuedAt: number = Date.now(),
  ttlMs: number = constants.CONTAINMENT_TOKEN_TTL_MS
): Promise<string> => {
  const body: ContainmentTokenPayload = {
    v: constants.CONTAINMENT_TOKEN_VERSION,
    p: constants.CONTAINMENT_PURPOSE_DISABLE_CUSTOM_CODE,
    organizationId,
    iat: Math.floor(issuedAt / 1000),
    // Rounded up so a stated lifetime is a floor rather than up to a second
    // short of one.
    exp: Math.ceil((issuedAt + ttlMs) / 1000)
  };
  const encodedPayload = toBase64Url(
    bytesToBase64(encoder.encode(JSON.stringify(body)))
  );
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(encodedPayload)
  );
  return `${encodedPayload}.${toBase64Url(bytesToBase64(new Uint8Array(signature)))}`;
};

/**
 * Verify a containment token and return its payload, or null when it is
 * malformed, expired, of an unknown format version, minted for another purpose,
 * or not signed by this deployment's secret.
 *
 * Null rather than a reason, so the page can answer every rejection identically:
 * a link that says *why* it failed tells whoever found it what to change.
 */
export const verifyContainmentToken = async (
  token: string,
  secret: string,
  now: number = Date.now()
): Promise<ContainmentTokenPayload | null> => {
  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;

  const encodedPayload = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const key = await importKey(secret);
  let valid: boolean;
  try {
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
  const candidate = parsed as Partial<ContainmentTokenPayload>;
  if (candidate.v !== constants.CONTAINMENT_TOKEN_VERSION) return null;
  if (candidate.p !== constants.CONTAINMENT_PURPOSE_DISABLE_CUSTOM_CODE) {
    return null;
  }
  if (
    typeof candidate.organizationId !== 'string' ||
    !candidate.organizationId
  ) {
    return null;
  }
  if (typeof candidate.exp !== 'number') return null;
  if (candidate.exp * 1000 <= now) return null;

  return candidate as ContainmentTokenPayload;
};
