import { Context } from 'hono';
import { and, eq } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

// types
import type { Database } from '@ganju/db';
import type { AppEnv } from '../types';

export interface ResolvedConnection {
  provider: string;
  accessToken: string;
  expiresAt: Date | null;
  needsReauth: boolean;
}

/**
 * Resolve one managed OAuth connection for an artifact into a short-lived access
 * token, refreshing it in place when it is at or near expiry.
 *
 * This is the single most important boundary in the custom-code runtime: user
 * code receives an ACCESS token and nothing else. The refresh token and the
 * client secret stay here, which is why the exchange cannot live in @ganju/sdk —
 * a library running inside the user's isolate would have to hold both.
 *
 * Mirrors apps/api's refreshArtifactCredential (configure time) and apps/mcp's
 * refreshCredentialIfNeeded (native tool calls); all three now read the same
 * provider table from @ganju/utils, so adding a provider is one edit.
 */
export const resolveConnection = async (
  c: Context<AppEnv>,
  dbInstance: Database,
  artifactId: string,
  provider: string
): Promise<ResolvedConnection | null> => {
  const [credential] = await dbInstance
    .select()
    .from(db.schema.artifactCredential)
    .where(
      and(
        eq(db.schema.artifactCredential.artifactId, artifactId),
        eq(db.schema.artifactCredential.provider, provider)
      )
    )
    .limit(1);

  if (!credential) return null;

  const encryptionKey = utils.getCredentialEncryptionKey(c);
  const accessTokenPlain = utils.decryptString(
    credential.accessToken,
    encryptionKey
  );

  const base: ResolvedConnection = {
    provider,
    accessToken: accessTokenPlain,
    expiresAt: credential.expiresAt,
    needsReauth: false
  };

  if (utils.isCredentialNeedingReauth(credential.metadata)) {
    return { ...base, needsReauth: true };
  }

  const refreshTokenPlain = credential.refreshToken
    ? utils.decryptString(credential.refreshToken, encryptionKey)
    : null;

  // No refresh token (an API key or a PAT) or no expiry: nothing to refresh, and
  // the stored value is already the credential.
  if (!refreshTokenPlain || !credential.expiresAt) return base;
  if (
    credential.expiresAt.getTime() -
      utils.constants.CREDENTIAL_REFRESH_BUFFER_MS >
    Date.now()
  ) {
    return base;
  }

  const providerConfig = utils.oauthProviders[provider];
  if (!providerConfig) return base;

  const clientId = utils.getEnv(c, providerConfig.clientIdEnv);
  const clientSecret = utils.getEnv(c, providerConfig.clientSecretEnv);
  if (!clientId || !clientSecret) return base;

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

    return {
      provider,
      accessToken: nextAccessToken,
      expiresAt: nextExpiresAt,
      needsReauth: false
    };
  } catch (error) {
    if (error instanceof utils.OAuthReauthRequiredError) {
      await dbInstance
        .update(db.schema.artifactCredential)
        .set({
          metadata: utils.buildReauthMetadata(existingMetadata, error.code)
        })
        .where(eq(db.schema.artifactCredential.id, credential.id));
      return { ...base, needsReauth: true };
    }
    // Transient refresh failure — hand back the token we have rather than
    // failing the tool call outright; the provider may still accept it.
    return base;
  }
};

/**
 * Look up one per-tool custom-code secret by its label.
 *
 * custom-code secrets are addressed by label rather than by id because a script
 * says `ctx.secret('stripe-key')` — there is no id to hold. Labels aren't unique
 * by construction, so the newest matching row wins, matching what the dashboard
 * shows as the current value.
 */
export const resolveSecret = async (
  c: Context<AppEnv>,
  dbInstance: Database,
  artifactId: string,
  name: string
): Promise<string | null> => {
  const rows = await dbInstance
    .select()
    .from(db.schema.artifactCredential)
    .where(
      and(
        eq(db.schema.artifactCredential.artifactId, artifactId),
        eq(
          db.schema.artifactCredential.provider,
          utils.constants.CREDENTIAL_PROVIDER_CUSTOM_CODE
        )
      )
    );

  const matching = rows
    .filter(row => {
      const metadata =
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as { label?: unknown })
          : null;
      return metadata?.label === name;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const credential = matching[0];
  if (!credential) return null;

  return utils.decryptString(
    credential.accessToken,
    utils.getCredentialEncryptionKey(c)
  );
};
