import { Context } from 'hono';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { utils } from '@ganju/utils';

import type { AppEnv } from '../types';

export interface McpClientChannelContext {
  channelId: string;
  platform: string;
}

export const createMcpClient = async (
  c: Context<AppEnv>,
  slug: string,
  bearerToken?: string,
  channelContext?: McpClientChannelContext
) => {
  const mcpBaseUrl = process.env.NEXT_PUBLIC_MCP_URL;
  if (!mcpBaseUrl) {
    throw new Error('Missing env: NEXT_PUBLIC_MCP_URL');
  }

  const base = new URL(mcpBaseUrl);
  base.pathname = `/${slug}`;

  const mcpBinding = c.env.MCP;
  const internalSecret = c.env.MCP_INTERNAL_SECRET;

  const transport = new StreamableHTTPClientTransport(base, {
    fetch: (url, init) => {
      const headers = new Headers(init?.headers);
      // A bearer token (bot-on-behalf-of, per linked user) takes precedence;
      // otherwise fall back to the channel's internal-secret access.
      if (bearerToken) {
        headers.set('authorization', `Bearer ${bearerToken}`);
      } else if (internalSecret) {
        headers.set(utils.constants.MCP_INTERNAL_HEADER, internalSecret);
      }
      // Tag channel-relayed self-fetches so the MCP worker can populate
      // mcp_session.{userAgent,clientName,metadata.via} — otherwise a service
      // binding call has no UA and the row looks like an anonymous machine
      // request.
      if (channelContext) {
        headers.set(
          'user-agent',
          utils.constants.MCP_CHANNEL_CLIENT_USER_AGENT
        );
        headers.set(
          utils.constants.MCP_CHANNEL_ID_HEADER,
          channelContext.channelId
        );
        headers.set(
          utils.constants.MCP_CHANNEL_PLATFORM_HEADER,
          channelContext.platform
        );
      }
      const forwarded = { ...(init ?? {}), headers };
      return mcpBinding.fetch(
        url.toString(),
        forwarded as never
      ) as unknown as Promise<Response>;
    }
  });
  const client = new Client(
    { name: 'ganju-channel', version: '0.0.1' },
    { jsonSchemaValidator: new CfWorkerJsonSchemaValidator() }
  );
  await client.connect(transport);

  return {
    client,
    close: async () => {
      await client.close();
    }
  };
};

export type McpClientHandle = Awaited<ReturnType<typeof createMcpClient>>;
