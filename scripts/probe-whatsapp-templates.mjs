// Drives WhatsApp message templates against the DEPLOYED dev stack (or
// production with --prod).
//
//   node scripts/probe-whatsapp-templates.mjs
//   node scripts/probe-whatsapp-templates.mjs --live <whatsapp channel id> [--skip-create]
//   node scripts/probe-whatsapp-templates.mjs --purge-check <artifact_database id> [--prod]
//
// Needs .env (or .env.prod with --prod): DATABASE_URL, JWT_SECRET,
// MCP_INTERNAL_SECRET, CLOUDFLARE_ACCOUNT_ID, CUSTOM_CODE_CF_API_TOKEN and
// CUSTOM_CODE_TOKEN_SECRET.
//
// Scaffolds a throwaway user and Pro organization with a project, its
// database and a published script, and a WhatsApp channel whose token Meta
// refuses, with templates seeded in its cache. Then checks:
//   - the templates API: the cached list, a sync that explains a bad token or
//     an unknown business account instead of failing, Meta's rules checked
//     before a template is sent, a token Meta doesn't accept for the number;
//   - the status webhook: unsigned refused, PAUSED, REINSTATED, a new
//     category and DELETED applied to the cache;
//   - ctx.channels.templates() lists approved templates only, with labels;
//   - ctx.channels.send refuses a template that is missing, in review or
//     rejected, or given the wrong number of values, in words, and an
//     approved one reaches Meta (whose refusal of the token reads as words);
//   - a "message the row's customer" trigger with a template in review fails
//     its run with that reason.
//
// --live <channel id> also uses that channel's real credentials (a dev
// WhatsApp number) on a second throwaway channel, with its latest customer
// as the recipient. It creates a Utility template in Meta, waits for the
// approval, and runs a trigger on status → ready: the template for a
// customer who last wrote two days ago, the text once they wrote a minute
// ago. Both messages really reach that customer's phone. The template is
// deleted in Meta at the end.
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
const argAfter = flag => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
};

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
const LIVE_CHANNEL = argAfter('--live');
// Meta usually approves a test template in a minute or two.
const APPROVAL_WAIT_MS =
  Number(process.env.PROBE_APPROVAL_MINUTES ?? 10) * 60_000;

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
const until = async (fn, ms = 90_000, every = 3_000) => {
  const end = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) return value;
    await sleep(every);
  }
};

const purgeCheck = argAfter('--purge-check');
if (purgeCheck) {
  const [row] =
    await sql`select * from artifact_database where id = ${purgeCheck}`;
  check('the purge emptied the database', row?.status === 'DELETED');
  if (row?.status === 'DELETED') {
    await sql`delete from artifact_database where id = ${purgeCheck}`;
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
const slug = `probe-wa-templates-${stamp}`;
const project = `/organization/${orgId}/project/${projectId}`;
const data = `${project}/artifact/data`;

// MCP, as a channel bot

let rpcId = 0;
const rpc = async (auth, sessionId, method, params) => {
  const res = await fetch(`${MCP_ORIGIN}/${slug}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-session-id': sessionId,
      [constants.MCP_INTERNAL_HEADER]: MCP_SECRET,
      'user-agent': constants.MCP_CHANNEL_CLIENT_USER_AGENT,
      [constants.MCP_CHANNEL_ID_HEADER]: auth.channelId,
      [constants.MCP_CHANNEL_PLATFORM_HEADER]: 'whatsapp',
      [constants.MCP_CHANNEL_CONVERSATION_HEADER]: auth.conversationId,
      [constants.MCP_CHANNEL_PARTICIPANT_HEADER]: auth.participantId
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
const session = async auth => {
  const id = uuid();
  await rpc(auth, id, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'probe', version: '1' }
  });
  return id;
};
// A function's JSON answer, called as the bot would.
const callTool = async (auth, sessionId, name, args) => {
  const result = await rpc(auth, sessionId, 'tools/call', {
    name,
    arguments: args
  });
  // A bot's tool results come wrapped as untrusted content.
  const text = (result?.content ?? [])
    .map(b => b.text ?? '')
    .join('')
    .replace(/^\s*<untrusted_content[^>]*>\s*/, '')
    .replace(/\s*<\/untrusted_content[^>]*>\s*$/, '');
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

// The script: what a function sees of ctx.channels.

const PROBE_SOURCE = `
import { createHandler, defineTool } from '@ganju/sdk';

export default createHandler({
  'templates': defineTool(async (_input, ctx) => ({
    templates: await ctx.channels.templates()
  })),
  'send': defineTool(async (input, ctx) => {
    try {
      const sent = await ctx.channels.send(input);
      return { sent: sent.sent };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  })
});
`;

const ANY = { type: 'object', properties: {} };
const SEND = {
  type: 'object',
  properties: {
    participantId: { type: 'string' },
    text: { type: 'string' },
    template: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        language: { type: 'string' },
        params: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  required: ['participantId']
};
const MANIFEST = [
  {
    name: 'templates',
    description: 'Lists the approved WhatsApp templates.',
    inputSchema: ANY,
    channels: true
  },
  {
    name: 'send',
    description: 'Sends a message to a customer.',
    inputSchema: SEND,
    channels: true
  }
];

const b64url = buf =>
  Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const mintToken = versionId => {
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

const APP_SECRET = 'probe-app-secret';
const BODY =
  'Tu pedido #{{1}} está listo para recoger. ¡Gracias por tu compra!';
const components = (body, examples) =>
  utils.whatsappTemplateComponents({
    name: 'x',
    language: 'es',
    category: 'UTILITY',
    body,
    examples
  });

// A WhatsApp channel of the probe's project, with a customer and their chat.
const addChannel = async ({ credentials, externalUserId, lastWrote }) => {
  const channelId = uuid();
  const participantId = uuid();
  const conversationId = uuid();
  await sql`insert into channel ${sql({
    id: channelId,
    platform: 'whatsapp',
    credentials,
    webhook_secret: 'probe',
    artifact_id: artifactId
  })}`;
  await sql`insert into channel_participant ${sql({ id: participantId, external_user_id: externalUserId, channel_id: channelId })}`;
  await sql`insert into channel_conversation ${sql({ id: conversationId, external_conversation_id: externalUserId, scope: 'private', channel_id: channelId })}`;
  await wrote(conversationId, participantId, lastWrote);
  return { channelId, participantId, conversationId };
};
const wrote = (conversationId, participantId, at) =>
  sql`insert into channel_message ${sql({
    id: uuid(),
    role: 'user',
    content: 'hola',
    conversation_id: conversationId,
    participant_id: participantId,
    created_at: at
  })}`;
const seed = (channelId, template) =>
  sql`insert into channel_whatsapp_template ${sql({
    id: uuid(),
    channel_id: channelId,
    language: 'es',
    category: 'UTILITY',
    rejected_reason: null,
    variable_labels: null,
    ...template,
    components: JSON.stringify(template.components)
  })}`;
const templateRow = (channelId, name) =>
  sql`select * from channel_whatsapp_template where channel_id = ${channelId} and name = ${name}`.then(
    rows => rows[0]
  );
const signedWebhook = (channelId, payload, secret = APP_SECRET) => {
  const body = JSON.stringify(payload);
  return fetch(`${API}/channel/${channelId}/webhook/whatsapp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret
        ? {
            'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`
          }
        : {})
    },
    body
  });
};
const statusEvent = (templateId, event, extra = {}) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '1000000000001',
      changes: [
        {
          field: 'message_template_status_update',
          value: { event, message_template_id: Number(templateId), ...extra }
        }
      ]
    }
  ]
});
const runsOf = async name =>
  (await call(`${data}/trigger/${name}/run`)).body?.runs ?? [];
const settledRun = name =>
  until(
    async () => {
      const runs = await runsOf(name);
      return runs.find(r => r.status === 'ok' || r.status === 'failed');
    },
    120_000,
    4_000
  );

const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ganju-probe-wa-'));
const entry = path.join(root, `.probe-wa-entry-${process.pid}.ts`);
const scriptName = `artifact_${artifactId}`;
let deployed = false;
let leftForPurge = null;
// --skip-create: the live part stops before making a template in Meta.
class SkipLive extends Error {}
let liveTemplate = null;
let keepTemplate = false;

console.log(`\nProbing ${API} and ${MCP_ORIGIN} (${slug})`);

try {
  await sql`insert into "user" ${sql({ id: userId, name: 'probe wa templates', email: `${userId}@probe.test` })}`;
  await sql`insert into session ${sql({ id: uuid(), user_id: userId, token: sessionToken, expires_at: new Date(Date.now() + 3600_000) })}`;
  await sql`insert into organization ${sql({ id: orgId, name: slug, owner_id: userId })}`;
  await sql`insert into subscription ${sql({ id: uuid(), organization_id: orgId, plan: 'PRO', status: 'active' })}`;
  await sql`insert into organization_user ${sql({ user_id: userId, organization_id: orgId, role: 'ADMIN' })}`;
  await sql`insert into project ${sql({ id: projectId, name: 'probe wa templates', created_by_id: userId, organization_id: orgId })}`;
  await sql`insert into project_user ${sql({ user_id: userId, project_id: projectId, role: 'ADMIN' })}`;
  await sql`insert into artifact ${sql({ id: artifactId, slug, project_id: projectId })}`;

  // A token Meta refuses, a known business account, and a customer who last
  // wrote two days ago. A second channel knows no account.
  const fake = await addChannel({
    credentials: JSON.stringify({
      accessToken: 'probe-not-a-token',
      phoneNumberId: '0',
      verifyToken: 'probe',
      appSecret: APP_SECRET,
      businessAccountId: '1000000000001'
    }),
    externalUserId: '573000000000',
    lastWrote: new Date(Date.now() - 2 * 86_400_000)
  });
  const unknown = await addChannel({
    credentials: JSON.stringify({
      accessToken: 'probe-not-a-token',
      phoneNumberId: '0',
      verifyToken: 'probe',
      appSecret: APP_SECRET
    }),
    externalUserId: '573000000001',
    lastWrote: new Date()
  });
  await seed(fake.channelId, {
    template_id: '9000000000001',
    name: 'order_ready',
    status: 'APPROVED',
    components: components(BODY, ['42']),
    variable_labels: JSON.stringify(['order number'])
  });
  await seed(fake.channelId, {
    template_id: '9000000000002',
    name: 'order_pending',
    status: 'PENDING',
    components: components(BODY, ['42'])
  });
  await seed(fake.channelId, {
    template_id: '9000000000003',
    name: 'promo',
    category: 'MARKETING',
    status: 'REJECTED',
    rejected_reason: 'PROMOTIONAL',
    components: components('Hoy 2x1 en pizzas, solo por hoy.', [])
  });
  await seed(fake.channelId, {
    template_id: '9000000000005',
    name: 'with_photo',
    status: 'APPROVED',
    components: [
      { type: 'HEADER', format: 'IMAGE' },
      ...components('Mira tu pedido antes de recogerlo.', [])
    ]
  });
  await seed(fake.channelId, {
    template_id: '9000000000004',
    name: 'to_delete',
    status: 'APPROVED',
    components: components('Un aviso de prueba para borrar.', [])
  });
  const base = id => `${project}/channel/${id}/whatsapp`;

  section('the templates API');
  const listed = await call(`${base(fake.channelId)}/template`);
  if (listed.status === 401) {
    throw new Error(
      'The session cookie was rejected: check JWT_SECRET and DATABASE_URL match the deployed API.'
    );
  }
  check(
    'the cached list, with the business account',
    listed.status === 200 &&
      listed.body?.businessAccountId === '1000000000001' &&
      listed.body?.templates?.length === 5,
    `${listed.status} ${listed.body?.templates?.length}`
  );
  const ready = listed.body?.templates?.find(t => t.name === 'order_ready');
  check(
    '  ...each read back from its components, with its labels',
    ready?.body === BODY &&
      ready?.variableCount === 1 &&
      ready?.examples?.[0] === '42' &&
      ready?.labels?.[0] === 'order number',
    JSON.stringify(ready)?.slice(0, 200)
  );
  const photo = listed.body?.templates?.find(t => t.name === 'with_photo');
  check(
    "  ...one with a media header marked as one Ganju can't send",
    photo?.sendable === false && ready?.sendable === true,
    `${photo?.sendable} ${ready?.sendable}`
  );
  const promo = listed.body?.templates?.find(t => t.name === 'promo');
  check(
    "  ...and a rejected one with Meta's reason",
    promo?.status === 'REJECTED' && promo?.rejectedReason === 'PROMOTIONAL',
    JSON.stringify(promo)?.slice(0, 120)
  );
  const badToken = await call(`${base(fake.channelId)}/template/sync`, {
    method: 'POST'
  });
  check(
    'a token Meta refuses gets an explanation, not an error',
    badToken.status === 200 &&
      ['token', 'permission'].includes(badToken.body?.access) &&
      !!badToken.body?.error &&
      badToken.body?.templates?.length === 5,
    `${badToken.status} ${badToken.body?.access}: ${badToken.body?.error}`
  );
  const [readRecord] =
    await sql`select metadata from channel where id = ${fake.channelId}`;
  check(
    '  ...and the failed read is recorded on the channel',
    readRecord?.metadata?.whatsappTemplatesRead?.ok === false,
    JSON.stringify(readRecord?.metadata)
  );
  const noAccount = await call(`${base(unknown.channelId)}/template/sync`, {
    method: 'POST'
  });
  check(
    "an account Meta can't name is asked for",
    noAccount.status === 200 &&
      noAccount.body?.access === 'no_account' &&
      noAccount.body?.businessAccountId === null,
    `${noAccount.status} ${noAccount.body?.access}`
  );
  const ruleBroken = await call(
    `${base(fake.channelId)}/template`,
    json('POST', {
      name: 'probe_rules',
      language: 'es',
      category: 'UTILITY',
      body: '{{1}} {{2}}',
      examples: ['a']
    })
  );
  check(
    "Meta's rules are checked before sending, in words",
    ruleBroken.status === 400 &&
      /starts with a variable/.test(ruleBroken.body?.error ?? '') &&
      /side by side/.test(ruleBroken.body?.error ?? '') &&
      /example value/.test(ruleBroken.body?.error ?? ''),
    ruleBroken.body?.error
  );
  const authentication = await call(
    `${base(fake.channelId)}/template`,
    json('POST', {
      name: 'probe_otp',
      language: 'es',
      category: 'AUTHENTICATION',
      body: 'Tu código es este, no lo compartas.'
    })
  );
  check(
    'the Authentication category is refused',
    authentication.status === 400,
    JSON.stringify(authentication.body)?.slice(0, 160)
  );
  const toMeta = await call(
    `${base(fake.channelId)}/template`,
    json('POST', {
      name: 'probe_valid',
      language: 'es',
      category: 'UTILITY',
      body: BODY,
      examples: ['42']
    })
  );
  check(
    'a valid template reaches Meta, whose refusal is shown',
    toMeta.status === 409 && toMeta.body?.reason === 'token',
    `${toMeta.status} ${JSON.stringify(toMeta.body)}`
  );
  const newToken = await call(
    `${base(fake.channelId)}/account`,
    json('PUT', { accessToken: 'probe-another-bad-token-123456' })
  );
  check(
    "a new token Meta doesn't accept for the number is refused",
    newToken.status === 400 && /didn't accept/.test(newToken.body?.error ?? ''),
    `${newToken.status} ${newToken.body?.error}`
  );

  section('the status webhook');
  const unsigned = await signedWebhook(
    fake.channelId,
    statusEvent('9000000000001', 'PAUSED'),
    null
  );
  check('unsigned, it is refused', unsigned.status === 401, unsigned.status);
  const paused = await signedWebhook(
    fake.channelId,
    statusEvent('9000000000001', 'PAUSED', { reason: 'LOW_QUALITY' })
  );
  check(
    'PAUSED reaches the cache, with the reason',
    paused.status === 200 &&
      !!(await until(
        async () => {
          const row = await templateRow(fake.channelId, 'order_ready');
          return (
            row?.status === 'PAUSED' && row.rejected_reason === 'LOW_QUALITY'
          );
        },
        20_000,
        1_000
      )),
    (await templateRow(fake.channelId, 'order_ready'))?.status
  );
  const reinstated = await signedWebhook(
    fake.channelId,
    statusEvent('9000000000001', 'REINSTATED', { reason: 'NONE' })
  );
  check(
    '  ...and REINSTATED approves it again',
    reinstated.status === 200 &&
      !!(await until(
        async () => {
          const row = await templateRow(fake.channelId, 'order_ready');
          return row?.status === 'APPROVED' && row.rejected_reason === null;
        },
        20_000,
        1_000
      )),
    (await templateRow(fake.channelId, 'order_ready'))?.status
  );
  await signedWebhook(fake.channelId, {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '1000000000001',
        changes: [
          {
            field: 'template_category_update',
            value: {
              message_template_id: 9000000000002,
              previous_category: 'UTILITY',
              new_category: 'MARKETING'
            }
          }
        ]
      }
    ]
  });
  check(
    'a new category from Meta reaches the cache',
    !!(await until(
      async () =>
        (await templateRow(fake.channelId, 'order_pending'))?.category ===
        'MARKETING',
      20_000,
      1_000
    ))
  );
  await signedWebhook(fake.channelId, statusEvent('9000000000004', 'DELETED'));
  check(
    'DELETED removes it',
    !!(await until(
      async () => !(await templateRow(fake.channelId, 'to_delete')),
      20_000,
      1_000
    ))
  );

  section('the database and a published script');
  const created = await call(data, { method: 'POST', body: '{}' });
  check('Pro creates it', created.status === 201, created.status);
  const table = await call(
    `${data}/table`,
    json('POST', {
      name: 'qa_orders',
      access: 'full',
      customerScoped: true,
      columns: [
        {
          name: 'status',
          type: 'enum',
          values: ['pending', 'ready'],
          default: 'pending'
        }
      ]
    })
  );
  check('table qa_orders', table.status === 201, table.body?.error);

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
              text: mintToken(versionId)
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
    new Blob([fs.readFileSync(outfile)], {
      type: 'application/javascript+module'
    }),
    'index.js'
  );
  await cf(`/workers/dispatch/namespaces/${NAMESPACE}/scripts/${scriptName}`, {
    method: 'PUT',
    body: form
  });
  deployed = true;
  await sql`update artifact_tool set config = ${JSON.stringify(config)}::json where id = ${artifactToolId}`;
  console.log('  deployed the probe script');

  section('ctx.channels with templates');
  const ana = fake;
  const anaSession = await session(ana);
  const listedFn = await callTool(ana, anaSession, 'templates', {});
  const names = (listedFn.templates ?? []).map(t => t.name);
  check(
    'templates() lists only the approved ones',
    names.length === 1 && names[0] === 'order_ready',
    JSON.stringify(listedFn).slice(0, 200)
  );
  check(
    '  ...with its text, labels and examples',
    listedFn.templates?.[0]?.text === BODY &&
      listedFn.templates?.[0]?.variables?.[0]?.label === 'order number' &&
      listedFn.templates?.[0]?.variables?.[0]?.example === '42' &&
      listedFn.templates?.[0]?.channelId === fake.channelId,
    JSON.stringify(listedFn.templates?.[0]?.variables)
  );
  const send = template =>
    callTool(ana, anaSession, 'send', {
      participantId: ana.participantId,
      template
    });
  // The read just failed (a token Meta refuses): Ganju doesn't know the
  // account's templates, so one it hasn't seen goes to Meta, which decides.
  const unknownAfterFailure = await send({
    name: 'nope',
    language: 'es',
    params: []
  });
  check(
    "after a failed read, a template Ganju hasn't seen goes to Meta",
    /^WhatsApp: The channel's access token expired or was revoked/.test(
      unknownAfterFailure.error ?? ''
    ),
    unknownAfterFailure.error ?? JSON.stringify(unknownAfterFailure)
  );
  // As if the last read had worked: now Ganju knows it isn't there.
  await sql`update channel set metadata = ${sql.json({ whatsappTemplatesRead: { at: new Date().toISOString(), ok: true } })} where id = ${fake.channelId}`;
  const missing = await send({ name: 'nope', language: 'es', params: [] });
  check(
    'after a read that worked, a template the account lacks is refused in words',
    /isn't on this channel's WhatsApp Business account/.test(
      missing.error ?? ''
    ),
    missing.error ?? JSON.stringify(missing)
  );
  const inReview = await send({
    name: 'order_pending',
    language: 'es',
    params: ['42']
  });
  check(
    '  ...and one in review',
    /still in Meta's review/.test(inReview.error ?? ''),
    inReview.error ?? JSON.stringify(inReview)
  );
  const rejected = await send({ name: 'promo', language: 'es', params: [] });
  check(
    "  ...and a rejected one, with Meta's reason",
    /rejected by Meta \(PROMOTIONAL\)/.test(rejected.error ?? ''),
    rejected.error ?? JSON.stringify(rejected)
  );
  const photoSend = await send({
    name: 'with_photo',
    language: 'es',
    params: []
  });
  check(
    "  ...and one Ganju can't fill",
    /has a media header/.test(photoSend.error ?? ''),
    photoSend.error ?? JSON.stringify(photoSend)
  );
  const wrongCount = await send({
    name: 'order_ready',
    language: 'es',
    params: []
  });
  check(
    '  ...and the wrong number of values',
    /has 1 variable; 0 values were given/.test(wrongCount.error ?? ''),
    wrongCount.error ?? JSON.stringify(wrongCount)
  );
  const approved = await send({
    name: 'order_ready',
    language: 'es',
    params: ['42\nwith a line break']
  });
  check(
    'an approved one goes to Meta, whose refusal reads as words',
    /^WhatsApp: The channel's access token expired or was revoked/.test(
      approved.error ?? ''
    ),
    approved.error ?? JSON.stringify(approved)
  );
  // A channel whose templates can't be read: the template goes to Meta as
  // named, as before Ganju tracked them, and Meta decides.
  const bea = unknown;
  const beaSession = await session(bea);
  const unread = await callTool(bea, beaSession, 'send', {
    participantId: bea.participantId,
    template: { name: 'never_seen', language: 'es', params: ['1', '2'] }
  });
  check(
    "without a readable list, a template Ganju hasn't seen goes to Meta",
    /^WhatsApp: The channel's access token expired or was revoked/.test(
      unread.error ?? ''
    ),
    unread.error ?? JSON.stringify(unread)
  );
  const [recorded] =
    await sql`select count(*)::int as n from channel_message where participant_id = ${ana.participantId} and role = 'assistant'`;
  check(
    '  ...and none of them is recorded as sent',
    recorded.n === 0,
    recorded.n
  );

  section('a trigger whose template is in review');
  const trigger = await call(
    `${data}/trigger`,
    json('POST', {
      name: 'tell',
      table: 'qa_orders',
      on: 'update',
      when: { status: { changedTo: 'ready' } },
      replace: false,
      customer: {
        text: 'Tu pedido #{{id}} está listo.',
        template: { name: 'order_pending', language: 'es', params: ['{{id}}'] }
      }
    })
  );
  check('the trigger saves', trigger.status === 201, trigger.body?.error);
  const order = await callTool(ana, anaSession, 'data-write', {
    operations: [{ op: 'insert', table: 'qa_orders', values: {} }]
  }).catch(error => ({ raw: error.message }));
  const orderId = Number(
    JSON.stringify(order).match(/\\?"id\\?":\s*(\d+)/)?.[1]
  );
  check(
    'the bot writes an order',
    Number.isInteger(orderId),
    JSON.stringify(order).slice(0, 160)
  );
  await call(
    `${data}/table/qa_orders/row/${orderId}`,
    json('PATCH', { set: { status: 'ready' } })
  );
  const failedRun = await settledRun('tell');
  check(
    "the run fails with Meta's state, in words",
    failedRun?.status === 'failed' &&
      /still in Meta's review/.test(failedRun?.error ?? ''),
    `${failedRun?.status}: ${failedRun?.error}`
  );

  if (LIVE_CHANNEL) {
    section(`live, with channel ${LIVE_CHANNEL}'s number`);
    const [source] =
      await sql`select credentials, platform from channel where id = ${LIVE_CHANNEL}`;
    const [customer] = await sql`
      select p.external_user_id from channel_message m
        join channel_participant p on p.id = m.participant_id
       where p.channel_id = ${LIVE_CHANNEL} and m.role = 'user'
       order by m.created_at desc limit 1`;
    if (source?.platform !== 'whatsapp' || !customer) {
      throw new Error(
        'The live channel must be a WhatsApp channel a customer has written to.'
      );
    }
    console.log(
      `  the customer is ${customer.external_user_id.slice(0, -4)}****`
    );
    // Its credentials as stored, and that customer, who in this database
    // last wrote two days ago. Meta sees only the real number.
    const live = await addChannel({
      credentials: source.credentials,
      externalUserId: customer.external_user_id,
      lastWrote: new Date(Date.now() - 2 * 86_400_000)
    });
    const synced = await call(`${base(live.channelId)}/template/sync`, {
      method: 'POST'
    });
    check(
      "the real token reads the account's templates",
      synced.body?.access === 'ok' && synced.body?.templates?.length > 0,
      `${synced.status} ${synced.body?.access} ${synced.body?.error ?? ''} (${synced.body?.templates?.length} templates)`
    );
    // A template Meta approved that Ganju has stored as still in review, read
    // 10 minutes ago and with no webhook since: a send reads Meta again.
    const helloRow = synced.body?.templates?.find(
      t => t.name === 'hello_world' && t.status === 'APPROVED'
    );
    if (helloRow) {
      const old = new Date(Date.now() - 10 * 60_000);
      await sql`update channel_whatsapp_template set status = 'PENDING', synced_at = ${old} where id = ${helloRow.id}`;
      await sql`update channel set metadata = ${sql.json({ whatsappTemplatesRead: { at: old.toISOString(), ok: true } })} where id = ${live.channelId}`;
      const liveSession = await session(live);
      const resent = await callTool(live, liveSession, 'send', {
        participantId: live.participantId,
        template: {
          name: 'hello_world',
          language: helloRow.language,
          params: []
        }
      });
      const [after] =
        await sql`select status from channel_whatsapp_template where id = ${helloRow.id}`;
      check(
        'a template stored as in review that Meta approved is read again and sent',
        resent.sent === 'template' && after?.status === 'APPROVED',
        `${JSON.stringify(resent)} — stored now ${after?.status}`
      );
    } else {
      console.log(
        '  ..   no approved hello_world on this account; skipped the re-read check'
      );
    }
    if (process.argv.includes('--skip-create')) throw new SkipLive();
    const name = `qa_order_ready_${stamp}`;
    const made = await call(
      `${base(live.channelId)}/template`,
      json('POST', {
        name,
        language: 'es',
        category: 'UTILITY',
        body: BODY,
        examples: ['42'],
        labels: ['order number']
      })
    );
    liveTemplate = made.body?.id
      ? { channelId: live.channelId, id: made.body.id }
      : null;
    check(
      `a Utility template goes to Meta for review (${name})`,
      made.status === 200 && !!made.body?.templateId,
      `${made.status} ${made.body?.status ?? made.body?.error}`
    );
    console.log(
      `  waiting up to ${APPROVAL_WAIT_MS / 60_000} minutes for Meta's review…`
    );
    const reviewed = await until(
      async () => {
        const state = await call(`${base(live.channelId)}/template/sync`, {
          method: 'POST'
        });
        const row = state.body?.templates?.find(t => t.name === name);
        return row && row.status !== 'PENDING' ? row : null;
      },
      APPROVAL_WAIT_MS,
      15_000
    );
    if (reviewed) {
      check(
        '  ...and Meta approves it',
        reviewed.status === 'APPROVED',
        `${reviewed.status} ${reviewed.rejectedReason ?? ''}`
      );
    } else {
      // Meta's review can take up to a day: not a failure of ours. The
      // template stays, to watch it change in the channel's Message templates.
      console.log(
        `  ..   still in Meta's review after ${APPROVAL_WAIT_MS / 60_000} minutes; ${name} is kept so its approval shows in the dashboard`
      );
      keepTemplate = true;
    }
    const [webhooked] =
      await sql`select status from channel_whatsapp_template where channel_id = ${LIVE_CHANNEL} and name = ${name}`;
    console.log(
      `  the live channel's own cache, from Meta's status webhook: ${webhooked?.status ?? 'not received (the webhook field may be off)'}`
    );

    // The new template once approved; else one the account already has,
    // with the fewest variables, Utility first.
    const pool =
      (await call(`${base(live.channelId)}/template`)).body?.templates?.filter(
        t => t.status === 'APPROVED'
      ) ?? [];
    const use =
      reviewed?.status === 'APPROVED'
        ? reviewed
        : pool.sort(
            (a, b) =>
              (a.category === 'UTILITY' ? 0 : 1) -
                (b.category === 'UTILITY' ? 0 : 1) ||
              a.variableCount - b.variableCount
          )[0];
    if (use && use.name !== name) {
      console.log(
        `  sending with ${use.name} (${use.language}), already approved, instead`
      );
    }
    if (use) {
      const liveTrigger = await call(
        `${data}/trigger`,
        json('POST', {
          name: 'tell-live',
          table: 'qa_orders',
          on: 'update',
          when: { status: { changedTo: 'ready' } },
          replace: false,
          customer: {
            text: 'Prueba de Ganju: tu pedido #{{id}} está listo (texto, dentro de las 24 horas).',
            template: {
              name: use.name,
              language: use.language,
              params: Array.from({ length: use.variableCount }, () => '{{id}}')
            }
          }
        })
      );
      check(
        'a trigger on status → ready',
        liveTrigger.status === 201,
        liveTrigger.body?.error
      );
      await call(`${data}/trigger/tell`, { method: 'DELETE' });
      const liveSession = await session(live);
      const placeOrder = async () => {
        const result = await callTool(live, liveSession, 'data-write', {
          operations: [{ op: 'insert', table: 'qa_orders', values: {} }]
        });
        return Number(JSON.stringify(result).match(/\\?"id\\?":\s*(\d+)/)?.[1]);
      };
      const assistantMessages = () =>
        sql`select content, metadata from channel_message where participant_id = ${live.participantId} and role = 'assistant' order by created_at`;

      const outside = await placeOrder();
      await call(
        `${data}/table/qa_orders/row/${outside}`,
        json('PATCH', { set: { status: 'ready' } })
      );
      const outsideRun = await settledRun('tell-live');
      const sentTemplate = (await assistantMessages())[0];
      check(
        'outside the window, the trigger sends the template with the order number',
        outsideRun?.status === 'ok' &&
          sentTemplate?.metadata?.template?.name === use.name &&
          (use.variableCount === 0 ||
            sentTemplate?.metadata?.template?.params?.[0] ===
              String(outside)) &&
          sentTemplate?.content ===
            utils.fillWhatsappTemplate(
              use.body,
              Array.from({ length: use.variableCount }, () => String(outside))
            ),
        `${outsideRun?.status} ${outsideRun?.error ?? ''} — ${sentTemplate?.content}`
      );

      await wrote(live.conversationId, live.participantId, new Date());
      const inside = await placeOrder();
      await call(
        `${data}/table/qa_orders/row/${inside}`,
        json('PATCH', { set: { status: 'ready' } })
      );
      const insideRun = await until(
        async () => {
          const runs = await runsOf('tell-live');
          return runs.length >= 2 && ['ok', 'failed'].includes(runs[0].status)
            ? runs[0]
            : null;
        },
        120_000,
        4_000
      );
      const sentText = (await assistantMessages())[1];
      check(
        'inside the window, the same trigger sends the text',
        insideRun?.status === 'ok' &&
          !sentText?.metadata?.template &&
          sentText?.content?.includes(`#${inside}`),
        `${insideRun?.status} ${insideRun?.error ?? ''} — ${sentText?.content}`
      );
      console.log("  both messages should now be on the customer's phone");
    }
  }
} catch (error) {
  if (!(error instanceof SkipLive))
    check('probe ran to the end', false, error.stack ?? error.message);
} finally {
  section('cleanup');
  if (liveTemplate && keepTemplate) {
    console.log('  kept the live template, still in review');
  } else if (liveTemplate) {
    const removed = await call(
      `${project}/channel/${liveTemplate.channelId}/whatsapp/template/${liveTemplate.id}`,
      { method: 'DELETE' }
    );
    check(
      'the live template is deleted in Meta',
      removed.status === 200,
      removed.body?.error
    );
  }
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
      `  left database ${leftForPurge} DELETING with its grace period over; after the next hourly cron run:\n    node scripts/probe-whatsapp-templates.mjs --purge-check ${leftForPurge}${isProd ? ' --prod' : ''}`
    );
  }
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.rmSync(entry, { force: true });
  await sql.end();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
