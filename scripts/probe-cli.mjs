// Drives the CLI as a real user would, against a real API and a real database.
//
//   npm run dev -w api          # in another terminal
//   node scripts/probe-cli.mjs
//
// Everything the CLI does was previously exercised against a stand-in server,
// which proves the request sequences and nothing about the server. This runs the
// installed binary as a subprocess against an API on localhost backed by the
// development database — so the bearer-token middleware, the publish pipeline,
// the dispatch namespace and the MCP boot loop are all the real ones.
//
// The one thing it cannot do is click a browser. So the fake browser below is
// curl carrying a session cookie this script signs, and the CLI's OAuth client
// is pre-registered with consent skipped — the two steps a human would perform.
// Everything either side of them is the CLI's own code path: discovery, PKCE,
// the loopback listener, the token exchange, and every command after it.
//
// It needs .env: DATABASE_URL, JWT_SECRET (which signs the session cookie),
// MCP_INTERNAL_SECRET, CLOUDFLARE_ACCOUNT_ID, CUSTOM_CODE_CF_API_TOKEN.
//
// Scaffolds a throwaway user + PRO organization + project + artifact and removes
// everything it created, including any script left in the dispatch namespace.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import postgres from 'postgres';
import { v7 as uuid } from 'uuid';

const root = new URL('..', import.meta.url).pathname;
const env = fs.readFileSync(root + '.env', 'utf8');
const read = key => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();

const DATABASE_URL = read('DATABASE_URL');
const JWT_SECRET = read('JWT_SECRET');
const MCP_SECRET = read('MCP_INTERNAL_SECRET');
const ACCOUNT_ID = read('CLOUDFLARE_ACCOUNT_ID');
const CF_TOKEN = read('CUSTOM_CODE_CF_API_TOKEN');

const API = process.env.PROBE_API_URL ?? 'http://localhost:8080';
const MCP_ORIGIN = process.env.PROBE_MCP_URL ?? 'http://localhost:8081';
const NAMESPACE = 'ganju-tools-development';
const CLI = path.join(root, 'packages/cli/dist/index.js');

for (const [k, v] of Object.entries({
  DATABASE_URL,
  JWT_SECRET,
  MCP_INTERNAL_SECRET: MCP_SECRET,
  CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
  CUSTOM_CODE_CF_API_TOKEN: CF_TOKEN
})) {
  if (!v) throw new Error(`Missing ${k} in .env`);
}
if (!fs.existsSync(CLI)) {
  throw new Error(`No CLI build at ${CLI} — run: npm run build -w @ganju/cli`);
}

const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1 });

let pass = 0;
let fail = 0;
const failures = [];
const check = (label, ok, extra = '') => {
  if (ok) {
    pass++;
    console.log(`  ok   ${label}${extra ? ` — ${extra}` : ''}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  FAIL ${label}${extra ? ` — ${extra}` : ''}`);
  }
};
const section = title => console.log(`\n${title}\n`);

// better-call signs a cookie as `${value}.${base64(hmac-sha256(value))}`.
const signCookie = value => {
  const sig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(value)
    .digest('base64');
  return encodeURIComponent(`${value}.${sig}`);
};

const cf = async (p, init) => {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}${p}`,
    { ...init, headers: { authorization: `Bearer ${CF_TOKEN}` } }
  );
  return { status: res.status, body: await res.json().catch(() => null) };
};

// A GET on a script that is not in the namespace answers 200 with
// `result.script: null`, not 404 — so presence is that field, never the status.
const scriptExists = async name => {
  const res = await cf(
    `/workers/dispatch/namespaces/${NAMESPACE}/scripts/${name}`,
    { method: 'GET' }
  );
  return res.status === 200 && res.body?.result?.script != null;
};

const userId = uuid();
const orgId = uuid();
const projectId = uuid();
const artifactId = uuid();
const slug = `probe-cli-${Date.now().toString(36)}`;
const sessionToken = crypto.randomBytes(32).toString('base64url');

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ganju-cli-probe-'));
const home = path.join(workdir, 'home');
const project = path.join(workdir, 'tools');
const fakebin = path.join(workdir, 'bin');

// The CLI runs with its own config dir and its own PATH, so the probe can never
// touch the developer's real login or open their real browser.
const ganju = (args, extra = {}) => {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: extra.cwd ?? project,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakebin}:${process.env.PATH}`,
      GANJU_CONFIG_DIR: home,
      GANJU_API_URL: API,
      ...extra.env
    }
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const out = `${stdout}${stderr}`;
  if (process.env.PROBE_VERBOSE) console.log(out.replace(/^/gm, '    | '));
  // `out` is for matching on anything the run said; `stdout` is for parsing,
  // because the CLI deliberately keeps progress on stderr so that `--json` can
  // be piped. Parsing `out` picks up the progress lines and fails.
  return { code: result.status, out, stdout, stderr };
};

let rpcId = 0;
const rpc = async (method, params) => {
  const res = await fetch(`${MCP_ORIGIN}/${slug}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'x-ganju-internal-secret': MCP_SECRET
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++rpcId,
      method,
      ...(params ? { params } : {})
    })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MCP ${res.status}: ${text.slice(0, 300)}`);
  const line = text.split('\n').find(l => l.startsWith('data:'));
  const payload = JSON.parse(line ? line.slice(5).trim() : text);
  if (payload.error) {
    throw new Error(`MCP error: ${JSON.stringify(payload.error)}`);
  }
  return payload.result;
};

const listTools = async () => {
  await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'probe-cli', version: '1' }
  });
  return (await rpc('tools/list')).tools || [];
};

const HANDLER = `import { defineTool } from '@ganju/sdk';
import { shout } from './lib/shout.ts';

export default defineTool(async (input, ctx) => {
  ctx.log('probe-echo saw ' + input.word);
  return { word: shout(input.word), length: input.word.length };
});
`;

const LIB = `export const shout = (value: string): string => value.toUpperCase();\n`;

const ECHO_TOOL = {
  name: 'probe-echo',
  title: 'Probe echo',
  description: 'Echoes a word back, shouted, with its length.',
  entry: 'src/echo.ts',
  input: {
    type: 'object',
    properties: { word: { type: 'string' } },
    required: ['word']
  },
  output: {
    type: 'object',
    properties: { word: { type: 'string' }, length: { type: 'number' } }
  }
};

let deployed = false;
let clientId = null;

try {
  console.log(`\nScaffolding ${slug} (artifact ${artifactId})`);
  console.log(`  workdir ${workdir}\n`);

  await sql`insert into "user" ${sql({
    id: userId,
    name: 'probe cli',
    email: `probe-cli-${Date.now()}@example.invalid`,
    email_verified: true
  })}`;
  await sql`insert into session ${sql({
    id: uuid(),
    user_id: userId,
    token: sessionToken,
    expires_at: new Date(Date.now() + 60 * 60 * 1000)
  })}`;
  await sql`insert into organization ${sql({
    id: orgId,
    name: 'probe-cli',
    owner_id: userId
  })}`;
  await sql`insert into organization_user ${sql({
    organization_id: orgId,
    user_id: userId,
    role: 'ADMIN'
  })}`;
  await sql`insert into subscription ${sql({
    id: uuid(),
    organization_id: orgId,
    plan: 'PRO',
    status: 'active'
  })}`;
  await sql`insert into project ${sql({
    id: projectId,
    name: 'probe',
    created_by_id: userId,
    organization_id: orgId
  })}`;
  await sql`insert into project_user ${sql({
    project_id: projectId,
    user_id: userId,
    role: 'ADMIN'
  })}`;
  await sql`insert into artifact ${sql({
    id: artifactId,
    slug,
    project_id: projectId
  })}`;

  // --- the two steps a human performs ------------------------------------
  section('login');

  const registration = await fetch(`${API}/auth/oauth2/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Ganju CLI (probe)',
      redirect_uris: [8976, 8977, 8978, 8979, 8980].map(
        p => `http://127.0.0.1:${p}/callback`
      ),
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'openid profile email offline_access'
    })
  });
  const registered = await registration.json().catch(() => null);
  check(
    'dynamic client registration is open, and takes loopback redirects',
    registration.ok && Boolean(registered?.client_id),
    registration.ok ? registered.client_id : `HTTP ${registration.status}`
  );
  if (!registered?.client_id)
    throw new Error('cannot continue without a client');
  clientId = registered.client_id;

  // Consent is a browser screen. Skipping it for this client isolates the CLI's
  // flow from a page curl could not have rendered anyway.
  await sql`update oauth_client set skip_consent = true where client_id = ${registered.client_id}`;

  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(home, 'credentials.json'),
    JSON.stringify({
      version: 1,
      accounts: { [API]: { clientId: registered.client_id, accessToken: '' } }
    }),
    { mode: 0o600 }
  );

  // The fake browser: follows the authorize redirect carrying a session cookie
  // this script signed, exactly as a signed-in browser would.
  const signed = signCookie(sessionToken);
  fs.mkdirSync(fakebin, { recursive: true });
  fs.writeFileSync(
    path.join(fakebin, 'open'),
    `#!/bin/sh\ncurl -sL --cookie 'better-auth.session_token=${signed}; __Secure-better-auth.session_token=${signed}' "$1" -o /dev/null\n`,
    { mode: 0o755 }
  );
  // On Linux the CLI reaches for xdg-open instead.
  fs.copyFileSync(path.join(fakebin, 'open'), path.join(fakebin, 'xdg-open'));

  fs.mkdirSync(project, { recursive: true });

  const login = ganju(['login'], { cwd: workdir });
  check(
    '`ganju login` completes the loopback PKCE flow',
    login.code === 0 && /logged in to/.test(login.out),
    login.code === 0
      ? login.out.trim().split('\n').pop()
      : login.out.trim().slice(-200)
  );

  const stored = JSON.parse(
    fs.readFileSync(path.join(home, 'credentials.json'), 'utf8')
  ).accounts[API];
  check(
    'it stored an access token and a refresh token',
    Boolean(stored?.accessToken) && Boolean(stored?.refreshToken)
  );
  check(
    'the credentials file is not world-readable',
    (fs.statSync(path.join(home, 'credentials.json')).mode & 0o077) === 0,
    `mode ${(fs.statSync(path.join(home, 'credentials.json')).mode & 0o777).toString(8)}`
  );

  // The token really is an oauth_access_token row for this user, stored hashed.
  const hashed = crypto
    .createHash('sha256')
    .update(stored.accessToken)
    .digest('base64url');
  const [tokenRow] =
    await sql`select user_id, scopes from oauth_access_token where token = ${hashed}`;
  check(
    'the token is an oauth_access_token row bound to this user',
    tokenRow?.user_id === userId,
    tokenRow ? `scopes ${JSON.stringify(tokenRow.scopes)}` : 'no row'
  );

  const who = ganju(['whoami']);
  check(
    '`ganju whoami` opens /me with the bearer token',
    who.code === 0 && who.out.includes('probe-cli-'),
    who.out.trim()
  );

  // --- the middleware change, on its own ---------------------------------
  section('the bearer-token middleware');

  const meWithToken = await fetch(`${API}/me`, {
    headers: { authorization: `Bearer ${stored.accessToken}` }
  });
  const meBody = await meWithToken.json().catch(() => null);
  check(
    'a bearer token opens a control-plane route that used to need a cookie',
    meWithToken.ok && meBody?.user?.id === userId,
    `HTTP ${meWithToken.status}`
  );

  const meGarbage = await fetch(`${API}/me`, {
    headers: { authorization: 'Bearer definitely-not-a-token' }
  });
  check('an invalid bearer token is still 401', meGarbage.status === 401);

  const meNone = await fetch(`${API}/me`);
  check('no credentials at all is still 401', meNone.status === 401);

  // Membership is enforced against the bearer-resolved user, not skipped for it.
  const strangerOrg = uuid();
  const forbidden = await fetch(
    `${API}/organization/${strangerOrg}/project/${uuid()}/artifact/custom-code/versions`,
    { headers: { authorization: `Bearer ${stored.accessToken}` } }
  );
  check(
    'membership is still checked for a bearer-authenticated caller',
    forbidden.status === 403,
    `HTTP ${forbidden.status}`
  );

  // --- link --------------------------------------------------------------
  section('link');

  fs.writeFileSync(
    path.join(project, 'ganju.json'),
    JSON.stringify({ artifact: slug, tools: [ECHO_TOOL] }, null, 2)
  );
  fs.mkdirSync(path.join(project, 'src/lib'), { recursive: true });
  fs.writeFileSync(path.join(project, 'src/echo.ts'), HANDLER);
  fs.writeFileSync(path.join(project, 'src/lib/shout.ts'), LIB);

  const linked = ganju([
    'link',
    '--organization',
    orgId,
    '--project',
    projectId
  ]);
  check(
    '`ganju link` resolves the artifact and writes the ids',
    linked.code === 0 && linked.out.includes(slug),
    linked.out.trim().split('\n')[0]
  );

  const written = JSON.parse(
    fs.readFileSync(path.join(project, 'ganju.json'), 'utf8')
  );
  check(
    'it wrote the slug it read back from the API',
    written.organizationId === orgId &&
      written.projectId === projectId &&
      written.artifact === slug
  );

  // --- build -------------------------------------------------------------
  section('build');

  const built = ganju(['build']);
  const bundle = path.join(project, '.ganju/bundle.js');
  check(
    '`ganju build` writes a bundle',
    built.code === 0 && fs.existsSync(bundle)
  );

  const bundleText = fs.existsSync(bundle)
    ? fs.readFileSync(bundle, 'utf8')
    : '';
  check(
    'the SDK is left external, as ./ganju-sdk.js',
    bundleText.includes('./ganju-sdk.js') &&
      !bundleText.includes('GANJU_BROKER')
  );
  check(
    'the imported module was bundled in, and TypeScript stripped',
    bundleText.includes('toUpperCase') && !bundleText.includes(': string')
  );

  // --- deploy ------------------------------------------------------------
  section('deploy');

  const deploy = ganju(['deploy']);
  deployed = true;
  check(
    '`ganju deploy` publishes',
    deploy.code === 0 && /is live on/.test(deploy.out),
    deploy.out.trim().split('\n').filter(Boolean).pop()
  );

  const [toolRow] =
    await sql`select id, config, enabled from artifact_tool where artifact_id = ${artifactId} and tool_key = 'custom-code'`;
  check(
    'it created the custom-code install on first use',
    Boolean(toolRow),
    toolRow ? `enabled=${toolRow.enabled}` : 'no row'
  );

  const versions = toolRow
    ? await sql`select id, version, status, source_kind, tools from artifact_tool_version where artifact_tool_id = ${toolRow.id} order by version`
    : [];
  check(
    'one version exists, published',
    versions.length === 1 && versions[0].status === 'published'
  );
  check(
    'it stored as a bundle, so the dashboard shows it read-only',
    versions[0]?.source_kind === 'bundle',
    versions[0]?.source_kind
  );
  check(
    'config.activeVersionId points at it',
    toolRow?.config?.activeVersionId === versions[0]?.id
  );
  check(
    'the manifest carries what ganju.json declared',
    versions[0]?.tools?.[0]?.name === 'probe-echo' &&
      versions[0]?.tools?.[0]?.outputSchema?.type === 'object'
  );

  check(
    'the script really is in the dispatch namespace',
    await scriptExists(`artifact_${artifactId}`)
  );

  // --- the deployed script answers over MCP ------------------------------
  section('the tool an MCP client sees');

  let tools = [];
  try {
    tools = await listTools();
    check(
      'the boot loop registered the tool the CLI published',
      tools.some(t => t.name === 'probe-echo'),
      tools.map(t => t.name).join(', ') || 'none'
    );
    const echo = tools.find(t => t.name === 'probe-echo');
    check(
      'its outputSchema reached the client',
      echo?.outputSchema?.type === 'object'
    );

    const called = await rpc('tools/call', {
      name: 'probe-echo',
      arguments: { word: 'hello' }
    });
    check(
      'calling it runs the CLI-built bundle in the dispatch namespace',
      called?.structuredContent?.word === 'HELLO' &&
        called?.structuredContent?.length === 5,
      JSON.stringify(called?.structuredContent)
    );
  } catch (error) {
    check('MCP round trip', false, String(error).slice(0, 200));
  }

  // --- test --------------------------------------------------------------
  section('test');

  const good = ganju([
    'test',
    'probe-echo',
    '--input',
    JSON.stringify({ word: 'world' })
  ]);
  check(
    '`ganju test` runs a draft against a real preview script',
    good.code === 0 && good.out.includes('WORLD'),
    good.out.trim().split('\n').filter(Boolean).slice(-3).join(' / ')
  );
  check(
    'ctx.log output came back with it',
    good.out.includes('probe-echo saw world')
  );

  const badInput = ganju(['test', 'probe-echo', '--input', '{}']);
  check(
    'an input the schema refuses never reaches a deploy',
    badInput.code === 1 && /input schema/.test(badInput.out),
    badInput.out.trim().split('\n').filter(Boolean).slice(-2).join(' / ')
  );

  const activeRun = ganju([
    'test',
    'probe-echo',
    '--version',
    'active',
    '--input',
    JSON.stringify({ word: 'live' }),
    '--json'
  ]);
  let activeJson = null;
  try {
    activeJson = JSON.parse(activeRun.stdout);
  } catch {}
  check(
    '`--version active` runs the live version and uploads nothing',
    activeRun.code === 0 && activeJson?.output?.word === 'LIVE',
    activeJson
      ? JSON.stringify(activeJson.output ?? activeJson)
      : activeRun.out.trim().split('\n').filter(Boolean).slice(-3).join(' / ')
  );

  check(
    'the preview script was cleaned up afterwards',
    !(await scriptExists(`artifact_${artifactId}_preview`))
  );

  // --- logs --------------------------------------------------------------
  section('logs');

  const logs = ganju(['logs', '--limit', '5']);
  check(
    '`ganju logs` reports the call made over MCP',
    logs.code === 0 && logs.out.includes('probe-echo'),
    logs.out.trim().split('\n')[0]
  );
  check(
    'it lifts ctx.log out of the recorded output',
    logs.out.includes('probe-echo saw hello')
  );

  const filtered = ganju(['logs', '--tool', 'nothing-by-this-name']);
  check(
    '--tool narrows to one name',
    filtered.code === 0 &&
      /No calls to nothing-by-this-name/.test(filtered.out),
    filtered.out.trim()
  );

  // --- secrets -----------------------------------------------------------
  section('secrets');

  const setSecret = ganju(['secret', 'set', 'PROBE_KEY'], {
    env: { GANJU_SECRET_VALUE: 'first-value' }
  });
  check(
    '`ganju secret set` creates it',
    setSecret.code === 0 && /set PROBE_KEY/.test(setSecret.out)
  );

  const replaced = ganju(['secret', 'set', 'PROBE_KEY', 'second-value']);
  check(
    'setting the same name replaces rather than shadows',
    replaced.code === 0 && /replaced PROBE_KEY/.test(replaced.out)
  );

  const credentials =
    await sql`select id, metadata, access_token from artifact_credential where artifact_id = ${artifactId} and provider = 'custom-code'`;
  check(
    'exactly one row carries that label',
    credentials.length === 1 && credentials[0]?.metadata?.label === 'PROBE_KEY',
    `${credentials.length} rows, label ${JSON.stringify(credentials[0]?.metadata?.label)}`
  );
  check(
    'the stored value is encrypted, not the plaintext',
    credentials[0] &&
      !String(credentials[0].access_token).includes('second-value')
  );

  const listed = ganju(['secret', 'list']);
  check(
    '`ganju secret list` shows the name and never a value',
    listed.code === 0 &&
      listed.out.includes('PROBE_KEY') &&
      !listed.out.includes('second-value')
  );

  const removed = ganju(['secret', 'rm', 'PROBE_KEY']);
  const afterRemove =
    await sql`select count(*)::int as n from artifact_credential where artifact_id = ${artifactId} and provider = 'custom-code'`;
  check(
    '`ganju secret rm` deletes the row',
    removed.code === 0 && afterRemove[0].n === 0
  );

  // --- versions and rollback ---------------------------------------------
  section('versions and rollback');

  fs.writeFileSync(
    path.join(project, 'src/lib/shout.ts'),
    `export const shout = (value: string): string => value + '!';\n`
  );
  const second = ganju(['deploy']);
  check(
    'a second deploy publishes v-next',
    second.code === 0 && /v\d+ is live/.test(second.out)
  );

  const listVersions = ganju(['versions']);
  check(
    '`ganju versions` marks exactly one as live',
    listVersions.code === 0 &&
      (listVersions.out.match(/live/g) || []).length === 1,
    listVersions.out.trim().split('\n').filter(Boolean).length + ' rows'
  );

  const rolled = ganju(['rollback', '1']);
  check(
    '`ganju rollback 1` goes back',
    rolled.code === 0 && /rolled back to v1/.test(rolled.out)
  );

  const [afterRollback] =
    await sql`select config from artifact_tool where id = ${toolRow.id}`;
  check(
    'the pointer moved to the older version',
    afterRollback?.config?.activeVersionId === versions[0]?.id
  );

  const rollbackToLive = ganju(['rollback', '1']);
  check(
    'rolling back to what is already live is a no-op, not an error',
    rollbackToLive.code === 0 && /already live/.test(rollbackToLive.out)
  );

  // --- refusals ----------------------------------------------------------
  section('refusals');

  const reserved = JSON.parse(
    fs.readFileSync(path.join(project, 'ganju.json'), 'utf8')
  );
  reserved.tools = [{ ...ECHO_TOOL, name: 'gmail-send-email' }];
  fs.writeFileSync(
    path.join(project, 'ganju.json'),
    JSON.stringify(reserved, null, 2)
  );
  const reservedDeploy = ganju(['deploy']);
  check(
    'a reserved tool name is refused, and the CLI names the entry',
    reservedDeploy.code === 1 && /tools\.0\.name/.test(reservedDeploy.out),
    reservedDeploy.out.trim().split('\n').filter(Boolean).slice(-2).join(' / ')
  );

  await sql`update subscription set plan = 'FREE' where organization_id = ${orgId}`;
  const freeFile = JSON.parse(
    fs.readFileSync(path.join(project, 'ganju.json'), 'utf8')
  );
  freeFile.tools = [ECHO_TOOL];
  fs.writeFileSync(
    path.join(project, 'ganju.json'),
    JSON.stringify(freeFile, null, 2)
  );
  const onFree = ganju(['deploy']);
  check(
    'the plan gate refuses a deploy on FREE, with the reason',
    onFree.code === 1 && /paid|plan|402|Pro/i.test(onFree.out),
    onFree.out.trim().split('\n').filter(Boolean).slice(-2).join(' / ')
  );
  await sql`update subscription set plan = 'PRO' where organization_id = ${orgId}`;

  const loggedOut = ganju(['logout']);
  check('`ganju logout` forgets the token', loggedOut.code === 0);
  const afterLogout = ganju(['versions']);
  check(
    'and the next command says so instead of failing obscurely',
    afterLogout.code === 1 && /Not logged in/.test(afterLogout.out),
    afterLogout.out.trim().split('\n')[0]
  );
} catch (error) {
  console.error(`\nprobe aborted: ${error?.stack || error}`);
  fail++;
  failures.push('probe aborted');
} finally {
  section('cleanup');

  for (const name of [
    `artifact_${artifactId}`,
    `artifact_${artifactId}_preview`
  ]) {
    if (deployed || (await scriptExists(name))) {
      const del = await cf(
        `/workers/dispatch/namespaces/${NAMESPACE}/scripts/${name}?force=true`,
        { method: 'DELETE' }
      );
      console.log(`  removed ${name} (HTTP ${del.status})`);
    }
  }

  if (clientId) {
    await sql`delete from oauth_client where client_id = ${clientId}`;
  }
  await sql`delete from oauth_access_token where user_id = ${userId}`;
  await sql`delete from oauth_refresh_token where user_id = ${userId}`;
  await sql`delete from organization where id = ${orgId}`;
  await sql`delete from "user" where id = ${userId}`;
  const [orphan] =
    await sql`select count(*)::int as n from artifact where id = ${artifactId}`;
  console.log(`  rows removed, artifact rows left: ${orphan.n}`);
  fs.rmSync(workdir, { recursive: true, force: true });
  console.log(`  removed ${workdir}`);

  await sql.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) console.log(`failing: ${failures.join(' | ')}`);
  process.exit(fail ? 1 : 0);
}
