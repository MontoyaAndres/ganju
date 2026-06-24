import { Schema } from './schema';
import type {
  HttpEndpointToolConfig,
  McpProxyToolConfig,
  McpProxyDiscoveredTool,
  McpProxyDiscoveredResource,
  McpProxyDiscoveredPrompt,
  McpProxyDiscovery
} from './schema';
import { getEnv } from './getEnv';
import type { EnvSource } from './getEnv';
import type { CalendarConfigField } from './constants';
import { fetcher } from './fetcher';
import { constants } from './constants';
import {
  generateRandomSlug,
  generateRandomToken,
  isReservedSlug,
  isValidSlugFormat
} from './slug';
import {
  encryptString,
  decryptString,
  getCredentialEncryptionKey,
  sha256Hex,
  hmacSha256Hex,
  timingSafeEqual
} from './crypto';
import {
  bytesToBase64,
  base64ToBytes,
  hexToBytes,
  utf8ToBase64,
  base64ToUtf8,
  toBase64Url,
  fromBase64Url,
  utf8ToBase64Url,
  base64UrlToUtf8
} from './base64';
import {
  sanitizeMailHeader,
  encodeRfc2047,
  formatMailHeader
} from './mailHeaders';
import {
  buildMimeMessage,
  sanitizeFilename,
  formatFilenameHeader,
  chunkBase64
} from './mimeMessage';
import type { MimeAttachment, MimeMessageInput } from './mimeMessage';
import type {
  GmailOperation,
  GmailSendRequest,
  GmailSendResponse
} from './gmailSend';
import type {
  TelegramSendRequest,
  TelegramSendResponse,
  TelegramSendRemoteResourceRequest
} from './telegramSend';
import type {
  OutlookOperation,
  OutlookSendRequest,
  OutlookSendResponse
} from './outlookSend';
import type {
  SlackOperation,
  SlackSendRequest,
  SlackSendResponse,
  SlackSendRemoteResourceRequest
} from './slackSend';
import type {
  DiscordSendRequest,
  DiscordSendResponse,
  DiscordSendRemoteResourceRequest
} from './discordSend';
import type {
  WhatsappSendRequest,
  WhatsappSendResponse,
  WhatsappSendRemoteResourceRequest
} from './whatsappSend';
import { parseHttpErrorMessage } from './parseHttpError';
import { isApiError, getApiErrorMessage } from './apiError';
import { toStringArray } from './coerce';
import { validateMessageVariables } from './validateMessageVariables';
import { JsonSchema, jsonSchemaToZodShape } from './jsonSchemaToZodShape';
import { buildProxyToolName } from './mcpProxy';
import { ipv4InPrivateRange, isBlockedHost } from './ssrf';
import { formatRelative } from './formatRelative';
import { formatRelativeTime } from './formatRelativeTime';
import { slugifyTitle } from './slugifyTitle';
import { tallyUsageKinds } from './tallyUsageKinds';
import { formatFilename } from './formatFilename';
import {
  decodeEntities,
  escapeHtml,
  parseOpenXmlProps,
  stripBase64Images,
  sanitizeMetadataString,
  serializeMetadataValue
} from './sanitize';
import {
  chunkText,
  splitRecursive,
  buildHeader,
  prepareChunks
} from './chunking';
import type { Separator, ChunkMetadata, PreparedChunk } from './chunking';
import { isEmbeddableMimeType } from './embeddable';
import { sleep, isRateLimitError, withRateLimitRetry } from './retry';
import type { RateLimitRetryOptions } from './retry';
import { processQueueBatch } from './processQueueBatch';
import type {
  QueueBatchLike,
  QueueMessageLike,
  ProcessQueueBatchHandlers
} from './processQueueBatch';
import type {
  ExtractedDocument,
  ExtractedDocumentMetadata,
  ExtractedDocumentSource
} from './extractedDocument';
import { getToolStatusMessage } from './channelNotifier';
import type { ChannelNotifier, ToolStatusEvent } from './channelNotifier';
import {
  isResourceSourceEnabled,
  safeHostname,
  buildResourceDownloadUrl,
  formatSourcesAsMarkdown,
  formatSourcesAsButtons
} from './sources';
import type { Source, ResourceUrlContext, SourceButton } from './sources';
import {
  refreshOAuthToken,
  OAuthReauthRequiredError,
  buildReauthMetadata,
  clearReauthMetadata,
  isCredentialNeedingReauth
} from './oauth';
import type { RefreshOAuthTokenInput, RefreshedOAuthToken } from './oauth';
import { PlanLimitError, isPlanLimitError } from './planLimitError';
import type { PlanLimitDetails } from './planLimitError';
import type { PlanLimits } from './constants';

export const utils = {
  Schema,
  getEnv,
  fetcher,
  constants,
  generateRandomSlug,
  generateRandomToken,
  isReservedSlug,
  isValidSlugFormat,
  encryptString,
  decryptString,
  getCredentialEncryptionKey,
  sha256Hex,
  hmacSha256Hex,
  timingSafeEqual,
  bytesToBase64,
  base64ToBytes,
  hexToBytes,
  utf8ToBase64,
  base64ToUtf8,
  toBase64Url,
  fromBase64Url,
  utf8ToBase64Url,
  base64UrlToUtf8,
  sanitizeMailHeader,
  encodeRfc2047,
  formatMailHeader,
  buildMimeMessage,
  sanitizeFilename,
  formatFilenameHeader,
  chunkBase64,
  parseHttpErrorMessage,
  isApiError,
  getApiErrorMessage,
  toStringArray,
  jsonSchemaToZodShape,
  buildProxyToolName,
  ipv4InPrivateRange,
  isBlockedHost,
  validateMessageVariables,
  formatRelative,
  formatRelativeTime,
  slugifyTitle,
  tallyUsageKinds,
  formatFilename,
  decodeEntities,
  escapeHtml,
  parseOpenXmlProps,
  stripBase64Images,
  sanitizeMetadataString,
  serializeMetadataValue,
  chunkText,
  splitRecursive,
  buildHeader,
  prepareChunks,
  isEmbeddableMimeType,
  sleep,
  isRateLimitError,
  withRateLimitRetry,
  processQueueBatch,
  getToolStatusMessage,
  isResourceSourceEnabled,
  safeHostname,
  buildResourceDownloadUrl,
  formatSourcesAsMarkdown,
  formatSourcesAsButtons,
  refreshOAuthToken,
  OAuthReauthRequiredError,
  buildReauthMetadata,
  clearReauthMetadata,
  isCredentialNeedingReauth,
  PlanLimitError,
  isPlanLimitError
};

export type {
  CalendarConfigField,
  JsonSchema,
  MimeAttachment,
  MimeMessageInput,
  GmailOperation,
  GmailSendRequest,
  GmailSendResponse,
  OutlookOperation,
  OutlookSendRequest,
  OutlookSendResponse,
  SlackOperation,
  SlackSendRequest,
  SlackSendResponse,
  SlackSendRemoteResourceRequest,
  TelegramSendRequest,
  TelegramSendResponse,
  TelegramSendRemoteResourceRequest,
  DiscordSendRequest,
  DiscordSendResponse,
  DiscordSendRemoteResourceRequest,
  WhatsappSendRequest,
  WhatsappSendResponse,
  WhatsappSendRemoteResourceRequest,
  EnvSource,
  Separator,
  ChunkMetadata,
  PreparedChunk,
  ExtractedDocument,
  ExtractedDocumentMetadata,
  ExtractedDocumentSource,
  RateLimitRetryOptions,
  QueueBatchLike,
  QueueMessageLike,
  ProcessQueueBatchHandlers,
  ChannelNotifier,
  ToolStatusEvent,
  Source,
  ResourceUrlContext,
  SourceButton,
  RefreshOAuthTokenInput,
  RefreshedOAuthToken,
  HttpEndpointToolConfig,
  McpProxyToolConfig,
  McpProxyDiscoveredTool,
  McpProxyDiscoveredResource,
  McpProxyDiscoveredPrompt,
  McpProxyDiscovery,
  PlanLimitDetails,
  PlanLimits
};
