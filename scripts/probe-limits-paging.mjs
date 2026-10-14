// Drives the per-tool plan limit and large-output paging against the DEPLOYED
// development stack.
//
//   node scripts/probe-limits-paging.mjs
//
// It needs .env: DATABASE_URL, JWT_SECRET (which signs the session cookie),
// MCP_INTERNAL_SECRET, CLOUDFLARE_ACCOUNT_ID, CUSTOM_CODE_CF_API_TOKEN.
//
// Scaffolds a throwaway user + organization + project + artifact and removes
// everything it created, including the custom-code script it deploys.
//
//  1. FREE (7 tools): an MCP-server install worth 10 tools. Its discovery is
//     written to the row directly, as if GitHub had answered — dev has no
//     server it can proxy to without a token — so install-time discovery and a
//     proxy edit are not driven here; enabling, installing next to it and the
//     Tool health count are.
//  2. PRO: list-resources over 230 resources by cursor; HTTP endpoints whose
//     JSON is past the response budget (cut after parsing, jsonPath applied to
//     the whole body, the next-page key named); a custom-code tool whose output
//     is past it.
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
for (const [k, v] of Object.entries({
  DATABASE_URL,
  JWT_SECRET,
  MCP_INTERNAL_SECRET: MCP_SECRET,
  CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
  CUSTOM_CODE_CF_API_TOKEN: CF_TOKEN
})) {
  if (!v) throw new Error(`Missing ${k} in .env`);
}

const API = 'https://development-api.vocesqueabrazan.com';
const MCP_ORIGIN = 'https://development-mcp.vocesqueabrazan.com';
const NAMESPACE = 'ganju-tools-development';

const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1, prepare: false });

let pass = 0;
let fail = 0;
const failures = [];
const check = (label, ok, extra = '') => {
  if (ok) pass++;
  else {
    fail++;
    failures.push(label);
  }
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ` — ${extra}` : ''}`
  );
};
const section = title => console.log(`\n${title}\n`);

const signCookie = value => {
  const sig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(value)
    .digest('base64');
  return encodeURIComponent(`${value}.${sig}`);
};

const stamp = Date.now().toString(36);
const userId = uuid();
const orgId = uuid();
const projectId = uuid();
const artifactId = uuid();
const slug = `probe-limits-${stamp}`;
const sessionToken = crypto.randomBytes(32).toString('base64url');
const signed = signCookie(sessionToken);
const cookie = `__Secure-better-auth.session_token=${signed}; better-auth.session_token=${signed}`;

const api = async (path, init = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      cookie,
      origin: API,
      ...(init.body && !init.headers?.['content-type']
        ? { 'content-type': 'application/json' }
        : {}),
      ...(init.headers || {})
    }
  });
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body };
};

const cf = async (path, init) => {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}${path}`,
    { ...init, headers: { authorization: `Bearer ${CF_TOKEN}` } }
  );
  return { status: res.status, body: await res.json().catch(() => null) };
};
const artifactScripts = async () => {
  const res = await cf(
    `/workers/dispatch/namespaces/${NAMESPACE}/scripts?per_page=100`,
    { method: 'GET' }
  );
  return (res.body?.result ?? [])
    .map(entry => entry.script_name || entry.id)
    .filter(name => name && name.startsWith(`artifact_${artifactId}`));
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
const initialize = () =>
  rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'probe-limits', version: '1' }
  });
const callTool = (name, args = {}) =>
  rpc('tools/call', { name, arguments: args });
const textOf = result =>
  (result?.content || []).map(b => b.text || '').join('\n');
// Tool results may come back labelled as outside content.
const unwrap = text =>
  text
    .replace(/^<untrusted_content[^>]*>\n?/, '')
    .replace(/\n?<\/untrusted_content>$/, '');

const base = `/organization/${orgId}/project/${projectId}/artifact`;
const setPlan = plan =>
  sql`update subscription set plan = ${plan} where organization_id = ${orgId}`;

// A real catalog entry, so the boot loop parses the row; it never connects,
// since registration reads the stored discovery.
let catalogId = null;
const proxyRow = (toolCount, allowedTools) => ({
  id: uuid(),
  tool_key: 'mcp-proxy',
  enabled: false,
  artifact_id: artifactId,
  config: {
    curatedServerId: catalogId,
    prefix: `probe${toolCount}`,
    url: 'https://example.invalid/mcp',
    transport: 'streamable-http',
    auth: { kind: 'none' },
    allowedTools,
    allowedResources: [],
    allowedPrompts: []
  },
  metadata: {
    discovery: {
      discoveredAt: new Date().toISOString(),
      serverInfo: { name: 'probe', version: '1' },
      tools: Array.from({ length: toolCount }, (_, i) => ({
        name: `remote_tool_${i}`,
        description: `Remote tool ${i}`,
        inputSchema: { type: 'object', properties: {} }
      })),
      resources: [],
      prompts: []
    }
  }
});
const insertTool = row => sql`insert into artifact_tool ${sql(row)}`;
const setEnabled = (id, enabled) =>
  api(`${base}/tool/${id}/enabled`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled })
  });
const addTool = (toolKey, config) =>
  api(`${base}/tool`, {
    method: 'POST',
    body: JSON.stringify({ toolKey, ...(config ? { config } : {}) })
  });
const health = () =>
  api(
    `/organization/${orgId}/project/${projectId}/observability/tools?days=30`
  );

let deployed = false;

console.log(`\ndevelopment — scaffolding ${slug} (artifact ${artifactId})\n`);

try {
  await sql`insert into "user" ${sql({ id: userId, name: 'probe limits', email: `probe-limits-${stamp}@example.invalid`, email_verified: true })}`;
  await sql`insert into session ${sql({ id: uuid(), user_id: userId, token: sessionToken, expires_at: new Date(Date.now() + 3600_000) })}`;
  await sql`insert into organization ${sql({ id: orgId, name: 'probe-limits-paging', owner_id: userId })}`;
  await sql`insert into organization_user ${sql({ organization_id: orgId, user_id: userId, role: 'ADMIN' })}`;
  await sql`insert into subscription ${sql({
    id: uuid(),
    organization_id: orgId,
    plan: 'FREE',
    status: 'active',
    message_period_start: new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
    )
  })}`;
  await sql`insert into project ${sql({ id: projectId, name: 'probe limits', created_by_id: userId, organization_id: orgId })}`;
  await sql`insert into project_user ${sql({ user_id: userId, project_id: projectId, role: 'ADMIN' })}`;
  await sql`insert into artifact ${sql({ id: artifactId, slug, project_id: projectId })}`;

  // --- 1. the tool limit counts proxied tools ------------------------------
  section('FREE: an MCP server counts as the tools it allows (limit 7)');

  [{ id: catalogId }] =
    await sql`select id from mcp_server_catalog where slug = 'github'`;
  const all10 = proxyRow(10, []);
  await insertTool(all10);
  let res = await setEnabled(all10.id, true);
  check(
    'enabling a server that allows all of its 10 tools is refused',
    res.status === 402,
    `${res.status} ${JSON.stringify(res.body).slice(0, 160)}`
  );
  check(
    '  ...the message counts the tools it would turn on',
    /turns on 10 tools/.test(JSON.stringify(res.body))
  );

  await sql`update artifact_tool set config = ${sql.json({
    ...all10.config,
    allowedTools: [
      'remote_tool_0',
      'remote_tool_1',
      'remote_tool_2',
      'remote_tool_3',
      'remote_tool_4',
      'gone_tool'
    ]
  })} where id = ${all10.id}`;
  res = await setEnabled(all10.id, true);
  check(
    'with 5 allowed (and one stale name) it turns on',
    res.status === 200,
    String(res.status)
  );

  res = await addTool('search-resources');
  check('a 6th tool installs', res.status === 200, String(res.status));
  res = await addTool('read-resource');
  check('a 7th tool installs', res.status === 200, String(res.status));
  const readResourceId = res.body?.id;
  res = await addTool('list-resources');
  check(
    'an 8th is refused — the row count is only 3',
    res.status === 402,
    `${res.status} ${JSON.stringify(res.body).slice(0, 120)}`
  );

  await initialize();
  const listed = await rpc('tools/list');
  const names = (listed.tools || []).map(t => t.name);
  check(
    'the server registers exactly the 7 tools counted',
    names.length === 7 &&
      names.filter(n => n.startsWith('probe10__')).length === 5,
    names.join(', ')
  );

  let h = await health();
  check(
    'Tool health counts 7 enabled',
    h.status === 200 && h.body?.toolQuota?.enabled === 7,
    `${h.status} ${JSON.stringify(h.body?.toolQuota)}`
  );

  res = await setEnabled(readResourceId, false);
  check('turning one off answers 200', res.status === 200, String(res.status));
  res = await addTool('list-resources');
  check('  ...and frees a slot', res.status === 200, String(res.status));

  const three = proxyRow(3, []);
  await insertTool(three);
  res = await setEnabled(three.id, true);
  check(
    'a second server worth 3 tools is refused at 7 of 7',
    res.status === 402,
    String(res.status)
  );
  res = await setEnabled(all10.id, false);
  check('turning the first server off answers 200', res.status === 200);
  h = await health();
  check(
    '  ...and Tool health drops by its 5 tools',
    h.body?.toolQuota?.enabled === 2,
    JSON.stringify(h.body?.toolQuota)
  );
  res = await setEnabled(three.id, true);
  check(
    '  ...then the 3-tool server fits',
    res.status === 200,
    String(res.status)
  );

  // Back to the plan the rest needs, and out of the way of what it counts.
  await setEnabled(three.id, false);
  await setPlan('PRO');

  // --- 1b. the 40-tool ceiling, on a plan without its own limit -------------
  section('PRO: no plan limit, but a project tops out at 40 tools');

  // On now: search-resources and list-resources.
  const wide = proxyRow(45, []);
  await insertTool(wide);
  const allowFirst = n =>
    sql`update artifact_tool set config = ${sql.json({
      ...wide.config,
      allowedTools: Array.from({ length: n }, (_, i) => `remote_tool_${i}`)
    })} where id = ${wide.id}`;
  res = await setEnabled(wide.id, true);
  check(
    'enabling a server with all 45 tools is refused on PRO',
    res.status === 402 && /up to 40 tools turned on/.test(res.body?.error),
    `${res.status} ${res.body?.error}`
  );
  check(
    '  ...without telling a PRO org to upgrade',
    !/upgrade/i.test(res.body?.error || '')
  );
  await allowFirst(38);
  res = await setEnabled(wide.id, true);
  check(
    '38 of them fit next to the 2 on',
    res.status === 200,
    String(res.status)
  );
  res = await addTool('read-resource');
  check(
    'a 41st tool is refused',
    res.status === 402,
    `${res.status} ${res.body?.error}`
  );
  h = await health();
  check(
    'Tool health shows 40 of 40',
    h.body?.toolQuota?.enabled === 40 && h.body?.toolQuota?.limit === 40,
    JSON.stringify(h.body?.toolQuota)
  );
  res = await setEnabled(wide.id, false);
  check('turning it off answers 200', res.status === 200);

  // --- 2. list-resources by cursor -----------------------------------------
  section('PRO: list-resources pages by cursor (230 resources)');

  const resourceRows = Array.from({ length: 230 }, (_, i) => ({
    id: uuid(),
    title: `Doc ${String(i).padStart(3, '0')}`,
    uri: `resource://probe/doc-${String(i).padStart(3, '0')}`,
    mime_type: 'text/plain',
    content: `probe document ${i}`,
    size: 20,
    status: 'COMPLETED',
    artifact_id: artifactId
  }));
  await sql`insert into artifact_resource ${sql(resourceRows)}`;
  await sql`update artifact set artifact_resource_count = 230 where id = ${artifactId}`;

  await initialize();
  const page = async args =>
    JSON.parse(unwrap(textOf(await callTool('list-resources', args))));
  const first = await page({});
  check(
    'the first page has 100, the total and a cursor',
    first.resources?.length === 100 &&
      first.total === 230 &&
      typeof first.nextCursor === 'string',
    `${first.resources?.length} / ${first.total} / ${!!first.nextCursor}`
  );
  const seen = [];
  let cursor;
  let pages = 0;
  do {
    const next = await page(cursor ? { cursor } : {});
    seen.push(...next.resources.map(r => r.uri));
    cursor = next.nextCursor;
    pages++;
  } while (cursor && pages < 10);
  check(
    'following the cursor walks all 230 once, in uri order, in 3 pages',
    pages === 3 &&
      seen.length === 230 &&
      new Set(seen).size === 230 &&
      seen.join() === resourceRows.map(r => r.uri).join(),
    `${pages} pages, ${seen.length} seen`
  );
  const big = await page({ limit: 500 });
  check(
    'limit 500 returns everything with no cursor',
    big.resources.length === 230 && !big.nextCursor
  );
  const tooBig = await callTool('list-resources', { limit: 1000 });
  check(
    'limit over 500 is refused by the schema',
    tooBig.isError === true,
    textOf(tooBig).slice(0, 120)
  );
  const badCursor = await callTool('list-resources', { cursor: '%%%' });
  check(
    'a made-up cursor says so',
    badCursor.isError === true && /not valid/.test(textOf(badCursor)),
    textOf(badCursor).slice(0, 120)
  );

  // --- 3. HTTP endpoints past the budget -----------------------------------
  section('PRO: HTTP endpoint results are parsed whole, then cut');

  const endpoint = (name, url, response) =>
    addTool('http-endpoint', {
      name,
      title: name,
      description: `Probe endpoint ${name}. Use when the probe asks.`,
      method: 'GET',
      url,
      effect: 'read',
      ...(response ? { response } : {})
    });
  // ~1 MB of JSON.
  res = await endpoint('photos', 'https://jsonplaceholder.typicode.com/photos');
  check('photos endpoint added', res.status === 200, String(res.status));
  res = await endpoint(
    'photo-title',
    'https://jsonplaceholder.typicode.com/photos',
    { jsonPath: '4999.title' }
  );
  check('photo-title endpoint added', res.status === 200, String(res.status));
  res = await endpoint('pokemon', 'https://pokeapi.co/api/v2/pokemon', {
    maxBytes: 600
  });
  check('pokemon endpoint added', res.status === 200, String(res.status));

  await initialize();
  let out = unwrap(textOf(await callTool('photos')));
  check(
    'a 1 MB JSON body is cut with the note, not the old marker',
    out.includes('[Truncated: showing the first 256 KB of') &&
      !out.includes('…[truncated]'),
    out.slice(-200).replace(/\n/g, ' ')
  );
  check(
    '  ...and the text is the parsed JSON, pretty-printed',
    out.startsWith('[\n  {\n    "albumId": 1,')
  );
  check(
    '  ...within the budget plus the note',
    new TextEncoder().encode(out).byteLength < 256 * 1024 + 400,
    String(new TextEncoder().encode(out).byteLength)
  );
  out = unwrap(textOf(await callTool('photo-title')));
  check(
    'jsonPath reaches the last item of a body past the budget',
    out.trim().length > 0 && !out.includes('No data found') && out.length < 200,
    out.slice(0, 120)
  );
  out = unwrap(textOf(await callTool('pokemon')));
  check(
    "a cut page names the API's own next page",
    out.includes('next: https://pokeapi.co/api/v2/pokemon?offset=20') &&
      out.includes('call again with it'),
    out.slice(-220).replace(/\n/g, ' ')
  );

  // --- 4. custom code past the budget --------------------------------------
  section('PRO: a custom-code output past the budget');

  const created = await api(`${base}/custom-code/version`, {
    method: 'POST',
    body: JSON.stringify({
      manifest: {
        tools: [
          {
            name: 'big-rows',
            title: 'Big rows',
            description: 'Returns many rows. Use when the probe asks for rows.',
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true }
          },
          {
            name: 'small-rows',
            title: 'Small rows',
            description: 'Returns few rows. Use when the probe asks for a few.',
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true }
          }
        ]
      }
    })
  });
  check('version created', created.status === 200, String(created.status));
  const source = `import { createHandler, defineTool } from './ganju-sdk.js';

const rows = n => Array.from({ length: n }, (_, i) => ({ i, label: 'row ' + i + ' ' + 'x'.repeat(40) }));

export default createHandler({
  'big-rows': defineTool(async () => ({ rows: rows(6000), nextCursor: 'page-2' })),
  'small-rows': defineTool(async () => ({ rows: rows(3) }))
});
`;
  const uploaded = await api(
    `${base}/custom-code/version/${created.body?.id}/bundle`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/javascript' },
      body: source
    }
  );
  check('bundle uploaded', uploaded.status === 200, String(uploaded.status));

  // On now: 2 resource tools and 3 endpoints. With the 45-tool server at 34,
  // the script's 2 functions would make 41.
  await allowFirst(34);
  res = await setEnabled(wide.id, true);
  check('the server back on with 34 (39 in all)', res.status === 200);
  const refused = await api(
    `${base}/custom-code/version/${created.body?.id}/publish`,
    { method: 'POST' }
  );
  check(
    'publishing 2 functions at 39 of 40 is refused before deploying',
    refused.status === 402 && /up to 40 tools/.test(refused.body?.error),
    `${refused.status} ${refused.body?.error}`
  );
  check(
    '  ...and nothing reached the dispatch namespace',
    (await artifactScripts()).length === 0
  );
  res = await setEnabled(wide.id, false);
  check('the server off again', res.status === 200);

  const published = await api(
    `${base}/custom-code/version/${created.body?.id}/publish`,
    { method: 'POST' }
  );
  deployed = true;
  check(
    'published',
    published.status === 200,
    `${published.status} ${JSON.stringify(published.body).slice(0, 160)}`
  );

  await initialize();
  const bigResult = await callTool('big-rows');
  out = unwrap(textOf(bigResult));
  check(
    'a ~400 KB output comes back cut, not as "not valid JSON"',
    !out.includes('not valid JSON') &&
      out.includes('[Truncated: showing the first 256 KB of'),
    out.slice(0, 120).replace(/\n/g, ' ')
  );
  check(
    "  ...naming the output's own next page",
    out.includes('nextCursor: page-2'),
    out.slice(-200).replace(/\n/g, ' ')
  );
  check(
    '  ...with the structured copy whole',
    bigResult.structuredContent?.rows?.length === 6000,
    String(bigResult.structuredContent?.rows?.length)
  );
  out = unwrap(textOf(await callTool('small-rows')));
  check(
    'a small output is untouched',
    !out.includes('Truncated') && JSON.parse(out).rows.length === 3,
    out.slice(0, 80).replace(/\n/g, ' ')
  );
} catch (error) {
  fail++;
  failures.push(`threw: ${error.message}`);
  console.error('\n  THREW', error);
} finally {
  section('cleanup');
  if (deployed) {
    for (const name of await artifactScripts()) {
      const del = await cf(
        `/workers/dispatch/namespaces/${NAMESPACE}/scripts/${name}?force=true`,
        { method: 'DELETE' }
      );
      console.log(`  removed ${name} (HTTP ${del.status})`);
    }
  }
  const steps = [
    sql`delete from mcp_request where session_id in (select id from mcp_session where artifact_id = ${artifactId})`,
    sql`delete from mcp_session where artifact_id = ${artifactId}`,
    sql`delete from artifact_execution where artifact_id = ${artifactId}`,
    sql`delete from artifact_tool_version where artifact_tool_id in (select id from artifact_tool where artifact_id = ${artifactId})`,
    sql`delete from artifact_resource where artifact_id = ${artifactId}`,
    sql`delete from artifact_tool where artifact_id = ${artifactId}`,
    sql`delete from artifact_credential where artifact_id = ${artifactId}`,
    sql`delete from artifact where id = ${artifactId}`,
    sql`delete from project_user where project_id = ${projectId}`,
    sql`delete from project where id = ${projectId}`,
    sql`delete from usage_period where organization_id = ${orgId}`,
    sql`delete from subscription where organization_id = ${orgId}`,
    sql`delete from organization_user where organization_id = ${orgId}`,
    sql`delete from organization where id = ${orgId}`,
    sql`delete from session where user_id = ${userId}`,
    sql`delete from "user" where id = ${userId}`
  ];
  for (const step of steps) {
    try {
      await step;
    } catch (error) {
      console.log(`  could not delete: ${error.message}`);
    }
  }
  const leftovers = [];
  for (const [label, query] of [
    ['user', sql`select count(*)::int as n from "user" where id = ${userId}`],
    [
      'organization',
      sql`select count(*)::int as n from organization where id = ${orgId}`
    ],
    [
      'artifact',
      sql`select count(*)::int as n from artifact where id = ${artifactId}`
    ],
    ['scripts', null]
  ]) {
    if (!query) {
      const left = deployed ? (await artifactScripts()).length : 0;
      if (left) leftovers.push(`${label}: ${left}`);
      continue;
    }
    const [{ n }] = await query;
    if (n) leftovers.push(`${label}: ${n}`);
  }
  if (leftovers.length) {
    fail++;
    failures.push('cleanup left rows behind');
    console.log(`  LEFT OVER — remove by hand: ${leftovers.join(', ')}`);
  } else {
    console.log('  everything the probe created is gone');
  }
  await sql.end().catch(() => {});
  console.log(
    `\n${pass} passed, ${fail} failed${failures.length ? `:\n  - ${failures.join('\n  - ')}` : ''}\n`
  );
  process.exit(fail ? 1 : 0);
}
