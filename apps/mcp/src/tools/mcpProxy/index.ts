import { McpProxyToolConfig, McpProxyDiscovery, utils } from '@ganju/utils';

import {
  connectRemoteMcpClient,
  type RemoteMcpAuthHeader
} from '../../utils/remoteMcpClient';
import { ToolDefinition } from '../types';

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  _meta?: Record<string, unknown>;
};

const text = (value: string): ToolResult => ({
  content: [{ type: 'text', text: value }]
});

// The resolved (decrypted) credential the controller hands to the dispatcher.
export interface ResolvedProxyCredential {
  secret: string;
  needsReauth: boolean;
}

/**
 * Validate one `artifact_tool.config` of definition `mcp-proxy`. Returns null
 * (so the boot loop skips the row) when required fields are missing/malformed.
 * All validation lives in the shared zod schema; this adapts safeParse to a
 * nullable result.
 */
export const parseMcpProxyConfig = (
  raw: unknown
): McpProxyToolConfig | null => {
  const result = utils.Schema.MCP_PROXY_CONFIG.safeParse(raw);
  return result.success ? result.data : null;
};

/**
 * Read the discovery payload stored on `artifact_tool.metadata.discovery` at
 * configure-time. Returns null when the tool hasn't been discovered yet (so the
 * boot loop registers nothing for it).
 */
export const parseMcpProxyDiscovery = (
  metadata: unknown
): McpProxyDiscovery | null => {
  if (!metadata || typeof metadata !== 'object') return null;
  const discovery = (metadata as { discovery?: unknown }).discovery;
  if (!discovery || typeof discovery !== 'object') return null;
  const tools = (discovery as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) return null;
  return discovery as McpProxyDiscovery;
};

/**
 * Build the single auth header to inject on the remote connection from the
 * config's auth kind and the resolved secret. `none` → no header.
 */
export const buildProxyAuthHeader = (
  config: McpProxyToolConfig,
  credential: ResolvedProxyCredential | null
): RemoteMcpAuthHeader | null => {
  if (config.auth.kind === utils.constants.MCP_PROXY_AUTH_KIND_NONE) {
    return null;
  }
  const secret = credential?.secret ?? '';
  switch (config.auth.kind) {
    case utils.constants.MCP_PROXY_AUTH_KIND_BEARER:
    case utils.constants.MCP_PROXY_AUTH_KIND_OAUTH:
      return { name: 'Authorization', value: `Bearer ${secret}` };
    case utils.constants.MCP_PROXY_AUTH_KIND_HEADER:
      return { name: config.auth.name, value: secret };
    default:
      return null;
  }
};

type RemoteToolResult = {
  content?: unknown;
  structuredContent?: unknown;
  isError?: boolean;
};

// Flatten an MCP tool-call result's content array to a single string. Text
// parts pass through; non-text parts (image/audio/resource) are JSON-stringified
// so the model still sees something actionable. Returned in full — never
// truncated — so nothing is silently dropped from the forwarded result.
const flattenContent = (content: unknown): string => {
  if (!Array.isArray(content)) {
    return typeof content === 'string'
      ? content
      : JSON.stringify(content ?? null);
  }
  const parts = content.map(item => {
    if (item && typeof item === 'object' && 'text' in item) {
      const t = (item as { text?: unknown }).text;
      if (typeof t === 'string') return t;
    }
    return JSON.stringify(item);
  });
  return parts.join('\n');
};

// Forward the remote result with as little loss as possible: preserve the
// content blocks verbatim (text/image/resource) AND structuredContent when the
// whole payload fits in one response; for a larger payload, flatten the blocks
// to a single (untruncated) text block, since the SDK can't stream multiple
// large typed blocks back in one tool result. Either way nothing is dropped.
// Whatever the remote answers was written by someone else — the remote
// server, or whoever wrote the issue, page or row it read. Every text block is
// labelled as such, and the result flagged, so a sensitive call made after it
// asks first. Images and other blocks pass through as they are.
//
// A structured copy can't carry the label, and some clients hand the model
// that copy instead of the text. Proxied tools register no output schema, so
// the copy is optional here: it is folded into the labelled text (as JSON,
// unless a text block already says exactly that) and dropped.
const labelRemoteResult = (shaped: ToolResult, source: string): ToolResult => {
  const { structuredContent, ...rest } = shaped as ToolResult & {
    structuredContent?: unknown;
  };
  const blocks = [...rest.content];
  if (structuredContent !== undefined) {
    const json = utils.stableJson(structuredContent);
    const alreadyThere = blocks.some(block => {
      if (block.type !== 'text' || typeof block.text !== 'string') return false;
      try {
        return utils.stableJson(JSON.parse(block.text)) === json;
      } catch {
        return false;
      }
    });
    if (!alreadyThere) {
      blocks.push({ type: 'text', text: JSON.stringify(structuredContent) });
    }
  }
  return {
    ...rest,
    content: blocks.map(block =>
      block.type === 'text' && typeof block.text === 'string'
        ? { ...block, text: utils.wrapUntrustedContent(source, block.text) }
        : block
    ),
    _meta: { [utils.UNTRUSTED_CONTENT_META_KEY]: true }
  };
};

const shapeRemoteResult = (result: RemoteToolResult): ToolResult => {
  const content = Array.isArray(result.content) ? result.content : [];
  const serialized = JSON.stringify({
    content,
    structuredContent: result.structuredContent
  });
  const withinBudget =
    new TextEncoder().encode(serialized).byteLength <=
    utils.constants.MCP_PROXY_MAX_RESPONSE_BYTES;

  if (withinBudget) {
    const shaped = {
      content: (content.length
        ? content
        : [
            { type: 'text', text: '(the tool returned no content)' }
          ]) as ToolResult['content'],
      ...(result.structuredContent !== undefined
        ? { structuredContent: result.structuredContent }
        : {}),
      ...(result.isError ? { isError: true } : {})
    };
    return shaped as ToolResult;
  }

  return {
    content: [{ type: 'text', text: flattenContent(content) }],
    ...(result.isError ? { isError: true } : {})
  } as ToolResult;
};

/**
 * Forward one tool call to the remote MCP server. Opens a fresh connection
 * (the MCP worker is stateless per request), calls the remote tool, and returns
 * its content flattened to text. Failures are returned as `Error: …` text
 * (not thrown) per the tool convention. The secret is applied via the transport
 * and never logged.
 */
export const executeMcpProxyCall = async (
  config: McpProxyToolConfig,
  remoteToolName: string,
  args: Record<string, unknown>,
  credential: ResolvedProxyCredential | null
): Promise<ToolResult> => {
  if (config.auth.kind !== utils.constants.MCP_PROXY_AUTH_KIND_NONE) {
    if (!credential) {
      return text(
        `Error: "${remoteToolName}" is not connected. Add its credential on the Tools page.`
      );
    }
    if (credential.needsReauth) {
      return text(
        `Error: the credential for "${remoteToolName}" needs to be re-authorized. Open the Tools page and re-link it.`
      );
    }
  }

  let handle;
  try {
    handle = await connectRemoteMcpClient({
      url: config.url,
      transport: config.transport,
      authHeader: buildProxyAuthHeader(config, credential),
      timeoutMs: config.timeoutMs
    });
  } catch (error) {
    return text(
      `Error: could not reach the remote MCP server — ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  try {
    const result = (await handle.client.callTool({
      name: remoteToolName,
      arguments: args
    })) as RemoteToolResult;
    return labelRemoteResult(
      shapeRemoteResult(result),
      `${config.prefix || 'mcp'}/${remoteToolName}`
    );
  } catch (error) {
    return text(
      `Error: remote tool call failed — ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  } finally {
    await handle.close();
  }
};

// Resources and prompts use the protocol's own error path (a failed read/get
// throws) rather than the tool text-error convention, matching the native
// resource/prompt handlers. This guard throws a clear message when the install
// needs a credential it doesn't have.
const assertConnectable = (
  config: McpProxyToolConfig,
  credential: ResolvedProxyCredential | null,
  label: string
): void => {
  if (config.auth.kind === utils.constants.MCP_PROXY_AUTH_KIND_NONE) return;
  if (!credential) {
    throw new Error(
      `"${label}" is not connected. Add its credential on the Tools page.`
    );
  }
  if (credential.needsReauth) {
    throw new Error(
      `the credential for "${label}" needs to be re-authorized. Open the Tools page and re-link it.`
    );
  }
};

const openRemote = async (
  config: McpProxyToolConfig,
  credential: ResolvedProxyCredential | null
) => {
  try {
    return await connectRemoteMcpClient({
      url: config.url,
      transport: config.transport,
      authHeader: buildProxyAuthHeader(config, credential),
      timeoutMs: config.timeoutMs
    });
  } catch (error) {
    throw new Error(
      `could not reach the remote MCP server — ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

// A resource content block normalized to a concrete text- or blob-bearing shape
// (so it satisfies the SDK's ReadResourceResult union without casts).
type NormalizedResourceContent =
  | { uri: string; mimeType?: string; text: string }
  | { uri: string; mimeType?: string; blob: string };

const normalizeResourceContent = (
  raw: unknown,
  fallbackUri: string
): NormalizedResourceContent => {
  const obj =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const uri = typeof obj.uri === 'string' ? obj.uri : fallbackUri;
  const mimeType = typeof obj.mimeType === 'string' ? obj.mimeType : undefined;
  if (typeof obj.blob === 'string') return { uri, mimeType, blob: obj.blob };
  return {
    uri,
    mimeType,
    text: typeof obj.text === 'string' ? obj.text : JSON.stringify(raw)
  };
};

/**
 * Forward one resources/read to the remote MCP server. Opens a fresh connection
 * (the worker is stateless per request), reads the resource, and returns its
 * contents normalized but NOT size-capped: a resource is often delivered to the
 * user verbatim (e.g. sent as a file), where truncating would corrupt it —
 * collapsing a binary blob to text destroyed it outright. Capping is a
 * model-context concern, so it's applied by the caller that feeds a read into
 * the model, not here (the remote response is already buffered by the SDK
 * before this runs, so capping here wouldn't save memory anyway). Throws on
 * failure so it flows through the MCP resource error path like a native read.
 */
export const executeMcpProxyResourceRead = async (
  config: McpProxyToolConfig,
  uri: string,
  credential: ResolvedProxyCredential | null
): Promise<{ contents: NormalizedResourceContent[] }> => {
  assertConnectable(config, credential, uri);
  const handle = await openRemote(config, credential);
  try {
    const result = (await handle.client.readResource({ uri })) as {
      contents?: unknown;
    };
    const raw = Array.isArray(result.contents) ? result.contents : [];
    return { contents: raw.map(c => normalizeResourceContent(c, uri)) };
  } catch (error) {
    throw new Error(
      `remote resource read failed — ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  } finally {
    await handle.close();
  }
};

// A prompt message normalized to a single text block — proxied prompts surface
// as text (non-text content blocks are flattened) so the result satisfies the
// SDK's GetPromptResult without forwarding arbitrary block shapes.
type NormalizedPromptMessage = {
  role: 'user' | 'assistant';
  content: { type: 'text'; text: string };
};

const normalizePromptMessage = (raw: unknown): NormalizedPromptMessage => {
  const obj =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const role = obj.role === 'assistant' ? 'assistant' : 'user';
  const content = obj.content;
  let text: string;
  if (
    content &&
    typeof content === 'object' &&
    typeof (content as { text?: unknown }).text === 'string'
  ) {
    text = (content as { text: string }).text;
  } else if (typeof content === 'string') {
    text = content;
  } else {
    text = JSON.stringify(content ?? '');
  }
  return { role, content: { type: 'text', text } };
};

/**
 * Forward one prompts/get to the remote MCP server. MCP prompt arguments are
 * strings, so args are coerced before sending. Throws on failure (the prompt
 * error path), matching the native prompt handler.
 */
export const executeMcpProxyPromptGet = async (
  config: McpProxyToolConfig,
  remotePromptName: string,
  args: Record<string, unknown>,
  credential: ResolvedProxyCredential | null
): Promise<{ description?: string; messages: NormalizedPromptMessage[] }> => {
  assertConnectable(config, credential, remotePromptName);
  const stringArgs: Record<string, string> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value !== undefined && value !== null) stringArgs[key] = String(value);
  }
  const handle = await openRemote(config, credential);
  try {
    const result = (await handle.client.getPrompt({
      name: remotePromptName,
      arguments: stringArgs
    })) as { description?: unknown; messages?: unknown };
    const messages = Array.isArray(result.messages)
      ? result.messages.map(normalizePromptMessage)
      : [];
    return {
      ...(typeof result.description === 'string'
        ? { description: result.description }
        : {}),
      messages
    };
  } catch (error) {
    throw new Error(
      `remote prompt get failed — ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  } finally {
    await handle.close();
  }
};

// `mcp-proxy` is never dispatched through the registry: the MCP controller
// registers one derived tool per discovered remote tool at boot and handles the
// call there. This entry exists so toolRegistry.get('mcp-proxy') resolves (the
// boot loop expects every definition key to be present), but a direct call is a
// misconfiguration.
export const mcpProxy: ToolDefinition = {
  title: 'MCP Proxy',
  description:
    'Internal: parent definition for proxied remote MCP servers. Each discovered remote tool registers as its own named tool.',
  schema: { type: 'object', properties: {} },
  handler: async () =>
    text(
      'Error: mcp-proxy is a parent definition and is not directly callable.'
    )
};
