import { Context } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@anju/db';
import { utils } from '@anju/utils';

import { oauthState, providers } from '../../utils';

// types
import { AppEnv } from '../../types';

const authorize = async (c: Context<AppEnv>) => {
  const provider = c.req.param('provider');
  const query = c.req.query();
  const organizationId = query.organizationId;
  const projectId = query.projectId;
  const scopes = query.scopes;

  if (!organizationId || !projectId) {
    throw new Error('organizationId and projectId are required');
  }

  const providerConfig = providers[provider];
  if (!providerConfig) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const clientId = utils.getEnv(c, providerConfig.clientIdEnv as string);

  if (!clientId) {
    throw new Error(`Missing env: ${providerConfig.clientIdEnv}`);
  }

  const callbackUrl = `${utils.getEnv(c, 'NEXT_PUBLIC_API_URL')}/oauth/${provider}/callback`;

  const state = oauthState.encode({
    organizationId,
    projectId,
    provider
  });

  const resolvedScopes = scopes
    ? scopes.split(',')
    : providerConfig.defaultScopes;

  // Slack provider variants put their scopes under different query params:
  // `slack` (bot) → scope=, `slack-user` → user_scope=. Other providers
  // default to `scope=`.
  const scopeParam = providerConfig.scopeParam || 'scope';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    [scopeParam]: resolvedScopes.join(' '),
    state,
    access_type: 'offline',
    prompt: 'consent'
  });

  const authorizationUrl = `${providerConfig.authUrl}?${params.toString()}`;

  return c.json({ url: authorizationUrl });
};

const callback = async (c: Context<AppEnv>) => {
  const provider = c.req.param('provider');
  const query = c.req.query();
  const code = query.code;
  const stateParam = query.state;

  if (!code || !stateParam) {
    throw new Error('Missing code or state parameter');
  }

  const providerConfig = providers[provider];
  if (!providerConfig) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const state = oauthState.decode(stateParam);
  const { organizationId, projectId } = state;

  if (!organizationId || !projectId) {
    throw new Error('Invalid state: missing organizationId or projectId');
  }

  const clientId = utils.getEnv(c, providerConfig.clientIdEnv);
  const clientSecret = utils.getEnv(c, providerConfig.clientSecretEnv);

  if (!clientId || !clientSecret) {
    throw new Error(
      `Missing env: ${providerConfig.clientIdEnv} or ${providerConfig.clientSecretEnv}`
    );
  }

  const callbackUrl = `${utils.getEnv(c, 'NEXT_PUBLIC_API_URL')}/oauth/${provider}/callback`;

  const tokenBody: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: callbackUrl
  };
  // Slack's oauth.v2.access returns internal_error when grant_type is sent
  // on the code-exchange call; Google/Microsoft require it.
  if (!providerConfig.omitGrantType) {
    tokenBody.grant_type = 'authorization_code';
  }

  const tokenResponse = await fetch(providerConfig.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(tokenBody)
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const tokens: {
    ok?: boolean;
    error?: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    // Slack OAuth v2 nests the user-token response under authed_user when
    // user_scope was requested. The `slack-user` provider uses
    // tokenSource='authed_user' to read from here instead of top level.
    authed_user?: {
      id?: string;
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
  } = await tokenResponse.json();

  // Slack returns HTTP 200 even on errors — surface them as failures.
  if (tokens.ok === false) {
    throw new Error(`Token exchange failed: ${tokens.error || 'unknown'}`);
  }

  // Pull credential fields from whichever bucket the provider config points
  // at. Everything except slack-user reads from top level.
  const tokenFields =
    providerConfig.tokenSource === 'authed_user' ? tokens.authed_user : tokens;
  if (!tokenFields?.access_token) {
    throw new Error('Token exchange returned no access_token');
  }

  const encryptionKey = utils.getCredentialEncryptionKey(c);
  const encryptedAccessToken = utils.encryptString(
    tokenFields.access_token,
    encryptionKey
  );
  const encryptedRefreshToken = tokenFields.refresh_token
    ? utils.encryptString(tokenFields.refresh_token, encryptionKey)
    : null;
  const grantedScopes = tokenFields.scope || null;
  const expiresInSeconds = tokenFields.expires_in;

  const dbInstance = db.create(c);

  await dbInstance.transaction(async tx => {
    const [project] = await tx
      .select()
      .from(db.schema.project)
      .where(
        and(
          eq(db.schema.project.id, projectId),
          eq(db.schema.project.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!project) {
      throw new Error('Project not found');
    }

    const [currentArtifactByProject] = await tx
      .select()
      .from(db.schema.artifact)
      .where(eq(db.schema.artifact.projectId, projectId))
      .limit(1);

    if (!currentArtifactByProject) {
      throw new Error('Artifact not found for the project');
    }

    const [existingCredential] = await tx
      .select()
      .from(db.schema.artifactCredential)
      .where(
        and(
          eq(
            db.schema.artifactCredential.artifactId,
            currentArtifactByProject.id
          ),
          eq(db.schema.artifactCredential.provider, provider)
        )
      )
      .limit(1);

    const expiresAt = expiresInSeconds
      ? new Date(Date.now() + expiresInSeconds * 1000)
      : null;

    if (existingCredential) {
      const previousMetadata =
        existingCredential.metadata &&
        typeof existingCredential.metadata === 'object'
          ? (existingCredential.metadata as Record<string, unknown>)
          : null;
      let nextMetadata: Record<string, unknown> | null = null;
      if (previousMetadata) {
        const cleaned: Record<string, unknown> = { ...previousMetadata };
        delete cleaned.needsReauth;
        delete cleaned.reauthReason;
        delete cleaned.reauthAt;
        nextMetadata = Object.keys(cleaned).length > 0 ? cleaned : null;
      }

      await tx
        .update(db.schema.artifactCredential)
        .set({
          accessToken: encryptedAccessToken,
          refreshToken:
            encryptedRefreshToken || existingCredential.refreshToken,
          expiresAt,
          scopes: grantedScopes || existingCredential.scopes,
          metadata: nextMetadata
        })
        .where(eq(db.schema.artifactCredential.id, existingCredential.id));
    } else {
      await tx.insert(db.schema.artifactCredential).values({
        provider,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
        scopes: grantedScopes,
        artifactId: currentArtifactByProject.id
      });

      await tx
        .update(db.schema.artifact)
        .set({
          artifactCredentialCount: sql`(${db.schema.artifact.artifactCredentialCount}::int + 1)::int`
        })
        .where(eq(db.schema.artifact.id, currentArtifactByProject.id));
    }
  });

  const targetPage =
    provider === utils.constants.OAUTH_PROVIDER_GOOGLE_DRIVE ||
    provider === utils.constants.OAUTH_PROVIDER_ONE_DRIVE
      ? 'resources'
      : 'tools';
  const redirectUrl = `${utils.getEnv(c, 'NEXT_PUBLIC_WEB_URL')}/organization/${organizationId}/project/${projectId}/${targetPage}?connected=${provider}`;

  return c.redirect(redirectUrl);
};

export const OAuthController = {
  authorize,
  callback
};
