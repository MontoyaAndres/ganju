# Migrating billing from Stripe to Polar

The plan for replacing the Stripe integration with [Polar](https://polar.sh). Companion to [PRICING.md](PRICING.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

**Status: phases 1–6 are applied.** The code is on Polar end to end — constants, env, schema, provider client, controller, metering and every caller — and the working tree typechecks and builds. Phase 0 (the Polar dashboard, manual), phase 7 (docs and the legal surface) and phase 8 (the verification scripts and the sandbox pass) are not. Nothing is live either way: with `POLAR_ACCESS_TOKEN` unset the platform runs exactly as it does today. Two things below turned out differently from what was planned — the migration file, and the package-pricing claim; both are marked where they occur.

## Why

Stripe does not support Colombia. A Stripe account for this company means incorporating abroad — Stripe Atlas is $500 once, and then roughly $1,300–2,500 a year in registered agent, Delaware franchise tax, and the US federal filing (1120 + 5472, where the non-filing penalty makes an accountant mandatory rather than optional).

Polar is a merchant of record that pays out through Stripe Connect Express, and **Colombia is a supported payout country**. No entity, no upfront fee, KYC as a Colombian individual or company. It is also the only alternative found that has real usage metering — events, meters and metered prices — which is what the four overage counters need. Paddle and Lemon Squeezy do not clearly publish Colombia as a *seller* country; local gateways (Wompi, Mercado Pago, ePayco, PayU, Bold) have no metering primitives at all and would mean rebuilding invoicing, proration, dunning and the customer portal by hand.

The trade is fee rate. Polar's Starter tier is 5% + 50¢, plus 1.5% on international cards, plus the Connect payout and COP conversion fees — call it **~7–8% effective against Stripe's ~3.9%**. On the $29 Pro price with ~$1.05 of inference cost behind it, gross margin stays near 90%, so this does not change the pricing model. It does change the assumptions written into [PRICING.md](PRICING.md), which need updating as part of this work.

Two things worth knowing before starting:

- Polar's Pro tier ($20/mo) drops the rate to 3.8% + 40¢ and breaks even around $1,379/mo in sales. Stay on Starter until then.
- The legacy 4% + 40¢ rate is only for organizations created before 27 May 2026. A new account today is on 5% + 50¢.

**The break-even against incorporating abroad is roughly 135 concurrent paying organizations.** Below that, Polar is cheaper all-in as well as simpler. Revisit if that line is ever crossed.

## What makes this small

**There are no live Stripe customers.** Live mode was never activated — [DEPLOYMENT.md](DEPLOYMENT.md) records `Stripe live mode ❌ empty — account not activated`, and [CUSTOM_TOOLS.md](CUSTOM_TOOLS.md) says the same. Everything that exists is test-mode.

So there is no subscription backfill, no customer migration, no dual-running window, no proration to reconcile, and no cutover deadline. Production simply has billing unconfigured — exactly as it does today — until the day `POLAR_ACCESS_TOKEN` is set. The `null`-on-missing-key contract in `createStripe` is what makes that true, and the Polar client must keep it: the entire Free tier works with billing absent, the metering sweep returns early, and `getPlan` / `getStatus` never touch the provider.

This is a replacement, not a migration. The word "migration" in the title is about the vendor, not about data.

## How the two providers line up

| Stripe today | Polar |
| --- | --- |
| Customer created up-front by `ensureStripeCustomer` | `external_customer_id` = `organizationId`, created implicitly at checkout |
| Pro **product** + 5 separate **prices**, assembled as checkout line items | One Pro **product** carrying the base price and all four metered prices |
| `checkout.sessions.create` | `POST /v1/checkouts/` |
| `billingPortal.sessions.create` | `POST /v1/customer-sessions/` → `customer_portal_url` |
| `billing.meterEvents.create` | `POST /v1/events/ingest` |
| Meter aggregates the values it is sent | Meter filters events by name and aggregates a metadata property |
| Plan resolved from the subscribed **price** | Plan resolved from the subscribed **product** |
| Webhook signed with Stripe's own scheme | Standard Webhooks (`webhook-id`, `webhook-timestamp`, `webhook-signature`) |
| `event.created` orders webhook deliveries | The subscription's own `modified_at` |

Three of these are simplifications rather than swaps, and they are where the code gets shorter:

**Metered prices live on the product.** Five `STRIPE_PRICE_*` variables collapse into one `POLAR_PRODUCT_PRO`, and the line-item assembly in `createCheckout` — including the four silent-skip branches — disappears with them.

**`external_customer_id` removes the pre-created customer.** `ensureStripeCustomer` exists only so a checkout has a customer id to attach and so the webhook has something to resolve an org from. Polar takes our own id directly, at checkout, at portal, and at event ingestion. That deletes the helper and the "already on a paid plan?" ordering it forces.

**The org reference stops being a scavenger hunt.** `syncSubscription` currently tries subscription metadata, then a stored customer id, then the customer's metadata. Polar's subscription payload carries `customer.external_id`, which is the org id, on every event. Keep one fallback by stored customer id for hand-made Enterprise subscriptions; drop the rest.

There is also one event fewer to handle. `checkout.session.completed` exists in the current handler only to carry `client_reference_id` onto a subscription that does not yet have it. Polar's `subscription.created` already has the customer attached, so the checkout event is not needed.

## Phase 0 — Polar account setup

Manual, no code, and everything below depends on it. Do it in **sandbox** first (`sandbox.polar.sh`, a separate API host — which is why `POLAR_SERVER` is in the env table).

1. Create the organization; complete Stripe Connect Express KYC with Colombian bank details.

2. **Create the four meters first** — a metered price references a meter by id, so the meters have to exist before the product. Each filters on `name` equals the event name and aggregates **`sum` over `units`** (Polar resolves that against the event's metadata; there is no `metadata.` prefix in the field):

   | Meter | Event name (filter) | Rate |
   | --- | --- | --- |
   | Messages | `ganju_channel_messages` | $2 / 1,000 |
   | Shared messages | `ganju_shared_messages` | $15 / 1,000 |
   | Embedded storage | `ganju_embedded_storage` | $2 / GB, metered and labelled in MB |
   | Custom-tool calls | `ganju_custom_tool_calls` | $5 / 1,000,000 |

   The event names do not change — they are the existing `STRIPE_METER_*` values, and only the constant names move. A name that does not match its meter's filter is not an error at either end: the event is accepted and matches nothing, and the usage is silently unbilled. This is the same trap the current constants warn about, and it survives the provider change intact.

   Each meter also takes a **Unit**, which is presentation only. Set it to *Custom* with the multiplier below so an invoice line reads in the units every page of ours quotes; the raw `unit_amount` is still per single event unit either way. This is what replaces the Stripe package price — the readability it bought, without the partial-package rounding it cost.

3. Create one product, **Pro**: a $29/mo fixed recurring price plus four metered prices on the same product. `unit_amount` is **in cents** and takes up to 12 decimal places, so every rate is exact:

   | Meter | `unit_amount` (cents per unit) | Unit label, multiplier | Displays as |
   | --- | --- | --- | --- |
   | Messages | `0.2` | `messages`, ×1,000 | $2.00 / 1,000 messages |
   | Shared messages | `1.5` | `messages`, ×1,000 | $15.00 / 1,000 messages |
   | Embedded storage | `0.1953125` | `MB`, ×1,024 | $2.00 / 1,024 MB |
   | Custom-tool calls | `0.0005` | `calls`, ×1,000,000 | $5.00 / 1,000,000 calls |

   Storage is `2 / 1024` cents because a GB here is 1,024 reported MB — `MB` and `GB` in `constants.ts` are binary, and the sweep reports whole MB.

   **The unit label names the raw event unit, not the display unit.** Polar renders the price as `$(amount × multiplier) / (multiplier) (label)`, so storage labelled `GB` comes out as "$2.00 / 1,024 GB" — a claim that $2 buys a terabyte. Labelled `MB` it reads "$2.00 / 1,024 MB", which is the same $2/GB the pricing page quotes. The dashboard accepts six decimal places in the amount field, so the rates go in as written and no API call is needed to set them.

   **Leave `included_units` unset on all four prices.** The allowance is enforced in our code: `meterOrganization` subtracts the plan's included amount and reports only the overage, so an included tier on the price would apply the same allowance a second time and under-bill every paid org. For the same reason leave `cap_amount` unset unless you want a deliberate ceiling on a rate.

4. Create the **Enterprise** product: Visibility **Private**, the same four metered prices as Pro, and **no fixed price at all** — remove that row. Polar rejects a $0 fixed price ("Price must be greater than 0"), and a metered-only subscription is the right shape anyway: the negotiated fee is settled on our invoice, not Polar's, so a base price here would double-charge the card-paying case.

   A metered-only subscription product is accepted — confirmed in sandbox. Should a nominal base ever seem necessary, it isn't: skip the product entirely and leave `POLAR_PRODUCT_ENTERPRISE` unset instead. It exists only to map product → plan in the webhook, which is unused until an enterprise client pays by card, and that client's negotiated base fee is per-client anyway.

   **Enterprise is normally not billed through Polar at all.** These are internal clients who pay by bank transfer, so the org is put on the plan directly — `update subscription set plan = 'ENTERPRISE', status = 'active'` — and `billing_customer_id` stays null. `planFromSubscription` grants the plan's limits off the row's own `plan` whenever the status is entitled, so this needs no provider object, and the reporting half of the sweep skips a row with no customer id. Nothing is charged, nothing is invoiced by Polar.

   The product exists for the one enterprise client who eventually asks to pay by card. That path goes through a subscription created by hand in Polar, and the moment it does, the webhook sets `billing_customer_id` and the sweep starts reporting — which is why the metered prices have to be on the product even though most Enterprise orgs will never touch them. A Private product with no metered prices is the silent-unbilling trap wearing a different hat.

   Usage for a hand-invoiced client comes from `usage_period` instead — see below.
5. Create the webhook endpoint, subscribed to `subscription.created`, `subscription.updated`, `subscription.revoked`. In sandbox point it at the development worker — `https://development-api.vocesqueabrazan.com/billing/webhook`; production is `https://api.ganju.ai/billing/webhook`.

   **Format must be Raw.** The other two options reshape the body into Discord or Slack message JSON, which fails the signature check and would not parse if it passed.

   **`subscription.updated` is the catch-all**, documented as covering `active`, `canceled`, `uncanceled`, `cycled`, `past_due`, `revoked`, `paused` and `resumed`. Subscribing to `created` and `updated` alone would be enough; `revoked` is listed as well because the handler names it, and a redundant delivery costs nothing. `cycled` is why the catch-all is not optional: it carries the new `current_period_start` when a billing period rolls, which is what the metering marks are read against.

   **Generate the secret fresh.** Polar switched to the Standard Webhooks scheme for secrets created on or after 8 September 2026 00:00 UTC. A secret created now is unambiguously Standard Webhooks, and the older Polar-HMAC documentation does not apply.

6. **Disable Bot Fight Mode** in Cloudflare (Security → Bots), or webhook deliveries are answered with 403. IP allowlists and WAF rules do not fix this; only turning the feature off does.

## Phase 1 — Constants and env

[`packages/utils/src/constants.ts`](../packages/utils/src/constants.ts) — rename `STRIPE_METER_*` to `BILLING_METER_*`, values untouched, and add a constant for the metadata key every meter sums (`units`). The key has to agree with the aggregation configured on all four meters, so it belongs next to the names rather than inline at the call site.

`SUBSCRIPTION_STATUS_*` needs no change. Polar's vocabulary — `incomplete`, `incomplete_expired`, `trialing`, `active`, `past_due`, `canceled`, `unpaid` — is the set already there. `paused` is confirmed: Polar documents both `subscription.paused` and `subscription.resumed`, the first firing when a scheduled pause takes effect at period end.

Env: eight variables out, five in.

| Remove | Add |
| --- | --- |
| `STRIPE_SECRET_KEY` | `POLAR_ACCESS_TOKEN` (four scopes — see below) |
| `STRIPE_WEBHOOK_SECRET` | `POLAR_WEBHOOK_SECRET` |
| `STRIPE_PRICE_PRO` | `POLAR_PRODUCT_PRO` |
| `STRIPE_PRICE_ENTERPRISE` | `POLAR_PRODUCT_ENTERPRISE` |
| `STRIPE_PRICE_MESSAGE_OVERAGE` | `POLAR_SERVER` (`sandbox` \| `production`) |
| `STRIPE_PRICE_SHARED_MESSAGE_OVERAGE` | |
| `STRIPE_PRICE_EMBEDDED_OVERAGE` | |
| `STRIPE_PRICE_TOOL_CALL_OVERAGE` | |

The access token is an **Organization Access Token**, created at *Settings → Developers → New Token* in the dashboard of the environment it is for — sandbox and production are separate accounts and a production token is rejected by the sandbox host. It needs four scopes, one per call the API makes:

| Scope | For |
| --- | --- |
| `checkouts:write` | `POST /v1/checkouts/` |
| `customer_sessions:write` | `POST /v1/customer-sessions/` |
| `events:write` | `POST /v1/events/ingest` |
| `subscriptions:write` | `DELETE /v1/subscriptions/{id}`, on organization deletion |

Give it no expiry, or one long enough to notice. It is a server credential with no refresh path: when it lapses, checkout, the portal and the hourly metering sweep all start failing at once, and the sweep fails quietly.

Touches [`apps/api/src/types.ts`](../apps/api/src/types.ts) (`Bindings`), the env allowlist in [`turbo.json`](../turbo.json), and [`.env.example`](../.env.example).

Not [`apps/web/cloudflare-env.d.ts`](../apps/web/cloudflare-env.d.ts), as planned: it is generated by `wrangler types` and carries only the three `NEXT_PUBLIC_*` URLs. No billing variable was ever in it — the web app reaches billing through the API, never the provider.

## Phase 2 — Schema

Four columns rename on `subscription` in [`packages/db/src/lib/schema.ts`](../packages/db/src/lib/schema.ts):

| Now | After |
| --- | --- |
| `stripe_customer_id` | `billing_customer_id` |
| `stripe_subscription_id` | `billing_subscription_id` |
| `stripe_price_id` | `billing_product_id` |
| `last_stripe_event_at` | `last_billing_event_at` |

Provider-neutral names rather than `polar_*`, because the counters and marks beside them already are, and because the last column's meaning is about to stop being provider-specific anyway.

The two indexes rename with their columns. The counters and every `reported_*` mark are untouched — they are ours, not the provider's.

`stripe_price_id` becomes `billing_product_id` rather than `billing_price_id` because plan resolution moves from price to product: on Polar the base fee and all four metered rates hang off one product, so the product is what identifies the plan.

**`last_billing_event_at` changes meaning, not just name.** It currently holds Stripe's `event.created` — when the notification was emitted. Polar has no equivalent field, so it should hold the subscription's own `modified_at` (falling back to `created_at`) as epoch ms. This is more correct than what is there now: it orders by when the subscription actually changed rather than by when a message about it was sent, which is the property the guard was always reaching for.

### Generating the migration

**`drizzle-kit generate` cannot be run unattended for this change.** It cannot tell a rename from a drop-and-recreate, so it prompts — and in a non-interactive shell it aborts. If it were ever forced through non-interactively, the destructive reading is the one that costs data: dropped columns take the customer and subscription ids with them.

**This was written by hand instead**, for exactly that reason — `0071_polar_billing.sql`, with its snapshot and journal entry, is the output drizzle-kit would have produced had someone sat at the prompt and answered *rename* four times. Read it before applying: four `ALTER TABLE ... RENAME COLUMN` statements, then the two indexes dropped and recreated under their new names (which is how drizzle-kit renames an index — see `0034` for the same shape). No `DROP COLUMN` anywhere.

Migrate with `npm run migrate-dev`, and `migrate-prod` only after the sandbox pass in Phase 8. If `drizzle-kit generate` is ever run before that migration is applied, it will see a schema that already matches its snapshot and generate nothing — which is the check that the hand-written pair is correct.

## Phase 3 — Provider client

Replace [`apps/api/src/utils/stripe.ts`](../apps/api/src/utils/stripe.ts) with `polar.ts`, keeping the `null`-on-missing-key contract exactly — it is what lets the Free tier run with billing unconfigured, and every caller is written against it.

**Do not add `@polar-sh/sdk`.** It is Speakeasy-generated and large, and only three REST calls are needed. Plain `fetch` against `https://api.polar.sh/v1` (or the sandbox host, selected by `POLAR_SERVER`) keeps the Worker bundle small, and the codebase already talks to provider APIs over raw fetch in the verification scripts.

For webhook verification, hand-roll Standard Webhooks against WebCrypto rather than taking the `standardwebhooks` package, which reaches for `node:crypto`. It is about twenty lines: the signed content is `{webhook-id}.{webhook-timestamp}.{raw body}`, HMAC-SHA256 keyed on the base64-decoded secret with its `whsec_` prefix stripped, compared constant-time against the space-separated `v1,<signature>` entries in `webhook-signature`, with the timestamp checked for freshness. This mirrors how `stripeCryptoProvider` already leans on SubtleCrypto, and avoids depending on `nodejs_compat` for crypto even though the flag is set.

Remove `stripe` from [`apps/api/package.json`](../apps/api/package.json).

## Phase 4 — Billing controller

[`apps/api/src/controllers/billing/index.ts`](../apps/api/src/controllers/billing/index.ts). `getPlan` and `getStatus` do not touch the provider and do not change, beyond the renamed field behind `hasBillingAccount`.

**`createCheckout`** — `POST /v1/checkouts/` with `products: [POLAR_PRODUCT_PRO]`, `external_customer_id: organizationId`, `customer_email`, `metadata: { organizationId }`, `success_url`, and `locale`. Read `.url` off the response.

The `checkoutLocale` helper survives unchanged. Polar's checkout takes an IETF BCP 47 locale and ships Spanish, so the reason that helper exists — that a browser's language is not the language the user picked in the dashboard — still holds and still works. Note that Polar's localization is in beta and **scoped to the checkout page**, so the customer portal may render untranslated. That is a real regression against Stripe's localized portal; it is small, and it is the only one in this plan.

`ensureStripeCustomer` is deleted.

**`createPortal`** — `POST /v1/customer-sessions/` with `external_customer_id: organizationId`; redirect to `customer_portal_url`. The session expires, which suits the existing redirect-on-click pattern. Keep the "no billing account yet" refusal.

**`webhook`** — same public route, same rate limiter, same `c.req.text()` for the raw body. Verify with the Phase 3 helper, then handle three events through the existing single `syncSubscription` path. `subscription.updated` is Polar's catch-all for state transitions, so `created` / `updated` / `revoked` covers everything the four Stripe events did.

**`syncSubscription`** — resolve the org from `subscription.customer.external_id`, falling back to a lookup by stored `billingCustomerId` for a subscription created by hand. Keep the stale-event guard, now comparing `modified_at`. The price→plan map becomes product→plan.

## Phase 5 — Metering

[`apps/api/src/utils/metering.ts`](../apps/api/src/utils/metering.ts). All of the arithmetic ports unchanged: the per-period deltas, the `reported_*` marks, the rule that a mark advances only when its event landed. Only `reportMeter` changes, to:

```
POST /v1/events/ingest
{ "events": [{ "name": <meter name>,
               "external_customer_id": <organizationId>,
               "metadata": { "units": <delta> } }] }
```

**Keep four separate calls. Do not batch.** Polar's ingest accepts an array and batching is tempting, but it answers `{inserted, duplicates}` with no per-event status. That would destroy the property the current code is built around — one meter absent or rejecting must not strand the marks of the other three — by making every run all-or-nothing. Four requests an hour per paid org is not a cost worth trading that for.

**Take the idempotency Polar offers and Stripe did not.** Set `external_id` on each event to something stable and unique per reported increment — `${subscriptionId}:${meterName}:${periodStart}:${newMark}` — and Polar de-duplicates on it, reporting the count back as `duplicates`. That makes a retry after a failed mark advance safe rather than double-billing, which is the exact failure the current comments spend a paragraph defending against. Log a non-zero `duplicates` rather than treating it as an error: it means the retry path worked.

Keep the `isNotNull` filter on the customer id in the org-selection query. Ingestion keys on `external_customer_id` so the filter is arguably unnecessary, but it is not established whether Polar holds events for an external id that has no customer yet, and the filter costs nothing.

`runOverageMetering` keeps its structure — the contained per-org failures, the contained listing query, the `ctx.waitUntil` caveat.

## Phase 6 — Callers and copy

- [`apps/api/src/controllers/organization/index.ts`](../apps/api/src/controllers/organization/index.ts) — organization deletion cancels the subscription (`stripe.subscriptions.cancel`). Becomes a Polar subscription revoke. Keep it best-effort and logged: a failed cancel must not block the delete.
- [`apps/api/src/utils/index.ts`](../apps/api/src/utils/index.ts) — swap the two exports.
- [`apps/api/src/index.ts`](../apps/api/src/index.ts) — the route comment above `/billing/webhook` names the `stripe-signature` header.
- [`apps/web/src/components/views/settings/billing-manager.tsx`](../apps/web/src/components/views/settings/billing-manager.tsx) — rename `goToStripe` and the two comments naming Stripe. `hasBillingAccount` and the status strings need nothing: the field name is already neutral and Polar's statuses render the same.
- Comments only, no behaviour: [`packages/db/src/lib/plan.ts`](../packages/db/src/lib/plan.ts) (three), [`apps/api/src/controllers/channel/runner.ts`](../apps/api/src/controllers/channel/runner.ts) (one), [`apps/web/src/lib/i18n/copy/settings.ts`](../apps/web/src/lib/i18n/copy/settings.ts) (one).

**The rounding claim did not hold, so [`PricingCalculator.tsx`](../apps/website/src/components/react/PricingCalculator.tsx) is a behaviour change rather than a comment.** Polar prices metered usage per single unit and has no package pricing, so there is no partial block to round up. The calculator was mirroring Stripe's round-up with `Math.ceil(extraMessages / 1_000)` and `Math.ceil(extraStorage)`, which under Polar quotes ABOVE the real invoice: 1,200 messages past the allowance estimated $4.00 against an actual $2.40. Both are now exact per-unit. The same reasoning was written into the tool-call rate's comment in `constants.ts`, and is corrected there too.

This is worth a second look when the meters are created in phase 0, because it is the meter configuration that settles it — a graduated or volume tier would change these numbers again, and the calculator is on the public pricing page.

### Deliberately left alone

`ctx.secret('stripe-key')` in [`apps/tool-broker/src/controllers/broker/index.ts`](../apps/tool-broker/src/controllers/broker/index.ts) and [`apps/tool-broker/src/utils/connection.ts`](../apps/tool-broker/src/utils/connection.ts), and the `STRIPE_KEY` placeholder in [`apps/web/src/lib/i18n/copy/tools.ts`](../apps/web/src/lib/i18n/copy/tools.ts).

These are examples of a *customer's own* secret in a custom tool, not our billing integration. A customer may well hold a Stripe key. Changing them would edit unrelated product copy to no purpose.

## Phase 7 — Docs and the legal surface

Straightforward updates: [DEPLOYMENT.md](DEPLOYMENT.md) (the readiness table and the whole Stripe section), [DATA_MODEL.md](DATA_MODEL.md) (the `subscription` walkthrough, the marks, the period note), [CUSTOM_TOOLS.md](CUSTOM_TOOLS.md), [ABUSE.md](ABUSE.md), [`README.md`](../README.md), [`TASKS.md`](../TASKS.md), and the website docs [`settings.md`](../apps/website/src/content/docs/settings.md) / [`deploy.md`](../apps/website/src/content/docs/deploy.md) with their Spanish mirrors.

[PRICING.md](PRICING.md) needs rework rather than edits. Its margin model is built on Stripe's rates; the real number is now ~7–8% effective. Nothing breaks — the conclusion that storage and inference are what to meter is unchanged — but the document should state the rate it is actually reasoning about.

**The legal documents are the part not to rush.** [`privacy.md`](../apps/website/src/md/privacy.md), [`terms.md`](../apps/website/src/md/terms.md), [`subprocessors.md`](../apps/website/src/md/subprocessors.md) and the Spanish mirrors ([`privacidad.md`](../apps/website/src/md/es/privacidad.md), [`terminos.md`](../apps/website/src/md/es/terminos.md), [`subencargados.md`](../apps/website/src/md/es/subencargados.md)) all name Stripe, Inc.

A merchant of record is not a swapped vendor name. **Polar becomes the seller of record on every transaction** — the party the customer contracts with, invoices from, and claims refunds against. That changes what `terms.md` says about who is selling, not just which processor appears in a table. Have someone who knows Colombian and EU consumer law read that section. This can run in parallel with the code and is the item most likely to be the long pole.

If the consent documents change materially, bump `CONSENT_CURRENT_VERSION` (currently `2026-08-31`) so existing users are re-prompted, and update the "Last updated" date on `terms.md` / `privacy.md` to match, per the note beside those constants.

## Usage history, and billing Enterprise by hand

Landed alongside this work, and independent of the provider.

The counters on `subscription` only ever describe the period in progress: `rollUsagePeriodIfDue` zeroes all four the first time anyone touches an org past the period boundary, and nothing re-derived what they held. On the first of the month the evidence for the month just ended was gone — which is a problem for any client invoiced against real consumption.

**`usage_period`** closes that. One immutable row per organization per period, written by the rollover *before* it zeroes, carrying the counters, the plan in force, the storage peak, and what was reported to the provider. Unique on `(organization_id, period_start)`, so the insert is idempotent and a retry after a partial rollover finds the row rather than duplicating it.

Invoicing a bank-transfer client is then a query:

```sql
select period_start, period_end, plan,
       message_count, shared_message_count, tool_call_count, peak_embedded_mb
  from usage_period
 where organization_id = '<org>'
 order by period_start desc;
```

The period in progress is not in there yet — read it off `subscription` directly.

**Storage needed a second change to be trustworthy.** It is a level, not a counter, so reading it at period close misses a client who held 50GB for three weeks and deleted it on the 28th. `subscription.peak_embedded_mb` now tracks the high-water within the period, and the snapshot carries it.

That in turn forced the metering sweep apart into two halves:

- **Measuring** — roll the period, update the storage peak. Runs for every entitled `PRO` and `ENTERPRISE` org, with or without a provider customer, **and with billing entirely unconfigured**. `runOverageMetering` no longer returns early when there is no client.
- **Reporting** — the delta arithmetic and the four ingest calls. Unchanged, and still gated on both a client and a `billing_customer_id`.

The `isNotNull(billingCustomerId)` filter on the org listing is gone with it. It was there because a row without a customer had nothing to report — but such a row still has a period to measure, and skipping it is exactly how an Enterprise org ended up with no storage figure to invoice from.

## Phase 8 — Verification and cutover

Three scripts call `api.stripe.com` directly and are the regression net for the delta arithmetic — port them **before** trusting a sweep:

- [`scripts/verify-shared-metering.mjs`](../scripts/verify-shared-metering.mjs)
- [`scripts/verify-tool-call-metering.mjs`](../scripts/verify-tool-call-metering.mjs) — its `--live-stripe` flag becomes `--live-polar`
- [`scripts/probe-tool-call-metering.mjs`](../scripts/probe-tool-call-metering.mjs)

`billing/meters/{id}/event_summaries` becomes Polar's meter quantities endpoint; customer assertions move from `cus_…` prefixes to the org's `external_customer_id`.

Then, in sandbox, end to end: a real checkout in both languages, a real webhook delivery landing in `subscription`, one real metered event visible on the meter, a portal session, and a cancel. Only after that does production get a secret.

### The trap to clear first

[CUSTOM_TOOLS.md](CUSTOM_TOOLS.md) documents this for Stripe and it applies harder here. `meterOrganization` reports `current − reported`. Because billing has never run in production, **every `reported_*` mark is sitting at 0 while the counters have been accruing for months.** The first sweep after `POLAR_ACCESS_TOKEN` is set would report the entire accumulated period as overage, on the customer's first invoice.

Before enabling, either switch it on immediately after a period rollover, or align every mark with its counterpart:

```sql
update subscription set
  reported_message_overage        = <current overage>,
  reported_shared_message_overage = <current overage>,
  reported_embedded_overage_mb    = <current overage>,
  reported_tool_call_overage      = <current overage>;
```

Do this in the same change window as setting the secret, not afterwards.

### Rollback

There is nothing to roll back to — Stripe was never live. If Polar has to be switched off, unset `POLAR_ACCESS_TOKEN` and the platform returns to the state it is in today: Free tier fully working, counters incrementing in Postgres, only checkout, portal and webhook refusing. That is the same posture the current deployment already runs in, which is why this carries so little risk.

## Effort

| | |
| --- | --- |
| Phase 0 — Polar dashboard, sandbox | ~half day |
| Phases 1–6 — code | ~2 days |
| Phase 7 — docs, legal review async | ~1 day |
| Phase 8 — scripts and sandbox pass | ~half day |

Phases 1–6 are one continuous change; there is no value in landing them separately, since billing is unconfigured either way until Phase 8 sets a secret.
