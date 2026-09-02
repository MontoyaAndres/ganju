import type { ExecutionContext, MessageBatch } from '@cloudflare/workers-types';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';
import { and, eq, sql } from 'drizzle-orm';

import {
  enqueueOnedriveDiscover,
  enqueueOnedriveFile,
  getOneDriveAccessToken,
  listOneDriveFolderChildren,
  isOneDriveFolder,
  oneDriveFileMimeType,
  oneDriveUri,
  parseOneDriveUri,
  buildOneDriveResourceMetadata
} from '../utils';
import { markResourceFailed, reportQueueError } from './shared';

import type { R2Bucket } from '@cloudflare/workers-types';
import type { Bindings } from '../types';
import type { OneDriveFile } from '../utils/oneDrive';

export interface OnedriveDiscoverJob {
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

const extractItemRef = (
  row: { uri: string; metadata: unknown } | null | undefined
): { itemId: string; driveId?: string } | null => {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as Record<string, unknown>)
      : null;
  const itemId =
    typeof meta?.oneDriveItemId === 'string' ? meta.oneDriveItemId : undefined;
  const driveId =
    typeof meta?.oneDriveDriveId === 'string'
      ? (meta.oneDriveDriveId as string)
      : undefined;
  if (itemId) return { itemId, driveId };
  return parseOneDriveUri(row.uri);
};

const hasFileChanged = async (
  bucket: R2Bucket | undefined,
  existingRow: {
    metadata: unknown;
    fileKey: string | null;
    status: string;
  },
  file: OneDriveFile
): Promise<boolean> => {
  const meta =
    existingRow.metadata && typeof existingRow.metadata === 'object'
      ? (existingRow.metadata as Record<string, unknown>)
      : null;
  if (!existingRow.fileKey) return true;
  if (existingRow.status === utils.constants.STATUS_FAILED) return true;
  if (meta?.cTag && file.cTag && meta.cTag !== file.cTag) return true;
  if (meta?.eTag && file.eTag && meta.eTag !== file.eTag) return true;
  if (
    meta?.lastModifiedDateTime &&
    file.lastModifiedDateTime &&
    meta.lastModifiedDateTime !== file.lastModifiedDateTime
  )
    return true;
  // OneDrive metadata is unchanged — confirm R2 still has the object before skipping.
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
  child: OneDriveFile,
  parentDriveId: string | undefined
): Promise<{ id: string; shouldIndex: boolean } | null> => {
  const folder = isOneDriveFolder(child);
  const mimeType = folder ? '' : oneDriveFileMimeType(child);
  const supported =
    folder ||
    (utils.constants.MIMETYPES as readonly string[]).includes(mimeType);
  if (!supported) return null;

  const driveId = child.parentReference?.driveId ?? parentDriveId;

  const dbInstance = db.create({ env });
  // OneDrive reports a byte size for files (folders report an aggregate we skip);
  // record it up front so the org's raw-storage total is correct before the file
  // body is synced. The onedriveFile sync later overwrites it with the stored size.
  const sizeBytes =
    !folder && typeof child.size === 'number' ? child.size : null;
  const inserted = await dbInstance.transaction(async tx => {
    const [created] = await tx
      .insert(db.schema.artifactResource)
      .values({
        title: child.name,
        uri: oneDriveUri(child.id, driveId),
        type: utils.constants.RESOURCE_TYPE_STATIC,
        sourceType: folder
          ? utils.constants.RESOURCE_SOURCE_TYPE_ONE_DRIVE_FOLDER
          : utils.constants.RESOURCE_SOURCE_TYPE_FILE,
        status: utils.constants.STATUS_PENDING,
        mimeType: folder
          ? utils.constants.MIMETYPE_APPLICATION_OCTET_STREAM
          : mimeType,
        fileName: child.name,
        size: sizeBytes,
        artifactId: parent.artifactId,
        parentResourceId: parent.id,
        metadata: buildOneDriveResourceMetadata(child, driveId)
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
      `[${utils.constants.SERVICE_NAME_API}] onedriveDiscover: resource ${resourceId} not found`
    );
    return;
  }

  if (
    resource.sourceType !==
    utils.constants.RESOURCE_SOURCE_TYPE_ONE_DRIVE_FOLDER
  ) {
    console.warn(
      `[${utils.constants.SERVICE_NAME_API}] onedriveDiscover: resource ${resourceId} is not ONE_DRIVE_FOLDER; skipping`
    );
    return;
  }

  const ref = extractItemRef(resource);
  if (!ref) {
    throw new Error(
      `onedriveDiscover: cannot resolve onedrive item ref for resource ${resourceId}`
    );
  }

  const folderMetadata =
    resource.metadata && typeof resource.metadata === 'object'
      ? (resource.metadata as Record<string, unknown>)
      : null;

  const accessToken = await getOneDriveAccessToken(source, resource.artifactId);
  const children = await listOneDriveFolderChildren(
    accessToken,
    ref.itemId,
    ref.driveId
  );

  const existing = await dbInstance
    .select()
    .from(db.schema.artifactResource)
    .where(eq(db.schema.artifactResource.parentResourceId, resource.id));

  const existingByItemId = new Map<string, (typeof existing)[number]>();
  for (const row of existing) {
    const childRef = extractItemRef(row);
    if (childRef?.itemId) existingByItemId.set(childRef.itemId, row);
  }

  const seenItemIds = new Set<string>();
  const filesToEnqueue: string[] = [];
  const foldersToEnqueue: string[] = [];

  for (const child of children) {
    if (child.deleted) continue;
    seenItemIds.add(child.id);
    const folder = isOneDriveFolder(child);
    const existingRow = existingByItemId.get(child.id);

    if (!existingRow) {
      const insertResult = await insertChildResource(
        env,
        resource,
        child,
        ref.driveId
      );
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
      await dbInstance
        .update(db.schema.artifactResource)
        .set({
          status: utils.constants.STATUS_PENDING,
          ...(typeof child.size === 'number' ? { size: child.size } : {}),
          metadata: buildOneDriveResourceMetadata(
            child,
            ref.driveId ?? child.parentReference?.driveId
          )
        })
        .where(eq(db.schema.artifactResource.id, existingRow.id));
      filesToEnqueue.push(existingRow.id);
    }
  }

  const toRemove = existing.filter(row => {
    const childRef = extractItemRef(row);
    return childRef?.itemId && !seenItemIds.has(childRef.itemId);
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
    await enqueueOnedriveDiscover(env, id);
  }
  for (const id of filesToEnqueue) {
    await enqueueOnedriveFile(env, id);
  }
};

export const handleOnedriveDiscoverBatch = async (
  batch: MessageBatch<OnedriveDiscoverJob>,
  env: Bindings,
  _ctx: ExecutionContext
): Promise<void> => {
  await utils.processQueueBatch(batch, {
    process: async ({ resourceId }) => discoverOne(env, resourceId),
    onError: async (error, { resourceId }, queueName) => {
      await reportQueueError(env, '/onedrive/discover', error, {
        resourceId,
        queue: queueName
      });
      await markResourceFailed(env, resourceId);
    }
  });
};
