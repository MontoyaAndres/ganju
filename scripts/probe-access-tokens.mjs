// Drives personal access tokens against a DEPLOYED environment, over real HTTP.
//
//   PROBE_API_URL=https://development-api.example.com \
//     node scripts/probe-access-tokens.mjs
//
// Defaults to http://localhost:8080, so it also works against `npm run dev -w api`.
//
// The companion verify script drives the middleware and the controller as
// functions, with a Hono-shaped context carrying only what they read. That
// proves the rules and nothing about the deployment: not the routes, not the
// worker's own environment, not that the migration ran. This runs everything
// through the network, against whatever is actually serving.
//
// It needs .env (or .env.prod with --prod) for DATABASE_URL and JWT_SECRET —
// the same database the deployed API is pointed at, and the secret that signs
// its session cookies. The one thing no script can do is click a browser, so the
// person half is a session cookie this script signs; the machine half is the
// real thing end to end, which is the half that matters here.
//
// The logged-in CLI path — `ganju token create|list|revoke` after a real OAuth
// login — is covered by probe-cli.mjs, which does that dance. Here the CLI is
// exercised the way CI runs it: with GANJU_API_TOKEN and no stored login.
//
// Scaffolds a throwaway user, a PRO organization, two projects and an artifact,
// and removes all of it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import postgres from 'postgres';
import { v7 as uuid } from 'uuid';

const isProd = process.argv.includes('--prod');
const envFile = isProd ? '../.env.prod' : '../.env';
const env = fs.readFileSync(new URL(envFile, import.meta.url), 'utf8');
// Trailing ` # …` comments are how this .env carries a variable's alternative
// value, so they have to come off before anything is used as a URL or a key.
const read = key =>
  env
    .match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]
    ?.replace(/\s+#.*$/, '')
    .trim();

const root = new URL('..', import.meta.url).pathname;
const API = (process.env.PROBE_API_URL ?? 'http://localhost:8080').replace(
  /\/+$/,
  ''
);
// Point it at an installed binary to check the artifact people actually get:
//   PROBE_CLI=$(npm root -g)/@ganju/cli/dist/index.js
const CLI =
  process.env.PROBE_CLI ?? path.join(root, 'packages/cli/dist/index.js');

const DATABASE_URL = read('DATABASE_URL');
const JWT_SECRET = read('JWT_SECRET');
const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1 });

let pass = 0;
let fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) {
    pass++;
    console.log(`  ok   ${label}${extra ? ` — ${extra}` : ''}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${extra ? ` — ${extra}` : ''}`);
  }
};
const section = title => console.log(`\n${title}\n`);

// better-call signs a cookie as `${value}.${base64(hmac-sha256(value))}`.
const signCookie = value =>
  encodeURIComponent(
    `${value}.${crypto.createHmac('sha256', JWT_SECRET).update(value).digest('base64')}`
  );

const stamp = Date.now();
const userId = uuid();
const leaverId = uuid();
const orgId = uuid();
const projectId = uuid();
const siblingId = uuid();
const artifactId = uuid();
const slug = `probe-token-${stamp.toString(36)}`;
const sessionToken = crypto.randomBytes(32).toString('base64url');
const leaverSession = crypto.randomBytes(32).toString('base64url');

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ganju-token-probe-'));
const home = path.join(workdir, 'home');
const project = path.join(workdir, 'tools');

// Both names, because which one better-auth reads depends on `useSecureCookies`,
// which follows NODE_ENV — and the *development* worker runs with NODE_ENV set
// to production. Sending both means the probe does not have to know.
const cookieFor = token => {
  const signed = signCookie(token);
  return `better-auth.session_token=${signed}; __Secure-better-auth.session_token=${signed}`;
};
const asPerson = (p, init = {}, token = sessionToken) =>
  fetch(`${API}${p}`, {
    ...init,
    headers: {
      cookie: cookieFor(token),
      'content-type': 'application/json',
      ...init.headers
    }
  });
const asMachine = (p, token, init = {}) =>
  fetch(`${API}${p}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...init.headers
    }
  });

// The CLI runs with its own config dir, so the probe can never touch the
// developer's real login.
const ganju = (args, extra = {}) => {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: project,
    encoding: 'utf8',
    env: {
      ...process.env,
      GANJU_CONFIG_DIR: home,
      GANJU_API_URL: API,
      ...extra
    }
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const out = `${stdout}${stderr}`;
  if (process.env.PROBE_VERBOSE) console.log(out.replace(/^/gm, '    | '));
  return { code: result.status, out, stdout, stderr };
};

console.log(`\nProbing ${API}`);
console.log(`  cli ${CLI}`);
console.log(`  scaffolding ${slug} (org ${orgId})`);

try {
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(
    path.join(project, 'ganju.json'),
    `${JSON.stringify(
      { artifact: slug, organizationId: orgId, projectId, tools: [] },
      null,
      2
    )}\n`
  );

  for (const [id, name, token] of [
    [userId, 'probe owner', sessionToken],
    [leaverId, 'probe leaver', leaverSession]
  ]) {
    await sql`insert into "user" ${sql({ id, name, email: `${id}@probe.test` })}`;
    await sql`insert into session ${sql({ id: uuid(), user_id: id, token, expires_at: new Date(Date.now() + 3600_000) })}`;
  }
  await sql`insert into organization ${sql({ id: orgId, name: `probe-token-${stamp}`, owner_id: userId })}`;
  await sql`insert into subscription ${sql({ id: uuid(), organization_id: orgId, plan: 'PRO', status: 'active' })}`;
  await sql`insert into organization_user ${sql({ user_id: userId, organization_id: orgId, role: 'ADMIN' })}`;
  for (const [id, name] of [
    [projectId, 'probe'],
    [siblingId, 'probe sibling']
  ]) {
    await sql`insert into project ${sql({ id, name, created_by_id: userId, organization_id: orgId })}`;
    // Both people are admins of both projects, so nothing below is refused for
    // want of membership — every refusal is the confinement rule.
    for (const member of [userId, leaverId]) {
      await sql`insert into project_user ${sql({ user_id: member, project_id: id, role: 'ADMIN' })}`;
    }
  }
  await sql`insert into artifact ${sql({ id: artifactId, slug, project_id: projectId })}`;

  const base = `/organization/${orgId}/project/${projectId}`;
  const siblingBase = `/organization/${orgId}/project/${siblingId}`;

  // --- minting -------------------------------------------------------------
  section('minting, as a signed-in person');

  const createRes = await asPerson(`${base}/token`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Probe CI', expiresInDays: 30 })
  });
  const created = await createRes.json();
  check(
    'POST …/token answers with the value',
    createRes.status === 200 && typeof created.token === 'string',
    created.hint ?? JSON.stringify(created).slice(0, 120)
  );
  // Everything below is about this token, so there is nothing to learn from
  // running the rest against `undefined` — and a 401 here is a statement about
  // the probe's own cookie, not about the feature.
  if (!created?.token) {
    throw new Error(
      `Could not mint a token (HTTP ${createRes.status}). If this is a 401, the session cookie was rejected: check that JWT_SECRET in ${isProd ? '.env.prod' : '.env'} matches the deployed worker's, and that it is pointed at this DATABASE_URL.`
    );
  }
  check(
    '  ...carrying the prefix a scanner can match',
    !!created.token?.startsWith('ganju_pat_')
  );
  check(
    '  ...bound to the project in the URL',
    created.projectId === projectId
  );
  check(
    '  ...with an expiry computed from the duration, not sent by the client',
    !!created.expiresAt &&
      Math.abs(
        new Date(created.expiresAt).getTime() - (Date.now() + 30 * 86400_000)
      ) < 120_000
  );

  // The migration is the thing a deployed run proves that a local one cannot:
  // if 0069 has not landed, every request above is a 500.
  const [stored] =
    await sql`select token_hash, hint, user_id, project_id from access_token where id = ${created.id}`;
  check('the row is in the deployed database', !!stored);
  check(
    '  ...holding a hash, never the value',
    !!stored &&
      stored.token_hash !== created.token &&
      !created.token.includes(stored.token_hash)
  );
  check(
    '  ...and the project it is confined to',
    stored?.project_id === projectId
  );

  const badName = await asPerson(`${base}/token`, {
    method: 'POST',
    body: JSON.stringify({ name: '' })
  });
  const badBody = await badName.json();
  check(
    'an empty name is refused with the field named',
    badName.status === 400 && badBody?.errors?.[0]?.path === 'name',
    badBody?.errors?.[0]?.path
  );

  // --- listing -------------------------------------------------------------
  section('listing');

  const listed = await (await asPerson(`${base}/token`)).json();
  const row = listed.find(item => item.id === created.id);
  check('GET …/token returns it', !!row);
  check(
    '  ...without the value, which nothing can print back',
    !JSON.stringify(listed).includes(created.token)
  );
  check(
    '  ...naming who minted it',
    row?.createdBy?.id === userId,
    row?.createdBy?.email
  );
  check(
    '  ...and not marked orphaned while its owner is here',
    row?.orphaned === false
  );

  const siblingList = await (await asPerson(`${siblingBase}/token`)).json();
  check(
    'the sibling project sees none of it',
    Array.isArray(siblingList) && siblingList.length === 0
  );

  // --- the machine ---------------------------------------------------------
  section('the machine, over HTTP');

  check(
    'the token opens /me with no cookie anywhere',
    (await asMachine('/me', created.token)).status === 200
  );
  check(
    '  ...and its own project',
    (await asMachine(`${base}/artifact`, created.token)).status === 200
  );

  const cross = await asMachine(`${siblingBase}/artifact`, created.token);
  const crossBody = await cross.json();
  check(
    'a sibling project in the same organization is refused',
    cross.status === 403,
    crossBody?.error
  );
  check(
    'the organization itself is refused',
    (await asMachine(`/organization/${orgId}`, created.token)).status === 403
  );
  check(
    'so is the organization list',
    (await asMachine('/organization', created.token)).status === 403
  );
  check(
    'and account deletion',
    (await asMachine('/user', created.token, { method: 'DELETE' })).status ===
      403
  );

  for (const [label, res] of [
    [
      'mint another',
      await asMachine(`${base}/token`, created.token, {
        method: 'POST',
        body: JSON.stringify({ name: 'escalation' })
      })
    ],
    ['list them', await asMachine(`${base}/token`, created.token)],
    [
      'revoke one',
      await asMachine(`${base}/token/${created.id}`, created.token, {
        method: 'DELETE'
      })
    ]
  ]) {
    check(`a token cannot ${label}`, res.status === 403);
  }

  const [used] =
    await sql`select last_used_at from access_token where id = ${created.id}`;
  check('use is recorded on the row', !!used?.last_used_at);

  // --- expiry --------------------------------------------------------------
  section('expiry');

  const expiredCreate = await asPerson(`${base}/token`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Already over', expiresInDays: 1 })
  });
  const expiring = await expiredCreate.json();
  await sql`update access_token set expires_at = ${new Date(Date.now() - 60_000)} where id = ${expiring.id}`;
  const expiredRes = await asMachine('/me', expiring.token);
  check('an expired token is refused', expiredRes.status === 401);
  check(
    '  ...with the same answer an unknown one gets',
    JSON.stringify(await expiredRes.json()) ===
      JSON.stringify(await (await asMachine('/me', 'ganju_pat_nope')).json())
  );
  await sql`delete from access_token where id = ${expiring.id}`;

  // --- the CLI as CI runs it ----------------------------------------------
  section('the CLI, the way CI runs it');

  const whoami = ganju(['whoami'], { GANJU_API_TOKEN: created.token });
  check(
    '`ganju whoami` works with no stored login',
    whoami.code === 0,
    whoami.stdout.trim()
  );
  const versions = ganju(['versions'], { GANJU_API_TOKEN: created.token });
  check(
    '`ganju versions` reaches the linked project',
    versions.code === 0,
    versions.out.trim().split('\n')[0]
  );
  const escalate = ganju(['token', 'create', 'x'], {
    GANJU_API_TOKEN: created.token
  });
  check(
    '`ganju token create` refuses under a token, before the request',
    escalate.code !== 0 && /cannot create tokens/i.test(escalate.out)
  );
  const noLogin = ganju(['token', 'list']);
  check(
    'and needs a login when no credential is set at all',
    noLogin.code !== 0 && /not logged in/i.test(noLogin.out)
  );

  // --- outliving its owner -------------------------------------------------
  section('outliving the account that minted it');

  const theirs = await (
    await asPerson(
      `${base}/token`,
      { method: 'POST', body: JSON.stringify({ name: 'Leaver CI' }) },
      leaverSession
    )
  ).json();
  check('a second person can mint one', !!theirs.token);
  check(
    '  ...and it works while they are here',
    (await asMachine(`${base}/artifact`, theirs.token)).status === 200
  );

  await sql`delete from "user" where id = ${leaverId}`;

  const afterDelete = await (await asPerson(`${base}/token`)).json();
  const orphan = afterDelete.find(item => item.id === theirs.id);
  check('deleting the account keeps the row', !!orphan);
  check(
    '  ...with its owner cleared rather than the row cascaded away',
    orphan?.createdBy === null && orphan?.createdByUserId === null
  );
  check('  ...reported as orphaned', orphan?.orphaned === true);
  check(
    '  ...and it no longer authenticates',
    (await asMachine('/me', theirs.token)).status === 401
  );
  check(
    '  ...but can still be revoked deliberately',
    (await asPerson(`${base}/token/${theirs.id}`, { method: 'DELETE' }))
      .status === 200
  );

  // --- revocation ----------------------------------------------------------
  section('revocation');

  const revoked = await asPerson(`${base}/token/${created.id}`, {
    method: 'DELETE'
  });
  check('DELETE …/token/:id answers with the row', revoked.status === 200);
  check(
    '  ...and the credential stops working on its next request',
    (await asMachine('/me', created.token)).status === 401
  );
  const [gone] =
    await sql`select count(*)::int as n from access_token where id = ${created.id}`;
  check('  ...with nothing left behind', gone.n === 0);

  const foreign = await asPerson(`${siblingBase}/token/${created.id}`, {
    method: 'DELETE'
  });
  check(
    "a sibling project's URL cannot revoke this project's token",
    foreign.status === 404,
    (await foreign.json())?.error
  );
} finally {
  section('cleanup');
  await sql`delete from access_token where organization_id = ${orgId}`;
  await sql`delete from artifact where id = ${artifactId}`;
  await sql`delete from project_user where project_id in (${projectId}, ${siblingId})`;
  await sql`delete from project where id in (${projectId}, ${siblingId})`;
  await sql`delete from organization_user where organization_id = ${orgId}`;
  await sql`delete from subscription where organization_id = ${orgId}`;
  await sql`delete from organization where id = ${orgId}`;
  await sql`delete from session where user_id in (${userId}, ${leaverId})`;
  await sql`delete from "user" where id in (${userId}, ${leaverId})`;
  const [left] =
    await sql`select count(*)::int as n from organization where id = ${orgId}`;
  check('scaffold removed', left.n === 0);
  fs.rmSync(workdir, { recursive: true, force: true });
  await sql.end();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
