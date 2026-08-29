// Does a redeploy over an existing script actually serve the new code?
//
//   npm run dev -w api          # in another terminal
//   node scripts/probe-redeploy.mjs
//
// The case every other probe misses by construction. They scaffold a throwaway
// artifact, so the script name is new and there is no previous edition for the
// dispatcher to serve — which is why publishing has always looked instantaneous.
// A real customer redeploy overwrites a name that already exists, and uploading
// into a dispatch namespace is not read-your-writes.
//
// So this deploys twice to the same artifact and checks the second one, in the
// two shapes that fail differently:
//
//   1. renamed tools  — the old smoke test caught this, as a confusing
//                       "the bundle does not export …"
//   2. same tool name, different code — the old smoke test PASSED this against
//                       the previous edition and published, and the customer ran
//                       code they did not deploy until propagation caught up
//
// The second is the reason the version marker exists. It needs a real dispatch
// namespace, so it drives the deployed publish path through a local API.
import fs from 'node:fs';
import crypto from 'node:crypto';
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
  if (!name) return false;
  const res = await cf(
    `/workers/dispatch/namespaces/${NAMESPACE}/scripts/${name}`,
    { method: 'GET' }
  );
  return res.status === 200 && res.body?.result?.script != null;
};

// Every script this artifact owns. A name is minted per upload now, so the probe
// cannot construct the names it is asserting about — it has to ask the namespace
// which ones exist, and the database which one is live.
const artifactScripts = async () => {
  const res = await cf(
    `/workers/dispatch/namespaces/${NAMESPACE}/scripts?per_page=100`,
    { method: 'GET' }
  );
  return (res.body?.result ?? [])
    .map(entry => entry.script_name || entry.id)
    .filter(name => name && name.startsWith(`artifact_${artifactId}`));
};

// The name the currently published version records — the pointer the MCP boot
// loop dispatches to, read from the same column it reads.
const liveScriptName = async () => {
  const [row] = await sql`
    select v.script_name
      from artifact_tool_version v
      join artifact_tool t on t.id = v.artifact_tool_id
     where t.artifact_id = ${artifactId}
       and v.status = 'published'
     limit 1
  `;
  return row?.script_name ?? null;
};

const userId = uuid();
const orgId = uuid();
const projectId = uuid();
const artifactId = uuid();
const slug = `probe-redeploy-${Date.now().toString(36)}`;
const sessionToken = crypto.randomBytes(32).toString('base64url');

let cookieHeader = '';
const api = async (path, init = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      cookie: cookieHeader,
      ...(init.body && !init.headers
        ? { 'content-type': 'application/json' }
        : {}),
      ...(init.headers || {})
    }
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
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
  if (payload.error) throw new Error(JSON.stringify(payload.error));
  return payload.result;
};

const callTool = async (name, args) => {
  await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'probe-redeploy', version: '1' }
  });
  return rpc('tools/call', { name, arguments: args ?? {} });
};

const base = `/organization/${orgId}/project/${projectId}/artifact`;

/** One full deploy: create the version, attach the bundle, publish. */
const deploy = async (tools, source) => {
  const created = await api(`${base}/custom-code/version`, {
    method: 'POST',
    body: JSON.stringify({ manifest: { tools } })
  });
  if (created.status !== 200) {
    return { step: 'create', ...created };
  }
  const uploaded = await api(
    `${base}/custom-code/version/${created.body.id}/bundle`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/javascript' },
      body: source
    }
  );
  if (uploaded.status !== 200) return { step: 'upload', ...uploaded };

  const started = Date.now();
  const published = await api(
    `${base}/custom-code/version/${created.body.id}/publish`,
    { method: 'POST' }
  );
  return {
    step: 'publish',
    ...published,
    versionId: created.body.id,
    version: created.body.version,
    ms: Date.now() - started
  };
};

const handlerReturning = (
  toolName,
  marker
) => `import { createHandler, defineTool } from './ganju-sdk.js';

export default createHandler({
  '${toolName}': defineTool(async () => ({ marker: '${marker}' }))
});
`;

const TOOL = name => [
  {
    name,
    title: name,
    inputSchema: { type: 'object', properties: {} },
    outputSchema: {
      type: 'object',
      properties: { marker: { type: 'string' } }
    }
  }
];

let deployed = false;

try {
  console.log(`\nScaffolding ${slug} (artifact ${artifactId})\n`);

  await sql`insert into "user" ${sql({
    id: userId,
    name: 'probe redeploy',
    email: `probe-redeploy-${Date.now()}@example.invalid`,
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
    name: 'probe-redeploy',
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

  const signed = signCookie(sessionToken);
  cookieHeader = `__Secure-better-auth.session_token=${signed}; better-auth.session_token=${signed}`;

  // --- 0. a first publish that fails has nothing to restore to ------------
  section('a rejected FIRST publish, with no previous script to fall back on');

  const rejectedFirst = await deploy(
    TOOL('probe-never-live'),
    handlerReturning('probe-something-else', 'ZERO')
  );
  deployed = true;
  check(
    'refused',
    rejectedFirst.status === 400,
    `HTTP ${rejectedFirst.status}`
  );
  // Nothing was live before, so `activeVersionId` is still null and the honest
  // namespace state is empty. Leaving the rejected bundle would mean an artifact
  // advertising no tools while holding a script nobody asked for.
  check(
    'and left no script pointed at, matching an artifact with no active version',
    (await liveScriptName()) === null
  );

  // --- 1. the first deploy, which every other probe already covers ---------
  section('first deploy — a script name that does not exist yet');

  const first = await deploy(
    TOOL('probe-marker'),
    handlerReturning('probe-marker', 'FIRST')
  );
  check(
    'publishes',
    first.status === 200,
    first.status === 200
      ? `v${first.version} in ${first.ms}ms`
      : JSON.stringify(first.body)
  );
  deployed = true;

  const firstCall = await callTool('probe-marker');
  check(
    'and serves its code',
    firstCall?.structuredContent?.marker === 'FIRST',
    JSON.stringify(firstCall?.structuredContent)
  );

  // --- 2. the case the version marker exists for --------------------------
  section('redeploy — same tool name, different code');

  const second = await deploy(
    TOOL('probe-marker'),
    handlerReturning('probe-marker', 'SECOND')
  );
  check(
    'publishes',
    second.status === 200,
    second.status === 200
      ? `v${second.version} in ${second.ms}ms`
      : JSON.stringify(second.body)
  );

  // The whole point. Before the version marker the smoke test asked "do you
  // export probe-marker", the OLD edition said yes, and publish went through
  // with the customer still being served FIRST.
  const secondCall = await callTool('probe-marker');
  check(
    'the dispatcher serves the code that was just published, not the previous edition',
    secondCall?.structuredContent?.marker === 'SECOND',
    `marker=${secondCall?.structuredContent?.marker}`
  );

  // --- 3. the shape that used to fail loudly ------------------------------
  section('redeploy — renamed tool');

  const third = await deploy(
    TOOL('probe-renamed'),
    handlerReturning('probe-renamed', 'THIRD')
  );
  check(
    'publishes rather than failing with "the bundle does not export …"',
    third.status === 200,
    third.status === 200
      ? `v${third.version} in ${third.ms}ms`
      : JSON.stringify(third.body)
  );

  const listed = await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'probe-redeploy', version: '1' }
  }).then(() => rpc('tools/list'));
  check(
    'and the renamed tool is what an MCP client now sees',
    (listed.tools ?? []).some(t => t.name === 'probe-renamed') &&
      !(listed.tools ?? []).some(t => t.name === 'probe-marker'),
    (listed.tools ?? []).map(t => t.name).join(', ')
  );

  const thirdCall = await callTool('probe-renamed');
  check(
    'serving the third deploy',
    thirdCall?.structuredContent?.marker === 'THIRD',
    `marker=${thirdCall?.structuredContent?.marker}`
  );

  // --- 4. a manifest that really is wrong still fails --------------------
  section('the check the wait must not have weakened');

  const mismatched = await deploy(
    TOOL('probe-not-exported'),
    handlerReturning('probe-something-else', 'FOURTH')
  );
  check(
    'a bundle that genuinely does not export what it declares is refused',
    mismatched.status !== 200 &&
      /does not export/.test(JSON.stringify(mismatched.body)),
    `HTTP ${mismatched.status} — ${JSON.stringify(mismatched.body).slice(0, 120)}`
  );
  check(
    'and says so with a usable status rather than an opaque 500',
    mismatched.status === 400,
    `HTTP ${mismatched.status}`
  );

  const active = await api(`${base}/custom-code/versions`);
  const stillActive = (active.body.versions ?? []).find(
    v => v.id === active.body.activeVersionId
  );
  check(
    'the failed publish did not move the active version',
    stillActive?.version === third.version,
    `active is v${stillActive?.version}, published was v${third.version}`
  );

  // The other half of refusing, and it is now free. Publishing still has to
  // upload before it can check what a script exports — the only way to ask is to
  // deploy and call — but the upload goes to a name of its own, so the live
  // script was never touched and there is nothing to put back. This used to be a
  // restore that could itself fail; it is now a property of where the bytes went.
  const stillThird = await callTool('probe-renamed');
  check(
    'the rejected publish left the previously deployed script serving',
    stillThird?.structuredContent?.marker === 'THIRD',
    `marker=${stillThird?.structuredContent?.marker}`
  );
  const fourth = await deploy(
    TOOL('probe-marker'),
    handlerReturning('probe-marker', 'FIFTH')
  );
  check(
    'and a correct publish still works immediately afterwards',
    fourth.status === 200,
    fourth.status === 200
      ? `v${fourth.version} in ${fourth.ms}ms`
      : JSON.stringify(fourth.body)
  );
  const fifthCall = await callTool('probe-marker');
  check(
    'serving the recovered deploy',
    fifthCall?.structuredContent?.marker === 'FIFTH',
    `marker=${fifthCall?.structuredContent?.marker}`
  );

  // --- 5. the test path, sharper than publish -----------------------------
  //
  // Every test of one draft uploads to the same preview script name, so the
  // stale-edition race is not an edge case here — it is what a second test is.
  // And a draft is re-uploaded in place, so its version id is the same string
  // before and after an edit: a marker made of the version id would match the
  // previous run's script on the first probe and report the previous run's
  // behaviour as this run's. The marker is the digest of the bytes for exactly
  // this reason.
  section('test — one draft, edited between runs');

  const draft = await api(`${base}/custom-code/version`, {
    method: 'POST',
    body: JSON.stringify({ manifest: { tools: TOOL('probe-draft') } })
  });
  check(
    'a draft is created to test against',
    draft.status === 200,
    draft.status === 200 ? `v${draft.body.version}` : JSON.stringify(draft.body)
  );

  const editDraft = marker =>
    api(`${base}/custom-code/version/${draft.body.id}/bundle`, {
      method: 'PUT',
      headers: { 'content-type': 'application/javascript' },
      body: handlerReturning('probe-draft', marker)
    });
  const runDraft = () =>
    api(`${base}/custom-code/version/${draft.body.id}/test`, {
      method: 'POST',
      body: JSON.stringify({ tool: 'probe-draft', input: {} })
    });

  await editDraft('DRAFT-A');
  const ranA = await runDraft();
  check(
    'the first test runs the uploaded code',
    ranA.body?.output?.marker === 'DRAFT-A',
    `marker=${ranA.body?.output?.marker} (HTTP ${ranA.status})`
  );

  await editDraft('DRAFT-B');
  const ranB = await runDraft();
  check(
    "the second test runs the edit, not the previous run's code",
    ranB.body?.output?.marker === 'DRAFT-B',
    `marker=${ranB.body?.output?.marker} (HTTP ${ranB.status})`
  );

  check(
    'and no preview script is left behind',
    (await artifactScripts()).every(name => !name.includes('_preview'))
  );

  // The live artifact is untouched by any of that: a test deploys to its own
  // script name, and the wait added to the test path must not have changed
  // which script MCP clients reach.
  const afterTests = await callTool('probe-marker');
  check(
    'and testing did not disturb what is being served',
    afterTests?.structuredContent?.marker === 'FIFTH',
    `marker=${afterTests?.structuredContent?.marker}`
  );
} catch (error) {
  console.error(`\nprobe aborted: ${error?.stack || error}`);
  fail++;
  failures.push('probe aborted');
} finally {
  section('cleanup');
  // Listed rather than constructed: one publish leaves one script, and this
  // probe deliberately publishes several times.
  if (deployed) {
    for (const name of await artifactScripts()) {
      const del = await cf(
        `/workers/dispatch/namespaces/${NAMESPACE}/scripts/${name}?force=true`,
        { method: 'DELETE' }
      );
      console.log(`  removed ${name} (HTTP ${del.status})`);
    }
  }
  await sql`delete from organization where id = ${orgId}`;
  await sql`delete from "user" where id = ${userId}`;
  await sql.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) console.log(`failing: ${failures.join(' | ')}`);
  process.exit(fail ? 1 : 0);
}
