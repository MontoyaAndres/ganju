import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import type { PlanLimits } from '@ganju/utils';
import { DataError } from '@ganju/utils/data';
import type {
  DataCaller,
  DataCallerLimits,
  DataQueryShape,
  DataResult,
  DataWriteShape,
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
  // What the queries and writes did, for index advice.
  queries: DataQueryShape[];
  writes: DataWriteShape[];
}

export const createDataUsageTally = (): DataUsageTally => ({
  rowsRead: 0,
  rowsWritten: 0,
  requests: 0,
  slowCalls: [],
  queries: [],
  writes: []
});

// A request keeps at most this many shapes; past them it is still metered.
const MAX_TALLY_SHAPES = 200;

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
    for (const shape of result.usage.queries ?? []) {
      if (tally.queries.length < MAX_TALLY_SHAPES) tally.queries.push(shape);
    }
    for (const shape of result.usage.writes ?? []) {
      if (tally.writes.length < MAX_TALLY_SHAPES) tally.writes.push(shape);
    }
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
// database's last read and last write, at most once an hour each. Ganju's own
// calls pass `activity: false`: billed, but not the owner using the database.
export const recordDataUsage = async (
  executor: DbExecutor,
  organizationId: string,
  databaseId: string | null,
  tally: DataUsageTally,
  now: Date = new Date(),
  options: { activity?: boolean } = {}
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
  const activity = options.activity ?? true;
  if (activity && tally.rowsRead > 0) {
    await executor
      .update(db)
      .set({ lastReadAt: now })
      .where(and(eq(db.id, databaseId), or(isNull(db.lastReadAt), lt(db.lastReadAt, stale))));
  }
  if (activity && tally.rowsWritten > 0) {
    await executor
      .update(db)
      .set({ lastWriteAt: now })
      .where(and(eq(db.id, databaseId), or(isNull(db.lastWriteAt), lt(db.lastWriteAt, stale))));
  }
  // Last, and on its own: index advice never costs a request its meters.
  await recordQueryStats(executor, databaseId, tally, now).catch(error =>
    console.error('data-query-stats-failed', error)
  );
};

// One call made outside a request's tally (the hourly size reading, a trigger
// run, the dashboard's database read), metered on its own. Any call can carry
// the rows the object's alarm read since the last one, so none goes untallied.
// `ganju: true` is Ganju reading for itself (sizes, index advice, the
// abandoned-database emails): billed, but it leaves last read and last write
// alone, which the deletion digest relies on.
export const callDataMetered = async <T>(
  executor: DbExecutor,
  database: { id: string; organizationId: string },
  method: string,
  run: () => Promise<DataResult<T>>,
  options: { retryRead?: boolean; ganju?: boolean } = {}
): Promise<T> => {
  const tally = createDataUsageTally();
  try {
    return await callData(method, run, tally, { retryRead: options.retryRead });
  } finally {
    await recordDataUsage(executor, database.organizationId, database.id, tally, new Date(), {
      activity: !options.ganju
    }).catch(error => console.error('data-usage-record-failed', error));
  }
};

// The day a stat row counts in: midnight UTC.
export const statDay = (at: Date): Date =>
  new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));

// Adds a request's query and write shapes to the database's daily stats, in
// one statement: per table ('' column) every query and write, and per column
// the queries that filtered or sorted on it.
export const recordQueryStats = async (
  executor: DbExecutor,
  databaseId: string,
  tally: Pick<DataUsageTally, 'queries' | 'writes'>,
  now: Date = new Date()
): Promise<void> => {
  if (tally.queries.length === 0 && tally.writes.length === 0) return;
  const day = statDay(now);
  const rows = new Map<
    string,
    {
      tableName: string;
      columnName: string;
      queries: number;
      rowsRead: number;
      rowsReturned: number;
      writes: number;
      rowsWritten: number;
    }
  >();
  const at = (tableName: string, columnName: string) => {
    const key = JSON.stringify([tableName, columnName]);
    let row = rows.get(key);
    if (!row) {
      row = { tableName, columnName, queries: 0, rowsRead: 0, rowsReturned: 0, writes: 0, rowsWritten: 0 };
      rows.set(key, row);
    }
    return row;
  };
  for (const shape of tally.queries) {
    const read = Math.max(0, shape.rowsRead);
    for (const columnName of new Set(['', ...shape.filtered, ...shape.sorted])) {
      const row = at(shape.table, columnName);
      row.queries += 1;
      row.rowsRead += read;
      row.rowsReturned += shape.returned;
    }
  }
  for (const shape of tally.writes) {
    const row = at(shape.table, '');
    row.writes += 1;
    row.rowsWritten += Math.max(0, shape.rowsWritten);
  }
  const stat = schema.artifactDatabaseQueryStat;
  await executor
    .insert(stat)
    .values([...rows.values()].map(row => ({ databaseId, day, ...row })))
    .onConflictDoUpdate({
      target: [stat.databaseId, stat.tableName, stat.columnName, stat.day],
      set: {
        queries: sql`${stat.queries} + excluded.queries`,
        rowsRead: sql`${stat.rowsRead} + excluded.rows_read`,
        rowsReturned: sql`${stat.rowsReturned} + excluded.rows_returned`,
        writes: sql`${stat.writes} + excluded.writes`,
        rowsWritten: sql`${stat.rowsWritten} + excluded.rows_written`
      }
    });
};

// One line in the database's change log: who changed its tables, restored
// it, exported it or deleted it, with the bookmark that undoes it if any.
// The API and the owner's data-admin tool write it the same way.
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
  await executor.insert(schema.artifactDatabaseChange).values({
    databaseId,
    actor: change.actor,
    kind: change.kind,
    target: change.target ?? null,
    detail: change.detail ?? null,
    bookmark: change.bookmark ?? null
  });
};
