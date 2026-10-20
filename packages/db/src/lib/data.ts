import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import type { PlanLimits } from '@ganju/utils';
import { DataError } from '@ganju/utils/data';
import type {
  DataCaller,
  DataCallerLimits,
  DataResult,
  ProjectDatabaseRpc
} from '@ganju/utils/data';

import * as schema from './schema';
import { getEffectivePlan, rollUsagePeriodIfDue } from './plan';
import type { DbExecutor } from './usage';

const { constants } = utils;

// The `PROJECT_DATABASE` binding as any of our workers holds it. Typed
// structurally so this package needs no Workers types.
export interface DataNamespaceLike {
  idFromName(name: string): unknown;
  get(id: never): unknown;
}

// The only way any worker reaches a project's database. No location hint: an
// object is created next to its first caller, the API serving the owner's
// "Create database", which puts a Colombian owner's data in Miami rather than
// Virginia.
export const databaseStub = (
  namespace: DataNamespaceLike,
  objectName: string
): ProjectDatabaseRpc =>
  namespace.get(namespace.idFromName(objectName) as never) as ProjectDatabaseRpc;

// What one incoming request did to project databases, flushed once at its end
// into the org's meters: rows read and written as the objects counted them,
// and every call, whoever made it. Durations are measured here because the
// object's clock doesn't move during synchronous SQL.
export interface DataUsageTally {
  rowsRead: number;
  rowsWritten: number;
  requests: number;
  slowCalls: { method: string; ms: number }[];
}

export const createDataUsageTally = (): DataUsageTally => ({
  rowsRead: 0,
  rowsWritten: 0,
  requests: 0,
  slowCalls: []
});

// A call over 250 ms is held up by, or holding up, everything else the
// database serves.
const SLOW_CALL_MS = 250;

// Runs one call on a database object: counts it, times it, and turns a failed
// DataResult into a thrown DataError. `retryRead` retries once when the call
// itself fails (the object restarting after a restore), never a write.
export const callData = async <T>(
  method: string,
  run: () => Promise<DataResult<T>>,
  tally?: DataUsageTally,
  options: { retryRead?: boolean } = {}
): Promise<T> => {
  const started = Date.now();
  let result: DataResult<T>;
  try {
    result = await run();
  } catch (error) {
    if (!options.retryRead) throw error;
    result = await run();
  }
  const ms = Date.now() - started;
  if (tally) {
    tally.requests += 1;
    tally.rowsRead += result.usage.rowsRead;
    tally.rowsWritten += result.usage.rowsWritten;
    if (ms > SLOW_CALL_MS) tally.slowCalls.push({ method, ms });
  }
  if (ms > SLOW_CALL_MS) console.warn('data-slow-call', method, ms);
  if (!result.ok) {
    throw new DataError(result.error.message, result.error.code, result.error.details);
  }
  return result.value;
};

export type ArtifactDatabaseRow = typeof schema.artifactDatabase.$inferSelect;

export interface OpenedDatabase {
  row: ArtifactDatabaseRow;
  stub: ProjectDatabaseRpc;
  plan: string;
  limits: DataCallerLimits;
}

// What the plan lets callers do with a database: everything on Pro and
// Enterprise; read and export only once the org has left them.
export const dataLimitsFor = (limits: PlanLimits): DataCallerLimits => ({
  readOnly: !limits.canUseData,
  maxBytes: limits.maxDataBytes ?? constants.DATA_MAX_DATABASE_BYTES,
  maxTables: limits.maxDataTablesPerDatabase ?? constants.DATA_MAX_TABLES_PER_DATABASE
});

export const findArtifactDatabase = async (
  executor: DbExecutor,
  artifactId: string
): Promise<ArtifactDatabaseRow | null> => {
  const [row] = await executor
    .select()
    .from(schema.artifactDatabase)
    .where(eq(schema.artifactDatabase.artifactId, artifactId))
    .limit(1);
  return row ?? null;
};

// The project's database, ready to call, or null when it has none that is
// READY. Reads the plan with it, so every caller applies the same limits.
export const openArtifactDatabase = async (
  executor: DbExecutor,
  namespace: DataNamespaceLike,
  artifactId: string
): Promise<OpenedDatabase | null> => {
  const row = await findArtifactDatabase(executor, artifactId);
  if (!row || row.status !== constants.ARTIFACT_DATABASE_STATUS_READY) {
    return null;
  }
  const { plan, limits } = await getEffectivePlan(executor, row.organizationId);
  return {
    row,
    stub: databaseStub(namespace, row.objectName),
    plan,
    limits: dataLimitsFor(limits)
  };
};

// A caller for an opened database: the actor and rules of whoever is calling,
// with the plan's limits attached.
export const dataCaller = (
  opened: OpenedDatabase,
  caller: Omit<DataCaller, 'limits'>
): DataCaller => ({ ...caller, limits: opened.limits });

// Adds a request's tally to the org's meters (one statement) and moves the
// database's last read and last write, at most once an hour each.
export const recordDataUsage = async (
  executor: DbExecutor,
  organizationId: string,
  databaseId: string | null,
  tally: DataUsageTally,
  now: Date = new Date()
): Promise<void> => {
  if (tally.requests === 0) return;
  const [sub] = await executor
    .select()
    .from(schema.subscription)
    .where(eq(schema.subscription.organizationId, organizationId))
    .limit(1);
  if (sub) {
    // A request that is the first after a period boundary rolls it, so its
    // rows land in the new period rather than the one just closed.
    await rollUsagePeriodIfDue(executor, sub, now);
    await executor
      .update(schema.subscription)
      .set({
        dataRowsReadCount: sql`${schema.subscription.dataRowsReadCount} + ${tally.rowsRead}`,
        dataRowsWrittenCount: sql`${schema.subscription.dataRowsWrittenCount} + ${tally.rowsWritten}`,
        dataRequestCount: sql`${schema.subscription.dataRequestCount} + ${tally.requests}`
      })
      .where(eq(schema.subscription.id, sub.id));
  }
  if (!databaseId) return;
  const stale = new Date(now.getTime() - constants.DATA_ACTIVITY_THROTTLE_MS);
  const db = schema.artifactDatabase;
  if (tally.rowsRead > 0) {
    await executor
      .update(db)
      .set({ lastReadAt: now })
      .where(and(eq(db.id, databaseId), or(isNull(db.lastReadAt), lt(db.lastReadAt, stale))));
  }
  if (tally.rowsWritten > 0) {
    await executor
      .update(db)
      .set({ lastWriteAt: now })
      .where(and(eq(db.id, databaseId), or(isNull(db.lastWriteAt), lt(db.lastWriteAt, stale))));
  }
};
