// Drives a subscription through its whole life against the DEPLOYED development
// stack and the Polar sandbox: a real checkout paid with a test card, the
// webhook that follows it, a revoke, and an organization deletion that has to
// take its subscription with it.
//
//   node scripts/verify-subscription-lifecycle.mjs
//   node scripts/verify-subscription-lifecycle.mjs --headed   # watch it happen
//
// These are the two webhook branches nothing else reaches. `subscription.created`
// is exercised by anyone who upgrades; `subscription.revoked` and the revoke that
// organization deletion performs are only reachable by actually cancelling
// something, which no other check does.
//
// It needs .env: DATABASE_URL, JWT_SECRET (which signs the session cookie),
// POLAR_ACCESS_TOKEN with `subscriptions:write`, and POLAR_PRODUCT_PRO.
//
// Scaffolds its own user and two throwaway organizations and removes both. One
// is deleted through the API on purpose — that IS the second test — and the
// other is cleaned up at the end.
//
// Sandbox only. It refuses to run against production, because the whole point is
// that it pays for something and then cancels it.
import fs from 'node:fs';
import crypto from 'node:crypto';
import postgres from 'postgres';
import { v7 as uuid } from 'uuid';
import { chromium } from 'playwright';

const headed = process.argv.includes('--headed');

const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const read = key => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();

const DATABASE_URL = read('DATABASE_URL');
const JWT_SECRET = read('JWT_SECRET');
const TOKEN = read('POLAR_ACCESS_TOKEN');
const PRODUCT = read('POLAR_PRODUCT_PRO');
// The DEPLOYED development API, hardcoded as in the other probes. `.env`'s
// NEXT_PUBLIC_API_URL is the local one — a checkout paid in a browser has to be
// answered by the worker the webhook will reach, not by localhost.
const API = 'https://development-api.vocesqueabrazan.com';

if (read('POLAR_SERVER') === 'production') {
  console.error('Refusing to run against POLAR_SERVER=production.');
  process.exit(1);
}
for (const [k, v] of Object.entries({
  DATABASE_URL,
  JWT_SECRET,
  POLAR_ACCESS_TOKEN: TOKEN,
  POLAR_PRODUCT_PRO: PRODUCT
})) {
  if (!v) throw new Error(`Missing ${k} in .env`);
}

const POLAR = 'https://sandbox-api.polar.sh';
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
const section = t => console.log(`\n${t}\n`);

// better-call signs a cookie as `${value}.${base64(hmac-sha256(value))}`.
const signCookie = value =>
  encodeURIComponent(
    `${value}.${crypto.createHmac('sha256', JWT_SECRET).update(value).digest('base64')}`
  );

const polar = async (method, path, body) => {
  const res = await fetch(`${POLAR}/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
};

const userId = uuid();
const sessionToken = crypto.randomBytes(32).toString('base64url');
const signed = signCookie(sessionToken);
const cookie = `__Secure-better-auth.session_token=${signed}; better-auth.session_token=${signed}`;

const api = (path, init = {}) =>
  fetch(API + path, {
    ...init,
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  }).then(async r => ({
    status: r.status,
    body: await r.json().catch(() => ({}))
  }));

const subRow = async orgId => {
  const [r] = await sql`
    select plan, status, billing_customer_id, billing_subscription_id,
           billing_product_id, last_billing_event_at
      from subscription where organization_id = ${orgId}`;
  return r;
};

// The webhook arrives out of band, so every assertion about it has to wait for
// it rather than read once and call the absence a failure.
const waitFor = async (orgId, predicate, seconds = 60) => {
  for (let i = 0; i < seconds; i++) {
    const row = await subRow(orgId);
    if (row && predicate(row)) return row;
    await new Promise(r => setTimeout(r, 1000));
  }
  return subRow(orgId);
};

const makeOrg = async name => {
  const orgId = uuid();
  await sql`insert into organization ${sql({ id: orgId, name, owner_id: userId, organization_user_count: 1, project_count: 0 })}`;
  await sql`insert into organization_user ${sql({ user_id: userId, organization_id: orgId })}`;
  await sql`insert into subscription ${sql({ id: uuid(), organization_id: orgId, plan: 'FREE', status: 'active', message_period_start: new Date() })}`;
  return orgId;
};

// Pay a checkout with a sandbox test card. The card fields are Stripe Elements
// in a cross-origin iframe, and the billing country is required — an omitted
// country fails the form without ever reaching the network, which looks exactly
// like a captcha problem and is not one.
const payCheckout = async (browser, url) => {
  // A fresh context per payment. The checkout page keeps state for the customer
  // it just created, and a second payment in the same context can pick it up and
  // take a different path through the form than the one this fills in.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(6_000);
  await page.fill('input[name="customer_name"]', 'Lifecycle Probe');

  let filled = false;
  for (const frame of page.frames()) {
    try {
      const number = frame.locator('input[name="number"]');
      if (await number.count()) {
        await number.fill('4242424242424242');
        await frame.locator('input[name="expiry"]').fill('12 / 34');
        await frame.locator('input[name="cvc"]').fill('123');
        const zip = frame.locator('input[name="postalCode"]');
        if (await zip.count()) await zip.fill('110111');
        filled = true;
        break;
      }
    } catch {
      // A frame that went away mid-search is not the one we wanted.
    }
  }
  if (!filled) throw new Error('card fields not found on the checkout page');

  await page.selectOption('select', 'CO');
  await page.waitForTimeout(2_000);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(20_000);

  // Read the checkout back before trusting it. A form that refused to submit
  // looks identical from here to a webhook that never arrived, and the two send
  // you to completely different places.
  const secret = new URL(url).pathname.split('/').pop();
  const after = await fetch(`${POLAR}/v1/checkouts/client/${secret}`, {
    headers: { Accept: 'application/json' }
  })
    .then(r => r.json())
    .catch(() => ({}));

  if (after.status !== 'succeeded') {
    const shot = `scripts/.lifecycle-failed-${Date.now()}.png`;
    await page.screenshot({ path: shot, fullPage: true });
    console.log(`  (checkout did not succeed — screenshot at ${shot})`);
  }

  await context.close();
  return after.status;
};

// The user has to exist before the organizations that name it as owner.
await sql`insert into "user" ${sql({ id: userId, name: 'lifecycle probe', email: `lifecycle-${Date.now()}@ganju.ai`, email_verified: true })}`;
await sql`insert into session ${sql({ id: uuid(), user_id: userId, token: sessionToken, expires_at: new Date(Date.now() + 3_600_000) })}`;

const orgA = await makeOrg(`lifecycle-cancel-${Date.now()}`);
const orgB = await makeOrg(`lifecycle-delete-${Date.now()}`);
let browser;
let orgBDeleted = false;

try {
  browser = await chromium.launch({ headless: !headed });

  // --- 1. checkout → subscription.created ---------------------------------
  section('a paid checkout becomes a subscription');

  const checkout = await api(`/organization/${orgA}/billing/checkout`, {
    method: 'POST'
  });
  check(
    'the deployed worker builds a checkout',
    checkout.status === 200 && !!checkout.body?.url,
    JSON.stringify(checkout.body).slice(0, 160)
  );
  if (!checkout.body?.url) throw new Error('no checkout to pay');

  const paidA = await payCheckout(browser, checkout.body.url);
  check('the test card pays it', paidA === 'succeeded', String(paidA));

  const created = await waitFor(orgA, r => r.plan === 'PRO');
  check(
    'the webhook upgrades the organization to PRO',
    created.plan === 'PRO',
    `${created.plan}/${created.status}`
  );
  check(
    '  ...recording the provider subscription',
    !!created.billing_subscription_id,
    created.billing_subscription_id || 'null'
  );
  check(
    '  ...and the customer it created at checkout',
    !!created.billing_customer_id,
    created.billing_customer_id || 'null'
  );
  check(
    '  ...against the product the secret names',
    created.billing_product_id === PRODUCT,
    created.billing_product_id || 'null'
  );
  check(
    '  ...with the ordering guard stamped',
    created.last_billing_event_at != null
  );

  const subscriptionA = created.billing_subscription_id;

  // --- 2. revoke → subscription.revoked ------------------------------------
  section('revoking it puts the organization back on Free');

  const revoked = await polar('DELETE', `subscriptions/${subscriptionA}`);
  check(
    'the provider accepts the revoke',
    revoked.status < 300,
    `HTTP ${revoked.status}`
  );

  const back = await waitFor(orgA, r => r.plan === 'FREE');
  check(
    'the webhook downgrades it to FREE',
    back.plan === 'FREE',
    `${back.plan}/${back.status}`
  );
  check(
    '  ...because the status is no longer entitled',
    !['active', 'trialing', 'past_due'].includes(back.status),
    back.status
  );
  check(
    '  ...and the ordering guard moved forward',
    Number(back.last_billing_event_at) >= Number(created.last_billing_event_at),
    `${created.last_billing_event_at} → ${back.last_billing_event_at}`
  );

  // --- 3. deleting an organization revokes its subscription ----------------
  section('deleting an organization takes its subscription with it');

  const checkoutB = await api(`/organization/${orgB}/billing/checkout`, {
    method: 'POST'
  });
  if (!checkoutB.body?.url)
    throw new Error('no checkout for the deletion case');
  const paidB = await payCheckout(browser, checkoutB.body.url);
  check('the second checkout is paid', paidB === 'succeeded', String(paidB));

  const liveB = await waitFor(orgB, r => r.plan === 'PRO');
  check(
    'the second organization is on PRO',
    liveB.plan === 'PRO',
    `${liveB.plan}/${liveB.status}`
  );
  const subscriptionB = liveB.billing_subscription_id;

  const beforeDelete = await polar('GET', `subscriptions/${subscriptionB}`);
  check(
    '  ...and its subscription is active at the provider',
    beforeDelete.body?.status === 'active',
    beforeDelete.body?.status
  );

  const deleted = await api(`/organization/${orgB}`, { method: 'DELETE' });
  check(
    'the organization deletes',
    deleted.status === 200,
    `HTTP ${deleted.status}`
  );
  orgBDeleted = deleted.status === 200;

  const [gone] =
    await sql`select count(*)::int as n from organization where id = ${orgB}`;
  check('  ...and its row is gone', gone.n === 0);

  // The revoke is best-effort and fire-and-forget from the caller's side, so
  // give the provider a moment to settle before reading it back.
  await new Promise(r => setTimeout(r, 5_000));
  const afterDelete = await polar('GET', `subscriptions/${subscriptionB}`);
  check(
    '  ...and the subscription behind it is revoked, not left billing',
    afterDelete.body?.status !== 'active',
    `${beforeDelete.body?.status} → ${afterDelete.body?.status}`
  );
} finally {
  section('Cleaning up');
  if (browser) await browser.close();

  // orgA's subscription is already revoked; orgB deleted itself as part of the
  // test. Anything still standing at the provider would be a real leak.
  for (const orgId of orgBDeleted ? [orgA] : [orgA, orgB]) {
    await sql`delete from usage_period where organization_id = ${orgId}`;
    await sql`delete from subscription where organization_id = ${orgId}`;
    await sql`delete from organization_user where organization_id = ${orgId}`;
    await sql`delete from organization where id = ${orgId}`;
  }
  await sql`delete from session where user_id = ${userId}`;
  await sql`delete from "user" where id = ${userId}`;
  const [left] =
    await sql`select count(*)::int as n from "user" where id = ${userId}`;
  check('scaffold removed', left.n === 0);

  await sql.end();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
