// Index advice: the rule the daily job applies, and the query and write
// shapes the engine notes for it. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  createTable,
  loadSchema,
  migrateInternal,
  query,
  write
} from '../src/dataEngine.ts';
import type { SqlRow, SqlRunner } from '../src/dataEngine.ts';
import type { SqlValue } from '../src/dataCompiler.ts';
import { adviceDoubled, adviseIndexes } from '../src/dataIndexAdvice.ts';
import type { IndexAdviceStat } from '../src/dataIndexAdvice.ts';
import type {
  DataCaller,
  DataQueryShape,
  DataWriteShape
} from '../src/dataTypes.ts';

const OWNER: DataCaller = { actor: 'user:owner', timeZone: 'UTC' };

const open = () => {
  const db = new DatabaseSync(':memory:');
  const queries: DataQueryShape[] = [];
  const writes: DataWriteShape[] = [];
  const runner: SqlRunner = {
    all: (sql, params = []) =>
      db.prepare(sql).all(...(params as SqlValue[])) as SqlRow[],
    iterate: (sql, params = []) =>
      db.prepare(sql).iterate(...(params as SqlValue[])) as Iterable<SqlRow>,
    transaction: fn => {
      db.exec('SAVEPOINT t');
      try {
        const result = fn();
        db.exec('RELEASE t');
        return result;
      } catch (error) {
        db.exec('ROLLBACK TO t');
        db.exec('RELEASE t');
        throw error;
      }
    },
    databaseSize: () => 0,
    usageSoFar: () => ({ rowsRead: 0, rowsWritten: 0 }),
    noteQuery: shape => queries.push(shape),
    noteWrite: shape => writes.push(shape)
  };
  migrateInternal(runner);
  createTable(runner, loadSchema(runner), OWNER, {
    name: 'orders',
    columns: [
      { name: 'status', type: 'text' },
      { name: 'total', type: 'integer' },
      { name: 'code', type: 'text', filterable: true },
      { name: 'notes', type: 'long_text' }
    ]
  });
  return { runner, queries, writes, schema: () => loadSchema(runner) };
};

const stat = (over: Partial<IndexAdviceStat>): IndexAdviceStat => ({
  tableName: 'orders',
  columnName: 'status',
  queries: 0,
  rowsRead: 0,
  rowsReturned: 0,
  rowsWritten: 0,
  ...over
});

test('the engine notes filtered and sorted columns and the rows returned', () => {
  const { runner, queries, writes, schema } = open();
  write(runner, schema(), OWNER, {
    operations: [
      {
        op: 'insert',
        table: 'orders',
        values: { status: 'new', total: 1, code: 'a' }
      },
      {
        op: 'insert',
        table: 'orders',
        values: { status: 'paid', total: 2, code: 'b' }
      }
    ]
  });
  assert.deepEqual(
    writes.map(w => w.table),
    ['orders', 'orders']
  );
  query(runner, schema(), OWNER, {
    table: 'orders',
    where: { status: 'new', or: [{ total: { gt: 0 } }, { code: 'b' }] },
    sort: ['-total', 'id']
  });
  const [shape] = queries;
  assert.equal(shape.table, 'orders');
  assert.deepEqual([...shape.filtered].sort(), ['code', 'status', 'total']);
  assert.deepEqual(shape.sorted, ['total']);
  assert.equal(shape.returned, 1);
  query(runner, schema(), OWNER, {
    table: 'orders',
    aggregate: [{ fn: 'count' }],
    groupBy: 'status'
  });
  assert.equal(queries[1].returned, 2);
});

test('a scanned, unindexed column is suggested; a small or selective one is not', () => {
  const { schema } = open();
  const base = {
    schema: schema(),
    month: [],
    monthCovered: false,
    recentlyIndexed: new Set<string>()
  };
  const scanning = stat({
    queries: 60,
    rowsRead: 60 * 12_000,
    rowsReturned: 60 * 8
  });
  const [advice] = adviseIndexes({ ...base, week: [scanning] });
  assert.equal(advice.kind, 'add');
  assert.equal(advice.avgRowsRead, 12_000);
  assert.equal(advice.avgRowsReturned, 8);
  // Too few queries, too few rows read, or most rows read are returned.
  assert.equal(
    adviseIndexes({ ...base, week: [{ ...scanning, queries: 49 }] }).length,
    0
  );
  assert.equal(
    adviseIndexes({
      ...base,
      week: [stat({ queries: 60, rowsRead: 60 * 900, rowsReturned: 60 })]
    }).length,
    0
  );
  assert.equal(
    adviseIndexes({
      ...base,
      week: [
        stat({ queries: 60, rowsRead: 60 * 2_000, rowsReturned: 60 * 200 })
      ]
    }).length,
    0
  );
  // Already indexed, can't be indexed, or not a column of the table.
  for (const columnName of ['code', 'notes', 'created_at', 'gone']) {
    assert.equal(
      adviseIndexes({ ...base, week: [{ ...scanning, columnName }] }).length,
      0
    );
  }
});

test('an index no query used on a write-heavy table is flagged', () => {
  const { schema } = open();
  const month = [stat({ columnName: '', queries: 10, rowsWritten: 5_000 })];
  const input = {
    schema: schema(),
    week: [],
    month,
    monthCovered: true,
    recentlyIndexed: new Set<string>()
  };
  const [flag] = adviseIndexes(input);
  assert.equal(flag.kind, 'unused');
  assert.equal(flag.columnName, 'code');
  assert.equal(flag.rowsWritten, 5_000);
  // Used once, too recent, not 30 days of stats, or not write-heavy.
  assert.equal(
    adviseIndexes({
      ...input,
      month: [...month, stat({ columnName: 'code', queries: 1 })]
    }).length,
    0
  );
  assert.equal(
    adviseIndexes({ ...input, recentlyIndexed: new Set(['orders.code']) })
      .length,
    0
  );
  assert.equal(adviseIndexes({ ...input, monthCovered: false }).length, 0);
  assert.equal(
    adviseIndexes({
      ...input,
      month: [stat({ columnName: '', queries: 6_000, rowsWritten: 5_000 })]
    }).length,
    0
  );
});

test('a dismissed suggestion comes back when its numbers double', () => {
  const dismissed = { queries: 100, avgRowsRead: 5_000, rowsWritten: null };
  assert.equal(
    adviceDoubled(
      { queries: 150, avgRowsRead: 6_000, rowsWritten: 0 },
      dismissed
    ),
    false
  );
  assert.equal(
    adviceDoubled(
      { queries: 200, avgRowsRead: 5_000, rowsWritten: 0 },
      dismissed
    ),
    true
  );
  assert.equal(
    adviceDoubled(
      { queries: 100, avgRowsRead: 10_000, rowsWritten: 0 },
      dismissed
    ),
    true
  );
  assert.equal(
    adviceDoubled(
      { queries: 0, avgRowsRead: 0, rowsWritten: 4_000 },
      { queries: null, avgRowsRead: null, rowsWritten: 2_000 }
    ),
    true
  );
});
