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
// project and an artifact, and checks the database lifecycle:
//   - Free can't create one; Pro creates it once, however many times it asks;
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
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ` — ${extra}` : ''}`);
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
  check('a project starts with no database', none.status === 200 && none.body?.database === null, JSON.stringify(none.body));
  if (none.status === 401) {
    throw new Error('The session cookie was rejected: check JWT_SECRET and DATABASE_URL match the deployed API.');
  }
  const refused = await call(`${base(free)}/artifact/data`, { method: 'POST', body: '{}' });
  check('Free gets the upgrade prompt', refused.status === 402 && refused.body?.feature === 'data', `${refused.status} ${refused.body?.error}`);
  const created = await call(`${base(pro)}/artifact/data`, { method: 'POST', body: '{}' });
  check('Pro creates it', created.status === 201 && created.body?.database?.status === 'READY', `${created.status} ${JSON.stringify(created.body)}`);
  const database = created.body?.database;
  check('  ...named after the project slug by default', database?.name === `probe-data-pro-${stamp}`);
  const [row] = await sql`select * from artifact_database where artifact_id = ${pro.artifact}`;
  check('  ...the object is addressed by the artifact id', row?.object_name === pro.artifact);
  const [change] = await sql`select * from artifact_database_change where database_id = ${row?.id} and kind = 'create'`;
  check('  ...and the change log has it', change?.actor === `user:${userId}`);
  const again = await call(`${base(pro)}/artifact/data`, { method: 'POST', body: '{}' });
  check('a second create returns the same database', again.body?.database?.id === database?.id);
  const got = await call(`${base(pro)}/artifact/data`);
  check(
    'GET reads its size and tables from the object',
    got.body?.database?.status === 'READY' && got.body.database.sizeBytes > 0 && Array.isArray(got.body.database.tables),
    `${got.body?.database?.sizeBytes} bytes`
  );

  section('deleting and restoring');
  const wrongName = await call(`${base(pro)}/artifact/data`, { method: 'DELETE', body: JSON.stringify({ confirmName: 'nope' }) });
  check('delete needs the typed name', wrongName.status === 400, wrongName.body?.error);
  const deleted = await call(`${base(pro)}/artifact/data`, { method: 'DELETE', body: JSON.stringify({ confirmName: database?.name }) });
  check('delete with the name marks it DELETING', deleted.body?.database?.status === 'DELETING', `${deleted.status} ${deleted.body?.error ?? ''}`);
  // Measured in SQL: the columns are timestamps without a zone, which the
  // driver would read as local time.
  const [marked] = await sql`
    select *, extract(epoch from delete_after - deleted_at) as grace_seconds
      from artifact_database where id = ${row?.id}`;
  check('  ...seven days of grace', Math.abs(Number(marked?.grace_seconds) - 7 * 86400) < 60, `${marked?.grace_seconds} s`);
  check('  ...with the object\'s bookmark kept', !!marked?.delete_bookmark);
  const recreate = await call(`${base(pro)}/artifact/data`, { method: 'POST', body: '{}' });
  check('creating over a deleted one is refused', recreate.status === 409, recreate.body?.error);
  const restored = await call(`${base(pro)}/artifact/data/restore`, { method: 'POST' });
  check('restore brings it back', restored.body?.database?.status === 'READY', `${restored.status} ${restored.body?.error ?? ''}`);
  const live = await call(`${base(pro)}/artifact/data`);
  check('  ...and the object answers again', Array.isArray(live.body?.database?.tables), live.body?.error);

  section('deleting the project');
  const removed = await call(base(pro), { method: 'DELETE' });
  check('the project is deleted', removed.status === 200, removed.body?.error);
  const [orphan] = await sql`select * from artifact_database where id = ${row?.id}`;
  check('its database row survives, DELETING', orphan?.status === 'DELETING');
  check('  ...without the artifact, but with the object name', orphan?.artifact_id === null && orphan?.object_name === pro.artifact);
  let bookmark = orphan?.delete_bookmark;
  for (let i = 0; i < 10 && !bookmark; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    [{ delete_bookmark: bookmark }] = await sql`select delete_bookmark from artifact_database where id = ${row?.id}`;
  }
  check('  ...and the object was told (its bookmark arrived)', !!bookmark);
  await sql`update artifact_database set delete_after = now() - interval '1 minute' where id = ${row?.id}`;
  leftForPurge = row?.id;
} finally {
  section('cleanup');
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
