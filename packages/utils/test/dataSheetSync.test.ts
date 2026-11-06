// A table kept in step with a spreadsheet: the source on the table, the
// sync applied in one transaction, the refusals, and the file reader. Run
// with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import type { SqlValue } from '../src/dataCompiler.ts';
import {
  addColumn,
  createTable,
  dropColumn,
  loadSchema,
  migrateInternal,
  recordSyncFailure,
  rowHistory,
  syncRows,
  updateColumn,
  updateTable,
  write
} from '../src/dataEngine.ts';
import type { SqlRow, SqlRunner } from '../src/dataEngine.ts';
import { saveTrigger } from '../src/dataTriggers.ts';
import { readTabularFile } from '../src/dataSheet.ts';
import { matchHeaders, importRows } from '../src/dataImport.ts';
import {
  DATA_SHEET_SYNC_ACTOR,
  DataError,
  toTableInput
} from '../src/dataTypes.ts';
import type { DataCaller } from '../src/dataTypes.ts';

const open = () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  let depth = 0;
  const runner: SqlRunner = {
    all: (sql, params = []) =>
      db.prepare(sql).all(...(params as SqlValue[])) as SqlRow[],
    iterate: (sql, params = []) =>
      db.prepare(sql).iterate(...(params as SqlValue[])) as Iterable<SqlRow>,
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
    databaseSize: () => 0
  };
  migrateInternal(runner);
  return { runner, s: () => loadSchema(runner) };
};

const OWNER: DataCaller = { actor: 'user:owner', timeZone: 'America/Bogota' };
const SYNC: DataCaller = {
  actor: DATA_SHEET_SYNC_ACTOR,
  timeZone: 'America/Bogota'
};
const SOURCE = { uri: 'gdrive://files/abc', key: 'sku', title: 'Menú.xlsx' };

const throwsData = (fn: () => unknown, pattern: RegExp, code?: string) =>
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof DataError, `expected DataError, got ${error}`);
    assert.match(error.message, pattern);
    if (code) assert.equal(error.code, code);
    return true;
  });

const menu = () => {
  const db = open();
  createTable(db.runner, db.s(), OWNER, {
    name: 'menu',
    columns: [
      { name: 'sku', type: 'text', required: true, unique: true },
      { name: 'name', type: 'text', required: true },
      { name: 'price', type: 'integer', min: 0 },
      { name: 'available', type: 'boolean' }
    ]
  });
  write(db.runner, db.s(), OWNER, {
    operations: [
      {
        op: 'insert',
        table: 'menu',
        rows: [
          { sku: 'P1', name: 'Margherita', price: 28000, available: true },
          { sku: 'P2', name: 'Hawaiana', price: 30000, available: true },
          { sku: 'P3', name: 'Limonada', price: 8000, available: false }
        ]
      }
    ]
  });
  return db;
};

const rows = (runner: SqlRunner) =>
  runner.all(
    'SELECT sku, name, price, available, version, updated_by FROM menu ORDER BY sku'
  );

const COLUMNS = ['sku', 'name', 'price', 'available'];

test('source: the key is a unique column, and the table answers with it', () => {
  const { runner, s } = menu();
  throwsData(
    () =>
      updateTable(runner, s(), OWNER, 'menu', {
        source: { ...SOURCE, key: 'price' }
      }),
    /menu\.price must be unique to be the sync key/
  );
  throwsData(
    () =>
      updateTable(runner, s(), OWNER, 'menu', {
        source: { ...SOURCE, key: 'nope' }
      }),
    /"source\.key" is the column/
  );
  throwsData(
    () =>
      updateTable(runner, s(), OWNER, 'menu', {
        source: { uri: 'menu.xlsx', key: 'sku' }
      }),
    /"source\.uri"/
  );
  const table = updateTable(runner, s(), OWNER, 'menu', { source: SOURCE });
  assert.deepEqual(table.source, SOURCE);
  assert.equal(table.sync, null);
  // ganju.data.json carries it, without the title.
  assert.deepEqual(toTableInput(table).source, { uri: SOURCE.uri, key: 'sku' });
});

test('a synced table refuses row writes from everyone, but not schema changes', () => {
  const { runner, s } = menu();
  updateTable(runner, s(), OWNER, 'menu', { source: SOURCE });
  for (const operation of [
    { op: 'insert', table: 'menu', values: { sku: 'P9', name: 'x' } },
    { op: 'update', table: 'menu', id: 1, set: { price: 1 } },
    { op: 'delete', table: 'menu', id: 1 }
  ]) {
    throwsData(
      () => write(runner, s(), OWNER, { operations: [operation] }),
      /menu is synced from "Menú\.xlsx"; change the sheet, or stop syncing it\./,
      'read_only'
    );
  }
  // Even the sync's own actor goes through syncRows, not write.
  throwsData(
    () =>
      write(runner, s(), SYNC, {
        operations: [{ op: 'delete', table: 'menu', id: 1 }]
      }),
    /is synced from/
  );
  // Schema changes stay allowed; the key can't be dropped or lose unique.
  updateColumn(runner, s(), OWNER, 'menu', 'name', { label: 'Nombre' });
  throwsData(
    () => dropColumn(runner, s(), OWNER, 'menu', 'sku'),
    /is the key the sheet sync matches rows by/
  );
  throwsData(
    () => updateColumn(runner, s(), OWNER, 'menu', 'sku', { unique: false }),
    /stays unique/
  );
  // Renaming the key moves the source with it.
  updateColumn(runner, s(), OWNER, 'menu', 'sku', { name: 'code' });
  assert.equal(s().tables[0].source?.key, 'code');
  // Stopping the sync makes the rows editable again.
  updateTable(runner, s(), OWNER, 'menu', { source: null });
  write(runner, s(), OWNER, {
    operations: [{ op: 'update', table: 'menu', id: 1, set: { price: 1 } }]
  });
});

test('a sync inserts, updates and deletes only what changed, as system:sheet-sync', () => {
  const { runner, s } = menu();
  updateTable(runner, s(), OWNER, 'menu', { source: SOURCE });
  saveTrigger(runner, s(), OWNER, {
    table: 'menu',
    on: 'update',
    function: 'tell-customer'
  });
  const state = syncRows(runner, s(), SYNC, {
    table: 'menu',
    columns: COLUMNS,
    rows: [
      // P1 changes price; P2 is as it was; P3 is gone; P4 is new.
      { sku: 'P1', name: 'Margherita', price: 29000, available: true },
      { sku: 'P2', name: 'Hawaiana', price: 30000, available: true },
      { sku: 'P4', name: 'Pepperoni', price: 31000 }
    ],
    title: 'Menú 2026.xlsx'
  });
  assert.deepEqual(
    { ...state, at: undefined },
    {
      at: undefined,
      status: 'ok',
      inserted: 1,
      updated: 1,
      deleted: 1,
      unchanged: 1,
      error: null,
      version: null
    }
  );
  assert.deepEqual(
    rows(runner).map(r => [r.sku, r.price, r.version, r.updated_by]),
    [
      ['P1', 29000, 2, DATA_SHEET_SYNC_ACTOR],
      ['P2', 30000, 1, 'user:owner'],
      ['P4', 31000, 1, DATA_SHEET_SYNC_ACTOR]
    ]
  );
  const history = rowHistory(runner, s(), OWNER, { table: 'menu', id: 1 });
  assert.equal(history.entries[0].actor, DATA_SHEET_SYNC_ACTOR);
  assert.deepEqual(history.entries[0].changes, { price: [28000, 29000] });
  // One update fired the trigger: P1's, not the unchanged P2.
  const events = runner
    .all('SELECT message FROM _ganju_outbox')
    .map(r => JSON.parse(String(r.message)));
  assert.equal(events.length, 1);
  assert.equal(events[0].rowId, 1);
  assert.equal(events[0].actor, DATA_SHEET_SYNC_ACTOR);
  const table = s().tables[0];
  assert.equal(table.sync?.status, 'ok');
  assert.equal(table.source?.title, 'Menú 2026.xlsx');
  // The same sheet again writes nothing.
  const again = syncRows(runner, s(), SYNC, {
    table: 'menu',
    columns: COLUMNS,
    rows: [
      { sku: 'P1', name: 'Margherita', price: 29000, available: true },
      { sku: 'P2', name: 'Hawaiana', price: 30000, available: true },
      { sku: 'P4', name: 'Pepperoni', price: 31000 }
    ]
  });
  assert.equal(again.unchanged, 3);
  assert.equal(again.updated + again.inserted + again.deleted, 0);
});

test('a sheet that does not fit changes nothing and says why', () => {
  const { runner, s } = menu();
  updateTable(runner, s(), OWNER, 'menu', { source: SOURCE });
  const before = rows(runner);
  const sync = (sheetRows: Record<string, unknown>[], columns = COLUMNS) =>
    syncRows(runner, s(), SYNC, {
      table: 'menu',
      columns,
      rows: sheetRows,
      lines: sheetRows.map((_, i) => i + 2)
    });
  throwsData(
    () =>
      sync([
        { sku: 'P1', name: 'A' },
        { sku: 'P1', name: 'B' }
      ]),
    /^Line 3: sku "P1" is already on line 2; each line of the sheet needs its own key\.$/,
    'constraint'
  );
  // The key is required here; one that isn't says it's empty.
  throwsData(() => sync([{ name: 'A' }]), /^Line 2: menu\.sku is required\.$/);
  throwsData(
    () => sync([{ sku: 'P1', name: 'A', price: -1 }]),
    /^Line 2: menu\.price can't go below 0\.$/
  );
  throwsData(
    () => sync([{ sku: 'P1', name: 'A', price: 'cheap' }]),
    /^Line 2: /
  );
  throwsData(
    () => sync([{ sku: 'P1' }], ['sku']),
    /The sheet has no column for menu\.name, which is required\./
  );
  throwsData(
    () => sync([{ name: 'A' }], ['name']),
    /The sheet has no column for menu's key, sku\./
  );
  assert.deepEqual(rows(runner), before);
  // The object keeps the reason on the table.
  recordSyncFailure(runner, s(), {
    table: 'menu',
    error: 'Line 3: sku "P1" is already on line 2.'
  });
  const sync2 = s().tables[0].sync;
  assert.equal(sync2?.status, 'failed');
  assert.match(sync2?.error ?? '', /already on line 2/);
});

test('a row another table still points at stops the sync that would delete it', () => {
  const { runner, s } = menu();
  createTable(runner, s(), OWNER, {
    name: 'lines',
    columns: [{ name: 'dish', type: 'relation', table: 'menu', required: true }]
  });
  write(runner, s(), OWNER, {
    operations: [{ op: 'insert', table: 'lines', values: { dish: 3 } }]
  });
  updateTable(runner, s(), OWNER, 'menu', { source: SOURCE });
  throwsData(
    () =>
      syncRows(runner, s(), SYNC, {
        table: 'menu',
        columns: COLUMNS,
        rows: [{ sku: 'P1', name: 'Margherita' }]
      }),
    /^Rows in lines still point at a row the sheet no longer has \(lines\.dish\)/,
    'constraint'
  );
  assert.equal(rows(runner).length, 3);
});

test('a CSV and a spreadsheet read the same way, ready for the sync', async () => {
  const { runner, s } = menu();
  updateTable(runner, s(), OWNER, 'menu', { source: SOURCE });
  const csv =
    'SKU,Name,Price,Available\nP1,Margherita,29000,sí\n\nP5,Calzone,"33.000",no\n';
  const XLSX = await import('xlsx');
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ['SKU', 'Name', 'Price', 'Available'],
      ['P1', 'Margherita', 29000, true],
      [null, null, null, null],
      ['P5', 'Calzone', 33000, false]
    ]),
    'Precios'
  );
  const xlsx = XLSX.write(book, {
    type: 'array',
    bookType: 'xlsx'
  }) as ArrayBuffer;
  for (const file of [
    {
      bytes: new TextEncoder().encode(csv).buffer as ArrayBuffer,
      mimeType: 'text/csv'
    },
    {
      bytes: xlsx,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sheet: 'Precios'
    }
  ]) {
    const read = await readTabularFile({
      ...file,
      uri: SOURCE.uri,
      loadSheetJs: async () => XLSX
    });
    assert.deepEqual(read.lines, [2, 4]);
    const table = s().tables[0];
    const mapping = matchHeaders(read.headers, table);
    assert.deepEqual(mapping, COLUMNS);
    const imported = importRows(table, mapping, read.rows, {
      lines: read.lines
    });
    assert.deepEqual(
      imported.map(r => r.errors),
      [[], []]
    );
    assert.deepEqual(
      imported.map(r => r.values.price),
      [29000, 33000]
    );
  }
  await assert.rejects(
    readTabularFile({
      bytes: xlsx,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      uri: SOURCE.uri,
      sheet: 'Hoja 2',
      loadSheetJs: async () => XLSX
    }),
    /has no sheet "Hoja 2"\. Sheets: Precios\./
  );
});

test('a sync of an older file than the rows already are changes nothing', () => {
  const { runner, s } = menu();
  updateTable(runner, s(), OWNER, 'menu', { source: SOURCE });
  const sheet = (price: number) => [
    { sku: 'P1', name: 'Margherita', price, available: true },
    { sku: 'P2', name: 'Hawaiana', price: 30000, available: true },
    { sku: 'P3', name: 'Limonada', price: 8000, available: false }
  ];
  const newer = syncRows(runner, s(), SYNC, {
    table: 'menu',
    columns: COLUMNS,
    rows: sheet(29000),
    version: '2026-11-06T12:00:00.000Z'
  });
  assert.equal(newer.updated, 1);
  assert.equal(newer.version, '2026-11-06T12:00:00.000Z');
  // The job that read the file before it changed arrives last.
  const older = syncRows(runner, s(), SYNC, {
    table: 'menu',
    columns: COLUMNS,
    rows: sheet(28000),
    version: '2026-11-06T11:00:00.000Z'
  });
  assert.equal(older.stale, true);
  assert.equal(older.updated, 0);
  assert.equal(rows(runner)[0].price, 29000);
  // Nor does an older file's refusal replace the last sync.
  recordSyncFailure(runner, s(), {
    table: 'menu',
    error: 'Line 2: menu.price is required.',
    version: '2026-11-06T11:00:00.000Z'
  });
  assert.equal(s().tables[0].sync?.status, 'ok');
  // The same file again is fine.
  assert.notEqual(
    syncRows(runner, s(), SYNC, {
      table: 'menu',
      columns: COLUMNS,
      rows: sheet(29000),
      version: '2026-11-06T12:00:00.000Z'
    }).stale,
    true
  );
});

test('JSON with its keys in another order is not a change', () => {
  const { runner, s } = open();
  createTable(runner, s(), OWNER, {
    name: 'menu',
    columns: [
      { name: 'sku', type: 'text', required: true, unique: true },
      { name: 'extras', type: 'json' }
    ]
  });
  updateTable(runner, s(), OWNER, 'menu', { source: SOURCE });
  const sync = (extras: unknown) =>
    syncRows(runner, s(), SYNC, {
      table: 'menu',
      columns: ['sku', 'extras'],
      rows: [{ sku: 'P1', extras }]
    });
  assert.equal(
    sync({ size: 'L', cheese: ['mozzarella', 'parmesano'] }).inserted,
    1
  );
  const again = sync({ cheese: ['mozzarella', 'parmesano'], size: 'L' });
  assert.deepEqual([again.updated, again.unchanged], [0, 1]);
  // An array in another order is a different value.
  assert.equal(
    sync({ cheese: ['parmesano', 'mozzarella'], size: 'L' }).updated,
    1
  );
});

test('a synced table is never customer-scoped', () => {
  const { runner, s } = menu();
  updateTable(runner, s(), OWNER, 'menu', { customerScoped: true });
  throwsData(
    () => updateTable(runner, s(), OWNER, 'menu', { source: SOURCE }),
    /can't be both customer-scoped and synced from a sheet/
  );
  updateTable(runner, s(), OWNER, 'menu', {
    customerScoped: false,
    source: SOURCE
  });
  throwsData(
    () => updateTable(runner, s(), OWNER, 'menu', { customerScoped: true }),
    /can't be both customer-scoped/
  );
  // Both at once: stop syncing, then scope it.
  updateTable(runner, s(), OWNER, 'menu', {
    customerScoped: true,
    source: null
  });
  throwsData(
    () =>
      createTable(runner, s(), OWNER, {
        name: 'prices',
        customerScoped: true,
        source: SOURCE,
        columns: [{ name: 'sku', type: 'text', unique: true }]
      }),
    /can't be both customer-scoped/
  );
});

test("a delete elsewhere can't cascade into a synced table's rows", () => {
  for (const onDelete of ['cascade', 'set_null'] as const) {
    const { runner, s } = menu();
    createTable(runner, s(), OWNER, {
      name: 'categories',
      columns: [{ name: 'name', type: 'text', required: true }]
    });
    write(runner, s(), OWNER, {
      operations: [
        {
          op: 'insert',
          table: 'categories',
          rows: [{ name: 'Pizza' }, { name: 'Bebidas' }]
        }
      ]
    });
    addColumn(runner, s(), OWNER, 'menu', {
      name: 'category',
      type: 'relation',
      table: 'categories',
      onDelete
    });
    write(runner, s(), OWNER, {
      operations: [{ op: 'update', table: 'menu', id: 1, set: { category: 1 } }]
    });
    updateTable(runner, s(), OWNER, 'menu', { source: SOURCE });
    throwsData(
      () =>
        write(runner, s(), OWNER, {
          operations: [{ op: 'delete', table: 'categories', id: 1 }]
        }),
      /Can't delete: it would change a row of menu \(menu\.category\), which is synced from "Menú\.xlsx"/,
      'read_only'
    );
    // A category no synced row points at goes as usual.
    write(runner, s(), OWNER, {
      operations: [{ op: 'delete', table: 'categories', id: 2 }]
    });
    assert.equal(
      runner.all('SELECT category FROM menu WHERE id = 1')[0].category,
      1
    );
  }
});

test("a row a sync inserts never takes a deleted row's id", () => {
  const { runner, s } = menu();
  updateTable(runner, s(), OWNER, 'menu', { source: SOURCE });
  // P3 (id 3) goes and P4 comes in the same sync; then P4 goes too.
  syncRows(runner, s(), SYNC, {
    table: 'menu',
    columns: COLUMNS,
    rows: [
      { sku: 'P1', name: 'Margherita', price: 28000, available: true },
      { sku: 'P2', name: 'Hawaiana', price: 30000, available: true },
      { sku: 'P4', name: 'Pepperoni', price: 31000 }
    ]
  });
  syncRows(runner, s(), SYNC, {
    table: 'menu',
    columns: COLUMNS,
    rows: [
      { sku: 'P1', name: 'Margherita', price: 28000, available: true },
      { sku: 'P5', name: 'Calzone', price: 33000 }
    ]
  });
  assert.deepEqual(
    runner.all('SELECT id, sku FROM menu ORDER BY id').map(r => [r.id, r.sku]),
    [
      [1, 'P1'],
      [5, 'P5']
    ]
  );
  assert.equal(
    rowHistory(runner, s(), OWNER, { table: 'menu', id: 5 }).entries.length,
    1
  );
});
