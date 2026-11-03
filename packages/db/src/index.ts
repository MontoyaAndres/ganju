import {
  create,
  schema,
  incrementArtifactUsage,
  searchResourceChunks,
  toResourceSearchResult,
  plan,
  data,
  channels
} from './lib';
import { handleError } from './utils';

export const db = {
  create,
  schema,
  incrementArtifactUsage,
  searchResourceChunks,
  toResourceSearchResult,
  plan,
  data,
  channels
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
  ResourceSearchTimings,
  DataNamespaceLike,
  DataUsageTally,
  ArtifactDatabaseRow,
  OpenedDatabase,
  ChannelMessageSource,
  ChannelSendResult,
  ChannelTemplate
} from './lib';
