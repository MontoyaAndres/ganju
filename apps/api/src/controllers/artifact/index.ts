import { Context } from 'hono';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import type { JsonSchema } from '@ganju/utils';
import { db } from '@ganju/db';

import { buildArtifactConnections } from './connections';
import {
  resolveCustomCodeTool,
  resolveCustomCodeToolReadOnly,
  readCustomCodeConfig,
  validateCustomCodeConfig,
  validateCustomCodeManifest,
  nextVersionNumber,
  loadVersionForTool,
  bundleSourceKey,
  hashBundle,
  activateVersion,
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
  deployCustomCodeScript,
  smokeTestCustomCodeScript,
  invokeCustomCodeScript,
  deleteCustomCodeScript,
  customCodeScriptExists,
  Plan
} from '../../utils';

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
  } else {
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

  const { result, isWebsite } = await dbInstance.transaction(async tx => {
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

      return { result: updated, isWebsite: true };
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

    const [updated] = await tx
      .update(db.schema.artifactResource)
      .set({
        title: fileValues.title,
        uri: fileValues.uri,
        type: fileValues.type,
        sourceType: fileValues.sourceType,
        status: utils.constants.STATUS_PENDING,
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

    return { result: updated, isWebsite: false };
  });

  if (!isWebsite) {
    await enqueueIndex(c.env, result.id);
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

    const allIds = new Set<string>([seed.id]);
    let frontier: string[] = [seed.id];
    while (frontier.length > 0) {
      const children = await tx
        .select({
          id: db.schema.artifactResource.id,
          fileKey: db.schema.artifactResource.fileKey
        })
        .from(db.schema.artifactResource)
        .where(inArray(db.schema.artifactResource.parentResourceId, frontier));

      const nextFrontier: string[] = [];
      for (const child of children) {
        if (allIds.has(child.id)) continue;
        allIds.add(child.id);
        nextFrontier.push(child.id);
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

  return c.json(currentValues);
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

    const [currentArtifactByProject] = await tx
      .select()
      .from(db.schema.artifact)
      .where(eq(db.schema.artifact.projectId, currentValues.projectId))
      .limit(1);

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
    Plan.assertToolQuota(plan, currentArtifactByProject.artifactToolCount);

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
        .select({ key: db.schema.artifactTool.toolKey })
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
          currentValues.config,
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

    const [currentArtifactByProject] = await tx
      .select()
      .from(db.schema.artifact)
      .where(eq(db.schema.artifact.projectId, currentValues.projectId))
      .limit(1);

    if (!currentArtifactByProject) {
      throw new Error('Artifact not found for the project');
    }

    // Resolve the definition key so http-endpoint configs are re-validated and
    // normalized server-side (same reasoning as createTool). mcp-proxy was
    // resolved + re-discovered above.
    const [existing] = await tx
      .select({
        key: db.schema.artifactTool.toolKey,
        config: db.schema.artifactTool.config
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

  const dbInstance = db.create(c);

  const result = await dbInstance.transaction(async tx => {
    const { tool } = await resolveCustomCodeTool(
      tx,
      currentValues.organizationId,
      currentValues.projectId
    );

    const { limits } = await Plan.getEffectivePlan(
      tx,
      currentValues.organizationId
    );
    validateCustomCodeManifest(currentValues.manifest, limits);

    // Config edits (allowedHosts, connections, timeoutMs) ride along with a new
    // version rather than getting their own endpoint — they describe how the
    // uploaded code is allowed to run, so they belong to the same review as the
    // code. activeVersionId is never taken from the client; only publish and
    // rollback move it.
    if (currentValues.config) {
      await tx
        .update(db.schema.artifactTool)
        .set({
          config: {
            ...currentValues.config,
            activeVersionId: readCustomCodeConfig(tool).activeVersionId ?? null
          }
        })
        .where(eq(db.schema.artifactTool.id, tool.id));
    }

    const [version] = await tx
      .insert(db.schema.artifactToolVersion)
      .values({
        artifactToolId: tool.id,
        version: await nextVersionNumber(tx, tool.id),
        status: utils.constants.CUSTOM_CODE_VERSION_STATUS_DRAFT,
        tools: currentValues.manifest.tools,
        createdByUserId: currentValues.userId
      })
      .returning();

    return version;
  });

  return c.json(result);
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
  if (bundle.byteLength === 0) {
    throw new Error('Request body is required');
  }
  if (bundle.byteLength > utils.constants.CUSTOM_CODE_MAX_BUNDLE_BYTES) {
    throw new Error(`Bundle exceeds the ${bundleLimitMb}MB limit`);
  }

  // An editor upload is a project — an envelope of files, one module each. It is
  // validated here rather than at deploy time because a path the runtime refuses
  // should stop at the request that wrote it, not surface as a failed publish
  // days later. A CLI bundle decodes to null and passes through untouched.
  if (
    currentValues.sourceKind === utils.constants.CUSTOM_CODE_SOURCE_KIND_EDITOR
  ) {
    const files = utils.decodeProject(new TextDecoder().decode(bundle));
    if (files) utils.validateProjectFiles(files);
  }

  const sourceHash = await hashBundle(bundle);
  const dbInstance = db.create(c);
  const bucket = c.env.STORAGE_BUCKET;

  const result = await dbInstance.transaction(async tx => {
    const { artifact, tool } = await resolveCustomCodeTool(
      tx,
      currentValues.organizationId,
      currentValues.projectId
    );

    const version = await loadVersionForTool(
      tx,
      tool.id,
      currentValues.versionId
    );

    // A published version is what the MCP server is serving right now; swapping
    // its bundle would change behaviour with no version history and nothing to
    // roll back to. Upload a new draft instead.
    if (version.status !== utils.constants.CUSTOM_CODE_VERSION_STATUS_DRAFT) {
      throw new Error(
        'A bundle must be uploaded to a draft; this version is already published. Create a new version instead.'
      );
    }

    const key = bundleSourceKey(
      currentValues.organizationId,
      currentValues.projectId,
      artifact.id,
      version.version
    );

    if (bucket) {
      await bucket.put(key, bundle, {
        httpMetadata: { contentType: 'application/javascript' }
      });
    }

    const [updated] = await tx
      .update(db.schema.artifactToolVersion)
      .set({
        sourceKey: key,
        sourceHash,
        sourceKind: currentValues.sourceKind,
        error: null
      })
      .where(eq(db.schema.artifactToolVersion.id, version.id))
      .returning();

    return updated;
  });

  return c.json(result);
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

  const dbInstance = db.create(c);

  const { tool } = await resolveCustomCodeToolReadOnly(
    dbInstance,
    currentValues.organizationId,
    currentValues.projectId
  );

  if (!tool) {
    throw new Error('Version not found');
  }

  const version = await loadVersionForTool(
    dbInstance,
    tool.id,
    currentValues.versionId
  );

  const editable =
    version.sourceKind === utils.constants.CUSTOM_CODE_SOURCE_KIND_EDITOR;

  const bucket = c.env.STORAGE_BUCKET;
  const object =
    version.sourceKey && bucket ? await bucket.get(version.sourceKey) : null;
  const stored = object ? await object.text() : null;

  // Two shapes, one endpoint. `files` is what the explorer renders; `source`
  // stays the main module's text, because that is what a single-file version has
  // always been and what a CLI bundle still is.
  const files = stored ? utils.decodeProject(stored) : null;
  const main = utils.constants.CUSTOM_CODE_MAIN_MODULE;

  return c.json({
    versionId: version.id,
    version: version.version,
    status: version.status,
    sourceKind: version.sourceKind,
    editable,
    files: files ?? (stored === null ? null : { [main]: stored }),
    source: files ? (files[main] ?? null) : stored,
    tools: version.tools
  });
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

  const dbInstance = db.create(c);

  const { artifact, tool } = await resolveCustomCodeToolReadOnly(
    dbInstance,
    currentValues.organizationId,
    currentValues.projectId
  );

  if (!tool) {
    throw new Error('Version not found');
  }

  Plan.assertCustomCodeAllowed(
    await Plan.getEffectivePlan(dbInstance, currentValues.organizationId)
  );

  const version = await loadVersionForTool(
    dbInstance,
    tool.id,
    currentValues.versionId
  );

  const entry = (
    version.tools as Array<{
      name: string;
      inputSchema?: unknown;
      outputSchema?: unknown;
    }>
  ).find(candidate => candidate.name === currentValues.tool);

  if (!entry) {
    throw new Error(
      `This version does not declare a tool named "${currentValues.tool}".`
    );
  }

  // Checked before anything is deployed. An input the schema refuses is an input
  // an MCP client would never have sent, so running it would answer a question
  // nobody asked — and it costs a deploy to find out.
  const inputViolations = utils.validateAgainstJsonSchema(
    (entry.inputSchema as JsonSchema) ?? {
      type: 'object',
      properties: {}
    },
    currentValues.input
  );

  if (inputViolations.length > 0) {
    return c.json({
      ran: false,
      inputViolations,
      logs: [],
      durationMs: 0
    });
  }

  if (!version.sourceKey) {
    throw new Error('This version has no code to run yet.');
  }

  const bucket = c.env.STORAGE_BUCKET;
  const object = bucket ? await bucket.get(version.sourceKey) : null;
  if (!object) {
    throw new Error(
      'The code for this version is no longer in storage, so it cannot be run. Upload it again.'
    );
  }

  const config = readCustomCodeConfig(tool);

  // Its own name, minted for this run. Every test used to deploy over one
  // preview script, which is the sharpest form of the reuse problem: a test
  // could report the run before it, and "my edit did nothing" is the worst
  // possible answer from the one tool whose whole job is to say what an edit
  // does. Nothing stores this — it is minted, used, and deleted below.
  const deployed = await deployCustomCodeScript(c, {
    artifactId: artifact.id,
    versionId: version.id,
    bundle: await object.arrayBuffer(),
    preview: true
  });

  // Inside the try, so the preview script is removed whether the run happens or
  // the checks below throw first. A preview script left behind by the path that
  // failed early is the same leak as one left behind by a failed delete.
  try {
    await smokeTestCustomCodeScript(c, {
      artifactId: artifact.id,
      scriptName: deployed.scriptName,
      edition: deployed.edition,
      declaredTools: [currentValues.tool],
      allowedHosts: config.allowedHosts ?? []
    });

    const run = await invokeCustomCodeScript(c, {
      artifactId: artifact.id,
      scriptName: deployed.scriptName,
      toolName: currentValues.tool,
      args: currentValues.input,
      allowedHosts: config.allowedHosts ?? [],
      timeoutMs: Math.min(
        config.timeoutMs,
        utils.constants.CUSTOM_CODE_TEST_TIMEOUT_MS
      )
    });

    // A declared outputSchema is a promise to the MCP client, and one the boot
    // loop turns into a protocol-level requirement: a tool that declares one and
    // returns something else becomes an error for the whole call. Surfacing that
    // here is most of the reason to declare an output schema at all.
    const outputViolations =
      !run.error && entry.outputSchema
        ? utils.validateAgainstJsonSchema(
            entry.outputSchema as JsonSchema,
            run.output
          )
        : [];

    return c.json({ ran: true, ...run, inputViolations: [], outputViolations });
  } finally {
    // Best effort, and the token's expiry is the backstop: a preview script left
    // behind by a failed delete stops being able to reach the broker on its own.
    try {
      await deleteCustomCodeScript(c, deployed.scriptName);
    } catch (error) {
      console.error('Could not remove the preview script', error);
    }
  }
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

  const dbInstance = db.create(c);

  // Read, deploy, then commit — in three steps rather than one transaction,
  // because the deploy is a multi-second round trip to Cloudflare and a
  // transaction held open across it would pin a Hyperdrive connection for the
  // duration. The ordering is what matters for correctness: `activeVersionId`
  // moves only after the script is live and has answered a health check, so
  // there is never a window where MCP clients are offered tools that nothing can
  // serve.
  const { artifact, tool } = await resolveCustomCodeToolReadOnly(
    dbInstance,
    currentValues.organizationId,
    currentValues.projectId
  );

  if (!tool) {
    throw new Error('No custom code is installed on this artifact.');
  }

  // Read-only resolution, so unlike the create and upload paths this one does
  // not carry the plan check with it — and these two are the endpoints that
  // most literally deploy code. An org that installed on a paid plan and then
  // downgraded keeps its row, its versions and their bundles, so without this
  // it could go on publishing and rolling back indefinitely.
  Plan.assertCustomCodeAllowed(
    await Plan.getEffectivePlan(dbInstance, currentValues.organizationId)
  );

  const version = await loadVersionForTool(
    dbInstance,
    tool.id,
    currentValues.versionId
  );

  // Activating a version with no bundle would advertise its tools to every
  // MCP client while there is nothing to dispatch to.
  if (!version.sourceKey) {
    throw new Error(
      'A bundle is required before this version can be published.'
    );
  }

  if (requirePreviouslyPublished && !version.publishedAt) {
    throw new Error(
      'A previously published version is required to roll back; this one is still a draft, so publish it instead.'
    );
  }

  // Rolling back to a version whose script is still deployed is a pointer move
  // and nothing else. Each upload owns its own name now, so the bundle that
  // version ran is still sitting where it was left — there is nothing to build,
  // nothing to upload, and no propagation to wait on.
  //
  // Only while the sweep has not collected it, which is why this is a question
  // rather than an assumption. A version old enough to have lost its script
  // falls through to the deploy below and is re-uploaded under the name it
  // already owns.
  if (version.scriptName) {
    const stillDeployed = await customCodeScriptExists(c, version.scriptName);

    if (stillDeployed) {
      const moved = await dbInstance.transaction(async tx =>
        activateVersion(tx, tool, version)
      );

      return c.json(moved);
    }
  }

  const bucket = c.env.STORAGE_BUCKET;
  const object = bucket ? await bucket.get(version.sourceKey) : null;
  if (!object) {
    throw new Error(
      'The bundle for this version is no longer in storage, so it cannot be published. Upload it again.'
    );
  }

  // Every failure from here on is recorded on the version before it is
  // rethrown. `error` is the column the dashboard reads, and a publish that
  // fails with nothing written there is a version the user can only debug from
  // our logs.
  //
  // Nothing is put back on failure, and nothing needs to be. The upload goes to
  // a name of its own, so whatever was live is still live and still pointed at;
  // a rejected bundle is a script nothing dispatches to, which the sweep
  // collects. That is the whole of what one script name per artifact used to
  // cost: a typo in a tool name took down tools that were working, and the
  // restore that fixed it was undoing damage this no longer does.
  let deployed;
  try {
    deployed = await deployCustomCodeScript(c, {
      artifactId: artifact.id,
      versionId: version.id,
      bundle: await object.arrayBuffer(),
      // A version that has been deployed before keeps its name. Only reachable
      // from the rollback path above, where the script was found to be gone —
      // a publish always arrives here with `scriptName` null.
      ...(version.scriptName ? { scriptName: version.scriptName } : {})
    });

    await smokeTestCustomCodeScript(c, {
      artifactId: artifact.id,
      scriptName: deployed.scriptName,
      edition: deployed.edition,
      declaredTools: (version.tools as Array<{ name: string }>).map(
        entry => entry.name
      ),
      allowedHosts: readCustomCodeConfig(tool).allowedHosts ?? []
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await dbInstance
      .update(db.schema.artifactToolVersion)
      .set({ error: message })
      .where(eq(db.schema.artifactToolVersion.id, version.id));

    throw error;
  }

  const result = await dbInstance.transaction(async tx =>
    activateVersion(tx, tool, {
      ...version,
      scriptTag: deployed.scriptTag,
      scriptName: deployed.scriptName
    })
  );

  return c.json(result);
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

  const dbInstance = db.create(c);

  // Read-only, so this doesn't install the tool row the way the write paths do:
  // an artifact with no custom code has no versions, which is not an error.
  const { tool } = await resolveCustomCodeToolReadOnly(
    dbInstance,
    currentValues.organizationId,
    currentValues.projectId
  );

  if (!tool) {
    return c.json({ activeVersionId: null, versions: [] });
  }

  const versions = await dbInstance
    .select()
    .from(db.schema.artifactToolVersion)
    .where(eq(db.schema.artifactToolVersion.artifactToolId, tool.id))
    .orderBy(desc(db.schema.artifactToolVersion.version));

  return c.json({
    activeVersionId: readCustomCodeConfig(tool).activeVersionId ?? null,
    versions
  });
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

  const dbInstance = db.create(c);

  const { tool } = await resolveCustomCodeToolReadOnly(
    dbInstance,
    currentValues.organizationId,
    currentValues.projectId
  );

  // An artifact with no custom code has no invocations, which is not an error —
  // the same reason listCustomCodeVersions answers empty rather than throwing.
  if (!tool) {
    return c.json({ entries: [] });
  }

  const rows = await dbInstance
    .select({
      id: db.schema.mcpRequest.id,
      toolName: db.schema.mcpRequest.toolName,
      latencyMs: db.schema.mcpRequest.latencyMs,
      errorMessage: db.schema.mcpRequest.errorMessage,
      output: db.schema.mcpRequest.output,
      createdAt: db.schema.mcpRequest.createdAt
    })
    .from(db.schema.mcpRequest)
    .innerJoin(
      db.schema.mcpSession,
      eq(db.schema.mcpRequest.sessionId, db.schema.mcpSession.id)
    )
    .where(
      and(
        eq(db.schema.mcpRequest.artifactToolId, tool.id),
        eq(db.schema.mcpSession.artifactId, tool.artifactId),
        ...(currentValues.tool
          ? [eq(db.schema.mcpRequest.toolName, currentValues.tool)]
          : []),
        ...(currentValues.before
          ? [lt(db.schema.mcpRequest.createdAt, currentValues.before)]
          : [])
      )
    )
    .orderBy(desc(db.schema.mcpRequest.createdAt))
    .limit(currentValues.limit);

  // `logs` is written onto the recorded output alongside the tool's own result;
  // lift it out so a reader gets the lines without having to know that.
  return c.json({
    entries: rows.map(({ output, ...rest }) => {
      const shaped = output as { logs?: unknown } | null;
      const logs =
        shaped && Array.isArray(shaped.logs)
          ? shaped.logs.filter(
              (line): line is string => typeof line === 'string'
            )
          : [];
      return { ...rest, logs };
    })
  });
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
 * quota measures: `artifactToolCount` tracks ENABLED tools, because "7 tools on
 * Free" means seven tools your server exposes, not seven rows you once created.
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

    const [currentArtifactByProject] = await tx
      .select()
      .from(db.schema.artifact)
      .where(eq(db.schema.artifact.projectId, currentValues.projectId))
      .limit(1);

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
        currentArtifactByProject.artifactToolCount
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

    return artifactResource[0];
  });

  await enqueueIndex(c.env, result.id);

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
  listResources,
  getResource,
  uploadResourceFile,
  downloadResourceFile,
  updateResourceShowSource,
  createTool,
  updateTool,
  setToolEnabled,
  removeTool,
  listTools,
  previewMcpProxy,
  startMcpProxyOauth,
  createCustomCodeVersion,
  uploadCustomCodeBundle,
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
