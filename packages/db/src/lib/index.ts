import { create } from './db';
import * as schema from './schema';
import { incrementArtifactUsage } from './usage';
import { searchResourceChunks } from './search';
import {
  limitsFor,
  isEntitled,
  planFromSubscription,
  getEffectivePlan,
  sumRawStorage,
  sumEmbeddedStorage,
  assertRawStorageQuota,
  assertEmbeddedStorageQuota,
  usagePeriodStart,
  rollUsagePeriodIfDue,
  checkToolCallBudget,
  incrementToolCallUsage
} from './plan';

export type { Database } from './db';
export type { DbExecutor, UsageCounts } from './usage';
export type { EffectivePlan, UsageCounters, ToolCallBudget } from './plan';
export type {
  ResourceChunkSearch,
  ResourceChunkMatch,
  ResourceReranker
} from './search';

export const plan = {
  limitsFor,
  isEntitled,
  planFromSubscription,
  getEffectivePlan,
  sumRawStorage,
  sumEmbeddedStorage,
  assertRawStorageQuota,
  assertEmbeddedStorageQuota,
  usagePeriodStart,
  rollUsagePeriodIfDue,
  checkToolCallBudget,
  incrementToolCallUsage
};

export { create, schema, incrementArtifactUsage, searchResourceChunks };
