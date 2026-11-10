import { and, eq } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';
import type { Database } from '@ganju/db';

import { Plan } from '../../utils';
import type { BuilderCredits } from '../../utils/plan';
import type { Bindings } from '../../types';

export const builderApiKey = (env: Bindings) =>
  utils.getEnv({ env }, 'ANTHROPIC_API_KEY');

export const assertBuilderAllowed = async (
  env: Bindings,
  database: Database,
  organizationId: string
) => {
  const { plan, limits } = await Plan.getEffectivePlan(
    database,
    organizationId
  );
  if (!limits.canUseBuilder) {
    throw new utils.PlanLimitError(
      'The assistant is a Pro feature. Upgrade to build with it.',
      { feature: utils.constants.PLAN_FEATURE_BUILDER, plan }
    );
  }
  if (!builderApiKey(env)) {
    throw new Error('The assistant is not configured (ANTHROPIC_API_KEY)');
  }
};

export interface BuilderKey {
  apiKey: string;
  baseUrl: string | null;
  ownKey: boolean;
}

export const creditsUsedUp = (credits: BuilderCredits): Error =>
  new utils.PlanLimitError(
    "This month's assistant credits are used up. An admin can raise the limit in Settings → Billing & plan.",
    {
      feature: utils.constants.PLAN_FEATURE_BUILDER_CREDITS,
      plan: credits.plan,
      limit: credits.included + credits.cap,
      used: Math.floor(credits.used)
    }
  );

/**
 * The key the assistant answers with: the organization's chosen Anthropic
 * connection, or ours while it has credits left. A chosen key that fails is
 * reported, never swapped for ours.
 */
export const resolveBuilderKey = async (
  env: Bindings,
  database: Database,
  organizationId: string
): Promise<BuilderKey> => {
  const credits = await Plan.checkBuilderCredits(database, organizationId);
  if (credits.llmId) {
    const [row] = await database
      .select({
        apiKey: db.schema.organizationLlm.apiKey,
        baseUrl: db.schema.organizationLlm.baseUrl
      })
      .from(db.schema.organizationLlm)
      .where(
        and(
          eq(db.schema.organizationLlm.id, credits.llmId),
          eq(db.schema.organizationLlm.organizationId, organizationId),
          eq(
            db.schema.organizationLlm.provider,
            utils.constants.LLM_PROVIDER_ANTHROPIC
          )
        )
      )
      .limit(1);
    if (row) {
      return {
        apiKey: utils.decryptString(
          row.apiKey,
          utils.getCredentialEncryptionKey({ env })
        ),
        baseUrl: row.baseUrl,
        ownKey: true
      };
    }
  }
  if (!credits.allowed) throw creditsUsedUp(credits);
  const apiKey = builderApiKey(env);
  if (!apiKey) throw new Error('The assistant is not configured');
  return { apiKey, baseUrl: null, ownKey: false };
};
