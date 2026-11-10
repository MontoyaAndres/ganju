import { utils } from '@ganju/utils';
import type { Database } from '@ganju/db';

import { Plan } from '../../utils';
import type { Bindings } from '../../types';

// Until credits are billed, only the organizations listed in
// BUILDER_ORGANIZATIONS (comma-separated ids) reach it.
const allowlisted = (env: Bindings, organizationId: string) =>
  (utils.getEnv({ env }, 'BUILDER_ORGANIZATIONS') ?? '')
    .split(',')
    .map(id => id.trim())
    .includes(organizationId);

export const builderApiKey = (env: Bindings) =>
  utils.getEnv({ env }, 'ANTHROPIC_API_KEY');

export const assertBuilderAllowed = async (
  env: Bindings,
  database: Database,
  organizationId: string
) => {
  if (!allowlisted(env, organizationId)) {
    throw new Error('The assistant is not found for this organization');
  }
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
