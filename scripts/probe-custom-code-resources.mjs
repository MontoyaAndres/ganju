// Drives ctx.resources.create / .delete through the DEPLOYED dev stack — the
// path the verify script cannot reach.
//
//   node scripts/probe-custom-code-resources.mjs
//
// verify-custom-code-resources.mjs bundles the broker module and calls it
// directly, with a stub bucket and no queue. Everything between an MCP client
// and that module is therefore unexercised: the dispatcher, the user script,
// the service binding, the real R2 and Postgres, the index queue, and the
// indexer that consumes it. This runs the whole thing.
//
// It publishes a throwaway artifact's script into the dispatch namespace,
// calls its tools over the real MCP endpoint, asserts against the database, and
// removes everything — the script, the rows, and the organization.
//
// Requires .env: DATABASE_URL, CLOUDFLARE_ACCOUNT_ID, CUSTOM_CODE_CF_API_TOKEN,
// CUSTOM_CODE_TOKEN_SECRET, MCP_INTERNAL_SECRET.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import esbuild from 'esbuild';
import postgres from 'postgres';
import { v7 as uuid } from 'uuid';

const root = new URL('..', import.meta.url).pathname;
const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
const read = key => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();

const DATABASE_URL = read('DATABASE_URL');
const ACCOUNT_ID = read('CLOUDFLARE_ACCOUNT_ID');
const CF_TOKEN = read('CUSTOM_CODE_CF_API_TOKEN');
const TOKEN_SECRET = read('CUSTOM_CODE_TOKEN_SECRET');
const MCP_SECRET = read('MCP_INTERNAL_SECRET');

const NAMESPACE = 'ganju-tools-development';
const BROKER_SERVICE = 'ganju-tool-broker-development';
const MCP_ORIGIN = 'https://development-mcp.vocesqueabrazan.com';

for (const [name, value] of Object.entries({
  DATABASE_URL,
  CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
  CUSTOM_CODE_CF_API_TOKEN: CF_TOKEN,
  CUSTOM_CODE_TOKEN_SECRET: TOKEN_SECRET,
  MCP_INTERNAL_SECRET: MCP_SECRET
})) {
  if (!value) throw new Error(`Missing ${name} in .env`);
}

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

const sleep = ms => new Promise(r => setTimeout(r, ms));

// the tool the probe deploys

const PROBE_SOURCE = `
import { createHandler, defineTool } from '@ganju/sdk';

// Every tool reports failures as a value rather than throwing. A thrown handler
// comes back as an MCP tool error, which is correct behaviour but hides the
// message this probe wants to assert on.
const attempt = async fn => {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

export default createHandler({
  'probe-create': defineTool(async (input, ctx) =>
    attempt(() =>
      ctx.resources.create({
        title: input.title,
        content: input.content,
        index: input.index === true
      })
    )
  ),
  'probe-create-file': defineTool(async (input, ctx) =>
    attempt(() =>
      ctx.resources.create({
        title: input.title,
        bytes: input.bytes,
        mimeType: 'application/pdf',
        fileName: 'probe.pdf'
      })
    )
  ),
  'probe-list': defineTool(async (_input, ctx) =>
    attempt(async () => ({ uris: (await ctx.resources.list()).map(r => r.uri) }))
  ),
  'probe-read': defineTool(async (input, ctx) =>
    attempt(() => ctx.resources.read(input.uri))
  ),
  'probe-search': defineTool(async (input, ctx) =>
    attempt(async () => ({
      hits: (await ctx.resources.search(input.query, 5)).map(h => ({
        uri: h.uri,
        score: h.score
      }))
    }))
  ),
  'probe-delete': defineTool(async (input, ctx) =>
    attempt(() =>
      ctx.resources.delete(input.uri, { children: input.children === true })
    )
  )
});
`;

const TEXT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    content: { type: 'string' },
    index: { type: 'boolean' }
  },
  required: ['title', 'content']
};

const MANIFEST = [
  {
    name: 'probe-create',
    title: 'Probe create',
    description: 'Create a text resource.',
    inputSchema: TEXT_SCHEMA
  },
  {
    name: 'probe-create-file',
    title: 'Probe create file',
    description: 'Create a file resource from base64 bytes.',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string' }, bytes: { type: 'string' } },
      required: ['title', 'bytes']
    }
  },
  {
    name: 'probe-list',
    title: 'Probe list',
    description: 'List resource uris.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'probe-read',
    title: 'Probe read',
    description: 'Read a resource by uri.',
    inputSchema: {
      type: 'object',
      properties: { uri: { type: 'string' } },
      required: ['uri']
    }
  },
  {
    name: 'probe-search',
    title: 'Probe search',
    description: 'Semantic search over the artifact resources.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    }
  },
  {
    name: 'probe-delete',
    title: 'Probe delete',
    description: 'Delete a resource, optionally with its children.',
    inputSchema: {
      type: 'object',
      properties: { uri: { type: 'string' }, children: { type: 'boolean' } },
      required: ['uri']
    }
  }
];

// build

const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ganju-probe-'));
const entry = path.join(root, `.probe-entry-${process.pid}.ts`);
const outfile = path.join(buildDir, 'bundle.js');

fs.writeFileSync(entry, PROBE_SOURCE);
await esbuild.build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'esm',
  // The plain Workers runtime: user scripts are uploaded without
  // nodejs_compat, so the bundle must not reach for a node builtin.
  platform: 'neutral',
  target: 'esnext',
  absWorkingDir: root,
  logLevel: 'error'
});
const bundle = fs.readFileSync(outfile);
fs.rmSync(entry, { force: true });

// the same token the publish pipeline mints, built here rather than imported so
// this stays a black-box exercise of the deployed broker's verification
const b64url = buf =>
  Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const mintToken = async (artifactId, versionId) => {
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        v: 'v1',
        artifactId,
        versionId,
        iat: Math.floor(Date.now() / 1000)
      })
    )
  );
  const { createHmac } = await import('node:crypto');
  const sig = createHmac('sha256', TOKEN_SECRET).update(payload).digest();
  return `${payload}.${b64url(sig)}`;
};

const cf = async (urlPath, init) => {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}${urlPath}`,
    {
      ...init,
      headers: { Authorization: `Bearer ${CF_TOKEN}`, ...init?.headers }
    }
  );
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.success === false) {
    throw new Error(
      `Cloudflare ${res.status}: ${JSON.stringify(body?.errors)?.slice(0, 300)}`
    );
  }
  return body;
};

// scaffold

const [owner] =
  await sql`select id from "user" order by created_at asc limit 1`;
if (!owner) throw new Error('No user in this database to own the scaffold');

const orgId = uuid();
const projectId = uuid();
const artifactId = uuid();
const versionId = uuid();
const slug = `probe-${Date.now().toString(36)}`;
const scriptName = `artifact_${artifactId}`;

console.log(`\nScaffolding ${slug} (artifact ${artifactId})\n`);

const insertResource = async values => {
  await sql`insert into artifact_resource ${sql(values)}`;
  await sql`update artifact set artifact_resource_count = artifact_resource_count + 1 where id = ${artifactId}`;
  return values.id;
};

let deployed = false;

try {
  await sql`insert into organization ${sql({ id: orgId, name: 'probe-custom-code', owner_id: owner.id })}`;
  await sql`insert into subscription ${sql({ id: uuid(), organization_id: orgId, plan: 'PRO', status: 'active' })}`;
  await sql`insert into project ${sql({ id: projectId, name: 'probe', created_by_id: owner.id, organization_id: orgId })}`;
  await sql`insert into artifact ${sql({ id: artifactId, slug, project_id: projectId })}`;

  // The key itself, not an id resolved through a lookup table: the catalog is
  // code now, so there is no row to find and nothing to be unseeded.
  const artifactToolId = uuid();
  await sql`insert into artifact_tool ${sql({
    id: artifactToolId,
    tool_key: 'custom-code',
    artifact_id: artifactId,
    config: JSON.stringify({
      activeVersionId: null,
      timeoutMs: 30000,
      resourceAccess: 'own'
    })
  })}`;

  await sql`insert into artifact_tool_version ${sql({
    id: versionId,
    artifact_tool_id: artifactToolId,
    version: 1,
    status: 'published',
    tools: JSON.stringify(MANIFEST),
    published_at: new Date()
  })}`;

  // A crawl to prune later: a seed, the page sharing its uri, and a page below.
  const seedId = await insertResource({
    id: uuid(),
    title: 'probe.example',
    uri: 'https://probe.example',
    mime_type: 'text/plain',
    source_type: 'WEBSITE',
    child_resource_count: 2,
    artifact_id: artifactId
  });
  await insertResource({
    id: uuid(),
    title: 'Home',
    uri: 'https://probe.example',
    mime_type: 'text/plain',
    source_type: 'WEBSITE',
    parent_resource_id: seedId,
    content: 'crawled home',
    artifact_id: artifactId
  });
  await insertResource({
    id: uuid(),
    title: 'Pricing',
    uri: 'https://probe.example/pricing',
    mime_type: 'text/plain',
    source_type: 'WEBSITE',
    parent_resource_id: seedId,
    content: 'crawled pricing',
    artifact_id: artifactId
  });
  await insertResource({
    id: uuid(),
    title: 'Contract',
    uri: 'resource://probe-contract',
    mime_type: 'text/plain',
    source_type: 'FILE',
    content: 'a document its owner uploaded',
    artifact_id: artifactId
  });

  // deploy into the dispatch namespace, exactly as the publish pipeline does

  const token = await mintToken(artifactId, versionId);
  const form = new FormData();
  form.append(
    'metadata',
    new Blob(
      [
        JSON.stringify({
          main_module: 'index.js',
          compatibility_date: '2025-11-17',
          compatibility_flags: [],
          limits: { cpu_ms: 5000 },
          bindings: [
            { type: 'secret_text', name: 'GANJU_TOOL_TOKEN', text: token },
            { type: 'service', name: 'GANJU_BROKER', service: BROKER_SERVICE }
          ]
        })
      ],
      { type: 'application/json' }
    )
  );
  form.append(
    'index.js',
    new Blob([bundle], { type: 'application/javascript+module' }),
    'index.js'
  );

  await cf(`/workers/dispatch/namespaces/${NAMESPACE}/scripts/${scriptName}`, {
    method: 'PUT',
    body: form
  });
  deployed = true;
  console.log('  deployed to the dispatch namespace\n');

  // point the tool at the version only once the script is live
  await sql`update artifact_tool
            set config = ${JSON.stringify({ activeVersionId: versionId, timeoutMs: 30000, resourceAccess: 'own' })}::json
            where id = ${artifactToolId}`;

  // MCP

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
    // The transport answers SSE; the JSON-RPC envelope is the `data:` line.
    const line = text.split('\n').find(l => l.startsWith('data:'));
    const payload = JSON.parse(line ? line.slice(5).trim() : text);
    if (payload.error)
      throw new Error(`MCP error: ${JSON.stringify(payload.error)}`);
    return payload.result;
  };

  const callTool = async (name, args = {}) => {
    const result = await rpc('tools/call', { name, arguments: args });
    const text = result?.content?.[0]?.text ?? '';
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  };

  const rowsFor = uri =>
    sql`select * from artifact_resource where artifact_id = ${artifactId} and uri = ${uri}`;

  console.log('boot\n');

  await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'probe', version: '1' }
  });

  const listed = await rpc('tools/list');
  const names = (listed.tools || []).map(t => t.name);
  check(
    'every manifest tool registered',
    MANIFEST.every(t => names.includes(t.name)),
    `${names.filter(n => n.startsWith('probe-')).length}/${MANIFEST.length} present`
  );

  console.log('\ncreate, through the dispatcher\n');

  let out = await callTool('probe-create', {
    title: 'Probe report',
    content: 'the quarterly figures the probe wrote'
  });
  check('a script can write a resource', out.ok === true, out.error || '');
  check(
    '  ...at the derived uri',
    out.value?.uri === 'resource://probe-report',
    out.value?.uri
  );

  let rows = await rowsFor('resource://probe-report');
  check('  ...the row is really in Postgres', rows.length === 1);
  check('  ...marked as tool-written', rows[0]?.source_type === 'CUSTOM_CODE');
  check(
    '  ...COMPLETED, since it was not indexed',
    rows[0]?.status === 'COMPLETED',
    rows[0]?.status
  );

  out = await callTool('probe-create-file', {
    title: 'Probe invoice',
    bytes: Buffer.from('%PDF-1.4 probe bytes').toString('base64')
  });
  check('a script can write a file resource', out.ok === true, out.error || '');
  rows = await rowsFor('resource://probe-invoice');
  check(
    '  ...with a real R2 key',
    !!rows[0]?.file_key,
    rows[0]?.file_key || ''
  );
  check(
    '  ...and the decoded size',
    Number(rows[0]?.size) === 20,
    String(rows[0]?.size)
  );

  out = await callTool('probe-list');
  check(
    'the script sees what it wrote',
    out.value?.uris?.includes('resource://probe-report'),
    `${out.value?.uris?.length} uris`
  );
  check(
    '  ...and the crawl seed is filtered out',
    (out.value?.uris || []).filter(u => u === 'https://probe.example')
      .length === 1,
    'the seed and its page share a uri; only the page is addressable'
  );

  out = await callTool('probe-read', { uri: 'resource://probe-report' });
  check(
    'and can read it back',
    out.value?.text === 'the quarterly figures the probe wrote',
    out.error || ''
  );

  console.log('\nindexing, through the real queue\n');

  out = await callTool('probe-create', {
    title: 'Probe indexed',
    content:
      'The margarita recipe used by the probe calls for lime, tequila and triple sec.',
    index: true
  });
  check('index:true is accepted', out.ok === true, out.error || '');
  check('  ...reported as indexed', out.value?.indexed === true);

  rows = await rowsFor('resource://probe-indexed');
  check(
    '  ...written PENDING, not COMPLETED',
    rows[0]?.status === 'PENDING',
    rows[0]?.status
  );

  // The queue and the indexer are asynchronous. Poll rather than guess.
  const resourceId = rows[0].id;
  let chunks = 0;
  let status = rows[0].status;
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const [c] =
      await sql`select count(*)::int as n from artifact_resource_chunk where resource_id = ${resourceId}`;
    const [r] =
      await sql`select status from artifact_resource where id = ${resourceId}`;
    chunks = c.n;
    status = r?.status;
    if (chunks > 0 && status === 'COMPLETED') break;
  }
  check(
    '  ...the queue delivered and the indexer ran',
    chunks > 0,
    `${chunks} chunk(s)`
  );
  check('  ...flipping the row to COMPLETED', status === 'COMPLETED', status);

  const [{ e: embedded }] =
    await sql`select artifact_resource_embedded_size as e from artifact where id = ${artifactId}`;
  check(
    "  ...and crediting the artifact's embedded total",
    Number(embedded) > 0,
    `${embedded} bytes`
  );

  out = await callTool('probe-search', { query: 'what goes in a margarita?' });
  const hit = (out.value?.hits || []).find(
    h => h.uri === 'resource://probe-indexed'
  );
  check(
    'the script can find what it indexed',
    !!hit,
    hit ? `score ${hit.score}` : JSON.stringify(out).slice(0, 160)
  );

  out = await callTool('probe-search', { query: 'the quarterly figures' });
  check(
    '  ...while the UNindexed resource stays out of the corpus',
    !(out.value?.hits || []).some(h => h.uri === 'resource://probe-report'),
    'writing a file must not put it in the knowledge base'
  );

  console.log('\naccess, read from the published config\n');

  out = await callTool('probe-delete', { uri: 'resource://probe-contract' });
  check(
    "on 'own', an uploaded document is refused",
    out.ok === false,
    out.error || 'it was NOT refused'
  );
  check(
    '  ...with the message that names the fix',
    (out.error || '').includes('resource access'),
    out.error || ''
  );
  check(
    '  ...and the document survives',
    (await rowsFor('resource://probe-contract')).length === 1
  );

  out = await callTool('probe-delete', {
    uri: 'https://probe.example',
    children: true
  });
  check(
    '  ...as is a crawl, even with children:true',
    out.ok === false,
    out.error || 'it was NOT refused'
  );

  // The broker reads resourceAccess per call from the stored row, so granting it
  // takes effect without redeploying — which is the point of it living in config.
  await sql`update artifact_tool
            set config = ${JSON.stringify({ activeVersionId: versionId, timeoutMs: 30000, resourceAccess: 'all' })}::json
            where id = ${artifactToolId}`;

  out = await callTool('probe-delete', { uri: 'https://probe.example' });
  check(
    "on 'all', a parent still needs children:true",
    out.ok === false && (out.error || '').includes('children'),
    out.error || ''
  );

  const countBefore = (
    await sql`select artifact_resource_count as n from artifact where id = ${artifactId}`
  )[0].n;

  out = await callTool('probe-delete', {
    uri: 'https://probe.example',
    children: true
  });
  check('  ...and with it, the crawl goes', out.ok === true, out.error || '');
  check(
    '  ...reporting the whole tree',
    out.value?.count === 3,
    `${out.value?.count} rows`
  );
  check(
    '  ...every row gone',
    (await rowsFor('https://probe.example')).length === 0 &&
      (await rowsFor('https://probe.example/pricing')).length === 0
  );
  const countAfter = (
    await sql`select artifact_resource_count as n from artifact where id = ${artifactId}`
  )[0].n;
  check(
    '  ...the counter dropped by three',
    countAfter === countBefore - 3,
    `${countBefore} → ${countAfter}`
  );

  console.log('\ndelete\n');

  out = await callTool('probe-delete', { uri: 'resource://probe-invoice' });
  check('a file resource deletes', out.ok === true, out.error || '');
  check(
    '  ...and its row is gone',
    (await rowsFor('resource://probe-invoice')).length === 0
  );

  out = await callTool('probe-delete', { uri: 'resource://probe-invoice' });
  check(
    'deleting it again is a no-op, not an error',
    out.ok === true && out.value?.deleted === false,
    out.error || ''
  );

  out = await callTool('probe-delete', { uri: 'resource://probe-indexed' });
  check('an indexed resource deletes', out.ok === true, out.error || '');
  const [{ n: leftoverChunks }] =
    await sql`select count(*)::int as n from artifact_resource_chunk where resource_id = ${resourceId}`;
  check('  ...its chunks went with it', leftoverChunks === 0);
  const [{ e: embeddedAfter }] =
    await sql`select artifact_resource_embedded_size as e from artifact where id = ${artifactId}`;
  check(
    '  ...and the embedded total came back down',
    Number(embeddedAfter) === 0,
    `${embedded} → ${embeddedAfter}`
  );
} finally {
  console.log('\nCleaning up\n');

  if (deployed) {
    try {
      await cf(
        `/workers/dispatch/namespaces/${NAMESPACE}/scripts/${scriptName}?force=true`,
        { method: 'DELETE' }
      );
      check('dispatch script removed', true);
    } catch (error) {
      check('dispatch script removed', false, error.message);
    }
  }

  await sql`delete from artifact_resource where artifact_id = ${artifactId}`;
  await sql`delete from artifact where id = ${artifactId}`;
  await sql`delete from project where id = ${projectId}`;
  await sql`delete from subscription where organization_id = ${orgId}`;
  await sql`delete from organization where id = ${orgId}`;
  const [{ n }] =
    await sql`select count(*)::int as n from organization where id = ${orgId}`;
  check('scaffold removed', n === 0);

  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.rmSync(entry, { force: true });
  await sql.end();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
