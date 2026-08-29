// Drives the dashboard's own API against the DEPLOYED development stack: the
// catalog-as-code route, the `enabled` flag, http-endpoint output schemas, and
// the whole Functions flow — draft, read the source back, test, publish,
// allowedTools, rollback, remove.
//
//   node scripts/probe-tools-dashboard.mjs
//
// The verify scripts beside this one call modules directly, so everything the
// dashboard actually talks to is unexercised by them: the session middleware,
// the routes, the R2 round trip, the dispatch namespace, and the MCP boot loop
// reading what was just written. This drives all of it — the API with a real
// signed session cookie, the assertions over the real MCP endpoint and the real
// database.
//
// It needs .env: DATABASE_URL, JWT_SECRET (which signs the session cookie),
// MCP_INTERNAL_SECRET, CLOUDFLARE_ACCOUNT_ID, CUSTOM_CODE_CF_API_TOKEN.
//
// Scaffolds a throwaway user + PRO organization + project + artifact and removes
// everything it created, including any script left in the dispatch namespace.
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

const API = 'https://development-api.vocesqueabrazan.com';
const MCP_ORIGIN = 'https://development-mcp.vocesqueabrazan.com';
const NAMESPACE = 'ganju-tools-development';

for (const [k, v] of Object.entries({
  DATABASE_URL,
  JWT_SECRET,
  MCP_INTERNAL_SECRET: MCP_SECRET,
  CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
  CUSTOM_CODE_CF_API_TOKEN: CF_TOKEN
})) {
  if (!v) throw new Error(`Missing ${k} in .env`);
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

// --- session cookie -------------------------------------------------------
// better-call signs a cookie as `${value}.${base64(hmac-sha256(value))}`.
const signCookie = value => {
  const sig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(value)
    .digest('base64');
  return encodeURIComponent(`${value}.${sig}`);
};

// --- scaffold -------------------------------------------------------------
const userId = uuid();
const orgId = uuid();
const projectId = uuid();
const artifactId = uuid();
const slug = `probe-dash-${Date.now().toString(36)}`;
const sessionToken = crypto.randomBytes(32).toString('base64url');

console.log(`\nScaffolding ${slug} (artifact ${artifactId})\n`);

const cf = async (path, init) => {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}${path}`,
    { ...init, headers: { authorization: `Bearer ${CF_TOKEN}` } }
  );
  return { status: res.status, body: await res.json().catch(() => null) };
};

// A GET on a script that is not in the namespace answers 200 with
// `result.script: null`, not 404 — so presence is that field, never the status.
// Reading the status instead reports every deleted script as still deployed.
const scriptExists = async name => {
  if (!name) return false;
  const res = await cf(
    `/workers/dispatch/namespaces/${NAMESPACE}/scripts/${name}`,
    { method: 'GET' }
  );
  return res.status === 200 && res.body?.result?.script != null;
};

// Every script this artifact owns. Names are minted per upload now, so the probe
// asks the namespace which ones exist rather than constructing them.
const artifactScripts = async () => {
  const res = await cf(
    `/workers/dispatch/namespaces/${NAMESPACE}/scripts?per_page=100`,
    { method: 'GET' }
  );
  return (res.body?.result ?? [])
    .map(entry => entry.script_name || entry.id)
    .filter(name => name && name.startsWith(`artifact_${artifactId}`));
};

// The name the published version records — the pointer the MCP boot loop
// dispatches to, read from the same column it reads.
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
  let body = null;
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
  if (payload.error)
    throw new Error(`MCP error: ${JSON.stringify(payload.error)}`);
  return payload.result;
};

const listTools = async () => {
  await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'probe', version: '1' }
  });
  const listed = await rpc('tools/list');
  return listed.tools || [];
};

const artifactBase = `/organization/${orgId}/project/${projectId}/artifact`;

const EDITOR_SOURCE = `import { createHandler, defineTool } from './ganju-sdk.js';

export default createHandler({
  'probe-echo': defineTool(async (input, ctx) => {
    ctx.log('probe-echo called with ' + input.word);
    return { word: input.word, length: input.word.length };
  }),
  'probe-bad-output': defineTool(async (input, ctx) => {
    ctx.log('returning a shape the schema does not allow');
    return { unexpected: true };
  })
});
`;

const MANIFEST = [
  {
    name: 'probe-echo',
    title: 'Probe echo',
    description: 'Echoes a word back with its length.',
    inputSchema: {
      type: 'object',
      properties: { word: { type: 'string' } },
      required: ['word']
    },
    outputSchema: {
      type: 'object',
      properties: { word: { type: 'string' }, length: { type: 'number' } },
      required: ['word', 'length']
    }
  },
  {
    name: 'probe-bad-output',
    title: 'Probe bad output',
    description: 'Returns something its output schema forbids.',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: {
      type: 'object',
      properties: { word: { type: 'string' } },
      required: ['word']
    }
  }
];

let deployed = false;
let previewSeen = false;

try {
  await sql`insert into "user" ${sql({
    id: userId,
    name: 'probe dashboard',
    email: `probe-dash-${Date.now()}@example.invalid`,
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
    name: 'probe-dashboard',
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

  // --- 1. auth + catalog as code -----------------------------------------
  section('the catalog, served from code');

  const catalog = await api('/catalog/tools');
  check(
    'GET /catalog/tools authenticates with a minted session',
    catalog.status === 200,
    String(catalog.status)
  );
  const groups = Array.isArray(catalog.body) ? catalog.body : [];
  const defs = groups.flatMap(g => g.tools || []);
  check('  ...12 groups', groups.length === 12, String(groups.length));
  check('  ...62 tools', defs.length === 62, String(defs.length));
  check(
    '  ...custom-code is offered (it was never seeded on production)',
    defs.some(d => d.key === 'custom-code')
  );
  const tablesGone =
    await sql`select to_regclass('tool_definition') as d, to_regclass('tool_group') as g`;
  check(
    '  ...and both catalog tables are gone from the database',
    tablesGone[0].d === null && tablesGone[0].g === null
  );

  const empty = await api(`${artifactBase}/tool`);
  check(
    'a fresh artifact lists no tools',
    empty.status === 200 && empty.body.length === 0
  );

  // --- 2. http-endpoint + outputSchema -----------------------------------
  section('http-endpoint output schemas');

  const endpointConfig = (name, extra = {}) => ({
    name,
    title: name,
    description: 'Cloudflare public IP ranges.',
    method: 'GET',
    url: 'https://api.cloudflare.com/client/v4/ips',
    headers: [],
    query: [],
    inputSchema: { type: 'object', properties: {} },
    auth: { kind: 'none' },
    ...extra
  });

  const okEndpoint = await api(`${artifactBase}/tool`, {
    method: 'POST',
    body: JSON.stringify({
      toolKey: 'http-endpoint',
      config: endpointConfig('probe-cf-ips', {
        response: { contentType: 'auto', jsonPath: 'result' },
        outputSchema: {
          type: 'object',
          properties: { ipv4_cidrs: { type: 'array' } }
        }
      })
    })
  });
  check(
    'an endpoint declaring an object output schema installs',
    okEndpoint.status === 200,
    JSON.stringify(okEndpoint.body).slice(0, 160)
  );
  const endpointToolId = okEndpoint.body?.id;

  const arrayEndpoint = await api(`${artifactBase}/tool`, {
    method: 'POST',
    body: JSON.stringify({
      toolKey: 'http-endpoint',
      config: endpointConfig('probe-array-schema', {
        outputSchema: { type: 'array' }
      })
    })
  });
  check(
    'an output schema that is not an object is refused with 400',
    arrayEndpoint.status === 400,
    String(arrayEndpoint.status)
  );
  check(
    '  ...with the reason, not an opaque 500',
    /output schema/i.test(JSON.stringify(arrayEndpoint.body)),
    JSON.stringify(arrayEndpoint.body).slice(0, 140)
  );

  const reserved = await api(`${artifactBase}/tool`, {
    method: 'POST',
    body: JSON.stringify({
      toolKey: 'http-endpoint',
      config: endpointConfig('send-resource')
    })
  });
  check(
    'a reserved name is still refused with 400',
    reserved.status === 400,
    String(reserved.status)
  );

  // an endpoint whose jsonPath yields an ARRAY while declaring an object schema
  const guardEndpoint = await api(`${artifactBase}/tool`, {
    method: 'POST',
    body: JSON.stringify({
      toolKey: 'http-endpoint',
      config: endpointConfig('probe-cf-cidrs', {
        response: { contentType: 'auto', jsonPath: 'result.ipv4_cidrs' },
        outputSchema: {
          type: 'object',
          properties: { any: { type: 'string' } }
        }
      })
    })
  });
  check(
    'a second endpoint installs (Free cap does not apply on PRO)',
    guardEndpoint.status === 200,
    String(guardEndpoint.status)
  );

  let tools = await listTools();
  const cfIps = tools.find(t => t.name === 'probe-cf-ips');
  check('the endpoint registers on the MCP server', !!cfIps);
  check(
    '  ...carrying its outputSchema',
    !!cfIps?.outputSchema,
    JSON.stringify(cfIps?.outputSchema || {}).slice(0, 80)
  );
  const noSchema = tools.find(t => t.name === 'greeting');
  check(
    '  ...and a native tool without one still has none',
    !noSchema?.outputSchema
  );

  const called = await rpc('tools/call', {
    name: 'probe-cf-ips',
    arguments: {}
  });
  check(
    'calling it returns structuredContent',
    !!called.structuredContent && typeof called.structuredContent === 'object',
    Object.keys(called.structuredContent || {})
      .join(',')
      .slice(0, 80)
  );
  check(
    '  ...and the text representation is still there',
    !!called.content?.[0]?.text
  );

  const guarded = await rpc('tools/call', {
    name: 'probe-cf-cidrs',
    arguments: {}
  });
  check(
    'an array response against a declared object schema is an error, not a protocol failure',
    guarded.isError === true,
    String(guarded.content?.[0]?.text || '').slice(0, 100)
  );

  // --- 3. the enabled flag ------------------------------------------------
  section('turning a tool off without deleting it');

  const [before] =
    await sql`select artifact_tool_count from artifact where id = ${artifactId}`;

  const off = await api(`${artifactBase}/tool/${endpointToolId}/enabled`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled: false })
  });
  check('PATCH …/enabled answers 200', off.status === 200, String(off.status));
  check(
    '  ...the row and its config survive',
    !!off.body?.config?.name,
    off.body?.config?.name
  );

  const [afterOff] =
    await sql`select artifact_tool_count from artifact where id = ${artifactId}`;
  check(
    '  ...and the tool quota gives the slot back',
    Number(afterOff.artifact_tool_count) ===
      Number(before.artifact_tool_count) - 1,
    `${before.artifact_tool_count} → ${afterOff.artifact_tool_count}`
  );

  tools = await listTools();
  check(
    'a disabled tool does not register at boot',
    !tools.some(t => t.name === 'probe-cf-ips')
  );
  check(
    '  ...while the other one still does',
    tools.some(t => t.name === 'probe-cf-cidrs')
  );

  const again = await api(`${artifactBase}/tool/${endpointToolId}/enabled`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled: false })
  });
  const [afterIdem] =
    await sql`select artifact_tool_count from artifact where id = ${artifactId}`;
  check(
    'asking for the state it is already in is idempotent',
    again.status === 200 &&
      Number(afterIdem.artifact_tool_count) ===
        Number(afterOff.artifact_tool_count),
    String(afterIdem.artifact_tool_count)
  );

  await api(`${artifactBase}/tool/${endpointToolId}/enabled`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled: true })
  });
  tools = await listTools();
  check(
    're-enabling brings it back',
    tools.some(t => t.name === 'probe-cf-ips')
  );

  // --- 4. the Functions flow ---------------------------------------------
  section('functions: draft → source → test → deploy');

  const ccBase = `${artifactBase}/custom-code`;

  const created = await api(`${ccBase}/version`, {
    method: 'POST',
    body: JSON.stringify({ manifest: { tools: MANIFEST } })
  });
  check(
    'a draft version is created from the manifest',
    created.status === 200 && !!created.body?.id,
    JSON.stringify(created.body).slice(0, 160)
  );
  const versionId = created.body?.id;
  if (!versionId) throw new Error('no version to continue with');

  const uploaded = await api(
    `${ccBase}/version/${versionId}/bundle?kind=editor`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/javascript' },
      body: EDITOR_SOURCE
    }
  );
  check(
    'the editor source uploads',
    uploaded.status === 200,
    JSON.stringify(uploaded.body).slice(0, 160)
  );
  check(
    '  ...marked editor-authored',
    uploaded.body?.sourceKind === 'editor',
    uploaded.body?.sourceKind
  );

  const source = await api(`${ccBase}/version/${versionId}/source`);
  check('the source reads back', source.status === 200);
  check('  ...byte for byte', source.body?.source === EDITOR_SOURCE);
  check('  ...as editable', source.body?.editable === true);
  check('  ...with the manifest attached', source.body?.tools?.length === 2);

  const badInput = await api(`${ccBase}/version/${versionId}/test`, {
    method: 'POST',
    body: JSON.stringify({ tool: 'probe-echo', input: { word: 42 } })
  });
  check(
    'an input the schema refuses never reaches a deploy',
    badInput.status === 200 &&
      badInput.body?.ran === false &&
      badInput.body?.inputViolations?.length > 0,
    JSON.stringify(badInput.body).slice(0, 160)
  );

  const run = await api(`${ccBase}/version/${versionId}/test`, {
    method: 'POST',
    body: JSON.stringify({ tool: 'probe-echo', input: { word: 'hello' } })
  });
  check(
    'a draft runs without being published',
    run.status === 200 && run.body?.ran === true,
    JSON.stringify(run.body).slice(0, 200)
  );
  check(
    '  ...returning the tool output',
    run.body?.output?.length === 5,
    JSON.stringify(run.body?.output)
  );
  check(
    '  ...with ctx.log lines',
    (run.body?.logs || []).some(l =>
      l.includes('probe-echo called with hello')
    ),
    JSON.stringify(run.body?.logs)
  );
  check(
    '  ...and no output violations',
    (run.body?.outputViolations || []).length === 0
  );
  check('  ...timed', typeof run.body?.durationMs === 'number');

  const [liveDuringTest] =
    await sql`select config from artifact_tool where artifact_id = ${artifactId} and tool_key = 'custom-code'`;
  check(
    '  ...and the live pointer is untouched by a test',
    (liveDuringTest?.config?.activeVersionId ?? null) === null
  );

  const badOutput = await api(`${ccBase}/version/${versionId}/test`, {
    method: 'POST',
    body: JSON.stringify({ tool: 'probe-bad-output', input: {} })
  });
  check(
    'an output that breaks its declared schema is reported',
    badOutput.body?.ran === true &&
      (badOutput.body?.outputViolations || []).length > 0,
    JSON.stringify(badOutput.body?.outputViolations || []).slice(0, 160)
  );

  previewSeen = (await artifactScripts()).some(name =>
    name.includes('_preview')
  );
  check('the preview script is deleted after the run', previewSeen === false);

  const published = await api(`${ccBase}/version/${versionId}/publish`, {
    method: 'POST'
  });
  check(
    'publish deploys and flips the pointer',
    published.status === 200,
    JSON.stringify(published.body).slice(0, 200)
  );
  deployed = published.status === 200;

  const [afterPublish] =
    await sql`select config from artifact_tool where artifact_id = ${artifactId} and tool_key = 'custom-code'`;
  check(
    '  ...activeVersionId now names the version',
    afterPublish?.config?.activeVersionId === versionId
  );

  check(
    '  ...and the script is really in the dispatch namespace, under the name the version records',
    await scriptExists(await liveScriptName())
  );

  tools = await listTools();
  check(
    'both manifest tools register at boot',
    ['probe-echo', 'probe-bad-output'].every(n => tools.some(t => t.name === n))
  );
  const echoTool = tools.find(t => t.name === 'probe-echo');
  check('  ...with the declared outputSchema', !!echoTool?.outputSchema);

  const echoed = await rpc('tools/call', {
    name: 'probe-echo',
    arguments: { word: 'dispatch' }
  });
  check(
    'calling a published function through MCP works',
    echoed.structuredContent?.length === 8,
    JSON.stringify(
      echoed.structuredContent || echoed.content?.[0]?.text || ''
    ).slice(0, 120)
  );

  const [usage] = await sql`
    select r.tool_name, r.artifact_tool_id from mcp_request r
    join artifact_tool t on t.id = r.artifact_tool_id
    where t.artifact_id = ${artifactId} and r.tool_name = 'probe-echo'
    order by r.created_at desc limit 1`;
  check(
    '  ...recorded on mcp_request with the parent install',
    !!usage?.artifact_tool_id,
    usage?.tool_name
  );

  // --- 5. allowedTools ----------------------------------------------------
  section('turning off one function without a redeploy');

  const [ccRow] =
    await sql`select id, config from artifact_tool where artifact_id = ${artifactId} and tool_key = 'custom-code'`;
  const narrowed = await api(`${artifactBase}/tool/${ccRow.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      config: { ...ccRow.config, allowedTools: ['probe-echo'] }
    })
  });
  check(
    'allowedTools saves through the generic tool route',
    narrowed.status === 200,
    JSON.stringify(narrowed.body).slice(0, 160)
  );
  check(
    '  ...without letting the request move activeVersionId',
    narrowed.body?.config?.activeVersionId === versionId,
    String(narrowed.body?.config?.activeVersionId)
  );

  tools = await listTools();
  check(
    'only the allowed function registers',
    tools.some(t => t.name === 'probe-echo') &&
      !tools.some(t => t.name === 'probe-bad-output')
  );

  await api(`${artifactBase}/tool/${ccRow.id}`, {
    method: 'PUT',
    body: JSON.stringify({ config: { ...ccRow.config, allowedTools: [] } })
  });
  tools = await listTools();
  check(
    'an empty allow-list means all of them again',
    ['probe-echo', 'probe-bad-output'].every(n => tools.some(t => t.name === n))
  );

  // --- 6. a second version, and rollback ----------------------------------
  section('a second version, and rollback');

  const v2 = await api(`${ccBase}/version`, {
    method: 'POST',
    body: JSON.stringify({ manifest: { tools: [MANIFEST[0]] } })
  });
  await api(`${ccBase}/version/${v2.body.id}/bundle?kind=editor`, {
    method: 'PUT',
    headers: { 'content-type': 'application/javascript' },
    body: EDITOR_SOURCE
  });
  const publishedV2 = await api(`${ccBase}/version/${v2.body.id}/publish`, {
    method: 'POST'
  });
  check(
    'a second version publishes',
    publishedV2.status === 200,
    JSON.stringify(publishedV2.body).slice(0, 160)
  );

  tools = await listTools();
  check(
    '  ...and the tool list follows the manifest down to one',
    tools.some(t => t.name === 'probe-echo') &&
      !tools.some(t => t.name === 'probe-bad-output')
  );

  const rolledBack = await api(`${ccBase}/version/${versionId}/rollback`, {
    method: 'POST'
  });
  check(
    'rollback answers 200',
    rolledBack.status === 200,
    JSON.stringify(rolledBack.body).slice(0, 160)
  );

  tools = await listTools();
  check(
    '  ...and both tools come back',
    ['probe-echo', 'probe-bad-output'].every(n => tools.some(t => t.name === n))
  );

  const versions = await api(`${ccBase}/versions`);
  check(
    'the version list carries both',
    versions.body?.versions?.length === 2,
    String(versions.body?.versions?.length)
  );
  check(
    '  ...and names the active one after the rollback',
    versions.body?.activeVersionId === versionId,
    String(versions.body?.activeVersionId)
  );

  // --- 7. the plan gate ---------------------------------------------------
  section('the plan gate');

  await sql`update subscription set plan = 'FREE' where organization_id = ${orgId}`;

  const freeTest = await api(`${ccBase}/version/${versionId}/test`, {
    method: 'POST',
    body: JSON.stringify({ tool: 'probe-echo', input: { word: 'hi' } })
  });
  check(
    'a downgraded org cannot run a test',
    freeTest.status === 402,
    String(freeTest.status)
  );

  const freeVersion = await api(`${ccBase}/version`, {
    method: 'POST',
    body: JSON.stringify({ manifest: { tools: [MANIFEST[0]] } })
  });
  check(
    '  ...nor create a version, even though the row already exists',
    freeVersion.status === 402,
    String(freeVersion.status)
  );

  const freeUpload = await api(
    `${ccBase}/version/${versionId}/bundle?kind=editor`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/javascript' },
      body: EDITOR_SOURCE
    }
  );
  check(
    '  ...nor upload code to an existing draft',
    freeUpload.status === 402,
    String(freeUpload.status)
  );

  // Publish and rollback resolve the tool read-only, so they carry their own
  // plan check rather than inheriting one. Without it a downgraded org goes on
  // deploying from the versions it already holds.
  const freePublish = await api(`${ccBase}/version/${v2.body.id}/publish`, {
    method: 'POST'
  });
  check(
    '  ...nor publish one',
    freePublish.status === 402,
    String(freePublish.status)
  );

  const freeRollback = await api(`${ccBase}/version/${versionId}/rollback`, {
    method: 'POST'
  });
  check(
    '  ...nor roll one back',
    freeRollback.status === 402,
    String(freeRollback.status)
  );

  const previewAfterRefusal = (await artifactScripts()).some(name =>
    name.includes('_preview')
  );
  check(
    '  ...and a refused test leaves no preview script behind',
    previewAfterRefusal === false
  );

  // Free's http-endpoint cap is 3, and two are installed.
  const third = await api(`${artifactBase}/tool`, {
    method: 'POST',
    body: JSON.stringify({
      toolKey: 'http-endpoint',
      config: endpointConfig('probe-third')
    })
  });
  check(
    'the third endpoint still installs on FREE',
    third.status === 200,
    String(third.status)
  );
  const fourth = await api(`${artifactBase}/tool`, {
    method: 'POST',
    body: JSON.stringify({
      toolKey: 'http-endpoint',
      config: endpointConfig('probe-fourth')
    })
  });
  check(
    '  ...and the fourth is refused by the cap',
    fourth.status === 402,
    JSON.stringify(fourth.body).slice(0, 140)
  );

  // A disabled endpoint must not free a slot in that cap.
  await api(`${artifactBase}/tool/${endpointToolId}/enabled`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled: false })
  });
  const fourthAgain = await api(`${artifactBase}/tool`, {
    method: 'POST',
    body: JSON.stringify({
      toolKey: 'http-endpoint',
      config: endpointConfig('probe-fourth')
    })
  });
  check(
    '  ...and disabling one does not buy another (the cap counts rows)',
    fourthAgain.status === 402,
    String(fourthAgain.status)
  );

  // --- 8. removal ---------------------------------------------------------
  section('removal');

  const removed = await api(`${artifactBase}/tool/${ccRow.id}`, {
    method: 'DELETE'
  });
  check(
    'removing the custom-code row answers 200',
    removed.status === 200,
    String(removed.status)
  );
  // Plural: uninstalling reads every version's recorded name and deletes each,
  // because one artifact now owns one script per publish rather than one script.
  const stillThere = (await artifactScripts()).length > 0;
  check(
    '  ...and every script it owned leaves the dispatch namespace',
    stillThere === false
  );
  if (!stillThere) deployed = false;

  const leftover =
    await sql`select count(*)::int as n from artifact_tool_version where artifact_tool_id = ${ccRow.id}`;
  check(
    '  ...taking its versions with it',
    leftover[0].n === 0,
    String(leftover[0].n)
  );
} catch (error) {
  fail++;
  failures.push(`threw: ${error.message}`);
  console.error('\n  THREW', error);
} finally {
  section('cleanup');
  if (deployed || previewSeen) {
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
  const [orphan] =
    await sql`select count(*)::int as n from artifact where id = ${artifactId}`;
  console.log(`  rows removed, artifact rows left: ${orphan.n}`);
  await sql.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) console.log(`failing: ${failures.join(' | ')}`);
  process.exit(fail ? 1 : 0);
}
