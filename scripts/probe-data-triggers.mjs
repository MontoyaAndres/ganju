// Drives database triggers against the DEPLOYED dev stack (or production
// with --prod): rows written over the Data API and by a channel bot over MCP,
// events through the object's outbox and the queue, and what the consumer
// does with them.
//
//   node scripts/probe-data-triggers.mjs
//   PROBE_API_URL=https://development-api.vocesqueabrazan.com node scripts/probe-data-triggers.mjs
//   node scripts/probe-data-triggers.mjs --prod
//   node scripts/probe-data-triggers.mjs --purge-check <artifact_database id> [--prod]
//
// Needs .env (or .env.prod with --prod): DATABASE_URL, JWT_SECRET, MCP_INTERNAL_SECRET,
// CLOUDFLARE_ACCOUNT_ID, CUSTOM_CODE_CF_API_TOKEN and CUSTOM_CODE_TOKEN_SECRET.
// The webhook checks use webhook.site, a public request bin: a throwaway URL
// that answers 500 at first (so the consumer retries) and 200 after.
//
// Scaffolds a throwaway user and Pro organization with a project, its
// database, a WhatsApp channel with a customer who last wrote two days ago,
// and a published script with functions for triggers only. Then checks:
//   - `expose: false` keeps those functions out of tools/list;
//   - triggers deployed as ganju.json would, managed by the CLI, and a
//     dashboard one beside them; a webhook's secret shown once;
//   - a bot's new order runs a function (its write recorded as the trigger),
//     and a webhook gets it signed, the same eventId on a forced retry;
//   - `changedTo` fires once, on the transition;
//   - renaming a column renames it in the trigger, which still fires, and a
//     deploy that names the old column is refused;
//   - a function that updates the row it was triggered by doesn't loop;
//   - a chain of triggers stops at depth 3 with a visible error;
//   - ctx.channels.send to a WhatsApp customer outside the 24-hour window
//     without a template fails with the readable error;
//   - runs and their errors in the runs list, "Retry", and
//     data_trigger_run_count matching the runs, as the billing page shows it.
// Messages that reach a real Telegram group or customer need a real bot: see
// the manual steps printed at the end.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import esbuild from 'esbuild';
import postgres from 'postgres';
import { v7 as uuid } from 'uuid';
import { utils } from '@ganju/utils';

const root = new URL('..', import.meta.url).pathname;
const isProd = process.argv.includes('--prod');
const env = fs.readFileSync(
  path.join(root, isProd ? '.env.prod' : '.env'),
  'utf8'
);
const read = key =>
  env
    .match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]
    ?.replace(/\s+#.*$/, '')
    .trim();

const API = (
  process.env.PROBE_API_URL ??
  (isProd
    ? 'https://api.ganju.ai'
    : 'https://development-api.vocesqueabrazan.com')
).replace(/\/+$/, '');
const MCP_ORIGIN = (
  process.env.PROBE_MCP_URL ??
  (isProd
    ? 'https://mcp.ganju.ai'
    : 'https://development-mcp.vocesqueabrazan.com')
).replace(/\/+$/, '');
const DATABASE_URL = read('DATABASE_URL');
const JWT_SECRET = read('JWT_SECRET');
const MCP_SECRET = read('MCP_INTERNAL_SECRET');
const ACCOUNT_ID = read('CLOUDFLARE_ACCOUNT_ID');
const CF_TOKEN = read('CUSTOM_CODE_CF_API_TOKEN');
const TOKEN_SECRET = read('CUSTOM_CODE_TOKEN_SECRET');
const STAGE = isProd ? 'production' : 'development';
const NAMESPACE = `ganju-tools-${STAGE}`;
const BROKER_SERVICE = `ganju-tool-broker-${STAGE}`;

const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1, prepare: false });

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
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const purgeCheck = process.argv.indexOf('--purge-check');
if (purgeCheck !== -1) {
  const id = process.argv[purgeCheck + 1];
  const [row] = await sql`select * from artifact_database where id = ${id}`;
  check('the purge emptied the database', row?.status === 'DELETED');
  if (row?.status === 'DELETED') {
    await sql`delete from artifact_database where id = ${id}`;
    console.log('  removed the probe row');
  }
  await sql.end();
  process.exit(fail ? 1 : 0);
}

for (const [name, value] of Object.entries({
  DATABASE_URL,
  JWT_SECRET,
  MCP_INTERNAL_SECRET: MCP_SECRET,
  CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
  CUSTOM_CODE_CF_API_TOKEN: CF_TOKEN,
  CUSTOM_CODE_TOKEN_SECRET: TOKEN_SECRET
})) {
  if (!value) throw new Error(`Missing ${name} in .env`);
}

const { constants } = utils;

// the API, as the signed-in owner

const signCookie = value =>
  encodeURIComponent(
    `${value}.${crypto.createHmac('sha256', JWT_SECRET).update(value).digest('base64')}`
  );
const sessionToken = crypto.randomBytes(32).toString('base64url');
const cookie = `better-auth.session_token=${signCookie(sessionToken)}; __Secure-better-auth.session_token=${signCookie(sessionToken)}`;
const call = async (urlPath, init = {}) => {
  const response = await fetch(`${API}${urlPath}`, {
    ...init,
    headers: {
      cookie,
      origin: API,
      'content-type': 'application/json',
      ...init.headers
    }
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
};
const json = (method, body) => ({ method, body: JSON.stringify(body) });

const stamp = Date.now().toString(36);
const userId = uuid();
const orgId = uuid();
const projectId = uuid();
const artifactId = uuid();
const slug = `probe-data-triggers-${stamp}`;
const data = `/organization/${orgId}/project/${projectId}/artifact/data`;

// MCP, as a channel bot (the internal secret with the channel headers)

let rpcId = 0;
const rpc = async (auth, sessionId, method, params) => {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-session-id': sessionId,
    [constants.MCP_INTERNAL_HEADER]: MCP_SECRET
  };
  if (auth.participant) {
    headers['user-agent'] = constants.MCP_CHANNEL_CLIENT_USER_AGENT;
    headers[constants.MCP_CHANNEL_ID_HEADER] = auth.channelId;
    headers[constants.MCP_CHANNEL_PLATFORM_HEADER] = auth.platform;
    headers[constants.MCP_CHANNEL_CONVERSATION_HEADER] = auth.conversationId;
    headers[constants.MCP_CHANNEL_PARTICIPANT_HEADER] = auth.participant;
  }
  const res = await fetch(`${MCP_ORIGIN}/${slug}`, {
    method: 'POST',
    headers,
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

// webhook.site: a URL that answers what we tell it, and lists what it got.

const bin = {
  async create(status) {
    const res = await fetch('https://webhook.site/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({
        default_status: status,
        default_content: 'probe',
        timeout: 0
      })
    });
    const body = await res.json();
    this.id = body.uuid;
    return `https://webhook.site/${this.id}`;
  },
  async answer(status) {
    await fetch(`https://webhook.site/token/${this.id}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({
        default_status: status,
        default_content: 'probe',
        timeout: 0
      })
    });
  },
  async requests() {
    const res = await fetch(
      `https://webhook.site/token/${this.id}/requests?sorting=oldest&per_page=50`,
      {
        headers: { accept: 'application/json' }
      }
    );
    return (await res.json()).data ?? [];
  },
  async remove() {
    if (this.id)
      await fetch(`https://webhook.site/token/${this.id}`, {
        method: 'DELETE'
      }).catch(() => {});
  }
};

const header = (request, name) => {
  const value = request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
};

// The script: functions only triggers run.

const PROBE_SOURCE = `
import { createHandler, defineTool } from '@ganju/sdk';

export default createHandler({
  // Marks the new order with the event it was told about.
  't-kitchen': defineTool(async (event, ctx) => {
    await ctx.data.update('qa_orders', event.row.id, { note: 'kitchen:' + event.eventId });
    return { ok: true };
  }),
  // Updates the row its own trigger fired for: must not run again for it.
  't-stamp': defineTool(async (event, ctx) => {
    await ctx.data.update('qa_loop', event.row.id, { stamps: { increment: 1 } });
    return { ok: true };
  }),
  // Inserts the other kind, which another trigger answers: a chain.
  't-chain': defineTool(async (event, ctx) => {
    await ctx.data.insert('qa_chain', { kind: event.row.kind === 'a' ? 'b' : 'a' });
    return { ok: true };
  }),
  // Tells the customer; keeps what happened on the order.
  't-tell': defineTool(async (event, ctx) => {
    let note;
    try {
      const sent = await ctx.channels.send({ participantId: event.row.participant_id, text: 'Your order is ready' });
      note = 'sent:' + sent.sent;
    } catch (error) {
      note = 'refused:' + (error instanceof Error ? error.message : String(error));
    }
    await ctx.data.update('qa_orders', event.row.id, { note });
    return { note };
  }),
  // The one the assistant may call.
  'visible': defineTool(async () => ({ ok: true }))
});
`;

const EMPTY = { type: 'object', properties: {} };
const MANIFEST = [
  {
    name: 't-kitchen',
    description: 'Trigger only.',
    inputSchema: EMPTY,
    expose: false
  },
  {
    name: 't-stamp',
    description: 'Trigger only.',
    inputSchema: EMPTY,
    expose: false
  },
  {
    name: 't-chain',
    description: 'Trigger only.',
    inputSchema: EMPTY,
    expose: false
  },
  {
    name: 't-tell',
    description: 'Trigger only.',
    inputSchema: EMPTY,
    expose: false,
    data: { access: 'write', tables: ['qa_orders'] }
  },
  {
    name: 'visible',
    description: 'A function the assistant sees.',
    inputSchema: EMPTY
  }
];

const b64url = buf =>
  Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const mintToken = (forArtifact, versionId) => {
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        v: 'v1',
        artifactId: forArtifact,
        versionId,
        iat: Math.floor(Date.now() / 1000)
      })
    )
  );
  return `${payload}.${b64url(crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest())}`;
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

// Waits for a condition the queue makes true, up to `ms`.
const until = async (fn, ms = 90_000, every = 3_000) => {
  const end = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) return value;
    await sleep(every);
  }
};
const runsOf = async name =>
  (await call(`${data}/trigger/${name}/run`)).body?.runs ?? [];
const rowOf = async (table, id) =>
  (await call(`${data}/table/${table}/row/${id}`)).body?.row;

const buildDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ganju-probe-triggers-')
);
const entry = path.join(root, `.probe-triggers-entry-${process.pid}.ts`);
const scriptName = `artifact_${artifactId}`;
let deployed = false;
let leftForPurge = null;

console.log(`\nProbing ${API} and ${MCP_ORIGIN} (${slug})`);

try {
  await sql`insert into "user" ${sql({ id: userId, name: 'probe data triggers', email: `${userId}@probe.test` })}`;
  await sql`insert into session ${sql({ id: uuid(), user_id: userId, token: sessionToken, expires_at: new Date(Date.now() + 3600_000) })}`;
  await sql`insert into organization ${sql({ id: orgId, name: `probe-data-triggers-${stamp}`, owner_id: userId })}`;
  await sql`insert into subscription ${sql({ id: uuid(), organization_id: orgId, plan: 'PRO', status: 'active' })}`;
  await sql`insert into organization_user ${sql({ user_id: userId, organization_id: orgId, role: 'ADMIN' })}`;
  await sql`insert into project ${sql({ id: projectId, name: 'probe data triggers', created_by_id: userId, organization_id: orgId })}`;
  await sql`insert into project_user ${sql({ user_id: userId, project_id: projectId, role: 'ADMIN' })}`;
  await sql`insert into artifact ${sql({ id: artifactId, slug, project_id: projectId })}`;

  // A WhatsApp channel (credentials that never reach Meta) and a customer
  // whose last message was two days ago: outside the 24-hour window.
  const channelId = uuid();
  const participantId = uuid();
  const conversationId = uuid();
  await sql`insert into channel ${sql({
    id: channelId,
    platform: 'whatsapp',
    credentials: JSON.stringify({
      accessToken: 'probe',
      phoneNumberId: '0',
      verifyToken: 'probe',
      appSecret: 'probe'
    }),
    webhook_secret: 'probe',
    artifact_id: artifactId
  })}`;
  await sql`insert into channel_participant ${sql({ id: participantId, external_user_id: '573000000000', channel_id: channelId })}`;
  await sql`insert into channel_conversation ${sql({ id: conversationId, external_conversation_id: '573000000000', scope: 'private', channel_id: channelId })}`;
  await sql`insert into channel_message ${sql({
    id: uuid(),
    role: 'user',
    content: 'hola',
    conversation_id: conversationId,
    participant_id: participantId,
    created_at: new Date(Date.now() - 2 * 86_400_000)
  })}`;

  section('the database, its tables and a published script');
  const created = await call(data, { method: 'POST', body: '{}' });
  if (created.status === 401) {
    throw new Error(
      'The session cookie was rejected: check JWT_SECRET and DATABASE_URL match the deployed API.'
    );
  }
  check(
    'Pro creates it',
    created.status === 201,
    `${created.status} ${created.body?.error ?? ''}`
  );
  for (const table of [
    {
      name: 'qa_orders',
      access: 'full',
      customerScoped: true,
      columns: [
        {
          name: 'status',
          type: 'enum',
          values: ['pending', 'ready'],
          default: 'pending'
        },
        { name: 'address', type: 'text' },
        { name: 'note', type: 'long_text' }
      ]
    },
    {
      name: 'qa_loop',
      columns: [{ name: 'stamps', type: 'integer', default: 0 }]
    },
    {
      name: 'qa_chain',
      columns: [
        { name: 'kind', type: 'enum', values: ['a', 'b'], required: true }
      ]
    }
  ]) {
    const made = await call(`${data}/table`, json('POST', table));
    check(`table ${table.name}`, made.status === 201, made.body?.error);
  }

  fs.writeFileSync(entry, PROBE_SOURCE);
  const outfile = path.join(buildDir, 'bundle.js');
  await esbuild.build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'esnext',
    absWorkingDir: root,
    alias: { '@ganju/sdk': path.join(root, 'packages/sdk/src/index.ts') },
    logLevel: 'error'
  });
  const bundle = fs.readFileSync(outfile);
  fs.rmSync(entry, { force: true });
  const artifactToolId = uuid();
  const versionId = uuid();
  const config = {
    activeVersionId: versionId,
    timeoutMs: 30000,
    resourceAccess: 'own'
  };
  await sql`insert into artifact_tool ${sql({
    id: artifactToolId,
    tool_key: 'custom-code',
    artifact_id: artifactId,
    config: JSON.stringify({ ...config, activeVersionId: null })
  })}`;
  await sql`insert into artifact_tool_version ${sql({
    id: versionId,
    artifact_tool_id: artifactToolId,
    version: 1,
    status: 'published',
    tools: JSON.stringify(MANIFEST),
    published_at: new Date()
  })}`;
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
            {
              type: 'secret_text',
              name: 'GANJU_TOOL_TOKEN',
              text: mintToken(artifactId, versionId)
            },
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
  await sql`update artifact_tool set config = ${JSON.stringify(config)}::json where id = ${artifactToolId}`;
  console.log('  deployed the probe script');

  section('functions for triggers only');
  const ana = {
    participant: participantId,
    channelId,
    platform: 'whatsapp',
    conversationId
  };
  const anaSession = uuid();
  await rpc(ana, anaSession, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'probe', version: '1' }
  });
  const names = ((await rpc(ana, anaSession, 'tools/list')).tools ?? []).map(
    t => t.name
  );
  check(
    'the assistant gets the exposed function',
    names.includes('visible'),
    names.join(', ')
  );
  check(
    '  ...and none of the trigger-only ones',
    !names.some(n => n.startsWith('t-')),
    names.filter(n => n.startsWith('t-')).join(', ')
  );

  section('triggers: deployed from ganju.json, and one from the dashboard');
  const refused = await call(
    `${data}/trigger`,
    json('POST', { table: 'qa_orders', on: 'insert', function: 'nope' })
  );
  check(
    "a function that isn't published is refused",
    refused.status === 400,
    refused.body?.error
  );
  const hookUrl = await bin.create(500);
  // ganju.json's triggers, with the column tell watches.
  const cliTriggers = statusColumn => [
    { table: 'qa_orders', on: 'insert', function: 't-kitchen' },
    {
      name: 'tell',
      table: 'qa_orders',
      on: 'update',
      when: { [statusColumn]: { changedTo: 'ready' } },
      function: 't-tell'
    },
    { name: 'stamp', table: 'qa_loop', on: 'update', function: 't-stamp' },
    {
      name: 'chain-a',
      table: 'qa_chain',
      on: 'insert',
      when: { kind: { equals: 'a' } },
      function: 't-chain'
    },
    {
      name: 'chain-b',
      table: 'qa_chain',
      on: 'insert',
      when: { kind: { equals: 'b' } },
      function: 't-chain'
    }
  ];
  const deploy = await call(
    `${data}/trigger/deploy`,
    json('POST', {
      triggers: cliTriggers('status')
    })
  );
  check(
    "ganju.json's triggers deploy, managed by the CLI",
    deploy.status === 200 &&
      deploy.body?.triggers?.length === 5 &&
      deploy.body.triggers.every(t => t.managed === 'cli'),
    `${deploy.status} ${deploy.body?.error ?? ''}`
  );
  const hook = await call(
    `${data}/trigger`,
    json('POST', {
      name: 'hook',
      table: 'qa_orders',
      on: 'insert',
      webhook: hookUrl
    })
  );
  const secret = hook.body?.secret;
  check(
    'a webhook trigger answers with its secret once',
    hook.status === 201 && /^whsec_/.test(secret ?? ''),
    hook.body?.error
  );
  const listed = await call(`${data}/trigger`);
  check(
    '  ...and never lists it',
    listed.status === 200 &&
      listed.body?.triggers?.length === 6 &&
      !JSON.stringify(listed.body).includes(secret),
    `${listed.body?.triggers?.length}`
  );
  const editCli = await call(
    `${data}/trigger`,
    json('POST', {
      name: 'tell',
      table: 'qa_orders',
      on: 'insert',
      function: 't-kitchen'
    })
  );
  check(
    'a CLI trigger is not edited from the dashboard',
    editCli.status === 409,
    editCli.body?.error
  );
  const openapi = await (await fetch(`${API}/openapi/data.json`))
    .json()
    .catch(() => null);
  const operations = Object.values(openapi?.paths ?? {}).reduce(
    (n, methods) => n + Object.keys(methods).length,
    0
  );
  check('the OpenAPI file has every route', operations === 38, `${operations}`);

  section('a new order, from the bot');
  const order = await rpc(ana, anaSession, 'tools/call', {
    name: 'data-write',
    arguments: {
      operations: [
        { op: 'insert', table: 'qa_orders', values: { address: 'Calle 1' } }
      ]
    }
  });
  const orderText = (order?.content ?? []).map(b => b.text ?? '').join('');
  const orderId = Number(orderText.match(/"id":\s*(\d+)/)?.[1]);
  check(
    'the bot writes an order',
    Number.isInteger(orderId),
    orderText.slice(0, 200)
  );

  const kitchenRuns = await until(async () => {
    const runs = await runsOf('qa_orders-insert-t-kitchen');
    return runs.some(r => r.status === 'ok') ? runs : null;
  });
  check(
    'the insert ran its function',
    !!kitchenRuns,
    JSON.stringify((await runsOf('qa_orders-insert-t-kitchen'))[0] ?? {})
  );
  const marked = await rowOf('qa_orders', orderId);
  const kitchenEvent = kitchenRuns?.[0]?.eventId;
  check(
    '  ...which wrote the row with its eventId',
    marked?.note === `kitchen:${kitchenEvent}`,
    marked?.note
  );
  const history = await call(`${data}/table/qa_orders/row/${orderId}/history`);
  const kitchenTrigger = listed.body?.triggers?.find(
    t => t.name === 'qa_orders-insert-t-kitchen'
  );
  check(
    '  ...recorded as the trigger',
    history.body?.entries?.some(
      e => e.actor === `trigger:${kitchenTrigger?.id}`
    ),
    JSON.stringify(history.body?.entries?.map(e => e.actor))
  );

  section('the webhook: signed, and the same event again on a forced retry');
  const failedFirst = await until(async () => {
    const runs = await runsOf('hook');
    return runs[0]?.attempts >= 1 && runs[0]?.status === 'failed'
      ? runs[0]
      : null;
  }, 60_000);
  check(
    'a 500 fails the first delivery',
    !!failedFirst,
    JSON.stringify((await runsOf('hook'))[0] ?? {})
  );
  await bin.answer(200);
  const delivered = await until(
    async () => {
      const runs = await runsOf('hook');
      return runs[0]?.status === 'ok' ? runs[0] : null;
    },
    180_000,
    5_000
  );
  check(
    '  ...and the queue retries it until it lands',
    !!delivered,
    JSON.stringify((await runsOf('hook'))[0] ?? {})
  );
  const requests = await bin.requests();
  const ids = requests.map(r => header(r, 'x-ganju-event-id'));
  check(
    'every delivery carries the same eventId',
    requests.length >= 2 && ids.every(id => id && id === ids[0]),
    JSON.stringify(ids)
  );
  const last = requests[requests.length - 1];
  const signature = header(last ?? {}, 'x-ganju-signature') ?? '';
  const [, t, v1] = signature.match(/^t=(\d+),v1=([0-9a-f]{64})$/) ?? [];
  const expected = t
    ? crypto
        .createHmac('sha256', secret)
        .update(`${t}.${last.content}`)
        .digest('hex')
    : '';
  check(
    "  ...signed with the trigger's secret",
    !!v1 && v1 === expected,
    signature
  );
  const payload = JSON.parse(last?.content ?? '{}');
  check(
    '  ...with the row and its event',
    payload.event === 'insert' &&
      payload.table === 'qa_orders' &&
      payload.row?.id === orderId &&
      payload.row?.participant_id === participantId,
    JSON.stringify(payload).slice(0, 200)
  );

  section('changedTo fires once, on the transition');
  await call(
    `${data}/table/qa_orders/row/${orderId}`,
    json('PATCH', { set: { status: 'ready' } })
  );
  await call(
    `${data}/table/qa_orders/row/${orderId}`,
    json('PATCH', { set: { address: 'Calle 2' } })
  );
  const tellRuns = await until(async () => {
    const runs = await runsOf('tell');
    return runs.some(r => r.status === 'ok') ? runs : null;
  });
  await sleep(10_000);
  const tellAll = await runsOf('tell');
  check(
    "setting it ready ran tell once; editing the address didn't",
    !!tellRuns && tellAll.length === 1,
    `${tellAll.length} runs`
  );

  section('WhatsApp outside the 24-hour window, without a template');
  const told = await rowOf('qa_orders', orderId);
  check(
    'ctx.channels.send fails with the readable error',
    /^refused:Outside WhatsApp's 24-hour window.*use an approved template/.test(
      told?.note ?? ''
    ),
    told?.note
  );
  const [recorded] =
    await sql`select count(*)::int as n from channel_message where participant_id = ${participantId} and role = 'assistant'`;
  check(
    '  ...and records nothing on the conversation',
    recorded.n === 0,
    `${recorded.n}`
  );

  section('a function that updates the row it was triggered by');
  const loopRow = await call(
    `${data}/table/qa_loop/row`,
    json('POST', { values: { stamps: 0 } })
  );
  const loopId = loopRow.body?.ids?.[0];
  await call(
    `${data}/table/qa_loop/row/${loopId}`,
    json('PATCH', { set: { stamps: 0 } })
  );
  await until(async () => (await runsOf('stamp')).some(r => r.status === 'ok'));
  await sleep(15_000);
  const stamped = await rowOf('qa_loop', loopId);
  const stampRuns = await runsOf('stamp');
  check(
    'it ran once and stopped',
    stamped?.stamps === 1 && stampRuns.length === 1,
    `stamps ${stamped?.stamps}, ${stampRuns.length} runs`
  );

  section('a chain of triggers stops at depth 3');
  await call(
    `${data}/table/qa_chain/row`,
    json('POST', { values: { kind: 'a' } })
  );
  const stopped = await until(async () => {
    const runs = await runsOf('chain-b');
    return runs.find(
      r => r.status === 'failed' && /depth 3/.test(r.error ?? '')
    );
  }, 120_000);
  check(
    'the fourth link fails with a visible error',
    !!stopped,
    JSON.stringify(await runsOf('chain-b')).slice(0, 300)
  );
  const chainRows = (await call(`${data}/table/qa_chain/row`)).body?.rows ?? [];
  check(
    '  ...after the three before it wrote',
    chainRows.length === 4,
    `${chainRows.length} rows`
  );

  section('Retry, and the runs counted');
  if (stopped) {
    const retried = await call(
      `${data}/trigger/chain-b/run/${stopped.id}/retry`,
      { method: 'POST' }
    );
    check(
      '"Retry" sends a failed run again',
      retried.status === 200 && retried.body?.run?.status === 'waiting',
      retried.body?.error
    );
    const again = await until(async () => {
      const run = (await runsOf('chain-b')).find(r => r.id === stopped.id);
      return run && run.status !== 'waiting' && run.status !== 'running'
        ? run
        : null;
    }, 60_000);
    check(
      '  ...the same event, failing the same way',
      again?.eventId === stopped.eventId && again?.status === 'failed',
      JSON.stringify(again)
    );
  }
  await sleep(5_000);
  const [{ n: runCount }] = await sql`
    select count(*)::int as n from artifact_database_trigger_run r
      join artifact_database d on d.id = r.database_id
     where d.artifact_id = ${artifactId} and r.attempts > 0`;
  const [sub] =
    await sql`select data_trigger_run_count::int as n from subscription where organization_id = ${orgId}`;
  check(
    'data_trigger_run_count counts every run',
    sub.n === runCount && runCount > 0,
    `${sub.n} counted, ${runCount} runs`
  );
  const billing = await call(`/organization/${orgId}/billing`);
  check(
    "the billing page's Data block shows the same number",
    billing.body?.usage?.data?.triggerRuns === runCount,
    JSON.stringify(billing.body?.usage?.data)
  );

  section('renaming a column a trigger uses');
  const renamed = await call(
    `${data}/table/qa_orders/column/status`,
    json('PATCH', { name: 'state' })
  );
  check('status renames to state', renamed.status === 200, renamed.body?.error);
  const tellNow = (await call(`${data}/trigger`)).body?.triggers?.find(
    t => t.name === 'tell'
  );
  check(
    '  ...and tell watches state now',
    JSON.stringify(tellNow?.when) ===
      JSON.stringify({ state: { changedTo: 'ready' } }),
    JSON.stringify(tellNow?.when)
  );
  const tellBefore = (await runsOf('tell')).length;
  await call(
    `${data}/table/qa_orders/row/${orderId}`,
    json('PATCH', { set: { state: 'pending' } })
  );
  await call(
    `${data}/table/qa_orders/row/${orderId}`,
    json('PATCH', { set: { state: 'ready' } })
  );
  const tellAfter = await until(async () => {
    const runs = await runsOf('tell');
    return runs.length > tellBefore && runs[0].status === 'ok' ? runs : null;
  });
  check(
    '  ...and still fires',
    tellAfter?.length === tellBefore + 1,
    JSON.stringify(tellAfter?.[0] ?? {})
  );
  const stale = await call(
    `${data}/trigger/deploy`,
    json('POST', { triggers: cliTriggers('status') })
  );
  check(
    'ganju deploy with the old name is refused',
    stale.status === 400 &&
      /qa_orders\.status, which doesn't exist/.test(stale.body?.error ?? ''),
    `${stale.status} ${stale.body?.error ?? ''}`
  );
  const current = await call(
    `${data}/trigger/deploy`,
    json('POST', { triggers: cliTriggers('state') })
  );
  check(
    '  ...and with the new name it deploys',
    current.status === 200 && current.body?.removed?.length === 0,
    `${current.status} ${current.body?.error ?? ''}`
  );

  section('turned off');
  const off = await call(
    `${data}/trigger/hook`,
    json('PATCH', { enabled: false })
  );
  check(
    'a trigger turns off',
    off.status === 200 && off.body?.trigger?.enabled === false,
    off.body?.error
  );
  const before = (await bin.requests()).length;
  await call(
    `${data}/table/qa_orders/row`,
    json('POST', { values: { address: 'Calle 3' } })
  );
  await sleep(20_000);
  check(
    '  ...and an insert no longer reaches its webhook',
    (await bin.requests()).length === before
  );
  const dropped = await call(`${data}/trigger/hook`, { method: 'DELETE' });
  check(
    'a trigger is deleted',
    dropped.status === 200 && dropped.body?.dropped === 'hook',
    dropped.body?.error
  );
} catch (error) {
  check('probe ran to the end', false, error.stack ?? error.message);
} finally {
  section('cleanup');
  await bin.remove();
  if (deployed) {
    try {
      await cf(
        `/workers/dispatch/namespaces/${NAMESPACE}/scripts/${scriptName}?force=true`,
        { method: 'DELETE' }
      );
      console.log('  removed the probe script');
    } catch (error) {
      check('dispatch script removed', false, error.message);
    }
  }
  const steps = [
    () =>
      sql`delete from mcp_request where session_id in (select id from mcp_session where artifact_id = ${artifactId})`,
    () => sql`delete from mcp_session where artifact_id = ${artifactId}`,
    () =>
      sql`delete from artifact_tool_version where artifact_tool_id in (select id from artifact_tool where artifact_id = ${artifactId})`,
    () => sql`delete from artifact_tool where artifact_id = ${artifactId}`,
    () => sql`delete from channel where artifact_id = ${artifactId}`,
    async () => {
      const [stranded] = await sql`
        update artifact_database
           set status = 'DELETING', deleted_at = now(), deleted_by = 'system:probe',
               delete_after = now() - interval '1 minute'
         where artifact_id = ${artifactId}
         returning id`;
      if (stranded) leftForPurge = stranded.id;
    },
    () => sql`delete from artifact where id = ${artifactId}`,
    () => sql`delete from project_user where project_id = ${projectId}`,
    () => sql`delete from project where id = ${projectId}`,
    () => sql`delete from organization_user where organization_id = ${orgId}`,
    () => sql`delete from usage_period where organization_id = ${orgId}`,
    () => sql`delete from subscription where organization_id = ${orgId}`,
    () => sql`delete from organization where id = ${orgId}`,
    () => sql`delete from session where user_id = ${userId}`,
    () => sql`delete from "user" where id = ${userId}`
  ];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      console.log(`  ..   cleanup step failed: ${error.message}`);
    }
  }
  console.log('  removed the throwaway user, organization and project');
  if (leftForPurge) {
    console.log(
      `  left database ${leftForPurge} DELETING with its grace period over; after the next hourly cron run:\n    node scripts/probe-data-triggers.mjs --purge-check ${leftForPurge}${isProd ? ' --prod' : ''}`
    );
  }
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.rmSync(entry, { force: true });
  await sql.end();
}

console.log(`
By hand, with a real Telegram bot (examples/data-orders, nemo's qa_ tables):
  - a new order from the bot posts "New order #42: 2× Margherita" to the staff group (notify-kitchen, expose: false);
  - setting it ready messages the customer (tell-customer); then ask the bot "is my order ready?";
  - a WhatsApp send with an approved template outside the window reaches the customer.
`);
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
