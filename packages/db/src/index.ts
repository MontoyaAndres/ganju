import {
  create,
  schema,
  incrementArtifactUsage,
  searchResourceChunks,
  plan
} from './lib';
import { handleError } from './utils';

export const db = {
  create,
  schema,
  incrementArtifactUsage,
  searchResourceChunks,
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
  ToolCallBudget,
  ResourceChunkSearch,
  ResourceChunkMatch,
  ResourceReranker
} from './lib';
