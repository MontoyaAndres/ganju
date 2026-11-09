import { Context } from 'hono';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import type { McpProxyDiscoveredTool } from '@ganju/utils';
import { db } from '@ganju/db';

import { buildArtifactConnections } from './connections';
import * as customCodeActions from './customCodeActions';
import {
  resolveCustomCodeTool,
  readCustomCodeConfig,
  validateCustomCodeConfig,
  loadVersionForTool,
  snapshotSourceKey,
  deleteCustomCodeSecrets
} from './customCode';
import {
  enqueueIndex,
  enqueueCrawlDiscover,
  validateCalcomApiKey,
  validateTavilyApiKey,
  discoverRemoteMcpTools,
  refreshArtifactCredential,
  beginMcpProxyOauth,
  resolveMcpProxyOauthSecret,
  readStoredMcpOauth,
  syncTelegramCommandsForArtifact,
  syncDiscordCommandsForArtifact,
  deleteCustomCodeScript,
  claimManualResourceSync,
  releaseManualResourceSync,
  enqueueResourceSync,
  Plan
} from '../../utils';
import { updateFileLinks, clearedLinks, fileLinksFor } from '../../utils/dataDatabase';

// types
import { AppEnv } from '../../types';
import type { ReadableStream as WorkersReadableStream } from '@cloudflare/workers-types';

const validateHttpEndpointConfig = (
  config: unknown
): Record<string, unknown> => {
  const parsed = utils.Schema.HTTP_ENDPOINT_CONFIG_WRITE.safeParse(
    config ?? {}
  );
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message || 'Invalid HTTP endpoint configuration'
    );
  }
  return parsed.data as Record<string, unknown>;
};

const validateMcpProxyConfig = (config: unknown) => {
  const parsed = utils.Schema.MCP_PROXY_CONFIG.safeParse(config ?? {});
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message || 'Invalid MCP proxy configuration'
    );
  }
  return parsed.data;
};

// Resolve an mcp-proxy config against the curated catalog (rejecting unknown/
// unverified servers — arbitrary URLs are deferred) and connect to the remote
// MCP server once to list everything it exposes. Shared by the write-path and
// the preview endpoint. Makes a network call, so callers run it BEFORE any DB
// transaction (same pattern as createCredential's key validation).
const discoverMcpProxy = async (
  c: Context<AppEnv>,
  dbInstance: ReturnType<typeof db.create>,
  artifactId: string,
  rawConfig: unknown
) => {
  const config = validateMcpProxyConfig(rawConfig);

  const [server] = await dbInstance
    .select()
    .from(db.schema.mcpServerCatalog)
    .where(eq(db.schema.mcpServerCatalog.id, config.curatedServerId))
    .limit(1);

  if (!server || !server.verified) {
    throw new Error(
      'Unknown or unverified MCP server. Pick one from the catalog.'
    );
  }

  const prefix = config.prefix || server.slug;

  // Resolve auth into a single header to inject on the remote connection.
  let authHeader: { name: string; value: string } | null = null;
  if (config.auth.kind !== utils.constants.MCP_PROXY_AUTH_KIND_NONE) {
    const [credential] = await dbInstance
      .select()
      .from(db.schema.artifactCredential)
      .where(
        and(
          eq(db.schema.artifactCredential.id, config.auth.credentialId),
          eq(db.schema.artifactCredential.artifactId, artifactId)
        )
      )
      .limit(1);
    if (!credential) {
      throw new Error(
        'The selected credential was not found for this artifact.'
      );
    }

    // Guard the credential type: bearer/header use a per-tool mcp-proxy secret;
    // oauth binds an MCP-OAuth connection (token issued by the MCP server, kept
    // on metadata.mcpOauth). This stops a config from pointing, say, a raw
    // bearer at an unrelated Gmail token, or oauth at a per-tool secret.
    if (config.auth.kind === utils.constants.MCP_PROXY_AUTH_KIND_OAUTH) {
      if (!readStoredMcpOauth(credential.metadata)) {
        throw new Error(
          'The selected credential is not an MCP OAuth connection.'
        );
      }
      // Decrypt (refreshing the MCP token in place) so discovery never connects
      // with a stale token; surface a clear message if it needs reconnecting.
      const { secret, needsReauth } = await resolveMcpProxyOauthSecret({
        c,
        dbInstance,
        credential
      });
      if (needsReauth || !secret) {
        throw new Error(
          `The credential for "${server.name}" needs to be reconnected. Reconnect it and try again.`
        );
      }
      authHeader = { name: 'Authorization', value: `Bearer ${secret}` };
    } else {
      if (
        credential.provider !== utils.constants.CREDENTIAL_PROVIDER_MCP_PROXY
      ) {
        throw new Error('The selected credential is not an MCP server secret.');
      }
      // Per-tool secrets have no refresh; decrypt as-is.
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
      authHeader =
        config.auth.kind === utils.constants.MCP_PROXY_AUTH_KIND_HEADER
          ? { name: config.auth.name, value: secret }
          : { name: 'Authorization', value: `Bearer ${secret}` };
    }
  }

  const discovery = await discoverRemoteMcpTools({
    url: server.url,
    transport: server.transport,
    authHeader,
    timeoutMs: config.timeoutMs,
    maxItems: utils.constants.MCP_PROXY_MAX_TOOLS
  });

  // Drop any remote tool whose name can't be safely surfaced (bad charset, or
  // the `<prefix>__<name>` composite exceeds the tool-name limit) so the UI
  // never offers — and the boot loop never attempts — a tool it can't register.
  const safeTools = discovery.tools.filter(
    t => utils.buildProxyToolName(prefix, t.name) !== null
  );
  if (safeTools.length !== discovery.tools.length) {
    console.warn(
      `mcp-proxy ${server.slug}: dropped ${
        discovery.tools.length - safeTools.length
      } tool(s) with unsafe names`
    );
  }

  return {
    server,
    config,
    prefix,
    discovery: { ...discovery, tools: safeTools }
  };
};

// Build the persisted config + metadata for an mcp-proxy install. The FULL
// discovered set is stored on metadata.discovery (so the UI can render
// enable/disable toggles without re-hitting the remote); the enabled subset
// lives in config's allow-lists. Returns the curated server id for the FK
// column too.
const buildMcpProxyToolData = async (
  c: Context<AppEnv>,
  dbInstance: ReturnType<typeof db.create>,
  artifactId: string,
  rawConfig: unknown,
  clientMetadata: Record<string, unknown> | null
): Promise<{
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
  mcpServerCatalogId: string;
}> => {
  const { server, config, prefix, discovery } = await discoverMcpProxy(
    c,
    dbInstance,
    artifactId,
    rawConfig
  );

  if (discovery.tools.length === 0) {
    throw new Error(
      'The remote MCP server returned no tools. Check the credential and try again.'
    );
  }

  return {
    config: {
      ...config,
      url: server.url,
      transport: server.transport,
      prefix
    } as Record<string, unknown>,
    metadata: {
      ...(clientMetadata || {}),
      discovery: {
        discoveredAt: new Date().toISOString(),
        serverInfo: discovery.serverInfo,
        tools: discovery.tools,
        resources: discovery.resources,
        prompts: discovery.prompts
      }
    },
    mcpServerCatalogId: server.id
  };
};

const createPrompt = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues = await utils.Schema.ARTIFACT_CREATE_PROMPT.parseAsync({
    ...body,
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  utils.validateMessageVariables(currentValues.messages, currentValues.schema);

  const dbInstance = db.create(c);

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

    const newSlug = utils.slugifyTitle(currentValues.title);
    if (newSlug) {
      const siblings = await tx
        .select({ title: db.schema.artifactPrompt.title })
        .from(db.schema.artifactPrompt)
        .where(
          eq(db.schema.artifactPrompt.artifactId, currentArtifactByProject.id)
        );
      if (siblings.some(p => utils.slugifyTitle(p.title) === newSlug)) {
        throw new Error('A prompt with this command name already exists');
      }
    }

    Plan.assertPromptQuota(
      await Plan.getEffectivePlan(tx, currentValues.organizationId),
      currentArtifactByProject.artifactPromptCount
    );

    const artifactPrompt = await tx
      .insert(db.schema.artifactPrompt)
      .values({
        title: currentValues.title,
        description: currentValues.description || null,
        messages: currentValues.messages,
        schema: currentValues.schema,
        artifactId: currentArtifactByProject.id
      })
      .returning();

    await tx
      .update(db.schema.artifact)
      .set({
        artifactPromptCount: sql`(${db.schema.artifact.artifactPromptCount}::int + 1)::int`
      })
      .where(eq(db.schema.artifact.id, currentArtifactByProject.id));

    return artifactPrompt[0];
  });

  // A new prompt is a new slash command; refresh the Telegram command menu.
  await syncTelegramCommandsForArtifact(c, dbInstance, result.artifactId);
  await syncDiscordCommandsForArtifact(c, dbInstance, result.artifactId);

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

  utils.validateMessageVariables(currentValues.messages, currentValues.schema);

  const dbInstance = db.create(c);

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

    const newSlug = utils.slugifyTitle(currentValues.title);
    if (newSlug) {
      const siblings = await tx
        .select({
          id: db.schema.artifactPrompt.id,
          title: db.schema.artifactPrompt.title
        })
        .from(db.schema.artifactPrompt)
        .where(
          eq(db.schema.artifactPrompt.artifactId, currentArtifactByProject.id)
        );
      if (
        siblings.some(
          p =>
            p.id !== currentValues.promptId &&
            utils.slugifyTitle(p.title) === newSlug
        )
      ) {
        throw new Error('A prompt with this command name already exists');
      }
    }

    const artifactPrompt = await tx
      .update(db.schema.artifactPrompt)
      .set({
        title: currentValues.title,
        description: currentValues.description || null,
        messages: currentValues.messages,
        schema: currentValues.schema
      })
      .where(
        and(
          eq(db.schema.artifactPrompt.id, currentValues.promptId),
          eq(db.schema.artifactPrompt.artifactId, currentArtifactByProject.id)
        )
      )
      .returning();

    if (!artifactPrompt[0]) {
      throw new Error('Prompt not found');
    }

    return artifactPrompt[0];
  });

  // Title/description may have changed; refresh the Telegram command menu.
  await syncTelegramCommandsForArtifact(c, dbInstance, result.artifactId);
  await syncDiscordCommandsForArtifact(c, dbInstance, result.artifactId);

  return c.json(result);
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

  const dbInstance = db.create(c);

  const artifactId = await dbInstance.transaction(async tx => {
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

    const deletePrompt = await tx
      .delete(db.schema.artifactPrompt)
      .where(
        and(
          eq(db.schema.artifactPrompt.id, currentValues.promptId),
          eq(db.schema.artifactPrompt.artifactId, currentArtifactByProject.id)
        )
      )
      .returning();

    if (deletePrompt.length === 0) {
      throw new Error('Prompt not found');
    }

    await tx
      .update(db.schema.artifact)
      .set({
        artifactPromptCount: sql`(${db.schema.artifact.artifactPromptCount}::int - 1)::int`
      })
      .where(eq(db.schema.artifact.id, currentArtifactByProject.id));

    return currentArtifactByProject.id;
  });

  // The removed prompt's slash command should drop out of the Telegram menu.
  await syncTelegramCommandsForArtifact(c, dbInstance, artifactId);
  await syncDiscordCommandsForArtifact(c, dbInstance, artifactId);

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

  const isWebsite =
    body?.sourceType === utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE;

  const dbInstance = db.create(c);

  const result = await dbInstance.transaction(async tx => {
    const [project] = await tx
      .select()
      .from(db.schema.project)
      .where(
        and(
          eq(db.schema.project.id, projectId),
          eq(db.schema.project.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!project) {
      throw new Error('Project not found');
    }

    const [currentArtifactByProject] = await tx
      .select()
      .from(db.schema.artifact)
      .where(eq(db.schema.artifact.projectId, projectId))
      .limit(1);

    if (!currentArtifactByProject) {
      throw new Error('Artifact not found for the project');
    }

    // Block new content once the org is already at its embedded-content (RAG)
    // cap. The byte size of THIS resource isn't known until indexing, so this
    // is a "you're full" gate, not a byte-exact one.
    await Plan.assertEmbeddedStorageQuota(tx, organizationId);

    if (isWebsite) {
      const websiteValues =
        await utils.Schema.ARTIFACT_CREATE_WEBSITE.parseAsync({
          ...body,
          projectId,
          userId,
          organizationId
        });

      const [conflicting] = await tx
        .select()
        .from(db.schema.artifactResource)
        .where(
          and(
            eq(
              db.schema.artifactResource.artifactId,
              currentArtifactByProject.id
            ),
            eq(db.schema.artifactResource.uri, websiteValues.uri)
          )
        )
        .limit(1);

      if (conflicting) {
        throw new Error('Resource URI must be unique');
      }

      const [created] = await tx
        .insert(db.schema.artifactResource)
        .values({
          title: websiteValues.title,
          uri: websiteValues.uri,
          type: utils.constants.RESOURCE_TYPE_STATIC,
          sourceType: utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE,
          status: utils.constants.STATUS_PENDING,
          description: websiteValues.description ?? null,
          mimeType: utils.constants.MIMETYPE_TEXT,
          crawlConfig: websiteValues.crawlConfig,
          artifactId: currentArtifactByProject.id
        })
        .returning();

      await tx
        .update(db.schema.artifact)
        .set({
          artifactResourceCount: sql`(${db.schema.artifact.artifactResourceCount}::int + 1)::int`
        })
        .where(eq(db.schema.artifact.id, currentArtifactByProject.id));

      return created;
    }

    const fileValues = await utils.Schema.ARTIFACT_CREATE_RESOURCE.parseAsync({
      ...body,
      projectId,
      userId,
      organizationId
    });

    // Raw file storage has a known size up front, so enforce it byte-exact.
    await Plan.assertRawStorageQuota(tx, organizationId, fileValues.size ?? 0);

    const [conflicting] = await tx
      .select()
      .from(db.schema.artifactResource)
      .where(
        and(
          eq(
            db.schema.artifactResource.artifactId,
            currentArtifactByProject.id
          ),
          eq(db.schema.artifactResource.uri, fileValues.uri)
        )
      )
      .limit(1);

    if (conflicting) {
      throw new Error('Resource URI must be unique');
    }

    const [created] = await tx
      .insert(db.schema.artifactResource)
      .values({
        title: fileValues.title,
        uri: fileValues.uri,
        type: fileValues.type,
        sourceType: fileValues.sourceType,
        status: utils.constants.STATUS_PENDING,
        description: fileValues.description ?? null,
        mimeType: fileValues.mimeType,
        content: fileValues.content ?? null,
        size: fileValues.size ?? null,
        encoding: fileValues.encoding ?? null,
        fileKey: fileValues.fileKey ?? null,
        fileName: fileValues.fileName ?? null,
        annotations: fileValues.annotations ?? null,
        icons: fileValues.icons ?? null,
        metadata: fileValues.metadata ?? null,
        crawlConfig: fileValues.crawlConfig ?? null,
        artifactId: currentArtifactByProject.id
      })
      .returning();

    await tx
      .update(db.schema.artifact)
      .set({
        artifactResourceCount: sql`(${db.schema.artifact.artifactResourceCount}::int + 1)::int`
      })
      .where(eq(db.schema.artifact.id, currentArtifactByProject.id));

    return created;
  });

  if (isWebsite) {
    await enqueueCrawlDiscover(c.env, result.id);
  } else if (!utils.skipsIndexing(result.metadata)) {
    await enqueueIndex(c.env, result.id);
  }

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

  const dbInstance = db.create(c);

  const { result, isWebsite, previousUri, skipIndex } = await dbInstance.transaction(async tx => {
    const [project] = await tx
      .select()
      .from(db.schema.project)
      .where(
        and(
          eq(db.schema.project.id, projectId),
          eq(db.schema.project.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!project) {
      throw new Error('Project not found');
    }

    const [currentArtifactByProject] = await tx
      .select()
      .from(db.schema.artifact)
      .where(eq(db.schema.artifact.projectId, projectId))
      .limit(1);

    if (!currentArtifactByProject) {
      throw new Error('Artifact not found for the project');
    }

    const [existing] = await tx
      .select()
      .from(db.schema.artifactResource)
      .where(
        and(
          eq(db.schema.artifactResource.id, resourceId),
          eq(db.schema.artifactResource.artifactId, currentArtifactByProject.id)
        )
      )
      .limit(1);

    if (!existing) {
      throw new Error('Resource not found');
    }

    if (existing.sourceType === utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE) {
      const websiteValues =
        await utils.Schema.ARTIFACT_UPDATE_WEBSITE.parseAsync({
          ...body,
          resourceId,
          projectId,
          userId,
          organizationId
        });

      const [updated] = await tx
        .update(db.schema.artifactResource)
        .set({
          title: websiteValues.title,
          description: websiteValues.description ?? null
        })
        .where(eq(db.schema.artifactResource.id, resourceId))
        .returning();

      return {
        result: updated,
        isWebsite: true,
        previousUri: null,
        skipIndex: false
      };
    }

    const fileValues = await utils.Schema.ARTIFACT_UPDATE_RESOURCE.parseAsync({
      ...body,
      resourceId,
      projectId,
      userId,
      organizationId
    });

    const [conflicting] = await tx
      .select()
      .from(db.schema.artifactResource)
      .where(
        and(
          eq(
            db.schema.artifactResource.artifactId,
            currentArtifactByProject.id
          ),
          eq(db.schema.artifactResource.uri, fileValues.uri),
          sql`${db.schema.artifactResource.id} <> ${resourceId}`
        )
      )
      .limit(1);

    if (conflicting) {
      throw new Error('Resource URI must be unique');
    }

    // An upload from Data stays one when its form sends other metadata.
    const attachment = utils.dataAttachmentOf(existing.metadata);
    if (fileValues.metadata !== undefined && attachment) {
      fileValues.metadata = { ...fileValues.metadata, dataAttachment: attachment };
    }
    const skipIndex = utils.skipsIndexing(fileValues.metadata ?? existing.metadata);

    const [updated] = await tx
      .update(db.schema.artifactResource)
      .set({
        title: fileValues.title,
        uri: fileValues.uri,
        type: fileValues.type,
        sourceType: fileValues.sourceType,
        status: skipIndex
          ? utils.constants.STATUS_COMPLETED
          : utils.constants.STATUS_PENDING,
        description: fileValues.description || null,
        mimeType: fileValues.mimeType,
        content: fileValues.content || null,
        size: fileValues.size ?? null,
        encoding: fileValues.encoding || null,
        annotations: fileValues.annotations || null,
        icons: fileValues.icons || null,
        ...(fileValues.fileKey !== undefined && {
          fileKey: fileValues.fileKey
        }),
        ...(fileValues.fileName !== undefined && {
          fileName: fileValues.fileName
        }),
        ...(fileValues.metadata !== undefined && {
          metadata: fileValues.metadata
        })
      })
      .where(
        and(
          eq(db.schema.artifactResource.id, resourceId),
          eq(db.schema.artifactResource.artifactId, currentArtifactByProject.id)
        )
      )
      .returning();

    if (!updated) {
      throw new Error('Resource not found');
    }

    return {
      result: updated,
      isWebsite: false,
      previousUri: existing.uri,
      skipIndex
    };
  });

  if (!isWebsite && !skipIndex) {
    await enqueueIndex(c.env, result.id);
  }
  // Rows that linked the old uri follow the item.
  if (previousUri && previousUri !== result.uri) {
    await updateFileLinks(dbInstance, c.env.PROJECT_DATABASE, result.artifactId, [
      { from: previousUri, to: result.uri }
    ]);
  }

  return c.json(result);
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

  const dbInstance = db.create(c);
  const fileKeysToDelete: string[] = [];
  const deletedUris: string[] = [];
  let artifactId: string | null = null;

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

    const [seed] = await tx
      .select({
        id: db.schema.artifactResource.id,
        uri: db.schema.artifactResource.uri,
        fileKey: db.schema.artifactResource.fileKey,
        parentResourceId: db.schema.artifactResource.parentResourceId
      })
      .from(db.schema.artifactResource)
      .where(
        and(
          eq(db.schema.artifactResource.id, currentValues.resourceId),
          eq(db.schema.artifactResource.artifactId, currentArtifactByProject.id)
        )
      )
      .limit(1);

    if (!seed) {
      throw new Error('Resource not found');
    }

    if (seed.fileKey) fileKeysToDelete.push(seed.fileKey);
    artifactId = currentArtifactByProject.id;
    deletedUris.push(seed.uri);

    const allIds = new Set<string>([seed.id]);
    let frontier: string[] = [seed.id];
    while (frontier.length > 0) {
      const children = await tx
        .select({
          id: db.schema.artifactResource.id,
          uri: db.schema.artifactResource.uri,
          fileKey: db.schema.artifactResource.fileKey
        })
        .from(db.schema.artifactResource)
        .where(inArray(db.schema.artifactResource.parentResourceId, frontier));

      const nextFrontier: string[] = [];
      for (const child of children) {
        if (allIds.has(child.id)) continue;
        allIds.add(child.id);
        nextFrontier.push(child.id);
        deletedUris.push(child.uri);
        if (child.fileKey) fileKeysToDelete.push(child.fileKey);
      }
      frontier = nextFrontier;
    }

    // Embedded bytes about to be freed (chunks cascade-delete with the
    // resources), so we can keep the artifact's embedded-size total in step.
    const [{ freedBytes }] = await tx
      .select({
        freedBytes: sql<number>`coalesce(sum(octet_length(${db.schema.artifactResourceChunk.content})), 0)::bigint`
      })
      .from(db.schema.artifactResourceChunk)
      .where(
        inArray(db.schema.artifactResourceChunk.resourceId, Array.from(allIds))
      );

    await tx
      .delete(db.schema.artifactResource)
      .where(eq(db.schema.artifactResource.id, seed.id));

    await tx
      .update(db.schema.artifact)
      .set({
        artifactResourceCount: sql`GREATEST(${db.schema.artifact.artifactResourceCount}::int - ${allIds.size}, 0)`,
        artifactResourceEmbeddedSize: sql`GREATEST(${db.schema.artifact.artifactResourceEmbeddedSize}::bigint - ${Number(freedBytes)}, 0)`
      })
      .where(eq(db.schema.artifact.id, currentArtifactByProject.id));

    if (seed.parentResourceId) {
      await tx
        .update(db.schema.artifactResource)
        .set({
          childResourceCount: sql`GREATEST(${db.schema.artifactResource.childResourceCount}::int - 1, 0)`
        })
        .where(eq(db.schema.artifactResource.id, seed.parentResourceId));
    }
  });

  if (fileKeysToDelete.length > 0 && c.env.STORAGE_BUCKET) {
    for (const key of fileKeysToDelete) {
      try {
        await c.env.STORAGE_BUCKET.delete(key);
      } catch {
        // best-effort
      }
    }
  }

  if (artifactId) {
    await updateFileLinks(
      dbInstance,
      c.env.PROJECT_DATABASE,
      artifactId,
      clearedLinks(deletedUris)
    );
  }

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

  const dbInstance = db.create(c);

  // mcp-proxy discovery is a network round-trip (connect remote + listTools),
  // so resolve it BEFORE the transaction (same pattern as createCredential's
  // key validation). For other definitions this stays null.
  let proxyData: {
    config: Record<string, unknown>;
    metadata: Record<string, unknown>;
    mcpServerCatalogId: string;
  } | null = null;
  {
    if (
      currentValues.toolKey === utils.constants.TOOL_DEFINITION_KEY_MCP_PROXY
    ) {
      const [artifactRow] = await dbInstance
        .select({ id: db.schema.artifact.id })
        .from(db.schema.artifact)
        .where(eq(db.schema.artifact.projectId, currentValues.projectId))
        .limit(1);
      if (!artifactRow) {
        throw new Error('Artifact not found for the project');
      }
      proxyData = await buildMcpProxyToolData(
        c,
        dbInstance,
        artifactRow.id,
        currentValues.config,
        currentValues.metadata || null
      );
    }
  }

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

    // Locked: the tool count below is read and then grown, and two installs
    // racing past the same count would both fit under the limit.
    const [currentArtifactByProject] = await tx
      .select()
      .from(db.schema.artifact)
      .where(eq(db.schema.artifact.projectId, currentValues.projectId))
      .limit(1)
      .for('update');

    if (!currentArtifactByProject) {
      throw new Error('Artifact not found for the project');
    }

    // The catalog is code, so this is a lookup and not a query. Still checked:
    // an unknown key would install a row the MCP boot loop can never resolve,
    // which is a tool that exists in the dashboard and never registers.
    if (!utils.isToolKey(currentValues.toolKey)) {
      throw new Error(
        `Tool "${currentValues.toolKey}" not found in the catalog`
      );
    }

    // http-endpoint config is user-authored and drives an outbound request at
    // runtime, so re-validate (and normalize/default) it server-side rather
    // than trusting the client. mcp-proxy was resolved + discovered above. The
    // MCP boot loop also skips malformed rows, but rejecting here keeps the
    // stored config canonical.
    const resolvedConfig = proxyData
      ? proxyData.config
      : currentValues.toolKey ===
          utils.constants.TOOL_DEFINITION_KEY_HTTP_ENDPOINT
        ? validateHttpEndpointConfig(currentValues.config)
        : currentValues.toolKey ===
            utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE
          ? validateCustomCodeConfig(currentValues.config, null)
          : currentValues.config || null;

    const plan = await Plan.getEffectivePlan(tx, currentValues.organizationId);
    Plan.assertToolQuota(
      plan,
      await Plan.countArtifactTools(tx, currentArtifactByProject.id),
      await Plan.countInstallToolsIn(tx, {
        toolKey: currentValues.toolKey,
        config: resolvedConfig,
        metadata: proxyData?.metadata ?? null
      })
    );

    // Two definitions carry their own plan rule on top of the tool quota:
    // custom-code is paid-only, and http-endpoint is capped per artifact so the
    // free tier's escape hatch can't grow into an unbounded tool list.
    if (
      currentValues.toolKey === utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE
    ) {
      Plan.assertCustomCodeAllowed(plan);
    }

    if (
      currentValues.toolKey ===
      utils.constants.TOOL_DEFINITION_KEY_HTTP_ENDPOINT
    ) {
      const [{ count: endpointCount }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(db.schema.artifactTool)
        .where(
          and(
            eq(db.schema.artifactTool.artifactId, currentArtifactByProject.id),
            eq(
              db.schema.artifactTool.toolKey,
              utils.constants.TOOL_DEFINITION_KEY_HTTP_ENDPOINT
            )
          )
        );
      // Counts rows, not enabled rows: unlike the tool quota, this bounds how
      // many endpoint DEFINITIONS one artifact holds. Disabling one leaves the
      // definition behind, so letting that free a slot would make the cap
      // unbounded by toggling.
      Plan.assertHttpEndpointQuota(plan, endpointCount);
    }

    const artifactTool = await tx
      .insert(db.schema.artifactTool)
      .values({
        toolKey: currentValues.toolKey,
        config: resolvedConfig,
        metadata: proxyData
          ? proxyData.metadata
          : currentValues.metadata || null,
        mcpServerCatalogId: proxyData ? proxyData.mcpServerCatalogId : null,
        artifactId: currentArtifactByProject.id
      })
      .returning();

    await tx
      .update(db.schema.artifact)
      .set({
        artifactToolCount: sql`(${db.schema.artifact.artifactToolCount}::int + 1)::int`
      })
      .where(eq(db.schema.artifact.id, currentArtifactByProject.id));

    return artifactTool[0];
  });

  // An mcp-proxy install can enable proxied prompts (slash commands); refresh
  // the Telegram menu. Other tool kinds don't affect prompts.
  if (proxyData) {
    await syncTelegramCommandsForArtifact(c, dbInstance, result.artifactId);
    await syncDiscordCommandsForArtifact(c, dbInstance, result.artifactId);
  }

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

  const dbInstance = db.create(c);

  // Re-discovery for mcp-proxy is a network round-trip; resolve it before the
  // transaction (same as createTool). An update re-runs discovery so a changed
  // credential / allowed-tools list refreshes the stored tool schemas.
  let proxyData: {
    config: Record<string, unknown>;
    metadata: Record<string, unknown>;
    mcpServerCatalogId: string;
  } | null = null;
  {
    const [artifactRow] = await dbInstance
      .select({ id: db.schema.artifact.id })
      .from(db.schema.artifact)
      .where(eq(db.schema.artifact.projectId, currentValues.projectId))
      .limit(1);
    if (artifactRow) {
      const [existing] = await dbInstance
        .select({
          key: db.schema.artifactTool.toolKey,
          config: db.schema.artifactTool.config
        })
        .from(db.schema.artifactTool)
        .where(
          and(
            eq(db.schema.artifactTool.id, currentValues.toolId),
            eq(db.schema.artifactTool.artifactId, artifactRow.id)
          )
        )
        .limit(1);
      if (existing?.key === utils.constants.TOOL_DEFINITION_KEY_MCP_PROXY) {
        proxyData = await buildMcpProxyToolData(
          c,
          dbInstance,
          artifactRow.id,
          // The owner's trust marks survive a save that doesn't mention them.
          utils.keepProxiedToolMarks(existing.config, currentValues.config),
          currentValues.metadata || null
        );
      }
    }
  }

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

    // Locked: the tool count below is read and then grown, and two installs
    // racing past the same count would both fit under the limit.
    const [currentArtifactByProject] = await tx
      .select()
      .from(db.schema.artifact)
      .where(eq(db.schema.artifact.projectId, currentValues.projectId))
      .limit(1)
      .for('update');

    if (!currentArtifactByProject) {
      throw new Error('Artifact not found for the project');
    }

    // Resolve the definition key so http-endpoint configs are re-validated and
    // normalized server-side (same reasoning as createTool). mcp-proxy was
    // resolved + re-discovered above.
    const [existing] = await tx
      .select({
        key: db.schema.artifactTool.toolKey,
        config: db.schema.artifactTool.config,
        metadata: db.schema.artifactTool.metadata,
        enabled: db.schema.artifactTool.enabled
      })
      .from(db.schema.artifactTool)
      .where(
        and(
          eq(db.schema.artifactTool.id, currentValues.toolId),
          eq(db.schema.artifactTool.artifactId, currentArtifactByProject.id)
        )
      )
      .limit(1);

    if (!existing) {
      throw new Error('Tool not found');
    }

    const resolvedConfig = proxyData
      ? proxyData.config
      : existing.key === utils.constants.TOOL_DEFINITION_KEY_HTTP_ENDPOINT
        ? validateHttpEndpointConfig(currentValues.config)
        : existing.key === utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE
          ? validateCustomCodeConfig(
              currentValues.config,
              readCustomCodeConfig(existing).activeVersionId ?? null
            )
          : currentValues.config || null;

    // An enabled install that now allows more tools — an MCP server's remote
    // tools, a script's functions — grows the count like a new install would.
    // Allowing fewer is always accepted, so a project over its limit can still
    // trim one.
    if (existing.enabled) {
      const before = await Plan.countInstallToolsIn(tx, {
        toolKey: existing.key,
        config: existing.config,
        metadata: existing.metadata
      });
      const after = await Plan.countInstallToolsIn(tx, {
        toolKey: existing.key,
        config: resolvedConfig,
        metadata: proxyData ? proxyData.metadata : existing.metadata
      });
      if (after > before) {
        Plan.assertToolQuota(
          await Plan.getEffectivePlan(tx, currentValues.organizationId),
          await Plan.countArtifactTools(
            tx,
            currentArtifactByProject.id,
            currentValues.toolId
          ),
          after
        );
      }
    }

    const artifactTool = await tx
      .update(db.schema.artifactTool)
      .set({
        config: resolvedConfig,
        metadata: proxyData
          ? proxyData.metadata
          : currentValues.metadata || null,
        ...(proxyData
          ? { mcpServerCatalogId: proxyData.mcpServerCatalogId }
          : {})
      })
      .where(
        and(
          eq(db.schema.artifactTool.id, currentValues.toolId),
          eq(db.schema.artifactTool.artifactId, currentArtifactByProject.id)
        )
      )
      .returning();

    if (!artifactTool[0]) {
      throw new Error('Tool not found');
    }

    return artifactTool[0];
  });

  // An mcp-proxy update may change which proxied prompts are enabled; refresh
  // the Telegram menu so slash-command autocomplete tracks the new set.
  if (proxyData) {
    await syncTelegramCommandsForArtifact(c, dbInstance, result.artifactId);
    await syncDiscordCommandsForArtifact(c, dbInstance, result.artifactId);
  }

  return c.json(result);
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

  const dbInstance = db.create(c);

  const updated = await dbInstance.transaction(async tx => {
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

    // Locked: the tool count below is read and then grown, and two installs
    // racing past the same count would both fit under the limit.
    const [currentArtifactByProject] = await tx
      .select()
      .from(db.schema.artifact)
      .where(eq(db.schema.artifact.projectId, currentValues.projectId))
      .limit(1)
      .for('update');

    if (!currentArtifactByProject) {
      throw new Error('Artifact not found for the project');
    }

    const [tool] = await tx
      .select()
      .from(db.schema.artifactTool)
      .where(
        and(
          eq(db.schema.artifactTool.id, currentValues.toolId),
          eq(db.schema.artifactTool.artifactId, currentArtifactByProject.id)
        )
      )
      .limit(1);

    if (!tool) {
      throw new Error('Tool not found');
    }

    // Idempotent: asking for the state a tool is already in is not an error,
    // and must not move the counter. Two tabs open on the same page is the
    // ordinary way this happens.
    if (tool.enabled === currentValues.enabled) {
      return tool;
    }

    if (currentValues.enabled) {
      Plan.assertToolQuota(
        await Plan.getEffectivePlan(tx, currentValues.organizationId),
        await Plan.countArtifactTools(tx, currentArtifactByProject.id),
        await Plan.countInstallToolsIn(tx, tool)
      );
    }

    const [row] = await tx
      .update(db.schema.artifactTool)
      .set({ enabled: currentValues.enabled })
      .where(eq(db.schema.artifactTool.id, tool.id))
      .returning();

    await tx
      .update(db.schema.artifact)
      .set({
        artifactToolCount: currentValues.enabled
          ? sql`(${db.schema.artifact.artifactToolCount}::int + 1)::int`
          : sql`greatest((${db.schema.artifact.artifactToolCount}::int - 1), 0)::int`
      })
      .where(eq(db.schema.artifact.id, currentArtifactByProject.id));

    return row;
  });

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

  const dbInstance = db.create(c);

  const removal = await dbInstance.transaction(async tx => {
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

    // Read before the delete takes the version rows with it. Each version
    // records the name its bundle was uploaded to, and those are the only
    // record of what this tool put in the namespace — a name is minted per
    // upload, so there is nothing to derive afterwards. The sweep would collect
    // them within the hour regardless; this is the eager half.
    const deployedScriptNames = (
      await tx
        .select({ scriptName: db.schema.artifactToolVersion.scriptName })
        .from(db.schema.artifactToolVersion)
        .where(
          eq(db.schema.artifactToolVersion.artifactToolId, currentValues.toolId)
        )
    )
      .map(row => row.scriptName)
      .filter((name): name is string => !!name);

    const deleteTool = await tx
      .delete(db.schema.artifactTool)
      .where(
        and(
          eq(db.schema.artifactTool.id, currentValues.toolId),
          eq(db.schema.artifactTool.artifactId, currentArtifactByProject.id)
        )
      )
      .returning();

    if (deleteTool.length === 0) {
      throw new Error('Tool not found');
    }

    // Only an enabled row was ever counted, so only an enabled row gives its
    // slot back. greatest() because this is a denormalized total and a delete
    // must never be the thing that drives it negative.
    if (deleteTool[0].enabled) {
      await tx
        .update(db.schema.artifact)
        .set({
          artifactToolCount: sql`greatest((${db.schema.artifact.artifactToolCount}::int - 1), 0)::int`
        })
        .where(eq(db.schema.artifact.id, currentArtifactByProject.id));
    }

    // http-endpoint and mcp-proxy tools own the credential referenced by id from
    // their auth config. Removing the tool would orphan it, so delete it too —
    // but only when no other tool on the artifact still references it, and only
    // when it's a credential the install actually owns (never a shared native
    // OAuth/api-key credential). Two owned kinds: a per-tool bearer/header
    // secret (provider in PER_TOOL_CREDENTIAL_PROVIDERS), and an MCP-OAuth
    // connection (provider = catalog slug, identified by metadata.mcpOauth).
    const removedConfig = deleteTool[0].config as {
      auth?: { credentialId?: string };
    } | null;
    const credentialId = removedConfig?.auth?.credentialId;

    if (credentialId) {
      const remainingTools = await tx
        .select({ config: db.schema.artifactTool.config })
        .from(db.schema.artifactTool)
        .where(
          eq(db.schema.artifactTool.artifactId, currentArtifactByProject.id)
        );

      const stillReferenced = remainingTools.some(t => {
        const cfg = t.config as { auth?: { credentialId?: string } } | null;
        return cfg?.auth?.credentialId === credentialId;
      });

      if (!stillReferenced) {
        const [cred] = await tx
          .select()
          .from(db.schema.artifactCredential)
          .where(
            and(
              eq(db.schema.artifactCredential.id, credentialId),
              eq(
                db.schema.artifactCredential.artifactId,
                currentArtifactByProject.id
              )
            )
          )
          .limit(1);

        const deletable =
          !!cred &&
          ((
            utils.constants.PER_TOOL_CREDENTIAL_PROVIDERS as readonly string[]
          ).includes(cred.provider) ||
            !!readStoredMcpOauth(cred.metadata));

        if (deletable) {
          await tx
            .delete(db.schema.artifactCredential)
            .where(eq(db.schema.artifactCredential.id, cred.id));
          await tx
            .update(db.schema.artifact)
            .set({
              artifactCredentialCount: sql`(${db.schema.artifact.artifactCredentialCount}::int - 1)::int`
            })
            .where(eq(db.schema.artifact.id, currentArtifactByProject.id));
        }
      }
    }

    // custom-code secrets are addressed by label from inside the script rather
    // than by id from config, so the credentialId path above never sees them.
    // Its versions go with the row via the FK cascade; the secrets need this.
    const removedKey = deleteTool[0].toolKey;

    if (removedKey === utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE) {
      const removedSecrets = await deleteCustomCodeSecrets(
        tx,
        currentArtifactByProject.id
      );
      if (removedSecrets > 0) {
        await tx
          .update(db.schema.artifact)
          .set({
            artifactCredentialCount: sql`greatest((${db.schema.artifact.artifactCredentialCount}::int - ${removedSecrets}), 0)::int`
          })
          .where(eq(db.schema.artifact.id, currentArtifactByProject.id));
      }
    }

    // Only mcp-proxy installs set the catalog FK, so it doubles as a cheap "was
    // this a proxy?" flag — used to decide whether proxied prompts changed.
    return {
      artifactId: currentArtifactByProject.id,
      wasProxy: deleteTool[0].mcpServerCatalogId != null,
      wasCustomCode:
        removedKey === utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE,
      deployedScriptNames
    };
  });

  // Deployed scripts outlive the row unless they are deleted explicitly — the
  // dispatch namespace knows nothing about our database. Done after the
  // transaction commits (a network call has no business inside one) and
  // best-effort: the row is already gone, so failing the request here would
  // leave the user unable to retry, with nothing left to retry against. An
  // orphaned script is inert — nothing dispatches to it — and costs $0.02/mo,
  // and the sweep collects whatever this misses.
  //
  // Plural now, and one per published version rather than one per artifact.
  const { artifactId, wasProxy, wasCustomCode, deployedScriptNames } = removal;

  if (wasCustomCode) {
    // The legacy derived name is tried alongside the recorded ones: a version
    // published before script names were recorded has none, and its bundle
    // really is sitting under `artifact_<id>`.
    const names = new Set([
      ...deployedScriptNames,
      utils.customCodeScriptName(artifactId)
    ]);

    for (const name of names) {
      try {
        await deleteCustomCodeScript(c, name);
      } catch (error) {
        console.error(
          `Failed to remove the deployed custom-code script ${name} for artifact ${artifactId}`,
          error
        );
      }
    }
  }

  // Removing an mcp-proxy install drops its proxied prompts; refresh the menu.
  if (wasProxy) {
    await syncTelegramCommandsForArtifact(c, dbInstance, artifactId);
    await syncDiscordCommandsForArtifact(c, dbInstance, artifactId);
  }

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
