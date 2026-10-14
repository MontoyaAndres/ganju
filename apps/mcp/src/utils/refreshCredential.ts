import { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

import { readStoredMcpOauth, refreshMcpOauthRuntime } from './mcpOauth';

import { AppEnv } from '../types';

interface RefreshableCredential {
  id: string;
  provider: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string | null;
  metadata?: unknown;
  needsReauth?: boolean;
  // The refresh failed for a reason other than a revoked grant, and the access
  // token it would have replaced has already expired: calling the vendor with
  // it can only fail, with a message that reads like a broken connection.
  refreshFailed?: boolean;
}

// A failed refresh is usually the token endpoint or the network hiccuping, and
// the retry a moment later works. One retry inside the request saves the tool
// call; more would hold the whole MCP boot up.
const REFRESH_RETRY_DELAY_MS = 300;

const ENV_NAMES: Record<
  string,
  { clientIdEnv: string; clientSecretEnv: string }
> = {
  [utils.constants.OAUTH_PROVIDER_GOOGLE_GMAIL]: {
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET'
  },
  [utils.constants.OAUTH_PROVIDER_GOOGLE_DRIVE]: {
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET'
  },
  [utils.constants.OAUTH_PROVIDER_GOOGLE_CALENDAR]: {
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET'
  },
  [utils.constants.OAUTH_PROVIDER_MICROSOFT_OUTLOOK]: {
    clientIdEnv: 'MICROSOFT_CLIENT_ID',
    clientSecretEnv: 'MICROSOFT_CLIENT_SECRET'
  },
  [utils.constants.OAUTH_PROVIDER_ONE_DRIVE]: {
    clientIdEnv: 'MICROSOFT_CLIENT_ID',
    clientSecretEnv: 'MICROSOFT_CLIENT_SECRET'
  },
  [utils.constants.OAUTH_PROVIDER_SLACK]: {
    clientIdEnv: 'SLACK_CLIENT_ID',
    clientSecretEnv: 'SLACK_CLIENT_SECRET'
  },
  [utils.constants.OAUTH_PROVIDER_SLACK_USER]: {
    clientIdEnv: 'SLACK_CLIENT_ID',
    clientSecretEnv: 'SLACK_CLIENT_SECRET'
  }
};

export const refreshCredentialIfNeeded = async (
  ctx: Context<AppEnv>,
  credential: RefreshableCredential
): Promise<RefreshableCredential> => {
  // MCP-OAuth credentials (mcp-proxy oauth servers) refresh against the MCP
  // server's own auth server, not the native provider token URLs.
  if (readStoredMcpOauth(credential.metadata)) {
    return refreshMcpOauthRuntime(ctx, credential);
  }

  const encryptionKey = utils.getCredentialEncryptionKey(ctx);
  const accessTokenPlain = utils.decryptString(
    credential.accessToken,
    encryptionKey
  );
  const refreshTokenPlain = credential.refreshToken
    ? utils.decryptString(credential.refreshToken, encryptionKey)
    : null;
  const existingMetadata =
    credential.metadata && typeof credential.metadata === 'object'
      ? (credential.metadata as Record<string, unknown>)
      : null;
  const alreadyNeedsReauth = utils.isCredentialNeedingReauth(
    credential.metadata
  );
  const decrypted: RefreshableCredential = {
    ...credential,
    accessToken: accessTokenPlain,
    refreshToken: refreshTokenPlain,
    needsReauth: alreadyNeedsReauth
  };

  if (alreadyNeedsReauth) return decrypted;
  if (!refreshTokenPlain) return decrypted;
  if (!credential.expiresAt) return decrypted;
  if (
    credential.expiresAt.getTime() -
      utils.constants.CREDENTIAL_REFRESH_BUFFER_MS >
    Date.now()
  ) {
    return decrypted;
  }

  const tokenUrl = utils.constants.OAUTH_TOKEN_URLS[credential.provider];
  const envConfig = ENV_NAMES[credential.provider];
  if (!tokenUrl || !envConfig) return decrypted;

  const clientId = utils.getEnv(ctx, envConfig.clientIdEnv);
  const clientSecret = utils.getEnv(ctx, envConfig.clientSecretEnv);
  if (!clientId || !clientSecret) return decrypted;

  const refresh = () =>
    utils.refreshOAuthToken({
      tokenUrl,
      clientId,
      clientSecret,
      refreshToken: refreshTokenPlain
    });

  let refreshed;
  try {
    refreshed = await refresh().catch(async err => {
      if (err instanceof utils.OAuthReauthRequiredError) throw err;
      await new Promise(resolve => setTimeout(resolve, REFRESH_RETRY_DELAY_MS));
      return refresh();
    });
  } catch (err) {
    if (err instanceof utils.OAuthReauthRequiredError) {
      const dbInstance = db.create(ctx);
      await dbInstance
        .update(db.schema.artifactCredential)
        .set({
          metadata: utils.buildReauthMetadata(existingMetadata, err.code)
        })
        .where(eq(db.schema.artifactCredential.id, credential.id));
      return { ...decrypted, needsReauth: true };
    }
    console.error(
      `credential-refresh-failed ${credential.provider} ${credential.id}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    // Inside the buffer the old token still works for this request.
    return {
      ...decrypted,
      refreshFailed: credential.expiresAt.getTime() <= Date.now()
    };
  }

  const nextAccessToken = refreshed.accessToken;
  const nextRefreshToken = refreshed.refreshToken || refreshTokenPlain;
  const nextExpiresAt = refreshed.expiresIn
    ? new Date(Date.now() + refreshed.expiresIn * 1000)
    : null;
  const nextScopes = refreshed.scope || credential.scopes;

  const dbInstance = db.create(ctx);
  await dbInstance
    .update(db.schema.artifactCredential)
    .set({
      accessToken: utils.encryptString(nextAccessToken, encryptionKey),
      refreshToken: utils.encryptString(nextRefreshToken, encryptionKey),
      expiresAt: nextExpiresAt,
      scopes: nextScopes,
      metadata: utils.clearReauthMetadata(existingMetadata)
    })
    .where(eq(db.schema.artifactCredential.id, credential.id));

  return {
    ...credential,
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    expiresAt: nextExpiresAt,
    scopes: nextScopes
  };
};
