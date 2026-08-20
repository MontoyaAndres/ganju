import { eq, sql } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import type { PlanLimits } from '@ganju/utils';

import * as schema from './schema';
import type { DbExecutor } from './usage';

const { constants, PlanLimitError } = utils;

// The storage half of the plan rules, and only that half.
//
// It lives here rather than in apps/api because apps/tool-broker enforces the
// same quotas — a script writing a resource spends the org's storage exactly as
// an upload does — and the broker depends on this package and @ganju/utils and
// nothing else. Tool counts, message caps and everything Stripe-facing stay in
// apps/api: they have no second caller, and moving them would drag the billing
// surface into a package three workers import.
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
