// Drives project databases against a DEPLOYED environment, over real HTTP.
//
//   PROBE_API_URL=https://development-api.example.com node scripts/probe-data.mjs
//   node scripts/probe-data.mjs --purge-check <artifact_database id>
//
// Defaults to http://localhost:8080. Needs .env (or .env.prod with --prod) for
// DATABASE_URL and JWT_SECRET, like probe-access-tokens.mjs: the person is a
// session cookie this script signs.
//
// Scaffolds a throwaway user, a PRO and a FREE organization, each with a
// project and an artifact, and checks the database lifecycle and the Data API:
//   - Free can't create one; Pro creates it once, however many times it asks;
//   - two related tables, rows, foreign-key restrict and cascade, search, and
//     paging past two pages;
//   - a type change that some values don't fit;
//   - two orders at once for the last item (exactly one wins), a multi-table
//     write whose third step fails (nothing is written), a stale-version
//     PATCH (409 with the current row);
//   - a change below a column's minimum is a 409, and a later step can
//     update the row an earlier one inserted;
//   - row history naming the person and the personal access token;
//   - an export during the grace period, and no restore to a delete's
//     bookmark;
//   - the OpenAPI file lists every route;
//   - deleting needs the typed name, and is undone by restore;
//   - deleting the project marks its database DELETING and tells the object,
//     which then refuses calls.
// It leaves that last database DELETING with its grace period back-dated, so
// the next hourly run of the API's cron empties the object. `--purge-check`
// then confirms the row went DELETED and removes it.
import fs from 'node:fs';
import crypto from 'node:crypto';
import postgres from 'postgres';
import { v7 as uuid } from 'uuid';

const isProd = process.argv.includes('--prod');
const env = fs.readFileSync(
  new URL(isProd ? '../.env.prod' : '../.env', import.meta.url),
  'utf8'
);
const read = key =>
  env
    .match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]
    ?.replace(/\s+#.*$/, '')
    .trim();

const API = (process.env.PROBE_API_URL ?? 'http://localhost:8080').replace(
  /\/+$/,
  ''
);
const sql = postgres(read('DATABASE_URL'), { ssl: 'require', max: 1 });
const JWT_SECRET = read('JWT_SECRET');

let pass = 0;
let fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) pass++;
  else fail++;
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ` — ${extra}` : ''}`
  );
};
const section = title => console.log(`\n${title}\n`);

const purgeCheck = process.argv.indexOf('--purge-check');
if (purgeCheck !== -1) {
  const id = process.argv[purgeCheck + 1];
  const [row] = await sql`select * from artifact_database where id = ${id}`;
  console.log(row);
  check('the purge emptied the database', row?.status === 'DELETED');
  check('  ...and kept the bookmark from just before', !!row?.delete_bookmark);
  if (row?.status === 'DELETED') {
    await sql`delete from artifact_database where id = ${id}`;
    console.log('  removed the probe row');
  }
  await sql.end();
  process.exit(fail ? 1 : 0);
}

const signCookie = value =>
  encodeURIComponent(
    `${value}.${crypto.createHmac('sha256', JWT_SECRET).update(value).digest('base64')}`
  );
const sessionToken = crypto.randomBytes(32).toString('base64url');
const cookie = `better-auth.session_token=${signCookie(sessionToken)}; __Secure-better-auth.session_token=${signCookie(sessionToken)}`;
const call = async (path, init = {}) => {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { cookie, 'content-type': 'application/json', ...init.headers }
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
};
const json = (method, body) => ({ method, body: JSON.stringify(body) });
// The same call with a personal access token instead of the session.
const callAsToken = (token, path, init = {}) =>
  call(path, {
    ...init,
    headers: { cookie: '', authorization: `Bearer ${token}`, ...init.headers }
  });

const stamp = Date.now().toString(36);
const userId = uuid();
const pro = { org: uuid(), project: uuid(), artifact: uuid() };
const free = { org: uuid(), project: uuid(), artifact: uuid() };
const base = s => `/organization/${s.org}/project/${s.project}`;

console.log(`\nProbing ${API} (probe-data-${stamp})`);

let leftForPurge = null;
try {
  await sql`insert into "user" ${sql({ id: userId, name: 'probe data', email: `${userId}@probe.test` })}`;
  await sql`insert into session ${sql({ id: uuid(), user_id: userId, token: sessionToken, expires_at: new Date(Date.now() + 3600_000) })}`;
  for (const [scope, plan] of [
    [pro, 'PRO'],
    [free, 'FREE']
  ]) {
    await sql`insert into organization ${sql({ id: scope.org, name: `probe-data-${plan}-${stamp}`, owner_id: userId })}`;
    await sql`insert into subscription ${sql({ id: uuid(), organization_id: scope.org, plan, status: 'active' })}`;
    await sql`insert into organization_user ${sql({ user_id: userId, organization_id: scope.org, role: 'ADMIN' })}`;
    await sql`insert into project ${sql({ id: scope.project, name: 'probe data', created_by_id: userId, organization_id: scope.org })}`;
    await sql`insert into project_user ${sql({ user_id: userId, project_id: scope.project, role: 'ADMIN' })}`;
    await sql`insert into artifact ${sql({ id: scope.artifact, slug: `probe-data-${plan.toLowerCase()}-${stamp}`, project_id: scope.project })}`;
  }

  section('creating');
  const none = await call(`${base(pro)}/artifact/data`);
  check(
    'a project starts with no database',
    none.status === 200 && none.body?.database === null,
    JSON.stringify(none.body)
  );
  if (none.status === 401) {
    throw new Error(
      'The session cookie was rejected: check JWT_SECRET and DATABASE_URL match the deployed API.'
    );
  }
  const refused = await call(`${base(free)}/artifact/data`, {
    method: 'POST',
    body: '{}'
  });
  check(
    'Free gets the upgrade prompt',
    refused.status === 402 && refused.body?.feature === 'data',
    `${refused.status} ${refused.body?.error}`
  );
  const created = await call(`${base(pro)}/artifact/data`, {
    method: 'POST',
    body: '{}'
  });
  check(
    'Pro creates it',
    created.status === 201 && created.body?.database?.status === 'READY',
    `${created.status} ${JSON.stringify(created.body)}`
  );
  const database = created.body?.database;
  check(
    '  ...named after the project slug by default',
    database?.name === `probe-data-pro-${stamp}`
  );
  const [row] =
    await sql`select * from artifact_database where artifact_id = ${pro.artifact}`;
  check(
    '  ...the object is addressed by the artifact id',
    row?.object_name === pro.artifact
  );
  const [change] =
    await sql`select * from artifact_database_change where database_id = ${row?.id} and kind = 'create'`;
  check('  ...and the change log has it', change?.actor === `user:${userId}`);
  const again = await call(`${base(pro)}/artifact/data`, {
    method: 'POST',
    body: '{}'
  });
  check(
    'a second create returns the same database',
    again.body?.database?.id === database?.id
  );
  const got = await call(`${base(pro)}/artifact/data`);
  check(
    'GET reads its size and tables from the object',
    got.body?.database?.status === 'READY' &&
      got.body.database.sizeBytes > 0 &&
      Array.isArray(got.body.database.tables),
    `${got.body?.database?.sizeBytes} bytes`
  );

  section('the Data API: tables');
  const data = `${base(pro)}/artifact/data`;
  const openapi = await fetch(`${API}/openapi/data.json`)
    .then(r => r.json())
    .catch(() => null);
  check(
    'the OpenAPI file is served without signing in, with every route',
    Object.values(openapi?.paths ?? {}).reduce(
      (n, methods) => n + Object.keys(methods).length,
      0
    ) === 23,
    `${Object.keys(openapi?.paths ?? {}).length} paths`
  );
  const menu = await call(
    `${data}/table`,
    json('POST', {
      name: 'menu',
      displayColumn: 'name',
      columns: [
        { name: 'name', type: 'text', required: true, searchable: true },
        { name: 'price', type: 'integer', min: 0 },
        { name: 'stock', type: 'integer', min: 0, default: 0 },
        { name: 'code', type: 'text' }
      ]
    })
  );
  check(
    'a "menu" table is created',
    menu.status === 201 && menu.body?.table?.name === 'menu',
    `${menu.status} ${menu.body?.error ?? ''}`
  );
  const orders = await call(
    `${data}/table`,
    json('POST', {
      name: 'orders',
      columns: [
        { name: 'customer', type: 'text', required: true },
        {
          name: 'status',
          type: 'enum',
          values: ['open', 'done'],
          default: 'open'
        }
      ]
    })
  );
  check(
    'an "orders" table is created',
    orders.status === 201,
    orders.body?.error
  );
  const lines = await call(
    `${data}/table`,
    json('POST', {
      name: 'order_lines',
      columns: [
        {
          name: 'order',
          type: 'relation',
          table: 'orders',
          onDelete: 'cascade',
          required: true
        },
        {
          name: 'product',
          type: 'relation',
          table: 'menu',
          onDelete: 'restrict',
          required: true
        },
        { name: 'qty', type: 'integer', min: 1 }
      ]
    })
  );
  check(
    '"order_lines" points at both',
    lines.status === 201,
    lines.body?.error
  );
  const typo = await call(
    `${data}/table`,
    json('POST', { name: 'x', columns: [], dispalyColumn: 'y' })
  );
  check(
    'a misspelt key is a 400 naming it',
    typo.status === 400 && JSON.stringify(typo.body).includes('dispalyColumn'),
    JSON.stringify(typo.body)
  );
  const tables = await call(`${data}/table`);
  check(
    'GET /table lists the three with their columns',
    tables.body?.tables?.length === 3 &&
      tables.body.tables[0].columns?.length > 0
  );

  section('the Data API: rows');
  const many = Array.from({ length: 45 }, (_, i) => ({
    name:
      i === 0 ? 'Margherita pizza' : i === 1 ? 'Hawaiian pizza' : `Item ${i}`,
    price: 10000 + i * 500,
    stock: i === 0 ? 1 : 10,
    code: String(i)
  }));
  const inserted = await call(
    `${data}/table/menu/row`,
    json('POST', { rows: many })
  );
  check(
    '45 rows go in in one request',
    inserted.status === 201 && inserted.body?.ids?.length === 45,
    `${inserted.status} ${inserted.body?.error ?? ''}`
  );
  const margherita = inserted.body?.ids?.[0];
  const seen = new Set();
  let cursor;
  let pages = 0;
  do {
    const page = await call(
      `${data}/table/menu/row?limit=20&sort=-price${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    );
    for (const r of page.body?.rows ?? []) seen.add(r.id);
    cursor = page.body?.nextCursor;
    pages++;
  } while (cursor && pages < 5);
  check(
    'paging by price reads all 45 over 3 pages, none twice',
    seen.size === 45 && pages === 3,
    `${seen.size} rows, ${pages} pages`
  );
  const search = await call(`${data}/table/menu/row?q=pizza`);
  check(
    'search finds the two pizzas',
    search.body?.rows?.length === 2,
    JSON.stringify(search.body?.rows?.map(r => r.name))
  );
  const filtered = await call(
    `${data}/table/menu/row?where=${encodeURIComponent(JSON.stringify({ price: { lt: 11000 } }))}`
  );
  check(
    'a "where" filter in the query string',
    filtered.body?.total === 2,
    `${filtered.body?.total} ${filtered.body?.error ?? ''}`
  );
  const one = await call(`${data}/table/menu/row/${margherita}`);
  check(
    'GET a row by id, with its version',
    one.body?.row?.name === 'Margherita pizza' && one.body.row.version === 1
  );
  const missing = await call(`${data}/table/menu/row/999999`);
  check(
    "a row that isn't there is a 404",
    missing.status === 404,
    missing.body?.error
  );

  section('the Data API: relations');
  const order = await call(
    `${data}/write`,
    json('POST', {
      operations: [
        { op: 'insert', table: 'orders', values: { customer: 'Ana' } },
        {
          op: 'insert',
          table: 'order_lines',
          values: {
            order: { $ref: 0 },
            product: inserted.body?.ids?.[2],
            qty: 1
          }
        }
      ]
    })
  );
  check(
    'an order and its line go in together',
    order.status === 200 && order.body?.results?.length === 2,
    order.body?.error
  );
  const orderId = order.body?.results?.[0]?.id;
  const restricted = await call(
    `${data}/table/menu/row/${inserted.body?.ids?.[2]}`,
    json('DELETE', {})
  );
  check(
    'deleting a product a line points at is refused (restrict)',
    restricted.status === 409 &&
      /still point/.test(restricted.body?.error ?? ''),
    restricted.body?.error
  );
  const cascaded = await call(
    `${data}/table/orders/row/${orderId}`,
    json('DELETE', {})
  );
  check(
    'deleting the order removes its lines (cascade)',
    cascaded.status === 200,
    cascaded.body?.error
  );
  const orphanLines = await call(`${data}/table/order_lines/row`);
  check(
    '  ...no lines are left',
    orphanLines.body?.total === 0,
    `${orphanLines.body?.total}`
  );

  section('the Data API: safe writes');
  const lastPizza = () => ({
    operations: [
      { op: 'insert', table: 'orders', values: { customer: 'race' } },
      {
        op: 'insert',
        table: 'order_lines',
        values: { order: { $ref: 0 }, product: margherita, qty: 1 }
      },
      {
        op: 'update',
        table: 'menu',
        id: margherita,
        set: { stock: { decrement: 1 } },
        where: { stock: { gte: 1 } }
      }
    ]
  });
  const race = await Promise.all([
    call(`${data}/write`, json('POST', lastPizza())),
    call(`${data}/write`, json('POST', lastPizza()))
  ]);
  check(
    'two orders for the last pizza at once: exactly one wins',
    race.filter(r => r.status === 200).length === 1 &&
      race.filter(r => r.status === 409).length === 1,
    race.map(r => `${r.status} ${r.body?.error ?? ''}`).join(' | ')
  );
  const raceOrders = await call(
    `${data}/table/orders/row?where=${encodeURIComponent(JSON.stringify({ customer: 'race' }))}`
  );
  check(
    '  ...and the loser left no order behind',
    raceOrders.body?.total === 1,
    `${raceOrders.body?.total}`
  );
  const failing = await call(
    `${data}/write`,
    json('POST', {
      operations: [
        { op: 'insert', table: 'orders', values: { customer: 'rollback' } },
        {
          op: 'insert',
          table: 'order_lines',
          values: { order: { $ref: 0 }, product: margherita, qty: 1 }
        },
        {
          op: 'update',
          table: 'menu',
          id: margherita,
          set: { stock: { decrement: 5 } },
          where: { stock: { gte: 5 } }
        }
      ]
    })
  );
  check(
    'a write whose third step fails is refused',
    failing.status === 409,
    failing.body?.error
  );
  const rolledBack = await call(
    `${data}/table/orders/row?where=${encodeURIComponent(JSON.stringify({ customer: 'rollback' }))}`
  );
  check(
    '  ...and nothing of it was written',
    rolledBack.body?.total === 0,
    `${rolledBack.body?.total}`
  );

  const item = inserted.body?.ids?.[3];
  const first = await call(
    `${data}/table/menu/row/${item}`,
    json('PATCH', { set: { price: 1 }, version: 1 })
  );
  check(
    'PATCH with the version read',
    first.status === 200 && first.body?.row?.version === 2,
    first.body?.error
  );
  const stale = await call(
    `${data}/table/menu/row/${item}`,
    json('PATCH', { set: { price: 2 }, version: 1 })
  );
  check(
    'PATCH with a stale version is a 409 with the current row and who changed it',
    stale.status === 409 &&
      stale.body?.details?.current?.price === 1 &&
      stale.body.details.updatedBy === `user:${userId}`,
    JSON.stringify(stale.body)
  );

  const belowMin = await call(
    `${data}/table/menu/row/${margherita}`,
    json('PATCH', { set: { stock: { decrement: 5 } } })
  );
  check(
    'lowering stock below its minimum is a 409 naming it, not a 404',
    belowMin.status === 409 &&
      /can't go below 0/.test(belowMin.body?.error ?? ''),
    `${belowMin.status} ${belowMin.body?.error ?? ''}`
  );
  const byRef = await call(
    `${data}/write`,
    json('POST', {
      operations: [
        { op: 'insert', table: 'orders', values: { customer: 'ref' } },
        {
          op: 'update',
          table: 'orders',
          id: { $ref: 0 },
          set: { status: 'done' }
        }
      ]
    })
  );
  check(
    'a later step updates the row an earlier one inserted, by { $ref }',
    byRef.status === 200 && byRef.body?.results?.[1]?.changed === 1,
    byRef.body?.error
  );

  section('the Data API: schema changes');
  const badType = await call(
    `${data}/table/menu/column/code`,
    json('PATCH', { type: 'integer' })
  );
  check(
    'changing "code" to integer works while every value fits',
    badType.status === 200 && !!badType.body?.bookmark,
    badType.body?.error
  );
  await call(
    `${data}/table/menu/row`,
    json('POST', { values: { name: 'Odd one', code: 7 } })
  );
  const toBool = await call(
    `${data}/table/menu/column/price`,
    json('PATCH', { type: 'boolean' })
  );
  check(
    "a type change that values don't fit is refused, naming them",
    toBool.status >= 400 && toBool.status < 500,
    toBool.body?.error
  );
  const dropNoName = await call(
    `${data}/table/order_lines`,
    json('DELETE', { confirmName: 'nope' })
  );
  check(
    'dropping a table needs its typed name',
    dropNoName.status === 400,
    dropNoName.body?.error
  );
  const changes = await call(`${data}/change`);
  check(
    'the change log lists the table and column changes',
    changes.body?.changes?.some(
      ch => ch.kind === 'column.update' && ch.target === 'menu.code'
    ),
    JSON.stringify(changes.body?.changes?.map(ch => ch.kind))
  );

  section('the Data API: actors and tokens');
  const minted = await call(
    `${base(pro)}/token`,
    json('POST', { name: 'probe data', expiresInDays: 1 })
  );
  const token = minted.body?.token;
  check(
    'a personal access token for the project',
    typeof token === 'string',
    minted.body?.error
  );
  const byToken = await callAsToken(
    token,
    `${data}/table/menu/row/${item}`,
    json('PATCH', { set: { price: 3 } })
  );
  check('the token edits a row', byToken.status === 200, byToken.body?.error);
  const history = await call(`${data}/table/menu/row/${item}/history`);
  const actors = history.body?.entries?.map(e => e.actor) ?? [];
  check(
    'history names the token, then the person, then the insert',
    actors[0] === `cli:${minted.body?.id}` &&
      actors.includes(`user:${userId}`) &&
      history.body.entries.at(-1).op === 'insert',
    JSON.stringify(actors)
  );
  const elsewhere = await callAsToken(
    token,
    `${base(free)}/artifact/data/table`
  );
  check(
    "the token can't reach another project",
    elsewhere.status === 403,
    `${elsewhere.status}`
  );

  section('deleting and restoring');
  const wrongName = await call(`${base(pro)}/artifact/data`, {
    method: 'DELETE',
    body: JSON.stringify({ confirmName: 'nope' })
  });
  check(
    'delete needs the typed name',
    wrongName.status === 400,
    wrongName.body?.error
  );
  const deleted = await call(`${base(pro)}/artifact/data`, {
    method: 'DELETE',
    body: JSON.stringify({ confirmName: database?.name })
  });
  check(
    'delete with the name marks it DELETING',
    deleted.body?.database?.status === 'DELETING',
    `${deleted.status} ${deleted.body?.error ?? ''}`
  );
  // Measured in SQL: the columns are timestamps without a zone, which the
  // driver would read as local time.
  const [marked] = await sql`
    select *, extract(epoch from delete_after - deleted_at) as grace_seconds
      from artifact_database where id = ${row?.id}`;
  check(
    '  ...seven days of grace',
    Math.abs(Number(marked?.grace_seconds) - 7 * 86400) < 60,
    `${marked?.grace_seconds} s`
  );
  check("  ...with the object's bookmark kept", !!marked?.delete_bookmark);
  const graceExport = await call(`${data}/export`, json('POST', {}));
  check(
    'a copy can be exported during the grace period',
    graceExport.status === 201,
    `${graceExport.status} ${graceExport.body?.error ?? ''}`
  );
  let exportState;
  for (let i = 0; i < 15; i++) {
    exportState = (
      await call(`${data}/export?exportId=${graceExport.body?.exportId}`)
    ).body?.export;
    if (exportState?.status !== 'running') break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  check(
    '  ...and it finishes',
    exportState?.status === 'done',
    exportState?.status ?? exportState?.error
  );
  const schemaFile = await fetch(
    `${API}${data}/export/file?exportId=${graceExport.body?.exportId}`,
    {
      headers: { cookie }
    }
  );
  const exportedSchema = await schemaFile.json().catch(() => null);
  check(
    '  ...and its schema.json downloads, with the three tables',
    schemaFile.ok && exportedSchema?.tables?.length === 3,
    `${schemaFile.status}`
  );
  const recreate = await call(`${base(pro)}/artifact/data`, {
    method: 'POST',
    body: '{}'
  });
  check(
    'creating over a deleted one is refused',
    recreate.status === 409,
    recreate.body?.error
  );
  const restored = await call(`${base(pro)}/artifact/data/restore`, {
    method: 'POST'
  });
  check(
    'restore brings it back',
    restored.body?.database?.status === 'READY',
    `${restored.status} ${restored.body?.error ?? ''}`
  );
  const live = await call(`${base(pro)}/artifact/data`);
  check(
    '  ...and the object answers again',
    Array.isArray(live.body?.database?.tables),
    live.body?.error
  );
  const [deleteChange] = await sql`
    select bookmark from artifact_database_change
     where database_id = ${row?.id} and kind = 'delete' and bookmark is not null
     limit 1`;
  const toDeleteBookmark = await call(
    `${data}/restore-point`,
    json('POST', { bookmark: deleteChange?.bookmark })
  );
  check(
    "restoring to the delete's bookmark is refused (it would come back deleted)",
    !!deleteChange && toDeleteBookmark.status === 400,
    `${toDeleteBookmark.status} ${toDeleteBookmark.body?.error ?? ''}`
  );

  section('deleting the project');
  const removed = await call(base(pro), { method: 'DELETE' });
  check('the project is deleted', removed.status === 200, removed.body?.error);
  const [orphan] =
    await sql`select * from artifact_database where id = ${row?.id}`;
  check('its database row survives, DELETING', orphan?.status === 'DELETING');
  check(
    '  ...without the artifact, but with the object name',
    orphan?.artifact_id === null && orphan?.object_name === pro.artifact
  );
  let bookmark = orphan?.delete_bookmark;
  for (let i = 0; i < 10 && !bookmark; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    [{ delete_bookmark: bookmark }] =
      await sql`select delete_bookmark from artifact_database where id = ${row?.id}`;
  }
  check('  ...and the object was told (its bookmark arrived)', !!bookmark);
  await sql`update artifact_database set delete_after = now() - interval '1 minute' where id = ${row?.id}`;
  leftForPurge = row?.id;
} finally {
  section('cleanup');
  await sql`delete from access_token where project_id in ${sql([pro.project, free.project])}`;
  await sql`delete from artifact_database where artifact_id = ${free.artifact}`;
  // Stopped before the project delete: hand the database to the purge rather
  // than leave an object nobody lists.
  const [stranded] = await sql`
    update artifact_database
       set status = 'DELETING', deleted_at = now(), deleted_by = 'system:probe',
           delete_after = now() - interval '1 minute'
     where artifact_id = ${pro.artifact} and status <> 'DELETING'
     returning id`;
  if (stranded) leftForPurge = stranded.id;
  for (const scope of [pro, free]) {
    await sql`delete from artifact where id = ${scope.artifact}`;
    await sql`delete from project_user where project_id = ${scope.project}`;
    await sql`delete from project where id = ${scope.project}`;
    await sql`delete from organization_user where organization_id = ${scope.org}`;
    await sql`delete from subscription where organization_id = ${scope.org}`;
    await sql`delete from organization where id = ${scope.org}`;
  }
  await sql`delete from session where user_id = ${userId}`;
  await sql`delete from "user" where id = ${userId}`;
  console.log('  removed the throwaway user, organizations and projects');
  if (leftForPurge) {
    console.log(
      `  left database ${leftForPurge} DELETING with its grace period over; after the next hourly cron run:\n    node scripts/probe-data.mjs --purge-check ${leftForPurge}${isProd ? ' --prod' : ''}`
    );
  }
  await sql.end();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
