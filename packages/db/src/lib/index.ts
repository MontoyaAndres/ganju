import { create } from './db';
import * as schema from './schema';
import { incrementArtifactUsage } from './usage';
import {
  limitsFor,
  isEntitled,
  planFromSubscription,
  getEffectivePlan,
  sumRawStorage,
  sumEmbeddedStorage,
  assertRawStorageQuota,
  assertEmbeddedStorageQuota
} from './plan';

export type { Database } from './db';
export type { DbExecutor, UsageCounts } from './usage';
export type { EffectivePlan } from './plan';

export const plan = {
  limitsFor,
  isEntitled,
  planFromSubscription,
  getEffectivePlan,
  sumRawStorage,
  sumEmbeddedStorage,
  assertRawStorageQuota,
  assertEmbeddedStorageQuota
};

export { create, schema, incrementArtifactUsage };
