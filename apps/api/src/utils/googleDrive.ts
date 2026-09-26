import { and, eq } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';
import type { EnvSource } from '@ganju/utils';

import { providers } from './providers';

import type { Bindings } from '../types';

type ApiEnvSource = EnvSource & { env: Bindings };

const PROVIDER = utils.constants.OAUTH_PROVIDER_GOOGLE_DRIVE;

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  createdTime?: string;
  size?: string;
  md5Checksum?: string;
  version?: string;
  parents?: string[];
  owners?: Array<{ emailAddress?: string; displayName?: string }>;
  webViewLink?: string;
  iconLink?: string;
  description?: string;
  trashed?: boolean;
  capabilities?: { canDownload?: boolean };
}

interface GoogleDriveListResponse {
  files: GoogleDriveFile[];
  nextPageToken?: string;
}

const FILE_FIELDS = utils.constants.GOOGLE_DRIVE_FILE_FIELDS;
const LIST_FIELDS = utils.constants.GOOGLE_DRIVE_LIST_FIELDS;

const refreshAccessToken = async (
  source: ApiEnvSource,
  credentialId: string,
  refreshTokenPlain: string,
  scopes: string | null,
  metadata: Record<string, unknown> | null
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
    if (err instanceof utils.OAuthReauthRequiredError) {
      const dbInstance = db.create(source);
      await dbInstance
        .update(db.schema.artifactCredential)
        .set({ metadata: utils.buildReauthMetadata(metadata, err.code) })
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

export const getDriveAccessToken = async (
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
      `google-drive credential not found for artifact ${artifactId}`
    );
  }

  if (utils.isCredentialNeedingReauth(credential.metadata)) {
    throw new Error('google-drive credential needs reauth');
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
    metadata
  );
  return refreshed ?? accessTokenPlain;
};

const driveFetch = async (
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<Response> => {
  const url = path.startsWith('http')
    ? path
    : `${utils.constants.GOOGLE_DRIVE_API_BASE}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${accessToken}`
    }
  });
};

export const getDriveFile = async (
  accessToken: string,
  fileId: string
): Promise<GoogleDriveFile | null> => {
  const params = new URLSearchParams({
    fields: FILE_FIELDS,
    supportsAllDrives: 'true'
  });
  const response = await driveFetch(
    accessToken,
    `/files/${encodeURIComponent(fileId)}?${params.toString()}`
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`drive files.get failed (${response.status}): ${detail}`);
  }
  return (await response.json()) as GoogleDriveFile;
};

export const listDriveFolderChildren = async (
  accessToken: string,
  folderId: string
): Promise<GoogleDriveFile[]> => {
  const out: GoogleDriveFile[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: LIST_FIELDS,
      pageSize: String(utils.constants.GOOGLE_DRIVE_DEFAULT_PAGE_SIZE),
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true'
    });
    if (pageToken) params.set('pageToken', pageToken);

    const response = await driveFetch(
      accessToken,
      `/files?${params.toString()}`
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `drive files.list failed (${response.status}) for folder ${folderId}: ${detail}`
      );
    }
    const payload = (await response.json()) as GoogleDriveListResponse;
    if (Array.isArray(payload.files)) out.push(...payload.files);
    pageToken = payload.nextPageToken;
    pageCount++;
  } while (
    pageToken &&
    pageCount < utils.constants.GOOGLE_DRIVE_MAX_FOLDER_PAGES
  );

  return out;
};

const parseContentLength = (
  response: Response,
  fallback: number | null = null
): number | null => {
  // A compressed response is decompressed on the way in while its
  // content-length still counts the compressed bytes, so it can't size the
  // stream the body is written through.
  const encoding = response.headers.get('content-encoding');
  if (encoding && encoding !== 'identity') return fallback;
  const header = response.headers.get('content-length');
  if (header) {
    const parsed = Number.parseInt(header, 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
};

export const downloadDriveFile = async (
  accessToken: string,
  file: GoogleDriveFile
): Promise<{
  body: ReadableStream<Uint8Array>;
  mimeType: string;
  fileName: string;
  contentLength: number | null;
}> => {
  const exportMime =
    utils.constants.GOOGLE_DRIVE_EXPORT_MIME_TYPES[file.mimeType];
  if (exportMime) {
    const params = new URLSearchParams({ mimeType: exportMime });
    const response = await driveFetch(
      accessToken,
      `/files/${encodeURIComponent(file.id)}/export?${params.toString()}`
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `drive files.export failed (${response.status}) for ${file.id}: ${detail}`
      );
    }
    if (!response.body) {
      throw new Error(`drive files.export returned empty body for ${file.id}`);
    }
    const ext = utils.constants.GOOGLE_DRIVE_EXPORT_EXTENSIONS[file.mimeType];
    const fileName = ext ? `${file.name}.${ext}` : file.name;
    return {
      body: response.body,
      mimeType: exportMime,
      fileName,
      contentLength: parseContentLength(response)
    };
  }

  const declaredSize = file.size ? Number.parseInt(file.size, 10) : null;
  const params = new URLSearchParams({
    alt: 'media',
    supportsAllDrives: 'true'
  });
  const response = await driveFetch(
    accessToken,
    `/files/${encodeURIComponent(file.id)}?${params.toString()}`
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `drive files download failed (${response.status}) for ${file.id}: ${detail}`
    );
  }
  if (!response.body) {
    throw new Error(`drive files download returned empty body for ${file.id}`);
  }
  return {
    body: response.body,
    mimeType: file.mimeType,
    fileName: file.name,
    contentLength: parseContentLength(
      response,
      Number.isFinite(declaredSize) ? declaredSize : null
    )
  };
};

export const driveUri = (fileId: string): string =>
  `${utils.constants.GOOGLE_DRIVE_URI_PREFIX}${fileId}`;

export const isFolderMime = (mimeType: string): boolean =>
  mimeType === utils.constants.MIMETYPE_APPLICATION_VND_GOOGLE_APPS_FOLDER;

export const buildDriveResourceMetadata = (
  file: GoogleDriveFile,
  extra?: Record<string, unknown>
): Record<string, unknown> => ({
  driveFileId: file.id,
  driveMimeType: file.mimeType,
  modifiedTime: file.modifiedTime,
  createdTime: file.createdTime,
  size: file.size,
  md5Checksum: file.md5Checksum,
  version: file.version,
  parents: file.parents,
  owners: file.owners,
  webViewLink: file.webViewLink,
  iconLink: file.iconLink,
  description: file.description,
  capabilities: file.capabilities,
  ...(extra || {})
});
