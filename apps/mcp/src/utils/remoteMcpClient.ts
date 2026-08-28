import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { utils } from '@ganju/utils';

export interface RemoteMcpAuthHeader {
  name: string;
  value: string;
}

export interface ConnectRemoteMcpInput {
  url: string;
  transport: string;
  // A single header to inject on every transport request (e.g. Authorization).
  authHeader?: RemoteMcpAuthHeader | null;
  timeoutMs: number;
}

export interface RemoteMcpHandle {
  client: Client;
  close: () => Promise<void>;
}

// Connect to a remote (third-party) MCP server. Used both at configure-time
// (discovery: listTools) and per call (tools/call forwarding). The host is
// SSRF-screened against private/loopback ranges as defense-in-depth even though
// the URL comes from the curated catalog. The auth header is applied via the
// transport's `fetch` so the secret never lands in logs.
export const connectRemoteMcpClient = async (
  input: ConnectRemoteMcpInput
): Promise<RemoteMcpHandle> => {
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
    { name: 'ganju-mcp-proxy', version: '0.0.1' },
    { jsonSchemaValidator: new CfWorkerJsonSchemaValidator() }
  );

  // Bound the connect handshake so a hung remote can't stall the request.
  const timer = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error('Remote MCP server connection timed out.')),
      input.timeoutMs
    );
  });
  await Promise.race([client.connect(transport), timer]);

  return {
    client,
    close: async () => {
      try {
        await client.close();
      } catch {
        // best-effort; the request is ending anyway
      }
    }
  };
};
