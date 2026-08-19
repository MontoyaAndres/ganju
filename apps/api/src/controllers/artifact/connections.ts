import { Context } from 'hono';
import { utils } from '@ganju/utils';

// types
import type { db } from '@ganju/db';
import type { AppEnv } from '../../types';

type ArtifactCredentialRow = typeof db.schema.artifactCredential.$inferSelect;

/**
 * One managed OAuth provider, as it stands on a single artifact.
 *
 * `provider` is the identifier everything else keys on: a custom-code tool lists
 * it in `config.connections` and asks for it by name from inside the script, and
 * an http-endpoint tool references the credential it produced by id. Both of
 * those used to reach into artifact_credential and the provider table separately;
 * this is the one shape they now share.
 */
export interface ArtifactConnection {
  provider: string;
  // The artifact_credential row backing it, or null when nothing is connected.
  // http-endpoint's `auth.credentialId` points at exactly this.
  credentialId: string | null;
  connected: boolean;
  // A refresh has failed in a way only the user can fix. The credential still
  // exists, so `connected` stays true — the distinction matters, because the fix
  // is re-linking rather than connecting for the first time.
  needsReauth: boolean;
  expiresAt: string | null;
  scopes: string | null;
  // Whether this deployment holds the client id AND secret for the provider's
  // managed app. False means the Connect button cannot work here however the UI
  // renders it — worth knowing before it is offered.
  configured: boolean;
  // Whose OAuth app the connection runs on. Always the platform's today; the
  // field exists so a per-organization app can be reported here without every
  // consumer having to learn a new shape when it lands.
  app: 'managed';
}

/**
 * Fold the artifact's stored credentials into the provider table, so every
 * provider we can connect is reported whether or not it has been.
 *
 * Driven by the provider table rather than by the rows: "which providers exist,
 * and which of those are connected" is the question both callers actually ask,
 * and answering it from the rows alone can only ever describe the past.
 * Non-OAuth credentials (per-tool http-endpoint secrets, API keys) are not
 * connections and never appear here.
 */
export const buildArtifactConnections = (
  c: Context<AppEnv>,
  credentials: ArtifactCredentialRow[]
): ArtifactConnection[] => {
  const byProvider = new Map(credentials.map(row => [row.provider, row]));

  return Object.entries(utils.oauthProviders).map(([provider, config]) => {
    const credential = byProvider.get(provider) ?? null;

    return {
      provider,
      credentialId: credential?.id ?? null,
      connected: Boolean(credential),
      needsReauth: credential
        ? utils.isCredentialNeedingReauth(credential.metadata)
        : false,
      expiresAt: credential?.expiresAt
        ? credential.expiresAt.toISOString()
        : null,
      scopes: credential?.scopes ?? null,
      configured: Boolean(
        utils.getEnv(c, config.clientIdEnv) &&
        utils.getEnv(c, config.clientSecretEnv)
      ),
      app: 'managed'
    };
  });
};
