import { create, schema, incrementArtifactUsage, plan } from './lib';
import { handleError } from './utils';

export const db = {
  create,
  schema,
  incrementArtifactUsage,
  plan
};
export const utils = {
  handleError
};

export type {
  Database,
  DbExecutor,
  UsageCounts,
  EffectivePlan,
  UsageCounters,
  ToolCallBudget
} from './lib';
