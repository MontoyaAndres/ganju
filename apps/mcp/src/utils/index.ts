import {
  readResourceContent,
  withResourceContent,
  BOOT_RESOURCE_COLUMNS,
  type BootResource
} from './readResourceContent';
import { refreshCredentialIfNeeded } from './refreshCredential';
import { generateEmbedding } from './embedding';
import { resolveArtifactSlug } from './resolveArtifactSlug';
import { interpolate, type InterpolationMode } from './interpolate';
import { allowProxyToolCall } from './rateLimit';
import {
  connectRemoteMcpClient,
  type RemoteMcpAuthHeader,
  type RemoteMcpHandle
} from './remoteMcpClient';
import {
  parseJsonRpcMessages,
  collectBodyOnlyRequests,
  collectRejectedToolCalls,
  toolResultError,
  parseClient,
  resolveExternalSessionId,
  upsertSession,
  flushRequests,
  readUntrustedContent,
  readsEarlierInBatch,
  type PendingRequest
} from './recordUsage';
import { confirmSensitiveTools } from './toolConfirmation';
import {
  untrustedResult,
  labelOwnResult,
  type UntrustedToolResult
} from './untrusted';

export {
  readResourceContent,
  withResourceContent,
  BOOT_RESOURCE_COLUMNS,
  refreshCredentialIfNeeded,
  generateEmbedding,
  resolveArtifactSlug,
  interpolate,
  allowProxyToolCall,
  connectRemoteMcpClient,
  parseJsonRpcMessages,
  collectBodyOnlyRequests,
  collectRejectedToolCalls,
  toolResultError,
  parseClient,
  resolveExternalSessionId,
  upsertSession,
  flushRequests,
  readUntrustedContent,
  readsEarlierInBatch,
  confirmSensitiveTools,
  untrustedResult,
  labelOwnResult
};

export type {
  BootResource,
  PendingRequest,
  InterpolationMode,
  RemoteMcpAuthHeader,
  RemoteMcpHandle,
  UntrustedToolResult
};
