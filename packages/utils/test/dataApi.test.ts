// The Data API's route list, its schemas and the OpenAPI file built from them.
// apps/api registers its data routes from the same list, so a route that is
// served is a route that is documented; the last test keeps it that way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DATA_API_BASE, DATA_API_ROUTES, dataOpenApi } from '../src/dataApi.ts';
import { Schema } from '../src/schema.ts';

test('every route becomes one OpenAPI operation with its path parameters', () => {
  const doc = dataOpenApi('https://api.example.com');
  const operations = Object.entries(doc.paths).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, op]) => ({
      path,
      method,
      op: op as Record<string, any>
    }))
  );
  assert.equal(operations.length, Object.keys(DATA_API_ROUTES).length);
  const ids = new Set(operations.map(o => o.op.operationId));
  assert.equal(ids.size, operations.length);
  for (const { path, op } of operations) {
    const inPath = [...path.matchAll(/\{([A-Za-z]+)\}/g)].map(m => m[1]);
    const declared = op.parameters
      .filter((p: any) => p.in === 'path')
      .map((p: any) => p.name);
    assert.deepEqual(declared, inPath, path);
  }
  // JSON Schema for the bodies, including the unions.
  const write = doc.paths[
    `${DATA_API_BASE.replace(/:([A-Za-z]+)/g, '{$1}')}/write`
  ].post as any;
  assert.ok(
    JSON.stringify(
      write.requestBody.content['application/json'].schema
    ).includes('"insert"')
  );
  const rows = doc.paths[
    `${DATA_API_BASE.replace(/:([A-Za-z]+)/g, '{$1}')}/table/{table}/row`
  ] as any;
  const where = rows.get.parameters.find((p: any) => p.name === 'where');
  assert.equal(where.required, false);
  assert.equal(where.schema.type, 'string');
});

test('the schemas parse what clients send', () => {
  const table = Schema.DATA_TABLE_INPUT.parse({
    name: 'menu',
    displayColumn: 'name',
    columns: [
      { name: 'name', type: 'text', required: true, searchable: true },
      { name: 'price', type: 'integer', min: 0 },
      { name: 'size', type: 'enum', values: ['30cm', '40cm'] }
    ]
  });
  assert.equal(table.columns.length, 3);
  assert.throws(() =>
    Schema.DATA_TABLE_INPUT.parse({
      name: 'menu',
      columns: [{ name: 'x', type: 'money' }]
    })
  );
  // A misspelt key is an error, not silently dropped.
  assert.throws(() =>
    Schema.DATA_TABLE_INPUT.parse({
      name: 'menu',
      columns: [],
      dispalyColumn: 'name'
    })
  );

  const query = Schema.DATA_ROW_LIST_QUERY.parse({
    where: '{"status":"open","price":{"lt":30000}}',
    sort: '-created_at, name',
    limit: '50',
    q: 'pizza'
  });
  assert.deepEqual(query.where, { status: 'open', price: { lt: 30000 } });
  assert.deepEqual(query.sort, ['-created_at', 'name']);
  assert.equal(query.limit, 50);
  assert.throws(() => Schema.DATA_ROW_LIST_QUERY.parse({ where: '{status' }));
  assert.throws(() => Schema.DATA_ROW_LIST_QUERY.parse({ limit: '501' }));

  assert.ok(
    Schema.DATA_ROW_CREATE_BODY.parse({ values: { name: 'Margherita' } })
  );
  assert.ok(
    Schema.DATA_ROW_CREATE_BODY.parse({ rows: [{ name: 'a' }, { name: 'b' }] })
  );
  assert.throws(() =>
    Schema.DATA_ROW_CREATE_BODY.parse({ values: {}, rows: [{}] })
  );

  const order = Schema.DATA_WRITE_BODY.parse({
    operations: [
      { op: 'insert', table: 'orders', values: { customer: 'Ana' } },
      {
        op: 'insert',
        table: 'order_lines',
        values: { order: { $ref: 0 }, product: 12, qty: 2 }
      },
      {
        op: 'update',
        table: 'menu',
        id: 12,
        set: { stock: { decrement: 2 } },
        where: { stock: { gte: 2 } }
      }
    ]
  });
  assert.equal(order.operations.length, 3);
  assert.throws(() =>
    Schema.DATA_WRITE_BODY.parse({ operations: [{ op: 'upsert', table: 'x' }] })
  );

  assert.ok(
    Schema.DATA_RESTORE_POINT_BODY.parse({
      timestamp: '2026-10-20T15:00:00-05:00'
    })
  );
  assert.ok(Schema.DATA_RESTORE_POINT_BODY.parse({ bookmark: '0000-abc' }));
  assert.throws(() =>
    Schema.DATA_RESTORE_POINT_BODY.parse({ timestamp: 'yesterday' })
  );

  const row = Schema.DATA_ROW_PARAMS.parse({
    organizationId: '0199f0a6-0000-7000-8000-000000000001',
    projectId: '0199f0a6-0000-7000-8000-000000000002',
    userId: '0199f0a6-0000-7000-8000-000000000003',
    table: 'menu',
    id: '7'
  });
  assert.equal(row.id, 7);
});

test('apps/api serves its data routes only from the list', () => {
  const source = readFileSync(
    new URL('../../../apps/api/src/index.ts', import.meta.url),
    'utf8'
  );
  assert.ok(source.includes('Object.entries(DATA_API_ROUTES)'));
  assert.ok(
    !/['"`]\/organization\/:organizationId\/project\/:projectId\/artifact\/data/.test(
      source
    ),
    'a data route registered by hand would be missing from the OpenAPI file'
  );
});
