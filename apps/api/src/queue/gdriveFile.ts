import type { ExecutionContext, MessageBatch } from '@cloudflare/workers-types';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';
import { eq, sql } from 'drizzle-orm';

import {
  enqueueIndex,
  getDriveAccessToken,
  getDriveFile,
  downloadDriveFile,
  buildDriveResourceMetadata
} from '../utils';
import { markResourceFailed, putR2Stream, reportQueueError } from './shared';
import { hasFileChanged } from './gdriveDiscover';

import type { Bindings } from '../types';

export interface GdriveFileJob {
  resourceId: string;
  onlyIfChanged?: boolean;
}

const removeMissingFile = async (
  env: Bindings,
  resource: {
    id: string;
    artifactId: string;
    parentResourceId: string | null;
    fileKey: string | null;
  }
): Promise<void> => {
  const dbInstance = db.create({ env });
  await dbInstance.transaction(async tx => {
    const deleted = await tx
      .delete(db.schema.artifactResource)
      .where(eq(db.schema.artifactResource.id, resource.id))
      .returning({ id: db.schema.artifactResource.id });
    if (deleted.length === 0) return;

    await tx
      .update(db.schema.artifact)
      .set({
        artifactResourceCount: sql`GREATEST(${db.schema.artifact.artifactResourceCount}::int - 1, 0)`
      })
      .where(eq(db.schema.artifact.id, resource.artifactId));

    if (resource.parentResourceId) {
      await tx
        .update(db.schema.artifactResource)
        .set({
          childResourceCount: sql`GREATEST(${db.schema.artifactResource.childResourceCount}::int - 1, 0)`
        })
        .where(eq(db.schema.artifactResource.id, resource.parentResourceId));
    }
  });

  if (resource.fileKey && env.STORAGE_BUCKET) {
    try {
      await env.STORAGE_BUCKET.delete(resource.fileKey);
    } catch {
      // best-effort
    }
  }
};

const syncOne = async (
  env: Bindings,
  { resourceId, onlyIfChanged }: GdriveFileJob
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
      `[${utils.constants.SERVICE_NAME_API}] gdriveFile: resource ${resourceId} not found`
    );
    return;
  }

  const meta =
    resource.metadata && typeof resource.metadata === 'object'
      ? (resource.metadata as Record<string, unknown>)
      : null;
  const driveFileId =
    (meta?.driveFileId as string | undefined) ??
    (resource.uri.startsWith(utils.constants.GOOGLE_DRIVE_URI_PREFIX)
      ? resource.uri.slice(utils.constants.GOOGLE_DRIVE_URI_PREFIX.length)
      : null);

  if (!driveFileId) {
    throw new Error(
      `gdriveFile: cannot resolve drive file id for resource ${resourceId}`
    );
  }

  const accessToken = await getDriveAccessToken(source, resource.artifactId);
  const file = await getDriveFile(accessToken, driveFileId);

  if (!file || file.trashed) {
    await removeMissingFile(env, {
      id: resource.id,
      artifactId: resource.artifactId,
      parentResourceId: resource.parentResourceId,
      fileKey: resource.fileKey
    });
    return;
  }

  // Unchanged since the last fetch: record that it was checked and stop, so
  // a scheduled sync costs one metadata call rather than a download and a
  // fresh set of embeddings.
  if (
    onlyIfChanged &&
    !(await hasFileChanged(env.STORAGE_BUCKET, resource, file))
  ) {
    await dbInstance
      .update(db.schema.artifactResource)
      .set({ metadata: { ...meta, lastSyncedAt: new Date().toISOString() } })
      .where(eq(db.schema.artifactResource.id, resource.id));
    return;
  }

  const declaredSize = file.size ? Number.parseInt(file.size, 10) : null;
  if (
    declaredSize !== null &&
    Number.isFinite(declaredSize) &&
    declaredSize > utils.constants.MAX_FILE_SIZE
  ) {
    throw new Error(
      `Drive file ${file.id} exceeds the ${utils.constants.MAX_FILE_SIZE / (1024 * 1024)}MB limit (size: ${declaredSize} bytes)`
    );
  }

  const downloaded = await downloadDriveFile(accessToken, file);

  const bucket = env.STORAGE_BUCKET;
  if (!bucket) {
    throw new Error('STORAGE_BUCKET is not configured');
  }

  const [{ artifactId, projectId, organizationId }] = await dbInstance
    .select({
      artifactId: db.schema.artifact.id,
      projectId: db.schema.artifact.projectId,
      organizationId: db.schema.project.organizationId
    })
    .from(db.schema.artifact)
    .innerJoin(
      db.schema.project,
      eq(db.schema.artifact.projectId, db.schema.project.id)
    )
    .where(eq(db.schema.artifact.id, resource.artifactId))
    .limit(1);

  const key = `organizations/${organizationId}/projects/${projectId}/resources/${artifactId}/gdrive/${file.id}/${utils.formatFilename(downloaded.fileName)}`;

  if (resource.fileKey && resource.fileKey !== key) {
    try {
      await bucket.delete(resource.fileKey);
    } catch {
      // best-effort
    }
  }

  const putResult = await putR2Stream(
    bucket,
    key,
    downloaded.body,
    // Not Drive's own `size`: for a Google Doc, Sheet or Slides that is the
    // native file's quota (1,024 bytes), not the size of the export being
    // written. The download helper already falls back to it where it is real.
    downloaded.contentLength,
    { contentType: downloaded.mimeType }
  );
  const storedSize = putResult?.size ?? declaredSize ?? 0;

  if (storedSize > utils.constants.MAX_FILE_SIZE) {
    try {
      await bucket.delete(key);
    } catch {
      // best-effort
    }
    throw new Error(
      `Drive file ${file.id} exceeded the ${utils.constants.MAX_FILE_SIZE / (1024 * 1024)}MB limit after download (size: ${storedSize} bytes)`
    );
  }

  await dbInstance
    .update(db.schema.artifactResource)
    .set({
      title: file.name,
      fileName: downloaded.fileName,
      fileKey: key,
      mimeType: downloaded.mimeType,
      size: storedSize,
      status: utils.constants.STATUS_PENDING,
      metadata: buildDriveResourceMetadata(file, {
        storedMimeType: downloaded.mimeType,
        lastSyncedAt: new Date().toISOString()
      })
    })
    .where(eq(db.schema.artifactResource.id, resource.id));

  await enqueueIndex(env, resource.id);
};

export const handleGdriveFileBatch = async (
  batch: MessageBatch<GdriveFileJob>,
  env: Bindings,
  _ctx: ExecutionContext
): Promise<void> => {
  await utils.processQueueBatch(batch, {
    process: async job => syncOne(env, job),
    onError: async (error, { resourceId }, queueName) => {
      await reportQueueError(env, '/gdrive/file', error, {
        resourceId,
        queue: queueName
      });
      await markResourceFailed(env, resourceId);
    }
  });
};
