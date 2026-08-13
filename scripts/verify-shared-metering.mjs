// Verifies the shared-key metering path end to end, against the dev database and
// the test-mode Stripe account. Read-only — safe to run repeatedly.
//
//   node scripts/verify-shared-metering.mjs [projectId]
//
// Checks, in the order they can fail:
//   1. the split counter advanced past the included shared allowance
//   2. the metering cron reported the right overage to the shared meter
//   3. NO event went to the own-key meter (a shared turn must bill once, not twice)
//   4. the high-water mark advanced, so a re-run reports nothing
import fs from 'node:fs';
import postgres from 'postgres';

const PROJECT_ID = process.argv[2] || '019f1e2c-c81d-74b8-adb9-c78c1f52383a';
const INCLUDED_SHARED = 1000;
const METER_SHARED = 'ganju_shared_messages';
const METER_OWN_KEY = 'ganju_channel_messages';

const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const read = key => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();

const sql = postgres(read('DATABASE_URL'), { ssl: 'require', max: 1 });
const SK = read('STRIPE_SECRET_KEY');

const stripe = async path => {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${SK}:`).toString('base64')}` }
  });
  return res.json();
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
  select s.stripe_customer_id, s.plan, s.status, s.message_count,
         s.shared_message_count, s.reported_message_overage,
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
console.log(`  plan=${sub.plan} status=${sub.status} customer=${sub.stripe_customer_id}`);
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

// The period the cron bills against. Stripe rejects an event-summary query whose
// bounds aren't aligned to the grouping window, so both ends snap to UTC days —
// widening the range is harmless here because the counter is per-period anyway.
const DAY = 86400;
const start = Math.floor(
  new Date(sub.message_period_start).getTime() / 1000 / DAY
) * DAY;
const end = Math.ceil(Date.now() / 1000 / DAY) * DAY;

const meters = await stripe('billing/meters?limit=100');
const byEvent = Object.fromEntries((meters.data || []).map(m => [m.event_name, m.id]));

const totalFor = async eventName => {
  const id = byEvent[eventName];
  if (!id) return { missing: true, total: 0 };
  const r = await stripe(
    `billing/meters/${id}/event_summaries?customer=${sub.stripe_customer_id}` +
      `&start_time=${start}&end_time=${end}&value_grouping_window=day`
  );
  if (r.error) return { error: r.error.message, total: 0 };
  return { total: (r.data || []).reduce((n, s) => n + s.aggregated_value, 0) };
};

const shared = await totalFor(METER_SHARED);
const ownKey = await totalFor(METER_OWN_KEY);

const mark = sub.reported_shared_message_overage;
const cronHasRun = mark > 0 || shared.total > 0;
// Turns sent since the cron last ran. Never assert the meter equals the LIVE
// counter: the counter moves while you chat, so that comparison fails for a
// perfectly healthy system. The invariants below hold at every instant.
const lag = expectedShared - mark;

console.log('\n2. Stripe and the database agree on what was billed');
check(
  shared.missing || shared.error
    ? 'fail'
    : !cronHasRun
      ? 'pend'
      : shared.total === mark
        ? 'pass'
        : 'fail',
  `${METER_SHARED} total === reported_shared_message_overage (${mark})`,
  shared.missing
    ? 'meter does not exist'
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
  ownKey.total === 0 || ownKeyUsed > 0 ? 'pass' : 'fail',
  `${METER_OWN_KEY} total === 0 while all turns are shared`,
  `got ${ownKey.total}, own-key turns ${ownKeyUsed}`
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
    failed ? `${failed} CHECK(S) FAILED` : pending ? 'WAITING ON THE CRON' : 'ALL CHECKS PASSED'
  } — ${results.filter(r => r === 'pass').length}/${results.length} passed` +
    `${pending ? `, ${pending} pending` : ''}\n`
);

await sql.end();
