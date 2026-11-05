import {
  create,
  schema,
  incrementArtifactUsage,
  searchResourceChunks,
  toResourceSearchResult,
  plan,
  data,
  dataAdvice,
  channels,
  whatsappTemplates
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
  dataAdvice,
  channels,
  whatsappTemplates
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
  IndexAdviceRow,
  ChannelMessageSource,
  ChannelSendResult,
  ChannelTemplate,
  WhatsappChannelCredentials,
  WhatsappTemplateErrorReason,
  WhatsappTemplateTransition
} from './lib';
