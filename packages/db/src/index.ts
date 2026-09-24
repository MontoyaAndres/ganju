import {
  create,
  schema,
  incrementArtifactUsage,
  searchResourceChunks,
  toResourceSearchResult,
  plan
} from './lib';
import { handleError } from './utils';

export const db = {
  create,
  schema,
  incrementArtifactUsage,
  searchResourceChunks,
  toResourceSearchResult,
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
  ResourceReranker,
  ResourceSearchResult,
  ResourceSearchTimings
} from './lib';
