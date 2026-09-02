import type { ExecutionContext, MessageBatch } from '@cloudflare/workers-types';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';
import { and, eq, sql } from 'drizzle-orm';

import {
  enqueueGdriveDiscover,
  enqueueGdriveFile,
  getDriveAccessToken,
  listDriveFolderChildren,
  isFolderMime,
  driveUri,
  buildDriveResourceMetadata
} from '../utils';
import { markResourceFailed, reportQueueError } from './shared';

import type { R2Bucket } from '@cloudflare/workers-types';
import type { Bindings } from '../types';
import type { GoogleDriveFile } from '../utils/googleDrive';

export interface GdriveDiscoverJob {
  resourceId: string;
}

const removeChildResource = async (
  env: Bindings,
  resourceId: string,
  artifactId: string,
  parentId: string,
  fileKey: string | null
): Promise<void> => {
  const dbInstance = db.create({ env });
  await dbInstance.transaction(async tx => {
    const deleted = await tx
      .delete(db.schema.artifactResource)
      .where(
        and(
          eq(db.schema.artifactResource.id, resourceId),
          eq(db.schema.artifactResource.artifactId, artifactId)
        )
      )
      .returning({ id: db.schema.artifactResource.id });

    if (deleted.length === 0) return;

    await tx
      .update(db.schema.artifact)
      .set({
        artifactResourceCount: sql`GREATEST(${db.schema.artifact.artifactResourceCount}::int - 1, 0)`
      })
      .where(eq(db.schema.artifact.id, artifactId));

    await tx
      .update(db.schema.artifactResource)
      .set({
        childResourceCount: sql`GREATEST(${db.schema.artifactResource.childResourceCount}::int - 1, 0)`
      })
      .where(eq(db.schema.artifactResource.id, parentId));
  });

  if (fileKey && env.STORAGE_BUCKET) {
    try {
      await env.STORAGE_BUCKET.delete(fileKey);
    } catch {
      // best-effort
    }
  }
};

const extractDriveFileId = (
  row: { uri: string; metadata: unknown } | null | undefined
): string | null => {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as Record<string, unknown>)
      : null;
  if (typeof meta?.driveFileId === 'string') return meta.driveFileId;
  if (row.uri.startsWith(utils.constants.GOOGLE_DRIVE_URI_PREFIX)) {
    return row.uri.slice(utils.constants.GOOGLE_DRIVE_URI_PREFIX.length);
  }
  return null;
};

const hasFileChanged = async (
  bucket: R2Bucket | undefined,
  existingRow: {
    metadata: unknown;
    fileKey: string | null;
    status: string;
  },
  driveFile: GoogleDriveFile
): Promise<boolean> => {
  const meta =
    existingRow.metadata && typeof existingRow.metadata === 'object'
      ? (existingRow.metadata as Record<string, unknown>)
      : null;
  if (!existingRow.fileKey) return true;
  if (existingRow.status === utils.constants.STATUS_FAILED) return true;
  if (meta?.version && driveFile.version && meta.version !== driveFile.version)
    return true;
  if (
    meta?.modifiedTime &&
    driveFile.modifiedTime &&
    meta.modifiedTime !== driveFile.modifiedTime
  )
    return true;
  if (
    meta?.md5Checksum &&
    driveFile.md5Checksum &&
    meta.md5Checksum !== driveFile.md5Checksum
  )
    return true;
  // Drive metadata is unchanged — confirm R2 still has the object before skipping.
  if (bucket) {
    try {
      const head = await bucket.head(existingRow.fileKey);
      if (!head) return true;
    } catch {
      return true;
    }
  }
  return false;
};

const insertChildResource = async (
  env: Bindings,
  parent: { id: string; artifactId: string },
  child: GoogleDriveFile
): Promise<{ id: string; shouldIndex: boolean } | null> => {
  const folder = isFolderMime(child.mimeType);
  const supported =
    folder ||
    (utils.constants.MIMETYPES as readonly string[]).includes(child.mimeType);
  if (!supported) return null;

  const dbInstance = db.create({ env });
  // Drive reports a byte size for files (not folders); record it up front so the
  // org's raw-storage total is correct before the file body is fetched. The
  // gdriveFile sync later overwrites it with the actual stored size.
  const parsedSize =
    !folder && child.size ? Number.parseInt(child.size, 10) : NaN;
  const sizeBytes = Number.isFinite(parsedSize) ? parsedSize : null;
  const inserted = await dbInstance.transaction(async tx => {
    const [created] = await tx
      .insert(db.schema.artifactResource)
      .values({
        title: child.name,
        uri: driveUri(child.id),
        type: utils.constants.RESOURCE_TYPE_STATIC,
        sourceType: folder
          ? utils.constants.RESOURCE_SOURCE_TYPE_GOOGLE_DRIVE_FOLDER
          : utils.constants.RESOURCE_SOURCE_TYPE_FILE,
        status: utils.constants.STATUS_PENDING,
        mimeType: child.mimeType,
        fileName: child.name,
        size: sizeBytes,
        artifactId: parent.artifactId,
        parentResourceId: parent.id,
        metadata: buildDriveResourceMetadata(child)
      })
      .returning({ id: db.schema.artifactResource.id });

    await tx
      .update(db.schema.artifact)
      .set({
        artifactResourceCount: sql`(${db.schema.artifact.artifactResourceCount}::int + 1)::int`
      })
      .where(eq(db.schema.artifact.id, parent.artifactId));

    await tx
      .update(db.schema.artifactResource)
      .set({
        childResourceCount: sql`(${db.schema.artifactResource.childResourceCount}::int + 1)::int`
      })
      .where(eq(db.schema.artifactResource.id, parent.id));

    return created;
  });

  return { id: inserted.id, shouldIndex: !folder };
};

const discoverOne = async (
  env: Bindings,
  resourceId: string
): Promise<void> => {
  const source = { env };
  const dbInstance = db.create(source);

  const [resource] = await dbInstance
    .select()
    .from(db.schema.artifactResource)
    .where(eq(db.schema.artifactResource.id, resourceId))
    .limit(1);

  if (!resource) {
    console.warn(
      `[${utils.constants.SERVICE_NAME_API}] gdriveDiscover: resource ${resourceId} not found`
    );
    return;
  }

  if (
    resource.sourceType !==
    utils.constants.RESOURCE_SOURCE_TYPE_GOOGLE_DRIVE_FOLDER
  ) {
    console.warn(
      `[${utils.constants.SERVICE_NAME_API}] gdriveDiscover: resource ${resourceId} is not GOOGLE_DRIVE_FOLDER; skipping`
    );
    return;
  }

  const folderId = extractDriveFileId(resource);
  if (!folderId) {
    throw new Error(
      `gdriveDiscover: cannot resolve drive folder id for resource ${resourceId}`
    );
  }

  const folderMetadata =
    resource.metadata && typeof resource.metadata === 'object'
      ? (resource.metadata as Record<string, unknown>)
      : null;

  const accessToken = await getDriveAccessToken(source, resource.artifactId);
  const children = await listDriveFolderChildren(accessToken, folderId);

  const existing = await dbInstance
    .select()
    .from(db.schema.artifactResource)
    .where(eq(db.schema.artifactResource.parentResourceId, resource.id));

  const existingByDriveId = new Map<string, (typeof existing)[number]>();
  for (const row of existing) {
    const driveId = extractDriveFileId(row);
    if (driveId) existingByDriveId.set(driveId, row);
  }

  const seenDriveIds = new Set<string>();
  const filesToEnqueue: string[] = [];
  const foldersToEnqueue: string[] = [];

  for (const child of children) {
    if (child.trashed) continue;
    seenDriveIds.add(child.id);
    const folder = isFolderMime(child.mimeType);
    const existingRow = existingByDriveId.get(child.id);

    if (!existingRow) {
      const insertResult = await insertChildResource(env, resource, child);
      if (!insertResult) continue;
      if (folder) foldersToEnqueue.push(insertResult.id);
      else if (insertResult.shouldIndex) filesToEnqueue.push(insertResult.id);
      continue;
    }

    if (folder) {
      foldersToEnqueue.push(existingRow.id);
      continue;
    }

    if (await hasFileChanged(env.STORAGE_BUCKET, existingRow, child)) {
      const parsedSize = child.size ? Number.parseInt(child.size, 10) : NaN;
      await dbInstance
        .update(db.schema.artifactResource)
        .set({
          status: utils.constants.STATUS_PENDING,
          ...(Number.isFinite(parsedSize) ? { size: parsedSize } : {}),
          metadata: buildDriveResourceMetadata(child)
        })
        .where(eq(db.schema.artifactResource.id, existingRow.id));
      filesToEnqueue.push(existingRow.id);
    }
  }

  const toRemove = existing.filter(row => {
    const driveId = extractDriveFileId(row);
    return driveId && !seenDriveIds.has(driveId);
  });

  for (const row of toRemove) {
    await removeChildResource(
      env,
      row.id,
      resource.artifactId,
      resource.id,
      row.fileKey
    );
  }

  const [{ count: liveChildCount }] = await dbInstance
    .select({ count: sql<number>`count(*)::int` })
    .from(db.schema.artifactResource)
    .where(eq(db.schema.artifactResource.parentResourceId, resource.id));

  await dbInstance
    .update(db.schema.artifactResource)
    .set({
      childResourceCount: Number(liveChildCount || 0),
      status: utils.constants.STATUS_COMPLETED,
      metadata: {
        ...(folderMetadata || {}),
        lastSyncedAt: new Date().toISOString()
      }
    })
    .where(eq(db.schema.artifactResource.id, resource.id));

  for (const id of foldersToEnqueue) {
    await enqueueGdriveDiscover(env, id);
  }
  for (const id of filesToEnqueue) {
    await enqueueGdriveFile(env, id);
  }
};

export const handleGdriveDiscoverBatch = async (
  batch: MessageBatch<GdriveDiscoverJob>,
  env: Bindings,
  _ctx: ExecutionContext
): Promise<void> => {
  await utils.processQueueBatch(batch, {
    process: async ({ resourceId }) => discoverOne(env, resourceId),
    onError: async (error, { resourceId }, queueName) => {
      await reportQueueError(env, '/gdrive/discover', error, {
        resourceId,
        queue: queueName
      });
      await markResourceFailed(env, resourceId);
    }
  });
};
