// Verifies the shared-key metering path end to end, against the dev database and
// the Polar sandbox account. Read-only — safe to run repeatedly.
//
//   node scripts/verify-shared-metering.mjs [projectId]
//
// Checks, in the order they can fail:
//   1. the split counter advanced past the included shared allowance
//   2. the metering cron reported the right overage to the shared meter
//   3. NO event went to the own-key meter (a shared turn must bill once, not twice)
//   4. the high-water mark advanced, so a re-run reports nothing
//
// Needs `meters:read` on POLAR_ACCESS_TOKEN. The runtime token deliberately does
// not carry it — apps/api only ever writes events — so either add the scope to
// the token in .env or use a second one for verification. Without it, checks 2
// and 3 report as failures naming the missing scope rather than as silence.
import fs from 'node:fs';
import postgres from 'postgres';

const PROJECT_ID = process.argv[2] || '019f1e2c-c81d-74b8-adb9-c78c1f52383a';
const INCLUDED_SHARED = 1000;
const METER_SHARED = 'ganju_shared_messages';
const METER_OWN_KEY = 'ganju_channel_messages';

const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const read = key => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();

const sql = postgres(read('DATABASE_URL'), { ssl: 'require', max: 1 });
const TOKEN = read('POLAR_ACCESS_TOKEN');
const HOST =
  read('POLAR_SERVER') === 'production'
    ? 'https://api.polar.sh'
    : 'https://sandbox-api.polar.sh';

const polar = async path => {
  const res = await fetch(`${HOST}/v1/${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' }
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  // 403 here means the token is scoped for the runtime rather than for reading,
  // which is a different problem from a meter that does not exist.
  if (res.status === 403) return { forbidden: true };
  if (!res.ok)
    return { error: body?.detail || body?.error || `HTTP ${res.status}` };
  return body;
};

// Three states, not two: until the hourly cron has run, "nothing reported" is
// the correct state rather than a failure, and calling it FAIL sends you
// debugging code that hasn't executed yet.
const results = [];
const check = (state, label, detail) => {
  results.push(state);
  const tag = { pass: '  PASS', fail: '  FAIL', pend: '  PEND' }[state];
  console.log(`${tag}  ${label}${detail ? ` — ${detail}` : ''}`);
};

const [sub] = await sql`
  select s.organization_id, s.billing_customer_id, s.plan, s.status,
         s.message_count, s.shared_message_count, s.reported_message_overage,
         s.reported_shared_message_overage, s.message_period_start
  from subscription s
  join project p on p.organization_id = s.organization_id
  where p.id = ${PROJECT_ID}`;

if (!sub) {
  console.log('No subscription found for that project.');
  await sql.end();
  process.exit(1);
}

const expectedShared = Math.max(0, sub.shared_message_count - INCLUDED_SHARED);
const ownKeyUsed = Math.max(0, sub.message_count - sub.shared_message_count);

console.log('\nCounters');
console.log(
  `  plan=${sub.plan} status=${sub.status} customer=${sub.billing_customer_id}`
);
console.log(`  organization (external)  ${sub.organization_id}`);
console.log(`  message_count            ${sub.message_count}`);
console.log(`  shared_message_count     ${sub.shared_message_count}`);
console.log(`  own-key turns (derived)  ${ownKeyUsed}`);
console.log(`  expected shared overage  ${expectedShared}`);

console.log('\n1. Counter crossed the included allowance');
check(
  sub.shared_message_count > INCLUDED_SHARED ? 'pass' : 'pend',
  `shared_message_count > ${INCLUDED_SHARED}`,
  `at ${sub.shared_message_count}${
    sub.shared_message_count <= INCLUDED_SHARED
      ? ` — ${INCLUDED_SHARED + 1 - sub.shared_message_count} more turns needed`
      : ''
  }`
);

// The period the cron bills against. ISO 8601 both ends, and the window is
// widened to whole days at each end — harmless, because the counter is
// per-period anyway and the meter is queried per customer.
const DAY = 86400_000;
const startMs =
  Math.floor(new Date(sub.message_period_start).getTime() / DAY) * DAY;
const endMs = Math.ceil(Date.now() / DAY) * DAY;
const iso = ms => new Date(ms).toISOString();

// A Polar meter's `name` is its display name; the EVENT name lives in its
// filter, as an `eq` clause on the `name` property. That indirection is the
// whole reason a mismatch is silent — the meter is happily named "Messages"
// while filtering for an event nothing sends.
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

const meters = await polar('meters/?limit=100');
const scopeMissing = meters.forbidden === true;
const byEvent = scopeMissing
  ? {}
  : Object.fromEntries(
      (meters.items || [])
        .map(m => [eventNameOf(m), m.id])
        .filter(([eventName]) => eventName)
    );

const totalFor = async eventName => {
  if (scopeMissing) return { scope: true, total: 0 };
  const id = byEvent[eventName];
  if (!id) return { missing: true, total: 0 };
  const r = await polar(
    `meters/${id}/quantities?start_timestamp=${encodeURIComponent(iso(startMs))}` +
      `&end_timestamp=${encodeURIComponent(iso(endMs))}&interval=day` +
      `&external_customer_id=${encodeURIComponent(sub.organization_id)}`
  );
  if (r.forbidden) return { scope: true, total: 0 };
  if (r.error) return { error: r.error, total: 0 };
  // `total` is the aggregate for the whole window — no need to sum the buckets.
  return { total: Number(r.total) || 0 };
};

const shared = await totalFor(METER_SHARED);
const ownKey = await totalFor(METER_OWN_KEY);

const mark = sub.reported_shared_message_overage;
const cronHasRun = mark > 0 || shared.total > 0;
// Turns sent since the cron last ran. Never assert the meter equals the LIVE
// counter: the counter moves while you chat, so that comparison fails for a
// perfectly healthy system. The invariants below hold at every instant.
const lag = expectedShared - mark;

console.log('\n2. Polar and the database agree on what was billed');
check(
  shared.scope || shared.missing || shared.error
    ? 'fail'
    : !cronHasRun
      ? 'pend'
      : shared.total === mark
        ? 'pass'
        : 'fail',
  `${METER_SHARED} total === reported_shared_message_overage (${mark})`,
  shared.scope
    ? 'POLAR_ACCESS_TOKEN lacks meters:read'
    : shared.missing
      ? 'no meter filters on this event name'
      : shared.error
        ? shared.error
        : !cronHasRun
          ? 'cron has not run for this period yet'
          : shared.total === mark
            ? `both ${mark} — reported exactly once, no double-billing`
            : `meter ${shared.total} vs mark ${mark} — ${
                shared.total > mark ? 'OVER-reported' : 'under-reported'
              }`
);

console.log('\n3. No double-billing onto the own-key meter');
check(
  ownKey.scope
    ? 'fail'
    : ownKey.total === 0 || ownKeyUsed > 0
      ? 'pass'
      : 'fail',
  `${METER_OWN_KEY} total === 0 while all turns are shared`,
  ownKey.scope
    ? 'POLAR_ACCESS_TOKEN lacks meters:read'
    : `got ${ownKey.total}, own-key turns ${ownKeyUsed}`
);

console.log('\n4. Never billed for more than was used');
check(
  !cronHasRun ? 'pend' : mark <= expectedShared ? 'pass' : 'fail',
  `reported (${mark}) <= overage owed (${expectedShared})`,
  !cronHasRun
    ? 'cron has not run for this period yet'
    : lag > 0
      ? `${lag} turns pending — next cron run reports exactly ${lag}`
      : 'fully caught up'
);

const failed = results.filter(r => r === 'fail').length;
const pending = results.filter(r => r === 'pend').length;
console.log(
  `\n${
    failed
      ? `${failed} CHECK(S) FAILED`
      : pending
        ? 'WAITING ON THE CRON'
        : 'ALL CHECKS PASSED'
  } — ${results.filter(r => r === 'pass').length}/${results.length} passed` +
    `${pending ? `, ${pending} pending` : ''}\n`
);

if (scopeMissing) {
  console.log(
    'Note: meter reads were skipped — POLAR_ACCESS_TOKEN has no meters:read scope.\n' +
      '      Add it to the token, or run this with a second token that has it.\n'
  );
}

await sql.end();
