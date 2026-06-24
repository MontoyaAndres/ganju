import { createAuth } from './better-auth';
import { sendInvitationEmail, sendContactEmail } from './email';
import { oauthState } from './oauthState';
import { providers } from './providers';
import { getLlmAdapter } from './llm';
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
import { createStripe, stripeCryptoProvider } from './stripe';
import { runOverageMetering } from './metering';

export {
  Plan,
  createStripe,
  stripeCryptoProvider,
  runOverageMetering,
  createAuth,
  sendInvitationEmail,
  sendContactEmail,
  oauthState,
  providers,
  getLlmAdapter,
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
export type { Auth } from './better-auth';
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
