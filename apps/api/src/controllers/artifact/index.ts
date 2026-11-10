import { Context } from 'hono';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import type { McpProxyDiscoveredTool } from '@ganju/utils';
import { db } from '@ganju/db';

import { buildArtifactConnections } from './connections';
import * as customCodeActions from './customCodeActions';
import * as projectActions from './projectActions';
import { discoverMcpProxy } from './projectActions';
import {
  resolveCustomCodeTool,
  loadVersionForTool,
  snapshotSourceKey
} from './customCode';
import {
  enqueueIndex,
  validateCalcomApiKey,
  validateTavilyApiKey,
  discoverRemoteMcpTools,
  refreshArtifactCredential,
  beginMcpProxyOauth,
  resolveMcpProxyOauthSecret,
  readStoredMcpOauth,
  claimManualResourceSync,
  releaseManualResourceSync,
  enqueueResourceSync,
  Plan
} from '../../utils';
import { fileLinksFor } from '../../utils/dataDatabase';

// types
import { AppEnv } from '../../types';
import type { ReadableStream as WorkersReadableStream } from '@cloudflare/workers-types';

const projectCaller = (c: Context<AppEnv>): projectActions.ProjectCaller => ({
  env: c.env,
  db: db.create(c)
});

const createPrompt = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues = await utils.Schema.ARTIFACT_CREATE_PROMPT.parseAsync({
    ...body,
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const result = await projectActions.createPrompt(projectCaller(c), currentValues);

  return c.json(result);
};

const updatePrompt = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues = await utils.Schema.ARTIFACT_UPDATE_PROMPT.parseAsync({
    ...body,
    promptId: c.req.param('promptId'),
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const { prompt } = await projectActions.updatePrompt(projectCaller(c), currentValues);

  return c.json(prompt);
};

const listPrompts = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.ARTIFACT_GET_PROMPT.parseAsync({
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const dbInstance = db.create(c);

  const artifact = await dbInstance.query.artifact.findFirst({
    where: eq(db.schema.artifact.projectId, currentValues.projectId),
    with: {
      artifactPrompts: true
    }
  });

  if (!artifact) {
    throw new Error('Artifact not found for the project');
  }

  return c.json(artifact.artifactPrompts);
};

const removePrompt = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.ARTIFACT_REMOVE_PROMPT.parseAsync({
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId'),
    promptId: c.req.param('promptId')
  });

  await projectActions.removePrompt(projectCaller(c), currentValues);

  return c.json(currentValues);
};

const createResource = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const projectId = c.req.param('projectId');
  const organizationId = c.req.param('organizationId');
  const userId = c.get('user').id;

  if (!projectId || !organizationId) {
    throw new Error('projectId and organizationId are required');
  }

  const result = await projectActions.createResource(projectCaller(c), {
    organizationId,
    projectId,
    userId,
    body
  });

  return c.json(result);
};

const updateResource = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const projectId = c.req.param('projectId');
  const organizationId = c.req.param('organizationId');
  const resourceId = c.req.param('resourceId');
  const userId = c.get('user').id;

  if (!projectId || !organizationId || !resourceId) {
    throw new Error('projectId, organizationId and resourceId are required');
  }

  const { resource } = await projectActions.updateResource(projectCaller(c), {
    organizationId,
    projectId,
    resourceId,
    userId,
    body
  });

  return c.json(resource);
};

const getResource = async (c: Context<AppEnv>) => {
  const currentValues =
    await utils.Schema.ARTIFACT_GET_RESOURCE_BY_ID.parseAsync({
      resourceId: c.req.param('resourceId'),
      projectId: c.req.param('projectId'),
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId')
    });

  const dbInstance = db.create(c);

  const [artifactRow] = await dbInstance
    .select()
    .from(db.schema.artifact)
    .where(eq(db.schema.artifact.projectId, currentValues.projectId))
    .limit(1);

  if (!artifactRow) {
    throw new Error('Artifact not found for the project');
  }

  const [resource] = await dbInstance
    .select()
    .from(db.schema.artifactResource)
    .where(
      and(
        eq(db.schema.artifactResource.id, currentValues.resourceId),
        eq(db.schema.artifactResource.artifactId, artifactRow.id)
      )
    )
    .limit(1);

  if (!resource) {
    throw new Error('Resource not found');
  }

  return c.json(resource);
};

const listResources = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.ARTIFACT_GET_RESOURCE.parseAsync({
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const parentResourceId = c.req.query('parentResourceId') || null;

  const dbInstance = db.create(c);

  const [artifactRow] = await dbInstance
    .select()
    .from(db.schema.artifact)
    .where(eq(db.schema.artifact.projectId, currentValues.projectId))
    .limit(1);

  if (!artifactRow) {
    throw new Error('Artifact not found for the project');
  }

  const list = await dbInstance
    .select()
    .from(db.schema.artifactResource)
    .where(
      and(
        eq(db.schema.artifactResource.artifactId, artifactRow.id),
        parentResourceId
          ? eq(db.schema.artifactResource.parentResourceId, parentResourceId)
          : isNull(db.schema.artifactResource.parentResourceId)
      )
    );

  return c.json(list);
};

const removeResource = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.ARTIFACT_REMOVE_RESOURCE.parseAsync({
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId'),
    resourceId: c.req.param('resourceId')
  });

  await projectActions.removeResource(projectCaller(c), currentValues);

  return c.json(currentValues);
};

// The project's artifact, or an error when the project has none.
const projectArtifact = async (
  dbInstance: ReturnType<typeof db.create>,
  projectId: string
) => {
  const [artifact] = await dbInstance
    .select({ id: db.schema.artifact.id })
    .from(db.schema.artifact)
    .where(eq(db.schema.artifact.projectId, projectId))
    .limit(1);
  if (!artifact) throw new Error('Artifact not found for the project');
  return artifact;
};

// The items a Data file column can link: files and pages, not website seeds
// or drive folders, matched on title or uri. `tabular` keeps the spreadsheets
// and CSV a table can sync from.
const pickResources = async (c: Context<AppEnv>) => {
  const values = await utils.Schema.ARTIFACT_PICK_RESOURCE.parseAsync({
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId'),
    q: c.req.query('q') || undefined,
    limit: c.req.query('limit') ?? undefined,
    tabular: c.req.query('tabular') || undefined
  });
  const dbInstance = db.create(c);
  const artifact = await projectArtifact(dbInstance, values.projectId);
  const resource = db.schema.artifactResource;
  const pattern = values.q ? `%${values.q.replace(/[\\%_]/g, m => `\\${m}`)}%` : null;
  const rows = await dbInstance
    .select({
      id: resource.id,
      uri: resource.uri,
      title: resource.title,
      mimeType: resource.mimeType,
      sourceType: resource.sourceType,
      parentResourceId: resource.parentResourceId,
      metadata: resource.metadata
    })
    .from(resource)
    .where(
      and(
        eq(resource.artifactId, artifact.id),
        sql`not (${resource.sourceType} = ${utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE} and ${resource.parentResourceId} is null)`,
        sql`${resource.sourceType} not in (${utils.constants.RESOURCE_SOURCE_TYPE_GOOGLE_DRIVE_FOLDER}, ${utils.constants.RESOURCE_SOURCE_TYPE_ONE_DRIVE_FOLDER})`,
        pattern
          ? sql`(${resource.title} ilike ${pattern} or ${resource.uri} ilike ${pattern})`
          : undefined,
        values.tabular
          ? sql`${resource.mimeType} ~* 'spreadsheetml|ms-excel|opendocument\.spreadsheet|csv|tab-separated'`
          : undefined
      )
    )
    .orderBy(desc(resource.createdAt))
    .limit(values.limit);
  return c.json({
    items: rows.map(row => ({
      id: row.id,
      uri: row.uri,
      title: row.title,
      mimeType: row.mimeType,
      sourceType: row.sourceType,
      dataAttachment: utils.dataAttachmentOf(row.metadata) !== null
    }))
  });
};

// The Data rows that link an item or anything under it, for the delete
// dialog. A uri another item still answers to is left out: its links stay.
const resourceDataLinks = async (c: Context<AppEnv>) => {
  const values = await utils.Schema.ARTIFACT_GET_RESOURCE_BY_ID.parseAsync({
    resourceId: c.req.param('resourceId'),
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });
  const dbInstance = db.create(c);
  const artifact = await projectArtifact(dbInstance, values.projectId);
  const resource = db.schema.artifactResource;
  const [seed] = await dbInstance
    .select({ id: resource.id, uri: resource.uri })
    .from(resource)
    .where(and(eq(resource.id, values.resourceId), eq(resource.artifactId, artifact.id)))
    .limit(1);
  if (!seed) throw new Error('Resource not found');

  const ids = new Set<string>([seed.id]);
  const uris = new Set<string>([seed.uri]);
  let frontier = [seed.id];
  while (frontier.length > 0) {
    const children = await dbInstance
      .select({ id: resource.id, uri: resource.uri })
      .from(resource)
      .where(inArray(resource.parentResourceId, frontier));
    frontier = [];
    for (const child of children) {
      if (ids.has(child.id)) continue;
      ids.add(child.id);
      uris.add(child.uri);
      frontier.push(child.id);
    }
  }
  const others = await dbInstance
    .select({ id: resource.id, uri: resource.uri })
    .from(resource)
    .where(and(eq(resource.artifactId, artifact.id), inArray(resource.uri, [...uris])));
  for (const other of others) {
    if (!ids.has(other.id)) uris.delete(other.uri);
  }
  const found = await fileLinksFor(
    dbInstance,
    c.env.PROJECT_DATABASE,
    artifact.id,
    [...uris]
  ).catch(error => {
    // The dialog still opens; it just can't say which rows.
    console.error('data-file-links-read-failed', artifact.id, error);
    return null;
  });
  return c.json({ links: found?.links ?? [] });
};

const createTool = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues = await utils.Schema.ARTIFACT_CREATE_TOOL.parseAsync({
    ...body,
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const result = await projectActions.createTool(projectCaller(c), currentValues);

  return c.json(result);
};

/**
 * Re-read the annotations of an organization's mcp-proxy installs whose stored
 * discovery predates them. Without annotations every proxied tool counts as
 * one that may change things, so an organization that turns on confirmation
 * would be asked about reads too until each server was discovered again.
 * Only the annotations change: the enabled tools, schemas and the rest of the
 * stored discovery stay as the owner configured them. A server that can't be
 * reached is left as it was; best-effort, run after the response.
 */
export const refreshMcpProxyAnnotations = async (
  c: Context<AppEnv>,
  organizationId: string
): Promise<void> => {
  const dbInstance = db.create(c);
  const installs = await dbInstance
    .select({
      id: db.schema.artifactTool.id,
      artifactId: db.schema.artifactTool.artifactId,
      config: db.schema.artifactTool.config,
      metadata: db.schema.artifactTool.metadata
    })
    .from(db.schema.artifactTool)
    .innerJoin(
      db.schema.artifact,
      eq(db.schema.artifact.id, db.schema.artifactTool.artifactId)
    )
    .innerJoin(
      db.schema.project,
      eq(db.schema.project.id, db.schema.artifact.projectId)
    )
    .where(
      and(
        eq(db.schema.project.organizationId, organizationId),
        eq(
          db.schema.artifactTool.toolKey,
          utils.constants.TOOL_DEFINITION_KEY_MCP_PROXY
        )
      )
    );

  for (const install of installs) {
    const metadata = (install.metadata || {}) as Record<string, unknown>;
    const stored = metadata.discovery as
      | { tools?: McpProxyDiscoveredTool[] }
      | undefined;
    if (!Array.isArray(stored?.tools)) continue;
    if (stored.tools.some(tool => tool.annotations)) continue;

    try {
      const { discovery } = await discoverMcpProxy(
        c,
        dbInstance,
        install.artifactId,
        install.config
      );
      const annotationsByName = new Map(
        discovery.tools
          .filter(tool => tool.annotations)
          .map(tool => [tool.name, tool.annotations])
      );
      if (annotationsByName.size === 0) continue;
      await dbInstance
        .update(db.schema.artifactTool)
        .set({
          metadata: {
            ...metadata,
            discovery: {
              ...stored,
              tools: stored.tools.map(tool =>
                annotationsByName.has(tool.name)
                  ? { ...tool, annotations: annotationsByName.get(tool.name) }
                  : tool
              )
            }
          }
        })
        .where(eq(db.schema.artifactTool.id, install.id));
    } catch (error) {
      console.warn(
        `mcp-proxy ${install.id}: could not refresh annotations — ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
};

const updateTool = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues = await utils.Schema.ARTIFACT_UPDATE_TOOL.parseAsync({
    ...body,
    toolId: c.req.param('toolId'),
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const { tool } = await projectActions.updateTool(projectCaller(c), currentValues);

  return c.json(tool);
};

// Build the single auth header to inject on the remote connection from a
// resolved secret and the server's auth kind.
const proxyAuthHeader = (
  authKind: string,
  secret: string,
  headerName?: string
): { name: string; value: string } =>
  authKind === utils.constants.MCP_PROXY_AUTH_KIND_HEADER
    ? { name: headerName || 'Authorization', value: secret }
    : { name: 'Authorization', value: `Bearer ${secret}` };

// Connect to a curated remote MCP server and return everything it exposes,
// WITHOUT persisting anything. Powers the "enable/disable which tools" picker
// in the catalog UI AND validates the token before it's stored: the client
// sends `{ curatedServerId, token }` (an inline token, never written) — if it
// can list tools the token is good, and only then does the UI persist a
// credential + create the install. A stored `credentialId` is also accepted
// (e.g. to re-list an existing connection).
const previewMcpProxy = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues = await utils.Schema.ARTIFACT_GET.parseAsync({
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const dbInstance = db.create(c);

  const [project] = await dbInstance
    .select({ id: db.schema.project.id })
    .from(db.schema.project)
    .where(
      and(
        eq(db.schema.project.id, currentValues.projectId),
        eq(db.schema.project.organizationId, currentValues.organizationId)
      )
    )
    .limit(1);

  if (!project) {
    throw new Error('Project not found');
  }

  const [artifactRow] = await dbInstance
    .select({ id: db.schema.artifact.id })
    .from(db.schema.artifact)
    .where(eq(db.schema.artifact.projectId, currentValues.projectId))
    .limit(1);

  if (!artifactRow) {
    throw new Error('Artifact not found for the project');
  }

  const curatedServerId =
    typeof body?.curatedServerId === 'string' ? body.curatedServerId : '';
  if (!curatedServerId) {
    throw new Error('Select a server to connect.');
  }

  const [server] = await dbInstance
    .select()
    .from(db.schema.mcpServerCatalog)
    .where(eq(db.schema.mcpServerCatalog.id, curatedServerId))
    .limit(1);

  if (!server || !server.verified) {
    throw new Error(
      'Unknown or unverified MCP server. Pick one from the catalog.'
    );
  }

  // Auth resolution by the server's auth kind:
  //  - oauth: the catalog slug doubles as the OAuth provider key; resolve the
  //    artifact's existing connection, or tell the UI to run the OAuth flow.
  //  - otherwise: an inline token (validate-before-store) takes precedence,
  //    else a stored credentialId; either may be absent for a no-auth server.
  let authHeader: { name: string; value: string } | null = null;
  // For oauth, surfaced back to the UI so the save can reference the resolved
  // credential by id without the client ever seeing it.
  let resolvedCredentialId: string | undefined;
  const inlineToken = typeof body?.token === 'string' ? body.token.trim() : '';
  const headerName =
    typeof body?.headerName === 'string' ? body.headerName : undefined;

  const oauthNeeded = {
    needsOauth: true,
    oauthProvider: server.slug,
    server: { id: server.id, slug: server.slug, name: server.name }
  };

  if (server.authKind === utils.constants.MCP_PROXY_AUTH_KIND_OAUTH) {
    // MCP-OAuth: the token is issued by the MCP server itself (stored on the
    // credential's metadata.mcpOauth). A row without that, or still pending,
    // means the user hasn't finished connecting yet.
    const [credential] = await dbInstance
      .select()
      .from(db.schema.artifactCredential)
      .where(
        and(
          eq(db.schema.artifactCredential.provider, server.slug),
          eq(db.schema.artifactCredential.artifactId, artifactRow.id)
        )
      )
      .limit(1);
    if (!credential || !readStoredMcpOauth(credential.metadata)) {
      return c.json(oauthNeeded);
    }
    const { secret, needsReauth } = await resolveMcpProxyOauthSecret({
      c,
      dbInstance,
      credential
    });
    if (needsReauth || !secret) {
      return c.json(oauthNeeded);
    }
    authHeader = { name: 'Authorization', value: `Bearer ${secret}` };
    resolvedCredentialId = credential.id;
  } else if (inlineToken) {
    authHeader = proxyAuthHeader(server.authKind, inlineToken, headerName);
  } else if (typeof body?.credentialId === 'string' && body.credentialId) {
    const [credential] = await dbInstance
      .select()
      .from(db.schema.artifactCredential)
      .where(
        and(
          eq(db.schema.artifactCredential.id, body.credentialId),
          eq(db.schema.artifactCredential.artifactId, artifactRow.id)
        )
      )
      .limit(1);
    if (!credential) {
      throw new Error(
        'The selected credential was not found for this artifact.'
      );
    }
    const { secret, needsReauth } = await refreshArtifactCredential(
      c,
      dbInstance,
      credential
    );
    if (needsReauth) {
      throw new Error(
        `The credential for "${server.name}" needs to be re-authorized. Reconnect it and try again.`
      );
    }
    authHeader = proxyAuthHeader(server.authKind, secret, headerName);
    resolvedCredentialId = credential.id;
  }

  const discovery = await discoverRemoteMcpTools({
    url: server.url,
    transport: server.transport,
    authHeader,
    timeoutMs: utils.constants.MCP_PROXY_DEFAULT_TIMEOUT_MS,
    maxItems: utils.constants.MCP_PROXY_MAX_TOOLS
  });

  // Only surface tools whose name can actually be registered (matches the
  // boot-time filter), so the UI never offers a tool it can't enable.
  const safeTools = discovery.tools.filter(
    t => utils.buildProxyToolName(server.slug, t.name) !== null
  );

  return c.json({
    server: { id: server.id, slug: server.slug, name: server.name },
    serverInfo: discovery.serverInfo,
    tools: safeTools,
    resources: discovery.resources,
    prompts: discovery.prompts,
    // Present for oauth (and a stored credentialId) so the install can reference
    // the resolved credential by id; undefined for inline-token discovery.
    credentialId: resolvedCredentialId
  });
};

// Begin the MCP-protocol OAuth flow for an oauth-kind catalog server: discovers
// the server's auth server, dynamically registers a client, and returns the
// PKCE authorize URL for the browser to redirect to. The OAuth callback
// (OAuthController.mcpProxyCallback) finishes the exchange.
const startMcpProxyOauth = async (c: Context<AppEnv>) => {
  const body = await c.req.json().catch(() => ({}));
  const currentValues = await utils.Schema.ARTIFACT_GET.parseAsync({
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const dbInstance = db.create(c);

  const [project] = await dbInstance
    .select({ id: db.schema.project.id })
    .from(db.schema.project)
    .where(
      and(
        eq(db.schema.project.id, currentValues.projectId),
        eq(db.schema.project.organizationId, currentValues.organizationId)
      )
    )
    .limit(1);
  if (!project) {
    throw new Error('Project not found');
  }

  const [artifactRow] = await dbInstance
    .select({ id: db.schema.artifact.id })
    .from(db.schema.artifact)
    .where(eq(db.schema.artifact.projectId, currentValues.projectId))
    .limit(1);
  if (!artifactRow) {
    throw new Error('Artifact not found for the project');
  }

  const curatedServerId =
    typeof body?.curatedServerId === 'string' ? body.curatedServerId : '';
  if (!curatedServerId) {
    throw new Error('Select a server to connect.');
  }

  const [server] = await dbInstance
    .select()
    .from(db.schema.mcpServerCatalog)
    .where(eq(db.schema.mcpServerCatalog.id, curatedServerId))
    .limit(1);
  if (!server || !server.verified) {
    throw new Error(
      'Unknown or unverified MCP server. Pick one from the catalog.'
    );
  }
  if (server.authKind !== utils.constants.MCP_PROXY_AUTH_KIND_OAUTH) {
    throw new Error('This server does not use OAuth.');
  }

  const url = await beginMcpProxyOauth({
    c,
    dbInstance,
    server: { slug: server.slug, url: server.url, name: server.name },
    artifactId: artifactRow.id,
    organizationId: currentValues.organizationId,
    projectId: currentValues.projectId
  });

  return c.json({ url });
};

const createCustomCodeVersion = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues =
    await utils.Schema.ARTIFACT_CUSTOM_CODE_CREATE_VERSION.parseAsync({
      ...body,
      projectId: c.req.param('projectId'),
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId')
    });
  return c.json(
    await customCodeActions.createDraft(
      { env: c.env, db: db.create(c) },
      currentValues
    )
  );
};

const uploadCustomCodeBundle = async (c: Context<AppEnv>) => {
  const currentValues =
    await utils.Schema.ARTIFACT_CUSTOM_CODE_UPLOAD_BUNDLE.parseAsync({
      versionId: c.req.param('versionId'),
      sourceKind: c.req.query('kind'),
      projectId: c.req.param('projectId'),
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId')
    });

  const contentLengthHeader = c.req.header('content-length');
  if (!contentLengthHeader) {
    throw new Error('content-length header is required');
  }

  const declaredSize = Number.parseInt(contentLengthHeader, 10);
  if (!Number.isFinite(declaredSize) || declaredSize <= 0) {
    throw new Error('Invalid content-length');
  }

  const bundleLimitMb =
    utils.constants.CUSTOM_CODE_MAX_BUNDLE_BYTES / (1024 * 1024);
  if (declaredSize > utils.constants.CUSTOM_CODE_MAX_BUNDLE_BYTES) {
    throw new Error(`Bundle exceeds the ${bundleLimitMb}MB limit`);
  }

  // Buffered rather than streamed (unlike uploadResourceFile) because the hash
  // has to cover exactly the bytes stored, and the cap above keeps this small.
  // content-length is a claim, so the real length is re-checked here.
  const bundle = await c.req.arrayBuffer();
  return c.json(
    await customCodeActions.storeBundle(
      { env: c.env, db: db.create(c) },
      currentValues,
      bundle
    )
  );
};

/**
 * Store the readable source `ganju deploy` sends beside a draft's bundle, so
 * the dashboard can show the author's real files instead of the minified
 * bundle. Only shown, never deployed, so a failure here never costs a deploy:
 * the CLI warns and publishes anyway.
 */
const uploadCustomCodeSnapshot = async (c: Context<AppEnv>) => {
  const currentValues =
    await utils.Schema.ARTIFACT_CUSTOM_CODE_UPLOAD_SNAPSHOT.parseAsync({
      versionId: c.req.param('versionId'),
      projectId: c.req.param('projectId'),
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId')
    });

  // JSON escaping can grow the files' own bytes, so the body gets room for
  // that; the files themselves are held to the real cap below.
  const bodyLimit = utils.constants.CUSTOM_CODE_MAX_SNAPSHOT_BYTES * 2;
  const declaredSize = Number.parseInt(
    c.req.header('content-length') ?? '',
    10
  );
  if (!Number.isFinite(declaredSize) || declaredSize <= 0) {
    throw new Error('content-length header is required');
  }
  const tooBig = `The source snapshot exceeds the ${
    utils.constants.CUSTOM_CODE_MAX_SNAPSHOT_BYTES / (1024 * 1024)
  }MB limit`;
  if (declaredSize > bodyLimit) {
    throw new Error(tooBig);
  }
  const body = await c.req.arrayBuffer();
  if (body.byteLength > bodyLimit) {
    throw new Error(tooBig);
  }

  const files = utils.decodeProject(new TextDecoder().decode(body));
  if (!files) {
    throw new Error('The source snapshot must be a project of files');
  }
  utils.validateSnapshotFiles(files);

  const dbInstance = db.create(c);
  const bucket = c.env.STORAGE_BUCKET;

  const { artifact, version } = await dbInstance.transaction(async tx => {
    const resolved = await resolveCustomCodeTool(
      tx,
      currentValues.organizationId,
      currentValues.projectId
    );
    return {
      artifact: resolved.artifact,
      version: await loadVersionForTool(
        tx,
        resolved.tool.id,
        currentValues.versionId
      )
    };
  });

  const draftOnly =
    'A source snapshot must be uploaded to a draft; this version is already published.';
  if (version.status !== utils.constants.CUSTOM_CODE_VERSION_STATUS_DRAFT) {
    throw new Error(draftOnly);
  }
  // An editor version already stores its own readable files.
  if (version.sourceKind === utils.constants.CUSTOM_CODE_SOURCE_KIND_EDITOR) {
    throw new Error(
      'A source snapshot must be uploaded to a CLI version, not one made in the editor.'
    );
  }

  const stored = utils.encodeProject(files);
  const key = snapshotSourceKey(
    currentValues.organizationId,
    currentValues.projectId,
    artifact.id,
    version.version,
    await utils.sha256Hex(stored)
  );

  if (bucket) {
    await bucket.put(key, stored, {
      httpMetadata: { contentType: 'application/json' }
    });
  }

  const [updated] = await dbInstance
    .update(db.schema.artifactToolVersion)
    .set({ sourceSnapshotKey: key })
    .where(
      and(
        eq(db.schema.artifactToolVersion.id, version.id),
        eq(
          db.schema.artifactToolVersion.status,
          utils.constants.CUSTOM_CODE_VERSION_STATUS_DRAFT
        )
      )
    )
    .returning();
  if (!updated) {
    // Published meanwhile, so nothing points at what was just stored, unless
    // the same files were stored under the same key before it was.
    if (bucket) {
      const [current] = await dbInstance
        .select({
          sourceSnapshotKey: db.schema.artifactToolVersion.sourceSnapshotKey
        })
        .from(db.schema.artifactToolVersion)
        .where(eq(db.schema.artifactToolVersion.id, version.id))
        .limit(1);
      if (current?.sourceSnapshotKey !== key) {
        await bucket.delete(key).catch(() => undefined);
      }
    }
    throw new Error(draftOnly);
  }

  // The draft's previous snapshot, replaced by this one. Best-effort.
  if (
    bucket &&
    version.sourceSnapshotKey &&
    version.sourceSnapshotKey !== key
  ) {
    await bucket.delete(version.sourceSnapshotKey).catch(() => undefined);
  }

  return c.json(updated);
};

/**
 * Read one version's stored source back, for the editor.
 *
 * Returns `editable: false` rather than refusing when the version holds a CLI
 * bundle: seeing what is deployed is legitimate, and the honest answer is "here
 * it is, and you can't edit this one" rather than a 403 that reads like the
 * version is missing. The dashboard shows it read-only.
 */
const getCustomCodeVersionSource = async (c: Context<AppEnv>) => {
  const currentValues =
    await utils.Schema.ARTIFACT_CUSTOM_CODE_GET_SOURCE.parseAsync({
      versionId: c.req.param('versionId'),
      projectId: c.req.param('projectId'),
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId')
    });
  return c.json(
    await customCodeActions.readSource(
      { env: c.env, db: db.create(c) },
      currentValues
    )
  );
};

/**
 * Run one tool of one version against a sample input, without publishing it.
 *
 * The point of the whole panel: until this existed, the only way to find out
 * whether a function worked was to put it in front of every MCP client and call
 * it from one. The shape of the answer follows from that — output, logs and
 * error kept apart, plus what the schemas made of the input and the output,
 * because "it returned something" and "it returned what it promised" are
 * different questions.
 *
 * Three things make it safe to run unpublished code:
 *
 *  - It deploys to `artifact_<id>_preview`, a script name nothing dispatches to,
 *    so a test cannot disturb what clients are being served. It is overwritten by
 *    the next test and deleted after this one.
 *  - Its broker token is a preview token: minted for a version that is
 *    deliberately not active, and expiring on its own since no publish will
 *    rotate it.
 *  - It runs under the stored config's egress rules, so a host that will be
 *    refused in production is refused here.
 *
 * It is a write in every sense that matters — it deploys code and spends CPU —
 * so it carries the same plan gate the publish paths do.
 */
const testCustomCodeVersion = async (c: Context<AppEnv>) => {
  const body = await c.req.json().catch(() => ({}));
  const currentValues =
    await utils.Schema.ARTIFACT_CUSTOM_CODE_TEST_VERSION.parseAsync({
      versionId: c.req.param('versionId'),
      tool: body?.tool,
      input: body?.input ?? {},
      projectId: c.req.param('projectId'),
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId')
    });
  return c.json(
    await customCodeActions.runTest(
      { env: c.env, db: db.create(c) },
      currentValues
    )
  );
};

// Publish and rollback share one state transition and differ only in which
// versions they accept: publish promotes anything with a bundle, rollback
// requires a version that has been live before. They stay separate endpoints so
// the intent is legible in logs and in the UI.
const activateCustomCodeVersion = async (
  c: Context<AppEnv>,
  requirePreviouslyPublished: boolean
) => {
  const schema = requirePreviouslyPublished
    ? utils.Schema.ARTIFACT_CUSTOM_CODE_ROLLBACK
    : utils.Schema.ARTIFACT_CUSTOM_CODE_PUBLISH;

  const currentValues = await schema.parseAsync({
    versionId: c.req.param('versionId'),
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });
  return c.json(
    await customCodeActions.switchVersion(
      { env: c.env, db: db.create(c) },
      currentValues,
      requirePreviouslyPublished
    )
  );
};

const publishCustomCodeVersion = (c: Context<AppEnv>) =>
  activateCustomCodeVersion(c, false);

const rollbackCustomCodeVersion = (c: Context<AppEnv>) =>
  activateCustomCodeVersion(c, true);

const listCustomCodeVersions = async (c: Context<AppEnv>) => {
  const currentValues =
    await utils.Schema.ARTIFACT_CUSTOM_CODE_LIST_VERSIONS.parseAsync({
      projectId: c.req.param('projectId'),
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId')
    });
  return c.json(
    await customCodeActions.listVersions(
      { env: c.env, db: db.create(c) },
      currentValues
    )
  );
};

/**
 * Recent invocations of this artifact's custom tools, with their `ctx.log`
 * output — what `ganju logs` prints.
 *
 * Read from `mcp_request`, which apps/mcp already writes one of per call with
 * the tool name, the latency, any error and the log lines on `output.logs`. So
 * this endpoint adds no recording, only a way to read what is recorded.
 *
 * Scoped by joining through `mcp_session` to the artifact and then filtering on
 * the custom-code install's id, rather than by tool name alone: a native tool
 * and a user's tool can carry the same name on artifacts that predate the
 * reserved-name rule, and only the id says which row actually ran.
 */
const listCustomCodeLogs = async (c: Context<AppEnv>) => {
  const currentValues =
    await utils.Schema.ARTIFACT_CUSTOM_CODE_LIST_LOGS.parseAsync({
      tool: c.req.query('tool'),
      limit: c.req.query('limit'),
      before: c.req.query('before'),
      projectId: c.req.param('projectId'),
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId')
    });
  return c.json(
    await customCodeActions.listLogs(
      { env: c.env, db: db.create(c) },
      currentValues
    )
  );
};

const listTools = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.ARTIFACT_GET_TOOL.parseAsync({
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const dbInstance = db.create(c);

  const artifact = await dbInstance.query.artifact.findFirst({
    where: eq(db.schema.artifact.projectId, currentValues.projectId),
    with: { artifactTools: true }
  });

  if (!artifact) {
    throw new Error('Artifact not found for the project');
  }

  // Attached in code rather than joined. The response keeps the same shape it
  // had when the catalog was two tables, so the dashboard still renders a tool
  // without carrying its own copy of the catalog.
  return c.json(
    artifact.artifactTools.map(tool => ({
      ...tool,
      toolDefinition: utils.describeCatalogTool(tool.toolKey)
    }))
  );
};

/**
 * Turn one installed tool on or off.
 *
 * The row and its config survive either way — that is the difference between
 * this and removeTool, and the reason the flag exists at all. What changes is
 * whether the MCP boot loop registers it, which is also what the plan's tool
 * quota measures: "7 tools on Free" means seven tools your server exposes, not
 * seven rows you once created — and an mcp-proxy row exposes every remote tool
 * it allows (`countArtifactTools`).
 *
 * Enabling therefore re-checks the quota. It is the one place a user can cross
 * the cap without creating anything — disable three, upgrade nothing, enable
 * four — and the check has to be here rather than at boot, where the only
 * available answer would be to silently drop a tool the dashboard shows as on.
 */
const setToolEnabled = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.ARTIFACT_SET_TOOL_ENABLED.parseAsync(
    {
      projectId: c.req.param('projectId'),
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId'),
      toolId: c.req.param('toolId'),
      enabled: (await c.req.json().catch(() => ({}))).enabled
    }
  );

  const { tool: updated } = await projectActions.setToolEnabled(
    projectCaller(c),
    currentValues
  );

  return c.json({
    ...updated,
    toolDefinition: utils.describeCatalogTool(updated.toolKey)
  });
};

const removeTool = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.ARTIFACT_REMOVE_TOOL.parseAsync({
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId'),
    toolId: c.req.param('toolId')
  });

  await projectActions.removeTool(projectCaller(c), currentValues);

  return c.json(currentValues);
};

const uploadResourceFile = async (c: Context<AppEnv>) => {
  const currentValues =
    await utils.Schema.ARTIFACT_UPLOAD_RESOURCE_FILE.parseAsync({
      resourceId: c.req.param('resourceId'),
      projectId: c.req.param('projectId'),
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId')
    });

  const contentType = c.req.header('content-type');
  const fileNameHeader = c.req.header('x-file-name');
  const contentLengthHeader = c.req.header('content-length');

  if (!contentType) {
    throw new Error('content-type header is required');
  }
  if (!fileNameHeader) {
    throw new Error('x-file-name header is required');
  }
  if (!contentLengthHeader) {
    throw new Error('content-length header is required');
  }

  const fileSize = Number.parseInt(contentLengthHeader, 10);
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    throw new Error('Invalid content-length');
  }
  if (fileSize > utils.constants.MAX_FILE_SIZE) {
    throw new Error(
      `File size exceeds the ${utils.constants.MAX_FILE_SIZE / (1024 * 1024)}MB limit`
    );
  }
  if (!(utils.constants.MIMETYPES as readonly string[]).includes(contentType)) {
    throw new Error(`Unsupported mime type: ${contentType}`);
  }

  const fileName = decodeURIComponent(fileNameHeader);
  const body = c.req.raw.body;
  if (!body) {
    throw new Error('Request body is required');
  }

  const dbInstance = db.create(c);
  const bucket = c.env.STORAGE_BUCKET;

  const result = await dbInstance.transaction(async tx => {
    const [project] = await tx
      .select()
      .from(db.schema.project)
      .where(
        and(
          eq(db.schema.project.id, currentValues.projectId),
          eq(db.schema.project.organizationId, currentValues.organizationId)
        )
      )
      .limit(1);

    if (!project) {
      throw new Error('Project not found');
    }

    const [currentArtifactByProject] = await tx
      .select()
      .from(db.schema.artifact)
      .where(eq(db.schema.artifact.projectId, currentValues.projectId))
      .limit(1);

    if (!currentArtifactByProject) {
      throw new Error('Artifact not found for the project');
    }

    const key = `organizations/${currentValues.organizationId}/projects/${currentValues.projectId}/resources/${currentArtifactByProject.id}/${utils.formatFilename(fileName)}`;

    let storedSize = fileSize;
    if (bucket) {
      const putResult = await bucket.put(
        key,
        body as unknown as WorkersReadableStream,
        {
          httpMetadata: { contentType }
        }
      );
      storedSize = putResult?.size ?? fileSize;
    }

    const artifactResource = await tx
      .update(db.schema.artifactResource)
      .set({
        fileKey: key,
        fileName,
        mimeType: contentType,
        size: storedSize,
        status: utils.constants.STATUS_PENDING
      })
      .where(
        and(
          eq(db.schema.artifactResource.id, currentValues.resourceId),
          eq(db.schema.artifactResource.artifactId, currentArtifactByProject.id)
        )
      )
      .returning();

    if (!artifactResource[0]) {
      throw new Error('Resource not found');
    }

    // Nothing to index: the item is ready once its bytes are stored.
    if (utils.skipsIndexing(artifactResource[0].metadata)) {
      const [ready] = await tx
        .update(db.schema.artifactResource)
        .set({ status: utils.constants.STATUS_COMPLETED })
        .where(eq(db.schema.artifactResource.id, artifactResource[0].id))
        .returning();
      return ready;
    }

    return artifactResource[0];
  });

  if (!utils.skipsIndexing(result.metadata)) {
    await enqueueIndex(c.env, result.id);
  }

  return c.json(result);
};

const listCredentials = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.ARTIFACT_GET_CREDENTIAL.parseAsync({
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const dbInstance = db.create(c);

  const artifact = await dbInstance.query.artifact.findFirst({
    where: eq(db.schema.artifact.projectId, currentValues.projectId),
    with: {
      artifactCredentials: true
    }
  });

  if (!artifact) {
    throw new Error('Artifact not found for the project');
  }

  return c.json(
    artifact.artifactCredentials.map(
      ({ accessToken: _a, refreshToken, ...rest }) => ({
        ...rest,
        hasRefreshToken: Boolean(refreshToken)
      })
    )
  );
};

/**
 * Every managed OAuth provider, and where this artifact stands with each.
 *
 * The read side of connections as a first-class concept. Two callers want it and
 * neither can be served by listCredentials: the http-endpoint form needs the
 * credential id of a connection it can borrow, and the custom-code config needs
 * the provider names it may declare. Both also need to know which providers
 * exist but are NOT connected, which a list of stored rows cannot say.
 */
const listConnections = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.ARTIFACT_LIST_CONNECTIONS.parseAsync(
    {
      projectId: c.req.param('projectId'),
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId')
    }
  );

  const dbInstance = db.create(c);

  const [project] = await dbInstance
    .select({ id: db.schema.project.id })
    .from(db.schema.project)
    .where(
      and(
        eq(db.schema.project.id, currentValues.projectId),
        eq(db.schema.project.organizationId, currentValues.organizationId)
      )
    )
    .limit(1);

  if (!project) {
    throw new Error('Project not found');
  }

  const artifact = await dbInstance.query.artifact.findFirst({
    where: eq(db.schema.artifact.projectId, currentValues.projectId),
    with: { artifactCredentials: true }
  });

  if (!artifact) {
    throw new Error('Artifact not found for the project');
  }

  // Only the connection view is returned — never a token, encrypted or not.
  return c.json({
    connections: buildArtifactConnections(c, artifact.artifactCredentials)
  });
};

const removeCredential = async (c: Context<AppEnv>) => {
  const currentValues =
    await utils.Schema.ARTIFACT_REMOVE_CREDENTIAL.parseAsync({
      projectId: c.req.param('projectId'),
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId'),
      credentialId: c.req.param('credentialId')
    });

  const dbInstance = db.create(c);

  await dbInstance.transaction(async tx => {
    const [project] = await tx
      .select()
      .from(db.schema.project)
      .where(
        and(
          eq(db.schema.project.id, currentValues.projectId),
          eq(db.schema.project.organizationId, currentValues.organizationId)
        )
      )
      .limit(1);

    if (!project) {
      throw new Error('Project not found');
    }

    const [currentArtifactByProject] = await tx
      .select()
      .from(db.schema.artifact)
      .where(eq(db.schema.artifact.projectId, currentValues.projectId))
      .limit(1);

    if (!currentArtifactByProject) {
      throw new Error('Artifact not found for the project');
    }

    const deleteCredential = await tx
      .delete(db.schema.artifactCredential)
      .where(
        and(
          eq(db.schema.artifactCredential.id, currentValues.credentialId),
          eq(
            db.schema.artifactCredential.artifactId,
            currentArtifactByProject.id
          )
        )
      )
      .returning();

    if (deleteCredential.length === 0) {
      throw new Error('Credential not found');
    }

    await tx
      .update(db.schema.artifact)
      .set({
        artifactCredentialCount: sql`(${db.schema.artifact.artifactCredentialCount}::int - 1)::int`
      })
      .where(eq(db.schema.artifact.id, currentArtifactByProject.id));
  });

  return c.json(currentValues);
};

const createCredential = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues =
    await utils.Schema.ARTIFACT_CREATE_CREDENTIAL.parseAsync({
      ...body,
      projectId: c.req.param('projectId'),
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId')
    });

  // http-endpoint and mcp-proxy secrets are per-tool: many per artifact, each a
  // fresh labelled row referenced by id (not one-per-provider).
  const isPerToolSecret = (
    utils.constants.PER_TOOL_CREDENTIAL_PROVIDERS as readonly string[]
  ).includes(currentValues.provider);

  // Verify the key works before persisting, so we never store a dead key.
  // Per-tool secrets have no vendor to validate against, so they skip this.
  if (currentValues.provider === utils.constants.API_KEY_PROVIDER_CALCOM) {
    const valid = await validateCalcomApiKey(currentValues.apiKey);
    if (!valid) {
      throw new Error(
        'Invalid Cal.com API key (or Cal.com could not be reached). Double-check the key and try again.'
      );
    }
  }
  if (currentValues.provider === utils.constants.API_KEY_PROVIDER_TAVILY) {
    const valid = await validateTavilyApiKey(currentValues.apiKey);
    if (!valid) {
      throw new Error(
        'Invalid Tavily API key (or Tavily could not be reached). Double-check the key and try again.'
      );
    }
  }

  const dbInstance = db.create(c);
  const encryptionKey = utils.getCredentialEncryptionKey(c);
  const encryptedAccessToken = utils.encryptString(
    currentValues.apiKey,
    encryptionKey
  );

  let createdId: string | undefined;

  await dbInstance.transaction(async tx => {
    const [project] = await tx
      .select()
      .from(db.schema.project)
      .where(
        and(
          eq(db.schema.project.id, currentValues.projectId),
          eq(db.schema.project.organizationId, currentValues.organizationId)
        )
      )
      .limit(1);

    if (!project) {
      throw new Error('Project not found');
    }

    const [currentArtifactByProject] = await tx
      .select()
      .from(db.schema.artifact)
      .where(eq(db.schema.artifact.projectId, currentValues.projectId))
      .limit(1);

    if (!currentArtifactByProject) {
      throw new Error('Artifact not found for the project');
    }

    // Per-tool credentials aren't unique per provider — one artifact can hold
    // many secrets, each referenced by id from a tool's auth config and
    // labelled so the user can tell them apart. Always insert a fresh row
    // instead of overwriting the existing provider credential.
    if (isPerToolSecret) {
      const [inserted] = await tx
        .insert(db.schema.artifactCredential)
        .values({
          provider: currentValues.provider,
          accessToken: encryptedAccessToken,
          metadata: currentValues.label ? { label: currentValues.label } : null,
          artifactId: currentArtifactByProject.id
        })
        .returning({ id: db.schema.artifactCredential.id });
      createdId = inserted?.id;

      await tx
        .update(db.schema.artifact)
        .set({
          artifactCredentialCount: sql`(${db.schema.artifact.artifactCredentialCount}::int + 1)::int`
        })
        .where(eq(db.schema.artifact.id, currentArtifactByProject.id));

      return;
    }

    const [existingCredential] = await tx
      .select({ id: db.schema.artifactCredential.id })
      .from(db.schema.artifactCredential)
      .where(
        and(
          eq(
            db.schema.artifactCredential.artifactId,
            currentArtifactByProject.id
          ),
          eq(db.schema.artifactCredential.provider, currentValues.provider)
        )
      )
      .limit(1);

    if (existingCredential) {
      await tx
        .update(db.schema.artifactCredential)
        .set({
          accessToken: encryptedAccessToken,
          refreshToken: null,
          expiresAt: null,
          scopes: null,
          metadata: null
        })
        .where(eq(db.schema.artifactCredential.id, existingCredential.id));
      createdId = existingCredential.id;
    } else {
      const [inserted] = await tx
        .insert(db.schema.artifactCredential)
        .values({
          provider: currentValues.provider,
          accessToken: encryptedAccessToken,
          artifactId: currentArtifactByProject.id
        })
        .returning({ id: db.schema.artifactCredential.id });
      createdId = inserted?.id;

      await tx
        .update(db.schema.artifact)
        .set({
          artifactCredentialCount: sql`(${db.schema.artifact.artifactCredentialCount}::int + 1)::int`
        })
        .where(eq(db.schema.artifact.id, currentArtifactByProject.id));
    }
  });

  // Cache the zone on the connected Cal.com profile, so the model can resolve
  // "tomorrow at 9" from the moment the key is saved rather than from the first
  // booking. After the commit and best-effort: the key is validated and stored
  // either way, and the tool handler re-reads this when it goes stale. Note the
  // replace path above nulls metadata, which is correct — a new key can be a
  // different account — and this is what puts the zone back.
  if (
    createdId &&
    currentValues.provider === utils.constants.API_KEY_PROVIDER_CALCOM
  ) {
    try {
      const timeZone = await utils.fetchCalcomTimeZone(currentValues.apiKey);
      await dbInstance
        .update(db.schema.artifactCredential)
        .set({ metadata: utils.writeCredentialTimeZone(null, timeZone) })
        .where(eq(db.schema.artifactCredential.id, createdId));
    } catch {
      // Left for the tool handler's staleness check to pick up.
    }
  }

  return c.json({
    provider: currentValues.provider,
    status: 'ok',
    id: createdId
  });
};

const downloadResourceFile = async (c: Context<AppEnv>) => {
  const currentValues =
    await utils.Schema.ARTIFACT_DOWNLOAD_RESOURCE_FILE.parseAsync({
      resourceId: c.req.param('resourceId'),
      projectId: c.req.param('projectId'),
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId')
    });

  const dbInstance = db.create(c);
  const bucket = c.env.STORAGE_BUCKET;

  const [currentArtifactByProject] = await dbInstance
    .select()
    .from(db.schema.artifact)
    .where(eq(db.schema.artifact.projectId, currentValues.projectId))
    .limit(1);

  if (!currentArtifactByProject) {
    throw new Error('Artifact not found for the project');
  }

  const [resource] = await dbInstance
    .select()
    .from(db.schema.artifactResource)
    .where(
      and(
        eq(db.schema.artifactResource.id, currentValues.resourceId),
        eq(db.schema.artifactResource.artifactId, currentArtifactByProject.id)
      )
    )
    .limit(1);

  if (!resource) {
    throw new Error('Resource not found');
  }

  if (!resource.fileKey) {
    throw new Error('Resource has no file');
  }

  if (!bucket) {
    throw new Error('Storage not available');
  }

  const object = await bucket.get(resource.fileKey);

  if (!object) {
    throw new Error('File not found in storage');
  }

  const fileName = resource.fileKey.split('/').pop() || resource.title;
  const asciiFileName = fileName
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/"/g, '');
  const encodedFileName = encodeURIComponent(fileName);

  return new Response(object.body as unknown as ReadableStream, {
    headers: {
      'Content-Type': resource.mimeType,
      'Content-Disposition': `inline; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`,
      'Cache-Control': 'private, max-age=3600'
    }
  });
};

const updateResourceShowSource = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues =
    await utils.Schema.ARTIFACT_UPDATE_RESOURCE_SHOW_SOURCE.parseAsync({
      ...body,
      resourceId: c.req.param('resourceId'),
      projectId: c.req.param('projectId'),
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId')
    });

  const dbInstance = db.create(c);

  const [currentArtifactByProject] = await dbInstance
    .select()
    .from(db.schema.artifact)
    .where(eq(db.schema.artifact.projectId, currentValues.projectId))
    .limit(1);

  if (!currentArtifactByProject) {
    throw new Error('Artifact not found for the project');
  }

  const [updated] = await dbInstance
    .update(db.schema.artifactResource)
    .set({ showSource: currentValues.showSource })
    .where(
      and(
        eq(db.schema.artifactResource.id, currentValues.resourceId),
        eq(db.schema.artifactResource.artifactId, currentArtifactByProject.id)
      )
    )
    .returning();

  if (!updated) {
    throw new Error('Resource not found');
  }

  return c.json(updated);
};

// The sync root a request names, scoped to the project's artifact. Throws for
// a resource that has nothing to sync from (an upload, a page under a site, a
// file inside an imported folder), so neither route below can act on one.
const loadSyncRoot = async (
  dbInstance: ReturnType<typeof db.create>,
  projectId: string,
  resourceId: string
) => {
  const [row] = await dbInstance
    .select({
      resource: db.schema.artifactResource,
      organizationId: db.schema.project.organizationId
    })
    .from(db.schema.artifactResource)
    .innerJoin(
      db.schema.artifact,
      eq(db.schema.artifact.id, db.schema.artifactResource.artifactId)
    )
    .innerJoin(
      db.schema.project,
      eq(db.schema.project.id, db.schema.artifact.projectId)
    )
    .where(
      and(
        eq(db.schema.artifactResource.id, resourceId),
        eq(db.schema.artifact.projectId, projectId)
      )
    )
    .limit(1);

  if (!row) {
    throw new Error('Resource not found');
  }
  if (!utils.isSyncableResource(row.resource)) {
    throw new Error('This resource has nothing to sync from');
  }
  return row;
};

// How often a synced source refreshes on its own. `off` is open to every plan;
// an interval has to be one the organization's plan includes.
const updateResourceSyncInterval = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues =
    await utils.Schema.ARTIFACT_UPDATE_RESOURCE_SYNC_INTERVAL.parseAsync({
      ...body,
      resourceId: c.req.param('resourceId'),
      projectId: c.req.param('projectId'),
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId')
    });

  const dbInstance = db.create(c);
  const { resource, organizationId } = await loadSyncRoot(
    dbInstance,
    currentValues.projectId,
    currentValues.resourceId
  );

  // The plan of the organization that owns the project, never the one named
  // in the URL: access is checked on the project, not on that pairing.
  Plan.assertAutoSyncAllowed(
    await Plan.getEffectivePlan(dbInstance, organizationId),
    currentValues.syncInterval
  );

  const [updated] = await dbInstance
    .update(db.schema.artifactResource)
    .set({ syncInterval: currentValues.syncInterval })
    .where(eq(db.schema.artifactResource.id, resource.id))
    .returning();

  return c.json(updated);
};

// Sync a source now: a website re-crawls, a folder is walked again, a file is
// fetched again. Open to every plan, with a short cooldown, because a website
// sync re-crawls every page of the site.
const syncResource = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.ARTIFACT_SYNC_RESOURCE.parseAsync({
    resourceId: c.req.param('resourceId'),
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const dbInstance = db.create(c);
  const { resource } = await loadSyncRoot(
    dbInstance,
    currentValues.projectId,
    currentValues.resourceId
  );

  // The checks are made by the UPDATE that claims the sync, so two requests
  // landing together can't both pass them. The row read above only words the
  // refusal. A source PENDING for too long is stuck, not syncing, and syncing
  // it again is how it recovers.
  const claimedAt = await claimManualResourceSync(dbInstance, resource.id);
  if (!claimedAt) {
    const startedAt = resource.syncStartedAt?.getTime() ?? 0;
    if (
      !utils.isResourceSyncInProgress(resource) &&
      Date.now() - startedAt < utils.constants.RESOURCE_SYNC_MANUAL_COOLDOWN_MS
    ) {
      throw new Error(
        'This source was synced a moment ago. Try again in a few minutes.'
      );
    }
    // Syncing — or another request claimed it a moment ago.
    throw new Error('This source is already syncing');
  }

  try {
    await enqueueResourceSync(c.env, resource, { scheduled: false });
  } catch (error) {
    await releaseManualResourceSync(dbInstance, resource, claimedAt).catch(
      () => undefined
    );
    throw error;
  }

  return c.json({ resourceId: resource.id, status: 'queued' });
};

const get = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.ARTIFACT_GET.parseAsync({
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const dbInstance = db.create(c);

  const [row] = await dbInstance
    .select({
      id: db.schema.artifact.id,
      slug: db.schema.artifact.slug,
      projectId: db.schema.artifact.projectId,
      artifactPromptCount: db.schema.artifact.artifactPromptCount,
      artifactResourceCount: db.schema.artifact.artifactResourceCount,
      // Summed live from the resource rows — the denormalized
      // artifactResourceTotalSize column is never maintained (always 0).
      artifactResourceTotalSize: sql<number>`coalesce((select sum(${db.schema.artifactResource.size}) from ${db.schema.artifactResource} where ${db.schema.artifactResource.artifactId} = ${db.schema.artifact.id}), 0)::bigint`,
      artifactToolCount: db.schema.artifact.artifactToolCount,
      artifactCredentialCount: db.schema.artifact.artifactCredentialCount,
      channelCount: db.schema.artifact.channelCount,
      createdAt: db.schema.artifact.createdAt,
      updatedAt: db.schema.artifact.updatedAt
    })
    .from(db.schema.artifact)
    .where(eq(db.schema.artifact.projectId, currentValues.projectId))
    .limit(1);

  if (!row) {
    throw new Error('Artifact not found for the project');
  }

  return c.json(row);
};

const updateSlug = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues = await utils.Schema.ARTIFACT_UPDATE_SLUG.parseAsync({
    ...body,
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const dbInstance = db.create(c);

  const [currentArtifactByProject] = await dbInstance
    .select()
    .from(db.schema.artifact)
    .where(eq(db.schema.artifact.projectId, currentValues.projectId))
    .limit(1);

  if (!currentArtifactByProject) {
    throw new Error('Artifact not found for the project');
  }

  if (currentArtifactByProject.slug === currentValues.slug) {
    return c.json(currentArtifactByProject);
  }

  try {
    const [updated] = await dbInstance
      .update(db.schema.artifact)
      .set({ slug: currentValues.slug })
      .where(eq(db.schema.artifact.id, currentArtifactByProject.id))
      .returning();

    return c.json(updated);
  } catch (error: any) {
    if (error?.code === '23505') {
      throw new Error('Slug already in use');
    }
    throw error;
  }
};

export const ArtifactController = {
  createPrompt,
  updatePrompt,
  removePrompt,
  listPrompts,
  createResource,
  updateResource,
  removeResource,
  pickResources,
  resourceDataLinks,
  listResources,
  getResource,
  uploadResourceFile,
  downloadResourceFile,
  updateResourceShowSource,
  updateResourceSyncInterval,
  syncResource,
  createTool,
  updateTool,
  setToolEnabled,
  removeTool,
  listTools,
  previewMcpProxy,
  startMcpProxyOauth,
  createCustomCodeVersion,
  uploadCustomCodeBundle,
  uploadCustomCodeSnapshot,
  publishCustomCodeVersion,
  rollbackCustomCodeVersion,
  listCustomCodeVersions,
  listCustomCodeLogs,
  getCustomCodeVersionSource,
  testCustomCodeVersion,
  listConnections,
  removeCredential,
  listCredentials,
  createCredential,
  get,
  updateSlug
};
