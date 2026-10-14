import { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

import { providers } from './providers';

// types
import type { AppEnv } from '../types';

interface RefreshableCredential {
  id: string;
  provider: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string | null;
  metadata?: unknown;
}

/**
 * Decrypt an artifact credential's secret, refreshing an expired OAuth token in
 * place. Mirrors apps/mcp's refreshCredentialIfNeeded (the runtime path) but
 * uses apps/api's `providers` config for the token URL + client env names, so
 * configure-time discovery doesn't connect with a stale/expired token.
 *
 * Non-refreshable credentials (no refresh token — e.g. PATs/API keys) are
 * returned decrypted as-is. A credential already flagged for re-auth, or one
 * whose refresh is rejected, returns `needsReauth: true` so the caller can
 * surface a clear message instead of failing opaquely at the remote.
 */
export const refreshArtifactCredential = async (
  c: Context<AppEnv>,
  dbInstance: ReturnType<typeof db.create>,
  credential: RefreshableCredential
): Promise<{ secret: string; needsReauth: boolean }> => {
  const encryptionKey = utils.getCredentialEncryptionKey(c);
  const accessTokenPlain = utils.decryptString(
    credential.accessToken,
    encryptionKey
  );

  if (utils.isCredentialNeedingReauth(credential.metadata)) {
    return { secret: accessTokenPlain, needsReauth: true };
  }

  const refreshTokenPlain = credential.refreshToken
    ? utils.decryptString(credential.refreshToken, encryptionKey)
    : null;
  if (!refreshTokenPlain || !credential.expiresAt) {
    return { secret: accessTokenPlain, needsReauth: false };
  }
  if (
    credential.expiresAt.getTime() -
      utils.constants.CREDENTIAL_REFRESH_BUFFER_MS >
    Date.now()
  ) {
    return { secret: accessTokenPlain, needsReauth: false };
  }

  const providerConfig = providers[credential.provider];
  if (!providerConfig) {
    // An expiry we can't refresh (unknown/non-OAuth provider). Use as-is.
    return { secret: accessTokenPlain, needsReauth: false };
  }

  const clientId = utils.getEnv(c, providerConfig.clientIdEnv);
  const clientSecret = utils.getEnv(c, providerConfig.clientSecretEnv);
  if (!clientId || !clientSecret) {
    return { secret: accessTokenPlain, needsReauth: false };
  }

  const existingMetadata =
    credential.metadata && typeof credential.metadata === 'object'
      ? (credential.metadata as Record<string, unknown>)
      : null;

  try {
    const refreshed = await utils.refreshOAuthToken({
      tokenUrl: providerConfig.tokenUrl,
      clientId,
      clientSecret,
      refreshToken: refreshTokenPlain
    });
    const nextAccessToken = refreshed.accessToken;
    const nextRefreshToken = refreshed.refreshToken || refreshTokenPlain;
    const nextExpiresAt = refreshed.expiresIn
      ? new Date(Date.now() + refreshed.expiresIn * 1000)
      : null;

    await dbInstance
      .update(db.schema.artifactCredential)
      .set({
        accessToken: utils.encryptString(nextAccessToken, encryptionKey),
        refreshToken: utils.encryptString(nextRefreshToken, encryptionKey),
        expiresAt: nextExpiresAt,
        scopes: refreshed.scope || credential.scopes,
        metadata: utils.clearReauthMetadata(existingMetadata)
      })
      .where(eq(db.schema.artifactCredential.id, credential.id));

    return { secret: nextAccessToken, needsReauth: false };
  } catch (err) {
    const reauthReason = utils.refreshFailureReauthReason(
      err,
      credential.expiresAt
    );
    if (reauthReason) {
      await dbInstance
        .update(db.schema.artifactCredential)
        .set({
          metadata: utils.buildReauthMetadata(existingMetadata, reauthReason)
        })
        .where(eq(db.schema.artifactCredential.id, credential.id));
      return { secret: accessTokenPlain, needsReauth: true };
    }
    // Transient refresh failure — fall back to the existing token.
    return { secret: accessTokenPlain, needsReauth: false };
  }
};
