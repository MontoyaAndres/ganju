import { and, eq } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';
import type { EnvSource } from '@ganju/utils';

import { providers } from './providers';

import type { Bindings } from '../types';

type ApiEnvSource = EnvSource & { env: Bindings };

const PROVIDER = utils.constants.OAUTH_PROVIDER_GOOGLE_CALENDAR;

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string | null;
  timeZone: string | null;
}

const refreshAccessToken = async (
  source: ApiEnvSource,
  credentialId: string,
  refreshTokenPlain: string,
  scopes: string | null,
  metadata: Record<string, unknown> | null,
  expiresAt: Date | null
): Promise<string | null> => {
  const providerConfig = providers[PROVIDER];
  if (!providerConfig) return null;

  const clientId = utils.getEnv(source, providerConfig.clientIdEnv);
  const clientSecret = utils.getEnv(source, providerConfig.clientSecretEnv);
  if (!clientId || !clientSecret) return null;

  let refreshed;
  try {
    refreshed = await utils.refreshOAuthToken({
      tokenUrl: providerConfig.tokenUrl,
      clientId,
      clientSecret,
      refreshToken: refreshTokenPlain
    });
  } catch (err) {
    const reauthReason = utils.refreshFailureReauthReason(err, expiresAt);
    if (reauthReason) {
      const dbInstance = db.create(source);
      await dbInstance
        .update(db.schema.artifactCredential)
        .set({ metadata: utils.buildReauthMetadata(metadata, reauthReason) })
        .where(eq(db.schema.artifactCredential.id, credentialId));
    }
    throw err;
  }

  const encryptionKey = utils.getCredentialEncryptionKey(source as never);
  const nextExpiresAt = refreshed.expiresIn
    ? new Date(Date.now() + refreshed.expiresIn * 1000)
    : null;

  const dbInstance = db.create(source);
  await dbInstance
    .update(db.schema.artifactCredential)
    .set({
      accessToken: utils.encryptString(refreshed.accessToken, encryptionKey),
      refreshToken: refreshed.refreshToken
        ? utils.encryptString(refreshed.refreshToken, encryptionKey)
        : undefined,
      expiresAt: nextExpiresAt,
      scopes: refreshed.scope || scopes,
      metadata: utils.clearReauthMetadata(metadata)
    })
    .where(eq(db.schema.artifactCredential.id, credentialId));

  return refreshed.accessToken;
};

export const getCalendarAccessToken = async (
  source: ApiEnvSource,
  artifactId: string
): Promise<string> => {
  const dbInstance = db.create(source);
  const [credential] = await dbInstance
    .select()
    .from(db.schema.artifactCredential)
    .where(
      and(
        eq(db.schema.artifactCredential.artifactId, artifactId),
        eq(db.schema.artifactCredential.provider, PROVIDER)
      )
    )
    .limit(1);

  if (!credential) {
    throw new Error(
      `google-calendar credential not found for artifact ${artifactId}`
    );
  }

  if (utils.isCredentialNeedingReauth(credential.metadata)) {
    throw new Error('google-calendar credential needs reauth');
  }

  const metadata =
    credential.metadata && typeof credential.metadata === 'object'
      ? (credential.metadata as Record<string, unknown>)
      : null;

  const encryptionKey = utils.getCredentialEncryptionKey(source as never);
  const accessTokenPlain = utils.decryptString(
    credential.accessToken,
    encryptionKey
  );

  const leeway = utils.constants.GOOGLE_DRIVE_TOKEN_REFRESH_LEEWAY_MS;
  const stillFresh =
    credential.expiresAt &&
    credential.expiresAt.getTime() - leeway > Date.now();

  if (stillFresh) return accessTokenPlain;
  if (!credential.refreshToken) return accessTokenPlain;

  const refreshTokenPlain = utils.decryptString(
    credential.refreshToken,
    encryptionKey
  );
  const refreshed = await refreshAccessToken(
    source,
    credential.id,
    refreshTokenPlain,
    credential.scopes,
    metadata,
    credential.expiresAt
  );
  return refreshed ?? accessTokenPlain;
};

export const listCalendars = async (
  accessToken: string
): Promise<GoogleCalendarListEntry[]> => {
  const out: GoogleCalendarListEntry[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;

  do {
    const params = new URLSearchParams({ maxResults: '250' });
    if (pageToken) params.set('pageToken', pageToken);

    const response = await fetch(
      `${utils.constants.GOOGLE_CALENDAR_API_BASE}/users/me/calendarList?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `calendar calendarList.list failed (${response.status}): ${detail}`
      );
    }

    const payload = (await response.json()) as {
      items?: Array<{
        id?: string;
        summary?: string;
        summaryOverride?: string;
        primary?: boolean;
        accessRole?: string;
        timeZone?: string;
        deleted?: boolean;
      }>;
      nextPageToken?: string;
    };

    for (const item of payload.items || []) {
      if (!item.id || item.deleted) continue;
      out.push({
        id: item.id,
        summary: item.summaryOverride || item.summary || item.id,
        primary: item.primary === true,
        accessRole: item.accessRole || null,
        timeZone: item.timeZone || null
      });
    }

    pageToken = payload.nextPageToken;
    pageCount++;
  } while (pageToken && pageCount < 10);

  // Surface the primary calendar first; the rest alphabetically.
  out.sort((a, b) => {
    if (a.primary !== b.primary) return a.primary ? -1 : 1;
    return a.summary.localeCompare(b.summary);
  });

  return out;
};
