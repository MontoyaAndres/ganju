import { createAuth } from './better-auth';
import { sendInvitationEmail, sendContactEmail } from './email';
import { oauthConsentHTML } from './oauth-consent-page';
import { requestedMcpAudience } from './oauthResource';
import { oauthState } from './oauthState';
import { providers } from './providers';
import { getLlmAdapter } from './llm';
import { transcribeVoiceNote, transcribeWith } from './llm/transcribe';
import { createMcpClient } from './mcpClient';
import {
  generateEmbedding,
  generateEmbeddings,
  reindexResourceChunks
} from './embedding';
import { markdownToTelegramHtml } from './telegramFormat';
import { markdownToSlackMrkdwn } from './slackFormat';
import { markdownToDiscord } from './discordFormat';
import { markdownToWhatsapp } from './whatsappFormat';
import {
  enqueueIndex,
  enqueueCrawlDiscover,
  enqueueGdriveDiscover,
  enqueueGdriveFile,
  enqueueOnedriveDiscover,
  enqueueOnedriveFile
} from './queue';
import {
  getDriveAccessToken,
  getDriveFile,
  listDriveFolderChildren,
  downloadDriveFile,
  driveUri,
  isFolderMime,
  buildDriveResourceMetadata
} from './googleDrive';
import {
  getOneDriveAccessToken,
  getOneDriveItem,
  listOneDriveFolderChildren,
  downloadOneDriveFile,
  oneDriveUri,
  parseOneDriveUri,
  isOneDriveFolder,
  oneDriveFileMimeType,
  buildOneDriveResourceMetadata
} from './oneDrive';
import { getCalendarAccessToken, listCalendars } from './googleCalendar';
import {
  getCalcomApiKey,
  listCalcomEventTypes,
  validateCalcomApiKey
} from './calcom';
import { validateTavilyApiKey } from './tavily';
import { discoverRemoteMcpTools } from './remoteMcpClient';
import { refreshArtifactCredential } from './refreshArtifactCredential';
import {
  deployCustomCodeScript,
  smokeTestCustomCodeScript,
  invokeCustomCodeScript,
  deleteCustomCodeScript,
  customCodeScriptExists,
  listCustomCodeScripts,
  hashBundle
} from './customCodeDeploy';
import {
  beginMcpProxyOauth,
  completeMcpProxyOauth,
  resolveMcpProxyOauthSecret,
  readStoredMcpOauth
} from './mcpProxyOauth';
import {
  registerTelegramBotCommands,
  syncTelegramCommandsForArtifact
} from './telegramCommands';
import {
  registerDiscordCommands,
  syncDiscordCommandsForArtifact
} from './discordCommands';
import { Plan } from './plan';
import { createPolar, verifyPolarWebhook } from './polar';
import { runOverageMetering } from './metering';
import { runRetentionPurge } from './retention';
import {
  runResourceSync,
  claimManualResourceSync,
  releaseManualResourceSync,
  enqueueResourceSync
} from './resourceSync';
import { runCustomCodeScriptSweep } from './customCodeSweep';
import {
  assertDataAllowed,
  createDatabase,
  markDatabasesDeleting,
  artifactIdsOf,
  notifyDatabasesDeleted,
  softDeleteDatabase,
  restoreDeletedDatabase,
  runDataPurge
} from './dataDatabase';
import { runErrorAlerts, runToolCallAlerts, recentErrors } from './alerting';
import {
  consentActorFromRequest,
  recordConsent,
  getConsentStatus,
  listConsents
} from './consent';

export {
  Plan,
  runRetentionPurge,
  runResourceSync,
  claimManualResourceSync,
  releaseManualResourceSync,
  enqueueResourceSync,
  runCustomCodeScriptSweep,
  assertDataAllowed,
  createDatabase,
  markDatabasesDeleting,
  artifactIdsOf,
  notifyDatabasesDeleted,
  softDeleteDatabase,
  restoreDeletedDatabase,
  runDataPurge,
  runErrorAlerts,
  runToolCallAlerts,
  recentErrors,
  consentActorFromRequest,
  recordConsent,
  getConsentStatus,
  listConsents,
  createPolar,
  verifyPolarWebhook,
  runOverageMetering,
  createAuth,
  sendInvitationEmail,
  sendContactEmail,
  oauthConsentHTML,
  requestedMcpAudience,
  oauthState,
  providers,
  getLlmAdapter,
  transcribeVoiceNote,
  transcribeWith,
  createMcpClient,
  generateEmbedding,
  generateEmbeddings,
  reindexResourceChunks,
  markdownToTelegramHtml,
  markdownToSlackMrkdwn,
  markdownToDiscord,
  markdownToWhatsapp,
  enqueueIndex,
  enqueueCrawlDiscover,
  enqueueGdriveDiscover,
  enqueueGdriveFile,
  enqueueOnedriveDiscover,
  enqueueOnedriveFile,
  getDriveAccessToken,
  getDriveFile,
  listDriveFolderChildren,
  downloadDriveFile,
  driveUri,
  isFolderMime,
  buildDriveResourceMetadata,
  getOneDriveAccessToken,
  getOneDriveItem,
  listOneDriveFolderChildren,
  downloadOneDriveFile,
  oneDriveUri,
  parseOneDriveUri,
  isOneDriveFolder,
  oneDriveFileMimeType,
  buildOneDriveResourceMetadata,
  getCalendarAccessToken,
  listCalendars,
  getCalcomApiKey,
  listCalcomEventTypes,
  validateCalcomApiKey,
  validateTavilyApiKey,
  discoverRemoteMcpTools,
  refreshArtifactCredential,
  deployCustomCodeScript,
  smokeTestCustomCodeScript,
  invokeCustomCodeScript,
  deleteCustomCodeScript,
  customCodeScriptExists,
  listCustomCodeScripts,
  hashBundle,
  beginMcpProxyOauth,
  completeMcpProxyOauth,
  resolveMcpProxyOauthSecret,
  readStoredMcpOauth,
  registerTelegramBotCommands,
  syncTelegramCommandsForArtifact,
  registerDiscordCommands,
  syncDiscordCommandsForArtifact
};

export type { McpClientHandle } from './mcpClient';
export type { Transcriber, Transcription } from './llm/transcribe';
export type { Auth } from './better-auth';
export type { ConsentActor, ConsentStatus } from './consent';
export type { RetentionResult } from './retention';
export type { CreateDatabaseInput, DataPurgeResult } from './dataDatabase';
export type { AlertResult } from './alerting';
export type { EmailSource } from './email';
export type { OAuthProviderConfig } from './providers';
export type {
  LlmAdapter,
  LlmAdapterInput,
  LlmCompletion,
  LlmMessage,
  LlmToolCall,
  LlmToolDefinition,
  LlmStopReason,
  LlmUsage
} from './llm';
