import { create } from './db';
import * as schema from './schema';
import { incrementArtifactUsage } from './usage';
import { searchResourceChunks, toResourceSearchResult } from './search';
import {
  databaseStub,
  callData,
  callDataMetered,
  createDataUsageTally,
  dataLimitsFor,
  findArtifactDatabase,
  openArtifactDatabase,
  dataCaller,
  recordDataUsage,
  recordQueryStats,
  recordChange
} from './data';
import {
  knowledgeItemsByUri,
  resolveFileValues,
  flattenFileValues,
  missingFileUris,
  assertFileUrisExist,
  fileLinksFor,
  updateFileLinks,
  clearedLinks,
  createFileLinkCleanup
} from './dataFiles';
export type { FileLinkCleanup } from './dataFiles';
import {
  databasesWithStats,
  queryStatSums,
  statsCover,
  recentlyIndexed,
  saveIndexAdvice,
  listIndexAdvice,
  findIndexAdvice,
  dismissIndexAdvice,
  removeIndexAdvice,
  pruneQueryStats
} from './dataAdvice';
import {
  ChannelSendError,
  CHANNEL_MESSAGE_SOURCE_KEY,
  CHANNEL_MESSAGE_SOURCE_TRIGGER_TEST,
  WHATSAPP_WINDOW_MS,
  sendToParticipant,
  postToChat,
  listApprovedTemplates
} from './channels';
import {
  WHATSAPP_MANAGEMENT_SCOPE,
  WhatsappTemplateError,
  detectBusinessAccount,
  checkBusinessAccount,
  subscribeAppToAccount,
  syncWhatsappTemplates,
  applyWhatsappTemplateStatus,
  createWhatsappTemplate,
  editWhatsappTemplate,
  deleteWhatsappTemplate,
  channelsToResync,
  lastTemplatesRead
} from './whatsappTemplates';
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
export type { IndexAdviceRow } from './dataAdvice';
export type {
  ChannelMessageSource,
  ChannelSendResult,
  ChannelTemplate
} from './channels';
export type {
  WhatsappChannelCredentials,
  WhatsappTemplateErrorReason,
  WhatsappTemplateTransition
} from './whatsappTemplates';
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
  callDataMetered,
  createDataUsageTally,
  dataLimitsFor,
  findArtifactDatabase,
  openArtifactDatabase,
  dataCaller,
  recordDataUsage,
  recordQueryStats,
  recordChange,
  knowledgeItemsByUri,
  resolveFileValues,
  flattenFileValues,
  missingFileUris,
  assertFileUrisExist,
  fileLinksFor,
  updateFileLinks,
  clearedLinks,
  createFileLinkCleanup
};

export const dataAdvice = {
  databasesWithStats,
  queryStatSums,
  statsCover,
  recentlyIndexed,
  saveIndexAdvice,
  listIndexAdvice,
  findIndexAdvice,
  dismissIndexAdvice,
  removeIndexAdvice,
  pruneQueryStats
};

export const channels = {
  ChannelSendError,
  CHANNEL_MESSAGE_SOURCE_KEY,
  CHANNEL_MESSAGE_SOURCE_TRIGGER_TEST,
  WHATSAPP_WINDOW_MS,
  sendToParticipant,
  postToChat,
  listApprovedTemplates
};

export const whatsappTemplates = {
  WHATSAPP_MANAGEMENT_SCOPE,
  WhatsappTemplateError,
  detectBusinessAccount,
  checkBusinessAccount,
  subscribeAppToAccount,
  syncWhatsappTemplates,
  applyWhatsappTemplateStatus,
  createWhatsappTemplate,
  editWhatsappTemplate,
  deleteWhatsappTemplate,
  channelsToResync,
  lastTemplatesRead
};

export {
  create,
  schema,
  incrementArtifactUsage,
  searchResourceChunks,
  toResourceSearchResult
};
