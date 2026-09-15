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
  parseClient,
  resolveExternalSessionId,
  upsertSession,
  flushRequests,
  type PendingRequest
} from './recordUsage';

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
  parseClient,
  resolveExternalSessionId,
  upsertSession,
  flushRequests
};

export type {
  BootResource,
  PendingRequest,
  InterpolationMode,
  RemoteMcpAuthHeader,
  RemoteMcpHandle
};
