import { Schema } from './schema';
import { getEnv } from './getEnv';
import type { EnvSource } from './getEnv';
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
  timingSafeEqual
} from './crypto';
import {
  bytesToBase64,
  base64ToBytes,
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
import type {
  MimeAttachment,
  MimeMessageInput
} from './mimeMessage';
import type {
  GmailOperation,
  GmailSendRequest,
  GmailSendResponse
} from './gmailSend';
import type {
  TelegramSendRequest,
  TelegramSendResponse
} from './telegramSend';
import type {
  OutlookOperation,
  OutlookSendRequest,
  OutlookSendResponse
} from './outlookSend';
import { parseHttpErrorMessage } from './parseHttpError';
import { isApiError, getApiErrorMessage } from './apiError';
import { toStringArray } from './coerce';
import { validateMessageVariables } from './validateMessageVariables';
import { JsonSchema, jsonSchemaToZodShape } from './jsonSchemaToZodShape';
import { formatRelative } from './formatRelative';
import { slugifyPromptTitle } from './slugifyPromptTitle';
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
import type {
  ChannelNotifier,
  ToolStatusEvent
} from './channelNotifier';
import {
  isResourceSourceEnabled,
  safeHostname,
  buildResourceDownloadUrl,
  formatSourcesAsMarkdown,
  formatSourcesAsButtons
} from './sources';
import type {
  Source,
  ResourceUrlContext,
  SourceButton
} from './sources';
import {
  refreshOAuthToken,
  OAuthReauthRequiredError,
  buildReauthMetadata,
  clearReauthMetadata,
  isCredentialNeedingReauth
} from './oauth';
import type {
  RefreshOAuthTokenInput,
  RefreshedOAuthToken
} from './oauth';

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
  timingSafeEqual,
  bytesToBase64,
  base64ToBytes,
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
  validateMessageVariables,
  formatRelative,
  slugifyPromptTitle,
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
  isCredentialNeedingReauth
};

export type {
  JsonSchema,
  MimeAttachment,
  MimeMessageInput,
  GmailOperation,
  GmailSendRequest,
  GmailSendResponse,
  OutlookOperation,
  OutlookSendRequest,
  OutlookSendResponse,
  TelegramSendRequest,
  TelegramSendResponse,
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
  RefreshedOAuthToken
};
