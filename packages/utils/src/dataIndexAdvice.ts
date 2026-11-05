// Which columns of a database are worth an index, and which indexes nobody
// uses, from the API's daily query stats and the database's schema. Pure, so
// the daily job and the tests apply the same rule.
import { constants } from './constants';
import { isIndexedColumn } from './dataDdl';
import type { DataSchema } from './dataTypes';

// A column's (or, with column '', a table's) sums over a window.
export interface IndexAdviceStat {
  tableName: string;
  columnName: string;
  queries: number;
  rowsRead: number;
  rowsReturned: number;
  rowsWritten: number;
}

export interface IndexAdviceCandidate {
  tableName: string;
  columnName: string;
  kind: 'add' | 'unused';
  queries: number;
  avgRowsRead: number;
  avgRowsReturned: number;
  rowsWritten: number;
}

export interface IndexAdviceInput {
  schema: DataSchema;
  // Sums over the last 7 days, and over the last 30.
  week: IndexAdviceStat[];
  month: IndexAdviceStat[];
  // Whether stats go back the whole 30 days, so "no query used it" means it.
  monthCovered: boolean;
  // "table.column" made filterable, or "table" created, in the last 30 days.
  recentlyIndexed: Set<string>;
}

// Indexes the owner can add or remove: a column marked filterable. Unique and
// relation columns are indexed for what they are, and stay.
const canIndex = (type: string) => type !== 'json' && type !== 'long_text';

export const adviseIndexes = (
  input: IndexAdviceInput
): IndexAdviceCandidate[] => {
  const out: IndexAdviceCandidate[] = [];
  const tables = new Map(input.schema.tables.map(t => [t.name, t]));

  for (const stat of input.week) {
    if (!stat.columnName) continue;
    const table = tables.get(stat.tableName);
    const column = table?.columns.find(c => c.name === stat.columnName);
    if (!column || isIndexedColumn(column) || !canIndex(column.type)) continue;
    if (stat.queries < constants.DATA_INDEX_ADVICE_MIN_QUERIES) continue;
    const avgRead = stat.rowsRead / stat.queries;
    const avgReturned = stat.rowsReturned / stat.queries;
    if (avgRead < constants.DATA_INDEX_ADVICE_MIN_ROWS_READ) continue;
    // Scanning, not just a small table: many rows read for each one returned.
    if (
      stat.rowsRead <
      constants.DATA_INDEX_ADVICE_MIN_READ_RATIO * stat.rowsReturned
    ) {
      continue;
    }
    out.push({
      tableName: stat.tableName,
      columnName: stat.columnName,
      kind: constants.DATA_INDEX_ADVICE_ADD,
      queries: stat.queries,
      avgRowsRead: Math.round(avgRead),
      avgRowsReturned: Math.round(avgReturned),
      rowsWritten: 0
    });
  }

  if (input.monthCovered) {
    const used = new Set(
      input.month
        .filter(s => s.columnName && s.queries > 0)
        .map(s => `${s.tableName}.${s.columnName}`)
    );
    for (const table of input.schema.tables) {
      const totals = input.month.find(
        s => s.tableName === table.name && s.columnName === ''
      );
      const written = totals?.rowsWritten ?? 0;
      if (written < constants.DATA_INDEX_UNUSED_MIN_ROWS_WRITTEN) continue;
      if (written <= (totals?.queries ?? 0)) continue;
      if (input.recentlyIndexed.has(table.name)) continue;
      for (const column of table.columns) {
        if (!column.filterable || column.unique) continue;
        if (column.type === 'relation' || column.type === 'file') continue;
        const key = `${table.name}.${column.name}`;
        if (used.has(key) || input.recentlyIndexed.has(key)) continue;
        out.push({
          tableName: table.name,
          columnName: column.name,
          kind: constants.DATA_INDEX_ADVICE_UNUSED,
          queries: 0,
          avgRowsRead: 0,
          avgRowsReturned: 0,
          rowsWritten: written
        });
      }
    }
  }
  return out;
};

// A dismissed suggestion comes back once its numbers have doubled.
export const adviceDoubled = (
  current: { queries: number; avgRowsRead: number; rowsWritten: number },
  dismissed: {
    queries: number | null;
    avgRowsRead: number | null;
    rowsWritten: number | null;
  }
): boolean =>
  (dismissed.queries !== null &&
    dismissed.queries > 0 &&
    current.queries >= 2 * dismissed.queries) ||
  (dismissed.avgRowsRead !== null &&
    dismissed.avgRowsRead > 0 &&
    current.avgRowsRead >= 2 * dismissed.avgRowsRead) ||
  (dismissed.rowsWritten !== null &&
    dismissed.rowsWritten > 0 &&
    current.rowsWritten >= 2 * dismissed.rowsWritten);
