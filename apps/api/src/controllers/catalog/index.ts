import { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

// types
import { AppEnv } from '../../types';

/**
 * The tools this platform ships, grouped as the dashboard renders them.
 *
 * Served from code rather than queried: a catalog entry only means anything in
 * combination with a handler in apps/mcp, so the two ship together and the pair
 * is checked at build time. This route stays because the dashboard still wants
 * one place to ask, and because the shape it returns is the contract.
 */
const listGroups = async (c: Context<AppEnv>) => c.json(utils.TOOL_CATALOG);

/**
 * Curated remote MCP servers, which are a different thing from the catalog
 * above and stay in the database for that reason: nothing in our code implements
 * their tools. A row here is a pointer to someone else's server, whose tools,
 * resources and prompts are discovered when the user connects it.
 */
const listMcpServers = async (c: Context<AppEnv>) => {
  const dbInstance = db.create(c);

  const servers = await dbInstance
    .select({
      id: db.schema.mcpServerCatalog.id,
      slug: db.schema.mcpServerCatalog.slug,
      name: db.schema.mcpServerCatalog.name,
      description: db.schema.mcpServerCatalog.description,
      icon: db.schema.mcpServerCatalog.icon,
      transport: db.schema.mcpServerCatalog.transport,
      authKind: db.schema.mcpServerCatalog.authKind,
      defaultScopes: db.schema.mcpServerCatalog.defaultScopes
    })
    .from(db.schema.mcpServerCatalog)
    .where(eq(db.schema.mcpServerCatalog.verified, true));

  return c.json(servers);
};

export const CatalogController = {
  listGroups,
  listMcpServers
};
