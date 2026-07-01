import { eq, sql } from 'drizzle-orm';
import { db } from '@ganju/db';
import type { DbExecutor } from '@ganju/db';
import { utils } from '@ganju/utils';
import type { PlanLimits } from '@ganju/utils';

const { constants, PlanLimitError } = utils;

export type EffectivePlan = {
  plan: string;
  limits: PlanLimits;
  subscription: typeof db.schema.subscription.$inferSelect | null;
};

const limitsFor = (plan: string): PlanLimits =>
  (constants.PLAN_LIMITS as Record<string, PlanLimits>)[plan] ??
  constants.PLAN_LIMITS.FREE;

const isEntitled = (status: string): boolean =>
  (constants.SUBSCRIPTION_ENTITLED_STATUSES as readonly string[]).includes(
    status
  );

// A subscription only confers its paid plan while its status is entitled;
// otherwise (canceled, unpaid, …) the org falls back to Free limits.
const planFromSubscription = (
  sub: typeof db.schema.subscription.$inferSelect | null
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
    .from(db.schema.subscription)
    .where(eq(db.schema.subscription.organizationId, organizationId))
    .limit(1);

  const plan = planFromSubscription(sub ?? null);
  return { plan, limits: limitsFor(plan), subscription: sub ?? null };
};

// Create the Free subscription row that backs a new organization. Idempotent so
// it's safe to call from the org-create transaction (and again on backfill).
export const ensureSubscription = async (
  executor: DbExecutor,
  organizationId: string
): Promise<void> => {
  await executor
    .insert(db.schema.subscription)
    .values({ organizationId, plan: constants.PLAN_FREE })
    .onConflictDoNothing({ target: db.schema.subscription.organizationId });
};

// per-resource count quotas

const assertCountQuota = (
  limit: number | null,
  currentCount: number,
  feature: string,
  plan: string,
  noun: string
): void => {
  if (limit == null) return;
  if (currentCount >= limit) {
    throw new PlanLimitError(
      `Your ${plan} plan allows up to ${limit} ${noun}. Upgrade to Pro for unlimited ${noun}.`,
      { feature, plan, limit, used: currentCount }
    );
  }
};

export const assertToolQuota = (
  { plan, limits }: Pick<EffectivePlan, 'plan' | 'limits'>,
  currentCount: number
): void =>
  assertCountQuota(
    limits.maxToolsPerArtifact,
    currentCount,
    constants.PLAN_FEATURE_TOOL,
    plan,
    'tools'
  );

export const assertPromptQuota = (
  { plan, limits }: Pick<EffectivePlan, 'plan' | 'limits'>,
  currentCount: number
): void =>
  assertCountQuota(
    limits.maxPromptsPerArtifact,
    currentCount,
    constants.PLAN_FEATURE_PROMPT,
    plan,
    'prompts'
  );

export const assertChannelQuota = (
  { plan, limits }: Pick<EffectivePlan, 'plan' | 'limits'>,
  currentCount: number
): void =>
  assertCountQuota(
    limits.maxChannelsPerArtifact,
    currentCount,
    constants.PLAN_FEATURE_CHANNEL,
    plan,
    'channels'
  );

export const assertInviteAllowed = ({
  plan,
  limits
}: Pick<EffectivePlan, 'plan' | 'limits'>): void => {
  if (!limits.canInvite) {
    throw new PlanLimitError(
      'Inviting teammates is a Pro feature. Upgrade this organization to invite people.',
      { feature: constants.PLAN_FEATURE_INVITE, plan }
    );
  }
};

// Configuring an org's own LLM (bring-your-own-key) is a paid feature: Free orgs
// run on the shared platform model only. Throws on Free; no-op on paid plans.
export const assertCustomLlmAllowed = ({
  plan,
  limits
}: Pick<EffectivePlan, 'plan' | 'limits'>): void => {
  if (!limits.canUseCustomLlm) {
    throw new PlanLimitError(
      'Connecting your own AI model is a Pro feature. Upgrade this organization to add a custom model.',
      { feature: constants.PLAN_FEATURE_LLM, plan }
    );
  }
};

// org & project quotas (need a count query)

export const assertProjectQuota = async (
  executor: DbExecutor,
  organizationId: string
): Promise<void> => {
  const { plan, limits } = await getEffectivePlan(executor, organizationId);
  if (limits.maxProjects == null) return;

  const [{ total }] = await executor
    .select({ total: sql<number>`count(*)::int` })
    .from(db.schema.project)
    .where(eq(db.schema.project.organizationId, organizationId));

  assertCountQuota(
    limits.maxProjects,
    Number(total),
    constants.PLAN_FEATURE_PROJECT,
    plan,
    'projects'
  );
};

// Free plan = exactly one organization per user. Additional orgs require the
// user to already own at least one entitled paid org. The very first org is
// always allowed (so brand-new users can sign up).
export const assertOrganizationCreation = async (
  executor: DbExecutor,
  ownerId: string
): Promise<void> => {
  const owned = await executor
    .select({
      plan: db.schema.subscription.plan,
      status: db.schema.subscription.status
    })
    .from(db.schema.organization)
    .leftJoin(
      db.schema.subscription,
      eq(db.schema.subscription.organizationId, db.schema.organization.id)
    )
    .where(eq(db.schema.organization.ownerId, ownerId));

  if (owned.length === 0) return;

  const hasPaid = owned.some(
    o =>
      o.plan != null &&
      o.plan !== constants.PLAN_FREE &&
      o.status != null &&
      isEntitled(o.status)
  );

  if (!hasPaid) {
    throw new PlanLimitError(
      'The Free plan is limited to one organization. Upgrade an organization to Pro to create more.',
      {
        feature: constants.PLAN_FEATURE_ORGANIZATION,
        plan: constants.PLAN_FREE,
        limit: 1,
        used: owned.length
      }
    );
  }
};

// storage quotas

// Sum of raw file bytes across every artifact in the org.
const sumRawStorage = async (
  executor: DbExecutor,
  organizationId: string
): Promise<number> => {
  const [{ total }] = await executor
    .select({
      total: sql<number>`coalesce(sum(${db.schema.artifactResource.size}), 0)::bigint`
    })
    .from(db.schema.artifactResource)
    .innerJoin(
      db.schema.artifact,
      eq(db.schema.artifact.id, db.schema.artifactResource.artifactId)
    )
    .innerJoin(
      db.schema.project,
      eq(db.schema.project.id, db.schema.artifact.projectId)
    )
    .where(eq(db.schema.project.organizationId, organizationId));
  return Number(total) || 0;
};

// Sum of embedded/RAG bytes (the metered storage unit) across the org.
export const sumEmbeddedStorage = async (
  executor: DbExecutor,
  organizationId: string
): Promise<number> => {
  const [{ total }] = await executor
    .select({
      total: sql<number>`coalesce(sum(${db.schema.artifact.artifactResourceEmbeddedSize}), 0)::bigint`
    })
    .from(db.schema.artifact)
    .innerJoin(
      db.schema.project,
      eq(db.schema.project.id, db.schema.artifact.projectId)
    )
    .where(eq(db.schema.project.organizationId, organizationId));
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

// monthly message cap (channel assistant turns)

// Start of the current calendar month in UTC — the period Free orgs are capped
// against (paid orgs use their Stripe billing period when present).
const monthStartUtc = (now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

const loadOrCreateSubscription = async (
  executor: DbExecutor,
  organizationId: string
): Promise<typeof db.schema.subscription.$inferSelect> => {
  const [existing] = await executor
    .select()
    .from(db.schema.subscription)
    .where(eq(db.schema.subscription.organizationId, organizationId))
    .limit(1);
  if (existing) return existing;

  await ensureSubscription(executor, organizationId);
  const [created] = await executor
    .select()
    .from(db.schema.subscription)
    .where(eq(db.schema.subscription.organizationId, organizationId))
    .limit(1);
  return created;
};

export type MessageCapResult = {
  allowed: boolean;
  plan: string;
  used: number;
  cap: number | null;
  // How many messages this period may still run on the shared platform model.
  // Once `used` reaches this, a channel with no own key must connect one (paid)
  // or the org must upgrade (Free). `null` = unlimited shared-model use.
  sharedKeyCap: number | null;
};

// Resolve the org's message budget for the current period, lazily resetting the
// counter when the period has rolled over. Returns whether another assistant
// turn is allowed. Paid plans (cap === null) are always allowed.
export const checkMessageCap = async (
  executor: DbExecutor,
  organizationId: string,
  now: Date = new Date()
): Promise<MessageCapResult> => {
  const sub = await loadOrCreateSubscription(executor, organizationId);
  const plan = planFromSubscription(sub);
  const limits = limitsFor(plan);
  const cap = limits.monthlyMessageCap;
  const sharedKeyCap = limits.sharedKeyMessageCap;

  const periodStart =
    plan !== constants.PLAN_FREE && sub.currentPeriodStart
      ? sub.currentPeriodStart
      : monthStartUtc(now);

  let used = sub.messageCount;
  if (
    !sub.messagePeriodStart ||
    sub.messagePeriodStart.getTime() < periodStart.getTime()
  ) {
    await executor
      .update(db.schema.subscription)
      .set({
        messageCount: 0,
        messagePeriodStart: periodStart,
        // New period → the meter overage clock restarts too.
        reportedMessageOverage: 0,
        reportedEmbeddedOverageMb: 0
      })
      .where(eq(db.schema.subscription.id, sub.id));
    used = 0;
  }

  return { allowed: cap == null || used < cap, plan, used, cap, sharedKeyCap };
};

// Count one assistant turn against the org's monthly budget. Best-effort: a
// failure here must never break message delivery.
export const incrementMessageUsage = async (
  executor: DbExecutor,
  organizationId: string
): Promise<void> => {
  await executor
    .update(db.schema.subscription)
    .set({
      messageCount: sql`(${db.schema.subscription.messageCount}::int + 1)::int`
    })
    .where(eq(db.schema.subscription.organizationId, organizationId));
};

// usage summary (for the billing/status endpoint + dashboard)

export type OrganizationUsage = {
  projectCount: number;
  rawBytes: number;
  embeddedBytes: number;
  messagesUsed: number;
  messageCap: number | null;
};

export const getOrganizationUsage = async (
  executor: DbExecutor,
  organizationId: string
): Promise<OrganizationUsage> => {
  const [[{ projectCount }], rawBytes, embeddedBytes, cap] = await Promise.all([
    executor
      .select({ projectCount: sql<number>`count(*)::int` })
      .from(db.schema.project)
      .where(eq(db.schema.project.organizationId, organizationId)),
    sumRawStorage(executor, organizationId),
    sumEmbeddedStorage(executor, organizationId),
    checkMessageCap(executor, organizationId)
  ]);

  return {
    projectCount: Number(projectCount) || 0,
    rawBytes,
    embeddedBytes,
    messagesUsed: cap.used,
    messageCap: cap.cap
  };
};

export const Plan = {
  getEffectivePlan,
  ensureSubscription,
  assertToolQuota,
  assertPromptQuota,
  assertChannelQuota,
  assertInviteAllowed,
  assertCustomLlmAllowed,
  assertProjectQuota,
  assertOrganizationCreation,
  assertRawStorageQuota,
  assertEmbeddedStorageQuota,
  checkMessageCap,
  incrementMessageUsage,
  getOrganizationUsage
};
