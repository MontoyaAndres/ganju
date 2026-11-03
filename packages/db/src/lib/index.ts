import { create } from './db';
import * as schema from './schema';
import { incrementArtifactUsage } from './usage';
import { searchResourceChunks, toResourceSearchResult } from './search';
import {
  databaseStub,
  callData,
  createDataUsageTally,
  dataLimitsFor,
  findArtifactDatabase,
  openArtifactDatabase,
  dataCaller,
  recordDataUsage,
  recordChange
} from './data';
import {
  ChannelSendError,
  CHANNEL_MESSAGE_SOURCE_KEY,
  WHATSAPP_WINDOW_MS,
  sendToParticipant,
  postToChat
} from './channels';
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
  DataNamespaceLike,
  DataUsageTally,
  ArtifactDatabaseRow,
  OpenedDatabase
} from './data';
export type {
  ChannelMessageSource,
  ChannelSendResult,
  ChannelTemplate
} from './channels';
export type {
  ResourceChunkSearch,
  ResourceChunkMatch,
  ResourceReranker,
  ResourceSearchResult,
  ResourceSearchTimings
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

export const data = {
  databaseStub,
  callData,
  createDataUsageTally,
  dataLimitsFor,
  findArtifactDatabase,
  openArtifactDatabase,
  dataCaller,
  recordDataUsage,
  recordChange
};

export const channels = {
  ChannelSendError,
  CHANNEL_MESSAGE_SOURCE_KEY,
  WHATSAPP_WINDOW_MS,
  sendToParticipant,
  postToChat
};

export {
  create,
  schema,
  incrementArtifactUsage,
  searchResourceChunks,
  toResourceSearchResult
};
