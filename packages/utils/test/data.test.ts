// A project's database, end to end on node:sqlite: the same engine the
// Durable Object runs, through the same tiny runner interface. Run with
// `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { identifierIssue } from '../src/dataIdentifiers.ts';
import {
  columnDefinitionSql,
  conversionSql,
  desiredTriggers,
  ftsCreateSql,
  sqlLiteral
} from '../src/dataDdl.ts';
import {
  chunkRows,
  decodeCursor,
  encodeCursor,
  ftsMatch,
  isSensitiveWrite,
  keysetCondition,
  rowsPerInsert
} from '../src/dataCompiler.ts';
import type { SqlValue } from '../src/dataCompiler.ts';
import {
  addColumn,
  createTable,
  describe,
  dropColumn,
  dropTable,
  loadSchema,
  migrateInternal,
  pruneHistory,
  query,
  rowHistory,
  updateColumn,
  updateTable,
  write,
  columnChangeNeedsRebuild,
  dropColumnNeedsRebuild
} from '../src/dataEngine.ts';
import type { SqlRow, SqlRunner } from '../src/dataEngine.ts';
import { DataError } from '../src/dataTypes.ts';
import type { DataCaller, DataColumn } from '../src/dataTypes.ts';

// A runner over node:sqlite, nesting with savepoints like transactionSync.
// node:sqlite binds up to 32,766 values; a Durable Object binds 100, so the
// runner refuses more, as the object would.

const bound = (params: readonly SqlValue[]) => {
  if (params.length > 100) {
    throw new Error(`too many SQL variables (${params.length})`);
  }
  return params as SqlValue[];
};

const open = () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  let depth = 0;
  const runner: SqlRunner = {
    all: (sql, params = []) => db.prepare(sql).all(...bound(params)) as SqlRow[],
    iterate: (sql, params = []) =>
      db.prepare(sql).iterate(...bound(params)) as Iterable<SqlRow>,
    transaction: fn => {
      const name = `sp_${depth++}`;
      db.exec(`SAVEPOINT ${name}`);
      try {
        const result = fn();
        db.exec(`RELEASE ${name}`);
        return result;
      } catch (error) {
        db.exec(`ROLLBACK TO ${name}`);
        db.exec(`RELEASE ${name}`);
        throw error;
      } finally {
        depth--;
      }
    },
    databaseSize: () => {
      const pages = db.prepare('PRAGMA page_count').get() as { page_count: number };
      const size = db.prepare('PRAGMA page_size').get() as { page_size: number };
      return pages.page_count * size.page_size;
    }
  };
  migrateInternal(runner);
  return { db, runner };
};

const OWNER: DataCaller = { actor: 'user:owner', timeZone: 'America/Bogota' };
const BOT = (participantId: string): DataCaller => ({
  actor: `channel:${participantId}`,
  restricted: true,
  participantId,
  timeZone: 'America/Bogota'
});

const throwsData = (fn: () => unknown, pattern: RegExp, code?: string) =>
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof DataError, `expected DataError, got ${error}`);
    assert.match(error.message, pattern);
    if (code) assert.equal(error.code, code);
    return true;
  });

// A restaurant: menu, orders scoped to the customer, and order lines.
const restaurant = () => {
  const { db, runner } = open();
  const s = () => loadSchema(runner);
  createTable(runner, s(), OWNER, {
    name: 'menu',
    description: 'one row per dish',
    displayColumn: 'name',
    access: 'read',
    columns: [
      { name: 'name', type: 'text', required: true, unique: true, searchable: true },
      { name: 'description', type: 'long_text', searchable: true },
      { name: 'price', type: 'integer', required: true, min: 0 },
      { name: 'stock', type: 'integer', required: true, min: 0, default: 0 },
      { name: 'category', type: 'enum', values: ['pizza', 'drink'], filterable: true },
      { name: 'available', type: 'boolean', default: true }
    ]
  });
  createTable(runner, s(), OWNER, {
    name: 'orders',
    access: 'full',
    customerScoped: true,
    columns: [
      { name: 'status', type: 'enum', values: ['pending', 'ready', 'delivered'], default: 'pending' },
      { name: 'placed_at', type: 'datetime' }
    ]
  });
  createTable(runner, s(), OWNER, {
    name: 'order_lines',
    access: 'add',
    columns: [
      { name: 'order', type: 'relation', table: 'orders', onDelete: 'cascade', required: true },
      { name: 'dish', type: 'relation', table: 'menu', required: true },
      { name: 'quantity', type: 'integer', required: true, min: 1 }
    ]
  });
  write(runner, s(), OWNER, {
    operations: [
      {
        op: 'insert',
        table: 'menu',
        rows: [
          { name: 'Margherita', description: 'tomate, mozzarella y albahaca', price: 28000, stock: 5, category: 'pizza' },
          { name: 'Pizza Jalapeño', description: 'jalapeño y queso', price: 32000, stock: 2, category: 'pizza' },
          { name: 'Hawaiana', description: 'piña y jamón', price: 30000, stock: 0, category: 'pizza', available: false },
          { name: 'Limonada', price: 8000, stock: 20, category: 'drink' }
        ]
      }
    ]
  });
  return { db, runner, s };
};

// Pure parts

test('identifiers: lowercase, not reserved, not ours', () => {
  assert.equal(identifierIssue('orders', 'table'), null);
  assert.equal(identifierIssue('order_lines', 'table'), null);
  assert.match(identifierIssue('Orders', 'table')!, /lowercase/);
  assert.match(identifierIssue('1st', 'table')!, /lowercase/);
  assert.match(identifierIssue('a'.repeat(64), 'table')!, /63 characters/);
  assert.equal(identifierIssue('order', 'column'), null, 'keywords are quoted, so allowed');
  assert.match(identifierIssue('rowid', 'column')!, /reserved by SQLite/);
  assert.match(identifierIssue('oid', 'table')!, /reserved by SQLite/);
  assert.match(identifierIssue('_ganju_tables', 'table')!, /lowercase|reserved/);
  assert.match(identifierIssue('sqlite_master', 'table')!, /reserved/);
  assert.match(identifierIssue('menu__fts', 'table')!, /two underscores/);
  assert.match(identifierIssue('created_at', 'column')!, /already has/);
  assert.match(identifierIssue('participant_id', 'column')!, /already has/);
  assert.equal(identifierIssue('created_at', 'table'), null);
});

const col = (over: Partial<DataColumn>): DataColumn => ({
  id: 7,
  name: 'c',
  type: 'text',
  label: null,
  description: null,
  required: false,
  unique: false,
  filterable: false,
  searchable: false,
  personal: false,
  values: null,
  table: null,
  onDelete: null,
  min: null,
  default: undefined,
  position: 0,
  ...over
});

test('DDL: each type gets its affinity and a named check', () => {
  const cases: [Partial<DataColumn>, RegExp][] = [
    [{ type: 'text' }, /^"c" TEXT CONSTRAINT "chk_7" CHECK \("c" IS NULL OR \(typeof\("c"\) = 'text'\)\)$/],
    [{ type: 'integer', min: 0 }, /INTEGER .*typeof\("c"\) = 'integer'.*CONSTRAINT "min_7" CHECK \("c" IS NULL OR "c" >= 0\)/],
    [{ type: 'decimal' }, /REAL .*IN \('real', 'integer'\)/],
    [{ type: 'boolean', default: true }, /INTEGER .*"c" IN \(0, 1\).* DEFAULT 1$/],
    [{ type: 'date' }, /date\("c"\) = "c"/],
    [{ type: 'datetime' }, /strftime\('%Y-%m-%dT%H:%M:%SZ', "c"\) = "c"/],
    [{ type: 'enum', values: ["it's", 'b'] }, /"c" IN \('it''s', 'b'\)/],
    [{ type: 'json' }, /json_valid\("c"\)/],
    [{ type: 'relation', table: 'orders', onDelete: 'set_null' }, /REFERENCES "orders"\(id\) ON DELETE SET NULL/],
    [{ type: 'text', required: true, default: "o'k" }, /NOT NULL DEFAULT 'o''k'$/]
  ];
  for (const [over, pattern] of cases) {
    assert.match(columnDefinitionSql(col(over)), pattern);
  }
  assert.equal(sqlLiteral(null), 'NULL');
  assert.equal(sqlLiteral(false), '0');
  assert.throws(() => sqlLiteral(Number.NaN));
});

test('FTS: accent-insensitive table and triggers over searchable columns only', () => {
  const table = {
    id: 3,
    name: 'menu',
    label: null,
    description: null,
    displayColumn: null,
    access: 'read' as const,
    customerScoped: false,
    history: false,
    position: 0,
    columns: [
      col({ id: 1, name: 'name', searchable: true }),
      col({ id: 2, name: 'price', type: 'integer' }),
      col({ id: 3, name: 'notes', type: 'json', searchable: true })
    ]
  };
  assert.equal(
    ftsCreateSql(table),
    `CREATE VIRTUAL TABLE "menu__fts" USING fts5("name", content='menu', content_rowid='id', tokenize='unicode61 remove_diacritics 2')`
  );
  const triggers = desiredTriggers(table);
  assert.deepEqual(
    triggers.map(t => t.name),
    ['tr_3_fts_ai', 'tr_3_fts_ad', 'tr_3_fts_au']
  );
  assert.match(triggers[2].sql, /AFTER UPDATE OF "name" ON "menu"/);
  assert.equal(ftsCreateSql({ ...table, columns: [table.columns[1]] }), null);
  const withHistory = desiredTriggers({ ...table, history: true });
  assert.deepEqual(
    withHistory.slice(3).map(t => t.name),
    ['tr_3_log_ai', 'tr_3_log_au', 'tr_3_log_ad']
  );
});

test('inserts split so no statement binds more than 100 values', () => {
  assert.equal(rowsPerInsert(3), 33);
  assert.equal(rowsPerInsert(100), 1);
  const chunks = chunkRows(Array.from({ length: 70 }, (_, i) => i), 3);
  assert.deepEqual(chunks.map(c => c.length), [33, 33, 4]);
  assert.ok(chunks.every(c => c.length * 3 <= 100));
  assert.throws(() => chunkRows([1], 101));
});

test('keyset: rows after the cursor, ties broken by id, nulls ordered as SQLite does', () => {
  const params: SqlValue[] = [];
  const sql = keysetCondition(
    [
      { sql: 't."price"', descending: true },
      { sql: 't.id', descending: false }
    ],
    [3000, 12],
    params
  );
  assert.equal(sql, '(((t."price" < ? OR t."price" IS NULL)) OR (t."price" = ? AND t.id > ?))');
  assert.deepEqual(params, [3000, 3000, 12]);
  const nullParams: SqlValue[] = [];
  assert.equal(
    keysetCondition([{ sql: 'a', descending: false }, { sql: 't.id', descending: false }], [null, 4], nullParams),
    '((a IS NOT NULL) OR (a IS NULL AND t.id > ?))'
  );
  const cursor = encodeCursor({ k: 'sig', v: ['x', 1] });
  assert.deepEqual(decodeCursor(cursor, 'sig').v, ['x', 1]);
  assert.throws(() => decodeCursor(cursor, 'other'), DataError);
  assert.throws(() => decodeCursor('garbage', 'sig'), DataError);
});

test('search terms are quoted prefixes, so nothing typed is FTS syntax', () => {
  assert.equal(ftsMatch('Jalapeño pizza', false), '"jalapeno"* "pizza"*');
  assert.equal(ftsMatch('a OR b', true), '"a"* OR "or"* OR "b"*');
  assert.equal(ftsMatch('NEAR("x" y)', false), '"near"* "x"* "y"*');
  assert.throws(() => ftsMatch('***', false), DataError);
});

test('the hold rule: deletes and absolute sets ask; inserts and relative changes do not', () => {
  assert.equal(isSensitiveWrite({ operations: [{ op: 'insert', table: 'orders', values: {} }] }), false);
  assert.equal(
    isSensitiveWrite({ operations: [{ op: 'update', table: 'menu', id: 1, set: { stock: { decrement: 2 } } }] }),
    false
  );
  assert.equal(
    isSensitiveWrite({ operations: [{ op: 'update', table: 'menu', id: 1, set: { '"stock"': { '"decrement"': 2 } } }] }),
    false
  );
  assert.equal(isSensitiveWrite({ operations: [{ op: 'update', table: 'menu', id: 1, set: { price: 1 } }] }), true);
  assert.equal(isSensitiveWrite({ operations: [{ op: 'delete', table: 'menu', id: 1 }] }), true);
  assert.equal(isSensitiveWrite({}), true);
});

test('conversions turn what can be kept and leave NULL for what cannot', () => {
  const { db } = open();
  const run = (from: DataColumn['type'], to: Partial<DataColumn>, value: SqlValue) =>
    (db.prepare(`SELECT ${conversionSql(from, col(to), 'x')} AS v FROM (SELECT ? AS x)`).get(value) as { v: SqlValue }).v;
  assert.equal(run('text', { type: 'integer' }, ' 42 '), 42);
  assert.equal(run('text', { type: 'integer' }, '4.2'), null);
  assert.equal(run('text', { type: 'integer' }, '007'), null);
  assert.equal(run('text', { type: 'decimal' }, '12.5'), 12.5);
  assert.equal(run('text', { type: 'decimal' }, 'abc'), null);
  assert.equal(run('text', { type: 'boolean' }, 'Sí'), 1);
  assert.equal(run('text', { type: 'datetime' }, '2026-10-19 15:00'), '2026-10-19T15:00:00Z');
  assert.equal(run('text', { type: 'enum', values: ['Pizza'] }, 'pizza'), 'Pizza');
  assert.equal(run('boolean', { type: 'text' }, 1), 'true');
  assert.equal(run('text', { type: 'json' }, 'hola'), '"hola"');
});

// The engine on a real database

test('create: tables, metadata, indexes and the search table', () => {
  const { runner, s } = restaurant();
  const schema = s();
  assert.deepEqual(schema.tables.map(t => t.name), ['menu', 'orders', 'order_lines']);
  const menu = schema.tables[0];
  assert.equal(menu.displayColumn, 'name');
  assert.equal(menu.columns.find(c => c.name === 'stock')?.default, 0);
  assert.equal(menu.columns.find(c => c.name === 'available')?.default, true);
  const indexes = runner
    .all("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'order_lines' AND name LIKE 'ix%'")
    .map(r => r.name);
  assert.equal(indexes.length, 2, 'both relation columns are indexed');
  assert.ok(runner.all("SELECT 1 FROM sqlite_master WHERE name = 'menu__fts'").length);
  throwsData(() => createTable(runner, s(), OWNER, { name: 'menu', columns: [{ name: 'x', type: 'text' }] }), /already a table/);
  throwsData(
    () => createTable(runner, s(), OWNER, { name: 'bad', columns: [{ name: 'x', type: 'relation', table: 'nope' }] }),
    /relation names the table/
  );
  throwsData(
    () => createTable(runner, s(), { ...OWNER, limits: { maxTables: 3 } }, { name: 'more', columns: [{ name: 'x', type: 'text' }] }),
    /up to 3 tables/
  );
});

test('write: an update or delete names a row inserted earlier with $ref', () => {
  const { runner, s } = restaurant();
  const placed = write(runner, s(), OWNER, {
    operations: [
      { op: 'insert', table: 'orders', values: { placed_at: '2026-10-19T15:00:00Z' } },
      { op: 'insert', table: 'order_lines', values: { order: { $ref: 0 }, dish: 1, quantity: 1 } },
      { op: 'update', table: 'order_lines', id: { $ref: 1 }, set: { quantity: { increment: 2 } } },
      { op: 'update', table: 'orders', id: { $ref: 0 }, set: { status: 'ready' } }
    ]
  });
  assert.deepEqual(placed.results[2], { op: 'update', table: 'order_lines', changed: 1 });
  assert.equal(query(runner, s(), OWNER, { table: 'order_lines' }).rows[0].quantity, 3);
  assert.equal(query(runner, s(), OWNER, { table: 'orders' }).rows[0].status, 'ready');
  // A multi-row insert has no single id to point at, and nothing is written.
  throwsData(
    () =>
      write(runner, s(), OWNER, {
        operations: [
          { op: 'insert', table: 'orders', rows: [{}, {}] },
          { op: 'delete', table: 'orders', id: { $ref: 0 } }
        ]
      }),
    /earlier single-row insert/
  );
  assert.equal(query(runner, s(), OWNER, { table: 'orders' }).total, 1);
  // As the id, a $ref names an insert into the same table: an order's id
  // would otherwise update whichever dish has that number.
  const stocks = () => query(runner, s(), OWNER, { table: 'menu', sort: ['id'] }).rows.map(r => r.stock);
  const stockBefore = stocks();
  throwsData(
    () =>
      write(runner, s(), OWNER, {
        operations: [
          { op: 'insert', table: 'orders', values: {} },
          { op: 'insert', table: 'orders', values: {} },
          { op: 'update', table: 'menu', id: { $ref: 1 }, set: { stock: { decrement: 1 } } }
        ]
      }),
    /inserted into orders; a \$ref as the id must name an insert into menu/
  );
  assert.equal(query(runner, s(), OWNER, { table: 'orders' }).total, 1);
  assert.deepEqual(stocks(), stockBefore);
  // A relative change to the row just inserted reaches one row: not held.
  assert.equal(
    isSensitiveWrite({
      operations: [
        { op: 'insert', table: 'menu', values: { name: 'Calzone', price: 30000, stock: 5 } },
        { op: 'update', table: 'menu', id: { $ref: 0 }, set: { stock: { decrement: 1 } } }
      ]
    }),
    false
  );
});

test('write: a minimum that stops a change by id names the value, not a missing row', () => {
  const { runner, s } = restaurant();
  const short = () =>
    write(runner, s(), OWNER, {
      operations: [{ op: 'update', table: 'menu', id: 1, set: { stock: { decrement: 500 } } }]
    });
  throwsData(short, /can't go below 0/);
  assert.throws(short, (error: any) => error.code === 'guard' && !/doesn't exist/.test(error.message));
  throwsData(
    () => write(runner, s(), OWNER, { operations: [{ op: 'update', table: 'menu', id: 999, set: { price: 1 } }] }),
    /Row 999 doesn't exist in menu/
  );
});

test('query: filters, labels, datetimes in the caller zone, and a scoped customer', () => {
  const { runner, s } = restaurant();
  updateTable(runner, s(), OWNER, 'menu', { access: 'full' });
  const placed = write(runner, s(), BOT('ana'), {
    operations: [
      { op: 'insert', table: 'orders', values: { placed_at: '2026-10-19T15:00:00Z' } },
      { op: 'insert', table: 'order_lines', values: { order: { $ref: 0 }, dish: 1, quantity: 2 } },
      { op: 'update', table: 'menu', id: 1, set: { stock: { decrement: 2 } }, where: { stock: { gte: 2 } } }
    ]
  });
  assert.equal(placed.results[0].op, 'insert');
  const cheap = query(runner, s(), OWNER, {
    table: 'menu',
    where: { price: { lt: 31000 }, category: 'PIZZA' },
    sort: ['price']
  });
  assert.deepEqual(cheap.rows.map(r => r.name), ['Margherita', 'Hawaiana']);
  assert.equal(cheap.total, 2);
  assert.equal(cheap.rows[0].stock, 3);
  assert.equal(cheap.rows[1].available, false);

  const lines = query(runner, s(), OWNER, { table: 'order_lines', where: { 'dish.name': 'Margherita' } });
  assert.deepEqual(lines.rows[0].dish, { id: 1, label: 'Margherita' });

  const mine = query(runner, s(), BOT('ana'), { table: 'orders' });
  assert.equal(mine.rows.length, 1);
  assert.equal(mine.rows[0].placed_at, '2026-10-19T10:00:00-05:00');
  assert.match(String(mine.scope), /only this customer/);
  assert.equal(query(runner, s(), BOT('luis'), { table: 'orders' }).rows.length, 0);
  assert.equal(query(runner, s(), OWNER, { table: 'orders' }).rows.length, 1);

  throwsData(() => query(runner, s(), OWNER, { table: 'menu', where: { colour: 'red' } }), /Unknown column "colour"/);
  throwsData(() => query(runner, s(), OWNER, { table: 'nope' }), /Unknown table "nope"/, 'not_found');
  throwsData(() => query(runner, s(), OWNER, { table: 'menu', where: { name: { like: 'x' } } }), /unknown operator/);
});

test('query: keyset pages never skip or repeat rows that share a sort value', () => {
  const { runner } = open();
  const s = () => loadSchema(runner);
  createTable(runner, s(), OWNER, {
    name: 'items',
    columns: [{ name: 'rank', type: 'integer' }]
  });
  write(runner, s(), OWNER, {
    operations: [
      { op: 'insert', table: 'items', rows: Array.from({ length: 23 }, (_, i) => ({ rank: i % 3 === 0 ? null : i % 4 })) }
    ]
  });
  for (const sort of [['rank'], ['-rank'], ['-id'], []]) {
    const seen: number[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = query(runner, s(), OWNER, { table: 'items', sort, limit: 5, cursor });
      seen.push(...page.rows.map(r => r.id));
      cursor = page.nextCursor as string | undefined;
      pages++;
    } while (cursor && pages < 10);
    assert.equal(pages, 5, `5 pages for ${sort}`);
    assert.equal(new Set(seen).size, 23, `every row once for ${sort}`);
  }
  throwsData(
    () => query(runner, s(), OWNER, { table: 'items', sort: ['rank'], cursor: encodeCursor({ k: 'x', v: [1, 1] }) }),
    /cursor/
  );
});

test('search: accent-insensitive, ranked, falling back to any word', () => {
  const { runner, s } = restaurant();
  const hits = query(runner, s(), OWNER, { table: 'menu', search: 'jalapeno' });
  assert.deepEqual(hits.rows.map(r => r.name), ['Pizza Jalapeño']);
  assert.equal(hits.searchMatched, 'all words');
  assert.deepEqual(query(runner, s(), OWNER, { table: 'menu', search: 'pina' }).rows.map(r => r.name), ['Hawaiana']);
  const any = query(runner, s(), OWNER, { table: 'menu', search: 'mozzarella zzz' });
  assert.equal(any.searchMatched, 'any word');
  assert.deepEqual(any.rows.map(r => r.name), ['Margherita']);
  write(runner, s(), OWNER, { operations: [{ op: 'update', table: 'menu', id: 1, set: { description: 'aceitunas' } }] });
  assert.equal(query(runner, s(), OWNER, { table: 'menu', search: 'mozzarella' }).rows.length, 0);
  assert.equal(query(runner, s(), OWNER, { table: 'menu', search: 'aceitunas' }).rows.length, 1);
  throwsData(() => query(runner, s(), OWNER, { table: 'orders', search: 'x' }), /no searchable columns/);
});

test('aggregate: totals, groups with labels, and sum of a product', () => {
  const { runner, s } = restaurant();
  const byCategory = query(runner, s(), OWNER, {
    table: 'menu',
    aggregate: [{ fn: 'count' }, { fn: 'sum', column: 'stock' }],
    groupBy: 'category'
  });
  assert.deepEqual(byCategory.groups, [
    { category: 'pizza', count: 3, sum_stock: 7 },
    { category: 'drink', count: 1, sum_stock: 20 }
  ]);
  const value = query(runner, s(), OWNER, {
    table: 'menu',
    aggregate: { fn: 'sum', column: 'stock', times: 'price' }
  });
  assert.equal(value.sum_stock_times_price, 5 * 28000 + 2 * 32000 + 20 * 8000);
  throwsData(() => query(runner, s(), OWNER, { table: 'menu', aggregate: { fn: 'avg', column: 'name' } }), /needs a number column/);
});

test('large tables: an unindexed sort or aggregate needs an indexed filter', () => {
  const { runner, s } = restaurant();
  write(runner, s(), OWNER, {
    operations: [{ op: 'insert', table: 'menu', values: { name: 'Far', price: 1, stock: 1 } }]
  });
  runner.all('UPDATE menu SET id = 300000 WHERE name = ?', ['Far']);
  throwsData(() => query(runner, s(), OWNER, { table: 'menu', sort: ['price'] }), /about 300,000 rows.*"price" marked filterable/, 'too_large');
  throwsData(() => query(runner, s(), OWNER, { table: 'menu', aggregate: { fn: 'count' } }), /about 300,000 rows/);
  assert.equal(query(runner, s(), OWNER, { table: 'menu', aggregate: { fn: 'count' }, where: { category: 'pizza' } }).count, 3);
  assert.ok(query(runner, s(), OWNER, { table: 'menu', sort: ['-id'], limit: 1 }).rows.length);
});

test("writes: a bot can't change a table it only reads, even inside an order", () => {
  const { runner, s } = restaurant();
  throwsData(
    () =>
      write(runner, s(), BOT('ana'), {
        operations: [
          { op: 'insert', table: 'orders', values: {} },
          { op: 'insert', table: 'order_lines', values: { order: { $ref: 0 }, dish: 2, quantity: 5 } },
          { op: 'update', table: 'menu', id: 2, set: { stock: { decrement: 5 } }, where: { stock: { gte: 5 } } }
        ]
      }),
    /Operation 2 \(update menu\): Not allowed: the assistant's access to "menu" is read only/,
    'forbidden'
  );
  assert.equal(query(runner, s(), OWNER, { table: 'orders' }).total, 0, 'the order rolled back');
});

test('writes: guards on a full-access caller roll back every operation', () => {
  const { runner, s } = restaurant();
  throwsData(
    () =>
      write(runner, s(), OWNER, {
        operations: [
          { op: 'insert', table: 'orders', values: {} },
          { op: 'insert', table: 'order_lines', values: { order: { $ref: 0 }, dish: 2, quantity: 5 } },
          { op: 'update', table: 'menu', id: 2, set: { stock: { decrement: 5 } }, where: { stock: { gte: 5 } } }
        ]
      }),
    /changed 0 rows, expected 1.*stock = 2/,
    'guard'
  );
  assert.equal(query(runner, s(), OWNER, { table: 'orders' }).total, 0, 'the order rolled back');
  throwsData(
    () => write(runner, s(), OWNER, { operations: [{ op: 'update', table: 'menu', id: 2, set: { stock: { decrement: 5 } } }] }),
    /menu.stock can't go below 0.*Current values: stock = 2/,
    'guard'
  );
  throwsData(
    () => write(runner, s(), OWNER, { operations: [{ op: 'insert', table: 'menu', values: { name: 'Margherita', price: 1 } }] }),
    /already has this name/
  );
  throwsData(
    () => write(runner, s(), OWNER, { operations: [{ op: 'insert', table: 'menu', values: { name: 'X' } }] }),
    /missing required price/
  );
  throwsData(
    () => write(runner, s(), OWNER, { operations: [{ op: 'insert', table: 'order_lines', values: { order: 99, dish: 1, quantity: 1 } }] }),
    /points at a row that doesn't exist/
  );
  throwsData(() => write(runner, s(), { actor: 'nobody' }, { operations: [{ op: 'delete', table: 'menu', id: 1 }] }), /needs an actor/);
});

test('deletes: restrict explains who points at the row; cascade follows', () => {
  const { runner, s } = restaurant();
  write(runner, s(), OWNER, {
    operations: [
      { op: 'insert', table: 'orders', values: {} },
      { op: 'insert', table: 'order_lines', values: { order: { $ref: 0 }, dish: 1, quantity: 1 } },
      { op: 'insert', table: 'order_lines', values: { order: { $ref: 0 }, dish: 1, quantity: 2 } }
    ]
  });
  throwsData(
    () => write(runner, s(), OWNER, { operations: [{ op: 'delete', table: 'menu', id: 1 }] }),
    /2 rows in order_lines still point at this row \(order_lines.dish\)/,
    'constraint'
  );
  write(runner, s(), OWNER, { operations: [{ op: 'delete', table: 'orders', id: 1 }] });
  assert.equal(query(runner, s(), OWNER, { table: 'order_lines' }).total, 0);
});

test('concurrent edits: a stale version is refused with the current row', () => {
  const { runner, s } = restaurant();
  write(runner, s(), { actor: 'user:ana' }, { operations: [{ op: 'update', table: 'menu', id: 1, set: { price: 29000 } }] });
  assert.throws(
    () =>
      write(runner, s(), { actor: 'user:luis' }, {
        operations: [{ op: 'update', table: 'menu', id: 1, version: 1, set: { price: 27000 } }]
      }),
    (error: unknown) => {
      assert.ok(error instanceof DataError);
      assert.equal(error.code, 'conflict');
      assert.equal(error.details?.updatedBy, 'user:ana');
      assert.equal(error.details?.version, 2);
      return true;
    }
  );
  write(runner, s(), { actor: 'user:luis' }, { operations: [{ op: 'update', table: 'menu', id: 1, version: 2, set: { price: 27000 } }] });
});

test('access: a bot sees only its tables and only what its level allows', () => {
  const { runner, s } = restaurant();
  updateTable(runner, s(), OWNER, 'menu', { access: 'none' });
  throwsData(() => query(runner, s(), BOT('ana'), { table: 'menu' }), /Unknown table "menu"/);
  assert.deepEqual(describe(runner, s(), BOT('ana')).tables.map(t => t.name), ['orders', 'order_lines']);
  updateTable(runner, s(), OWNER, 'menu', { access: 'read' });
  throwsData(
    () => write(runner, s(), BOT('ana'), { operations: [{ op: 'update', table: 'menu', id: 1, set: { price: 1 } }] }),
    /access to "menu" is read only/,
    'forbidden'
  );
  throwsData(
    () => write(runner, s(), BOT('ana'), { operations: [{ op: 'delete', table: 'order_lines', id: 1 }] }),
    /read and add rows only/
  );
  const described = describe(runner, s(), BOT('ana'), { table: 'orders' }).tables[0];
  assert.equal(described.onlyThisCustomersRows, true);
  assert.equal(described.rows, 0);
});

test('history: who changed what, cascades included, pruned after 90 days', () => {
  const { runner, s } = restaurant();
  write(runner, s(), BOT('ana'), {
    operations: [
      { op: 'insert', table: 'orders', values: {} },
      { op: 'insert', table: 'order_lines', values: { order: { $ref: 0 }, dish: 1, quantity: 1 } }
    ]
  });
  write(runner, s(), { actor: 'user:owner' }, { operations: [{ op: 'update', table: 'menu', id: 1, set: { price: 29000, stock: { increment: 1 } } }] });
  write(runner, s(), { actor: 'function:cleanup' }, { operations: [{ op: 'delete', table: 'orders', id: 1 }] });
  const dish = rowHistory(runner, s(), OWNER, { table: 'menu', id: 1 });
  assert.equal(dish.entries[0].op, 'update');
  assert.equal(dish.entries[0].actor, 'user:owner');
  assert.deepEqual(dish.entries[0].changes, { price: [28000, 29000], stock: [5, 6] });
  assert.equal(dish.entries[1].op, 'insert');
  const line = rowHistory(runner, s(), OWNER, { table: 'order_lines', id: 1 });
  assert.deepEqual(line.entries.map(e => [e.op, e.actor]), [
    ['delete', 'function:cleanup'],
    ['insert', 'channel:ana']
  ]);
  updateTable(runner, s(), OWNER, 'menu', { history: false });
  write(runner, s(), OWNER, { operations: [{ op: 'update', table: 'menu', id: 1, set: { price: 1 } }] });
  assert.equal(rowHistory(runner, s(), OWNER, { table: 'menu', id: 1 }).entries.length, 2);
  assert.equal(pruneHistory(runner, new Date(Date.now() + 91 * 86_400_000)) > 0, true);
  assert.equal(rowHistory(runner, s(), OWNER, { table: 'menu', id: 1 }).entries.length, 0);
});

test('schema: add, rename and drop columns keep search, indexes and history working', () => {
  const { runner, s } = restaurant();
  addColumn(runner, s(), OWNER, 'menu', { name: 'spicy', type: 'boolean', default: false, filterable: true });
  throwsData(() => addColumn(runner, s(), OWNER, 'menu', { name: 'size', type: 'text', required: true }), /give it a default/);
  updateColumn(runner, s(), OWNER, 'menu', 'description', { name: 'details' });
  assert.equal(query(runner, s(), OWNER, { table: 'menu', search: 'albahaca' }).rows[0].details, 'tomate, mozzarella y albahaca');
  updateColumn(runner, s(), OWNER, 'menu', 'name', { searchable: false });
  assert.equal(query(runner, s(), OWNER, { table: 'menu', search: 'margherita' }).rows.length, 0);
  dropColumn(runner, s(), OWNER, 'menu', 'details');
  assert.deepEqual(s().tables[0].columns.map(c => c.name), ['name', 'price', 'stock', 'category', 'available', 'spicy']);
  assert.equal(runner.all("SELECT 1 FROM sqlite_master WHERE name = 'menu__fts'").length, 0);
  updateTable(runner, s(), OWNER, 'menu', { name: 'dishes' });
  assert.deepEqual(
    query(runner, s(), OWNER, { table: 'order_lines', where: { 'dish.name': 'x' } }).rows,
    []
  );
  write(runner, s(), OWNER, { operations: [{ op: 'update', table: 'dishes', id: 1, set: { spicy: true } }] });
  assert.equal(rowHistory(runner, s(), OWNER, { table: 'dishes', id: 1 }).entries[0].actor, 'user:owner');
  throwsData(() => dropTable(runner, s(), OWNER, 'dishes'), /order_lines.dish point/);
});

test('schema: a type change copies the table, or lists the rows that would not fit', () => {
  const { db, runner, s } = restaurant();
  addColumn(runner, s(), OWNER, 'menu', { name: 'size', type: 'text' });
  write(runner, s(), OWNER, {
    operations: [
      { op: 'update', table: 'menu', id: 1, set: { size: '30' } },
      { op: 'update', table: 'menu', id: 2, set: { size: 'grande' } }
    ]
  });
  assert.equal(columnChangeNeedsRebuild(s(), 'menu', 'size', { type: 'integer' }), true);
  assert.equal(columnChangeNeedsRebuild(s(), 'menu', 'size', { label: 'Size' }), false);
  // The object switches foreign keys off at the start of a copying request.
  const copying = <T>(fn: () => T): T => {
    db.exec('PRAGMA foreign_keys = OFF');
    try {
      return fn();
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  };
  throwsData(
    () => copying(() => updateColumn(runner, s(), OWNER, 'menu', 'size', { type: 'integer' })),
    /menu.size can't become integer: these rows don't fit: id 2 = "grande"/
  );
  write(runner, s(), OWNER, { operations: [{ op: 'update', table: 'menu', id: 2, set: { size: '40' } }] });
  copying(() => updateColumn(runner, s(), OWNER, 'menu', 'size', { type: 'integer', min: 20 }));
  const sizes = query(runner, s(), OWNER, { table: 'menu', where: { size: { gte: 30 } }, sort: ['size'] });
  assert.deepEqual(sizes.rows.map(r => r.size), [30, 40]);
  throwsData(
    () => write(runner, s(), OWNER, { operations: [{ op: 'update', table: 'menu', id: 1, set: { size: 10 } }] }),
    /can't go below 20/
  );
  assert.equal(query(runner, s(), OWNER, { table: 'menu', search: 'jalapeno' }).rows.length, 1, 'search survives the copy');
  write(runner, s(), OWNER, {
    operations: [
      { op: 'insert', table: 'orders', values: {} },
      { op: 'insert', table: 'order_lines', values: { order: { $ref: 0 }, dish: 1, quantity: 1 } }
    ]
  });
  copying(() => updateColumn(runner, s(), OWNER, 'menu', 'price', { type: 'decimal' }));
  assert.equal(query(runner, s(), OWNER, { table: 'order_lines' }).rows[0].dish?.toString(), '[object Object]', 'relations still resolve');
  assert.equal(dropColumnNeedsRebuild(s(), 'order_lines', 'dish'), true);
  copying(() => dropColumn(runner, s(), OWNER, 'order_lines', 'dish'));
  assert.deepEqual(s().tables[2].columns.map(c => c.name), ['order', 'quantity']);
  throwsData(
    () => copying(() => updateColumn(runner, s(), OWNER, 'menu', 'name', { unique: false, searchable: false, type: 'integer' })),
    /can't become integer/
  );
});

test('unique: turning it on lists the values that repeat', () => {
  const { runner, s } = restaurant();
  write(runner, s(), OWNER, { operations: [{ op: 'update', table: 'menu', id: 2, set: { price: 28000 } }] });
  throwsData(() => updateColumn(runner, s(), OWNER, 'menu', 'price', { unique: true }), /can't be unique: these values repeat: 28000 \(2 rows\)/);
  write(runner, s(), OWNER, { operations: [{ op: 'update', table: 'menu', id: 2, set: { price: 32000 } }] });
  updateColumn(runner, s(), OWNER, 'menu', 'price', { unique: true });
  throwsData(
    () => write(runner, s(), OWNER, { operations: [{ op: 'update', table: 'menu', id: 2, set: { price: 28000 } }] }),
    /Another row in menu already has this price/
  );
});

test('limits: read-only after a downgrade, and full stops only what adds data', () => {
  const { runner, s } = restaurant();
  const readOnly = { ...OWNER, limits: { readOnly: true } };
  throwsData(() => write(runner, s(), readOnly, { operations: [{ op: 'delete', table: 'menu', id: 4 }] }), /read-only/, 'read_only');
  throwsData(() => addColumn(runner, s(), readOnly, 'menu', { name: 'x', type: 'text' }), /read-only/);
  assert.ok(query(runner, s(), readOnly, { table: 'menu' }).rows.length);
  const full = { ...OWNER, limits: { maxBytes: 1 } };
  throwsData(
    () => write(runner, s(), full, { operations: [{ op: 'insert', table: 'orders', values: {} }] }),
    /database is full/,
    'full'
  );
  write(runner, s(), full, { operations: [{ op: 'delete', table: 'menu', id: 4 }] });
});

test('bulk inserts: 500 rows in 100-parameter statements, defaults kept per row', () => {
  const { runner } = open();
  const s = () => loadSchema(runner);
  createTable(runner, s(), OWNER, {
    name: 'contacts',
    columns: [
      { name: 'name', type: 'text', required: true },
      { name: 'email', type: 'email' },
      { name: 'phone', type: 'phone' },
      { name: 'stage', type: 'enum', values: ['lead', 'won'], default: 'lead' }
    ]
  });
  const result = write(runner, s(), OWNER, {
    operations: [
      {
        op: 'insert',
        table: 'contacts',
        rows: Array.from({ length: 500 }, (_, i) => ({ name: `c${i}`, email: `c${i}@x.co`, phone: '+57 300 000 0000' }))
      }
    ]
  });
  const insert = result.results[0] as { ids: number[] };
  assert.equal(insert.ids.length, 500);
  const counted = query(runner, s(), OWNER, { table: 'contacts', aggregate: { fn: 'count' }, groupBy: 'stage' });
  assert.deepEqual(counted.groups, [{ stage: 'lead', count: 500 }]);
  assert.equal(query(runner, s(), OWNER, { table: 'contacts', limit: 1 }).rows[0].phone, '+573000000000');
  write(runner, s(), OWNER, {
    operations: [{ op: 'insert', table: 'contacts', rows: [{ name: 'a', stage: 'won' }, { name: 'b' }] }]
  });
  assert.deepEqual(
    query(runner, s(), OWNER, { table: 'contacts', where: { name: { in: ['a', 'b'] } } }).rows.map(r => r.stage),
    ['won', 'lead']
  );
  throwsData(
    () => write(runner, s(), OWNER, { operations: [{ op: 'insert', table: 'contacts', rows: [{ name: 'x', email: 'nope' }] }] }),
    /Row 0: contacts.email must be an email address/
  );
});

// Customer scope across everything that reaches another table

// Customers scoped per participant, a table hidden from bots, and orders
// that point at both.
const shop = () => {
  const { runner } = open();
  const s = () => loadSchema(runner);
  createTable(runner, s(), OWNER, {
    name: 'customers',
    access: 'full',
    customerScoped: true,
    displayColumn: 'name',
    columns: [
      { name: 'name', type: 'text' },
      { name: 'phone', type: 'phone', personal: true }
    ]
  });
  createTable(runner, s(), OWNER, {
    name: 'secrets',
    access: 'none',
    displayColumn: 'code',
    columns: [{ name: 'code', type: 'text' }]
  });
  createTable(runner, s(), OWNER, {
    name: 'orders',
    access: 'full',
    columns: [
      { name: 'customer', type: 'relation', table: 'customers' },
      { name: 'secret', type: 'relation', table: 'secrets' },
      { name: 'total', type: 'integer' }
    ]
  });
  write(runner, s(), BOT('luis'), {
    operations: [{ op: 'insert', table: 'customers', values: { name: 'Luis', phone: '+573001112233' } }]
  });
  write(runner, s(), OWNER, { operations: [{ op: 'insert', table: 'secrets', values: { code: 'TOPSECRET' } }] });
  // Rows a bot couldn't have written: an order of Luis's, linked by the owner.
  write(runner, s(), OWNER, {
    operations: [{ op: 'insert', table: 'orders', values: { customer: 1, secret: 1, total: 10 } }]
  });
  write(runner, s(), OWNER, { operations: [{ op: 'update', table: 'customers', id: 1, set: { name: 'Luis R' } }] });
  return { runner, s };
};

test("scope: a stale version for another customer's row doesn't return it", () => {
  const { runner, s } = shop();
  assert.throws(
    () =>
      write(runner, s(), BOT('ana'), {
        operations: [{ op: 'update', table: 'customers', id: 1, version: 1, set: { name: 'x' } }]
      }),
    (error: unknown) => {
      assert.ok(error instanceof DataError);
      assert.notEqual(error.code, 'conflict');
      assert.doesNotMatch(JSON.stringify(error.details ?? {}), /Luis|3001112233/);
      return true;
    }
  );
  // Luis's own stale version still gets his current row back.
  assert.throws(
    () =>
      write(runner, s(), BOT('luis'), {
        operations: [{ op: 'update', table: 'customers', id: 1, version: 1, set: { name: 'x' } }]
      }),
    (error: unknown) => {
      assert.ok(error instanceof DataError);
      assert.equal(error.code, 'conflict');
      assert.equal((error.details?.current as { name: string }).name, 'Luis R');
      assert.equal('version' in (error.details?.current as object), false);
      return true;
    }
  );
});

test('scope: labels, relation filters, sorts and group labels see only what the bot may', () => {
  const { runner, s } = shop();
  const [row] = query(runner, s(), BOT('ana'), { table: 'orders' }).rows;
  assert.deepEqual(row.customer, { id: 1, label: null });
  assert.deepEqual(row.secret, { id: 1, label: null });
  assert.equal(
    query(runner, s(), BOT('ana'), { table: 'orders', where: { 'customer.phone': '+573001112233' } }).total,
    0
  );
  assert.equal(
    query(runner, s(), BOT('ana'), { table: 'orders', where: { customer: { name: 'Luis R' } } }).total,
    0
  );
  throwsData(() => query(runner, s(), BOT('ana'), { table: 'orders', where: { 'secret.code': 'TOPSECRET' } }), /Unknown table "secrets"/);
  const grouped = query(runner, s(), BOT('ana'), { table: 'orders', aggregate: { fn: 'count' }, groupBy: ['customer', 'secret'] });
  assert.deepEqual(grouped.groups, [{ customer: { id: 1, label: null }, secret: { id: 1, label: null }, count: 1 }]);
  const included = query(runner, s(), BOT('ana'), { table: 'orders', include: ['customer'] }).rows[0];
  assert.deepEqual(included.customer, { id: 1, label: null });
  // The customer the rows belong to sees their own name.
  assert.deepEqual(query(runner, s(), BOT('luis'), { table: 'orders' }).rows[0].customer, { id: 1, label: 'Luis R' });
  assert.equal(
    query(runner, s(), BOT('luis'), { table: 'orders', include: ['customer'] }).rows[0].customer.phone,
    '+573001112233'
  );
  // The owner sees everything, with the version for concurrent edits.
  const owned = query(runner, s(), OWNER, { table: 'orders' }).rows[0];
  assert.deepEqual(owned.secret, { id: 1, label: 'TOPSECRET' });
  assert.equal(owned.version, 1);
});

test("scope: a bot can't point a relation at a row it can't read", () => {
  const { runner, s } = shop();
  throwsData(
    () => write(runner, s(), BOT('ana'), { operations: [{ op: 'insert', table: 'orders', values: { customer: 1, total: 1 } }] }),
    /no row 1 in customers/,
    'not_found'
  );
  throwsData(
    () => write(runner, s(), BOT('ana'), { operations: [{ op: 'insert', table: 'orders', values: { secret: 1, total: 1 } }] }),
    /can't use/,
    'forbidden'
  );
  throwsData(
    () => write(runner, s(), BOT('ana'), { operations: [{ op: 'update', table: 'orders', id: 1, set: { customer: 1 } }] }),
    /no row 1 in customers/
  );
  write(runner, s(), BOT('ana'), {
    operations: [
      { op: 'insert', table: 'customers', values: { name: 'Ana' } },
      { op: 'insert', table: 'orders', values: { customer: { $ref: 0 }, total: 5 } }
    ]
  });
});

test('scope: history and describe show a bot only its own rows', () => {
  const { runner, s } = shop();
  throwsData(() => rowHistory(runner, s(), BOT('ana'), { table: 'customers', id: 1 }), /no row 1/, 'not_found');
  assert.equal(rowHistory(runner, s(), BOT('luis'), { table: 'customers', id: 1 }).entries.length, 2);
  assert.equal(describe(runner, s(), BOT('ana'), { table: 'customers' }).tables[0].rows, 0);
  assert.equal(describe(runner, s(), BOT('luis'), { table: 'customers' }).tables[0].rows, 1);
  assert.equal(describe(runner, s(), OWNER, { table: 'customers' }).tables[0].rows, 1);
});

test("scope: a bot without a customer can't use scoped tables", () => {
  const { runner, s } = shop();
  const anonymous: DataCaller = { actor: 'channel:x', restricted: true };
  throwsData(() => query(runner, s(), anonymous, { table: 'customers' }), /no customer/, 'forbidden');
  throwsData(
    () => write(runner, s(), anonymous, { operations: [{ op: 'insert', table: 'customers', values: { name: 'x' } }] }),
    /no customer/
  );
  // Tables that aren't scoped still work.
  assert.equal(query(runner, s(), anonymous, { table: 'orders' }).rows.length, 1);
});

// Bounds

test('100 values: a self-relation delete and a 150-row include stay under the limit', () => {
  const { runner } = open();
  const s = () => loadSchema(runner);
  createTable(runner, s(), OWNER, { name: 'cats', columns: [{ name: 'parent', type: 'relation', table: 'cats' }] });
  write(runner, s(), OWNER, { operations: [{ op: 'insert', table: 'cats', rows: Array.from({ length: 60 }, () => ({})) }] });
  assert.deepEqual(write(runner, s(), OWNER, { operations: [{ op: 'delete', table: 'cats', where: { id: { gt: 0 } } }] }).results[0], {
    op: 'delete',
    table: 'cats',
    changed: 60
  });
  write(runner, s(), OWNER, { operations: [{ op: 'insert', table: 'cats', rows: Array.from({ length: 150 }, () => ({})) }] });
  const ids = runner.all('SELECT id FROM cats ORDER BY id').map(r => Number(r.id));
  write(runner, s(), OWNER, { operations: [{ op: 'insert', table: 'cats', rows: ids.map(id => ({ parent: id })) }] });
  const page = query(runner, s(), OWNER, { table: 'cats', where: { parent: { isNull: false } }, include: ['parent'], limit: 200 });
  assert.equal(page.rows.length, 150);
  assert.equal(page.rows.every(r => typeof (r.parent as { created_at?: string }).created_at === 'string'), true);
  // Children point at parents: refused, readably, in chunks.
  throwsData(
    () => write(runner, s(), OWNER, { operations: [{ op: 'delete', table: 'cats', where: { id: { lte: ids[ids.length - 1] } } }] }),
    /150 rows in cats still point/
  );
});

test('writes: an empty "or" entry and an update over the cap are refused before writing', () => {
  const { runner, s } = restaurant();
  throwsData(
    () => write(runner, s(), OWNER, { operations: [{ op: 'update', table: 'menu', where: { or: [{}] }, set: { price: 1 } }] }),
    /at least one condition/
  );
  createTable(runner, s(), OWNER, { name: 'events', columns: [{ name: 'n', type: 'integer' }] });
  for (let i = 0; i < 11; i++) {
    write(runner, s(), OWNER, { operations: [{ op: 'insert', table: 'events', rows: Array.from({ length: 500 }, () => ({ n: 1 })) }] });
  }
  const before = runner.all('SELECT count(*) AS n FROM _ganju_row_log')[0].n;
  throwsData(
    () => write(runner, s(), OWNER, { operations: [{ op: 'update', table: 'events', where: { n: 1 }, set: { n: 2 } }] }),
    /more than 5,000 rows/,
    'too_large'
  );
  assert.equal(runner.all('SELECT count(*) AS n FROM _ganju_row_log')[0].n, before);
});

test('results: a page stops at 1 MB, and aggregates say when groups were cut', () => {
  const { runner } = open();
  const s = () => loadSchema(runner);
  createTable(runner, s(), OWNER, { name: 'notes', columns: [{ name: 'body', type: 'long_text' }, { name: 'tag', type: 'integer' }] });
  const big = 'x'.repeat(300_000);
  write(runner, s(), OWNER, { operations: [{ op: 'insert', table: 'notes', rows: Array.from({ length: 6 }, (_, i) => ({ body: big, tag: i })) }] });
  const page = query(runner, s(), OWNER, { table: 'notes', limit: 6 });
  assert.equal(page.rows.length, 3);
  assert.ok(page.nextCursor);
  const rest = query(runner, s(), OWNER, { table: 'notes', limit: 6, cursor: page.nextCursor });
  assert.equal(rest.rows.length, 3);
  write(runner, s(), OWNER, { operations: [{ op: 'insert', table: 'notes', rows: Array.from({ length: 120 }, (_, i) => ({ tag: i + 10 })) }] });
  const grouped = query(runner, s(), OWNER, { table: 'notes', aggregate: { fn: 'count' }, groupBy: 'tag' });
  assert.equal(grouped.groups.length, 100);
  assert.match(String(grouped.groupsTruncated), /100 largest groups/);
});

// Values

test('datetimes without an offset are read in the project zone, not the server zone', () => {
  const { runner } = open();
  const s = () => loadSchema(runner);
  createTable(runner, s(), OWNER, { name: 'appointments', columns: [{ name: 'at', type: 'datetime' }] });
  write(runner, s(), OWNER, {
    operations: [
      { op: 'insert', table: 'appointments', values: { at: '2026-10-21T15:00:00' } },
      { op: 'insert', table: 'appointments', values: { at: '2026-10-21T15:00:00-05:00' } },
      { op: 'insert', table: 'appointments', values: { at: '2026-10-21T15:00:00Z' } }
    ]
  });
  assert.deepEqual(runner.all('SELECT at FROM appointments ORDER BY id').map(r => r.at), [
    '2026-10-21T20:00:00Z',
    '2026-10-21T20:00:00Z',
    '2026-10-21T15:00:00Z'
  ]);
  assert.equal(
    query(runner, s(), OWNER, { table: 'appointments', where: { at: { gte: '2026-10-21T15:00' } } }).total,
    2
  );
  // Without a zone, UTC; a daylight-saving zone uses the offset of that date.
  write(runner, s(), { actor: 'user:x' }, { operations: [{ op: 'insert', table: 'appointments', values: { at: '2026-01-05 09:30' } }] });
  write(runner, s(), { actor: 'user:x', timeZone: 'Europe/Madrid' }, {
    operations: [
      { op: 'insert', table: 'appointments', values: { at: '2026-01-05T09:30:00' } },
      { op: 'insert', table: 'appointments', values: { at: '2026-07-05T09:30:00' } }
    ]
  });
  assert.deepEqual(runner.all('SELECT at FROM appointments WHERE id > 3 ORDER BY id').map(r => r.at), [
    '2026-01-05T09:30:00Z',
    '2026-01-05T08:30:00Z',
    '2026-07-05T07:30:00Z'
  ]);
  throwsData(
    () => write(runner, s(), OWNER, { operations: [{ op: 'insert', table: 'appointments', values: { at: '2026-02-30T10:00:00' } }] }),
    /is not a date and time/
  );
});

test("tidying fixes quoted keys and operators but leaves a json value's keys alone", () => {
  const { runner } = open();
  const s = () => loadSchema(runner);
  createTable(runner, s(), OWNER, {
    name: 'items',
    columns: [{ name: 'meta', type: 'json' }, { name: 'stock', type: 'integer' }]
  });
  write(runner, s(), OWNER, {
    operations: [{ op: 'insert', table: 'items', values: { '"meta"': { '"quoted"': 1, ' spaced ': 2 }, stock: 5 } }]
  });
  write(runner, s(), OWNER, {
    operations: [{ '"op"': 'update', table: 'items', id: 1, set: { '"stock"': { '"decrement"': 2 } } }]
  });
  const [row] = query(runner, s(), OWNER, { table: 'items' }).rows;
  assert.deepEqual(row.meta, { '"quoted"': 1, ' spaced ': 2 });
  assert.equal(row.stock, 3);
});

test('the hold rule: a relative change over many rows asks, unless the column has a minimum', () => {
  const { runner } = open();
  createTable(runner, loadSchema(runner), OWNER, {
    name: 'menu',
    columns: [
      { name: 'price', type: 'integer' },
      { name: 'stock', type: 'integer', min: 0 }
    ]
  });
  const schema = loadSchema(runner);
  const many = (set: Record<string, unknown>) => ({
    operations: [{ op: 'update', table: 'menu', where: { id: { gt: 0 } }, set }]
  });
  assert.equal(isSensitiveWrite(many({ price: { decrement: 27999 } }), schema), true);
  assert.equal(isSensitiveWrite(many({ stock: { decrement: 1 } }), schema), false);
  // Without the schema the minimum is unknown, so it asks.
  assert.equal(isSensitiveWrite(many({ stock: { decrement: 1 } })), true);
  assert.equal(
    isSensitiveWrite({ operations: [{ op: 'update', table: 'menu', id: 1, set: { price: { decrement: 1 } } }] }, schema),
    false
  );
  // A where that pins id to one value is one row too ("add to my order").
  const one = (where: unknown) => ({
    operations: [{ op: 'update', table: 'menu', where, set: { price: { increment: 5 } } }]
  });
  for (const where of [{ id: 1 }, { id: '1' }, { id: { eq: 1 } }, { id: { in: [1] } }, { id: 1, price: { gt: 0 } }]) {
    assert.equal(isSensitiveWrite(one(where), schema), false, JSON.stringify(where));
  }
  for (const where of [{ id: { in: [1, 2] } }, { id: { gt: 0 } }, { or: [{ id: 1 }, { id: 2 }] }, { price: 1 }]) {
    assert.equal(isSensitiveWrite(one(where), schema), true, JSON.stringify(where));
  }
  // An absolute set on one row is still held.
  assert.equal(
    isSensitiveWrite({ operations: [{ op: 'update', table: 'menu', where: { id: 1 }, set: { price: 1 } }] }, schema),
    true
  );
});

test('names: a searchable "rank" and tables shaped like index names are refused', () => {
  const { runner, s } = restaurant();
  throwsData(
    () => createTable(runner, s(), OWNER, { name: 'docs', columns: [{ name: 'rank', type: 'text', searchable: true }] }),
    /named "rank" can't be searchable/
  );
  createTable(runner, s(), OWNER, { name: 'docs', columns: [{ name: 'rank', type: 'text' }] });
  assert.match(String(identifierIssue('ix_1_1', 'table')), /index names/);
  assert.match(String(identifierIssue('tr_2_log', 'table')), /index names/);
  assert.equal(identifierIssue('tr_records', 'table'), null);
  assert.equal(identifierIssue('ix_1_1', 'column'), null);
});
