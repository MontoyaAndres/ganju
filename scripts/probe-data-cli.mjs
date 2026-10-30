// Drives `ganju data` (the built CLI) against a DEPLOYED environment: the
// same scenario as probe-data.mjs, through the commands people type.
//
//   npm run build -w @ganju/cli
//   PROBE_API_URL=https://development-api.example.com node scripts/probe-data-cli.mjs
//
// Needs .env (or .env.prod with --prod) for DATABASE_URL and JWT_SECRET, like
// probe-data.mjs: it scaffolds a throwaway user and a PRO organization with a
// project and an artifact, mints a personal access token for it, and runs the
// CLI with that token as GANJU_API_TOKEN, with no terminal attached, so every
// destructive command has to be given its flags. Checks:
//   - create, info, schema push of three related tables listed out of order,
//     and a diff that is then empty;
//   - rows inserted from JSONL, paged with --all, searched, filtered;
//   - an order and its line in one write, the restrict and cascade deletes
//     with their previews, and --yes required;
//   - a stale --version refused with the current row, history naming the
//     token;
//   - a type change refused for a value that doesn't fit, one that fits, and
//     the diff that then wants it back;
//   - export, import with a relation matched by name and refused rows;
//   - drop needing --confirm, and restore.
// The database is left DELETING with its grace period over, for the next
// hourly purge, as probe-data.mjs leaves its own.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
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
const CLI = new URL('../packages/cli/dist/index.js', import.meta.url).pathname;
if (!fs.existsSync(CLI)) {
  console.error('Build the CLI first: npm run build -w @ganju/cli');
  process.exit(1);
}
const sql = postgres(read('DATABASE_URL'), { ssl: 'require', max: 1 });
const JWT_SECRET = read('JWT_SECRET');

let pass = 0;
let fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) pass++;
  else fail++;
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} ${label}${extra && !ok ? ` — ${extra}` : ''}`
  );
};
const section = title => console.log(`\n${title}\n`);

const signCookie = value =>
  encodeURIComponent(
    `${value}.${crypto.createHmac('sha256', JWT_SECRET).update(value).digest('base64')}`
  );
const sessionToken = crypto.randomBytes(32).toString('base64url');
const cookie = `better-auth.session_token=${signCookie(sessionToken)}; __Secure-better-auth.session_token=${signCookie(sessionToken)}`;

const stamp = Date.now().toString(36);
const userId = uuid();
const pro = { org: uuid(), project: uuid(), artifact: uuid() };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-data-cli-'));
let token;

// One CLI run, with no terminal: stdin closed, output captured.
const ganju = (...args) => {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: dir,
    env: { ...process.env, GANJU_API_TOKEN: token, NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 300_000
  });
  let json = null;
  try {
    json = JSON.parse(result.stdout);
  } catch {
    // Not every command answers with JSON.
  }
  return {
    code: result.status,
    out: result.stdout,
    err: result.stderr,
    json
  };
};
const brief = r => `exit ${r.code}: ${(r.err || r.out).trim().slice(0, 300)}`;
const write = (name, text) => fs.writeFileSync(path.join(dir, name), text);

console.log(`\nProbing ${API} with the CLI (probe-data-cli-${stamp})`);

try {
  await sql`insert into "user" ${sql({ id: userId, name: 'probe data cli', email: `${userId}@probe.test` })}`;
  await sql`insert into session ${sql({ id: uuid(), user_id: userId, token: sessionToken, expires_at: new Date(Date.now() + 3600_000) })}`;
  await sql`insert into organization ${sql({ id: pro.org, name: `probe-data-cli-${stamp}`, owner_id: userId })}`;
  await sql`insert into subscription ${sql({ id: uuid(), organization_id: pro.org, plan: 'PRO', status: 'active' })}`;
  await sql`insert into organization_user ${sql({ user_id: userId, organization_id: pro.org, role: 'ADMIN' })}`;
  await sql`insert into project ${sql({ id: pro.project, name: 'probe data cli', created_by_id: userId, organization_id: pro.org })}`;
  await sql`insert into project_user ${sql({ user_id: userId, project_id: pro.project, role: 'ADMIN' })}`;
  await sql`insert into artifact ${sql({ id: pro.artifact, slug: `probe-data-cli-${stamp}`, project_id: pro.project })}`;
  const minted = await fetch(
    `${API}/organization/${pro.org}/project/${pro.project}/token`,
    {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'probe data cli', expiresInDays: 1 })
    }
  ).then(r => r.json());
  token = minted.token;
  if (!token) throw new Error(`No token: ${JSON.stringify(minted)}`);
  write(
    'ganju.json',
    JSON.stringify({
      artifact: `probe-data-cli-${stamp}`,
      apiUrl: API,
      organizationId: pro.org,
      projectId: pro.project
    })
  );

  section('database and schema');
  const none = ganju('data', 'info', '--json');
  check('a project starts with no database', none.code === 0 && none.json === null, brief(none));
  const created = ganju('data', 'create', '--json');
  check('`data create` makes it', created.json?.status === 'READY', brief(created));
  const name = created.json?.name;

  write(
    'ganju.data.json',
    JSON.stringify({
      tables: [
        {
          name: 'order_lines',
          displayColumn: 'id',
          columns: [
            { name: 'order', type: 'relation', table: 'orders', onDelete: 'cascade', required: true },
            { name: 'product', type: 'relation', table: 'menu', onDelete: 'restrict', required: true },
            { name: 'qty', type: 'integer', min: 1 }
          ]
        },
        {
          name: 'orders',
          columns: [
            { name: 'customer', type: 'text', required: true },
            { name: 'status', type: 'enum', values: ['open', 'done'], default: 'open' }
          ]
        },
        {
          name: 'menu',
          displayColumn: 'name',
          columns: [
            { name: 'name', type: 'text', required: true, searchable: true },
            { name: 'price', type: 'integer', min: 0 },
            { name: 'stock', type: 'integer', min: 0, default: 0 },
            { name: 'code', type: 'text' }
          ]
        }
      ]
    })
  );
  const pushed = ganju('data', 'schema', 'push');
  check(
    'schema push creates three related tables listed out of order',
    pushed.code === 0 && /applied 3 changes/.test(pushed.err),
    brief(pushed)
  );
  const clean = ganju('data', 'schema', 'diff', '--json');
  check('  ...and the diff is then empty', clean.json?.steps?.length === 0, brief(clean));
  const pulled = ganju('data', 'schema', 'pull', '--schema', 'pulled.json');
  const again = ganju('data', 'schema', 'diff', '--schema', 'pulled.json', '--json');
  check(
    '  ...and a pulled file diffs clean too',
    pulled.code === 0 && again.json?.steps?.length === 0,
    brief(again)
  );

  section('rows');
  write(
    'menu.jsonl',
    Array.from({ length: 45 }, (_, i) =>
      JSON.stringify({
        name: i === 0 ? 'Margherita pizza' : i === 1 ? 'Hawaiian pizza' : `Item ${i}`,
        price: 10000 + i * 500,
        stock: i === 0 ? 1 : 10,
        code: String(i)
      })
    ).join('\n')
  );
  const inserted = ganju('data', 'insert', 'menu', '--input-file', 'menu.jsonl', '--json');
  check('45 rows go in from a JSONL file', inserted.json?.ids?.length === 45, brief(inserted));
  const ids = inserted.json?.ids ?? [];
  const all = ganju('data', 'rows', 'menu', '--all', '--limit', '20', '--sort', '-price', '--json');
  check(
    '--all reads every page, none twice',
    all.json?.length === 45 && new Set(all.json.map(r => r.id)).size === 45,
    brief(all)
  );
  const search = ganju('data', 'rows', 'menu', '--search', 'pizza', '--json');
  check('--search finds the two pizzas', search.json?.rows?.length === 2, brief(search));
  const where = ganju('data', 'rows', 'menu', '--where', 'price<11000', '--json');
  check('--where price<11000', where.json?.total === 2, brief(where));
  const both = ganju('data', 'rows', 'menu', '--where', 'name^=Item 4', '--where', 'stock>=10', '--json');
  check('  ...and two conditions together', both.json?.total === 6, brief(both));

  section('relations');
  const order = ganju(
    'data',
    'write',
    '--json',
    '--input',
    JSON.stringify({
      operations: [
        { op: 'insert', table: 'orders', values: { customer: 'Ana' } },
        { op: 'insert', table: 'order_lines', values: { order: { $ref: 0 }, product: ids[2], qty: 1 } }
      ]
    })
  );
  const orderId = order.json?.results?.[0]?.id;
  check('an order and its line in one write', order.json?.results?.length === 2, brief(order));
  const restricted = ganju('data', 'delete', 'menu', String(ids[2]), '--yes');
  check(
    'deleting a product a line points at is refused up front (restrict)',
    restricted.code === 1 && /restrict\): 1 row point here/.test(restricted.err),
    brief(restricted)
  );
  const unconfirmed = ganju('data', 'delete', 'orders', String(orderId));
  check(
    'a cascade delete without --yes is refused',
    unconfirmed.code === 1 && /cascade\): deletes 1 row/.test(unconfirmed.err) && /without --yes/.test(unconfirmed.err),
    brief(unconfirmed)
  );
  const cascaded = ganju('data', 'delete', 'orders', String(orderId), '--yes');
  const lines = ganju('data', 'rows', 'order_lines', '--json');
  check(
    'with --yes the order goes, and its lines with it (cascade)',
    cascaded.code === 0 && lines.json?.total === 0,
    brief(cascaded)
  );

  section('edits and history');
  const first = ganju('data', 'update', 'menu', String(ids[0]), '--input', '{"price":29000}', '--version', '1', '--json');
  check('an update with the version read', first.json?.version === 2, brief(first));
  const stale = ganju('data', 'update', 'menu', String(ids[0]), '--input', '{"price":1}', '--version', '1');
  check(
    'a stale --version is refused, with the row as it is now',
    stale.code === 1 && /now version 2/.test(stale.err) && /29000/.test(stale.out),
    brief(stale)
  );
  const guard = ganju('data', 'update', 'menu', String(ids[0]), '--input', '{"stock":{"decrement":2}}');
  check('a decrement below the minimum is refused', guard.code === 1 && /below 0/.test(guard.err), brief(guard));
  const history = ganju('data', 'history', 'menu', String(ids[0]), '--json');
  check(
    'history names the token',
    history.json?.entries?.[0]?.actor === `cli:${minted.id}`,
    JSON.stringify(history.json?.entries?.map(e => e.actor))
  );

  section('type changes');
  ganju('data', 'insert', 'menu', '--input', '{"name":"Odd code","price":1,"code":"abc"}');
  const noYes = ganju('data', 'column', 'change', 'menu', 'code', '--input', '{"type":"integer"}');
  check('a type change without --yes is refused', noYes.code === 1 && /without --yes/.test(noYes.err), brief(noYes));
  const misfit = ganju('data', 'column', 'change', 'menu', 'code', '--input', '{"type":"integer"}', '--yes');
  check(
    "a type change some values don't fit is refused, naming them",
    misfit.code === 1 && /"abc"/.test(misfit.err),
    brief(misfit)
  );
  const fits = ganju('data', 'column', 'change', 'menu', 'price', '--input', '{"type":"decimal"}', '--yes');
  check(
    'a type change that fits, with the bookmark that undoes it',
    fits.code === 0 && /--bookmark \S+ --yes/.test(fits.err),
    brief(fits)
  );
  const back = ganju('data', 'schema', 'diff', '--json');
  check(
    '  ...after which the file wants it back, as a destructive step',
    back.json?.destructive?.length === 1 && back.json.destructive[0].patch?.type === 'integer',
    brief(back)
  );
  const refusedPush = ganju('data', 'schema', 'push');
  check('  ...that push refuses without --yes', refusedPush.code === 1, brief(refusedPush));

  section('export and import');
  const exported = ganju('data', 'export', '--out', 'export');
  check(
    'export downloads schema.json and a file per table',
    exported.code === 0 &&
      ['schema.json', 'menu.jsonl', 'orders.jsonl', 'order_lines.jsonl'].every(f =>
        fs.existsSync(path.join(dir, 'export', f))
      ),
    brief(exported)
  );
  ganju('data', 'insert', 'orders', '--input', '{"customer":"Bea"}');
  write(
    'lines.csv',
    'order,product,qty\nBea,Margherita pizza,2\nBea,hawaiian pizza,1\nBea,Nope pizza,1\nBea,Item 5,0\n'
  );
  const imported = ganju('data', 'import', 'order_lines', 'lines.csv', '--json');
  check(
    'import matches relations by name and refuses the rows that do not fit',
    imported.json?.inserted === 2 && imported.json?.refused?.length === 2,
    brief(imported)
  );
  check(
    '  ...writing them to a CSV to fix',
    fs.existsSync(path.join(dir, 'lines.refused.csv'))
  );

  section('delete and restore');
  const noConfirm = ganju('data', 'drop', '--yes');
  check('drop without --confirm is refused', noConfirm.code === 1 && /--confirm/.test(noConfirm.err), brief(noConfirm));
  const wrong = ganju('data', 'drop', '--yes', '--confirm', 'nope');
  check('  ...and with the wrong name', wrong.code === 1, brief(wrong));
  const dropped = ganju('data', 'drop', '--yes', '--confirm', name, '--json');
  check('drop with the typed name', dropped.json?.status === 'DELETING', brief(dropped));
  const gone = ganju('data', 'rows', 'menu');
  check('  ...after which rows are refused', gone.code === 1, brief(gone));
  const restored = ganju('data', 'restore', '--json');
  const count = ganju('data', 'rows', 'menu', '--limit', '1', '--json');
  check(
    'restore brings it back with its rows',
    restored.json?.status === 'READY' && count.json?.total === 46,
    `${brief(restored)} / total ${count.json?.total}`
  );
} finally {
  section('cleanup');
  await sql`delete from access_token where project_id = ${pro.project}`;
  // Handed to the purge rather than left as an object nobody lists.
  const [left] = await sql`
    update artifact_database
       set status = 'DELETING', deleted_at = now(), deleted_by = 'system:probe',
           delete_after = now() - interval '1 minute'
     where artifact_id = ${pro.artifact} and status <> 'DELETED'
     returning id`;
  await sql`delete from artifact where id = ${pro.artifact}`;
  await sql`delete from project_user where project_id = ${pro.project}`;
  await sql`delete from project where id = ${pro.project}`;
  await sql`delete from organization_user where organization_id = ${pro.org}`;
  await sql`delete from subscription where organization_id = ${pro.org}`;
  await sql`delete from organization where id = ${pro.org}`;
  await sql`delete from session where user_id = ${userId}`;
  await sql`delete from "user" where id = ${userId}`;
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('  removed the throwaway user, organization, project and files');
  if (left) {
    console.log(
      `  left database ${left.id} DELETING with its grace period over; after the next hourly cron run:\n    node scripts/probe-data.mjs --purge-check ${left.id}${isProd ? ' --prod' : ''}`
    );
  }
  await sql.end();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
