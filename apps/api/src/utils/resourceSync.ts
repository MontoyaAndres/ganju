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

// A root that isn't syncing right now: not PENDING, or PENDING for longer than
// RESOURCE_SYNC_STALE_MS, which means stuck — and starting it again is what
// recovers it. The SQL twin of utils.isResourceSyncInProgress.
const notSyncing = () => {
  const r = db.schema.artifactResource;
  return sql`(
    ${r.status} <> ${utils.constants.STATUS_PENDING}
    OR coalesce(${r.syncStartedAt}, ${r.createdAt})
      < now() - make_interval(secs => ${utils.constants.RESOURCE_SYNC_STALE_MS / 1000})
  )`;
};

/**
 * Claim a sync started by hand: stamp `syncStartedAt` and mark the root
 * PENDING, but only if it isn't syncing and wasn't started within the manual
 * cooldown. One conditional UPDATE, so two clicks that land together can't
 * both pass the check and queue the same crawl twice. Returns the stamp, or
 * null when the claim was refused. The stamp is written from here rather than
 * by `now()`, so it reads back equal to what releasing the claim compares.
 */
export const claimManualResourceSync = async (
  dbInstance: ReturnType<typeof db.create>,
  resourceId: string
): Promise<Date | null> => {
  const r = db.schema.artifactResource;
  const stamp = new Date();
  const [claimed] = await dbInstance
    .update(r)
    .set({
      syncStartedAt: stamp,
      status: utils.constants.STATUS_PENDING
    })
    .where(
      and(
        eq(r.id, resourceId),
        notSyncing(),
        sql`(
          ${r.syncStartedAt} IS NULL
          OR ${r.syncStartedAt} < now() - make_interval(secs => ${utils.constants.RESOURCE_SYNC_MANUAL_COOLDOWN_MS / 1000})
        )`
      )
    )
    .returning({ id: r.id });
  return claimed ? stamp : null;
};

/**
 * Undo a claim whose jobs never got queued, so the source isn't left PENDING
 * — refused by "Sync now" and skipped by the hourly job — until it goes stale.
 * Only while the claim is still the latest one.
 */
export const releaseManualResourceSync = async (
  dbInstance: ReturnType<typeof db.create>,
  resource: { id: string; status: string; syncStartedAt: Date | null },
  claimedAt: Date
): Promise<void> => {
  const r = db.schema.artifactResource;
  await dbInstance
    .update(r)
    .set({ status: resource.status, syncStartedAt: resource.syncStartedAt })
    .where(and(eq(r.id, resource.id), eq(r.syncStartedAt, claimedAt)));
};

/**
 * Queue the job that already knows how to refresh a source.
 *
 * `scheduled` is the hourly job: it asks the Drive/OneDrive file jobs to skip
 * a download when nothing changed. A sync started by hand always fetches.
 *
 * Returns false for a resource that has nothing to sync from.
 */
export const enqueueResourceSync = async (
  env: Bindings,
  resource: SyncRoot,
  { scheduled }: { scheduled: boolean }
): Promise<boolean> => {
  const provider = utils.resourceSyncProvider(resource);
  if (!provider) return false;

  const isFolder =
    resource.sourceType ===
      utils.constants.RESOURCE_SOURCE_TYPE_GOOGLE_DRIVE_FOLDER ||
    resource.sourceType ===
      utils.constants.RESOURCE_SOURCE_TYPE_ONE_DRIVE_FOLDER;

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
 * (status PENDING) is left for the next run, unless it has been PENDING long
 * enough to count as stuck.
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
      eq(
        db.schema.subscription.organizationId,
        db.schema.project.organizationId
      )
    )
    .where(
      and(
        sql`${r.parentResourceId} IS NULL`,
        notSyncing(),
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
      // Stamped first: `syncStartedAt` is this job's clock, and a source whose
      // jobs keep failing waits for its next interval rather than being
      // retried every hour. The status is left alone — a sync that finds
      // nothing new shouldn't flash "Indexing" on every source.
      await dbInstance
        .update(r)
        .set({ syncStartedAt: new Date() })
        .where(eq(r.id, resource.id));
      if (
        await enqueueResourceSync(source.env, resource, { scheduled: true })
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
