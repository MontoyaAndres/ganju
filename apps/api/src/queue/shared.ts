import type {
  R2Bucket,
  R2Object,
  ReadableStream as WorkersReadableStream
} from '@cloudflare/workers-types';
import { db, utils as dbUtils } from '@ganju/db';
import { utils } from '@ganju/utils';
import type { QueueFailureContext } from '@ganju/utils';
import { eq, sql } from 'drizzle-orm';

import type { Bindings } from '../types';

declare const FixedLengthStream: {
  new (expectedLength: number | bigint): {
    readable: WorkersReadableStream;
    writable: WritableStream<Uint8Array>;
  };
};

export const putR2Stream = async (
  bucket: R2Bucket,
  key: string,
  body: ReadableStream<Uint8Array>,
  contentLength: number | null,
  options: { contentType?: string } = {}
): Promise<R2Object | null> => {
  const httpMetadata = options.contentType
    ? { contentType: options.contentType }
    : undefined;

  if (
    contentLength !== null &&
    Number.isFinite(contentLength) &&
    contentLength >= 0
  ) {
    const fls = new FixedLengthStream(contentLength);
    const [, putResult] = await Promise.all([
      body.pipeTo(fls.writable as unknown as WritableStream<Uint8Array>),
      bucket.put(key, fls.readable, { httpMetadata })
    ]);
    return putResult;
  }

  const bytes = new Uint8Array(await new Response(body).arrayBuffer());
  return bucket.put(key, bytes, { httpMetadata });
};

// Give up on a resource's job, after its last delivery. A resource whose
// indexed copy still stands keeps it, and keeps showing it as COMPLETED: one
// already COMPLETED (a sync that re-checks it doesn't touch its status), or a
// crawled page a sync put back to PENDING with the hash of the text it holds
// (`indexedHash`). A failed re-fetch says nothing about the copy already being
// searched. Only work that never produced a copy is marked failed.
export const markResourceFailed = async (
  env: Bindings,
  resourceId: string
): Promise<void> => {
  try {
    const dbInstance = db.create({ env });
    const r = db.schema.artifactResource;
    await dbInstance
      .update(r)
      .set({
        status: sql`CASE
          WHEN ${r.status} = ${utils.constants.STATUS_COMPLETED}
            OR ${r.metadata}->>'indexedHash' IS NOT NULL
          THEN ${utils.constants.STATUS_COMPLETED}
          ELSE ${utils.constants.STATUS_FAILED}
        END`
      })
      .where(eq(r.id, resourceId));
  } catch {
    // status update is best-effort
  }
};

export const reportQueueError = async (
  env: Bindings,
  path: string,
  error: unknown,
  metadata: Record<string, unknown>
): Promise<void> => {
  const resourceId = metadata.resourceId;
  await dbUtils.handleError(
    { env, request: { method: 'QUEUE', path } },
    error,
    {
      service: utils.constants.SERVICE_NAME_API,
      metadata,
      artifactResourceId: typeof resourceId === 'string' ? resourceId : null
    }
  );
};

// The onError of a queue whose job is one resource: every failure is reported,
// and the resource is marked failed only on the job's last delivery — a retry
// may still succeed, and until the last one the status is left be.
export const reportAndFailOnFinal =
  (env: Bindings, path: string) =>
  async (
    error: unknown,
    { resourceId }: { resourceId: string },
    queueName: string,
    { final }: QueueFailureContext
  ): Promise<void> => {
    await reportQueueError(env, path, error, {
      resourceId,
      queue: queueName
    });
    if (final) await markResourceFailed(env, resourceId);
  };

// A Drive or OneDrive file a scheduled sync couldn't find. The sync runs with
// nobody watching, and both answer 404 for a file this account can no longer
// see as well as for one deleted for good — so it isn't deleted here. It is
// flagged FAILED with its indexed copy kept, and the next sync fetches it
// again (a FAILED file always counts as changed). A sync started by hand, or
// a folder's own walk, still removes it.
export const flagMissingOnScheduledSync = async (
  env: Bindings,
  resourceId: string,
  job: string
): Promise<void> => {
  console.warn(
    `[${utils.constants.SERVICE_NAME_API}] ${job}: ${resourceId} not found on scheduled sync; flagged instead of removed`
  );
  const dbInstance = db.create({ env });
  await dbInstance
    .update(db.schema.artifactResource)
    .set({ status: utils.constants.STATUS_FAILED })
    .where(eq(db.schema.artifactResource.id, resourceId));
};
