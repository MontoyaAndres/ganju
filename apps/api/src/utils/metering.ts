import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@ganju/db';
import type { DbExecutor } from '@ganju/db';
import { utils } from '@ganju/utils';
import type { PlanLimits } from '@ganju/utils';

import { createStripe } from './stripe';
import { checkMessageCap, sumEmbeddedStorage } from './plan';
import type { Stripe } from './stripe';

import type { EnvSource } from '@ganju/utils';
import type { Bindings } from '../types';

const { constants } = utils;

type ApiEnvSource = EnvSource & { env: Bindings };

const limitsFor = (plan: string): PlanLimits =>
  (constants.PLAN_LIMITS as Record<string, PlanLimits>)[plan] ??
  constants.PLAN_LIMITS.FREE;

// Report a single overage meter event (no-op when the delta is non-positive).
const reportMeter = async (
  stripe: Stripe,
  eventName: string,
  customerId: string,
  delta: number
): Promise<void> => {
  if (delta <= 0) return;
  await stripe.billing.meterEvents.create({
    event_name: eventName,
    payload: {
      stripe_customer_id: customerId,
      value: String(delta)
    }
  });
};

// Push this org's current-period overage to Stripe. Reports only the increment
// since the last run (tracked on the subscription row) so meter events never
// double-count, and stores the new high-water mark.
const meterOrganization = async (
  executor: DbExecutor,
  stripe: Stripe,
  organizationId: string
): Promise<void> => {
  // Roll the period over first if due — this also zeroes the reported counters,
  // so a fresh month re-bills stored content and resets the message overage.
  await checkMessageCap(executor, organizationId);

  const [sub] = await executor
    .select()
    .from(db.schema.subscription)
    .where(eq(db.schema.subscription.organizationId, organizationId))
    .limit(1);

  if (!sub?.stripeCustomerId) return;

  const limits = limitsFor(sub.plan);

  // Messages: a monotonic per-period counter, so the overage only grows.
  const messageOverage = Math.max(
    0,
    sub.messageCount - limits.includedMessages
  );
  const messageDelta = messageOverage - sub.reportedMessageOverage;

  // Embedded storage: a live level. We bill the high-water mark of the overage
  // within the period (decreases aren't credited), reported in whole MB.
  const embeddedBytes = await sumEmbeddedStorage(executor, organizationId);
  const embeddedOverageMb =
    embeddedBytes > limits.includedEmbeddedBytes
      ? Math.ceil((embeddedBytes - limits.includedEmbeddedBytes) / constants.MB)
      : 0;
  const embeddedDelta = embeddedOverageMb - sub.reportedEmbeddedOverageMb;

  if (messageDelta > 0) {
    await reportMeter(
      stripe,
      constants.STRIPE_METER_MESSAGES,
      sub.stripeCustomerId,
      messageDelta
    );
  }
  if (embeddedDelta > 0) {
    await reportMeter(
      stripe,
      constants.STRIPE_METER_EMBEDDED,
      sub.stripeCustomerId,
      embeddedDelta
    );
  }

  if (messageDelta > 0 || embeddedDelta > 0) {
    await executor
      .update(db.schema.subscription)
      .set({
        reportedMessageOverage:
          messageDelta > 0 ? messageOverage : sub.reportedMessageOverage,
        reportedEmbeddedOverageMb:
          embeddedDelta > 0 ? embeddedOverageMb : sub.reportedEmbeddedOverageMb
      })
      .where(eq(db.schema.subscription.id, sub.id));
  }
};

// Cron entrypoint: report metered overage for every paid, entitled org with a
// Stripe customer. Per-org failures are isolated so one bad org can't stall the
// rest of the run.
export const runOverageMetering = async (
  source: ApiEnvSource
): Promise<void> => {
  const stripe = createStripe(source);
  if (!stripe) return;

  const dbInstance = db.create(source);

  const subs = await dbInstance
    .select({ organizationId: db.schema.subscription.organizationId })
    .from(db.schema.subscription)
    .where(
      and(
        inArray(db.schema.subscription.plan, [
          constants.PLAN_PRO,
          constants.PLAN_ENTERPRISE
        ]),
        inArray(
          db.schema.subscription.status,
          constants.SUBSCRIPTION_ENTITLED_STATUSES as unknown as string[]
        ),
        isNotNull(db.schema.subscription.stripeCustomerId)
      )
    );

  for (const { organizationId } of subs) {
    try {
      await meterOrganization(dbInstance, stripe, organizationId);
    } catch (error) {
      // Log and continue — never let one org abort the whole sweep.
      console.error(
        `[metering] failed for org ${organizationId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }
};
