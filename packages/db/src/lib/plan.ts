import { eq, sql } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import type { PlanLimits } from '@ganju/utils';

import * as schema from './schema';
import type { DbExecutor } from './usage';

const { constants, PlanLimitError } = utils;

// The plan rules that have more than one worker enforcing them, and only those.
//
// Storage is here because apps/tool-broker enforces the same quotas — a script
// writing a resource spends the org's storage exactly as an upload does — and
// the broker depends on this package and @ganju/utils and nothing else. The
// usage period and the custom-tool budget are here because apps/mcp counts and
// caps every dispatch into a user's script, and it is likewise not allowed to
// import from apps/api.
//
// Message caps and everything Stripe-facing stay in apps/api: they have one
// caller, and moving them would drag the billing surface into a package three
// workers import.
//
// apps/api re-exports all of this through its own `Plan`, so no call site there
// changed.

export type EffectivePlan = {
  plan: string;
  limits: PlanLimits;
  subscription: typeof schema.subscription.$inferSelect | null;
};

export const limitsFor = (plan: string): PlanLimits =>
  (constants.PLAN_LIMITS as Record<string, PlanLimits>)[plan] ??
  constants.PLAN_LIMITS.FREE;

export const isEntitled = (status: string): boolean =>
  (constants.SUBSCRIPTION_ENTITLED_STATUSES as readonly string[]).includes(
    status
  );

// A subscription only confers its paid plan while its status is entitled;
// otherwise (canceled, unpaid, …) the org falls back to Free limits.
export const planFromSubscription = (
  sub: typeof schema.subscription.$inferSelect | null
): string => {
  if (!sub) return constants.PLAN_FREE;
  return isEntitled(sub.status) ? sub.plan : constants.PLAN_FREE;
};

export const getEffectivePlan = async (
  executor: DbExecutor,
  organizationId: string
): Promise<EffectivePlan> => {
  const [sub] = await executor
    .select()
    .from(schema.subscription)
    .where(eq(schema.subscription.organizationId, organizationId))
    .limit(1);

  const plan = planFromSubscription(sub ?? null);
  return { plan, limits: limitsFor(plan), subscription: sub ?? null };
};

// Sum of raw file bytes across every artifact in the org.
export const sumRawStorage = async (
  executor: DbExecutor,
  organizationId: string
): Promise<number> => {
  const [{ total }] = await executor
    .select({
      total: sql<number>`coalesce(sum(${schema.artifactResource.size}), 0)::bigint`
    })
    .from(schema.artifactResource)
    .innerJoin(
      schema.artifact,
      eq(schema.artifact.id, schema.artifactResource.artifactId)
    )
    .innerJoin(schema.project, eq(schema.project.id, schema.artifact.projectId))
    .where(eq(schema.project.organizationId, organizationId));
  return Number(total) || 0;
};

// Sum of embedded/RAG bytes (the metered storage unit) across the org.
export const sumEmbeddedStorage = async (
  executor: DbExecutor,
  organizationId: string
): Promise<number> => {
  const [{ total }] = await executor
    .select({
      total: sql<number>`coalesce(sum(${schema.artifact.artifactResourceEmbeddedSize}), 0)::bigint`
    })
    .from(schema.artifact)
    .innerJoin(schema.project, eq(schema.project.id, schema.artifact.projectId))
    .where(eq(schema.project.organizationId, organizationId));
  return Number(total) || 0;
};

export const assertRawStorageQuota = async (
  executor: DbExecutor,
  organizationId: string,
  addBytes: number
): Promise<void> => {
  const { plan, limits } = await getEffectivePlan(executor, organizationId);
  if (limits.maxRawStorageBytes == null) return;

  const used = await sumRawStorage(executor, organizationId);
  if (used + Math.max(0, addBytes) > limits.maxRawStorageBytes) {
    throw new PlanLimitError(
      'This organization has reached its Free file-storage limit. Upgrade to Pro for more storage.',
      {
        feature: constants.PLAN_FEATURE_RAW_STORAGE,
        plan,
        limit: limits.maxRawStorageBytes,
        used
      }
    );
  }
};

// Pre-check: block creating a new resource once the org is already at/over its
// embedded-content cap. (Embedded size for the new resource is only known after
// indexing, so this is an approximate "you're full" gate, not byte-exact.)
export const assertEmbeddedStorageQuota = async (
  executor: DbExecutor,
  organizationId: string
): Promise<void> => {
  const { plan, limits } = await getEffectivePlan(executor, organizationId);
  if (limits.maxEmbeddedBytes == null) return;

  const used = await sumEmbeddedStorage(executor, organizationId);
  if (used >= limits.maxEmbeddedBytes) {
    throw new PlanLimitError(
      'This organization has reached its Free embedded-content (RAG) limit. Upgrade to Pro for more.',
      {
        feature: constants.PLAN_FEATURE_EMBEDDED_STORAGE,
        plan,
        limit: limits.maxEmbeddedBytes,
        used
      }
    );
  }
};

// usage period — shared by every metered counter on the subscription row

// Start of the current calendar month in UTC. What a Free org is measured
// against: it has no Stripe subscription, so there is no billing period to read.
const monthStartUtc = (now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/**
 * The period every usage counter on this subscription belongs to: the Stripe
 * billing period on a paid plan, the calendar month otherwise.
 *
 * One definition, because two would disagree the first time an org's billing
 * period started mid-month — messages would roll on the 14th and tool calls on
 * the 1st, and each meter would report a month the other had already billed.
 */
export const usagePeriodStart = (
  sub: typeof schema.subscription.$inferSelect | null,
  now: Date = new Date()
): Date => {
  if (!sub) return monthStartUtc(now);
  const plan = planFromSubscription(sub);
  return plan !== constants.PLAN_FREE && sub.currentPeriodStart
    ? sub.currentPeriodStart
    : monthStartUtc(now);
};

export type UsageCounters = {
  messageCount: number;
  sharedMessageCount: number;
  toolCallCount: number;
};

/**
 * Zero the period's counters if the period has rolled over, and return what the
 * counters are NOW — either the stored values or the fresh zeroes.
 *
 * Lazy rather than scheduled: there is no job that visits every organization on
 * its own boundary, and the first read after a boundary is the only moment the
 * question is being asked anyway. Every reported-overage mark resets with the
 * counters, which is what re-bills stored content and restarts the message and
 * tool-call overage clocks for the new period.
 */
export const rollUsagePeriodIfDue = async (
  executor: DbExecutor,
  sub: typeof schema.subscription.$inferSelect,
  now: Date = new Date()
): Promise<UsageCounters> => {
  const periodStart = usagePeriodStart(sub, now);
  const due =
    !sub.messagePeriodStart ||
    sub.messagePeriodStart.getTime() < periodStart.getTime();

  if (!due) {
    return {
      messageCount: sub.messageCount,
      sharedMessageCount: sub.sharedMessageCount,
      toolCallCount: sub.toolCallCount
    };
  }

  await executor
    .update(schema.subscription)
    .set({
      messageCount: 0,
      sharedMessageCount: 0,
      toolCallCount: 0,
      messagePeriodStart: periodStart,
      reportedMessageOverage: 0,
      reportedSharedMessageOverage: 0,
      reportedEmbeddedOverageMb: 0,
      reportedToolCallOverage: 0
    })
    .where(eq(schema.subscription.id, sub.id));

  return { messageCount: 0, sharedMessageCount: 0, toolCallCount: 0 };
};

// custom-tool invocations (Workers for Platforms dispatches)

export type ToolCallBudget = {
  // False only at the abuse backstop. Crossing the included allowance changes
  // what a call costs, never whether it runs.
  allowed: boolean;
  plan: string;
  used: number;
  included: number;
  hardCap: number | null;
};

/**
 * Where this org stands on custom-tool invocations for the current period.
 *
 * Read once per MCP request that actually has custom code to serve — not per
 * tool call, and never for an artifact whose tools are all native, since those
 * cost us a screened fetch and are not metered.
 *
 * An organization with no subscription row is treated as Free and allowed: the
 * row is created with the organization and backfilled, so its absence means a
 * fixture or a half-migrated database, and neither is a customer to refuse.
 */
export const checkToolCallBudget = async (
  executor: DbExecutor,
  organizationId: string,
  now: Date = new Date()
): Promise<ToolCallBudget> => {
  const [sub] = await executor
    .select()
    .from(schema.subscription)
    .where(eq(schema.subscription.organizationId, organizationId))
    .limit(1);

  const plan = planFromSubscription(sub ?? null);
  const limits = limitsFor(plan);

  if (!sub) {
    return {
      allowed: true,
      plan,
      used: 0,
      included: limits.includedToolCalls,
      hardCap: limits.toolCallHardCap
    };
  }

  const { toolCallCount } = await rollUsagePeriodIfDue(executor, sub, now);

  return {
    allowed:
      limits.toolCallHardCap == null || toolCallCount < limits.toolCallHardCap,
    plan,
    used: toolCallCount,
    included: limits.includedToolCalls,
    hardCap: limits.toolCallHardCap
  };
};

/**
 * Count `count` custom-tool invocations against the org's period.
 *
 * Called once per MCP request with the number of dispatches that request made,
 * rather than once per call: the counter is a monotonic total, and one statement
 * that adds four is the same fact as four that add one, for a quarter of the
 * write cost. Best-effort by construction — an org with no subscription row
 * updates nothing, which is the same answer `checkToolCallBudget` gives it.
 */
export const incrementToolCallUsage = async (
  executor: DbExecutor,
  organizationId: string,
  count: number
): Promise<void> => {
  if (count <= 0) return;
  await executor
    .update(schema.subscription)
    .set({
      toolCallCount: sql`(${schema.subscription.toolCallCount}::int + ${count})::int`
    })
    .where(eq(schema.subscription.organizationId, organizationId));
};
