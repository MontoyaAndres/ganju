import { eq, sql } from 'drizzle-orm';
import { db } from '@ganju/db';
import type { DbExecutor, EffectivePlan } from '@ganju/db';
import { utils } from '@ganju/utils';

const { constants, PlanLimitError } = utils;

// The plan resolver and the storage quotas live in @ganju/db, because
// apps/tool-broker enforces the same storage rules and cannot import from here.
// They are re-exported through this module's `Plan` object unchanged, so every
// call site in apps/api still reads the same.
const {
  limitsFor,
  isEntitled,
  planFromSubscription,
  getEffectivePlan,
  sumRawStorage,
  sumEmbeddedStorage,
  assertRawStorageQuota,
  assertEmbeddedStorageQuota,
  rollUsagePeriodIfDue,
  checkToolCallBudget,
  incrementToolCallUsage
} = db.plan;

export type { EffectivePlan };
export {
  getEffectivePlan,
  sumEmbeddedStorage,
  assertRawStorageQuota,
  assertEmbeddedStorageQuota,
  checkToolCallBudget,
  incrementToolCallUsage
};

// Create the Free subscription row that backs a new organization. Idempotent so
// it's safe to call from the org-create transaction (and again on backfill).
//
// The period is stamped here rather than left null. An unstamped row reads as
// "this belongs to a period that has ended" on the first check, which rolls it —
// and a rollover ZEROES the counters, so usage recorded before that first check
// would be discarded. Nothing today can hit that (every counted call is behind a
// check that runs first, in the same request), but the ordering is not something
// a future caller should have to know.
export const ensureSubscription = async (
  executor: DbExecutor,
  organizationId: string
): Promise<void> => {
  await executor
    .insert(db.schema.subscription)
    .values({
      organizationId,
      plan: constants.PLAN_FREE,
      messagePeriodStart: db.plan.usagePeriodStart(null)
    })
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

// Writing tools as code is a paid feature, and the only one on this list where
// the reason is cost rather than packaging: a custom tool runs the customer's
// own code on infrastructure we pay for. Free's escape hatch is `http-endpoint`,
// which gives a custom name, description and input schema against the user's own
// backend and costs us one screened request.
//
// Enforced on every write path that can produce a running script — not only in
// the dashboard, which is one client of several and the easiest to bypass.
export const assertCustomCodeAllowed = ({
  plan,
  limits
}: Pick<EffectivePlan, 'plan' | 'limits'>): void => {
  if (!limits.canUseCustomCode) {
    throw new PlanLimitError(
      'Writing your own tools in code is a Pro feature. Upgrade this organization to deploy custom tools.',
      { feature: constants.PLAN_FEATURE_CUSTOM_CODE, plan }
    );
  }
};

// How many http-endpoint tools one artifact may hold. Free is capped rather than
// blocked: this IS its custom tool, and the cap is what keeps the tool list —
// and therefore the per-turn token cost on our own model key — bounded.
export const assertHttpEndpointQuota = (
  { plan, limits }: Pick<EffectivePlan, 'plan' | 'limits'>,
  currentCount: number
): void => {
  const max = limits.maxHttpEndpointsPerArtifact;
  if (max !== null && currentCount >= max) {
    throw new PlanLimitError(
      `The ${plan} plan allows ${max} HTTP endpoint${max === 1 ? '' : 's'} per server. Upgrade to add more.`,
      { feature: constants.PLAN_FEATURE_HTTP_ENDPOINT, plan, limit: max }
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

// monthly message cap (channel assistant turns)

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
  // Assistant turns this period that ran on the SHARED platform model. Only
  // these count against the two shared thresholds below — own-key turns cost us
  // no inference, so they must not draw down an allowance that bounds our bill.
  sharedUsed: number;
  // Shared turns included in the plan. Crossing it doesn't stop anything on a
  // paid plan — it just moves those turns onto the shared overage rate. Free has
  // no overage path, so its hard total cap is the same number and trips first.
  includedSharedMessages: number;
  // The abuse backstop. Unlike the line above, this one does stop the channel.
  sharedKeyHardCap: number | null;
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

  // The period, its boundary and what a rollover zeroes are shared with
  // apps/mcp's tool-call budget — every counter on this row belongs to the same
  // period, and two definitions of when it ends would bill one month twice.
  const { messageCount: used, sharedMessageCount: sharedUsed } =
    await rollUsagePeriodIfDue(executor, sub, now);

  return {
    allowed: cap == null || used < cap,
    plan,
    used,
    cap,
    sharedUsed,
    includedSharedMessages: limits.includedSharedMessages,
    sharedKeyHardCap: limits.sharedKeyHardCap
  };
};

// Count one assistant turn against the org's monthly budget. `onSharedKey` marks
// a turn that ran on OUR model — it bumps the shared sub-counter as well as the
// total, in one statement so the two can never diverge. Best-effort: a failure
// here must never break message delivery.
export const incrementMessageUsage = async (
  executor: DbExecutor,
  organizationId: string,
  onSharedKey = false
): Promise<void> => {
  await executor
    .update(db.schema.subscription)
    .set({
      messageCount: sql`(${db.schema.subscription.messageCount}::int + 1)::int`,
      ...(onSharedKey
        ? {
            sharedMessageCount: sql`(${db.schema.subscription.sharedMessageCount}::int + 1)::int`
          }
        : {})
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
  // Shared-model consumption, surfaced so the billing dashboard can tell the
  // owner they're into the shared overage rate and offer the cheaper path
  // (connect your own key) — the runner can't, since its reply is read by
  // whoever is chatting with the bot rather than by the owner.
  sharedMessagesUsed: number;
  includedSharedMessages: number;
  // Custom-tool invocations this period, and what the plan includes. The only
  // usage row on the dashboard that measures compute rather than storage or
  // inference, and the only one a customer can grow by writing a loop.
  toolCallsUsed: number;
  includedToolCalls: number;
};

export const getOrganizationUsage = async (
  executor: DbExecutor,
  organizationId: string
): Promise<OrganizationUsage> => {
  const [[{ projectCount }], rawBytes, embeddedBytes, cap, toolCalls] =
    await Promise.all([
      executor
        .select({ projectCount: sql<number>`count(*)::int` })
        .from(db.schema.project)
        .where(eq(db.schema.project.organizationId, organizationId)),
      sumRawStorage(executor, organizationId),
      sumEmbeddedStorage(executor, organizationId),
      checkMessageCap(executor, organizationId),
      checkToolCallBudget(executor, organizationId)
    ]);

  return {
    projectCount: Number(projectCount) || 0,
    rawBytes,
    embeddedBytes,
    messagesUsed: cap.used,
    messageCap: cap.cap,
    sharedMessagesUsed: cap.sharedUsed,
    includedSharedMessages: cap.includedSharedMessages,
    toolCallsUsed: toolCalls.used,
    includedToolCalls: toolCalls.included
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
  assertCustomCodeAllowed,
  assertHttpEndpointQuota,
  assertProjectQuota,
  assertOrganizationCreation,
  assertRawStorageQuota,
  assertEmbeddedStorageQuota,
  checkMessageCap,
  incrementMessageUsage,
  checkToolCallBudget,
  incrementToolCallUsage,
  getOrganizationUsage
};
