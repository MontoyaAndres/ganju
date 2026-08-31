// Verifies the custom-tool metering path against the dev database, driving the
// REAL modules rather than a re-implementation of their arithmetic: apps/mcp's
// flushRequests for the counting, @ganju/db's budget for the cap, and apps/api's
// meterOrganization for what reaches Stripe.
//
//   node scripts/verify-tool-call-metering.mjs           # dev  (.env)
//   node scripts/verify-tool-call-metering.mjs --prod    # prod (.env.prod)
//
// Stripe is a stub that records the events it was handed, so nothing is billed
// and no key is needed. Everything else is real, including the writes — the
// scaffold is a throwaway organization → project → artifact, and it is removed
// at the end.
//
// meterOrganization is driven for that one organization deliberately. The cron
// entrypoint sweeps every paid org in the database, which on a shared dev
// database would roll other people's periods and advance their reported marks.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import esbuild from 'esbuild';
import postgres from 'postgres';
import { v7 as uuid } from 'uuid';

const isProd = process.argv.includes('--prod');
const envFile = isProd ? '../.env.prod' : '../.env';
const env = fs.readFileSync(new URL(envFile, import.meta.url), 'utf8');
const read = key => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();

const DATABASE_URL = read('DATABASE_URL');
// `prepare: false` because the pooler in front of this database caches a plan
// per statement, and 0070 changed the shape of `select * from subscription`
// mid-life: a cached plan from before it answers "cached plan must not change
// result type" on the first read here.
const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1, prepare: false });

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

// Bundle every module under test together with @ganju/db and @ganju/utils, and
// take all of them out of the same bundle. Importing the packages separately
// would hand drizzle two copies of every table object — different module
// instances mean different symbols, and the query builder silently stops
// recognising them.
const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ganju-verify-'));
const outfile = path.join(bundleDir, 'metering.mjs');
const root = new URL('..', import.meta.url).pathname;
const entry = path.join(root, `.verify-entry-${process.pid}.ts`);
const from = rel => JSON.stringify(path.join(root, rel));

fs.writeFileSync(
  entry,
  [
    `export { meterOrganization } from ${from('apps/api/src/utils/metering')};`,
    `export { Plan } from ${from('apps/api/src/utils/plan')};`,
    `export { flushRequests, upsertSession } from ${from('apps/mcp/src/utils/recordUsage')};`,
    `export { db } from '@ganju/db';`,
    `export { utils } from '@ganju/utils';`
  ].join('\n')
);

await esbuild.build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  absWorkingDir: root,
  tsconfig: path.join(root, 'apps/api/tsconfig.json'),
  // postgres.js is CommonJS and reaches for node builtins with require(), which
  // an ESM bundle has no binding for. This gives it one.
  banner: {
    js: "import { createRequire as __cr } from 'node:module';\nconst require = __cr(import.meta.url);"
  },
  logLevel: 'error'
});

const { meterOrganization, Plan, flushRequests, upsertSession, db, utils } =
  await import(outfile);

const dbInstance = db.create({
  env: { HYPERDRIVE: { connectionString: DATABASE_URL } }
});

const { constants } = utils;
const LIMITS = constants.PLAN_LIMITS;

// A Stripe stand-in that records what it was asked to bill. Same shape the real
// client exposes, and nothing else — meterOrganization only ever calls this one
// method.
const makeStripe = () => {
  const events = [];
  return {
    events,
    billing: {
      meterEvents: {
        async create(event) {
          events.push(event);
          return event;
        }
      }
    }
  };
};

const totalFor = (stripe, eventName) =>
  stripe.events
    .filter(e => e.event_name === eventName)
    .reduce((n, e) => n + Number(e.payload.value), 0);

// plan constants — no database needed, so these run before anything is scaffolded

console.log('\nplan limits\n');

check(
  'Pro includes a million custom tool calls',
  LIMITS.PRO.includedToolCalls === 1_000_000,
  String(LIMITS.PRO.includedToolCalls)
);
check(
  'Pro carries an abuse backstop above it',
  LIMITS.PRO.toolCallHardCap > LIMITS.PRO.includedToolCalls,
  `${LIMITS.PRO.toolCallHardCap} > ${LIMITS.PRO.includedToolCalls}`
);
check(
  'Free includes none — it cannot deploy code',
  LIMITS.FREE.includedToolCalls === 0
);
check(
  'Free still has a backstop, for a downgraded org whose script is still live',
  LIMITS.FREE.toolCallHardCap > 0,
  String(LIMITS.FREE.toolCallHardCap)
);
check(
  'Enterprise has no backstop — it is negotiated, not capped',
  LIMITS.ENTERPRISE.toolCallHardCap === null
);
check(
  'the meter event name is the one the Stripe meter must carry',
  constants.STRIPE_METER_TOOL_CALLS === 'ganju_custom_tool_calls',
  constants.STRIPE_METER_TOOL_CALLS
);

// scaffold

const [owner] =
  await sql`select id from "user" order by created_at asc limit 1`;
if (!owner) throw new Error('No user in this database to own the scaffold');

const orgId = uuid();
const projectId = uuid();
const artifactId = uuid();
const toolId = uuid();
const customerId = `cus_verify_${Date.now()}`;
const slug = `verify-tool-calls-${Date.now()}`;

console.log(`\nScaffolding org ${orgId}\n`);

await sql`insert into organization ${sql({ id: orgId, name: 'verify-tool-call-metering', owner_id: owner.id })}`;
// Created the way the platform creates one, rather than by hand: the row's
// starting state is part of what is under test here, and an insert written in
// this file could stamp a period the real path forgets to.
await Plan.ensureSubscription(dbInstance, orgId);
await sql`update subscription set plan = 'PRO', status = 'active', stripe_customer_id = ${customerId} where organization_id = ${orgId}`;
await sql`insert into project ${sql({ id: projectId, name: 'verify', created_by_id: owner.id, organization_id: orgId })}`;
await sql`insert into artifact ${sql({ id: artifactId, slug, project_id: projectId })}`;
await sql`insert into artifact_tool ${sql({
  id: toolId,
  artifact_id: artifactId,
  tool_key: constants.TOOL_DEFINITION_KEY_CUSTOM_CODE,
  config: sql.json({})
})}`;

const subRow = async () =>
  (await sql`select * from subscription where organization_id = ${orgId}`)[0];

const setCounters = values =>
  sql`update subscription set ${sql(values)} where organization_id = ${orgId}`;

const setPlan = plan => setCounters({ plan });

// One pending row of each kind, shaped the way apps/mcp pushes them.
const customCodeRow = (name = 'lookup-order') => ({
  method: constants.MCP_REQUEST_METHOD_TOOLS_CALL,
  toolName: name,
  artifactToolId: toolId,
  customCodeCall: true,
  input: {},
  output: { ok: true },
  latencyMs: 4
});
const nativeRow = (name = 'greeting') => ({
  method: constants.MCP_REQUEST_METHOD_TOOLS_CALL,
  toolName: name,
  input: {},
  output: { ok: true },
  latencyMs: 4
});

let sessionSeq = 0;
const flush = async (requests, { viaChannel = false } = {}) => {
  const session = await upsertSession(dbInstance, {
    artifactId,
    externalSessionId: `verify:${++sessionSeq}`,
    authKind: constants.MCP_AUTH_KIND_JWT,
    userId: undefined,
    userAgent: 'verify/1.0',
    ipAddress: null,
    clientName: 'verify',
    clientVersion: '1.0'
  });
  await flushRequests(dbInstance, session.id, artifactId, orgId, requests, {
    userId: null,
    clientName: 'verify',
    viaChannel
  });
};

try {
  console.log('counting\n');

  check('counter starts at zero', (await subRow()).tool_call_count === 0);
  // A rollover zeroes the counters, and an unstamped period reads as one that
  // has ended — so a new subscription that recorded usage before its first
  // budget check would have that usage discarded. Stamping at creation is what
  // stops the counting path from depending on which check ran first.
  check(
    'a new subscription is already inside a period',
    (await subRow()).message_period_start !== null
  );

  await flush([customCodeRow()]);
  check('one dispatch counts one', (await subRow()).tool_call_count === 1);

  await flush([customCodeRow('a'), customCodeRow('b'), customCodeRow('c')]);
  check(
    'a batch counts each dispatch in it',
    (await subRow()).tool_call_count === 4,
    'one statement, three calls'
  );

  await flush([nativeRow(), nativeRow('web-search')]);
  check(
    'native tools do not count',
    (await subRow()).tool_call_count === 4,
    'a shipped integration is one screened fetch, not metered compute'
  );

  await flush([nativeRow(), customCodeRow()]);
  check(
    'a mixed request counts only the custom half',
    (await subRow()).tool_call_count === 5
  );

  // The subtle one: the channel runner owns the EXECUTION audit for turns it
  // proxied, so flushRequests returns early for those — but it counts messages,
  // not dispatches. A channel turn that called a custom tool spent the compute
  // just the same, and it must be counted exactly once, here.
  const executionsBefore = (
    await sql`select count(*)::int as n from artifact_execution where artifact_id = ${artifactId}`
  )[0].n;
  await flush([customCodeRow()], { viaChannel: true });
  const executionsAfter = (
    await sql`select count(*)::int as n from artifact_execution where artifact_id = ${artifactId}`
  )[0].n;
  check(
    'a channel-proxied dispatch still counts',
    (await subRow()).tool_call_count === 6,
    'compute is a different axis from inference'
  );
  check(
    '  ...and still writes no execution row',
    executionsAfter === executionsBefore,
    'the runner owns that half — counting it here would double it'
  );

  await Plan.incrementToolCallUsage(dbInstance, orgId, 0);
  check(
    'incrementing by zero is a no-op',
    (await subRow()).tool_call_count === 6
  );
  await Plan.incrementToolCallUsage(dbInstance, orgId, -5);
  check(
    'incrementing by a negative is a no-op',
    (await subRow()).tool_call_count === 6,
    'never a path to credit usage back'
  );

  console.log('\nthe budget gate\n');

  let budget = await Plan.checkToolCallBudget(dbInstance, orgId);
  check('a Pro org well under the cap is allowed', budget.allowed);
  check('  ...reports the plan', budget.plan === 'PRO', budget.plan);
  check(
    '  ...reports what is included',
    budget.included === LIMITS.PRO.includedToolCalls
  );
  check('  ...reports the usage', budget.used === 6, String(budget.used));

  await setCounters({ tool_call_count: LIMITS.PRO.includedToolCalls + 1 });
  budget = await Plan.checkToolCallBudget(dbInstance, orgId);
  check(
    'crossing the INCLUDED allowance does not stop anything',
    budget.allowed,
    'past it a call bills, it does not fail'
  );

  await setCounters({ tool_call_count: LIMITS.PRO.toolCallHardCap - 1 });
  check(
    'one call below the hard cap is allowed',
    (await Plan.checkToolCallBudget(dbInstance, orgId)).allowed
  );
  await setCounters({ tool_call_count: LIMITS.PRO.toolCallHardCap });
  check(
    'at the hard cap it is refused',
    !(await Plan.checkToolCallBudget(dbInstance, orgId)).allowed
  );

  await setPlan('FREE');
  await setCounters({ tool_call_count: LIMITS.FREE.toolCallHardCap - 1 });
  check(
    'a downgraded org keeps serving under the Free backstop',
    (await Plan.checkToolCallBudget(dbInstance, orgId)).allowed,
    'a failed card must not delete a working integration'
  );
  await setCounters({ tool_call_count: LIMITS.FREE.toolCallHardCap });
  budget = await Plan.checkToolCallBudget(dbInstance, orgId);
  check('  ...and stops at it', !budget.allowed);
  check(
    '  ...reporting the Free ceiling',
    budget.hardCap === LIMITS.FREE.toolCallHardCap
  );

  await setPlan('ENTERPRISE');
  await setCounters({ tool_call_count: 500_000_000 });
  budget = await Plan.checkToolCallBudget(dbInstance, orgId);
  check(
    'Enterprise is never stopped by a cap it did not negotiate',
    budget.allowed && budget.hardCap === null,
    '500,000,000 calls, still allowed'
  );

  // An unentitled subscription falls back to Free limits everywhere else; it has
  // to here too, or cancelling would lift the backstop instead of lowering it.
  await setPlan('PRO');
  await setCounters({
    status: 'canceled',
    tool_call_count: LIMITS.FREE.toolCallHardCap
  });
  budget = await Plan.checkToolCallBudget(dbInstance, orgId);
  check(
    'a cancelled subscription is held to the Free backstop',
    !budget.allowed && budget.plan === 'FREE',
    budget.plan
  );
  await setCounters({ status: 'active' });

  console.log('\nreporting to Stripe\n');

  const included = LIMITS.PRO.includedToolCalls;
  await setPlan('PRO');
  await setCounters({
    tool_call_count: included - 1,
    reported_tool_call_overage: 0,
    message_count: 0,
    shared_message_count: 0,
    message_period_start: new Date()
  });

  let stripe = makeStripe();
  await meterOrganization(dbInstance, stripe, orgId);
  check(
    'nothing is reported below the included allowance',
    totalFor(stripe, constants.STRIPE_METER_TOOL_CALLS) === 0,
    `${stripe.events.length} events`
  );
  check(
    '  ...and the mark stays at zero',
    (await subRow()).reported_tool_call_overage === 0
  );

  await setCounters({ tool_call_count: included + 250 });
  stripe = makeStripe();
  await meterOrganization(dbInstance, stripe, orgId);
  check(
    'the overage above the allowance is reported',
    totalFor(stripe, constants.STRIPE_METER_TOOL_CALLS) === 250,
    `${totalFor(stripe, constants.STRIPE_METER_TOOL_CALLS)} calls`
  );
  check(
    '  ...as a raw call count against the tool-call meter',
    stripe.events.some(
      e =>
        e.event_name === constants.STRIPE_METER_TOOL_CALLS &&
        e.payload.stripe_customer_id === customerId &&
        e.payload.value === '250'
    )
  );
  check(
    '  ...and the high-water mark advances',
    (await subRow()).reported_tool_call_overage === 250
  );
  check(
    '  ...without touching the message meters',
    totalFor(stripe, constants.STRIPE_METER_MESSAGES) === 0 &&
      totalFor(stripe, constants.STRIPE_METER_SHARED_MESSAGES) === 0,
    'each axis bills on its own counter'
  );

  stripe = makeStripe();
  await meterOrganization(dbInstance, stripe, orgId);
  check(
    'a second run with no new usage reports nothing',
    totalFor(stripe, constants.STRIPE_METER_TOOL_CALLS) === 0,
    'this is what keeps the hourly cron from re-billing the same calls'
  );

  await setCounters({ tool_call_count: included + 400 });
  stripe = makeStripe();
  await meterOrganization(dbInstance, stripe, orgId);
  check(
    'only the increment since the last run is reported',
    totalFor(stripe, constants.STRIPE_METER_TOOL_CALLS) === 150,
    '400 owed, 250 already billed'
  );
  check(
    '  ...and the mark catches up',
    (await subRow()).reported_tool_call_overage === 400
  );

  console.log('\nthe period\n');

  // A period that started before the stored boundary is the ordinary monthly
  // rollover. Every counter on the row belongs to that period, so all of them
  // move together — a tool-call counter that survived a rollover would bill the
  // new month against the old month's usage.
  await setCounters({
    message_period_start: new Date('2020-01-01T00:00:00Z'),
    message_count: 900,
    shared_message_count: 100,
    tool_call_count: included + 400,
    reported_tool_call_overage: 400
  });
  const rolled = await Plan.checkToolCallBudget(dbInstance, orgId);
  check('the rollover zeroes the tool-call counter', rolled.used === 0);
  const after = await subRow();
  check(
    '  ...and its reported mark',
    after.reported_tool_call_overage === 0,
    'so the new period can bill from zero'
  );
  check(
    '  ...along with the message counters, in one move',
    after.message_count === 0 && after.shared_message_count === 0,
    'one period, one boundary'
  );

  stripe = makeStripe();
  await meterOrganization(dbInstance, stripe, orgId);
  check(
    'the fresh period reports nothing on the new counter',
    totalFor(stripe, constants.STRIPE_METER_TOOL_CALLS) === 0
  );

  console.log('\nthe usage summary\n');

  await setCounters({ tool_call_count: 4_321 });
  const usage = await Plan.getOrganizationUsage(dbInstance, orgId);
  check(
    'the billing dashboard reads the same counter',
    usage.toolCallsUsed === 4_321,
    String(usage.toolCallsUsed)
  );
  check(
    '  ...and the same allowance',
    usage.includedToolCalls === LIMITS.PRO.includedToolCalls
  );

  // An org with no Stripe customer has nothing to report to. Free orgs are the
  // ordinary case, and the sweep skips them before it reads anything else.
  await setCounters({
    stripe_customer_id: null,
    tool_call_count: included + 10
  });
  stripe = makeStripe();
  await meterOrganization(dbInstance, stripe, orgId);
  check(
    'an org with no billing account reports nothing',
    stripe.events.length === 0,
    'and its counter is left alone'
  );
} finally {
  console.log('\nCleaning up\n');
  await sql`delete from mcp_request where session_id in (select id from mcp_session where artifact_id = ${artifactId})`;
  await sql`delete from mcp_session where artifact_id = ${artifactId}`;
  await sql`delete from artifact_execution where artifact_id = ${artifactId}`;
  await sql`delete from artifact_tool where artifact_id = ${artifactId}`;
  await sql`delete from artifact where id = ${artifactId}`;
  await sql`delete from project where id = ${projectId}`;
  await sql`delete from subscription where organization_id = ${orgId}`;
  await sql`delete from organization where id = ${orgId}`;
  const leftover =
    await sql`select count(*)::int as n from organization where id = ${orgId}`;
  check('scaffold removed', leftover[0].n === 0);

  fs.rmSync(bundleDir, { recursive: true, force: true });
  fs.rmSync(entry, { force: true });
  await sql.end();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
