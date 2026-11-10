import { Context } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';
import {
  discoverOAuthProtectedResourceMetadata,
  discoverAuthorizationServerMetadata,
  registerClient,
  startAuthorization,
  exchangeAuthorization,
  refreshAuthorization
} from '@modelcontextprotocol/sdk/client/auth.js';
import type { AuthorizationServerMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';

// types
import type { AppEnv } from '../types';
import type { EnvSource } from '@ganju/utils';

// Notion (and most modern remote MCP servers) are their OWN OAuth authorization
// server — a token must be issued by the MCP server itself via dynamic client
// registration + PKCE (the MCP authorization spec), NOT by the vendor's separate
// API OAuth. This drives that flow with the MCP SDK helpers and persists all
// state on the artifact_credential row (provider = the catalog slug):
//   - tokens in the encrypted accessToken/refreshToken columns,
//   - the dynamic client registration + auth-server URL in metadata.mcpOauth,
//   - the PKCE verifier + CSRF nonce transiently (pending) until the code lands.
// No pre-registered app/client id is needed (dynamic registration replaces it),
// so this works for any OAuth-based remote MCP server, not just Notion.

interface StoredMcpOauth {
  // Canonical MCP server URL (RFC 8707 resource indicator) + its auth server.
  resource: string;
  authorizationServerUrl: string;
  // Dynamic client registration result. client_secret is encrypted.
  clientId: string;
  clientSecretEnc?: string;
  authMethod?: string;
  // Present only between begin and complete (the authorize→callback window).
  codeVerifierEnc?: string;
  state?: string;
  pending?: boolean;
}

export const readStoredMcpOauth = (
  metadata: unknown
): StoredMcpOauth | null => {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as { mcpOauth?: unknown }).mcpOauth;
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<StoredMcpOauth>;
  if (
    typeof s.resource !== 'string' ||
    typeof s.authorizationServerUrl !== 'string' ||
    typeof s.clientId !== 'string'
  ) {
    return null;
  }
  return s as StoredMcpOauth;
};

const callbackUrl = (c: Context<AppEnv>): string =>
  `${utils.getEnv(c, 'NEXT_PUBLIC_API_URL')}/oauth/mcp-proxy/callback`;

const clientInformationFrom = (
  c: EnvSource,
  stored: StoredMcpOauth
): { client_id: string; client_secret?: string } => {
  const key = utils.getCredentialEncryptionKey(c);
  return {
    client_id: stored.clientId,
    ...(stored.clientSecretEnc
      ? { client_secret: utils.decryptString(stored.clientSecretEnc, key) }
      : {})
  };
};

const resolveAuthServer = async (
  serverUrl: string
): Promise<{
  authServerUrl: string;
  metadata: AuthorizationServerMetadata;
}> => {
  const resourceMeta = await discoverOAuthProtectedResourceMetadata(
    serverUrl
  ).catch(() => undefined);
  const authServerUrl = resourceMeta?.authorization_servers?.[0] ?? serverUrl;
  const metadata = await discoverAuthorizationServerMetadata(authServerUrl);
  if (!metadata) {
    throw new Error("Could not discover the MCP server's OAuth configuration.");
  }
  return { authServerUrl, metadata };
};

/**
 * Step 1: discover the MCP server's auth server, dynamically register a client,
 * build the PKCE authorize URL, and persist a PENDING credential (registration +
 * verifier + CSRF nonce). Returns the authorize URL for the browser to redirect
 * to. No token exists yet.
 */
export const beginMcpProxyOauth = async (input: {
  c: Context<AppEnv>;
  dbInstance: ReturnType<typeof db.create>;
  server: { slug: string; url: string; name: string };
  artifactId: string;
  organizationId: string;
  projectId: string;
}): Promise<string> => {
  const { c, dbInstance, server, artifactId, organizationId, projectId } =
    input;
  const redirect = callbackUrl(c);

  const { authServerUrl, metadata } = await resolveAuthServer(server.url);

  const client = await registerClient(authServerUrl, {
    metadata,
    clientMetadata: {
      client_name: 'Ganju',
      redirect_uris: [redirect],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post'
    }
  });

  const nonce = utils.generateRandomToken(16);
  const state = utils.utf8ToBase64(
    JSON.stringify({ organizationId, projectId, slug: server.slug, nonce })
  );

  const { authorizationUrl, codeVerifier } = await startAuthorization(
    authServerUrl,
    {
      metadata,
      clientInformation: client,
      redirectUrl: redirect,
      state,
      resource: new URL(server.url)
    }
  );

  const key = utils.getCredentialEncryptionKey(c);
  const mcpOauth: StoredMcpOauth = {
    resource: server.url,
    authorizationServerUrl: authServerUrl,
    clientId: client.client_id,
    clientSecretEnc: client.client_secret
      ? utils.encryptString(client.client_secret, key)
      : undefined,
    authMethod: client.token_endpoint_auth_method,
    codeVerifierEnc: utils.encryptString(codeVerifier, key),
    state: nonce,
    pending: true
  };

  const [existing] = await dbInstance
    .select({ id: db.schema.artifactCredential.id })
    .from(db.schema.artifactCredential)
    .where(
      and(
        eq(db.schema.artifactCredential.provider, server.slug),
        eq(db.schema.artifactCredential.artifactId, artifactId)
      )
    )
    .limit(1);

  if (existing) {
    await dbInstance
      .update(db.schema.artifactCredential)
      .set({
        accessToken: '',
        refreshToken: null,
        expiresAt: null,
        scopes: null,
        metadata: { mcpOauth }
      })
      .where(eq(db.schema.artifactCredential.id, existing.id));
  } else {
    await dbInstance.insert(db.schema.artifactCredential).values({
      provider: server.slug,
      accessToken: '',
      refreshToken: null,
      artifactId,
      metadata: { mcpOauth }
    });
    await dbInstance
      .update(db.schema.artifact)
      .set({
        artifactCredentialCount: sql`(${db.schema.artifact.artifactCredentialCount}::int + 1)::int`
      })
      .where(eq(db.schema.artifact.id, artifactId));
  }

  return authorizationUrl.toString();
};

/**
 * Step 2 (OAuth callback): validate the state nonce, exchange the code (with the
 * stored PKCE verifier + dynamic client) for tokens, and persist them. Returns
 * where to send the user back to.
 */
export const completeMcpProxyOauth = async (input: {
  c: Context<AppEnv>;
  dbInstance: ReturnType<typeof db.create>;
  code: string;
  state: string;
}): Promise<{ slug: string; organizationId: string; projectId: string }> => {
  const { c, dbInstance, code, state } = input;

  let decoded: {
    organizationId?: string;
    projectId?: string;
    slug?: string;
    nonce?: string;
  };
  try {
    decoded = JSON.parse(utils.base64ToUtf8(state));
  } catch {
    throw new Error('Invalid OAuth state.');
  }
  const { organizationId, projectId, slug, nonce } = decoded;
  if (!organizationId || !projectId || !slug || !nonce) {
    throw new Error('Invalid OAuth state.');
  }

  const [artifact] = await dbInstance
    .select({ id: db.schema.artifact.id })
    .from(db.schema.artifact)
    .innerJoin(
      db.schema.project,
      eq(db.schema.artifact.projectId, db.schema.project.id)
    )
    .where(
      and(
        eq(db.schema.artifact.projectId, projectId),
        eq(db.schema.project.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!artifact) {
    throw new Error('Artifact not found for the project');
  }

  const [credential] = await dbInstance
    .select()
    .from(db.schema.artifactCredential)
    .where(
      and(
        eq(db.schema.artifactCredential.provider, slug),
        eq(db.schema.artifactCredential.artifactId, artifact.id)
      )
    )
    .limit(1);

  const stored = readStoredMcpOauth(credential?.metadata);
  if (!credential || !stored || !stored.pending || !stored.codeVerifierEnc) {
    throw new Error('No pending connection to complete.');
  }
  // CSRF: the nonce in the (untrusted) state must match the one we stored.
  if (stored.state !== nonce) {
    throw new Error('OAuth state mismatch.');
  }

  const key = utils.getCredentialEncryptionKey(c);
  const { metadata } = await resolveAuthServer(stored.resource);

  const tokens = await exchangeAuthorization(stored.authorizationServerUrl, {
    metadata,
    clientInformation: clientInformationFrom(c, stored),
    authorizationCode: code,
    codeVerifier: utils.decryptString(stored.codeVerifierEnc, key),
    redirectUri: callbackUrl(c),
    resource: new URL(stored.resource)
  });

  // Persist tokens; drop the transient PKCE/CSRF fields (no longer pending).
  const settled: StoredMcpOauth = {
    resource: stored.resource,
    authorizationServerUrl: stored.authorizationServerUrl,
    clientId: stored.clientId,
    clientSecretEnc: stored.clientSecretEnc,
    authMethod: stored.authMethod
  };
  await dbInstance
    .update(db.schema.artifactCredential)
    .set({
      accessToken: utils.encryptString(tokens.access_token, key),
      refreshToken: tokens.refresh_token
        ? utils.encryptString(tokens.refresh_token, key)
        : null,
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null,
      scopes: tokens.scope ?? null,
      metadata: { mcpOauth: settled }
    })
    .where(eq(db.schema.artifactCredential.id, credential.id));

  return { slug, organizationId, projectId };
};

interface ResolvableCredential {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string | null;
  metadata?: unknown;
}

/**
 * Decrypt an MCP-OAuth credential's access token, refreshing it in place when
 * it's expiring. Returns `needsReauth` when the credential is still pending (no
 * token yet) — the caller surfaces "connect first". Used by the discover/write
 * paths; the MCP worker has a parallel resolver for the runtime.
 */
export const resolveMcpProxyOauthSecret = async (input: {
  c: EnvSource;
  dbInstance: ReturnType<typeof db.create>;
  credential: ResolvableCredential;
}): Promise<{ secret: string; needsReauth: boolean }> => {
  const { c, dbInstance, credential } = input;
  const stored = readStoredMcpOauth(credential.metadata);
  if (!stored || stored.pending || !credential.accessToken) {
    return { secret: '', needsReauth: true };
  }

  const key = utils.getCredentialEncryptionKey(c);
  const accessPlain = utils.decryptString(credential.accessToken, key);

  const expiring =
    !!credential.refreshToken &&
    !!credential.expiresAt &&
    credential.expiresAt.getTime() -
      utils.constants.CREDENTIAL_REFRESH_BUFFER_MS <=
      Date.now();
  if (!expiring) {
    return { secret: accessPlain, needsReauth: false };
  }

  try {
    const { metadata } = await resolveAuthServer(stored.resource);
    const tokens = await refreshAuthorization(stored.authorizationServerUrl, {
      metadata,
      clientInformation: clientInformationFrom(c, stored),
      refreshToken: utils.decryptString(credential.refreshToken!, key),
      resource: new URL(stored.resource)
    });
    await dbInstance
      .update(db.schema.artifactCredential)
      .set({
        accessToken: utils.encryptString(tokens.access_token, key),
        refreshToken: tokens.refresh_token
          ? utils.encryptString(tokens.refresh_token, key)
          : credential.refreshToken,
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
        scopes: tokens.scope ?? credential.scopes
      })
      .where(eq(db.schema.artifactCredential.id, credential.id));
    return { secret: tokens.access_token, needsReauth: false };
  } catch {
    // Transient refresh failure — fall back to the existing token.
    return { secret: accessPlain, needsReauth: false };
  }
};
