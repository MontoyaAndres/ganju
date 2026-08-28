import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { utils } from '@ganju/utils';
import type {
  McpProxyDiscoveredTool,
  McpProxyDiscoveredResource,
  McpProxyDiscoveredPrompt
} from '@ganju/utils';

export interface DiscoverRemoteMcpInput {
  url: string;
  transport: string;
  // A single header to inject on every transport request (e.g. Authorization).
  authHeader?: { name: string; value: string } | null;
  timeoutMs: number;
  // Cap on how many items of each kind are returned, regardless of how many the
  // remote lists.
  maxItems: number;
}

// The FULL set the remote exposes (not filtered by the install's allow-lists —
// the UI needs the complete list to render enable/disable toggles).
export interface DiscoverRemoteMcpResult {
  serverInfo?: { name?: string; version?: string };
  tools: McpProxyDiscoveredTool[];
  resources: McpProxyDiscoveredResource[];
  prompts: McpProxyDiscoveredPrompt[];
}

/**
 * Connect to a remote MCP server once (at configure-time) and list its tools.
 * The result is persisted on artifact_tool.metadata.discovery so the stateless
 * MCP boot loop can register tools without a remote round-trip. SSRF-screens the
 * host; the auth header is applied via the transport's fetch and never logged.
 */
export const discoverRemoteMcpTools = async (
  input: DiscoverRemoteMcpInput
): Promise<DiscoverRemoteMcpResult> => {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    throw new Error('Remote MCP server URL is invalid.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Remote MCP server URL must be http or https.');
  }
  if (utils.isBlockedHost(parsed.hostname)) {
    throw new Error(
      `Remote MCP host "${parsed.hostname}" is not allowed (private or loopback address).`
    );
  }

  const fetchWithAuth: typeof fetch = (url, init) => {
    const headers = new Headers(init?.headers);
    if (input.authHeader) {
      headers.set(input.authHeader.name, input.authHeader.value);
    }
    return fetch(url, { ...(init ?? {}), headers });
  };

  const transport =
    input.transport === utils.constants.MCP_PROXY_TRANSPORT_SSE
      ? new SSEClientTransport(parsed, {
          eventSourceInit: { fetch: fetchWithAuth },
          requestInit: input.authHeader
            ? { headers: { [input.authHeader.name]: input.authHeader.value } }
            : undefined
        })
      : new StreamableHTTPClientTransport(parsed, { fetch: fetchWithAuth });

  const client = new Client(
    { name: 'ganju-mcp-proxy-discovery', version: '0.0.1' },
    { jsonSchemaValidator: new CfWorkerJsonSchemaValidator() }
  );

  const timer = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error('Remote MCP server connection timed out.')),
      input.timeoutMs
    );
  });

  try {
    await Promise.race([client.connect(transport), timer]);

    const capabilities = client.getServerCapabilities();

    const listed = (await Promise.race([client.listTools(), timer])) as {
      tools?: Array<{
        name: string;
        title?: string;
        description?: string;
        inputSchema?: unknown;
      }>;
    };

    const tools: McpProxyDiscoveredTool[] = (listed.tools ?? [])
      .slice(0, input.maxItems)
      .map(t => ({
        name: t.name,
        title: t.title,
        description: t.description,
        inputSchema: t.inputSchema ?? { type: 'object', properties: {} }
      }));

    // Resources / prompts are optional server capabilities; only list them when
    // the remote advertises them, and tolerate a remote that errors anyway.
    let resources: McpProxyDiscoveredResource[] = [];
    if (capabilities?.resources) {
      try {
        const listedResources = (await Promise.race([
          client.listResources(),
          timer
        ])) as {
          resources?: Array<{
            uri: string;
            name?: string;
            title?: string;
            description?: string;
            mimeType?: string;
          }>;
        };
        resources = (listedResources.resources ?? [])
          .slice(0, input.maxItems)
          .map(r => ({
            uri: r.uri,
            name: r.name,
            title: r.title,
            description: r.description,
            mimeType: r.mimeType
          }));
      } catch {
        resources = [];
      }
    }

    let prompts: McpProxyDiscoveredPrompt[] = [];
    if (capabilities?.prompts) {
      try {
        const listedPrompts = (await Promise.race([
          client.listPrompts(),
          timer
        ])) as {
          prompts?: Array<{
            name: string;
            title?: string;
            description?: string;
            arguments?: Array<{
              name: string;
              description?: string;
              required?: boolean;
            }>;
          }>;
        };
        prompts = (listedPrompts.prompts ?? [])
          .slice(0, input.maxItems)
          .map(p => ({
            name: p.name,
            title: p.title,
            description: p.description,
            arguments: Array.isArray(p.arguments)
              ? p.arguments.map(a => ({
                  name: a.name,
                  description: a.description,
                  required: a.required
                }))
              : undefined
          }));
      } catch {
        prompts = [];
      }
    }

    const serverVersion = client.getServerVersion();

    return {
      serverInfo: serverVersion
        ? { name: serverVersion.name, version: serverVersion.version }
        : undefined,
      tools,
      resources,
      prompts
    };
  } finally {
    try {
      await client.close();
    } catch {
      // best-effort
    }
  }
};
