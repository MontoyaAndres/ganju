import { utils } from '@ganju/utils';

// types
import type { Context } from 'hono';
import type { AppEnv } from '../types';

/**
 * The RFC 8707 `resource` indicator an MCP client sends with its token request.
 *
 * MCP clients read the canonical resource URI from a server's RFC 9728
 * metadata — `https://<mcp-host>/<slug>`, one per artifact — and echo it here.
 * `@better-auth/oauth-provider` rejects any resource that isn't in
 * `validAudiences` with `requested resource invalid`, and that list is a static
 * array of exact strings, so a per-artifact URL can never be enumerated ahead
 * of time. (better-auth's old oidc-provider ignored `resource` entirely, which
 * is why this only started mattering after the migration.)
 *
 * So the check happens here instead, on the one rule that actually matters: the
 * resource has to be an address of our own MCP service. Anything else — another
 * origin, a malformed URI — returns null and the plugin rejects it as before.
 * Callers pass the result to `createAuth` as an extra valid audience.
 *
 * Only `POST /auth/oauth2/token` carries `resource`; every other auth request
 * skips the body read.
 */
export const requestedMcpAudience = async (
  c: Context<AppEnv>
): Promise<string | null> => {
  if (c.req.method !== 'POST') return null;
  if (new URL(c.req.url).pathname !== '/auth/oauth2/token') return null;

  const mcpUrl = utils.getEnv(c, 'NEXT_PUBLIC_MCP_URL');
  if (!mcpUrl) return null;

  // Read from a clone — the untouched body still has to reach better-auth.
  const raw = await c.req.raw
    .clone()
    .text()
    .catch(() => '');
  if (!raw) return null;

  const contentType = c.req.header('content-type') ?? '';
  let resource: string | null = null;
  try {
    if (contentType.includes('application/json')) {
      const parsed = JSON.parse(raw) as { resource?: unknown };
      resource = typeof parsed.resource === 'string' ? parsed.resource : null;
    } else {
      resource = new URLSearchParams(raw).get('resource');
    }
  } catch {
    return null;
  }

  if (!resource) return null;

  try {
    if (new URL(resource).origin !== new URL(mcpUrl).origin) return null;
  } catch {
    return null;
  }

  return resource;
};
