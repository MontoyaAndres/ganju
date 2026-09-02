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
    throw new Error(`oauth refresh failed (${response.status}): ${body}`);
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

export const isCredentialNeedingReauth = (metadata: unknown): boolean => {
  if (!metadata || typeof metadata !== 'object') return false;
  return (metadata as Record<string, unknown>).needsReauth === true;
};
