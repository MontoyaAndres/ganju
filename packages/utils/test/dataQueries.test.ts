// Named queries on node:sqlite: the text checks, the check SQLite's own
// compiler makes when one is saved, and running them as the owner, a
// function and a channel bot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  compileQuerySql,
  dropQuery,
  listQueries,
  queriesFor,
  runQuery,
  saveQuery
} from '../src/dataQueries.ts';
import {
  createTable,
  describe,
  loadSchema,
  migrateInternal,
  query,
  write
} from '../src/dataEngine.ts';
import type { SqlRow, SqlRunner } from '../src/dataEngine.ts';
import type { SqlValue } from '../src/dataCompiler.ts';
import { DataError } from '../src/dataTypes.ts';
import type { DataCaller } from '../src/dataTypes.ts';

const open = () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const bound = (params: readonly SqlValue[]) => {
    if (params.length > 100) throw new Error('too many SQL variables');
    return params as SqlValue[];
  };
  const runner: SqlRunner = {
    all: (sql, params = []) =>
      db.prepare(sql).all(...bound(params)) as SqlRow[],
    iterate: (sql, params = []) =>
      db.prepare(sql).iterate(...bound(params)) as Iterable<SqlRow>,
    transaction: fn => {
      db.exec('SAVEPOINT sp');
      try {
        const result = fn();
        db.exec('RELEASE sp');
        return result;
      } catch (error) {
        db.exec('ROLLBACK TO sp');
        db.exec('RELEASE sp');
        throw error;
      }
    },
    databaseSize: () => 0
  };
  migrateInternal(runner);
  return runner;
};

const OWNER: DataCaller = { actor: 'user:owner' };
const FUNCTION: DataCaller = { actor: 'function:report' };
const BOT: DataCaller = {
  actor: 'channel:ana',
  restricted: true,
  participantId: 'ana'
};

const throwsData = (fn: () => unknown, pattern: RegExp, code?: string) =>
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof DataError, `expected DataError, got ${error}`);
    assert.match(error.message, pattern);
    if (code) assert.equal(error.code, code);
    return true;
  });

const shop = () => {
  const runner = open();
  const s = () => loadSchema(runner);
  createTable(runner, s(), OWNER, {
    name: 'menu',
    access: 'read',
    columns: [
      { name: 'name', type: 'text', required: true },
      { name: 'price', type: 'integer', required: true }
    ]
  });
  createTable(runner, s(), OWNER, {
    name: 'orders',
    access: 'full',
    customerScoped: true,
    columns: [{ name: 'placed_at', type: 'datetime' }]
  });
  createTable(runner, s(), OWNER, {
    name: 'lines',
    access: 'add',
    columns: [
      { name: 'order', type: 'relation', table: 'orders', required: true },
      { name: 'dish', type: 'relation', table: 'menu', required: true },
      { name: 'quantity', type: 'integer', required: true }
    ]
  });
  write(runner, s(), OWNER, {
    operations: [
      {
        op: 'insert',
        table: 'menu',
        rows: [
          { name: 'Margherita', price: 28000 },
          { name: 'Limonada', price: 8000 }
        ]
      },
      {
        op: 'insert',
        table: 'orders',
        values: { placed_at: '2026-10-20T15:00:00Z' }
      },
      {
        op: 'insert',
        table: 'orders',
        values: { placed_at: '2026-10-28T15:00:00Z' }
      },
      {
        op: 'insert',
        table: 'lines',
        values: { order: { $ref: 1 }, dish: 1, quantity: 2 }
      },
      {
        op: 'insert',
        table: 'lines',
        values: { order: { $ref: 2 }, dish: 1, quantity: 1 }
      },
      {
        op: 'insert',
        table: 'lines',
        values: { order: { $ref: 2 }, dish: 2, quantity: 3 }
      }
    ]
  });
  return { runner, s };
};

const SALES = `SELECT m.name AS dish, sum(l.quantity) AS sold, sum(l.quantity * m.price) AS revenue
FROM lines l JOIN menu m ON m.id = l.dish JOIN orders o ON o.id = l."order"
WHERE o.placed_at >= :from AND o.placed_at < :to
GROUP BY m.name ORDER BY revenue DESC;`;

test('query text: one statement, a SELECT, named parameters', () => {
  assert.deepEqual(
    compileQuerySql('select * from menu where price < :max and name <> :max'),
    {
      sql: 'select * from menu where price < ?1 and name <> ?1',
      params: ['max']
    }
  );
  assert.deepEqual(
    compileQuerySql('SELECT \':nope\', "x;y" FROM menu -- ; :also\n;;').params,
    []
  );
  throwsData(
    () => compileQuerySql('SELECT 1; DELETE FROM menu'),
    /one statement/
  );
  throwsData(
    () => compileQuerySql('DELETE FROM menu'),
    /starts with SELECT or WITH/
  );
  throwsData(
    () => compileQuerySql('UPDATE menu SET price = 0'),
    /starts with SELECT/
  );
  throwsData(
    () => compileQuerySql('SELECT * FROM menu WHERE id = ?'),
    /named parameters/
  );
  throwsData(
    () => compileQuerySql('SELECT * FROM _ganju_tables'),
    /isn't one of this database's/
  );
  throwsData(
    () => compileQuerySql('SELECT * FROM "sqlite_schema"'),
    /isn't one of/
  );
  throwsData(
    () => compileQuerySql("SELECT * FROM pragma_table_info('menu')"),
    /isn't one of/
  );
  throwsData(() => compileQuerySql('SELECT * FROM menu__fts'), /isn't one of/);
  throwsData(() => compileQuerySql('SELECT 1 /* open'), /unterminated comment/);
  throwsData(() => compileQuerySql("SELECT 'open"), /unterminated string/);
});

test('saving: SQLite compiles it, and it may only read our tables', () => {
  const { runner, s } = shop();
  const saved = saveQuery(runner, s(), OWNER, {
    name: 'sales_by_dish',
    description: 'Units and revenue per dish between two dates',
    sql: SALES,
    params: [
      { name: 'from', type: 'datetime', description: 'start, inclusive' },
      { name: 'to', type: 'datetime' }
    ]
  });
  assert.deepEqual(saved.tables, ['lines', 'menu', 'orders']);
  assert.ok(saved.plan.length > 0);
  assert.equal(saved.updatedBy, 'user:owner');
  assert.equal(saved.assistant, false);

  // A write can't hide behind WITH: SQLite doesn't parse one there.
  throwsData(
    () =>
      saveQuery(runner, s(), OWNER, {
        name: 'bad',
        sql: 'WITH x AS (DELETE FROM menu RETURNING *) SELECT 1'
      }),
    /doesn't compile/
  );
  throwsData(
    () =>
      saveQuery(runner, s(), OWNER, {
        name: 'bad',
        sql: 'UPDATE menu SET price = 0'
      }),
    /starts with SELECT/
  );
  throwsData(
    () =>
      saveQuery(runner, s(), OWNER, { name: 'bad', sql: 'SELECT * FROM nope' }),
    /doesn't compile: no such table: nope/
  );
  throwsData(
    () =>
      saveQuery(runner, s(), OWNER, {
        name: 'bad',
        sql: 'SELECT * FROM menu WHERE price < :max'
      }),
    /Declare the type of :max/
  );
  throwsData(
    () =>
      saveQuery(runner, s(), OWNER, {
        name: 'bad',
        sql: 'SELECT * FROM menu',
        params: [{ name: 'max', type: 'integer' }]
      }),
    /doesn't use :max/
  );
  throwsData(
    () => saveQuery(runner, s(), OWNER, { name: 'Bad Name', sql: 'SELECT 1' }),
    /needs a name/
  );
  // Virtual tables open with VOpen, which the program doesn't name: dbstat
  // would list every table, ours or not, with its size.
  throwsData(
    () =>
      saveQuery(runner, s(), OWNER, {
        name: 'bad',
        sql: 'SELECT name, pgsize FROM dbstat'
      }),
    /not other virtual tables such as dbstat/
  );
  throwsData(
    () =>
      saveQuery(runner, s(), OWNER, {
        name: 'bad',
        sql: 'SELECT x.name FROM menu, "DBSTAT" AS x'
      }),
    /not other virtual tables such as dbstat/
  );
  const tags = saveQuery(runner, s(), OWNER, {
    name: 'tags',
    sql: "SELECT m.name, j.value FROM menu m, json_each('[1,2]') j"
  });
  assert.deepEqual(tags.tables, ['menu']);
  // One json_each used twice through a CTE, and json_tree, are still JSON.
  saveQuery(runner, s(), OWNER, {
    name: 'pairs',
    sql: "WITH t AS (SELECT value FROM json_each('[1,2]')) SELECT a.value, b.value FROM t a, t b, json_tree('{}') k"
  });
  dropQuery(runner, 'pairs');
  assert.deepEqual(
    listQueries(runner).map(q => q.name),
    ['sales_by_dish', 'tags']
  );
});

test('running: parameters bound by type, rows capped', () => {
  const { runner, s } = shop();
  saveQuery(runner, s(), OWNER, {
    name: 'sales_by_dish',
    sql: SALES,
    params: [
      { name: 'from', type: 'datetime' },
      { name: 'to', type: 'datetime' }
    ]
  });
  const all = runQuery(runner, s(), FUNCTION, {
    name: 'sales_by_dish',
    params: {
      from: '2026-10-01T00:00:00-05:00',
      to: '2026-11-01T00:00:00-05:00'
    }
  });
  assert.deepEqual(all.rows, [
    { dish: 'Margherita', sold: 3, revenue: 84000 },
    { dish: 'Limonada', sold: 3, revenue: 24000 }
  ]);
  const late = runQuery(runner, s(), FUNCTION, {
    name: 'sales_by_dish',
    params: { from: '2026-10-25T00:00:00Z', to: '2026-11-01T00:00:00Z' }
  });
  assert.equal(late.rows.length, 2);

  const capped = runQuery(runner, s(), FUNCTION, {
    name: 'sales_by_dish',
    params: { from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z' },
    limit: 1
  });
  assert.equal(capped.rows.length, 1);
  assert.match(String(capped.truncated), /stopped at 1 rows/);

  throwsData(
    () =>
      runQuery(runner, s(), FUNCTION, {
        name: 'sales_by_dish',
        params: { from: 'yesterday', to: '2026-11-01T00:00:00Z' }
      }),
    /from/
  );
  throwsData(
    () =>
      runQuery(runner, s(), FUNCTION, {
        name: 'sales_by_dish',
        params: { to: '2026-11-01T00:00:00Z' }
      }),
    /Parameter from is required/
  );
  throwsData(
    () =>
      runQuery(runner, s(), FUNCTION, {
        name: 'sales_by_dish',
        params: {
          from: '2026-10-01T00:00:00Z',
          to: '2026-11-01T00:00:00Z',
          drop: 1
        }
      }),
    /not drop/
  );
  throwsData(
    () => runQuery(runner, s(), FUNCTION, { name: 'nope' }),
    /no named query "nope"/,
    'not_found'
  );
});

test('running: a scan of a large table is refused, through an index too', () => {
  const { runner, s } = shop();
  saveQuery(runner, s(), OWNER, {
    name: 'dishes_sold',
    sql: 'SELECT dish, count(*) AS n FROM lines GROUP BY dish'
  });
  assert.ok(
    listQueries(runner)[0].plan.some(line =>
      /^SCAN lines USING COVERING INDEX/.test(line)
    )
  );
  assert.equal(
    runQuery(runner, s(), FUNCTION, { name: 'dishes_sold' }).rows.length,
    2
  );
  runner.all('UPDATE lines SET id = 300000 WHERE id = 3');
  throwsData(
    () => runQuery(runner, s(), FUNCTION, { name: 'dishes_sold' }),
    /reads all of lines/,
    'too_large'
  );
});

test('channel bots run only what the owner allowed, never over customer rows', () => {
  const { runner, s } = shop();
  saveQuery(runner, s(), OWNER, {
    name: 'cheapest',
    sql: 'SELECT name, price FROM menu ORDER BY price LIMIT :n',
    params: [{ name: 'n', type: 'integer' }],
    assistant: true
  });
  saveQuery(runner, s(), OWNER, {
    name: 'menu_size',
    sql: 'SELECT count(*) AS n FROM menu'
  });
  saveQuery(runner, s(), OWNER, {
    name: 'all_orders',
    sql: 'SELECT count(*) AS n FROM orders',
    assistant: true
  });
  assert.deepEqual(
    queriesFor(runner, s(), BOT).map(q => q.name),
    ['cheapest']
  );
  assert.deepEqual(
    queriesFor(runner, s(), OWNER).map(q => q.name),
    ['all_orders', 'cheapest', 'menu_size']
  );
  assert.deepEqual(
    runQuery(runner, s(), BOT, { name: 'cheapest', params: { n: 1 } }).rows,
    [{ name: 'Limonada', price: 8000 }]
  );
  throwsData(
    () => runQuery(runner, s(), BOT, { name: 'menu_size' }),
    /assistant may run/,
    'not_found'
  );
  throwsData(
    () => runQuery(runner, s(), BOT, { name: 'all_orders' }),
    /assistant may run/,
    'not_found'
  );
  assert.deepEqual(runQuery(runner, s(), OWNER, { name: 'all_orders' }).rows, [
    { n: 2 }
  ]);

  assert.deepEqual(dropQuery(runner, 'menu_size'), { dropped: 'menu_size' });
  throwsData(() => dropQuery(runner, 'menu_size'), /no named query/);
});

test('tool definitions: a bot sees its tables, the queries it may run, and data-write only where it adds', async () => {
  const { dataToolDefinitions, dataAdminToolDefinition } = await import(
    '../src/dataTools.ts'
  );
  const { runner, s } = shop();
  saveQuery(runner, s(), OWNER, {
    name: 'cheapest',
    description: 'The cheapest dishes',
    sql: 'SELECT name, price FROM menu ORDER BY price LIMIT :n',
    params: [{ name: 'n', type: 'integer' }],
    assistant: true
  });
  const schema = s();
  const bot = dataToolDefinitions(schema, BOT, {
    queries: queriesFor(runner, schema, BOT)
  });
  assert.deepEqual(
    bot.map(t => t.name),
    ['data-describe', 'data-query', 'data-write']
  );
  const query = bot[1];
  assert.match(
    query.description,
    /- menu\. Read only\. Columns: name, price \(integer\)\./
  );
  assert.match(
    query.description,
    /- orders\. Only this customer's own rows are visible\./
  );
  assert.match(
    query.description,
    /- cheapest: The cheapest dishes\. Params: n \(integer\)\./
  );
  assert.deepEqual((query.inputSchema.properties as any).query.enum, [
    'cheapest'
  ]);
  assert.equal(bot[2].annotations.destructiveHint, true);

  // Hidden tables don't exist for the model; with nothing it may add to,
  // there is no data-write.
  const readOnly = {
    tables: schema.tables.map(t => ({
      ...t,
      access: t.name === 'menu' ? ('read' as const) : ('none' as const)
    }))
  };
  const reader = dataToolDefinitions(readOnly, BOT);
  assert.deepEqual(
    reader.map(t => t.name),
    ['data-describe', 'data-query']
  );
  assert.doesNotMatch(reader[1].description, /^- (orders|lines)/m);
  assert.deepEqual(
    dataToolDefinitions(
      { tables: readOnly.tables.map(t => ({ ...t, access: 'none' as const })) },
      BOT
    ),
    []
  );
  // The owner's session sees every table, all of them full.
  assert.doesNotMatch(
    dataToolDefinitions(readOnly, OWNER)[1].description,
    /Read only/
  );
  assert.equal(dataAdminToolDefinition().name, 'data-admin');
});

test('a caller held to some tables reaches no other, through relations either', () => {
  const { runner, s } = shop();
  saveQuery(runner, s(), OWNER, {
    name: 'sales',
    sql: SALES,
    params: [
      { name: 'from', type: 'datetime' },
      { name: 'to', type: 'datetime' }
    ]
  });
  saveQuery(runner, s(), OWNER, {
    name: 'prices',
    sql: 'SELECT name, price FROM menu'
  });
  const fn: DataCaller = { actor: 'function:menu', tables: ['menu', 'lines'] };
  const names = (
    describe(runner, s(), fn, {}) as { tables: { name: string }[] }
  ).tables.map(t => t.name);
  assert.deepEqual(names.sort(), ['lines', 'menu']);
  assert.equal(
    query(runner, s(), fn, { table: 'lines', where: { dish: 1 } }).rows.length,
    2
  );
  throwsData(
    () => query(runner, s(), fn, { table: 'orders' }),
    /Unknown table "orders"/,
    'not_found'
  );
  // A filter through a relation would test values in the hidden table.
  throwsData(
    () =>
      query(runner, s(), fn, {
        table: 'lines',
        where: { 'order.placed_at': { gte: '2026-10-25T00:00:00Z' } }
      }),
    /Unknown table "orders"/
  );
  throwsData(
    () =>
      write(runner, s(), fn, {
        operations: [
          {
            op: 'delete',
            table: 'lines',
            where: { 'order.placed_at': { lt: '2026-10-25T00:00:00Z' } }
          }
        ]
      }),
    /Unknown table "orders"/
  );
  throwsData(
    () =>
      write(runner, s(), fn, {
        operations: [
          {
            op: 'insert',
            table: 'lines',
            values: { order: 1, dish: 1, quantity: 1 }
          }
        ]
      }),
    /points at orders, which isn't one of this caller's tables/,
    'forbidden'
  );
  assert.deepEqual(
    queriesFor(runner, s(), fn).map(q => q.name),
    ['prices']
  );
  throwsData(
    () =>
      runQuery(runner, s(), fn, {
        name: 'sales',
        params: { from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z' }
      }),
    /no named query "sales"/,
    'not_found'
  );
  assert.equal(runQuery(runner, s(), fn, { name: 'prices' }).rows.length, 2);
});
