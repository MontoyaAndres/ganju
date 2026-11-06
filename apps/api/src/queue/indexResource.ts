import type { ExecutionContext, MessageBatch } from '@cloudflare/workers-types';
import { db } from '@ganju/db';
import { ExtractedDocument, utils } from '@ganju/utils';
import { eq } from 'drizzle-orm';
import { getResourceHandler } from '@ganju/containers';

import { reindexResourceChunks } from '../utils';
import {
  isSheetSyncJob,
  queueSheetSyncsFor,
  recordSheetSyncGaveUp,
  runSheetSync,
  type SheetSyncJob
} from '../utils/dataSheetSync';
import { reportAndFailOnFinal, reportQueueError } from './shared';

import type { QueueFailureContext } from '@ganju/utils';
import type { Bindings } from '../types';

// A resource to index, or a table to sync from its sheet: the same queue.
// `manualSync`: the owner's "Sync now" fetched the file, so the tables that
// read it count it as them using the database.
export type IndexJob =
  | { resourceId: string; manualSync?: boolean }
  | SheetSyncJob;

const indexOne = async (
  env: Bindings,
  resourceId: string,
  manualSync = false
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
      `[${utils.constants.SERVICE_NAME_API}] indexResource: resource ${resourceId} not found, skipping`
    );
    return;
  }

  // The file's content is new: tables synced from it read it again. Never
  // holds up the index.
  await queueSheetSyncsFor(env, resource, { manual: manualSync }).catch(error =>
    console.error('data-sheet-sync-queue-failed', resource.id, error)
  );

  let documents: ExtractedDocument[] | null = null;
  if (
    resource.fileKey &&
    resource.mimeType &&
    utils.isEmbeddableMimeType(resource.mimeType)
  ) {
    const obj = await env.STORAGE_BUCKET.get(resource.fileKey);
    if (!obj) {
      throw new Error(
        `Resource bytes missing in storage for ${resourceId} (fileKey: ${resource.fileKey})`
      );
    }

    const handler = getResourceHandler(env);
    const fileName = resource.fileName || resource.title;
    const response = await handler.fetch('http://resource-handler/extract', {
      method: 'POST',
      headers: {
        'content-type': utils.constants.MIMETYPE_APPLICATION_OCTET_STREAM,
        'x-mime-type': resource.mimeType,
        'x-file-name': encodeURIComponent(fileName)
      },
      body: obj.body as unknown as BodyInit
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      await reportQueueError(
        env,
        '/indexResource',
        new Error(detail || `status ${response.status}`),
        {
          resourceId,
          status: response.status
        }
      );
      throw new Error(
        `resource-handler /extract failed (${response.status}) for ${resourceId}`
      );
    }

    const payload: {
      documents: ExtractedDocument[] | null;
    } = await response.json();
    documents = payload.documents;
  }

  await reindexResourceChunks(source, {
    id: resource.id,
    artifactId: resource.artifactId,
    title: resource.title,
    description: resource.description,
    uri: resource.uri,
    mimeType: resource.mimeType,
    fileName: resource.fileName,
    content: resource.content,
    documents
  });

  await dbInstance
    .update(db.schema.artifactResource)
    .set({ status: utils.constants.STATUS_COMPLETED })
    .where(eq(db.schema.artifactResource.id, resource.id));
};

export const handleIndexBatch = async (
  batch: MessageBatch<IndexJob>,
  env: Bindings,
  _ctx: ExecutionContext
): Promise<void> => {
  const failResource = reportAndFailOnFinal(env, '/indexResource');
  await utils.processQueueBatch(batch, {
    process: async job =>
      isSheetSyncJob(job)
        ? runSheetSync(env, job)
        : indexOne(env, job.resourceId, job.manualSync === true),
    onError: async (
      error: unknown,
      job: IndexJob,
      queueName: string,
      context: QueueFailureContext
    ) => {
      if (!isSheetSyncJob(job))
        return failResource(error, job, queueName, context);
      await reportQueueError(env, '/data/sheet-sync', error, {
        artifactId: job.artifactId,
        table: job.table,
        queue: queueName
      });
      if (context.final) await recordSheetSyncGaveUp(env, job);
    }
  });
};
