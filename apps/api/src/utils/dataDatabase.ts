import { and, eq, gt, inArray, lt, lte, or } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';
import { DataError } from '@ganju/utils/data';

// types
import type { ArtifactDatabaseRow, DbExecutor } from '@ganju/db';
import type { EnvSource } from '@ganju/utils';
import type { Bindings } from '../types';

const { constants, PlanLimitError } = utils;
const { databaseStub, callData } = db.data;

type ApiEnvSource = EnvSource & { env: Bindings };

// Re-exported so call sites in apps/api read everything about project data
// from here; apps/mcp and apps/tool-broker use the same functions from
// @ganju/db directly.
export const {
  createDataUsageTally,
  findArtifactDatabase,
  openArtifactDatabase,
  dataCaller,
  recordDataUsage,
  dataLimitsFor
} = db.data;
export { databaseStub, callData };

const GRACE_MS = constants.DATA_DELETE_GRACE_DAYS * 86_400_000;

// One line in the database's change log: who changed its tables, restored
// it, exported it or deleted it, with the bookmark that undoes it if any.
export const recordChange = async (
  executor: DbExecutor,
  databaseId: string,
  change: {
    actor: string;
    kind: string;
    target?: string | null;
    detail?: unknown;
    bookmark?: string | null;
  }
) => {
  await executor.insert(db.schema.artifactDatabaseChange).values({
    databaseId,
    actor: change.actor,
    kind: change.kind,
    target: change.target ?? null,
    detail: change.detail ?? null,
    bookmark: change.bookmark ?? null
  });
};

// Only Pro and Enterprise create databases. An org that left them keeps what
// it has, read-only; this is the gate for making a new one.
export const assertDataAllowed = ({
  plan,
  limits
}: {
  plan: string;
  limits: { canUseData: boolean };
}): void => {
  if (!limits.canUseData) {
    throw new PlanLimitError(
      'Project data (tables and rows) is a Pro feature. Upgrade this organization to create a database.',
      { feature: constants.PLAN_FEATURE_DATA, plan }
    );
  }
};

export interface CreateDatabaseInput {
  artifactId: string;
  organizationId: string;
  name: string;
  userId: string;
}

/**
 * Create a project's database: the Postgres row as CREATING, then the
 * object's init(), then READY.
 *
 * Retry-safe. The row is unique per artifact and init() is idempotent, so a
 * second click finishes the first rather than making two, and a FAILED row
 * is picked up again by "Try again". A database in its deletion grace period
 * is refused: it is restored, not created over.
 */
export const createDatabase = async (
  source: ApiEnvSource,
  input: CreateDatabaseInput
): Promise<ArtifactDatabaseRow> => {
  const dbInstance = db.create(source);
  const effective = await db.plan.getEffectivePlan(
    dbInstance,
    input.organizationId
  );
  assertDataAllowed(effective);

  const actor = `user:${input.userId}`;
  const existing = await findArtifactDatabase(dbInstance, input.artifactId);
  if (existing?.status === constants.ARTIFACT_DATABASE_STATUS_READY) {
    return existing;
  }
  if (
    existing?.status === constants.ARTIFACT_DATABASE_STATUS_DELETING ||
    existing?.status === constants.ARTIFACT_DATABASE_STATUS_PURGING
  ) {
    throw new DataError(
      'This project has a deleted database still in its grace period. Restore it instead of creating a new one.',
      'deleted'
    );
  }

  let row: ArtifactDatabaseRow;
  if (existing) {
    // FAILED or CREATING: try again. DELETED: its object was emptied, so the
    // same name starts over.
    [row] = await dbInstance
      .update(db.schema.artifactDatabase)
      .set({
        name: input.name,
        status: constants.ARTIFACT_DATABASE_STATUS_CREATING,
        error: null,
        deletedAt: null,
        deletedBy: null,
        deleteAfter: null,
        purgedAt: null,
        createdById: input.userId
      })
      .where(eq(db.schema.artifactDatabase.id, existing.id))
      .returning();
  } else {
    const inserted = await dbInstance
      .insert(db.schema.artifactDatabase)
      .values({
        artifactId: input.artifactId,
        objectName: input.artifactId,
        organizationId: input.organizationId,
        name: input.name,
        status: constants.ARTIFACT_DATABASE_STATUS_CREATING,
        createdById: input.userId
      })
      .onConflictDoNothing()
      .returning();
    // Two clicks at once: the other request inserted it.
    row =
      inserted[0] ??
      (await findArtifactDatabase(dbInstance, input.artifactId))!;
  }

  const stub = databaseStub(source.env.PROJECT_DATABASE, row.objectName);
  try {
    const info = await callData('init', () =>
      stub.init({ artifactId: input.artifactId, name: input.name })
    );
    const [ready] = await dbInstance
      .update(db.schema.artifactDatabase)
      .set({
        status: constants.ARTIFACT_DATABASE_STATUS_READY,
        error: null,
        sizeBytes: info.size,
        sizeCheckedAt: new Date()
      })
      .where(eq(db.schema.artifactDatabase.id, row.id))
      .returning();
    await recordChange(dbInstance, row.id, { actor, kind: 'create' });
    return ready;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await dbInstance
      .update(db.schema.artifactDatabase)
      .set({
        status: constants.ARTIFACT_DATABASE_STATUS_FAILED,
        error: message
      })
      .where(eq(db.schema.artifactDatabase.id, row.id));
    throw error;
  }
};

const LIVE_STATUSES = [
  constants.ARTIFACT_DATABASE_STATUS_CREATING,
  constants.ARTIFACT_DATABASE_STATUS_READY,
  constants.ARTIFACT_DATABASE_STATUS_FAILED
];

/**
 * Mark the databases of these artifacts DELETING, inside the caller's
 * transaction, before the rows that own them are deleted.
 *
 * `project.remove` and organization deletion delete Postgres rows only, and
 * Cloudflare can't list a namespace's objects: without this, an object whose
 * project is gone would hold data forever with nobody knowing. The row keeps
 * `objectName` after `artifact_id` is set null, which is all the hourly purge
 * needs.
 */
export const markDatabasesDeleting = async (
  tx: DbExecutor,
  artifactIds: string[],
  actor: string,
  now: Date = new Date()
): Promise<ArtifactDatabaseRow[]> => {
  if (artifactIds.length === 0) return [];
  return tx
    .update(db.schema.artifactDatabase)
    .set({
      status: constants.ARTIFACT_DATABASE_STATUS_DELETING,
      deletedAt: now,
      deletedBy: actor,
      deleteAfter: new Date(now.getTime() + GRACE_MS)
    })
    .where(
      and(
        inArray(db.schema.artifactDatabase.artifactId, artifactIds),
        inArray(db.schema.artifactDatabase.status, LIVE_STATUSES)
      )
    )
    .returning();
};

// The artifact ids under a project, or under every project of an org.
export const artifactIdsOf = async (
  executor: DbExecutor,
  scope: { projectId: string } | { organizationId: string }
): Promise<string[]> => {
  const rows =
    'projectId' in scope
      ? await executor
          .select({ id: db.schema.artifact.id })
          .from(db.schema.artifact)
          .where(eq(db.schema.artifact.projectId, scope.projectId))
      : await executor
          .select({ id: db.schema.artifact.id })
          .from(db.schema.artifact)
          .innerJoin(
            db.schema.project,
            eq(db.schema.project.id, db.schema.artifact.projectId)
          )
          .where(eq(db.schema.project.organizationId, scope.organizationId));
  return rows.map(r => r.id);
};

/**
 * Tell each object it is deleted, after the transaction that marked its row
 * committed, and keep the bookmark it answers with. Best-effort: an object
 * that can't be reached now is still purged by the hourly run, which marks it
 * first.
 */
export const notifyDatabasesDeleted = async (
  source: ApiEnvSource,
  rows: ArtifactDatabaseRow[],
  actor: string
): Promise<void> => {
  const dbInstance = db.create(source);
  await Promise.all(
    rows.map(async row => {
      try {
        const stub = databaseStub(source.env.PROJECT_DATABASE, row.objectName);
        const { bookmark } = await callData('markDeleted', () =>
          stub.markDeleted({ actor })
        );
        await dbInstance
          .update(db.schema.artifactDatabase)
          .set({ deleteBookmark: bookmark })
          .where(eq(db.schema.artifactDatabase.id, row.id));
        await recordChange(dbInstance, row.id, {
          actor,
          kind: 'delete',
          bookmark
        });
      } catch (error) {
        if (error instanceof DataError && error.code === 'not_initialised')
          return;
        console.error('data-mark-deleted-failed', row.id, error);
      }
    })
  );
};

// The owner's own "Delete database": restorable for the grace period.
export const softDeleteDatabase = async (
  source: ApiEnvSource,
  row: ArtifactDatabaseRow,
  actor: string
): Promise<ArtifactDatabaseRow> => {
  const dbInstance = db.create(source);
  const [marked] = await markDatabasesDeleting(
    dbInstance,
    row.artifactId ? [row.artifactId] : [],
    actor
  );
  if (!marked) {
    throw new DataError('This database is not live.', 'conflict');
  }
  await notifyDatabasesDeleted(source, [marked], actor);
  return (await findArtifactDatabase(dbInstance, row.artifactId!)) ?? marked;
};

// Undoes a delete within the grace period. A database whose project was
// deleted has nothing to come back to, so only one with its artifact can.
//
// The row is claimed first, DELETING → READY only while `deleteAfter` is
// still ahead, and the purge claims it DELETING → PURGING only once it has
// passed. Exactly one of them wins, so a restore can't land while the purge
// is emptying the object and be undone by it.
export const restoreDeletedDatabase = async (
  source: ApiEnvSource,
  row: ArtifactDatabaseRow,
  actor: string,
  now: Date = new Date()
): Promise<ArtifactDatabaseRow> => {
  const notRestorable = new DataError(
    'Only a database in its grace period can be restored.',
    'conflict'
  );
  if (!row.artifactId) throw notRestorable;
  const dbInstance = db.create(source);
  const table = db.schema.artifactDatabase;
  const [claimed] = await dbInstance
    .update(table)
    .set({
      status: constants.ARTIFACT_DATABASE_STATUS_READY,
      deletedAt: null,
      deletedBy: null,
      deleteAfter: null
    })
    .where(
      and(
        eq(table.id, row.id),
        eq(table.status, constants.ARTIFACT_DATABASE_STATUS_DELETING),
        gt(table.deleteAfter, now)
      )
    )
    .returning();
  if (!claimed) throw notRestorable;
  const stub = databaseStub(source.env.PROJECT_DATABASE, row.objectName);
  try {
    await callData('undelete', () => stub.undelete({ actor }));
  } catch (error) {
    // The object is still marked deleted: put the row back as it was, so
    // the grace period runs on.
    await dbInstance
      .update(table)
      .set({
        status: constants.ARTIFACT_DATABASE_STATUS_DELETING,
        deletedAt: row.deletedAt,
        deletedBy: row.deletedBy,
        deleteAfter: row.deleteAfter
      })
      .where(
        and(
          eq(table.id, row.id),
          eq(table.status, constants.ARTIFACT_DATABASE_STATUS_READY)
        )
      );
    throw error;
  }
  await recordChange(dbInstance, row.id, { actor, kind: 'undelete' });
  return claimed;
};

export interface DataPurgeResult {
  due: number;
  purged: number;
  failed: number;
}

/**
 * Empty the objects of databases whose grace period is over. Hourly, a
 * bounded batch per run. The bookmark taken just before `deleteAll()` is kept
 * on the row: point-in-time recovery can still bring the data back with it,
 * by hand, while the history lasts.
 */
export const runDataPurge = async (
  source: ApiEnvSource,
  now: Date = new Date()
): Promise<DataPurgeResult> => {
  const dbInstance = db.create(source);
  const result: DataPurgeResult = { due: 0, purged: 0, failed: 0 };
  if (!source.env.PROJECT_DATABASE) return result;
  const table = db.schema.artifactDatabase;
  // Due: past the grace period, and either waiting or claimed by a run that
  // never finished.
  const claimable = and(
    lte(table.deleteAfter, now),
    or(
      eq(table.status, constants.ARTIFACT_DATABASE_STATUS_DELETING),
      and(
        eq(table.status, constants.ARTIFACT_DATABASE_STATUS_PURGING),
        lt(
          table.updatedAt,
          new Date(now.getTime() - constants.DATA_PURGE_STALE_MS)
        )
      )
    )
  );
  const due = await dbInstance
    .select()
    .from(table)
    .where(claimable)
    .limit(constants.DATA_PURGE_BATCH);
  result.due = due.length;
  const actor = 'system:purge';
  for (const row of due) {
    // Claim it before touching the object: a restore that got there first
    // made it READY, and this matches nothing.
    const [claimed] = await dbInstance
      .update(table)
      .set({ status: constants.ARTIFACT_DATABASE_STATUS_PURGING })
      .where(and(eq(table.id, row.id), claimable))
      .returning({ id: table.id });
    if (!claimed) continue;
    try {
      const stub = databaseStub(source.env.PROJECT_DATABASE, row.objectName);
      let bookmark: string | null = row.deleteBookmark;
      try {
        await callData('markDeleted', () => stub.markDeleted({ actor }));
        ({ bookmark } = await callData('purge', () => stub.purge()));
      } catch (error) {
        // Never created, or already emptied: nothing left to free.
        if (!(error instanceof DataError && error.code === 'not_initialised')) {
          throw error;
        }
      }
      await dbInstance
        .update(table)
        .set({
          status: constants.ARTIFACT_DATABASE_STATUS_DELETED,
          purgedAt: now,
          sizeBytes: 0,
          sizeCheckedAt: now,
          deleteBookmark: bookmark
        })
        .where(eq(table.id, row.id));
      await recordChange(dbInstance, row.id, {
        actor,
        kind: 'purge',
        bookmark
      });
      result.purged++;
    } catch (error) {
      result.failed++;
      console.error('data-purge-failed', row.id, error);
      // Back in the queue for the next run.
      await dbInstance
        .update(table)
        .set({ status: constants.ARTIFACT_DATABASE_STATUS_DELETING })
        .where(
          and(
            eq(table.id, row.id),
            eq(table.status, constants.ARTIFACT_DATABASE_STATUS_PURGING)
          )
        )
        .catch(() => undefined);
    }
  }
  return result;
};
