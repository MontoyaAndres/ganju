// Move one organization between FREE and ENTERPRISE, either direction, in
// development or production. Nothing else: an organization on any other plan is
// refused, and PRO is never a target — that one is bought through Polar.
//
//   node scripts/set-org-plan.mjs <organization-id|owner-email>
//   node scripts/set-org-plan.mjs <organization> <FREE|ENTERPRISE> --confirm
//   node scripts/set-org-plan.mjs <organization> <plan> --confirm --detach
//   …any of the above with --prod to act on production (.env.prod)
//
// For testing what an organization sees on each side of that move. Without --confirm it only reports the current subscription row.
//
// This touches the database only, never Polar. A plan set here is a hand grant:
// nothing charges for it, and an Enterprise org is invoiced from usage_period.
// If the organization has a live Polar subscription, Polar keeps billing it and
// the next webhook for it (renewal, any update) rewrites the plan to whatever
// that subscription pays for. --detach clears the billing ids and period so that
// webhook no longer finds the row by subscription id — but a customer still
// carrying this organization's id in its metadata will be matched anyway. To end
// a real subscription, cancel it in Polar.
//
// An owner email matching several organizations lists them and stops; pass the
// id instead.
import fs from 'node:fs';
import postgres from 'postgres';

const PLANS = ['FREE', 'ENTERPRISE'];
const ENTITLED = ['active', 'trialing'];

const args = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith('--'));
const [target, rawPlan] = positional;
const plan = rawPlan?.toUpperCase();
const has = flag => args.includes(flag);

const isProd = has('--prod');
const confirm = has('--confirm');
const detach = has('--detach');

if (!target || (rawPlan && !PLANS.includes(plan)) || (confirm && !plan)) {
  console.error(
    `Usage: node scripts/set-org-plan.mjs <organization-id|owner-email> [${PLANS.join('|')}] [--confirm] [--detach] [--prod]`
  );
  process.exit(1);
}

const envFile = isProd ? '../.env.prod' : '../.env';
const env = fs.readFileSync(new URL(envFile, import.meta.url), 'utf8');
const read = key => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();

const sql = postgres(read('DATABASE_URL'), {
  ssl: 'require',
  max: 1,
  prepare: false
});

const orgs = await sql`
  select o.id, o.name, u.email as owner_email,
         s.id as subscription_id, s.plan, s.status,
         s.billing_customer_id, s.billing_subscription_id,
         s.current_period_end, s.cancel_at_period_end, s.custom_domain
  from organization o
  join "user" u on u.id = o.owner_id
  left join subscription s on s.organization_id = o.id
  where o.id = ${target} or lower(u.email) = lower(${target})
  order by o.created_at`;

if (orgs.length === 0) {
  console.error(`No organization matches "${target}".`);
  await sql.end();
  process.exit(1);
}

if (orgs.length > 1) {
  console.error(
    `\n  "${target}" owns ${orgs.length} organizations — pass one id:\n`
  );
  for (const o of orgs) {
    console.error(`  ${o.id}  ${(o.plan ?? 'none').padEnd(10)} ${o.name}`);
  }
  console.error('');
  await sql.end();
  process.exit(1);
}

const [org] = orgs;
// No subscription row is treated as Free everywhere else, so it is here too.
const currentPlan = org.plan ?? 'FREE';

console.log(`\n  environment    ${isProd ? 'PRODUCTION' : 'development'}`);
console.log(`  organization   ${org.name} (${org.id})`);
console.log(`  owner          ${org.owner_email}`);
console.log(
  `  plan           ${org.plan ?? 'no subscription row'} / ${org.status ?? '—'}${
    plan ? `  →  ${plan} / active` : ''
  }`
);
console.log(
  `  polar          ${org.billing_subscription_id ?? 'no subscription'}${
    org.billing_customer_id ? ` (customer ${org.billing_customer_id})` : ''
  }`
);
if (org.current_period_end) {
  console.log(
    `  period ends    ${new Date(org.current_period_end).toISOString().slice(0, 10)}${
      org.cancel_at_period_end ? ' (cancelling)' : ''
    }`
  );
}
console.log(`  custom domain  ${org.custom_domain ? 'yes' : 'no'}`);

const livePolar =
  org.billing_subscription_id &&
  ENTITLED.includes(org.status) &&
  !org.cancel_at_period_end;
if (livePolar) {
  console.log(
    `\n  Warning: this organization has a live Polar subscription. Polar keeps charging it, and its next webhook sets the plan back.`
  );
}

if (!PLANS.includes(currentPlan)) {
  console.error(
    `\n  Refusing: this organization is on ${currentPlan}. Only ${PLANS.join(' and ')} can be moved here.\n`
  );
  await sql.end();
  process.exit(1);
}

if (plan === currentPlan) {
  console.log(`\n  Already on ${plan}. Nothing to do.\n`);
  await sql.end();
  process.exit(0);
}

if (!confirm) {
  console.log(
    plan
      ? `\n  Dry run. Add --confirm to set it to ${plan}${
          detach ? ' and clear its billing ids' : ''
        }.\n`
      : `\n  Pass a plan (${PLANS.join(', ')}) and --confirm to change it.\n`
  );
  await sql.end();
  process.exit(0);
}

if (!org.subscription_id) {
  // Every organization normally gets its row at creation; one without it is
  // treated as Free, so create the row rather than fail.
  await sql`
    insert into subscription (id, organization_id, plan, status)
    values (gen_random_uuid()::text, ${org.id}, ${plan}, 'active')`;
} else {
  await sql`
    update subscription set
      plan = ${plan},
      status = 'active',
      cancel_at_period_end = false
      ${
        detach
          ? sql`, billing_subscription_id = null,
                billing_product_id = null,
                billing_customer_id = null,
                current_period_start = null,
                current_period_end = null,
                last_billing_event_at = null`
          : sql``
      }
    where organization_id = ${org.id}`;
}

const [after] = await sql`
  select plan, status, billing_subscription_id
  from subscription where organization_id = ${org.id}`;

console.log(
  `\n  Done: ${after.plan} / ${after.status}${
    after.billing_subscription_id
      ? ` (still linked to ${after.billing_subscription_id})`
      : ''
  }. Usage counters and the custom-domain flag are untouched.\n`
);

await sql.end();
