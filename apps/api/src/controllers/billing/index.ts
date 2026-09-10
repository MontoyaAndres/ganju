import { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '@ganju/db';
import type { DbExecutor } from '@ganju/db';
import { utils } from '@ganju/utils';

import { Plan, createPolar, verifyPolarWebhook } from '../../utils';
import type { PolarSubscription, PolarWebhookEvent } from '../../utils/polar';

// types
import { AppEnv } from '../../types';

const { constants } = utils;

const getPlan = async (c: Context<AppEnv>) => {
  const organizationId = c.req.param('organizationId');
  if (!organizationId) throw new Error('organizationId is required');

  const { plan, limits } = await Plan.getEffectivePlan(
    db.create(c),
    organizationId
  );

  return c.json({ plan, limits });
};

const getStatus = async (c: Context<AppEnv>) => {
  const organizationId = c.req.param('organizationId');
  if (!organizationId) throw new Error('organizationId is required');

  const dbInstance = db.create(c);

  const { plan, limits, subscription } = await Plan.getEffectivePlan(
    dbInstance,
    organizationId
  );
  const usage = await Plan.getOrganizationUsage(dbInstance, organizationId);

  return c.json({
    plan,
    limits,
    usage,
    subscription: subscription
      ? {
          status: subscription.status,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          currentPeriodEnd: subscription.currentPeriodEnd,
          customDomain: subscription.customDomain,
          hasBillingAccount: !!subscription.billingCustomerId
        }
      : null,
    pricing: {
      proBaseUsd: constants.PRICING_PRO_BASE_USD,
      includedMessages: constants.PRICING_INCLUDED_MESSAGES,
      includedSharedMessages: constants.PRICING_INCLUDED_SHARED_MESSAGES,
      includedEmbeddedGb: constants.PRICING_INCLUDED_EMBEDDED_GB,
      messagePer1kUsd: constants.PRICING_MESSAGE_PER_1K_USD,
      sharedMessagePer1kUsd: constants.PRICING_SHARED_MESSAGE_PER_1K_USD,
      embeddedPerGbUsd: constants.PRICING_EMBEDDED_PER_GB_USD,
      includedToolCalls: constants.PRICING_INCLUDED_TOOL_CALLS,
      toolCallPerMillionUsd: constants.PRICING_TOOL_CALL_PER_M_USD,
      customDomainUsd: constants.PRICING_CUSTOM_DOMAIN_USD
    }
  });
};

/**
 * The checkout locale for this request, from the language the dashboard is in.
 *
 * Polar takes an IETF BCP 47 tag and ships Spanish, but accepts far more than we
 * do, so this narrows to the two we actually have rather than forwarding
 * whatever arrived — the checkout is the last page to fail on a detail like
 * that.
 */
const checkoutLocale = (c: Context<AppEnv>): 'en' | 'es' =>
  utils.languageFromHeader(c.req.header('accept-language')) ===
  constants.LANGUAGE_ES
    ? 'es'
    : 'en';

const createCheckout = async (c: Context<AppEnv>) => {
  const organizationId = c.req.param('organizationId');
  if (!organizationId) throw new Error('organizationId is required');

  const polar = createPolar(c);
  if (!polar) throw new Error('Billing is not configured');

  const productId = utils.getEnv(c, 'POLAR_PRODUCT_PRO');
  if (!productId) throw new Error('Missing env: POLAR_PRODUCT_PRO');

  const dbInstance = db.create(c);

  // Already on a paid plan? Send them to the portal instead of double-charging.
  const { plan } = await Plan.getEffectivePlan(dbInstance, organizationId);
  if (plan !== constants.PLAN_FREE) {
    throw new Error('This organization is already on a paid plan');
  }

  // The row has to exist before the webhook comes back looking for it.
  await Plan.ensureSubscription(dbInstance, organizationId);

  const webUrl = utils.getEnv(c, 'NEXT_PUBLIC_WEB_URL') || '';
  const returnBase = `${webUrl}/organization/${organizationId}/settings`;
  const user = c.get('user');

  // One product carries the $29 base and all four metered prices, so there is
  // nothing to assemble here and no rate that can be silently left off. The
  // organization id goes straight on as `external_customer_id`: Polar creates
  // the customer at checkout and hands the same id back on every webhook.
  const { url } = await polar.createCheckout({
    productId,
    organizationId,
    customerEmail: user.email,
    successUrl: `${returnBase}?billing=success`,
    // Polar's own chrome — the pay button, "Subtotal", the card form — is
    // localized by this. Left unset it reads the BROWSER's language, and that
    // is not the language the user picked in the dashboard: someone reading
    // Ganju in Spanish on an English-configured browser would land on an
    // English checkout. The dashboard sends its own choice on `Accept-Language`
    // (the shared fetcher sets it), the same header the invitation emails are
    // written from.
    //
    // It does NOT translate the product name or description — those come from
    // the Polar Product, which has no per-locale copy.
    locale: checkoutLocale(c)
  });

  return c.json({ url });
};

const createPortal = async (c: Context<AppEnv>) => {
  const organizationId = c.req.param('organizationId');
  if (!organizationId) throw new Error('organizationId is required');

  const polar = createPolar(c);
  if (!polar) throw new Error('Billing is not configured');

  const dbInstance = db.create(c);
  const [sub] = await dbInstance
    .select()
    .from(db.schema.subscription)
    .where(eq(db.schema.subscription.organizationId, organizationId))
    .limit(1);

  if (!sub?.billingCustomerId) {
    throw new Error('This organization has no billing account yet');
  }

  const webUrl = utils.getEnv(c, 'NEXT_PUBLIC_WEB_URL') || '';
  // The session expires, which is why this is minted per click rather than
  // stored. Portal localization is still in beta at Polar and scoped to
  // checkout, so this page may render untranslated.
  const { customerPortalUrl } = await polar.createCustomerSession(
    organizationId,
    `${webUrl}/organization/${organizationId}/settings`
  );

  return c.json({ url: customerPortalUrl });
};

// Epoch ms for when the subscription itself last changed. Not when Polar sent
// the notification — a subscription's own clock is what ordering wants, and it
// is the one thing every delivery carries.
const subscriptionChangedAt = (sub: PolarSubscription): number => {
  const stamp = sub.modified_at || sub.created_at;
  const parsed = stamp ? Date.parse(stamp) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
};

const syncSubscription = async (
  dbInstance: DbExecutor,
  sub: PolarSubscription,
  productToPlan: Record<string, string>
): Promise<void> => {
  const customerId = sub.customer?.id || sub.customer_id || null;

  // Every delivery carries our own id on the customer. The lookup below is for
  // a subscription created by hand for an Enterprise customer, which has no
  // external id because no checkout of ours made it.
  let organizationId = sub.customer?.external_id || undefined;

  if (!organizationId && customerId) {
    const [byCustomer] = await dbInstance
      .select({ organizationId: db.schema.subscription.organizationId })
      .from(db.schema.subscription)
      .where(eq(db.schema.subscription.billingCustomerId, customerId))
      .limit(1);
    organizationId = byCustomer?.organizationId;
  }

  if (!organizationId) return;

  // Drop stale, out-of-order deliveries: if we've already applied a newer change
  // for this subscription, ignore this one (e.g. a late `updated` arriving after
  // a `revoked`). Equal timestamps are reapplied — the update is idempotent.
  const changedAt = subscriptionChangedAt(sub);
  const [current] = await dbInstance
    .select({ lastBillingEventAt: db.schema.subscription.lastBillingEventAt })
    .from(db.schema.subscription)
    .where(eq(db.schema.subscription.organizationId, organizationId))
    .limit(1);
  if (
    current?.lastBillingEventAt != null &&
    changedAt < current.lastBillingEventAt
  ) {
    return;
  }

  const status = sub.status;
  const entitled = (
    constants.SUBSCRIPTION_ENTITLED_STATUSES as readonly string[]
  ).includes(status);
  const productId = sub.product_id ?? null;

  // Resolve the plan from the subscribed product (Pro vs Enterprise). An
  // entitled subscription against an unmapped product still grants Pro
  // (back-compat); anything not entitled falls back to Free limits.
  const plan = entitled
    ? (productId && productToPlan[productId]) || constants.PLAN_PRO
    : constants.PLAN_FREE;

  const periodStart = sub.current_period_start
    ? new Date(sub.current_period_start)
    : null;
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end)
    : null;

  await dbInstance
    .update(db.schema.subscription)
    .set({
      plan,
      status,
      billingSubscriptionId: sub.id,
      billingProductId: productId,
      billingCustomerId: customerId,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      lastBillingEventAt: changedAt
    })
    .where(eq(db.schema.subscription.organizationId, organizationId));
};

const webhook = async (c: Context<AppEnv>) => {
  const polar = createPolar(c);
  const webhookSecret = utils.getEnv(c, 'POLAR_WEBHOOK_SECRET');
  if (!polar || !webhookSecret) {
    return c.json({ error: 'Billing is not configured' }, 503);
  }

  const payload = await c.req.text();

  // Standard Webhooks: the three headers below sign `{id}.{timestamp}.{body}`,
  // which is why the raw text is read rather than the parsed JSON.
  const verified = await verifyPolarWebhook(
    webhookSecret,
    {
      id: c.req.header('webhook-id'),
      timestamp: c.req.header('webhook-timestamp'),
      signature: c.req.header('webhook-signature')
    },
    payload
  );
  if (!verified) {
    return c.json({ error: 'Webhook signature verification failed' }, 400);
  }

  let event: PolarWebhookEvent;
  try {
    event = JSON.parse(payload) as PolarWebhookEvent;
  } catch {
    return c.json({ error: 'Malformed webhook payload' }, 400);
  }

  const dbInstance = db.create(c);

  // Build the product → plan map from the configured product ids.
  const productToPlan: Record<string, string> = {};
  const proProduct = utils.getEnv(c, 'POLAR_PRODUCT_PRO');
  if (proProduct) productToPlan[proProduct] = constants.PLAN_PRO;
  const enterpriseProduct = utils.getEnv(c, 'POLAR_PRODUCT_ENTERPRISE');
  if (enterpriseProduct) {
    productToPlan[enterpriseProduct] = constants.PLAN_ENTERPRISE;
  }

  // `subscription.updated` is Polar's catch-all for state transitions, so these
  // three cover every change the row cares about. There is no checkout event to
  // handle: the subscription already carries the customer, and the customer
  // already carries the organization id.
  switch (event.type) {
    case 'subscription.created':
    case 'subscription.updated':
    case 'subscription.revoked': {
      await syncSubscription(dbInstance, event.data, productToPlan);
      break;
    }
    default:
      break;
  }

  return c.json({ received: true });
};

export const BillingController = {
  getPlan,
  getStatus,
  createCheckout,
  createPortal,
  webhook
};
