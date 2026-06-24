import { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '@ganju/db';
import type { DbExecutor } from '@ganju/db';
import { utils } from '@ganju/utils';

import { Plan, createStripe, stripeCryptoProvider } from '../../utils';
import type { Stripe } from '../../utils/stripe';

// types
import { AppEnv } from '../../types';

const { constants } = utils;

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
          hasBillingAccount: !!subscription.stripeCustomerId
        }
      : null,
    pricing: {
      proBaseUsd: constants.PRICING_PRO_BASE_USD,
      includedMessages: constants.PRICING_INCLUDED_MESSAGES,
      includedEmbeddedGb: constants.PRICING_INCLUDED_EMBEDDED_GB,
      messagePer1kUsd: constants.PRICING_MESSAGE_PER_1K_USD,
      embeddedPerGbUsd: constants.PRICING_EMBEDDED_PER_GB_USD,
      customDomainUsd: constants.PRICING_CUSTOM_DOMAIN_USD
    }
  });
};

const ensureStripeCustomer = async (
  c: Context<AppEnv>,
  stripe: Stripe,
  dbInstance: DbExecutor,
  organizationId: string
): Promise<string> => {
  await Plan.ensureSubscription(dbInstance, organizationId);
  const [sub] = await dbInstance
    .select()
    .from(db.schema.subscription)
    .where(eq(db.schema.subscription.organizationId, organizationId))
    .limit(1);

  if (sub?.stripeCustomerId) return sub.stripeCustomerId;

  const user = c.get('user');
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name || undefined,
    metadata: { organizationId }
  });

  await dbInstance
    .update(db.schema.subscription)
    .set({ stripeCustomerId: customer.id })
    .where(eq(db.schema.subscription.organizationId, organizationId));

  return customer.id;
};

const createCheckout = async (c: Context<AppEnv>) => {
  const organizationId = c.req.param('organizationId');
  if (!organizationId) throw new Error('organizationId is required');

  const stripe = createStripe(c);
  if (!stripe) throw new Error('Billing is not configured');

  const priceId = utils.getEnv(c, 'STRIPE_PRICE_PRO');
  if (!priceId) throw new Error('Missing env: STRIPE_PRICE_PRO');

  const dbInstance = db.create(c);

  // Already on a paid plan? Send them to the portal instead of double-charging.
  const { plan } = await Plan.getEffectivePlan(dbInstance, organizationId);
  if (plan !== constants.PLAN_FREE) {
    throw new Error('This organization is already on a paid plan');
  }

  const customerId = await ensureStripeCustomer(
    c,
    stripe,
    dbInstance,
    organizationId
  );

  const webUrl = utils.getEnv(c, 'NEXT_PUBLIC_WEB_URL') || '';
  const returnBase = `${webUrl}/organization/${organizationId}/settings`;

  // Base Pro price plus the metered overage prices (when configured). Metered
  // line items carry no quantity — usage is reported to their meters by cron.
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: priceId, quantity: 1 }
  ];
  const messageOveragePrice = utils.getEnv(c, 'STRIPE_PRICE_MESSAGE_OVERAGE');
  if (messageOveragePrice) lineItems.push({ price: messageOveragePrice });
  const embeddedOveragePrice = utils.getEnv(c, 'STRIPE_PRICE_EMBEDDED_OVERAGE');
  if (embeddedOveragePrice) lineItems.push({ price: embeddedOveragePrice });

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: lineItems,
    client_reference_id: organizationId,
    subscription_data: { metadata: { organizationId } },
    allow_promotion_codes: true,
    success_url: `${returnBase}?billing=success`,
    cancel_url: `${returnBase}?billing=cancelled`
  });

  return c.json({ url: session.url });
};

const createPortal = async (c: Context<AppEnv>) => {
  const organizationId = c.req.param('organizationId');
  if (!organizationId) throw new Error('organizationId is required');

  const stripe = createStripe(c);
  if (!stripe) throw new Error('Billing is not configured');

  const dbInstance = db.create(c);
  const [sub] = await dbInstance
    .select()
    .from(db.schema.subscription)
    .where(eq(db.schema.subscription.organizationId, organizationId))
    .limit(1);

  if (!sub?.stripeCustomerId) {
    throw new Error('This organization has no billing account yet');
  }

  const webUrl = utils.getEnv(c, 'NEXT_PUBLIC_WEB_URL') || '';
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${webUrl}/organization/${organizationId}/settings`
  });

  return c.json({ url: session.url });
};

const syncSubscription = async (
  stripe: Stripe,
  dbInstance: DbExecutor,
  sub: Stripe.Subscription,
  priceToPlan: Record<string, string>,
  eventCreatedAt: number
): Promise<void> => {
  // Prefer the explicit metadata we set at checkout; otherwise match by the
  // stored Stripe customer id.
  let organizationId =
    (sub.metadata?.organizationId as string | undefined) || undefined;

  const customerId =
    typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  if (!organizationId) {
    const [byCustomer] = await dbInstance
      .select({ organizationId: db.schema.subscription.organizationId })
      .from(db.schema.subscription)
      .where(eq(db.schema.subscription.stripeCustomerId, customerId))
      .limit(1);
    organizationId = byCustomer?.organizationId;
  }

  // Last resort (e.g. an Enterprise subscription created by hand in Stripe with
  // no subscription metadata and no prior self-serve customer row): read the
  // organizationId off the customer's metadata.
  if (!organizationId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (!customer.deleted) {
        organizationId =
          (customer.metadata?.organizationId as string | undefined) ||
          undefined;
      }
    } catch {
      // ignore — fall through to the no-op below
    }
  }

  if (!organizationId) return;

  // Drop stale, out-of-order deliveries: if we've already applied a newer event
  // for this subscription, ignore this one (e.g. a late `updated` arriving after
  // a `deleted`). Equal timestamps are reapplied — the update is idempotent.
  const [current] = await dbInstance
    .select({ lastStripeEventAt: db.schema.subscription.lastStripeEventAt })
    .from(db.schema.subscription)
    .where(eq(db.schema.subscription.organizationId, organizationId))
    .limit(1);
  if (
    current?.lastStripeEventAt != null &&
    eventCreatedAt < current.lastStripeEventAt
  ) {
    return;
  }

  const status = sub.status;
  const entitled = (
    constants.SUBSCRIPTION_ENTITLED_STATUSES as readonly string[]
  ).includes(status);
  const priceId = sub.items.data[0]?.price?.id ?? null;

  // Resolve the plan from the subscribed price (Pro vs Enterprise). An entitled
  // subscription against an unmapped price still grants Pro (back-compat);
  // anything not entitled falls back to Free limits.
  const plan = entitled
    ? (priceId && priceToPlan[priceId]) || constants.PLAN_PRO
    : constants.PLAN_FREE;

  // Period fields moved onto the subscription item in recent API versions —
  // read from either location.
  const item = sub.items.data[0] as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  const subAny = sub as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  const periodStartUnix =
    item?.current_period_start ?? subAny.current_period_start;
  const periodEndUnix = item?.current_period_end ?? subAny.current_period_end;

  await dbInstance
    .update(db.schema.subscription)
    .set({
      plan,
      status,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      stripeCustomerId:
        typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      currentPeriodStart: periodStartUnix
        ? new Date(periodStartUnix * 1000)
        : null,
      currentPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      lastStripeEventAt: eventCreatedAt
    })
    .where(eq(db.schema.subscription.organizationId, organizationId));
};

const webhook = async (c: Context<AppEnv>) => {
  const stripe = createStripe(c);
  const webhookSecret = utils.getEnv(c, 'STRIPE_WEBHOOK_SECRET');
  if (!stripe || !webhookSecret) {
    return c.json({ error: 'Billing is not configured' }, 503);
  }

  const signature = c.req.header('stripe-signature');
  if (!signature) return c.json({ error: 'Missing signature' }, 400);

  const payload = await c.req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      webhookSecret,
      undefined,
      stripeCryptoProvider()
    );
  } catch (error) {
    return c.json(
      { error: `Webhook signature verification failed: ${String(error)}` },
      400
    );
  }

  const dbInstance = db.create(c);

  // Build the price → plan map from the configured price ids.
  const priceToPlan: Record<string, string> = {};
  const proPrice = utils.getEnv(c, 'STRIPE_PRICE_PRO');
  if (proPrice) priceToPlan[proPrice] = constants.PLAN_PRO;
  const enterprisePrice = utils.getEnv(c, 'STRIPE_PRICE_ENTERPRISE');
  if (enterprisePrice) priceToPlan[enterprisePrice] = constants.PLAN_ENTERPRISE;

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription) {
        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id;
        const full = await stripe.subscriptions.retrieve(subscriptionId);
        // Carry the checkout's org reference onto the subscription metadata so
        // syncSubscription can resolve it even before our row has the ids.
        if (!full.metadata?.organizationId && session.client_reference_id) {
          full.metadata = {
            ...full.metadata,
            organizationId: session.client_reference_id
          };
        }
        await syncSubscription(
          stripe,
          dbInstance,
          full,
          priceToPlan,
          event.created
        );
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await syncSubscription(
        stripe,
        dbInstance,
        event.data.object as Stripe.Subscription,
        priceToPlan,
        event.created
      );
      break;
    }
    default:
      break;
  }

  return c.json({ received: true });
};

export const BillingController = {
  getStatus,
  createCheckout,
  createPortal,
  webhook
};
