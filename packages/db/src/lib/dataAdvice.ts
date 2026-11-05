import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { adviceDoubled } from '@ganju/utils/data';
import type {
  DataSchema,
  IndexAdviceCandidate,
  IndexAdviceStat
} from '@ganju/utils/data';

import * as schema from './schema';
import { statDay } from './data';
import type { DbExecutor } from './usage';

const { constants } = utils;
const DAY_MS = 86_400_000;

export type IndexAdviceRow =
  typeof schema.artifactDatabaseIndexAdvice.$inferSelect;

// The days a window covers, today included.
const windowStart = (now: Date, days: number) =>
  new Date(statDay(now).getTime() - (days - 1) * DAY_MS);

// Databases with any query or write in the last `days` days.
export const databasesWithStats = async (
  executor: DbExecutor,
  days: number,
  now: Date = new Date()
): Promise<string[]> => {
  const stat = schema.artifactDatabaseQueryStat;
  const rows = await executor
    .selectDistinct({ databaseId: stat.databaseId })
    .from(stat)
    .where(gte(stat.day, windowStart(now, days)));
  return rows.map(r => r.databaseId);
};

// A database's sums per table and column over the last `days` days.
export const queryStatSums = async (
  executor: DbExecutor,
  databaseId: string,
  days: number,
  now: Date = new Date()
): Promise<IndexAdviceStat[]> => {
  const stat = schema.artifactDatabaseQueryStat;
  const rows = await executor
    .select({
      tableName: stat.tableName,
      columnName: stat.columnName,
      queries: sql<string>`sum(${stat.queries})`,
      rowsRead: sql<string>`sum(${stat.rowsRead})`,
      rowsReturned: sql<string>`sum(${stat.rowsReturned})`,
      rowsWritten: sql<string>`sum(${stat.rowsWritten})`
    })
    .from(stat)
    .where(
      and(
        eq(stat.databaseId, databaseId),
        gte(stat.day, windowStart(now, days))
      )
    )
    .groupBy(stat.tableName, stat.columnName);
  return rows.map(r => ({
    tableName: r.tableName,
    columnName: r.columnName,
    queries: Number(r.queries),
    rowsRead: Number(r.rowsRead),
    rowsReturned: Number(r.rowsReturned),
    rowsWritten: Number(r.rowsWritten)
  }));
};

// Whether the stats go back the whole window: the first day kept is at
// least `days` days old.
export const statsCover = async (
  executor: DbExecutor,
  databaseId: string,
  days: number,
  now: Date = new Date()
): Promise<boolean> => {
  const stat = schema.artifactDatabaseQueryStat;
  const [row] = await executor
    .select({ first: sql<Date | string | null>`min(${stat.day})` })
    .from(stat)
    .where(eq(stat.databaseId, databaseId));
  if (!row?.first) return false;
  return (
    new Date(row.first).getTime() <= windowStart(now, days).getTime() - DAY_MS
  );
};

// "table.column" marked filterable or added, and "table" created, in the
// change log over the last `days` days: an index that new can't be unused yet.
export const recentlyIndexed = async (
  executor: DbExecutor,
  databaseId: string,
  days: number,
  now: Date = new Date()
): Promise<Set<string>> => {
  const change = schema.artifactDatabaseChange;
  const rows = await executor
    .select({ kind: change.kind, target: change.target })
    .from(change)
    .where(
      and(
        eq(change.databaseId, databaseId),
        gte(change.createdAt, new Date(now.getTime() - days * DAY_MS)),
        inArray(change.kind, ['table.create', 'column.add', 'column.update'])
      )
    );
  return new Set(
    rows.map(r => r.target).filter((t): t is string => Boolean(t))
  );
};

// Whether a stored suggestion still means something against the schema: the
// column exists and is indexed (unused) or not (add) as it was.
const stillApplies = (row: IndexAdviceRow, dataSchema: DataSchema) => {
  const column = dataSchema.tables
    .find(t => t.name === row.tableName)
    ?.columns.find(c => c.name === row.columnName);
  if (!column) return false;
  return row.kind === constants.DATA_INDEX_ADVICE_UNUSED
    ? column.filterable
    : !column.filterable;
};

// Stores the day's suggestions. New ones open; open ones take the new
// numbers; dismissed ones stay dismissed until their numbers double. One
// that no longer qualifies goes, unless it was dismissed and still applies,
// so a dismissal is remembered while the numbers dip.
export const saveIndexAdvice = async (
  executor: DbExecutor,
  databaseId: string,
  candidates: IndexAdviceCandidate[],
  dataSchema: DataSchema
): Promise<{ opened: number; reopened: number; removed: number }> => {
  const advice = schema.artifactDatabaseIndexAdvice;
  const existing = await executor
    .select()
    .from(advice)
    .where(eq(advice.databaseId, databaseId));
  const keyOf = (r: { tableName: string; columnName: string; kind: string }) =>
    `${r.kind}:${r.tableName}.${r.columnName}`;
  const byKey = new Map(existing.map(r => [keyOf(r), r]));
  const seen = new Set<string>();
  let opened = 0;
  let reopened = 0;
  for (const candidate of candidates) {
    const key = keyOf(candidate);
    seen.add(key);
    const numbers = {
      queries: candidate.queries,
      avgRowsRead: candidate.avgRowsRead,
      avgRowsReturned: candidate.avgRowsReturned,
      rowsWritten: candidate.rowsWritten
    };
    const row = byKey.get(key);
    if (!row) {
      await executor.insert(advice).values({
        databaseId,
        tableName: candidate.tableName,
        columnName: candidate.columnName,
        kind: candidate.kind,
        ...numbers
      });
      opened++;
      continue;
    }
    const back =
      row.status === constants.DATA_INDEX_ADVICE_DISMISSED &&
      adviceDoubled(numbers, {
        queries: row.dismissedQueries,
        avgRowsRead: row.dismissedAvgRowsRead,
        rowsWritten: row.dismissedRowsWritten
      });
    await executor
      .update(advice)
      .set({
        ...numbers,
        ...(back
          ? {
              status: constants.DATA_INDEX_ADVICE_OPEN,
              dismissedQueries: null,
              dismissedAvgRowsRead: null,
              dismissedRowsWritten: null,
              dismissedAt: null,
              dismissedBy: null
            }
          : {})
      })
      .where(eq(advice.id, row.id));
    if (back) reopened++;
  }
  const gone = existing.filter(
    r =>
      !seen.has(keyOf(r)) &&
      !(
        r.status === constants.DATA_INDEX_ADVICE_DISMISSED &&
        stillApplies(r, dataSchema)
      )
  );
  if (gone.length) {
    await executor.delete(advice).where(
      inArray(
        advice.id,
        gone.map(r => r.id)
      )
    );
  }
  return { opened, reopened, removed: gone.length };
};

// A database's suggestions, open first. `all` includes dismissed ones.
export const listIndexAdvice = async (
  executor: DbExecutor,
  databaseId: string,
  options: { all?: boolean } = {}
): Promise<IndexAdviceRow[]> => {
  const advice = schema.artifactDatabaseIndexAdvice;
  return executor
    .select()
    .from(advice)
    .where(
      options.all
        ? eq(advice.databaseId, databaseId)
        : and(
            eq(advice.databaseId, databaseId),
            eq(advice.status, constants.DATA_INDEX_ADVICE_OPEN)
          )
    )
    .orderBy(advice.status, desc(advice.queries), desc(advice.rowsWritten));
};

export const findIndexAdvice = async (
  executor: DbExecutor,
  databaseId: string,
  adviceId: string
): Promise<IndexAdviceRow | null> => {
  const advice = schema.artifactDatabaseIndexAdvice;
  const [row] = await executor
    .select()
    .from(advice)
    .where(and(eq(advice.id, adviceId), eq(advice.databaseId, databaseId)))
    .limit(1);
  return row ?? null;
};

// Keeps the numbers it was dismissed at, which it must double to come back.
export const dismissIndexAdvice = async (
  executor: DbExecutor,
  row: IndexAdviceRow,
  actor: string,
  now: Date = new Date()
): Promise<void> => {
  const advice = schema.artifactDatabaseIndexAdvice;
  await executor
    .update(advice)
    .set({
      status: constants.DATA_INDEX_ADVICE_DISMISSED,
      dismissedQueries: row.queries,
      dismissedAvgRowsRead: row.avgRowsRead,
      dismissedRowsWritten: row.rowsWritten,
      dismissedAt: now,
      dismissedBy: actor
    })
    .where(eq(advice.id, row.id));
};

export const removeIndexAdvice = async (
  executor: DbExecutor,
  adviceId: string
) => {
  const advice = schema.artifactDatabaseIndexAdvice;
  await executor.delete(advice).where(eq(advice.id, adviceId));
};

// Daily stats older than the longest window are of no more use.
export const pruneQueryStats = async (
  executor: DbExecutor,
  now: Date = new Date()
): Promise<void> => {
  const stat = schema.artifactDatabaseQueryStat;
  await executor
    .delete(stat)
    .where(lt(stat.day, windowStart(now, constants.DATA_QUERY_STAT_KEEP_DAYS)));
};
