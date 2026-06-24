import { Context } from 'hono';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';

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
  Plan
} from '../../utils';

// types
import { AppEnv } from '../../types';
import type { ReadableStream as WorkersReadableStream } from '@cloudflare/workers-types';

const validateHttpEndpointConfig = (
  config: unknown
): Record<string, unknown> => {
  const parsed = utils.Schema.HTTP_ENDPOINT_CONFIG.safeParse(config ?? {});
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
    const [toolDef] = await dbInstance
      .select({ key: db.schema.toolDefinition.key })
      .from(db.schema.toolDefinition)
      .where(eq(db.schema.toolDefinition.id, currentValues.toolDefinitionId))
      .limit(1);
    if (toolDef?.key === utils.constants.TOOL_DEFINITION_KEY_MCP_PROXY) {
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

    const [toolDef] = await tx
      .select()
      .from(db.schema.toolDefinition)
      .where(eq(db.schema.toolDefinition.id, currentValues.toolDefinitionId))
      .limit(1);

    if (!toolDef) {
      throw new Error('Tool definition not found');
    }

    // http-endpoint config is user-authored and drives an outbound request at
    // runtime, so re-validate (and normalize/default) it server-side rather
    // than trusting the client. mcp-proxy was resolved + discovered above. The
    // MCP boot loop also skips malformed rows, but rejecting here keeps the
    // stored config canonical.
    const resolvedConfig = proxyData
      ? proxyData.config
      : toolDef.key === utils.constants.TOOL_DEFINITION_KEY_HTTP_ENDPOINT
        ? validateHttpEndpointConfig(currentValues.config)
        : currentValues.config || null;

    Plan.assertToolQuota(
      await Plan.getEffectivePlan(tx, currentValues.organizationId),
      currentArtifactByProject.artifactToolCount
    );

    const artifactTool = await tx
      .insert(db.schema.artifactTool)
      .values({
        toolDefinitionId: currentValues.toolDefinitionId,
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
        .select({ key: db.schema.toolDefinition.key })
        .from(db.schema.artifactTool)
        .innerJoin(
          db.schema.toolDefinition,
          eq(
            db.schema.artifactTool.toolDefinitionId,
            db.schema.toolDefinition.id
          )
        )
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
      .select({ key: db.schema.toolDefinition.key })
      .from(db.schema.artifactTool)
      .innerJoin(
        db.schema.toolDefinition,
        eq(db.schema.artifactTool.toolDefinitionId, db.schema.toolDefinition.id)
      )
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

const listTools = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.ARTIFACT_GET_TOOL.parseAsync({
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const dbInstance = db.create(c);

  const artifact = await dbInstance.query.artifact.findFirst({
    where: eq(db.schema.artifact.projectId, currentValues.projectId),
    with: {
      artifactTools: {
        with: {
          toolDefinition: {
            with: {
              group: true
            }
          }
        }
      }
    }
  });

  if (!artifact) {
    throw new Error('Artifact not found for the project');
  }

  return c.json(artifact.artifactTools);
};

const removeTool = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.ARTIFACT_REMOVE_TOOL.parseAsync({
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId'),
    toolId: c.req.param('toolId')
  });

  const dbInstance = db.create(c);

  const { artifactId, wasProxy } = await dbInstance.transaction(async tx => {
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

    await tx
      .update(db.schema.artifact)
      .set({
        artifactToolCount: sql`(${db.schema.artifact.artifactToolCount}::int - 1)::int`
      })
      .where(eq(db.schema.artifact.id, currentArtifactByProject.id));

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

    // Only mcp-proxy installs set the catalog FK, so it doubles as a cheap "was
    // this a proxy?" flag — used to decide whether proxied prompts changed.
    return {
      artifactId: currentArtifactByProject.id,
      wasProxy: deleteTool[0].mcpServerCatalogId != null
    };
  });

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
      artifactResourceTotalSize: db.schema.artifact.artifactResourceTotalSize,
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
  removeTool,
  listTools,
  previewMcpProxy,
  startMcpProxyOauth,
  removeCredential,
  listCredentials,
  createCredential,
  get,
  updateSlug
};
