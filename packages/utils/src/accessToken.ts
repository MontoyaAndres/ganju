import { constants } from './constants';

/**
 * Minting and recognising a personal access token.
 *
 * The value exists in plaintext exactly once — in the response to the request
 * that created it — and what the database holds is its SHA-256. That is the
 * property the whole credential rests on: a leaked backup, a stray log line, or
 * a support engineer reading the row learns nothing they could present as the
 * token, and there is no path in the product that can print one back, because
 * there is nothing to print.
 *
 * SHA-256 rather than a password hash on purpose. A password is a low-entropy
 * secret a person chose, so the cost of hashing it is what stands between a
 * stolen table and the passwords in it; this is 32 bytes from a CSPRNG, where
 * that cost buys nothing and would be paid on every authenticated request. It
 * is also the hash `oauth_client.client_secret` already uses in this system, so
 * there is one answer here to "how is a machine credential stored".
 */

const HINT_SEPARATOR = '…';

const base64url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

/** The SHA-256 of a presented token, in the encoding the column stores. */
export const hashAccessToken = async (token: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token)
  );
  return base64url(new Uint8Array(digest));
};

/**
 * Cheap enough to run before the database is touched: a bearer token that does
 * not carry the prefix is an OAuth token, and belongs on the other path.
 */
export const isAccessToken = (token: string): boolean =>
  token.startsWith(constants.ACCESS_TOKEN_PREFIX);

/**
 * What the dashboard shows beside a token's name.
 *
 * Enough to tell two rows apart when someone is deciding which to revoke, and
 * deliberately taken from the *front* of the secret rather than the end: a
 * prefix narrows a brute-force search by exactly as much as a suffix would, and
 * a value people are used to seeing truncated at the end reads as complete when
 * it is the end that is shown.
 */
export const accessTokenHint = (token: string): string =>
  `${token.slice(
    0,
    constants.ACCESS_TOKEN_PREFIX.length + constants.ACCESS_TOKEN_HINT_CHARS
  )}${HINT_SEPARATOR}`;

export interface MintedAccessToken {
  /** The only time this value exists. Returned to the caller, never stored. */
  token: string;
  tokenHash: string;
  hint: string;
}

export const mintAccessToken = async (): Promise<MintedAccessToken> => {
  const bytes = new Uint8Array(constants.ACCESS_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  const token = `${constants.ACCESS_TOKEN_PREFIX}${base64url(bytes)}`;
  return {
    token,
    tokenHash: await hashAccessToken(token),
    hint: accessTokenHint(token)
  };
};
