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
        r2Buckets: ['STORAGE_BUCKET']
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
