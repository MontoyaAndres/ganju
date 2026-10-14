import { constants } from './constants';

export interface RefreshOAuthTokenInput {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface RefreshedOAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
}

export class OAuthReauthRequiredError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(`OAuth reauth required (${code})`);
    this.name = 'OAuthReauthRequiredError';
    this.code = code;
  }
}

// The token endpoint answered with an error that isn't a reauth code. `status`
// tells a rejection (4xx) from an outage (5xx); a network failure never gets
// here, it throws fetch's own error.
export class OAuthRefreshError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, code: string | undefined, body: string) {
    super(`oauth refresh failed (${status}): ${body}`);
    this.name = 'OAuthRefreshError';
    this.status = status;
    this.code = code;
  }
}

const parseErrorCode = (body: string): string | undefined => {
  try {
    return (JSON.parse(body) as { error?: string })?.error;
  } catch {
    return undefined;
  }
};

export const refreshOAuthToken = async (
  input: RefreshOAuthTokenInput
): Promise<RefreshedOAuthToken> => {
  const response = await fetch(input.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken
    })
  });

  if (!response.ok) {
    const body = await response.text();
    const code = parseErrorCode(body);
    if (code && constants.REAUTH_ERROR_CODES.includes(code)) {
      throw new OAuthReauthRequiredError(code);
    }
    throw new OAuthRefreshError(response.status, code, body);
  }

  const tokens = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  if (!tokens.access_token) {
    throw new Error('oauth refresh missing access_token');
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    scope: tokens.scope
  };
};

export const buildReauthMetadata = (
  previous: Record<string, unknown> | null,
  reason: string
): Record<string, unknown> => ({
  ...(previous || {}),
  needsReauth: true,
  reauthReason: reason,
  reauthAt: new Date().toISOString()
});

export const clearReauthMetadata = (
  previous: Record<string, unknown> | null
): Record<string, unknown> | null => {
  if (!previous) return null;
  const next: Record<string, unknown> = { ...previous };
  delete next.needsReauth;
  delete next.reauthReason;
  delete next.reauthAt;
  return Object.keys(next).length > 0 ? next : null;
};

/**
 * Why a failed refresh should flag the credential for a reconnect, or null
 * when it shouldn't. A reauth code flags it at once. Any other rejection
 * (4xx) flags it only once the access token has been expired for
 * CREDENTIAL_REFRESH_GIVE_UP_MS, so a one-off doesn't. Never flagged: an
 * outage (5xx), a network error, rate limiting (429), and errors about our
 * own client id / secret, which no reconnect can fix.
 */
export const refreshFailureReauthReason = (
  err: unknown,
  expiresAt: Date | null,
  now = Date.now()
): string | null => {
  if (err instanceof OAuthReauthRequiredError) return err.code;
  if (!(err instanceof OAuthRefreshError)) return null;
  if (err.status < 400 || err.status >= 500 || err.status === 429) return null;
  if (err.code && constants.OAUTH_CLIENT_ERROR_CODES.includes(err.code)) {
    return null;
  }
  if (!expiresAt) return null;
  if (now - expiresAt.getTime() < constants.CREDENTIAL_REFRESH_GIVE_UP_MS) {
    return null;
  }
  return err.code ? `refresh_rejected:${err.code}` : 'refresh_rejected';
};

export const isCredentialNeedingReauth = (metadata: unknown): boolean => {
  if (!metadata || typeof metadata !== 'object') return false;
  return (metadata as Record<string, unknown>).needsReauth === true;
};
