import { and, eq } from 'drizzle-orm';
import { db } from '@anju/db';
import { utils } from '@anju/utils';
import type { EnvSource } from '@anju/utils';

import { providers } from './providers';

import type { Bindings } from '../types';

type ApiEnvSource = EnvSource & { env: Bindings };

const PROVIDER = utils.constants.OAUTH_PROVIDER_ONE_DRIVE;

export interface OneDriveFile {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  eTag?: string;
  cTag?: string;
  file?: { mimeType?: string; hashes?: { quickXorHash?: string; sha1Hash?: string; sha256Hash?: string } };
  folder?: { childCount?: number };
  parentReference?: { driveId?: string; id?: string; path?: string };
  deleted?: { state?: string };
  '@microsoft.graph.downloadUrl'?: string;
}

interface OneDriveListResponse {
  value: OneDriveFile[];
  '@odata.nextLink'?: string;
}

const ITEM_SELECT = utils.constants.ONE_DRIVE_ITEM_SELECT;

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

export const getOneDriveAccessToken = async (
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
      `one-drive credential not found for artifact ${artifactId}`
    );
  }

  if (utils.isCredentialNeedingReauth(credential.metadata)) {
    throw new Error('one-drive credential needs reauth');
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

  const leeway = utils.constants.ONE_DRIVE_TOKEN_REFRESH_LEEWAY_MS;
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

const graphFetch = async (
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<Response> => {
  const url = path.startsWith('http')
    ? path
    : `${utils.constants.MICROSOFT_GRAPH_API_BASE}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${accessToken}`
    }
  });
};

const itemPath = (driveId: string | undefined, itemId: string): string =>
  driveId
    ? `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`
    : `/me/drive/items/${encodeURIComponent(itemId)}`;

export const getOneDriveItem = async (
  accessToken: string,
  itemId: string,
  driveId?: string
): Promise<OneDriveFile | null> => {
  const params = new URLSearchParams({ $select: ITEM_SELECT });
  const response = await graphFetch(
    accessToken,
    `${itemPath(driveId, itemId)}?${params.toString()}`
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `onedrive items.get failed (${response.status}): ${detail}`
    );
  }
  return (await response.json()) as OneDriveFile;
};

export const listOneDriveFolderChildren = async (
  accessToken: string,
  folderId: string,
  driveId?: string
): Promise<OneDriveFile[]> => {
  const out: OneDriveFile[] = [];
  let next: string | undefined;
  let pageCount = 0;

  const initialParams = new URLSearchParams({
    $select: ITEM_SELECT,
    $top: String(utils.constants.ONE_DRIVE_DEFAULT_PAGE_SIZE)
  });
  let url: string = `${itemPath(driveId, folderId)}/children?${initialParams.toString()}`;

  do {
    const response = await graphFetch(accessToken, next || url);
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `onedrive children list failed (${response.status}) for folder ${folderId}: ${detail}`
      );
    }
    const payload = (await response.json()) as OneDriveListResponse;
    if (Array.isArray(payload.value)) out.push(...payload.value);
    next = payload['@odata.nextLink'];
    pageCount++;
  } while (next && pageCount < utils.constants.ONE_DRIVE_MAX_FOLDER_PAGES);

  return out;
};

export const downloadOneDriveFile = async (
  accessToken: string,
  file: OneDriveFile,
  driveId?: string
): Promise<{
  body: ReadableStream<Uint8Array>;
  mimeType: string;
  fileName: string;
  contentLength: number | null;
}> => {
  const downloadUrl = file['@microsoft.graph.downloadUrl'];
  const response = downloadUrl
    ? await fetch(downloadUrl)
    : await graphFetch(accessToken, `${itemPath(driveId, file.id)}/content`);

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `onedrive download failed (${response.status}) for ${file.id}: ${detail}`
    );
  }
  if (!response.body) {
    throw new Error(`onedrive download returned empty body for ${file.id}`);
  }

  const mimeType =
    file.file?.mimeType ||
    response.headers.get('content-type') ||
    utils.constants.MIMETYPE_APPLICATION_OCTET_STREAM;

  const header = response.headers.get('content-length');
  let contentLength: number | null = null;
  if (header) {
    const parsed = Number.parseInt(header, 10);
    if (Number.isFinite(parsed) && parsed >= 0) contentLength = parsed;
  }
  if (
    contentLength === null &&
    typeof file.size === 'number' &&
    Number.isFinite(file.size) &&
    file.size >= 0
  ) {
    contentLength = file.size;
  }

  return {
    body: response.body,
    mimeType,
    fileName: file.name,
    contentLength
  };
};

export const oneDriveUri = (itemId: string, driveId?: string): string =>
  driveId
    ? `${utils.constants.ONE_DRIVE_URI_PREFIX}${driveId}/${itemId}`
    : `${utils.constants.ONE_DRIVE_URI_PREFIX}${itemId}`;

export const parseOneDriveUri = (
  uri: string
): { itemId: string; driveId?: string } | null => {
  if (!uri.startsWith(utils.constants.ONE_DRIVE_URI_PREFIX)) return null;
  const tail = uri.slice(utils.constants.ONE_DRIVE_URI_PREFIX.length);
  const slash = tail.indexOf('/');
  if (slash === -1) return { itemId: tail };
  return { driveId: tail.slice(0, slash), itemId: tail.slice(slash + 1) };
};

export const isOneDriveFolder = (file: OneDriveFile): boolean =>
  !!file.folder;

export const oneDriveFileMimeType = (file: OneDriveFile): string =>
  file.file?.mimeType ||
  utils.constants.MIMETYPE_APPLICATION_OCTET_STREAM;

export const buildOneDriveResourceMetadata = (
  file: OneDriveFile,
  driveId: string | undefined,
  extra?: Record<string, unknown>
): Record<string, unknown> => ({
  oneDriveItemId: file.id,
  oneDriveDriveId: driveId ?? file.parentReference?.driveId,
  oneDriveMimeType: file.file?.mimeType,
  isFolder: !!file.folder,
  size: file.size,
  webUrl: file.webUrl,
  createdDateTime: file.createdDateTime,
  lastModifiedDateTime: file.lastModifiedDateTime,
  eTag: file.eTag,
  cTag: file.cTag,
  hashes: file.file?.hashes,
  parentReference: file.parentReference,
  ...(extra || {})
});
