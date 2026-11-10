import { and, eq, inArray, sql } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';
import type { Database } from '@ganju/db';

import {
  readCustomCodeConfig,
  validateCustomCodeConfig,
  deleteCustomCodeSecrets
} from './customCode';
import {
  enqueueIndex,
  enqueueCrawlDiscover,
  discoverRemoteMcpTools,
  refreshArtifactCredential,
  resolveMcpProxyOauthSecret,
  readStoredMcpOauth,
  syncTelegramCommandsForArtifact,
  syncDiscordCommandsForArtifact,
  deleteCustomCodeScript,
  Plan
} from '../../utils';
import { updateFileLinks, clearedLinks } from '../../utils/dataDatabase';

import type { Bindings } from '../../types';

// What the routes and the builder share for prompts, resources and tools.
// Updates return the row as it was before the write, read in the same
// transaction, so a caller can put it back.
export interface ProjectCaller {
  env: Bindings;
  db: Database;
  // Unused for now: every follow-up step is awaited, as the routes always did.
  waitUntil?: (p: Promise<unknown>) => void;
}

type Parsed<S extends { parseAsync: (...args: never[]) => Promise<unknown> }> =
  Awaited<ReturnType<S['parseAsync']>>;

export type CreatePromptValues = Parsed<
  typeof utils.Schema.ARTIFACT_CREATE_PROMPT
>;
export type UpdatePromptValues = Parsed<
  typeof utils.Schema.ARTIFACT_UPDATE_PROMPT
>;
export type RemovePromptValues = Parsed<
  typeof utils.Schema.ARTIFACT_REMOVE_PROMPT
>;
export type RemoveResourceValues = Parsed<
  typeof utils.Schema.ARTIFACT_REMOVE_RESOURCE
>;
export type CreateToolValues = Parsed<typeof utils.Schema.ARTIFACT_CREATE_TOOL>;
export type UpdateToolValues = Parsed<typeof utils.Schema.ARTIFACT_UPDATE_TOOL>;
export type SetToolEnabledValues = Parsed<
  typeof utils.Schema.ARTIFACT_SET_TOOL_ENABLED
>;
export type RemoveToolValues = Parsed<typeof utils.Schema.ARTIFACT_REMOVE_TOOL>;

// Resources take the raw body: which schema applies depends on the body's
// sourceType on create and on the stored row's on update, and it is parsed
// after the project checks, as the route always did.
export interface CreateResourceInput {
  organizationId: string;
  projectId: string;
  userId: string;
  body: Record<string, unknown> | null;
}

export interface UpdateResourceInput extends CreateResourceInput {
  resourceId: string;
}

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
export const discoverMcpProxy = async (
  caller: { env: Bindings },
  dbInstance: Database,
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
        c: caller,
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
        caller,
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
  caller: { env: Bindings },
  dbInstance: Database,
  artifactId: string,
  rawConfig: unknown,
  clientMetadata: Record<string, unknown> | null
): Promise<{
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
  mcpServerCatalogId: string;
}> => {
  const { server, config, prefix, discovery } = await discoverMcpProxy(
    caller,
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

const syncSlashCommands = async (caller: ProjectCaller, artifactId: string) => {
  await syncTelegramCommandsForArtifact(caller, caller.db, artifactId);
  await syncDiscordCommandsForArtifact(caller, caller.db, artifactId);
};

export const createPrompt = async (
  caller: ProjectCaller,
  currentValues: CreatePromptValues
) => {
  utils.validateMessageVariables(currentValues.messages, currentValues.schema);

  const dbInstance = caller.db;

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
  await syncSlashCommands(caller, result.artifactId);

  return result;
};

export const updatePrompt = async (
  caller: ProjectCaller,
  currentValues: UpdatePromptValues
) => {
  utils.validateMessageVariables(currentValues.messages, currentValues.schema);

  const dbInstance = caller.db;

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

    const promptScope = and(
      eq(db.schema.artifactPrompt.id, currentValues.promptId),
      eq(db.schema.artifactPrompt.artifactId, currentArtifactByProject.id)
    );

    const [previous] = await tx
      .select()
      .from(db.schema.artifactPrompt)
      .where(promptScope)
      .limit(1);

    const artifactPrompt = await tx
      .update(db.schema.artifactPrompt)
      .set({
        title: currentValues.title,
        description: currentValues.description || null,
        messages: currentValues.messages,
        schema: currentValues.schema
      })
      .where(promptScope)
      .returning();

    if (!artifactPrompt[0]) {
      throw new Error('Prompt not found');
    }

    return { previous, prompt: artifactPrompt[0] };
  });

  // Title/description may have changed; refresh the Telegram command menu.
  await syncSlashCommands(caller, result.prompt.artifactId);

  return result;
};

export const removePrompt = async (
  caller: ProjectCaller,
  currentValues: RemovePromptValues
) => {
  const dbInstance = caller.db;

  const removed = await dbInstance.transaction(async tx => {
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

    return deletePrompt[0];
  });

  // The removed prompt's slash command should drop out of the Telegram menu.
  await syncSlashCommands(caller, removed.artifactId);

  return removed;
};

export const createResource = async (
  caller: ProjectCaller,
  input: CreateResourceInput
) => {
  const { body, projectId, organizationId, userId } = input;

  const isWebsite =
    body?.sourceType === utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE;

  const dbInstance = caller.db;

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
    await enqueueCrawlDiscover(caller.env, result.id);
  } else if (!utils.skipsIndexing(result.metadata)) {
    await enqueueIndex(caller.env, result.id);
  }

  return result;
};

export const updateResource = async (
  caller: ProjectCaller,
  input: UpdateResourceInput
) => {
  const { body, projectId, organizationId, resourceId, userId } = input;

  const dbInstance = caller.db;

  const { previous, result, isWebsite, skipIndex } =
    await dbInstance.transaction(async tx => {
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
            eq(
              db.schema.artifactResource.artifactId,
              currentArtifactByProject.id
            )
          )
        )
        .limit(1);

      if (!existing) {
        throw new Error('Resource not found');
      }

      if (
        existing.sourceType === utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE
      ) {
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
          previous: existing,
          result: updated,
          isWebsite: true,
          skipIndex: false
        };
      }

      const fileValues = await utils.Schema.ARTIFACT_UPDATE_RESOURCE.parseAsync(
        {
          ...body,
          resourceId,
          projectId,
          userId,
          organizationId
        }
      );

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
        fileValues.metadata = {
          ...fileValues.metadata,
          dataAttachment: attachment
        };
      }
      const skipIndex = utils.skipsIndexing(
        fileValues.metadata ?? existing.metadata
      );

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
            eq(
              db.schema.artifactResource.artifactId,
              currentArtifactByProject.id
            )
          )
        )
        .returning();

      if (!updated) {
        throw new Error('Resource not found');
      }

      return {
        previous: existing,
        result: updated,
        isWebsite: false,
        skipIndex
      };
    });

  if (!isWebsite && !skipIndex) {
    await enqueueIndex(caller.env, result.id);
  }
  // Rows that linked the old uri follow the item.
  if (!isWebsite && previous.uri && previous.uri !== result.uri) {
    await updateFileLinks(
      dbInstance,
      caller.env.PROJECT_DATABASE,
      result.artifactId,
      [{ from: previous.uri, to: result.uri }]
    );
  }

  return { previous, resource: result };
};

export const removeResource = async (
  caller: ProjectCaller,
  currentValues: RemoveResourceValues
) => {
  const dbInstance = caller.db;
  const fileKeysToDelete: string[] = [];
  const deletedUris: string[] = [];

  const removed = await dbInstance.transaction(async tx => {
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
      .select()
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

    return { resource: seed, removedResourceIds: Array.from(allIds) };
  });

  if (fileKeysToDelete.length > 0 && caller.env.STORAGE_BUCKET) {
    for (const key of fileKeysToDelete) {
      try {
        await caller.env.STORAGE_BUCKET.delete(key);
      } catch {
        // best-effort
      }
    }
  }

  await updateFileLinks(
    dbInstance,
    caller.env.PROJECT_DATABASE,
    removed.resource.artifactId,
    clearedLinks(deletedUris)
  );

  return {
    ...removed,
    deletedFileKeys: fileKeysToDelete,
    clearedUris: deletedUris
  };
};

type McpProxyToolData = {
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
  mcpServerCatalogId: string;
};

export const createTool = async (
  caller: ProjectCaller,
  currentValues: CreateToolValues
) => {
  const dbInstance = caller.db;

  // mcp-proxy discovery is a network round-trip (connect remote + listTools),
  // so resolve it BEFORE the transaction (same pattern as createCredential's
  // key validation). For other definitions this stays null.
  let proxyData: McpProxyToolData | null = null;
  if (currentValues.toolKey === utils.constants.TOOL_DEFINITION_KEY_MCP_PROXY) {
    const [artifactRow] = await dbInstance
      .select({ id: db.schema.artifact.id })
      .from(db.schema.artifact)
      .where(eq(db.schema.artifact.projectId, currentValues.projectId))
      .limit(1);
    if (!artifactRow) {
      throw new Error('Artifact not found for the project');
    }
    proxyData = await buildMcpProxyToolData(
      caller,
      dbInstance,
      artifactRow.id,
      currentValues.config,
      currentValues.metadata || null
    );
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
    await syncSlashCommands(caller, result.artifactId);
  }

  return result;
};

export const updateTool = async (
  caller: ProjectCaller,
  currentValues: UpdateToolValues
) => {
  const dbInstance = caller.db;

  // Re-discovery for mcp-proxy is a network round-trip; resolve it before the
  // transaction (same as createTool). An update re-runs discovery so a changed
  // credential / allowed-tools list refreshes the stored tool schemas.
  let proxyData: McpProxyToolData | null = null;
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
          caller,
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
      .select()
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
      : existing.toolKey === utils.constants.TOOL_DEFINITION_KEY_HTTP_ENDPOINT
        ? validateHttpEndpointConfig(currentValues.config)
        : existing.toolKey === utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE
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
        toolKey: existing.toolKey,
        config: existing.config,
        metadata: existing.metadata
      });
      const after = await Plan.countInstallToolsIn(tx, {
        toolKey: existing.toolKey,
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

    return { previous: existing, tool: artifactTool[0] };
  });

  // An mcp-proxy update may change which proxied prompts are enabled; refresh
  // the Telegram menu so slash-command autocomplete tracks the new set.
  if (proxyData) {
    await syncSlashCommands(caller, result.tool.artifactId);
  }

  return result;
};

export const setToolEnabled = async (
  caller: ProjectCaller,
  currentValues: SetToolEnabledValues
) => {
  const dbInstance = caller.db;

  return dbInstance.transaction(async tx => {
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
      return { previous: tool, tool };
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

    return { previous: tool, tool: row };
  });
};

export const removeTool = async (
  caller: ProjectCaller,
  currentValues: RemoveToolValues
) => {
  const dbInstance = caller.db;

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
    let deletedCredentialId: string | null = null;

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
          deletedCredentialId = cred.id;
        }
      }
    }

    // custom-code secrets are addressed by label from inside the script rather
    // than by id from config, so the credentialId path above never sees them.
    // Its versions go with the row via the FK cascade; the secrets need this.
    const removedKey = deleteTool[0].toolKey;
    let deletedCustomCodeSecrets = 0;

    if (removedKey === utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE) {
      deletedCustomCodeSecrets = await deleteCustomCodeSecrets(
        tx,
        currentArtifactByProject.id
      );
      if (deletedCustomCodeSecrets > 0) {
        await tx
          .update(db.schema.artifact)
          .set({
            artifactCredentialCount: sql`greatest((${db.schema.artifact.artifactCredentialCount}::int - ${deletedCustomCodeSecrets}), 0)::int`
          })
          .where(eq(db.schema.artifact.id, currentArtifactByProject.id));
      }
    }

    return {
      tool: deleteTool[0],
      deletedCredentialId,
      deletedCustomCodeSecrets,
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
  const { tool, deployedScriptNames } = removal;
  const artifactId = tool.artifactId;

  if (tool.toolKey === utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE) {
    // The legacy derived name is tried alongside the recorded ones: a version
    // published before script names were recorded has none, and its bundle
    // really is sitting under `artifact_<id>`.
    const names = new Set([
      ...deployedScriptNames,
      utils.customCodeScriptName(artifactId)
    ]);

    for (const name of names) {
      try {
        await deleteCustomCodeScript(caller, name);
      } catch (error) {
        console.error(
          `Failed to remove the deployed custom-code script ${name} for artifact ${artifactId}`,
          error
        );
      }
    }
  }

  // Only mcp-proxy installs set the catalog FK, so it doubles as a cheap "was
  // this a proxy?" flag. Removing one drops its proxied prompts.
  if (tool.mcpServerCatalogId != null) {
    await syncSlashCommands(caller, artifactId);
  }

  return removal;
};
