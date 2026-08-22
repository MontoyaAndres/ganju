import { and, eq } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

export interface ProxiedPrompt {
  // The MCP prompt name registered on the server (`<prefix>__<remoteName>`) —
  // what the runner passes to getPrompt. NOT an artifact_prompt id.
  mcpName: string;
  title: string;
  description: string | null;
  // Discovered argument names, in order — the first maps a slash command's
  // trailing text (same convention as artifact prompts).
  argumentNames: string[];
}

// Enumerate the proxied (mcp-proxy) prompts a channel agent can invoke: the
// enabled subset (config.allowedPrompts, opt-in) of each install's discovered
// prompts, named exactly as the MCP boot loop registers them. Lets Telegram
// expose them as slash commands and resolve them at invoke time.
export const loadProxiedPrompts = async (
  dbInstance: ReturnType<typeof db.create>,
  artifactId: string
): Promise<ProxiedPrompt[]> => {
  const rows = await dbInstance
    .select({
      config: db.schema.artifactTool.config,
      metadata: db.schema.artifactTool.metadata
    })
    .from(db.schema.artifactTool)
    .where(
      and(
        eq(db.schema.artifactTool.artifactId, artifactId),
        eq(
          db.schema.artifactTool.toolKey,
          utils.constants.TOOL_DEFINITION_KEY_MCP_PROXY
        ),
        eq(db.schema.artifactTool.enabled, true)
      )
    );

  const out: ProxiedPrompt[] = [];
  for (const row of rows) {
    const config = (row.config || {}) as {
      prefix?: string;
      allowedPrompts?: string[];
    };
    const prefix = typeof config.prefix === 'string' ? config.prefix : 'mcp';
    // Prompts are opt-in (absent/empty = none enabled), matching the boot loop.
    const allowed =
      Array.isArray(config.allowedPrompts) && config.allowedPrompts.length > 0
        ? new Set(config.allowedPrompts)
        : null;
    if (!allowed) continue;

    const discovery = (row.metadata || {}) as {
      discovery?: {
        prompts?: Array<{
          name: string;
          title?: string;
          description?: string;
          arguments?: Array<{ name: string }>;
        }>;
      };
    };
    for (const p of discovery.discovery?.prompts || []) {
      if (!allowed.has(p.name)) continue;
      const mcpName = utils.buildProxyToolName(prefix, p.name);
      if (!mcpName) continue;
      out.push({
        mcpName,
        title: p.title || p.name,
        description: p.description || null,
        argumentNames: Array.isArray(p.arguments)
          ? p.arguments.map(a => a.name)
          : []
      });
    }
  }
  return out;
};

// The full set of prompts exposed as bot slash commands for an artifact:
// artifact prompts plus proxied (mcp-proxy) prompts, in the `{ title,
// description }` shape the command-registration helpers expect. Shared by every
// platform that publishes a command menu (Telegram, Discord) and by the
// post-edit command resync, so the menu is built one way everywhere.
export const loadCommandPrompts = async (
  dbInstance: ReturnType<typeof db.create>,
  artifactId: string
): Promise<Array<{ title: string; description: string | null }>> => {
  const prompts = await dbInstance
    .select({
      title: db.schema.artifactPrompt.title,
      description: db.schema.artifactPrompt.description
    })
    .from(db.schema.artifactPrompt)
    .where(eq(db.schema.artifactPrompt.artifactId, artifactId));

  const proxiedPrompts = await loadProxiedPrompts(dbInstance, artifactId);

  return [
    ...prompts,
    ...proxiedPrompts.map(p => ({ title: p.title, description: p.description }))
  ];
};
