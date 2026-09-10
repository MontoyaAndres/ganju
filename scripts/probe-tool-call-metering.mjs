// Drives custom-tool metering against the DEPLOYED development stack: a real
// script in the dispatch namespace, called over the real MCP endpoint, with the
// counter read back out of the database the deployed worker wrote it to.
//
//   node scripts/probe-tool-call-metering.mjs
//
// The verify script beside this one calls flushRequests and the budget as
// functions, which proves the arithmetic and nothing about the deployment: not
// that the boot loop passes the organization id, not that the gate runs before
// the dispatch, not that the migration ran on the database the worker talks to.
// This goes through the network at whatever is actually serving.
//
// It needs .env: DATABASE_URL, JWT_SECRET (which signs the session cookie),
// MCP_INTERNAL_SECRET, CLOUDFLARE_ACCOUNT_ID, CUSTOM_CODE_CF_API_TOKEN and
// POLAR_ACCESS_TOKEN. Reading the product and meters back additionally wants
// `products:read` and `meters:read` on that token; without them those checks
// report as pending rather than failing.
//
// Scaffolds a throwaway user + PRO organization + project + artifact and removes
// everything it created, including any script left in the dispatch namespace.
import fs from 'node:fs';
import crypto from 'node:crypto';
import postgres from 'postgres';
import { v7 as uuid } from 'uuid';
import { utils } from '@ganju/utils';

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

// Mirrors of the plan constants. Written out rather than imported so that a
// change to one of them shows up here as a failing deployed probe rather than as
// two files agreeing with each other about the wrong number.
const INCLUDED_TOOL_CALLS = 1_000_000;
const PRO_HARD_CAP = 20_000_000;
const FREE_HARD_CAP = 10_000;

for (const [k, v] of Object.entries({
  DATABASE_URL,
  JWT_SECRET,
  MCP_INTERNAL_SECRET: MCP_SECRET,
  CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
  CUSTOM_CODE_CF_API_TOKEN: CF_TOKEN,
  POLAR_ACCESS_TOKEN: read('POLAR_ACCESS_TOKEN')
})) {
  if (!v) throw new Error(`Missing ${k} in .env`);
}

// `prepare: false` — the pooler caches a plan per statement, and 0070 changed
// the shape of `select * from subscription` mid-life.
const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1, prepare: false });

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

const userId = uuid();
const orgId = uuid();
const projectId = uuid();
const artifactId = uuid();
const slug = `probe-meter-${Date.now().toString(36)}`;
const sessionToken = crypto.randomBytes(32).toString('base64url');

const { mintContainmentToken } = utils;

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

// An artifact that registers NO tools advertises no `tools` capability, so
// `tools/list` answers -32601 rather than an empty list. That is the state a
// suspended artifact is in, and reading it as a crash rather than as "no tools"
// is what makes the containment check below unrunnable.
const listTools = async () => {
  await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'probe', version: '1' }
  });
  try {
    const listed = await rpc('tools/list');
    return listed.tools || [];
  } catch (error) {
    if (String(error.message).includes('-32601')) return [];
    throw error;
  }
};

const callTool = (name, args = {}) =>
  rpc('tools/call', { name, arguments: args });

const subRow = async () =>
  (await sql`select * from subscription where organization_id = ${orgId}`)[0];

const counter = async () => Number((await subRow()).tool_call_count);

const setCounters = values =>
  sql`update subscription set ${sql(values)} where organization_id = ${orgId}`;

// The counter is written in `ctx.waitUntil` after the response, so a read
// immediately after a call can legitimately race it. Poll briefly rather than
// sleeping a fixed amount — a fixed sleep is either flaky or slow.
const counterReaches = async (expected, tries = 25) => {
  for (let i = 0; i < tries; i++) {
    if ((await counter()) === expected) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
};

// Polar, read directly, to check the objects the DEPLOYED worker bills against.
// The worker reads the product id from a secret, so a correct .env proves
// nothing about what it actually charges.
const POLAR_TOKEN = read('POLAR_ACCESS_TOKEN');
const POLAR_HOST =
  read('POLAR_SERVER') === 'production'
    ? 'https://api.polar.sh'
    : 'https://sandbox-api.polar.sh';
const polar = async path => {
  const res = await fetch(`${POLAR_HOST}/v1/${path}`, {
    headers: {
      Authorization: `Bearer ${POLAR_TOKEN}`,
      Accept: 'application/json'
    }
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  // Read scopes are separate from the write scopes the runtime needs, so a 403
  // here means an under-scoped token rather than a missing object.
  return { status: res.status, forbidden: res.status === 403, body };
};

// A meter's `name` is a display name; the event name it matches lives in its
// filter, as an `eq` clause on the `name` property. That indirection is why a
// mismatch is silent — the meter reads fine and counts nothing.
const eventNameOf = meter => {
  const walk = node => {
    if (!node) return undefined;
    for (const clause of node.clauses || []) {
      if (clause.clauses) {
        const nested = walk(clause);
        if (nested) return nested;
      } else if (clause.property === 'name' && clause.operator === 'eq') {
        return clause.value;
      }
    }
    return undefined;
  };
  return walk(meter.filter);
};

const artifactBase = `/organization/${orgId}/project/${projectId}/artifact`;
const ccBase = `${artifactBase}/custom-code`;

const EDITOR_SOURCE = `import { createHandler, defineTool } from './ganju-sdk.js';

export default createHandler({
  'meter-echo': defineTool(async (input, ctx) => {
    ctx.log('meter-echo ' + input.word);
    return { word: input.word };
  }),
  'meter-throw': defineTool(async () => {
    throw new Error('this call failed on purpose');
  })
});
`;

const MANIFEST = [
  {
    name: 'meter-echo',
    title: 'Meter echo',
    description: 'Echoes a word back.',
    inputSchema: {
      type: 'object',
      properties: { word: { type: 'string' } },
      required: ['word']
    },
    outputSchema: {
      type: 'object',
      properties: { word: { type: 'string' } },
      required: ['word']
    }
  },
  {
    name: 'meter-throw',
    title: 'Meter throw',
    description: 'Always fails.',
    inputSchema: { type: 'object', properties: {} }
  }
];

console.log(`\nScaffolding ${slug} (artifact ${artifactId})\n`);

try {
  await sql`insert into "user" ${sql({
    id: userId,
    name: 'probe metering',
    // A real domain, not `@example.invalid`. The checkout below forwards this
    // address to the provider, which validates it and refuses reserved or
    // special-use TLDs with a 422 — where Stripe accepted anything. Nothing is
    // ever sent here: an unpaid checkout session emails nobody, and the user is
    // deleted in the finally block.
    email: `probe-meter-${Date.now()}@ganju.ai`,
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
    name: 'probe-tool-call-metering',
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
    status: 'active',
    // Stamped the way ensureSubscription stamps it. An unstamped row reads as a
    // period that has ended, and the first budget check would roll it — zeroing
    // the counter this probe is about to watch.
    message_period_start: new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
    )
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

  // --- 1. deploy something real -------------------------------------------
  section('deploying a function into the namespace');

  const created = await api(`${ccBase}/version`, {
    method: 'POST',
    body: JSON.stringify({ manifest: { tools: MANIFEST } })
  });
  check(
    'a draft version is created',
    created.status === 200 && !!created.body?.id,
    JSON.stringify(created.body).slice(0, 200)
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
  check('the source uploads', uploaded.status === 200);

  const published = await api(`${ccBase}/version/${versionId}/publish`, {
    method: 'POST'
  });
  check(
    'publish deploys to the dispatch namespace',
    published.status === 200,
    JSON.stringify(published.body).slice(0, 200)
  );

  const tools = await listTools();
  check(
    'both functions register at boot',
    ['meter-echo', 'meter-throw'].every(n => tools.some(t => t.name === n)),
    tools.map(t => t.name).join(', ')
  );

  // A publish runs a smoke test through the dispatcher, and the test panel's
  // preview runs are dispatches too — but neither is a customer's tool call, and
  // neither goes through the metered path.
  check(
    'publishing did not move the counter',
    (await counter()) === 0,
    `counter ${await counter()}`
  );

  // --- 2. the counter moves on a real dispatch ----------------------------
  section('counting real calls');

  const echoed = await callTool('meter-echo', { word: 'deployed' });
  check(
    'the call runs the deployed script',
    echoed.structuredContent?.word === 'deployed',
    JSON.stringify(echoed.structuredContent || echoed.content?.[0]?.text || '')
  );
  check(
    '  ...and the deployed worker counted it',
    await counterReaches(1),
    `counter ${await counter()}`
  );

  await callTool('meter-echo', { word: 'two' });
  await callTool('meter-echo', { word: 'three' });
  check(
    'each dispatch counts once',
    await counterReaches(3),
    `counter ${await counter()}`
  );

  const threw = await callTool('meter-throw');
  check(
    'a function that throws still returns a tool error',
    threw.isError === true,
    JSON.stringify(threw.content?.[0]?.text || '').slice(0, 120)
  );
  check(
    '  ...and still counts — it spent the compute',
    await counterReaches(4),
    `counter ${await counter()}`
  );

  // tools/list and initialize are protocol traffic, not dispatches.
  await listTools();
  check(
    'listing tools counts nothing',
    (await counter()) === 4,
    `counter ${await counter()}`
  );

  const afterCalls = await subRow();
  check(
    'the period was not rolled underneath the counter',
    afterCalls.message_period_start !== null &&
      Number(afterCalls.tool_call_count) === 4
  );

  // --- 3. the included allowance is not a wall ----------------------------
  section('the included allowance vs the hard cap');

  await setCounters({ tool_call_count: INCLUDED_TOOL_CALLS + 5_000 });
  const overIncluded = await callTool('meter-echo', { word: 'billing' });
  check(
    'past the included million a call still runs',
    overIncluded.structuredContent?.word === 'billing',
    'it bills, it does not fail'
  );
  check(
    '  ...and is counted',
    await counterReaches(INCLUDED_TOOL_CALLS + 5_001),
    `counter ${await counter()}`
  );

  // --- 4. the hard cap refuses, through a real client ---------------------
  section('the hard cap');

  await setCounters({ tool_call_count: PRO_HARD_CAP });
  const capped = await callTool('meter-echo', { word: 'capped' });
  const cappedText = capped.content?.[0]?.text || '';
  check(
    'at the hard cap the call is refused',
    capped.isError === true,
    JSON.stringify(cappedText).slice(0, 160)
  );
  check(
    '  ...with a message naming the limit',
    cappedText.includes('20,000,000') && /custom tool calls/i.test(cappedText),
    cappedText.slice(0, 160)
  );
  check(
    '  ...and a refusal costs no compute, so it counts nothing',
    (await counter()) === PRO_HARD_CAP,
    `counter ${await counter()}`
  );

  const [refusal] = await sql`
    select r.error_message from mcp_request r
      join mcp_session s on s.id = r.session_id
     where s.artifact_id = ${artifactId}
     order by r.created_at desc limit 1`;
  check(
    '  ...recorded on mcp_request with the reason',
    refusal?.error_message === 'custom tool call cap reached',
    refusal?.error_message
  );

  // The tools must still be LISTED while capped: a tool that disappears from
  // tools/list is a failure its owner cannot see.
  const cappedTools = await listTools();
  check(
    'the tools stay listed while capped',
    cappedTools.some(t => t.name === 'meter-echo'),
    'the refusal is an answer, not a disappearance'
  );

  await setCounters({ tool_call_count: PRO_HARD_CAP - 10 });
  const recovered = await callTool('meter-echo', { word: 'back' });
  check(
    'below the cap it works again — the refusal is not sticky',
    recovered.structuredContent?.word === 'back'
  );

  // --- 5. a downgraded organization ---------------------------------------
  section('a downgraded organization keeps serving, within a bound');

  await setCounters({ plan: 'FREE', tool_call_count: FREE_HARD_CAP - 5 });
  const onFree = await callTool('meter-echo', { word: 'downgraded' });
  check(
    'a Free org with a published script still serves its tools',
    onFree.structuredContent?.word === 'downgraded',
    'a failed card must not delete a working integration'
  );

  await setCounters({ tool_call_count: FREE_HARD_CAP });
  const freeCapped = await callTool('meter-echo', { word: 'stop' });
  const freeText = freeCapped.content?.[0]?.text || '';
  check(
    '  ...and stops at the Free backstop',
    freeCapped.isError === true,
    JSON.stringify(freeText).slice(0, 160)
  );
  check(
    '  ...with the upgrade wording, not the support wording',
    /upgrade/i.test(freeText) && freeText.includes('10,000'),
    freeText.slice(0, 160)
  );

  await setCounters({ plan: 'PRO' });

  // --- 6. the dashboard reads it ------------------------------------------
  section('the billing endpoint');

  await setCounters({ tool_call_count: 7_777 });
  const billing = await api(`/organization/${orgId}/billing`);
  check(
    'the deployed billing endpoint reports the counter',
    billing.body?.usage?.toolCallsUsed === 7_777,
    String(billing.body?.usage?.toolCallsUsed)
  );
  check(
    '  ...and the included allowance',
    billing.body?.usage?.includedToolCalls === INCLUDED_TOOL_CALLS,
    String(billing.body?.usage?.includedToolCalls)
  );
  check(
    '  ...and the rate the marketing page quotes',
    billing.body?.pricing?.toolCallPerMillionUsd === 5,
    String(billing.body?.pricing?.toolCallPerMillionUsd)
  );

  // --- 7. suspension actually stops it ------------------------------------
  section('the containment lever');

  await sql`update artifact_tool set enabled = false where artifact_id = ${artifactId} and tool_key = 'custom-code'`;
  const suspendedTools = await listTools();
  check(
    'a disabled custom-code row stops registering its tools',
    !suspendedTools.some(t => t.name === 'meter-echo'),
    suspendedTools.map(t => t.name).join(', ') || '(none)'
  );
  await sql`update artifact_tool set enabled = true where artifact_id = ${artifactId} and tool_key = 'custom-code'`;
  const restoredTools = await listTools();
  check(
    '  ...and re-enabling brings them back',
    restoredTools.some(t => t.name === 'meter-echo')
  );

  // --- 8. the containment link, end to end --------------------------------
  section('the stop link a usage alert carries');

  // Minted here rather than waiting for the hourly digest: the token is a pure
  // function of the secret, so this is the same value that email would carry.
  const stopToken = await mintContainmentToken(orgId, JWT_SECRET);
  const stopPath = `/containment/${stopToken}`;

  const beforeGet = await sql`
    select enabled from artifact_tool
    where artifact_id = ${artifactId} and tool_key = 'custom-code'`;

  const shown = await fetch(`${API}${stopPath}`);
  const shownBody = await shown.text();
  check(
    'the link renders a confirmation page',
    shown.status === 200 && shownBody.includes('Stop custom tools?'),
    `HTTP ${shown.status}`
  );
  check(
    '  ...naming the organization and the server it would stop',
    shownBody.includes(slug),
    slug
  );

  const afterGet = await sql`
    select enabled from artifact_tool
    where artifact_id = ${artifactId} and tool_key = 'custom-code'`;
  check(
    '  ...and the GET changed nothing',
    afterGet[0].enabled === beforeGet[0].enabled &&
      afterGet[0].enabled === true,
    'a mail client prefetching the URL must not stop anyone’s tools'
  );

  const acted = await fetch(`${API}${stopPath}`, { method: 'POST' });
  const actedBody = await acted.text();
  check(
    'the form POST stops them',
    acted.status === 200 && actedBody.includes('Stopped'),
    `HTTP ${acted.status}`
  );
  const afterPost = await sql`
    select enabled from artifact_tool
    where artifact_id = ${artifactId} and tool_key = 'custom-code'`;
  check(
    '  ...by disabling the install, not deleting anything',
    afterPost[0].enabled === false
  );
  const survived = await sql`
    select count(*)::int as n from artifact_tool_version
    where artifact_tool_id in (
      select id from artifact_tool where artifact_id = ${artifactId})`;
  check(
    '  ...with the versions still there',
    survived[0].n > 0,
    `${survived[0].n} version(s)`
  );
  check(
    '  ...and the tools gone from the MCP server',
    !(await listTools()).some(t => t.name === 'meter-echo')
  );

  const badToken = await mintContainmentToken(
    orgId,
    'not-this-deployments-key'
  );
  const badRes = await fetch(`${API}/containment/${badToken}`);
  check(
    'a link signed by another key is refused',
    badRes.status === 410,
    `HTTP ${badRes.status}`
  );

  // Put it back the way the owner would, so the checkout section below runs
  // against an artifact in its normal state.
  await sql`update artifact_tool set enabled = true where artifact_id = ${artifactId} and tool_key = 'custom-code'`;
  const secondPost = await fetch(`${API}${stopPath}`, { method: 'POST' });
  check(
    'the same link works again while it is still valid',
    secondPost.status === 200,
    'it is a capability with a lifetime, not a one-shot'
  );
  await sql`update artifact_tool set enabled = true where artifact_id = ${artifactId} and tool_key = 'custom-code'`;

  // --- 9. checkout, built by the deployed worker --------------------------
  section('the checkout the deployed worker builds');

  // Checkout refuses an organization that is already paid, so this asks as a
  // Free one — which is also the only shape that ever reaches this route.
  await setCounters({ plan: 'FREE', tool_call_count: 0 });

  const checkout = await api(`/organization/${orgId}/billing/checkout`, {
    method: 'POST'
  });
  check(
    'the deployed worker builds a checkout session',
    checkout.status === 200 && typeof checkout.body?.url === 'string',
    JSON.stringify(checkout.body).slice(0, 200)
  );

  if (checkout.body?.url) {
    const host = new URL(checkout.body.url).hostname;
    check(
      '  ...on the provider host this environment is pointed at',
      host.endsWith('polar.sh'),
      host
    );

    // The design change worth asserting: nothing is created up front. The
    // organization id goes out as `external_customer_id` and Polar makes the
    // customer at checkout, which is what deleted `ensureStripeCustomer` and the
    // ordering it forced. A row that already had an id here would mean the old
    // pre-create path had somehow survived.
    const [sub] = await sql`
      select billing_customer_id from subscription where organization_id = ${orgId}`;
    check(
      '  ...without pre-creating a billing customer',
      sub?.billing_customer_id == null,
      'the webhook fills this in once the customer actually pays'
    );
  }

  // --- 10. the product every rate hangs off -------------------------------
  section('the product the deployed worker charges against');

  // This replaces the five-line-item assertion the Stripe path needed. There are
  // no line items to assemble any more: one product carries the base fee and all
  // four metered rates, so the product IS the pricing, and checking it is
  // checking what a customer would actually be billed.
  const productId = read('POLAR_PRODUCT_PRO');
  check('POLAR_PRODUCT_PRO is set', !!productId, productId || 'unset');

  const product = productId
    ? await polar(`products/${productId}`)
    : { forbidden: false, status: 0, body: {} };

  if (product.forbidden) {
    console.log(
      '  pend   the product cannot be read — POLAR_ACCESS_TOKEN lacks products:read'
    );
  } else if (productId) {
    check(
      'the product the secret names exists',
      product.status === 200,
      product.status === 200 ? product.body.name : `HTTP ${product.status}`
    );

    const prices = product.body?.prices || [];
    const fixed = prices.filter(pr => pr.amount_type === 'fixed');
    const metered = prices.filter(pr => pr.amount_type === 'metered_unit');

    check(
      '  ...billed monthly',
      product.body?.recurring_interval === 'month',
      String(product.body?.recurring_interval)
    );
    check(
      '  ...with the $29 base price',
      fixed.length === 1 && fixed[0].price_amount === 2900,
      fixed.length ? `${fixed[0].price_amount} cents` : 'no fixed price'
    );
    check(
      '  ...and all four metered rates on the same product',
      metered.length === 4,
      `${metered.length} metered prices`
    );

    // An unset rate used to be a silent skip in checkout; now the equivalent
    // failure is a product missing a metered price, which is equally silent —
    // the cron goes on reporting usage that nothing prices.
    const meters = await polar('meters/?limit=100');
    if (meters.forbidden) {
      console.log(
        '  pend   the meters cannot be read — POLAR_ACCESS_TOKEN lacks meters:read'
      );
      console.log(
        '         the four rates are present; that they point at OUR meters is unverified.'
      );
    } else {
      const nameById = Object.fromEntries(
        (meters.body.items || []).map(m => [m.id, eventNameOf(m)])
      );
      const wired = metered.map(pr => nameById[pr.meter_id]).filter(Boolean);
      // Written out rather than imported, for the same reason as the plan
      // numbers above: importing the constant would have this file and the code
      // agree with each other about a name neither of them checks against the
      // meter. These four are what the meters must filter on.
      for (const expected of [
        'ganju_channel_messages',
        'ganju_shared_messages',
        'ganju_embedded_storage',
        'ganju_custom_tool_calls'
      ]) {
        check(
          `  ...one priced against ${expected}`,
          wired.includes(expected),
          wired.join(', ') || 'none matched'
        );
      }

      const toolCallPrice = metered.find(
        pr => nameById[pr.meter_id] === 'ganju_custom_tool_calls'
      );
      check(
        '  ...the tool-call rate priced per single call',
        Number(toolCallPrice?.unit_amount) === 0.0005,
        `${toolCallPrice?.unit_amount} cents per call — $5 per million`
      );
    }
  }
} finally {
  section('Cleaning up');

  for (const name of await artifactScripts()) {
    const res = await cf(
      `/workers/dispatch/namespaces/${NAMESPACE}/scripts/${name}?force=true`,
      { method: 'DELETE' }
    );
    console.log(
      `  ${res.status === 200 || res.status === 404 ? 'removed' : 'FAILED '} ${name}`
    );
  }

  // Nothing to undo at the provider. The checkout session this run opened was
  // never paid and expires on its own, and no customer was created — the whole
  // point of `external_customer_id` is that there is no object to clean up until
  // somebody actually buys something.

  await sql`delete from mcp_request where session_id in (select id from mcp_session where artifact_id = ${artifactId})`;
  await sql`delete from mcp_session where artifact_id = ${artifactId}`;
  await sql`delete from artifact_execution where artifact_id = ${artifactId}`;
  await sql`delete from artifact_tool_version where artifact_tool_id in (select id from artifact_tool where artifact_id = ${artifactId})`;
  await sql`delete from artifact_tool where artifact_id = ${artifactId}`;
  await sql`delete from artifact where id = ${artifactId}`;
  await sql`delete from project_user where project_id = ${projectId}`;
  await sql`delete from project where id = ${projectId}`;
  await sql`delete from subscription where organization_id = ${orgId}`;
  await sql`delete from organization_user where organization_id = ${orgId}`;
  await sql`delete from organization where id = ${orgId}`;
  await sql`delete from session where user_id = ${userId}`;
  await sql`delete from "user" where id = ${userId}`;

  const [{ n }] =
    await sql`select count(*)::int as n from organization where id = ${orgId}`;
  check('scaffold removed', n === 0);
  const leftoverScripts = await artifactScripts();
  check(
    'no script left in the namespace',
    leftoverScripts.length === 0,
    leftoverScripts.join(', ')
  );

  await sql.end();
}

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) console.log(`\nFailed: ${failures.join(' · ')}`);
console.log('');
process.exit(fail ? 1 : 0);
