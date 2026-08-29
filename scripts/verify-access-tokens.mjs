// Verifies personal access tokens against the dev database, driving the REAL
// `UserMiddleware.verify` and the REAL AccessTokenController rather than a
// re-implementation of their rules.
//
//   node scripts/verify-access-tokens.mjs           # dev  (.env)
//   node scripts/verify-access-tokens.mjs --prod    # prod (.env.prod)
//
// Three halves, in increasing cost. Minting and hashing need nothing, so they
// run first. The request schemas need nothing either. The rest scaffolds two
// projects in two organizations that the SAME user is an admin of everywhere,
// which is the whole point: every membership check in the middleware answers
// "yes" for all of it, so a token confined to one project is confined by the new
// rule alone. If that rule regresses, this is where it shows.
//
// What it cannot cover: an actual HTTP request. The middleware is driven with a
// Hono-shaped context carrying only what it reads — see the probe script for a
// run against a deployed API.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import esbuild from 'esbuild';
import postgres from 'postgres';
import { v7 as uuid } from 'uuid';

const isProd = process.argv.includes('--prod');
const envFile = isProd ? '../.env.prod' : '../.env';
const env = fs.readFileSync(new URL(envFile, import.meta.url), 'utf8');
// Trailing ` # …` comments are how this .env carries the alternative value for a
// variable, so they have to come off — better-auth rejects a base URL with one
// glued to the end, and the failure reads as a bad URL rather than a bad parse.
const read = key =>
  env
    .match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]
    ?.replace(/\s+#.*$/, '')
    .trim();

const DATABASE_URL = read('DATABASE_URL');
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

// Bundle the middleware, the controller, @ganju/db and @ganju/utils, and take
// all of them out of the same bundle. Importing the packages separately would
// hand drizzle two copies of every table object — different module instances
// mean different symbols, and the query builder silently stops recognising
// them.
const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ganju-verify-pat-'));
const outfile = path.join(bundleDir, 'api.mjs');
const root = new URL('..', import.meta.url).pathname;
const entry = path.join(root, `.verify-pat-entry-${process.pid}.ts`);

fs.writeFileSync(
  entry,
  `export { UserMiddleware } from ${JSON.stringify(path.join(root, 'apps/api/src/middleware/user'))};\n` +
    `export { AccessTokenController } from ${JSON.stringify(path.join(root, 'apps/api/src/controllers/accessToken'))};\n` +
    `export { db } from '@ganju/db';\n` +
    `export { utils } from '@ganju/utils';\n`
);

// The entry is a real file in the repo root for the duration of the bundle, so
// a crash before the cleanup below would leave one behind. This is what makes
// that impossible rather than merely unlikely.
process.on('exit', () => {
  fs.rmSync(entry, { force: true });
  fs.rmSync(bundleDir, { recursive: true, force: true });
});

await esbuild.build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  absWorkingDir: root,
  tsconfig: path.join(root, 'apps/api/tsconfig.json'),
  banner: {
    js: "import { createRequire as __cr } from 'node:module';\nconst require = __cr(import.meta.url);"
  },
  logLevel: 'error'
});

const { UserMiddleware, AccessTokenController, utils } = await import(outfile);

// minting and hashing — no database needed, so this runs before anything is
// scaffolded

console.log('\nminting\n');

const minted = await utils.mintAccessToken();
check(
  'a minted token carries the prefix',
  minted.token.startsWith(utils.constants.ACCESS_TOKEN_PREFIX),
  minted.hint
);
check(
  'the value is the prefix plus 32 base64url bytes',
  minted.token.length === utils.constants.ACCESS_TOKEN_PREFIX.length + 43
);
check(
  'the hash is not the value',
  minted.tokenHash !== minted.token && minted.tokenHash.length === 43
);
check(
  'hashing is stable',
  (await utils.hashAccessToken(minted.token)) === minted.tokenHash
);

const second = await utils.mintAccessToken();
check('two mints differ', second.token !== minted.token);
check('  ...and so do their hashes', second.tokenHash !== minted.tokenHash);

check(
  'the hint is short enough to be useless on its own',
  minted.hint.length <
    utils.constants.ACCESS_TOKEN_PREFIX.length +
      utils.constants.ACCESS_TOKEN_HINT_CHARS +
      2
);
check(
  '  ...and long enough to tell two rows apart',
  minted.hint !== second.hint
);
check(
  'the hint is a prefix of the value',
  minted.token.startsWith(minted.hint.slice(0, -1))
);

check('a minted token is recognised', utils.isAccessToken(minted.token));
check(
  'an OAuth access token is not',
  // Opaque, and shaped nothing like ours — which is the point: the prefix is
  // what routes a bearer token to the right lookup before either is made.
  !utils.isAccessToken('K8s2mQ1vT7xR0pLdN4hB6wYc3jZaFuEg')
);
check('  ...and neither is an empty string', !utils.isAccessToken(''));

// request schemas

console.log('\nrequest schemas\n');

const parseCreate = async value => {
  try {
    return {
      ok: true,
      value: await utils.Schema.ACCESS_TOKEN_CREATE.parseAsync({
        ...value,
        userId: uuid(),
        organizationId: uuid(),
        projectId: uuid()
      })
    };
  } catch (error) {
    return { ok: false, issues: error.issues };
  }
};

check(
  'a name and a duration are accepted',
  (await parseCreate({ name: 'GitHub Actions', expiresInDays: 90 })).ok
);
check(
  'an explicit null expiry is accepted',
  (await parseCreate({ name: 'CI', expiresInDays: null })).ok
);
check('an omitted expiry is accepted', (await parseCreate({ name: 'CI' })).ok);
check('an empty name is refused', !(await parseCreate({ name: '' })).ok);
check(
  'a whitespace-only name is refused',
  !(await parseCreate({ name: '   ' })).ok
);
check(
  'a name past the cap is refused',
  !(
    await parseCreate({
      name: 'x'.repeat(utils.constants.ACCESS_TOKEN_NAME_MAX + 1)
    })
  ).ok
);
check(
  'zero days is refused',
  !(await parseCreate({ name: 'CI', expiresInDays: 0 })).ok
);
check(
  'a duration past the ceiling is refused',
  !(
    await parseCreate({
      name: 'CI',
      expiresInDays: utils.constants.ACCESS_TOKEN_MAX_EXPIRY_DAYS + 1
    })
  ).ok
);
check(
  'a fractional duration is refused',
  !(await parseCreate({ name: 'CI', expiresInDays: 1.5 })).ok
);

const nameIssue = await parseCreate({ name: '' });
check(
  'the issue points at the offending field',
  nameIssue.issues?.[0]?.path?.join('.') === 'name',
  nameIssue.issues?.[0]?.path?.join('.')
);
check(
  '  ...and translates in es',
  utils.localizeZodIssue(nameIssue.issues[0], 'es') !==
    nameIssue.issues[0].message,
  utils.localizeZodIssue(nameIssue.issues[0], 'es')
);

check(
  'the dashboard view omits the ids the route already carries',
  !('userId' in utils.Schema.ACCESS_TOKEN_CREATE_VIEW.shape) &&
    !('projectId' in utils.Schema.ACCESS_TOKEN_CREATE_VIEW.shape)
);

// scaffold

const [owner] =
  await sql`select id from "user" order by created_at asc limit 1`;
if (!owner) throw new Error('No user in this database to own the scaffold');

const orgA = uuid();
const orgB = uuid();
const projectA = uuid();
const projectB = uuid();
// A second project inside orgA. This is the one that makes the confinement
// sharp: same organization, same admin, and still out of reach.
const projectB2 = uuid();
const stamp = Date.now();

console.log(`\nScaffolding orgs ${orgA} and ${orgB}\n`);

const scaffold = async () => {
  for (const [orgId, projectId] of [
    [orgA, projectA],
    [orgB, projectB]
  ]) {
    await sql`insert into organization ${sql({ id: orgId, name: `verify-access-tokens-${stamp}`, owner_id: owner.id })}`;
    await sql`insert into subscription ${sql({ id: uuid(), organization_id: orgId, plan: 'PRO', status: 'active' })}`;
    // The same user is an admin of BOTH, which is what makes the confinement
    // checks below mean something: every membership check in the middleware
    // answers yes for either project.
    await sql`insert into organization_user ${sql({ user_id: owner.id, organization_id: orgId, role: 'ADMIN' })}`;
    await sql`insert into project ${sql({ id: projectId, name: 'verify', created_by_id: owner.id, organization_id: orgId })}`;
    await sql`insert into project_user ${sql({ user_id: owner.id, project_id: projectId, role: 'ADMIN' })}`;
  }
  await sql`insert into project ${sql({ id: projectB2, name: 'verify-sibling', created_by_id: owner.id, organization_id: orgA })}`;
  await sql`insert into project_user ${sql({ user_id: owner.id, project_id: projectB2, role: 'ADMIN' })}`;
};

// A Hono-shaped context carrying only what the middleware and the controller
// read. `env` is what `db.create` and `getEnv` reach into.
const envFor = () => ({
  HYPERDRIVE: { connectionString: DATABASE_URL },
  NODE_ENV: read('NODE_ENV') ?? 'development',
  NEXT_PUBLIC_API_URL: read('NEXT_PUBLIC_API_URL'),
  NEXT_PUBLIC_WEB_URL: read('NEXT_PUBLIC_WEB_URL'),
  NEXT_PUBLIC_DOMAIN: read('NEXT_PUBLIC_DOMAIN'),
  JWT_SECRET: read('JWT_SECRET'),
  CRYPTO_SECRET: read('CRYPTO_SECRET'),
  GOOGLE_CLIENT_ID: read('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: read('GOOGLE_CLIENT_SECRET'),
  GITHUB_CLIENT_ID: read('GITHUB_CLIENT_ID'),
  GITHUB_CLIENT_SECRET: read('GITHUB_CLIENT_SECRET')
});

const contextFor = ({
  token,
  params = {},
  path: reqPath = '/me',
  body,
  method
}) => {
  const store = new Map();
  const pending = [];
  return {
    env: envFor(),
    executionCtx: { waitUntil: promise => pending.push(promise) },
    req: {
      raw: new Request(`https://api.test${reqPath}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {}
      }),
      path: reqPath,
      method: method ?? (body ? 'POST' : 'GET'),
      url: `https://api.test${reqPath}`,
      header: name =>
        name.toLowerCase() === 'authorization' && token
          ? `Bearer ${token}`
          : undefined,
      param: name => params[name],
      json: async () => body
    },
    get: key => store.get(key),
    set: (key, value) => store.set(key, value),
    json: (payload, status = 200) => ({ payload, status }),
    // Test-only handles, not part of the Hono shape.
    _store: store,
    _settled: () => Promise.all(pending)
  };
};

/** Run the middleware and report whether it passed the request through. */
const authorize = async options => {
  const c = contextFor(options);
  let reached = false;
  const result = await UserMiddleware.verify(c, async () => {
    reached = true;
  });
  await c._settled();
  return {
    reached,
    status: reached ? 200 : result?.status,
    body: reached ? null : result?.payload,
    user: c._store.get('user'),
    apiToken: c._store.get('apiToken')
  };
};

const insertToken = async ({
  projectId,
  organizationId,
  expiresAt = null,
  // Defaults to the scaffold's owner; named explicitly by the check that deletes
  // the account a token belongs to.
  userId
}) => {
  const value = await utils.mintAccessToken();
  const id = uuid();
  await sql`insert into access_token ${sql({
    id,
    name: 'verify',
    token_hash: value.tokenHash,
    hint: value.hint,
    expires_at: expiresAt,
    project_id: projectId,
    organization_id: organizationId,
    user_id: userId ?? owner.id
  })}`;
  return { id, ...value };
};

try {
  await scaffold();

  const tokenA = await insertToken({
    projectId: projectA,
    organizationId: orgA
  });
  const tokenB = await insertToken({
    projectId: projectB,
    organizationId: orgB
  });
  const expired = await insertToken({
    projectId: projectA,
    organizationId: orgA,
    expiresAt: new Date(Date.now() - 60_000)
  });

  console.log('\nauthentication\n');

  check('no credentials is 401', (await authorize({})).status === 401);
  check(
    'a token that was never minted is 401',
    (await authorize({ token: `${utils.constants.ACCESS_TOKEN_PREFIX}nope` }))
      .status === 401
  );

  const good = await authorize({ token: tokenA.token });
  check('a live token authenticates', good.reached);
  check('  ...as the user who minted it', good.user?.id === owner.id);
  check(
    '  ...and reports which token it was',
    good.apiToken?.id === tokenA.id,
    good.apiToken?.id
  );
  check(
    '  ...and which project it is confined to',
    good.apiToken?.projectId === projectA
  );

  const expiredResult = await authorize({ token: expired.token });
  check('an expired token is refused', expiredResult.status === 401);
  check(
    '  ...with the same answer an unknown one gets',
    JSON.stringify(expiredResult.body) ===
      JSON.stringify((await authorize({ token: 'ganju_pat_x' })).body),
    JSON.stringify(expiredResult.body)
  );

  console.log('\nproject confinement\n');

  check(
    'the token reaches its own project',
    (
      await authorize({
        token: tokenA.token,
        params: { organizationId: orgA, projectId: projectA },
        path: `/organization/${orgA}/project/${projectA}/artifact`
      })
    ).reached
  );
  const crossProject = await authorize({
    token: tokenA.token,
    params: { organizationId: orgB, projectId: projectB },
    path: `/organization/${orgB}/project/${projectB}/artifact`
  });
  check(
    'and is refused on another — though its holder is an admin there',
    crossProject.status === 403,
    crossProject.body?.error
  );
  check(
    '  ...which is the rule doing the work, not the membership check',
    // Proof the refusal above is the confinement and not a missing membership:
    // the very same project opens to a token minted for it.
    (
      await authorize({
        token: tokenB.token,
        params: { organizationId: orgB, projectId: projectB },
        path: `/organization/${orgB}/project/${projectB}/artifact`
      })
    ).reached
  );
  check(
    'a sibling project in the SAME organization is refused too',
    // The sharper half of the rule: same organization, same admin, different
    // project. An organization-scoped credential would have walked in here.
    (
      await authorize({
        token: tokenA.token,
        params: { organizationId: orgA, projectId: projectB2 },
        path: `/organization/${orgA}/project/${projectB2}/artifact`
      })
    ).status === 403
  );
  check(
    'a project that does not exist is refused rather than passed through',
    (
      await authorize({
        token: tokenA.token,
        params: { organizationId: orgA, projectId: uuid() },
        path: '/organization/x/project/y/artifact'
      })
    ).status === 403
  );

  console.log('\nunscoped paths\n');

  check(
    '/me is reachable — it is how the CLI reports who it is',
    (await authorize({ token: tokenA.token, path: '/me' })).reached
  );
  check(
    'its own organization is refused — this is not an org credential',
    // Billing, members and the model configs all hang off here, and none of them
    // is what a deploy credential is for.
    (
      await authorize({
        token: tokenA.token,
        params: { organizationId: orgA },
        path: `/organization/${orgA}`
      })
    ).status === 403
  );
  check(
    'the organization list is refused',
    (await authorize({ token: tokenA.token, path: '/organization' })).status ===
      403
  );
  check(
    'anything else naming no project is refused',
    (await authorize({ token: tokenA.token, path: '/user/export' })).status ===
      403
  );
  check(
    '  ...including account deletion',
    (await authorize({ token: tokenA.token, path: '/user' })).status === 403
  );

  console.log('\nrevocation and last use\n');

  const [beforeUse] =
    await sql`select last_used_at from access_token where id = ${tokenA.id}`;
  check('use is recorded', !!beforeUse.last_used_at);

  // Written far enough in the past that the next request is outside the write
  // interval, so this asserts the update happens rather than that it happened
  // once.
  const marker = new Date(
    Date.now() - utils.constants.ACCESS_TOKEN_LAST_USED_INTERVAL_MS - 60_000
  );
  await sql`update access_token set last_used_at = ${marker} where id = ${tokenA.id}`;
  await authorize({ token: tokenA.token, path: '/me' });
  const [afterUse] =
    await sql`select last_used_at from access_token where id = ${tokenA.id}`;
  check(
    'a stale last-used is refreshed',
    afterUse.last_used_at.getTime() > marker.getTime()
  );

  const recent = afterUse.last_used_at;
  await authorize({ token: tokenA.token, path: '/me' });
  const [unchanged] =
    await sql`select last_used_at from access_token where id = ${tokenA.id}`;
  check(
    'a fresh one is left alone — this is not a write per request',
    unchanged.last_used_at.getTime() === recent.getTime()
  );

  const [stored] =
    await sql`select token_hash, hint from access_token where id = ${tokenA.id}`;
  check(
    'the row holds no plaintext',
    stored.token_hash !== tokenA.token &&
      !tokenA.token.includes(stored.token_hash)
  );
  check(
    '  ...and the stored hash is the hash of the value',
    stored.token_hash === (await utils.hashAccessToken(tokenA.token))
  );

  await sql`delete from access_token where id = ${tokenA.id}`;
  check(
    'revoking takes effect on the next request',
    (await authorize({ token: tokenA.token })).status === 401
  );

  console.log('\noutliving the account that minted it\n');

  // A deploy credential that disappears with its author leaves a pipeline
  // failing days later with nothing in the product to explain it. The row is
  // kept instead — visible, and refused.
  const [doomed] = await sql`insert into "user" ${sql({
    id: uuid(),
    name: 'leaving',
    email: `leaving-${stamp}@example.test`
  })} returning id`;
  await sql`insert into project_user ${sql({ user_id: doomed.id, project_id: projectA, role: 'ADMIN' })}`;
  const theirs = await insertToken({
    projectId: projectA,
    organizationId: orgA,
    userId: doomed.id
  });
  check(
    'their token works while they are here',
    (
      await authorize({
        token: theirs.token,
        params: { organizationId: orgA, projectId: projectA },
        path: `/organization/${orgA}/project/${projectA}/artifact`
      })
    ).reached
  );

  await sql`delete from "user" where id = ${doomed.id}`;

  const [survivor] =
    await sql`select id, user_id from access_token where id = ${theirs.id}`;
  check('deleting the account keeps the token row', !!survivor);
  check(
    '  ...with its owner cleared rather than the row cascaded away',
    survivor?.user_id === null
  );
  check(
    '  ...and it no longer authenticates, since there is nobody to act as',
    (await authorize({ token: theirs.token })).status === 401
  );

  // The controller as a signed-in person would reach it. `asUser` is defined
  // further down with the rest of the management checks; this one call needs it
  // early, so it is assembled here rather than moving that helper up past the
  // section it belongs to.
  const listAsPerson = async (organizationId, projectId) => {
    const c = contextFor({
      params: { organizationId, projectId },
      path: `/organization/${organizationId}/project/${projectId}/token`
    });
    c.set('user', { id: owner.id });
    return (await AccessTokenController.list(c)).payload ?? [];
  };

  const orphanList = await listAsPerson(orgA, projectA);
  const orphanRow = orphanList.find(row => row.id === theirs.id);
  check('the list still shows it', !!orphanRow);
  check('  ...marked as having lost its owner', orphanRow?.orphaned === true);
  check('  ...with no creator to name', orphanRow?.createdBy === null);
  check(
    'a live token still names who minted it',
    orphanList.some(row => row.createdBy?.id === owner.id && !row.orphaned)
  );

  await sql`delete from access_token where id = ${theirs.id}`;

  console.log('\nminting, listing and revoking\n');

  // A context that has already been through the middleware as a signed-in user:
  // `user` set, `apiToken` absent.
  const asUser = (organizationId, projectId, body) => {
    const c = contextFor({
      params: { organizationId, projectId },
      path: `/organization/${organizationId}/project/${projectId}/token`,
      body
    });
    c.set('user', { id: owner.id });
    return c;
  };

  const created = await AccessTokenController.create(
    asUser(orgB, projectB, { name: 'from-controller', expiresInDays: 30 })
  );
  const createdBody = created.payload;
  check('create answers with the value', !!createdBody?.token);
  check(
    '  ...and names the project it is bound to',
    createdBody?.projectId === projectB
  );
  check(
    '  ...exactly once — the list never carries it',
    !(
      (await AccessTokenController.list(asUser(orgB, projectB))).payload ?? []
    ).some(row => 'token' in row)
  );
  check(
    '  ...and the value verifies against the stored hash',
    (
      await sql`select 1 from access_token where id = ${createdBody.id} and token_hash = ${await utils.hashAccessToken(createdBody.token)}`
    ).length === 1
  );
  check(
    'an expiry is computed from the duration',
    createdBody.expiresAt &&
      Math.abs(
        new Date(createdBody.expiresAt).getTime() -
          (Date.now() + 30 * 24 * 60 * 60 * 1000)
      ) < 60_000
  );

  const listed = (await AccessTokenController.list(asUser(orgB, projectB)))
    .payload;
  check(
    'the list is scoped to the project',
    listed.every(row => row.projectId === projectB) &&
      listed.some(row => row.id === createdBody.id),
    `${listed.length} rows`
  );
  check(
    '  ...so a sibling project sees none of it',
    ((await AccessTokenController.list(asUser(orgA, projectB2))).payload ?? [])
      .length === 0
  );

  // Both ids come from the URL and only the project was authorized, so a
  // mismatched pair has to be refused rather than trusted.
  let mismatched = false;
  try {
    await AccessTokenController.create(
      asUser(orgA, projectB, { name: 'wrong-organization' })
    );
  } catch (error) {
    mismatched = /not found/i.test(error.message);
  }
  check(
    "a project named under another organization's id is refused",
    mismatched
  );

  // The escalation this rule exists to prevent: a leaked credential minting a
  // second one that survives the first being revoked.
  const byToken = asUser(orgB, projectB, { name: 'escalation' });
  byToken.set('apiToken', {
    id: tokenB.id,
    projectId: projectB,
    organizationId: orgB
  });
  check(
    'a token cannot mint a token',
    (await AccessTokenController.create(byToken)).status === 403
  );
  check(
    '  ...nor list them',
    (await AccessTokenController.list(byToken)).status === 403
  );
  check(
    '  ...nor revoke one',
    (await AccessTokenController.remove(byToken)).status === 403
  );

  console.log('\nthe per-project cap\n');

  // Filled to exactly the cap, counting the rows already there — an off-by-one
  // here would leave the "revoking makes room" check below asserting nothing.
  const [{ n: already }] =
    await sql`select count(*)::int as n from access_token where project_id = ${projectA}`;
  const filler = [];
  while (
    already + filler.length <
    utils.constants.ACCESS_TOKEN_MAX_PER_PROJECT
  ) {
    filler.push(
      await insertToken({ projectId: projectA, organizationId: orgA })
    );
  }
  let capped;
  try {
    await AccessTokenController.create(
      asUser(orgA, projectA, { name: 'one too many' })
    );
  } catch (error) {
    capped = error.message;
  }
  check('the cap refuses the next one', !!capped, capped);
  check(
    '  ...worded so it answers 400 rather than an opaque 500',
    /\b(exceeds|invalid|required|must be|remove)\b/i.test(capped ?? '')
  );
  check(
    '  ...and it is per project, not per organization',
    // The sibling project is in the same organization and nowhere near the cap.
    !!(
      await AccessTokenController.create(
        asUser(orgA, projectB2, { name: 'sibling has room' })
      )
    ).payload?.token
  );
  const [spare] =
    await sql`select id from access_token where project_id = ${projectA} limit 1`;
  await sql`delete from access_token where id = ${spare.id}`;
  check(
    'revoking one makes room again',
    !!(
      await AccessTokenController.create(
        asUser(orgA, projectA, { name: 'room' })
      )
    ).payload?.token
  );

  const removeCtx = asUser(orgB, projectB);
  removeCtx.req.param = name =>
    ({ organizationId: orgB, projectId: projectB, tokenId: createdBody.id })[
      name
    ];
  check(
    'revoking answers with the row it removed',
    (await AccessTokenController.remove(removeCtx)).payload?.id ===
      createdBody.id
  );

  // A token belonging to a sibling project must not be reachable by naming it
  // through this project's URL.
  const foreignCtx = asUser(orgA, projectA);
  foreignCtx.req.param = name =>
    ({ organizationId: orgA, projectId: projectA, tokenId: tokenB.id })[name];
  let refused = false;
  try {
    await AccessTokenController.remove(foreignCtx);
  } catch (error) {
    refused = /not found/i.test(error.message);
  }
  check("another project's token cannot be revoked here", refused);
} finally {
  console.log('\nCleaning up\n');
  await sql`delete from access_token where organization_id in (${orgA}, ${orgB})`;
  await sql`delete from project_user where project_id in (${projectA}, ${projectB}, ${projectB2})`;
  await sql`delete from project where id in (${projectA}, ${projectB}, ${projectB2})`;
  await sql`delete from organization_user where organization_id in (${orgA}, ${orgB})`;
  await sql`delete from subscription where organization_id in (${orgA}, ${orgB})`;
  await sql`delete from organization where id in (${orgA}, ${orgB})`;
  const leftover =
    await sql`select count(*)::int as n from organization where id in (${orgA}, ${orgB})`;
  check('scaffold removed', leftover[0].n === 0);

  fs.rmSync(bundleDir, { recursive: true, force: true });
  fs.rmSync(entry, { force: true });
  await sql.end();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
