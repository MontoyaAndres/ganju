import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

import {
  enqueueCrawlDiscover,
  enqueueGdriveDiscover,
  enqueueGdriveFile,
  enqueueOnedriveDiscover,
  enqueueOnedriveFile
} from './queue';

// types
import type { EnvSource } from '@ganju/utils';
import type { Bindings } from '../types';

type ApiEnvSource = EnvSource & { env: Bindings };

interface SyncRoot {
  id: string;
  sourceType: string;
  parentResourceId: string | null;
  metadata: unknown;
}

/**
 * Start one sync of a source: queue the job that already knows how to refresh
 * it, and stamp `syncStartedAt`, the clock the hourly job reads.
 *
 * `scheduled` is the hourly job. It leaves the row's status alone — a sync
 * that finds nothing new shouldn't flash "Indexing" on every source — and asks
 * the Drive/OneDrive file jobs to skip a download when nothing changed. A sync
 * started by hand marks the source pending, since someone is watching it, and
 * always fetches.
 *
 * Returns false for a resource that has nothing to sync from.
 */
export const startResourceSync = async (
  env: Bindings,
  dbInstance: ReturnType<typeof db.create>,
  resource: SyncRoot,
  { scheduled }: { scheduled: boolean }
): Promise<boolean> => {
  const provider = utils.resourceSyncProvider(resource);
  if (!provider) return false;

  await dbInstance
    .update(db.schema.artifactResource)
    .set({
      syncStartedAt: new Date(),
      ...(scheduled ? {} : { status: utils.constants.STATUS_PENDING })
    })
    .where(eq(db.schema.artifactResource.id, resource.id));

  const isFolder =
    resource.sourceType ===
      utils.constants.RESOURCE_SOURCE_TYPE_GOOGLE_DRIVE_FOLDER ||
    resource.sourceType === utils.constants.RESOURCE_SOURCE_TYPE_ONE_DRIVE_FOLDER;

  if (provider === 'website') {
    await enqueueCrawlDiscover(env, resource.id);
  } else if (provider === 'google-drive') {
    if (isFolder) await enqueueGdriveDiscover(env, resource.id);
    else
      await enqueueGdriveFile(env, resource.id, { onlyIfChanged: scheduled });
  } else {
    if (isFolder) await enqueueOnedriveDiscover(env, resource.id);
    else
      await enqueueOnedriveFile(env, resource.id, {
        onlyIfChanged: scheduled
      });
  }
  return true;
};

// The plans that sync on each interval, read from PLAN_LIMITS so the job and
// the dashboard can't disagree about who gets what.
const plansFor = (
  interval: (typeof utils.constants.RESOURCE_SYNC_INTERVALS)[number]
): string[] =>
  Object.entries(utils.constants.PLAN_LIMITS)
    .filter(([, limits]) =>
      (limits.autoSyncIntervals as readonly string[]).includes(interval)
    )
    .map(([plan]) => plan);

/**
 * The hourly sync: start every source whose interval has passed, on a plan
 * that includes automatic sync, oldest first and at most a batch per run.
 *
 * A source that has never synced counts from when it was created, so the
 * sources that existed before this job are spread over their first interval
 * instead of all starting in the same hour. One that is already syncing
 * (status PENDING) is left for the next run.
 */
export const runResourceSync = async (
  source: ApiEnvSource
): Promise<{ started: number }> => {
  const dbInstance = db.create(source);
  const { constants } = utils;
  const r = db.schema.artifactResource;

  const intervalClauses = (
    [
      constants.RESOURCE_SYNC_INTERVAL_DAILY,
      constants.RESOURCE_SYNC_INTERVAL_WEEKLY
    ] as const
  )
    .map(interval => ({ interval, plans: plansFor(interval) }))
    .filter(({ plans }) => plans.length > 0)
    .map(
      ({ interval, plans }) => sql`(
        ${r.syncInterval} = ${interval}
        AND coalesce(${r.syncStartedAt}, ${r.createdAt})
          < now() - make_interval(secs => ${constants.RESOURCE_SYNC_INTERVAL_MS[interval] / 1000})
        AND ${db.schema.subscription.plan} IN ${plans}
      )`
    );
  if (intervalClauses.length === 0) return { started: 0 };

  const due = await dbInstance
    .select({
      id: r.id,
      sourceType: r.sourceType,
      parentResourceId: r.parentResourceId,
      metadata: r.metadata
    })
    .from(r)
    .innerJoin(db.schema.artifact, eq(db.schema.artifact.id, r.artifactId))
    .innerJoin(
      db.schema.project,
      eq(db.schema.project.id, db.schema.artifact.projectId)
    )
    .innerJoin(
      db.schema.subscription,
      eq(db.schema.subscription.organizationId, db.schema.project.organizationId)
    )
    .where(
      and(
        sql`${r.parentResourceId} IS NULL`,
        sql`${r.status} <> ${constants.STATUS_PENDING}`,
        inArray(db.schema.subscription.status, [
          ...constants.SUBSCRIPTION_ENTITLED_STATUSES
        ]),
        // The roots worth reading: a website seed, a folder, or a file that
        // came from Drive or OneDrive. Uploads have nothing to sync from.
        sql`(
          ${r.sourceType} IN (
            ${constants.RESOURCE_SOURCE_TYPE_WEBSITE},
            ${constants.RESOURCE_SOURCE_TYPE_GOOGLE_DRIVE_FOLDER},
            ${constants.RESOURCE_SOURCE_TYPE_ONE_DRIVE_FOLDER}
          )
          OR (
            ${r.sourceType} = ${constants.RESOURCE_SOURCE_TYPE_FILE}
            AND (${r.metadata}->>'driveFileId' IS NOT NULL
              OR ${r.metadata}->>'oneDriveItemId' IS NOT NULL)
          )
        )`,
        sql`(${sql.join(intervalClauses, sql` OR `)})`
      )
    )
    .orderBy(sql`coalesce(${r.syncStartedAt}, ${r.createdAt})`)
    .limit(constants.RESOURCE_SYNC_BATCH_SIZE);

  let started = 0;
  for (const resource of due) {
    try {
      if (
        await startResourceSync(source.env, dbInstance, resource, {
          scheduled: true
        })
      ) {
        started++;
      }
    } catch (error) {
      // One source failing to queue must not hold up the rest of the batch.
      console.error(`Resource sync failed to start for ${resource.id}`, error);
    }
  }

  console.log(
    JSON.stringify({ event: 'resource-sync.run', due: due.length, started })
  );
  return { started };
};
