// The ProjectDatabase object in workerd (Miniflare), called over RPC from a
// second Worker through a script_name binding, the way apps/api, apps/mcp and
// apps/tool-broker reach it. Run with `npm test` in apps/data.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let mf;
let dir;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ganju-data-test-'));
  await build({
    entryPoints: [path.join(APP, 'src/index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    conditions: ['workerd', 'worker', 'import'],
    mainFields: ['module', 'main'],
    external: ['cloudflare:workers', 'node:*'],
    outfile: path.join(dir, 'index.js'),
    logLevel: 'error'
  });
  mf = new Miniflare({
    workers: [
      {
        name: 'caller',
        modules: true,
        compatibilityDate: '2025-11-17',
        durableObjects: {
          DB: { className: 'ProjectDatabase', scriptName: 'data', useSQLite: true }
        },
        script: `export default { async fetch(request, env) {
          const { name, method, args } = await request.json();
          const stub = env.DB.get(env.DB.idFromName(name));
          return Response.json(await stub[method](...args));
        } }`
      },
      {
        name: 'data',
        modules: [{ type: 'ESModule', path: path.join(dir, 'index.js') }],
        modulesRoot: dir,
        compatibilityDate: '2025-11-17',
        compatibilityFlags: ['nodejs_compat'],
        durableObjects: {
          PROJECT_DATABASE: { className: 'ProjectDatabase', useSQLite: true }
        },
        r2Buckets: ['STORAGE_BUCKET'],
        queueProducers: { DATA_TRIGGER_QUEUE: 'data-triggers' }
      },
      {
        // Stands in for apps/api's consumer: keeps what it was handed.
        name: 'sink',
        modules: true,
        compatibilityDate: '2025-11-17',
        kvNamespaces: ['SEEN'],
        queueConsumers: { 'data-triggers': { maxBatchTimeout: 0 } },
        script: `export default {
          async queue(batch, env) {
            for (const m of batch.messages) await env.SEEN.put(m.body.eventId, JSON.stringify(m.body));
          },
          async fetch(request, env) {
            const list = await env.SEEN.list();
            return Response.json(await Promise.all(list.keys.map(async k => await env.SEEN.get(k.name))));
          }
        }`
      }
    ]
  });
});

after(async () => {
  await mf?.dispose();
  fs.rmSync(dir, { recursive: true, force: true });
});

const callOn =
  name =>
  async (method, ...args) => {
    const response = await mf.dispatchFetch('http://caller/', {
      method: 'POST',
      body: JSON.stringify({ name, method, args })
    });
    return response.json();
  };

const owner = { actor: 'user:owner', timeZone: 'America/Bogota' };
const bot = {
  actor: 'channel:ana',
  restricted: true,
  participantId: 'ana',
  timeZone: 'America/Bogota'
};

const restaurant = async call => {
  await call('init', { artifactId: 'artifact-1', name: 'demo' });
  for (const table of [
    {
      name: 'menu',
      displayColumn: 'name',
      access: 'full',
      columns: [
        { name: 'name', type: 'text', required: true, unique: true, searchable: true },
        { name: 'price', type: 'integer', required: true, min: 0 },
        { name: 'stock', type: 'integer', required: true, min: 0, default: 0 }
      ]
    },
    {
      name: 'orders',
      access: 'full',
      customerScoped: true,
      columns: [{ name: 'status', type: 'enum', values: ['pending', 'ready'], default: 'pending' }]
    },
    {
      name: 'order_lines',
      access: 'add',
      columns: [
        { name: 'order', type: 'relation', table: 'orders', onDelete: 'cascade', required: true },
        { name: 'dish', type: 'relation', table: 'menu', required: true },
        { name: 'quantity', type: 'integer', required: true, min: 1 }
      ]
    }
  ]) {
    const created = await call('createTable', owner, table);
    assert.equal(created.ok, true, JSON.stringify(created));
  }
  await call('write', owner, {
    operations: [
      {
        op: 'insert',
        table: 'menu',
        rows: [
          { name: 'Margherita', price: 28000, stock: 5 },
          { name: 'Pizza Jalapeño', price: 32000, stock: 1 }
        ]
      }
    ]
  });
};

test('a database that was never created refuses every call but init', async () => {
  const call = callOn('never');
  const result = await call('query', owner, { table: 'menu' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'not_initialised');
  const info = await call('init', { artifactId: 'never', name: 'x' });
  assert.equal(info.ok, true);
  assert.equal((await call('init', { artifactId: 'never', name: 'x' })).ok, true, 'init is idempotent');
  assert.equal((await call('init', { artifactId: 'other', name: 'x' })).error.code, 'conflict');
});

test('an order: three operations together, a short one rolled back, usage counted', async () => {
  const call = callOn('orders');
  await restaurant(call);
  const order = await call('write', bot, {
    operations: [
      { op: 'insert', table: 'orders', values: {} },
      { op: 'insert', table: 'order_lines', values: { order: { $ref: 0 }, dish: 1, quantity: 2 } },
      { op: 'update', table: 'menu', id: 1, set: { stock: { decrement: 2 } }, where: { stock: { gte: 2 } } }
    ]
  });
  assert.equal(order.ok, true);
  assert.ok(order.usage.rowsWritten >= 3);
  const short = await call('write', bot, {
    operations: [
      { op: 'insert', table: 'orders', values: {} },
      { op: 'update', table: 'menu', id: 2, set: { stock: { decrement: 2 } }, where: { stock: { gte: 2 } } }
    ]
  });
  assert.equal(short.error.code, 'guard');
  assert.match(short.error.message, /stock = 1/);
  const mine = await call('query', bot, { table: 'orders' });
  assert.equal(mine.value.total, 1);
  assert.ok(mine.usage.rowsRead > 0);
  const lines = await call('query', owner, { table: 'order_lines', include: ['dish'] });
  assert.equal(lines.value.rows[0].dish.name, 'Margherita');
  const history = await call('history', owner, { table: 'menu', id: 1 });
  assert.equal(history.value.entries[0].actor, 'channel:ana');
  const restrict = await call('write', owner, { operations: [{ op: 'delete', table: 'menu', id: 1 }] });
  assert.match(restrict.error.message, /1 row in order_lines still points at this row/);
  const search = await call('query', owner, { table: 'menu', search: 'jalapeno' });
  assert.equal(search.value.rows[0].name, 'Pizza Jalapeño');
});

test('a type change copies the table with foreign keys off, and they are back on after', async () => {
  const call = callOn('copies');
  await restaurant(call);
  await call('write', owner, {
    operations: [
      { op: 'insert', table: 'orders', values: {} },
      { op: 'insert', table: 'order_lines', values: { order: { $ref: 0 }, dish: 1, quantity: 1 } }
    ]
  });
  await call('addColumn', owner, 'menu', { name: 'size', type: 'text' });
  await call('write', owner, {
    operations: [{ op: 'update', table: 'menu', id: 1, set: { size: 'big' } }]
  });
  const refused = await call('updateColumn', owner, 'menu', 'size', { type: 'integer' });
  assert.match(refused.error.message, /id 1 = "big"/);
  const changed = await call('updateColumn', owner, 'menu', 'price', { type: 'decimal' });
  assert.equal(changed.ok, true, JSON.stringify(changed));
  assert.equal(typeof changed.value.bookmark, 'string');
  const lines = await call('query', owner, { table: 'order_lines' });
  assert.equal(lines.value.rows[0].dish.label, 'Margherita');
  const orphan = await call('write', owner, {
    operations: [{ op: 'insert', table: 'order_lines', values: { order: 99, dish: 1, quantity: 1 } }]
  });
  assert.equal(orphan.error.code, 'constraint');
  const dropped = await call('dropColumn', owner, 'order_lines', 'dish');
  assert.equal(dropped.ok, true, JSON.stringify(dropped));
});

test('export writes schema.json and one file per table to R2', async () => {
  const call = callOn('export');
  await restaurant(call);
  const started = await call('exportStart', owner, { format: 'csv' });
  assert.equal(started.ok, true);
  let status;
  for (let i = 0; i < 50; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    status = await call('exportStatus', { exportId: started.value.exportId });
    if (status.value.status !== 'running') break;
  }
  assert.equal(status.value.status, 'done', JSON.stringify(status));
  assert.deepEqual(
    status.value.files.map(f => f.table),
    [null, 'menu', 'orders', 'order_lines']
  );
  const bucket = await mf.getR2Bucket('STORAGE_BUCKET', 'data');
  const menu = await bucket.get(status.value.files[1].key);
  const text = await menu.text();
  assert.match(text.split('\n')[0], /^id,name,price,stock,created_at/);
  assert.match(text, /Pizza Jalapeño/);
});

test('delete: refused while deleted, undone, then purged to nothing', async () => {
  const call = callOn('lifecycle');
  await restaurant(call);
  const deleted = await call('markDeleted', owner);
  assert.equal(typeof deleted.value.bookmark, 'string');
  assert.equal((await call('query', owner, { table: 'menu' })).error.code, 'deleted');
  assert.equal((await call('info')).ok, true, 'info still answers');
  await call('undelete', owner);
  assert.equal((await call('query', owner, { table: 'menu' })).ok, true);
  assert.equal((await call('purge')).error.code, 'conflict', 'only a deleted database is purged');
  await call('markDeleted', owner);
  const purged = await call('purge');
  assert.equal(purged.ok, true);
  assert.equal((await call('info')).error.code, 'not_initialised');
});

test('read-only and full limits come from the caller', async () => {
  const call = callOn('limits');
  await restaurant(call);
  const readOnly = { ...owner, limits: { readOnly: true } };
  assert.equal((await call('write', readOnly, { operations: [{ op: 'delete', table: 'menu', id: 2 }] })).error.code, 'read_only');
  assert.equal((await call('query', readOnly, { table: 'menu' })).ok, true);
  const full = { ...owner, limits: { maxBytes: 1 } };
  assert.equal((await call('write', full, { operations: [{ op: 'insert', table: 'orders', values: {} }] })).error.code, 'full');
  assert.equal((await call('write', full, { operations: [{ op: 'delete', table: 'menu', id: 2 }] })).ok, true);
});

test('a large export is cut into equal parts, rows intact across them, and its reads are billed', async () => {
  const call = callOn('export-large');
  await call('init', { artifactId: 'artifact-2', name: 'big' });
  await call('createTable', owner, {
    name: 'notes',
    columns: [{ name: 'body', type: 'long_text' }]
  });
  // About 12 MB: two full 5 MiB parts and a last one, written over a dozen
  // steps, with rows that straddle the cuts.
  const body = 'ñ'.repeat(30_000);
  for (let i = 0; i < 4; i++) {
    const inserted = await call('write', owner, {
      operations: [{ op: 'insert', table: 'notes', rows: Array.from({ length: 50 }, () => ({ body })) }]
    });
    assert.equal(inserted.ok, true, JSON.stringify(inserted).slice(0, 300));
  }
  const started = await call('exportStart', owner, { format: 'jsonl' });
  let status;
  let billed = 0;
  for (let i = 0; i < 100; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    status = await call('exportStatus', { exportId: started.value.exportId });
    billed += status.usage.rowsRead;
    if (status.value.status !== 'running') break;
  }
  assert.equal(status.value.status, 'done', JSON.stringify(status).slice(0, 500));
  const file = status.value.files.find(f => f.table === 'notes');
  const bucket = await mf.getR2Bucket('STORAGE_BUCKET', 'data');
  const object = await bucket.get(file.key);
  const bytes = new Uint8Array(await object.arrayBuffer());
  assert.equal(bytes.byteLength, file.bytes);
  assert.ok(bytes.byteLength > 10 * 1024 * 1024);
  const lines = new TextDecoder().decode(bytes).trimEnd().split('\n');
  assert.equal(lines.length, 200);
  assert.deepEqual(
    lines.map(line => JSON.parse(line).id),
    Array.from({ length: 200 }, (_, i) => i + 1)
  );
  assert.equal(await bucket.get(`${file.key}.carry`), null, 'the carry is cleaned up');
  // The alarm's reads come back with the calls that follow, once.
  billed += (await call('info')).usage.rowsRead;
  assert.ok(billed >= 200, `billed ${billed}`);
  assert.ok((await call('info')).usage.rowsRead < 50, 'billed once');
});

test('a delete preview follows the cascades in one call', async () => {
  const call = callOn('impact');
  await restaurant(call);
  await call('write', owner, {
    operations: [
      { op: 'insert', table: 'orders', values: {} },
      { op: 'insert', table: 'order_lines', values: { order: { $ref: 0 }, dish: 1, quantity: 2 } }
    ]
  });
  const order = await call('deleteImpact', owner, { table: 'orders', ids: [1] });
  assert.equal(order.ok, true, JSON.stringify(order));
  assert.deepEqual(order.value, {
    table: 'orders',
    rows: 1,
    effects: [{ table: 'order_lines', column: 'order', onDelete: 'cascade', rows: 1, depth: 0 }],
    blocked: false,
    truncated: false
  });
  const menu = await call('deleteImpact', owner, { table: 'menu' });
  assert.equal(menu.value.blocked, true);
  assert.equal((await call('deleteImpact', bot, { table: 'menu' })).error.code, 'forbidden');
});

test('a column change on a large table copies it from the alarm, refusing the writes that reach it', async () => {
  const call = callOn('large-copy');
  await call('init', { artifactId: 'large-copy', name: 'big' });
  await call('createTable', owner, {
    name: 'products',
    columns: [{ name: 'code', type: 'text' }]
  });
  await call('createTable', owner, {
    name: 'visits',
    columns: [{ name: 'note', type: 'text' }]
  });
  const rows = 100_001;
  for (let start = 0; start < rows; start += 5_000) {
    const count = Math.min(5_000, rows - start);
    const operations = [];
    for (let i = 0; i < count; i += 500) {
      operations.push({
        op: 'insert',
        table: 'products',
        rows: Array.from({ length: Math.min(500, count - i) }, (_, j) => ({ code: String(start + i + j) }))
      });
    }
    const inserted = await call('write', owner, { operations });
    assert.equal(inserted.ok, true, JSON.stringify(inserted).slice(0, 300));
  }

  // Previewing a delete of every row doesn't read them.
  const preview = await call('deleteImpact', owner, { table: 'products' });
  assert.equal(preview.value.rows, rows);
  assert.ok(preview.usage.rowsRead < 10, `${preview.usage.rowsRead} rows read`);

  const changed = await call('updateColumn', owner, 'products', 'code', { type: 'integer' });
  assert.equal(changed.ok, true, JSON.stringify(changed));
  assert.equal(changed.value.copy.status, 'running');
  assert.equal(changed.value.copy.rows, rows);
  assert.ok(changed.value.bookmark);
  assert.equal(changed.value.table.columns[0].type, 'text', 'unchanged until the swap');

  const refused = await call('write', owner, {
    operations: [{ op: 'insert', table: 'products', values: { code: 'x' } }]
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.error.code, 'conflict');
  assert.match(refused.error.message, /products is being copied to change its column code.*would change its rows/);
  const elsewhere = await call('write', owner, {
    operations: [{ op: 'insert', table: 'visits', values: { note: 'during the copy' } }]
  });
  assert.equal(elsewhere.ok, true, 'a write that can\'t reach products goes on');
  assert.equal(
    (await call('addColumn', owner, 'visits', { name: 'n', type: 'integer' })).error?.code,
    'conflict',
    'table changes wait'
  );
  assert.equal((await call('query', owner, { table: 'products', limit: 1 })).ok, true, 'reads go on');

  let info;
  for (let i = 0; i < 100; i++) {
    info = await call('info');
    if (!info.value.copy) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.equal(info.value.copy, null, JSON.stringify(info.value.copy));
  const schema = await call('schemaRead');
  assert.equal(schema.value.tables[0].columns[0].type, 'integer');
  const found = await call('query', owner, { table: 'products', where: { code: 100_000 } });
  assert.equal(found.value.rows.length, 1);
  const after = await call('write', owner, {
    operations: [{ op: 'insert', table: 'products', values: { code: 7 } }]
  });
  assert.equal(after.ok, true, JSON.stringify(after));
});

test('named queries: checked by the object\'s own SQLite, run by name, never writing', async () => {
  const call = callOn('queries');
  await restaurant(call);
  const saved = await call('saveQuery', owner, {
    name: 'priciest',
    sql: 'SELECT name, price FROM menu WHERE price >= :min ORDER BY price DESC',
    params: [{ name: 'min', type: 'integer' }],
    assistant: true
  });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.deepEqual(saved.value.tables, ['menu']);

  // exec runs every statement in a string; the second one must never get there.
  const twice = await call('saveQuery', owner, { name: 'x', sql: 'SELECT 1 AS a; DELETE FROM menu' });
  assert.match(twice.error.message, /one statement/);
  const update = await call('saveQuery', owner, { name: 'x', sql: 'UPDATE menu SET price = 0' });
  assert.match(update.error.message, /starts with SELECT/);
  const hidden = await call('saveQuery', owner, { name: 'x', sql: 'SELECT * FROM _ganju_row_log' });
  assert.match(hidden.error.message, /isn't one of/);
  // Virtual tables are told apart by the object's own SQLite: JSON passes,
  // dbstat (every table and its size) doesn't, whether workerd has it or not.
  const json = await call('saveQuery', owner, {
    name: 'tags',
    sql: "WITH t AS (SELECT value FROM json_each('[1,2]')) SELECT a.value FROM t a, t b, json_tree('{}') k"
  });
  assert.equal(json.ok, true, JSON.stringify(json));
  assert.equal((await call('dropQuery', owner, 'tags')).ok, true);
  const stat = await call('saveQuery', owner, { name: 'x', sql: 'SELECT name, pgsize FROM dbstat' });
  assert.match(stat.error.message, /other virtual tables|doesn't compile/);

  const run = await call('runQuery', bot, { name: 'priciest', params: { min: 30000 } });
  assert.deepEqual(run.value.rows, [{ name: 'Pizza Jalapeño', price: 32000 }]);
  const menu = await call('query', owner, { table: 'menu' });
  assert.equal(menu.value.total, 2, 'nothing was deleted');

  assert.deepEqual((await call('listQueries', bot)).value.map(q => q.name), ['priciest']);
  assert.equal((await call('dropQuery', owner, 'priciest')).ok, true);
  assert.equal((await call('runQuery', owner, { name: 'priciest' })).error.code, 'not_found');
});

test('a time zone set on the database applies to callers that send none', async () => {
  const call = callOn('zone');
  await call('init', { artifactId: 'zone', name: 'zone' });
  await call('createTable', owner, { name: 'events', columns: [{ name: 'at', type: 'datetime' }] });
  await call('write', owner, { operations: [{ op: 'insert', table: 'events', values: { at: '2026-10-20T20:00:00Z' } }] });
  const utc = await call('query', { actor: 'function:x' }, { table: 'events' });
  assert.equal(utc.value.rows[0].at, '2026-10-20T20:00:00Z');
  const bad = await call('setTimeZone', owner, { timeZone: 'Mars/Olympus' });
  assert.equal(bad.ok, false);
  const set = await call('setTimeZone', owner, { timeZone: 'America/Bogota' });
  assert.equal(set.value.timeZone, 'America/Bogota');
  const local = await call('query', { actor: 'function:x' }, { table: 'events' });
  assert.equal(local.value.rows[0].at, '2026-10-20T15:00:00-05:00');
  const theirs = await call('query', { actor: 'user:x', timeZone: 'Europe/Madrid' }, { table: 'events' });
  assert.equal(theirs.value.rows[0].at, '2026-10-20T22:00:00+02:00', "a caller's own zone wins");
  assert.equal((await call('schemaRead')).value.timeZone, 'America/Bogota');
  await call('setTimeZone', owner, { timeZone: null });
  assert.equal((await call('info')).value.timeZone, null);
});

test('triggers: a write\'s events reach the queue from the alarm; a rolled-back one sends none', async () => {
  const call = callOn('triggers');
  await restaurant(call);
  const saved = await call('saveTrigger', owner, {
    table: 'orders',
    on: 'insert',
    function: 'notify-kitchen'
  });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const ready = await call('saveTrigger', owner, {
    name: 'ready',
    table: 'orders',
    on: 'update',
    when: { status: { changedTo: 'ready' } },
    webhook: 'https://example.com/hook'
  });
  assert.match(ready.value.secret, /^whsec_/);

  const placed = await call('write', bot, {
    operations: [
      { op: 'insert', table: 'orders', values: {} },
      { op: 'insert', table: 'order_lines', values: { order: { $ref: 0 }, dish: 1, quantity: 2 } }
    ]
  });
  assert.equal(placed.ok, true, JSON.stringify(placed));
  const refused = await call('write', bot, {
    operations: [
      { op: 'insert', table: 'orders', values: {} },
      { op: 'insert', table: 'order_lines', values: { order: { $ref: 0 }, dish: 2, quantity: 0 } }
    ]
  });
  assert.equal(refused.ok, false);
  await call('write', owner, { operations: [{ op: 'update', table: 'orders', id: 1, set: { status: 'ready' } }] });

  let seen = [];
  for (let i = 0; i < 50 && seen.length < 2; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const sink = await mf.getWorker('sink');
    seen = (await (await sink.fetch('http://sink/')).json()).map(raw => JSON.parse(raw));
  }
  seen.sort((a, b) => a.at.localeCompare(b.at));
  assert.deepEqual(seen.map(e => [e.triggerName, e.event, e.rowId]), [
    ['orders-insert-notify-kitchen', 'insert', 1],
    ['ready', 'update', 1]
  ]);
  assert.equal(seen[0].artifactId, 'artifact-1');
  assert.equal(seen[0].row.participant_id, 'ana');
  assert.equal(seen[1].previous.status, 'pending');
  const listed = await call('listTriggers', owner);
  assert.equal(listed.value.pending, 0, 'queued events leave the outbox');
  const withSecret = await call('getTrigger', 'ready');
  assert.equal(withSecret.value.secret, ready.value.secret);
});

test('a time trigger saves with its schedule and indexes its column in the object', async () => {
  const call = callOn('time-triggers');
  await restaurant(call);
  const saved = await call('saveTrigger', owner, {
    name: 'still-pending',
    table: 'orders',
    on: 'time',
    after: { column: 'created_at', minutes: 30 },
    when: { status: { equals: 'pending' } },
    webhook: 'https://example.com/late'
  });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.deepEqual(saved.value.trigger.after, { column: 'created_at', minutes: 30 });
  const refused = await call('saveTrigger', owner, {
    table: 'orders',
    on: 'time',
    after: { column: 'created_at', minutes: 30 },
    when: { status: { changedTo: 'ready' } },
    webhook: 'https://example.com/late'
  });
  assert.equal(refused.ok, false);
  assert.match(refused.error.message, /"equals" only/);
  const listed = await call('listTriggers', owner);
  assert.equal(listed.value.triggers[0].on, 'time');
  const dropped = await call('dropTrigger', owner, 'still-pending');
  assert.equal(dropped.ok, true, JSON.stringify(dropped));
});
