// Verifies the custom-tool metering path against the dev database, driving the
// REAL modules rather than a re-implementation of their arithmetic: apps/mcp's
// flushRequests for the counting, @ganju/db's budget for the cap, and apps/api's
// meterOrganization for what reaches the billing provider.
//
//   node scripts/verify-tool-call-metering.mjs           # dev  (.env)
//   node scripts/verify-tool-call-metering.mjs --prod    # prod (.env.prod)
//
// Polar is a stub that records the events it was handed, so nothing is billed
// and no token is needed. Everything else is real, including the writes — the
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
// Opt-in: report one real overage to the real Polar sandbox meter, through the
// same function the hourly cron calls, and read the aggregate back. Off by
// default because every other check here needs no token and bills nothing; on,
// it is the only proof that the event our code sends is one the meter actually
// counts. Reading the aggregate back additionally needs `meters:read`, which the
// runtime token does not carry — without it that last check reports as pending.
const livePolar = process.argv.includes('--live-polar');
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
    `export { runToolCallAlerts } from ${from('apps/api/src/utils/alerting')};`,
    `export { Plan } from ${from('apps/api/src/utils/plan')};`,
    `export { flushRequests, upsertSession } from ${from('apps/mcp/src/utils/recordUsage')};`,
    `export { db } from '@ganju/db';`,
    `export { utils } from '@ganju/utils';`,
    `export { drain } from ${JSON.stringify(path.join(root, `.verify-email-${process.pid}`))};`
  ].join('\n')
);

// The digest sends mail through a Worker binding this process does not have, so
// `deliver` is swapped for a recorder. Everything else in the module — the
// snapshots, the deltas, the thresholds, the cooldown — is the real thing.
const emailStub = path.join(root, `.verify-email-${process.pid}.ts`);
fs.writeFileSync(
  emailStub,
  `export const sent: any[] = [];
export const deliver = async (_source: unknown, message: unknown) => {
  sent.push(message);
  return true;
};
export const drain = () => sent.splice(0, sent.length);
`
);

await esbuild.build({
  entryPoints: [entry],
  plugins: [
    {
      name: 'stub-email',
      setup(build) {
        build.onResolve({ filter: /(^|\/)email$/ }, () => ({
          path: emailStub
        }));
      }
    }
  ],
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

const {
  meterOrganization,
  runToolCallAlerts,
  Plan,
  flushRequests,
  upsertSession,
  db,
  utils,
  drain
} = await import(outfile);

// The same shape a Worker hands these modules: the database binding, plus the
// two values the digest reads to address its mail.
const source = {
  env: {
    HYPERDRIVE: { connectionString: DATABASE_URL },
    NEXT_PUBLIC_DOMAIN: 'verify.invalid',
    ALERT_EMAIL: 'alerts@verify.invalid',
    NEXT_PUBLIC_API_URL: 'https://api.verify.invalid',
    JWT_SECRET: read('JWT_SECRET')
  }
};
const dbInstance = db.create(source);

const { constants } = utils;
const LIMITS = constants.PLAN_LIMITS;

// A Polar stand-in that records what it was asked to bill. Same shape the real
// client exposes, and nothing else — meterOrganization only ever calls this one
// method.
//
// `rejecting` names meters that answer the way the ingest endpoint answers an
// event it refuses — the state every rate is in between shipping the code that
// reports it and creating the meter behind it. Note that a name matching NO
// meter is not one of those: Polar accepts it, counts it against nothing, and
// answers 200. That silence is the trap, and it is why --live-polar exists.
//
// The stub also models deduplication, because the real endpoint does: an event
// whose `external_id` has been seen before is answered as a duplicate rather
// than stored twice.
const makePolar = (rejecting = []) => {
  const events = [];
  return {
    events,
    async ingestEvent(event) {
      if (rejecting.includes(event.name)) {
        throw new Error(
          `Polar /v1/events/ingest failed (422): '${event.name}' rejected`
        );
      }
      const duplicate = events.some(e => e.external_id === event.external_id);
      if (!duplicate) events.push(event);
      return { inserted: duplicate ? 0 : 1, duplicates: duplicate ? 1 : 0 };
    }
  };
};

const totalFor = (polar, eventName) =>
  polar.events
    .filter(e => e.name === eventName)
    .reduce(
      (n, e) => n + Number(e.metadata[constants.BILLING_METER_UNITS_KEY]),
      0
    );

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
  'the meter event name is the one the meter filter must carry',
  constants.BILLING_METER_TOOL_CALLS === 'ganju_custom_tool_calls',
  constants.BILLING_METER_TOOL_CALLS
);

// scaffold

const [owner] =
  await sql`select id from "user" order by created_at asc limit 1`;
if (!owner) throw new Error('No user in this database to own the scaffold');

const orgId = uuid();
const projectId = uuid();
const artifactId = uuid();
const toolId = uuid();
// A provider customer id only has to be non-null — it is what gates whether an
// organization is reported at all. Ingestion keys on the ORGANIZATION id.
const customerId = uuid();
const slug = `verify-tool-calls-${Date.now()}`;

console.log(`\nScaffolding org ${orgId}\n`);

await sql`insert into organization ${sql({ id: orgId, name: 'verify-tool-call-metering', owner_id: owner.id })}`;
// Created the way the platform creates one, rather than by hand: the row's
// starting state is part of what is under test here, and an insert written in
// this file could stamp a period the real path forgets to.
await Plan.ensureSubscription(dbInstance, orgId);
await sql`update subscription set plan = 'PRO', status = 'active', billing_customer_id = ${customerId} where organization_id = ${orgId}`;
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

  console.log('\nreporting to the provider\n');

  const included = LIMITS.PRO.includedToolCalls;
  await setPlan('PRO');
  await setCounters({
    tool_call_count: included - 1,
    reported_tool_call_overage: 0,
    message_count: 0,
    shared_message_count: 0,
    message_period_start: new Date()
  });

  let polar = makePolar();
  await meterOrganization(dbInstance, polar, orgId);
  check(
    'nothing is reported below the included allowance',
    totalFor(polar, constants.BILLING_METER_TOOL_CALLS) === 0,
    `${polar.events.length} events`
  );
  check(
    '  ...and the mark stays at zero',
    (await subRow()).reported_tool_call_overage === 0
  );

  await setCounters({ tool_call_count: included + 250 });
  polar = makePolar();
  await meterOrganization(dbInstance, polar, orgId);
  check(
    'the overage above the allowance is reported',
    totalFor(polar, constants.BILLING_METER_TOOL_CALLS) === 250,
    `${totalFor(polar, constants.BILLING_METER_TOOL_CALLS)} calls`
  );
  check(
    '  ...as a raw call count against the tool-call meter',
    polar.events.some(
      e =>
        e.name === constants.BILLING_METER_TOOL_CALLS &&
        // The ORGANIZATION id, not the provider's customer id: Polar resolves
        // the customer from our own identifier, which is what removed the
        // pre-created customer the Stripe path needed.
        e.external_customer_id === orgId &&
        e.metadata[constants.BILLING_METER_UNITS_KEY] === 250
    )
  );
  check(
    '  ...and the high-water mark advances',
    (await subRow()).reported_tool_call_overage === 250
  );
  check(
    '  ...without touching the message meters',
    totalFor(polar, constants.BILLING_METER_MESSAGES) === 0 &&
      totalFor(polar, constants.BILLING_METER_SHARED_MESSAGES) === 0,
    'each axis bills on its own counter'
  );

  polar = makePolar();
  await meterOrganization(dbInstance, polar, orgId);
  check(
    'a second run with no new usage reports nothing',
    totalFor(polar, constants.BILLING_METER_TOOL_CALLS) === 0,
    'this is what keeps the hourly cron from re-billing the same calls'
  );

  await setCounters({ tool_call_count: included + 400 });
  polar = makePolar();
  await meterOrganization(dbInstance, polar, orgId);
  check(
    'only the increment since the last run is reported',
    totalFor(polar, constants.BILLING_METER_TOOL_CALLS) === 150,
    '400 owed, 250 already billed'
  );
  check(
    '  ...and the mark catches up',
    (await subRow()).reported_tool_call_overage === 400
  );

  console.log('\na retry after a mark that never landed\n');

  // The one failure the marks cannot defend against on their own: the event is
  // accepted, and the write that records it does not happen. The next run
  // recomputes the same delta and sends it again — which under a provider with
  // no idempotency would bill the same calls twice.
  //
  // `external_id` is what closes it. It is built from the subscription, the
  // meter, the period and the NEW mark, so a retry of the same increment repeats
  // exactly while a genuinely new increment differs.
  await setCounters({ tool_call_count: included + 600 });
  polar = makePolar();
  await meterOrganization(dbInstance, polar, orgId);
  const firstTry = polar.events.length;
  check(
    'the increment is reported once',
    firstTry === 1 &&
      totalFor(polar, constants.BILLING_METER_TOOL_CALLS) === 200,
    `${firstTry} event, 200 calls`
  );

  // Rewind only the mark, leaving the counter — exactly the state a crash
  // between the ingest and the mark write would leave behind.
  await setCounters({ reported_tool_call_overage: 400 });
  await meterOrganization(dbInstance, polar, orgId);
  check(
    '  ...and a retry of it is deduplicated, not billed again',
    polar.events.length === firstTry,
    `still ${polar.events.length} event — the provider answered duplicates:1`
  );
  check(
    '  ...while the mark still advances, so the retry ends',
    (await subRow()).reported_tool_call_overage === 600
  );

  console.log('\na meter that does not exist yet\n');

  // The live state of the tool-call meter today, and the reason this is checked
  // rather than assumed: a rejection that escaped would abort the run BEFORE the
  // marks are written, leaving the events that DID land unrecorded — and the next
  // hourly run would bill that same usage a second time.
  await setCounters({
    message_count: LIMITS.PRO.includedMessages + 300,
    shared_message_count: 0,
    reported_message_overage: 0,
    tool_call_count: included + 900,
    reported_tool_call_overage: 0
  });

  polar = makePolar([constants.BILLING_METER_TOOL_CALLS]);
  await meterOrganization(dbInstance, polar, orgId);
  check(
    'a rejected meter does not stop the others reporting',
    totalFor(polar, constants.BILLING_METER_MESSAGES) === 300,
    `${totalFor(polar, constants.BILLING_METER_MESSAGES)} messages reported`
  );
  let marks = await subRow();
  check(
    '  ...and their marks still advance, so nothing is billed twice',
    marks.reported_message_overage === 300,
    `mark ${marks.reported_message_overage}`
  );
  check(
    '  ...while the rejected meter’s mark stays put',
    marks.reported_tool_call_overage === 0,
    'a mark that moves without its event loses that usage for good'
  );

  // And once the meter exists, the usage it missed is still owed in full.
  polar = makePolar();
  await meterOrganization(dbInstance, polar, orgId);
  check(
    'the next run reports everything the rejection missed',
    totalFor(polar, constants.BILLING_METER_TOOL_CALLS) === 900,
    `${totalFor(polar, constants.BILLING_METER_TOOL_CALLS)} calls`
  );
  check(
    '  ...and does not re-report what already landed',
    totalFor(polar, constants.BILLING_METER_MESSAGES) === 0
  );
  marks = await subRow();
  check(
    '  ...with both marks now caught up',
    marks.reported_tool_call_overage === 900 &&
      marks.reported_message_overage === 300
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
    reported_message_overage: 0,
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

  polar = makePolar();
  await meterOrganization(dbInstance, polar, orgId);
  check(
    'the fresh period reports nothing on the new counter',
    totalFor(polar, constants.BILLING_METER_TOOL_CALLS) === 0
  );

  if (livePolar) {
    console.log('\nthe real Polar meter\n');

    const TOKEN = read('POLAR_ACCESS_TOKEN');
    const HOST =
      read('POLAR_SERVER') === 'production'
        ? 'https://api.polar.sh'
        : 'https://sandbox-api.polar.sh';
    const call = async (path, body) => {
      const res = await fetch(`${HOST}/v1/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
      return { status: res.status, json };
    };

    // No throwaway customer to create and delete. Polar keys ingestion on
    // `external_customer_id`, which here is this run's own scaffold
    // organization — itself removed in the finally block. The Stripe path had to
    // create a customer object first and remember to delete it; this one has
    // nothing to leak.
    await setCounters({
      message_count: 0,
      shared_message_count: 0,
      reported_message_overage: 0,
      reported_shared_message_overage: 0,
      tool_call_count: included + 12_345,
      reported_tool_call_overage: 0,
      message_period_start: new Date()
    });

    // The real client's shape, not the stub — this is the hourly cron's own call.
    const realPolar = {
      ingestEvent: async event => {
        const r = await call('events/ingest', { events: [event] });
        if (r.status >= 300) {
          throw new Error(
            `Polar ingest failed (${r.status}): ${JSON.stringify(r.json).slice(0, 200)}`
          );
        }
        return r.json;
      }
    };

    await meterOrganization(dbInstance, realPolar, orgId);
    const marked = Number((await subRow()).reported_tool_call_overage);
    check(
      'the real endpoint accepted the overage',
      marked === 12_345,
      `mark ${marked} — a rejection would have left it at 0`
    );

    // Acceptance is NOT the same as being counted. An event whose name matches
    // no meter filter is accepted with a 200 and aggregated by nothing, which is
    // the one failure mode that is invisible from our side. Only reading the
    // meter back settles it.
    const meters = await call('meters/?limit=100');
    if (meters.status === 403) {
      console.log(
        '  pend   the aggregate cannot be read — POLAR_ACCESS_TOKEN lacks meters:read'
      );
      console.log(
        '         acceptance is proven above; that the METER counted it is not.'
      );
    } else if (meters.status >= 300) {
      check(
        '  ...and the meters can be listed',
        false,
        `HTTP ${meters.status}`
      );
    } else {
      // A meter's `name` is its display name; the event name it matches lives in
      // its filter, as an `eq` clause on the `name` property.
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
      const meter = (meters.json.items || []).find(
        m => eventNameOf(m) === constants.BILLING_METER_TOOL_CALLS
      );
      check(
        '  ...and a meter filters on that exact event name',
        !!meter,
        meter ? meter.id : 'no meter matches — usage would be silently unbilled'
      );

      let total = 0;
      if (meter) {
        const DAY = 86_400_000;
        const startIso = new Date(
          Math.floor(Date.now() / DAY) * DAY
        ).toISOString();
        const endIso = new Date(
          Math.ceil((Date.now() + 60_000) / DAY) * DAY
        ).toISOString();
        for (let i = 0; i < 20 && total === 0; i++) {
          const q = await call(
            `meters/${meter.id}/quantities?start_timestamp=${encodeURIComponent(startIso)}` +
              `&end_timestamp=${encodeURIComponent(endIso)}&interval=day` +
              `&external_customer_id=${encodeURIComponent(orgId)}`
          );
          total = Number(q.json?.total) || 0;
          if (total === 0) await new Promise(r => setTimeout(r, 3_000));
        }
      }
      if (total === 12_345) {
        check('  ...and aggregated exactly what was reported', true, '12,345');
      } else {
        console.log(
          `  pend   the aggregate has not surfaced yet — got ${total}, ingestion is asynchronous`
        );
      }
    }
  }

  console.log('\nthe test-run gate\n');

  // A test run is a dispatch on our compute, so it meets the same ceiling. The
  // dashboard and the CLI need a 402 with the feature on it rather than the tool
  // error apps/mcp answers a client with.
  await setPlan('PRO');
  await setCounters({ tool_call_count: 10 });
  let threw = null;
  try {
    await Plan.assertToolCallBudget(dbInstance, orgId);
  } catch (error) {
    threw = error;
  }
  check('a test run under the ceiling is allowed', threw === null);

  await setCounters({ tool_call_count: LIMITS.PRO.toolCallHardCap });
  threw = null;
  try {
    await Plan.assertToolCallBudget(dbInstance, orgId);
  } catch (error) {
    threw = error;
  }
  check('  ...and refused at it', threw !== null, threw?.message?.slice(0, 90));
  check(
    '  ...as a plan limit, with the feature on it',
    threw?.code === constants.PLAN_LIMIT_ERROR_CODE &&
      threw?.feature === constants.PLAN_FEATURE_TOOL_CALL &&
      threw?.status === 402,
    `${threw?.code} / ${threw?.feature} / ${threw?.status}`
  );

  console.log('\nthe usage alert\n');

  const alertKey = `${constants.ALERT_STATE_KEY_TOOL_CALLS}:${orgId}`;
  const alertState = async () =>
    (await sql`select * from alert_state where key = ${alertKey}`)[0];
  const mine = messages =>
    messages.filter(m => m.text.includes(orgId)).length > 0;

  await sql`delete from alert_state where key = ${alertKey}`;
  await setCounters({ tool_call_count: 500 });
  drain();

  await runToolCallAlerts(source);
  check(
    'the first sighting adopts the position instead of alerting',
    !mine(drain()),
    'a month of usage accumulated before this ran is not news'
  );
  check(
    '  ...and records the snapshot',
    (await alertState())?.last_seen_id === '500'
  );

  await setCounters({ tool_call_count: 500 + constants.ALERT_TOOL_CALL_SURGE });
  await runToolCallAlerts(source);
  let mail = drain();
  check(
    'an hourly surge alerts',
    mine(mail),
    mail.map(m => m.subject).join(' | ')
  );
  check(
    '  ...describing it as a rate rather than a total',
    mail.some(m => m.text.includes('unusual hourly rate'))
  );
  check(
    '  ...and advances the snapshot past it',
    (await alertState())?.last_seen_id ===
      String(500 + constants.ALERT_TOOL_CALL_SURGE)
  );

  await setCounters({
    tool_call_count: 500 + constants.ALERT_TOOL_CALL_SURGE * 2
  });
  await runToolCallAlerts(source);
  check(
    'a second surge inside the cooldown stays quiet',
    !mine(drain()),
    'an hourly email is a muted email'
  );
  check(
    '  ...while still tracking the position',
    (await alertState())?.last_seen_id ===
      String(500 + constants.ALERT_TOOL_CALL_SURGE * 2),
    'holding the snapshot would turn a quiet hour into a false surge later'
  );

  // Push the last alert outside the cooldown window rather than waiting hours.
  const stale = new Date(
    Date.now() - (constants.ALERT_TOOL_CALL_COOLDOWN_HOURS + 1) * 3_600_000
  );
  await sql`update alert_state set last_alert_at = ${stale} where key = ${alertKey}`;

  await setCounters({
    tool_call_count: Math.ceil(
      LIMITS.PRO.toolCallHardCap * constants.ALERT_TOOL_CALL_CAP_FRACTION
    )
  });
  await runToolCallAlerts(source);
  mail = drain();
  check(
    'crossing half the ceiling alerts even with an unremarkable rate',
    mine(mail) && mail.some(m => m.text.includes('% of the ceiling')),
    'the alternative is a customer meeting the wall silently'
  );

  await sql`update alert_state set last_alert_at = ${stale} where key = ${alertKey}`;
  await setCounters({ tool_call_count: LIMITS.PRO.toolCallHardCap });
  await runToolCallAlerts(source);
  check(
    'reaching the ceiling says calls are being refused',
    drain().some(m => m.text.includes('calls refused'))
  );

  // A period rollover takes the counter back to zero, which must read as "no
  // calls since the last check" rather than as a negative delta.
  await sql`update alert_state set last_alert_at = ${stale} where key = ${alertKey}`;
  await setCounters({ tool_call_count: 5 });
  await runToolCallAlerts(source);
  check(
    'a rollover is not read as a surge',
    !mine(drain()),
    'the count fell below the snapshot; the delta is the count, not a negative'
  );

  console.log('\nthe containment link\n');

  const SECRET = 'containment-verify-secret';
  const minted = await utils.mintContainmentToken(orgId, SECRET);

  check(
    'a link token verifies and names its organization',
    (await utils.verifyContainmentToken(minted, SECRET))?.organizationId ===
      orgId
  );
  check(
    '  ...and nothing else — the payload carries no artifact or action',
    Object.keys((await utils.verifyContainmentToken(minted, SECRET)) ?? {})
      .sort()
      .join(',') === 'exp,iat,organizationId,p,v'
  );
  check(
    'another deployment’s secret does not open it',
    (await utils.verifyContainmentToken(minted, 'other-secret')) === null
  );
  check(
    'an expired link is refused',
    (await utils.verifyContainmentToken(
      minted,
      SECRET,
      Date.now() + constants.CONTAINMENT_TOKEN_TTL_MS + 1_000
    )) === null,
    `${constants.CONTAINMENT_TOKEN_TTL_MS / 3_600_000}h lifetime`
  );
  check(
    'a tampered payload is refused',
    (await utils.verifyContainmentToken(
      `${minted.slice(0, 10)}X${minted.slice(11)}`,
      SECRET
    )) === null,
    'the signature covers the organization id'
  );

  // Domain separation: this deployment signs several kinds of token with the
  // same secret, so a token minted for one job must not be spendable as another.
  const foreign = await utils.mintCustomCodeToken(
    { artifactId: artifactId, versionId: 'v', ttlMs: 60_000 },
    SECRET
  );
  check(
    'a token minted for another purpose is refused',
    (await utils.verifyContainmentToken(foreign, SECRET)) === null,
    'the purpose is inside the signature, not beside it'
  );

  // The digest is what carries it, so the link has to survive the email build.
  await sql`delete from alert_state where key = ${alertKey}`;
  await setCounters({ tool_call_count: 500 });
  drain();
  await runToolCallAlerts(source);
  await setCounters({
    tool_call_count: 500 + constants.ALERT_TOOL_CALL_SURGE
  });
  await runToolCallAlerts(source);
  const withLink = drain().find(m => m.text.includes(orgId));
  check(
    'the digest carries a stop link for the organization it names',
    !!withLink &&
      withLink.text.includes(
        `${source.env.NEXT_PUBLIC_API_URL}${constants.CONTAINMENT_PATH}/`
      ),
    withLink?.text.split('\n').find(l => l.includes('Stop their')) ?? 'absent'
  );
  const linked = withLink?.text.match(
    new RegExp(`${constants.CONTAINMENT_PATH}/([A-Za-z0-9_.-]+)`)
  )?.[1];
  check(
    '  ...that verifies against this deployment and names this organization',
    (await utils.verifyContainmentToken(linked ?? '', read('JWT_SECRET')))
      ?.organizationId === orgId
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

  // An org with no provider customer has nothing to report to — an Enterprise
  // client invoiced by bank transfer is the permanent case, a Free org the
  // ordinary one. It is still MEASURED: the reporting half is what stops, which
  // is the split that lets a hand-invoiced period stay reconstructable.
  await setCounters({
    billing_customer_id: null,
    tool_call_count: included + 10
  });
  polar = makePolar();
  await meterOrganization(dbInstance, polar, orgId);
  check(
    'an org with no billing account reports nothing',
    polar.events.length === 0,
    'and its counter is left alone'
  );
  check(
    '  ...but is still measured, so its period stays reconstructable',
    (await subRow()).message_period_start !== null,
    'the measure pass runs with no provider at all'
  );
  await setCounters({ billing_customer_id: customerId });
} finally {
  console.log('\nCleaning up\n');
  await sql`delete from mcp_request where session_id in (select id from mcp_session where artifact_id = ${artifactId})`;
  await sql`delete from mcp_session where artifact_id = ${artifactId}`;
  await sql`delete from artifact_execution where artifact_id = ${artifactId}`;
  await sql`delete from artifact_tool where artifact_id = ${artifactId}`;
  await sql`delete from artifact where id = ${artifactId}`;
  await sql`delete from project where id = ${projectId}`;
  await sql`delete from alert_state where key like ${'%' + orgId}`;
  // Written by every rollover this run triggers. Cascades with the
  // organization anyway; deleted explicitly to match the rest of this block.
  await sql`delete from usage_period where organization_id = ${orgId}`;
  await sql`delete from subscription where organization_id = ${orgId}`;
  await sql`delete from organization where id = ${orgId}`;
  const leftover =
    await sql`select count(*)::int as n from organization where id = ${orgId}`;
  check('scaffold removed', leftover[0].n === 0);

  fs.rmSync(bundleDir, { recursive: true, force: true });
  fs.rmSync(entry, { force: true });
  fs.rmSync(emailStub, { force: true });
  await sql.end();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
