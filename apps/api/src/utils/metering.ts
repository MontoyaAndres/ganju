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
//
// Exported for one organization at a time, which is the only way to exercise the
// delta arithmetic without a sweep that would roll the period and move the
// reported marks of every other organization in the database. The cron
// entrypoint is still `runOverageMetering` below.
export const meterOrganization = async (
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

  // Messages: monotonic per-period counters, so the overage only grows.
  //
  // Each turn is billed exactly once, by whose key ran it. Shared turns draw
  // from the same included pool as everything else, but only up to the shared
  // sub-allowance — so they consume at most that much of the pool no matter how
  // many there are, and the remainder of the pool stays available to own-key
  // traffic. Beyond their sub-allowance, shared turns bill at the shared rate
  // instead of the platform-fee rate, and never at both.
  const sharedUsed = sub.sharedMessageCount;
  const ownKeyUsed = Math.max(0, sub.messageCount - sharedUsed);

  const sharedOverage = Math.max(
    0,
    sharedUsed - limits.includedSharedMessages
  );
  const sharedDelta = sharedOverage - sub.reportedSharedMessageOverage;

  const ownKeyIncluded = Math.max(
    0,
    limits.includedMessages -
      Math.min(sharedUsed, limits.includedSharedMessages)
  );
  const messageOverage = Math.max(0, ownKeyUsed - ownKeyIncluded);
  const messageDelta = messageOverage - sub.reportedMessageOverage;

  // Custom-tool invocations: a monotonic per-period counter, like messages, and
  // reported as a raw count of calls above the allowance. Native and proxied
  // tools are not in this number — apps/mcp counts only dispatches into the
  // org's own code, because that is the only tool call that runs on compute we
  // buy rather than on one screened fetch.
  const toolCallOverage = Math.max(
    0,
    sub.toolCallCount - limits.includedToolCalls
  );
  const toolCallDelta = toolCallOverage - sub.reportedToolCallOverage;

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
  if (sharedDelta > 0) {
    await reportMeter(
      stripe,
      constants.STRIPE_METER_SHARED_MESSAGES,
      sub.stripeCustomerId,
      sharedDelta
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
  if (toolCallDelta > 0) {
    await reportMeter(
      stripe,
      constants.STRIPE_METER_TOOL_CALLS,
      sub.stripeCustomerId,
      toolCallDelta
    );
  }

  // Advance only the marks whose meter event actually went through, so a failure
  // on one meter can't mark another's usage as billed.
  if (
    messageDelta > 0 ||
    sharedDelta > 0 ||
    embeddedDelta > 0 ||
    toolCallDelta > 0
  ) {
    await executor
      .update(db.schema.subscription)
      .set({
        reportedMessageOverage:
          messageDelta > 0 ? messageOverage : sub.reportedMessageOverage,
        reportedSharedMessageOverage:
          sharedDelta > 0 ? sharedOverage : sub.reportedSharedMessageOverage,
        reportedEmbeddedOverageMb:
          embeddedDelta > 0 ? embeddedOverageMb : sub.reportedEmbeddedOverageMb,
        reportedToolCallOverage:
          toolCallDelta > 0 ? toolCallOverage : sub.reportedToolCallOverage
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

  // The sweep runs under `ctx.waitUntil`, so an unhandled throw here is an
  // unhandled rejection in the cron invocation rather than a logged failure —
  // and a transient database blip on this one query would take the whole run
  // with it. Retention and the alert digest contain their errors the same way.
  let subs: { organizationId: string }[];
  try {
    subs = await dbInstance
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
  } catch (error) {
    console.error('[metering] failed to list billable organizations:', error);
    return;
  }

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
