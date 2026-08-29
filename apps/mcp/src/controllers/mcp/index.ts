import { Context } from 'hono';
import {
  McpServer,
  ResourceTemplate
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPTransport } from '@hono/mcp';
import { JsonSchema, utils } from '@ganju/utils';
import { db } from '@ganju/db';
import { eq, inArray } from 'drizzle-orm';

import {
  toolRegistry,
  parseHttpEndpointConfig,
  executeHttpEndpoint,
  parseMcpProxyConfig,
  parseMcpProxyDiscovery,
  executeMcpProxyCall,
  executeMcpProxyResourceRead,
  executeMcpProxyPromptGet,
  parseCustomCodeConfig,
  parseCustomCodeTools,
  executeCustomCodeCall,
  type PromptInventoryItem
} from '../../tools';
import {
  readResourceContent,
  refreshCredentialIfNeeded,
  generateEmbedding,
  resolveArtifactSlug,
  allowProxyToolCall,
  parseJsonRpcMessages,
  collectBodyOnlyRequests,
  parseClient,
  resolveExternalSessionId,
  upsertSession,
  flushRequests,
  type PendingRequest
} from '../../utils';

// types
import { AppEnv } from '../../types';

// The definitions that register MANY tools per installed row, under names the
// row's config or manifest supplies rather than the definition key. They sort
// after the natives — see orderedArtifactTools below.
const PROXIED_TOOL_KEYS = new Set([
  utils.constants.TOOL_DEFINITION_KEY_HTTP_ENDPOINT,
  utils.constants.TOOL_DEFINITION_KEY_MCP_PROXY,
  utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE
]);

const business = async (c: Context<AppEnv>) => {
  const slug = c.req.param('slug') ?? resolveArtifactSlug(c.req.raw);

  if (!slug) {
    return c.json({ error: 'Missing MCP slug' }, 400);
  }
  if (!utils.isValidSlugFormat(slug) || utils.isReservedSlug(slug)) {
    return c.json({ error: 'Invalid MCP slug' }, 400);
  }

  const authContext = c.get('authContext');
  const jwtUserId =
    authContext?.kind === 'jwt' ? authContext.userId : undefined;

  if (authContext?.kind === 'jwt' && !jwtUserId) {
    return c.json({ error: 'Token missing subject' }, 401);
  }

  const dbInstance = db.create(c);

  const artifact = await dbInstance.query.artifact.findFirst({
    where: eq(db.schema.artifact.slug, slug),
    with: {
      artifactPrompts: true,
      artifactResources: true,
      artifactTools: true,
      artifactCredentials: true,
      project: {
        with: {
          projectUsers: jwtUserId
            ? {
                where: eq(db.schema.projectUser.userId, jwtUserId),
                columns: { userId: true },
                limit: 1
              }
            : { limit: 0, columns: { userId: true } }
        }
      }
    }
  });

  if (!artifact) {
    throw new Error('MCP Server not found');
  }

  if (jwtUserId && artifact.project.projectUsers.length === 0) {
    return c.json({ error: 'You do not have access to this artifact' }, 403);
  }

  // Folders and crawl seeds aren't queryable resources. The rule is shared with
  // apps/tool-broker, which serves the same artifact's resources to custom code:
  // a website seed carries the SAME uri as the page indexed beneath it, so a
  // surface that filters and one that doesn't will disagree about what that uri
  // resolves to.
  const exposedResources = artifact.artifactResources.filter(r =>
    utils.isExposedResource(r)
  );

  const refreshedCredentials = await Promise.all(
    artifact.artifactCredentials.map(cred => refreshCredentialIfNeeded(c, cred))
  );

  // Channel-relayed self-fetches from the API worker tag themselves so we can
  // distinguish them from direct MCP clients (Claude Desktop, mcp-inspector).
  // Only honor these on trusted auth paths — internal-secret (the API holds it)
  // or bot-on-behalf-of JWTs (minted in-process by the API, never issued to
  // external OAuth clients). Otherwise a Claude Desktop user could spoof them and
  // pollute the session metadata (and the list-prompts guidance). Read once here;
  // reused for the session metadata below.
  const channelTrust =
    authContext?.kind === 'internal' || authContext?.isBotToken === true;
  const channelIdHeader = channelTrust
    ? (c.req.header(utils.constants.MCP_CHANNEL_ID_HEADER) ?? null)
    : null;
  const channelPlatform = channelTrust
    ? (c.req.header(utils.constants.MCP_CHANNEL_PLATFORM_HEADER) ?? null)
    : null;

  const mcpServer = new McpServer({
    name: artifact.project.name || 'MCP Server',
    description: artifact.project.description || 'MCP Server Description',
    version: '0.0.1'
  });
  const transport = new StreamableHTTPTransport({
    enableJsonResponse: true
  });
  const bucket = c.env.STORAGE_BUCKET;
  const pendingRequests: PendingRequest[] = [];
  // The prompts/commands this server exposes (artifact + proxied), accumulated as
  // each prompt is registered below so the list-prompts tool mirrors exactly what
  // is registered. Read at tool-call time, after this boot loop has fully run.
  const promptInventory: PromptInventoryItem[] = [];
  // MCP prompt names exposed to clients (native first, then proxied below).
  // Native prompts use their slugified title — unique per artifact by creation —
  // so clients show a readable name; the set also guards proxied prompts from
  // colliding with them.
  const registeredPromptNames = new Set<string>();

  for (const prompt of artifact.artifactPrompts) {
    const promptSchema = (prompt.schema as JsonSchema) || {
      type: 'object',
      properties: {}
    };
    const schema = utils.jsonSchemaToZodShape(promptSchema);
    const requiredArgs = new Set(promptSchema.required || []);
    // The command name is unique per artifact, so the slugified title is a
    // stable, readable MCP name — show it instead of the opaque id. (A title
    // that slugifies to empty can't form a command; fall back to the id.)
    const promptSlug = utils.slugifyTitle(prompt.title);
    const promptName = promptSlug || prompt.id;
    registeredPromptNames.add(promptName);
    promptInventory.push({
      name: promptName,
      title: prompt.title,
      description: prompt.description || undefined,
      source: 'artifact',
      command: promptSlug ? `/${promptSlug}` : null,
      arguments: Object.entries(promptSchema.properties || {}).map(
        ([name, prop]) => ({
          name,
          description: (prop as { description?: string }).description,
          required: requiredArgs.has(name)
        })
      )
    });

    mcpServer.registerPrompt(
      promptName,
      {
        title: prompt.title,
        description: prompt.description || undefined,
        argsSchema: schema
      },
      async args => {
        const startedAt = Date.now();
        const promptMessages = (prompt.messages || []) as Array<{
          role: 'user' | 'assistant';
          content: string;
        }>;

        const result = {
          messages: promptMessages.map(msg => {
            let text = msg.content;

            for (const [key, value] of Object.entries(args)) {
              text = text.replaceAll(`{{${key}}}`, value ? String(value) : '');
            }

            text = text.replaceAll(/\{\{[^}]+\}\}/g, '');

            return {
              role: msg.role,
              content: { type: 'text' as const, text }
            };
          })
        };

        pendingRequests.push({
          method: utils.constants.MCP_REQUEST_METHOD_PROMPTS_GET,
          toolName: prompt.title,
          promptId: prompt.id,
          artifactPromptId: prompt.id,
          input: args,
          output: result,
          latencyMs: Date.now() - startedAt
        });

        return result;
      }
    );
  }

  // MCP resource names shown to clients — the slugified title rather than the
  // opaque id. Resource titles aren't unique, so fall back to the id when a slug
  // repeats (templates are keyed by name and would otherwise clash on boot).
  const registeredResourceNames = new Set<string>();

  for (const resource of exposedResources) {
    const resourceSlug = utils.slugifyTitle(resource.title);
    const resourceName =
      resourceSlug && !registeredResourceNames.has(resourceSlug)
        ? resourceSlug
        : resource.id;
    registeredResourceNames.add(resourceName);

    const resourceMetadata = {
      title: resource.title,
      description: resource.description || undefined,
      mimeType: resource.mimeType || undefined,
      annotations: resource.annotations || undefined,
      icons:
        (resource.icons as
          | {
              src: string;
              mimeType?: string | undefined;
              sizes?: string[] | undefined;
              theme?: 'light' | 'dark' | undefined;
            }[]
          | undefined) || undefined
    };

    if (resource.type === utils.constants.RESOURCE_TYPE_TEMPLATE) {
      const template = new ResourceTemplate(resource.uri, {
        list: undefined
      });

      mcpServer.registerResource(
        resourceName,
        template,
        resourceMetadata,
        async (uri: URL, variables) => {
          const startedAt = Date.now();
          try {
            const result = await readResourceContent(resource, uri, bucket);

            for (const content of result.contents) {
              if ('text' in content && content.text) {
                for (const [key, value] of Object.entries(variables)) {
                  const replacement = Array.isArray(value)
                    ? value.join(', ')
                    : value;
                  content.text = content.text.replaceAll(
                    `{{${key}}}`,
                    replacement || ''
                  );
                }

                content.text = content.text.replaceAll(/\{\{[^}]+\}\}/g, '');
              }
            }

            pendingRequests.push({
              method: utils.constants.MCP_REQUEST_METHOD_RESOURCES_READ,
              resourceUri: uri.toString(),
              artifactResourceId: resource.id,
              input: { uri: uri.toString(), variables },
              output: result,
              latencyMs: Date.now() - startedAt
            });
            return result;
          } catch (error) {
            pendingRequests.push({
              method: utils.constants.MCP_REQUEST_METHOD_RESOURCES_READ,
              resourceUri: uri.toString(),
              artifactResourceId: resource.id,
              input: { uri: uri.toString(), variables },
              output: null,
              latencyMs: Date.now() - startedAt,
              errorMessage:
                error instanceof Error ? error.message : String(error)
            });
            throw error;
          }
        }
      );

      continue;
    }

    mcpServer.registerResource(
      resourceName,
      resource.uri,
      resourceMetadata,
      async (uri: URL) => {
        const startedAt = Date.now();
        try {
          const result = await readResourceContent(resource, uri, bucket);
          pendingRequests.push({
            method: utils.constants.MCP_REQUEST_METHOD_RESOURCES_READ,
            resourceUri: uri.toString(),
            artifactResourceId: resource.id,
            input: { uri: uri.toString() },
            output: result,
            latencyMs: Date.now() - startedAt
          });
          return result;
        } catch (error) {
          pendingRequests.push({
            method: utils.constants.MCP_REQUEST_METHOD_RESOURCES_READ,
            resourceUri: uri.toString(),
            artifactResourceId: resource.id,
            input: { uri: uri.toString() },
            output: null,
            latencyMs: Date.now() - startedAt,
            errorMessage: error instanceof Error ? error.message : String(error)
          });
          throw error;
        }
      }
    );
  }

  // http-endpoint auth references a credential by id; index the already-
  // refreshed (decrypted) credentials so the dispatcher can resolve its secret.
  const credentialById = new Map(
    refreshedCredentials.map(cred => [cred.id, cred])
  );
  // Guard against two rows claiming the same MCP tool name (native key or a
  // user-chosen http-endpoint name) — duplicate registration would throw.
  const registeredToolNames = new Set<string>();
  // Proxied resources/prompts register alongside native ones; track the URIs and
  // prompt names already claimed (native first, then earlier proxy installs) so a
  // duplicate is skipped instead of throwing and aborting the whole boot.
  const registeredResourceUris = new Set(exposedResources.map(r => r.uri));

  // custom-code registers from the ACTIVE VERSION's manifest, which lives in its
  // own table rather than on the install row. Fetched here, in one query for
  // every custom-code row on the artifact, so boot costs a single extra round
  // trip no matter how many tools the versions declare.
  //
  // This query is the whole boot contract: names, descriptions and schemas come
  // from Postgres and the dispatcher is not called until an actual tools/call.
  // A script that is slow, broken, or not deployed at all still lists correctly.
  // Registration order decides who wins a name collision: every tool on an
  // artifact lands in ONE flat namespace, and `registeredToolNames` skips the
  // second claimant. The relational query above has no ORDER BY, so left alone
  // the winner varies from boot to boot — the same install could register today
  // and silently vanish tomorrow.
  //
  // Natives first, then the proxied definitions whose names the user chooses.
  // A reserved name is rejected at the write path now, so a fresh collision
  // can't be created; what this ordering settles is the installs that predate
  // that rule. It also matches how the channel runner attributes a call — it
  // seeds its map with native definition keys before any derived name — so the
  // tool that runs and the tool the usage row points at are the same one.
  // Ties break on id, which is uuidv7 and therefore creation-ordered.
  //
  // Disabled rows are dropped before any of that. A tool the owner turned off
  // keeps its row and its config — that is the whole point of the flag — but it
  // must not register, must not claim its name against another install, and
  // must not cost the model a schema on every turn.
  const orderedArtifactTools = artifact.artifactTools
    .filter(t => t.enabled)
    .sort((a, b) => {
      const aProxied = PROXIED_TOOL_KEYS.has(a.toolKey) ? 1 : 0;
      const bProxied = PROXIED_TOOL_KEYS.has(b.toolKey) ? 1 : 0;
      if (aProxied !== bProxied) return aProxied - bProxied;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  const activeVersionIds = orderedArtifactTools
    .filter(t => t.toolKey === utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE)
    .map(t => parseCustomCodeConfig(t.config)?.activeVersionId)
    .filter((id): id is string => !!id);

  // `scriptName` rides along on the query that was already being made. It is
  // the dispatch-namespace name the active version's bundle was uploaded to,
  // and reading it here is what keeps the Postgres-first boot contract intact:
  // the name a call dispatches to is a column, exactly like the tool list beside
  // it, so the boot loop still never asks Cloudflare anything.
  const versionById = new Map<
    string,
    { tools: unknown; scriptName: string | null }
  >();
  if (activeVersionIds.length > 0) {
    const versions = await dbInstance
      .select({
        id: db.schema.artifactToolVersion.id,
        tools: db.schema.artifactToolVersion.tools,
        scriptName: db.schema.artifactToolVersion.scriptName
      })
      .from(db.schema.artifactToolVersion)
      .where(inArray(db.schema.artifactToolVersion.id, activeVersionIds));
    for (const version of versions) {
      versionById.set(version.id, {
        tools: version.tools,
        scriptName: version.scriptName
      });
    }
  }

  for (const artifactTool of orderedArtifactTools) {
    // Resolved from the shipped catalog rather than a join. Null means the row
    // names a tool this build no longer offers — skip it, exactly as a missing
    // handler is skipped below, rather than failing the whole artifact.
    const toolDef = utils.describeCatalogTool(artifactTool.toolKey);
    if (!toolDef) continue;

    // `mcp-proxy` is a proxied definition: each installed row connects a remote
    // MCP server and registers one named tool per remote tool discovered at
    // configure-time (stored on metadata.discovery so boot needs no remote
    // round-trip). Only the actual tools/call below connects to the remote.
    if (toolDef.key === utils.constants.TOOL_DEFINITION_KEY_MCP_PROXY) {
      const proxyConfig = parseMcpProxyConfig(artifactTool.config);
      const discovery = parseMcpProxyDiscovery(artifactTool.metadata);
      if (!proxyConfig || !discovery) continue;

      const credentialId =
        proxyConfig.auth.kind !== utils.constants.MCP_PROXY_AUTH_KIND_NONE
          ? proxyConfig.auth.credentialId
          : undefined;
      const resolved = credentialId
        ? credentialById.get(credentialId)
        : undefined;
      const resolvedCredential = resolved
        ? {
            secret: resolved.accessToken,
            needsReauth: resolved.needsReauth === true
          }
        : null;

      const prefix = proxyConfig.prefix || 'mcp';
      // metadata.discovery holds the FULL set the remote exposes; config's
      // allowedTools is the enabled subset (absent/empty = all enabled).
      const allowedTools =
        proxyConfig.allowedTools && proxyConfig.allowedTools.length > 0
          ? new Set(proxyConfig.allowedTools)
          : null;

      for (const remoteTool of discovery.tools) {
        if (allowedTools && !allowedTools.has(remoteTool.name)) continue;
        // Remote tool names are untrusted; skip-and-log any that can't be safely
        // composed (bad charset, or the composite exceeds the tool-name limit).
        const localName = utils.buildProxyToolName(prefix, remoteTool.name);
        if (!localName) {
          console.warn(
            `Skipping proxied tool with unsafe name "${remoteTool.name}" (server ${prefix})`
          );
          continue;
        }
        if (registeredToolNames.has(localName)) continue;

        // Remote input schemas are untrusted too — a single malformed one must
        // not abort the whole artifact's MCP boot. Skip-and-log instead.
        let remoteSchema;
        try {
          remoteSchema = utils.jsonSchemaToZodShape(
            (remoteTool.inputSchema as JsonSchema) ?? {
              type: 'object',
              properties: {}
            }
          );
        } catch (error) {
          console.error(
            `Skipping proxied tool "${localName}" — invalid input schema`,
            error
          );
          continue;
        }

        // Remote tool descriptions are untrusted user content (the remote could
        // attempt prompt injection) — mark them so the model knows it's
        // third-party.
        const description = `[via ${prefix}] ${
          remoteTool.description || remoteTool.title || remoteTool.name
        }`;

        try {
          mcpServer.registerTool(
            localName,
            {
              title: remoteTool.title || remoteTool.name,
              description,
              inputSchema: remoteSchema
            },
            async args => {
              const startedAt = Date.now();
              const allowed = await allowProxyToolCall(c.env, artifactTool.id);
              if (!allowed) {
                const result = {
                  content: [
                    {
                      type: 'text' as const,
                      text: `Error: rate limit exceeded for "${localName}". Wait a moment before calling it again.`
                    }
                  ]
                };
                pendingRequests.push({
                  method: utils.constants.MCP_REQUEST_METHOD_TOOLS_CALL,
                  toolName: localName,
                  artifactToolId: artifactTool.id,
                  input: args,
                  output: result,
                  latencyMs: Date.now() - startedAt,
                  errorMessage: 'rate limit exceeded'
                });
                return result;
              }
              try {
                const result = await executeMcpProxyCall(
                  proxyConfig,
                  remoteTool.name,
                  args,
                  resolvedCredential
                );
                pendingRequests.push({
                  method: utils.constants.MCP_REQUEST_METHOD_TOOLS_CALL,
                  toolName: localName,
                  artifactToolId: artifactTool.id,
                  input: args,
                  output: result,
                  latencyMs: Date.now() - startedAt
                });
                return result;
              } catch (error) {
                // executeMcpProxyCall returns expected failures as text; this
                // only fires on an unexpected throw. Surface it as text too
                // (the tool convention) rather than throwing a protocol error.
                const message =
                  error instanceof Error ? error.message : String(error);
                const result = {
                  content: [
                    {
                      type: 'text' as const,
                      text: `Error: "${localName}" failed — ${message}`
                    }
                  ]
                };
                pendingRequests.push({
                  method: utils.constants.MCP_REQUEST_METHOD_TOOLS_CALL,
                  toolName: localName,
                  artifactToolId: artifactTool.id,
                  input: args,
                  output: result,
                  latencyMs: Date.now() - startedAt,
                  errorMessage: message
                });
                return result;
              }
            }
          );
          registeredToolNames.add(localName);
        } catch (error) {
          console.error(
            `Failed to register proxied tool "${localName}"`,
            error
          );
        }
      }

      // Remote resources are opt-in: only those whose uri is in allowedResources
      // register (absent/empty = none, matching the UI's default-off toggles).
      // Each read forwards to the remote at call time.
      const allowedResources =
        proxyConfig.allowedResources && proxyConfig.allowedResources.length > 0
          ? new Set(proxyConfig.allowedResources)
          : null;
      if (allowedResources) {
        for (const remoteResource of discovery.resources || []) {
          if (!allowedResources.has(remoteResource.uri)) continue;
          if (registeredResourceUris.has(remoteResource.uri)) continue;
          registeredResourceUris.add(remoteResource.uri);

          try {
            mcpServer.registerResource(
              `${prefix}: ${
                remoteResource.name ||
                remoteResource.title ||
                remoteResource.uri
              }`,
              remoteResource.uri,
              {
                title: remoteResource.title || remoteResource.name,
                description: remoteResource.description
                  ? `[via ${prefix}] ${remoteResource.description}`
                  : `[via ${prefix}]`,
                mimeType: remoteResource.mimeType || undefined
              },
              async (uri: URL) => {
                const startedAt = Date.now();
                const allowed = await allowProxyToolCall(
                  c.env,
                  artifactTool.id
                );
                if (!allowed) {
                  throw new Error(
                    `rate limit exceeded for "${prefix}". Wait a moment before trying again.`
                  );
                }
                try {
                  const result = await executeMcpProxyResourceRead(
                    proxyConfig,
                    uri.toString(),
                    resolvedCredential
                  );
                  pendingRequests.push({
                    method: utils.constants.MCP_REQUEST_METHOD_RESOURCES_READ,
                    resourceUri: uri.toString(),
                    artifactToolId: artifactTool.id,
                    input: { uri: uri.toString() },
                    output: result,
                    latencyMs: Date.now() - startedAt
                  });
                  return result;
                } catch (error) {
                  pendingRequests.push({
                    method: utils.constants.MCP_REQUEST_METHOD_RESOURCES_READ,
                    resourceUri: uri.toString(),
                    artifactToolId: artifactTool.id,
                    input: { uri: uri.toString() },
                    output: null,
                    latencyMs: Date.now() - startedAt,
                    errorMessage:
                      error instanceof Error ? error.message : String(error)
                  });
                  throw error;
                }
              }
            );
          } catch (error) {
            console.error(
              `Failed to register proxied resource "${remoteResource.uri}"`,
              error
            );
          }
        }
      }

      // Remote prompts are opt-in the same way. Their argument schema is built
      // from the discovered `arguments` (MCP prompt args are strings). Names and
      // schemas are untrusted, so each registration is guarded individually.
      const allowedPrompts =
        proxyConfig.allowedPrompts && proxyConfig.allowedPrompts.length > 0
          ? new Set(proxyConfig.allowedPrompts)
          : null;
      if (allowedPrompts) {
        for (const remotePrompt of discovery.prompts || []) {
          if (!allowedPrompts.has(remotePrompt.name)) continue;
          const localName = utils.buildProxyToolName(prefix, remotePrompt.name);
          if (!localName) {
            console.warn(
              `Skipping proxied prompt with unsafe name "${remotePrompt.name}" (server ${prefix})`
            );
            continue;
          }
          if (registeredPromptNames.has(localName)) continue;

          let argsSchema;
          try {
            argsSchema = utils.jsonSchemaToZodShape({
              type: 'object',
              properties: Object.fromEntries(
                (remotePrompt.arguments || []).map(a => [
                  a.name,
                  { type: 'string', description: a.description }
                ])
              ),
              required: (remotePrompt.arguments || [])
                .filter(a => a.required)
                .map(a => a.name)
            } as JsonSchema);
          } catch (error) {
            console.error(
              `Skipping proxied prompt "${localName}" — invalid arguments`,
              error
            );
            continue;
          }

          try {
            mcpServer.registerPrompt(
              localName,
              {
                title: remotePrompt.title || remotePrompt.name,
                description: remotePrompt.description
                  ? `[via ${prefix}] ${remotePrompt.description}`
                  : `[via ${prefix}]`,
                argsSchema
              },
              async args => {
                const startedAt = Date.now();
                const allowed = await allowProxyToolCall(
                  c.env,
                  artifactTool.id
                );
                if (!allowed) {
                  throw new Error(
                    `rate limit exceeded for "${localName}". Wait a moment before trying again.`
                  );
                }
                try {
                  const result = await executeMcpProxyPromptGet(
                    proxyConfig,
                    remotePrompt.name,
                    args,
                    resolvedCredential
                  );
                  pendingRequests.push({
                    method: utils.constants.MCP_REQUEST_METHOD_PROMPTS_GET,
                    promptId: localName,
                    artifactToolId: artifactTool.id,
                    input: args,
                    output: result,
                    latencyMs: Date.now() - startedAt
                  });
                  return result;
                } catch (error) {
                  pendingRequests.push({
                    method: utils.constants.MCP_REQUEST_METHOD_PROMPTS_GET,
                    promptId: localName,
                    artifactToolId: artifactTool.id,
                    input: args,
                    output: null,
                    latencyMs: Date.now() - startedAt,
                    errorMessage:
                      error instanceof Error ? error.message : String(error)
                  });
                  throw error;
                }
              }
            );
            registeredPromptNames.add(localName);
            const proxyTitle = remotePrompt.title || remotePrompt.name;
            const proxySlug = utils.slugifyTitle(proxyTitle);
            promptInventory.push({
              name: localName,
              title: proxyTitle,
              description: remotePrompt.description || undefined,
              source: 'mcp-proxy',
              command: proxySlug ? `/${proxySlug}` : null,
              arguments: (remotePrompt.arguments || []).map(a => ({
                name: a.name,
                description: a.description,
                required: a.required === true
              }))
            });
          } catch (error) {
            console.error(
              `Failed to register proxied prompt "${localName}"`,
              error
            );
          }
        }
      }

      continue;
    }

    // `custom-code` is the third proxied definition, and the only one whose
    // behaviour is user code: one row per artifact, one script in the dispatch
    // namespace, and one named tool per entry in the active version's manifest.
    if (toolDef.key === utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE) {
      const codeConfig = parseCustomCodeConfig(artifactTool.config);
      // No published version yet is the ordinary state of a freshly installed
      // tool, not an error — the artifact simply contributes no tools.
      if (!codeConfig?.activeVersionId) continue;
      const activeVersion = versionById.get(codeConfig.activeVersionId);
      if (!activeVersion) continue;
      const versionTools = activeVersion.tools;

      // A version published before script names were recorded has none, and its
      // bundle really is sitting under the legacy derived name. Falling back is
      // what keeps it serving: a version that stopped registering because a rule
      // tightened underneath it is a failure invisible to whoever owns it.
      const scriptName =
        activeVersion.scriptName ?? utils.customCodeScriptName(artifact.id);

      // The enabled subset, absent/empty meaning all of them — read exactly the
      // way the mcp-proxy branch above reads its own allow-list. A tool turned
      // off here doesn't register, so it costs the model no schema and claims no
      // name, while the code that implements it stays deployed and one config
      // edit away from coming back.
      const allowedCodeTools =
        codeConfig.allowedTools && codeConfig.allowedTools.length > 0
          ? new Set(codeConfig.allowedTools)
          : null;

      for (const entry of parseCustomCodeTools(versionTools)) {
        if (allowedCodeTools && !allowedCodeTools.has(entry.name)) continue;
        if (registeredToolNames.has(entry.name)) continue;

        // Schemas were compiled once at upload time, so a failure here means the
        // row changed underneath us. Skip-and-log rather than abort, the same
        // way a malformed proxied schema is handled.
        let inputSchema;
        let outputSchema;
        try {
          inputSchema = utils.jsonSchemaToZodShape(
            (entry.inputSchema as JsonSchema) ?? {
              type: 'object',
              properties: {}
            }
          );
          outputSchema = entry.outputSchema
            ? utils.jsonSchemaToZodShape(entry.outputSchema as JsonSchema)
            : undefined;
        } catch (error) {
          console.error(
            `Skipping custom tool "${entry.name}" — invalid schema`,
            error
          );
          continue;
        }

        try {
          mcpServer.registerTool(
            entry.name,
            {
              title: entry.title || entry.name,
              description: entry.description || entry.name,
              inputSchema,
              ...(outputSchema ? { outputSchema } : {})
            },
            async args => {
              const startedAt = Date.now();
              const allowed = await allowProxyToolCall(c.env, artifactTool.id);
              if (!allowed) {
                const result = {
                  content: [
                    {
                      type: 'text' as const,
                      text: `Error: rate limit exceeded for "${entry.name}". Wait a moment before calling it again.`
                    }
                  ],
                  isError: true
                };
                pendingRequests.push({
                  method: utils.constants.MCP_REQUEST_METHOD_TOOLS_CALL,
                  toolName: entry.name,
                  artifactToolId: artifactTool.id,
                  input: args,
                  output: result,
                  latencyMs: Date.now() - startedAt,
                  errorMessage: 'rate limit exceeded'
                });
                return result;
              }

              const { result, logs } = await executeCustomCodeCall(
                c.env.DISPATCH,
                codeConfig,
                {
                  artifactId: artifact.id,
                  scriptName,
                  toolName: entry.name,
                  args
                }
              );

              // A tool that declares an outputSchema must return
              // structuredContent or be marked as an error — the SDK refuses to
              // serialize the result otherwise, which would turn a user's bad
              // return value into a protocol failure for the whole call.
              const shaped =
                outputSchema && !result.structuredContent && !result.isError
                  ? {
                      ...result,
                      isError: true,
                      content: [
                        {
                          type: 'text' as const,
                          text: `Error: "${entry.name}" declares an output schema but did not return an object.`
                        }
                      ]
                    }
                  : result;

              pendingRequests.push({
                method: utils.constants.MCP_REQUEST_METHOD_TOOLS_CALL,
                toolName: entry.name,
                artifactToolId: artifactTool.id,
                input: args,
                // ctx.log() output is recorded alongside the result rather than
                // returned to the model: it is the author's debugging channel
                // (and what the Phase 6 test panel reads), not something the
                // model should have to read past.
                output: logs.length > 0 ? { ...shaped, logs } : shaped,
                latencyMs: Date.now() - startedAt,
                errorMessage: shaped.isError
                  ? shaped.content[0]?.text
                  : undefined
              });

              return shaped;
            }
          );
          registeredToolNames.add(entry.name);
        } catch (error) {
          console.error(
            `Failed to register custom tool "${entry.name}"`,
            error
          );
        }
      }

      continue;
    }

    // `http-endpoint` is a proxied definition: each installed row registers one
    // named tool derived from its config, dispatched against a user HTTP API.
    if (toolDef.key === utils.constants.TOOL_DEFINITION_KEY_HTTP_ENDPOINT) {
      const endpointConfig = parseHttpEndpointConfig(artifactTool.config);
      if (!endpointConfig) continue;
      if (registeredToolNames.has(endpointConfig.name)) continue;
      registeredToolNames.add(endpointConfig.name);

      const endpointSchema = utils.jsonSchemaToZodShape(
        endpointConfig.inputSchema as JsonSchema
      );
      // Optional and absent on every endpoint that predates it. Declaring one
      // is what turns a JSON response into structuredContent for the client.
      let endpointOutputSchema:
        | ReturnType<typeof utils.jsonSchemaToZodShape>
        | undefined;
      try {
        endpointOutputSchema = endpointConfig.outputSchema
          ? utils.jsonSchemaToZodShape(
              endpointConfig.outputSchema as JsonSchema
            )
          : undefined;
      } catch (error) {
        // Skip-and-log the schema, not the tool: an endpoint whose output
        // schema no longer compiles should keep answering as text rather than
        // disappear from the customer's server.
        console.error(
          `Ignoring the output schema on "${endpointConfig.name}" — it no longer compiles`,
          error
        );
      }
      const credentialId =
        endpointConfig.auth.kind !==
        utils.constants.HTTP_ENDPOINT_AUTH_KIND_NONE
          ? endpointConfig.auth.credentialId
          : undefined;
      const resolved = credentialId
        ? credentialById.get(credentialId)
        : undefined;
      const resolvedCredential = resolved
        ? {
            secret: resolved.accessToken,
            needsReauth: resolved.needsReauth === true
          }
        : null;

      mcpServer.registerTool(
        endpointConfig.name,
        {
          title: endpointConfig.title,
          description: endpointConfig.description,
          inputSchema: endpointSchema,
          ...(endpointOutputSchema
            ? { outputSchema: endpointOutputSchema }
            : {})
        },
        async args => {
          const startedAt = Date.now();
          // Per-tool rate limit: stop the model from hammering one customer
          // backend in a tight loop. Keyed by artifactTool.id so each endpoint
          // has its own budget.
          const allowed = await allowProxyToolCall(c.env, artifactTool.id);
          if (!allowed) {
            const result = {
              content: [
                {
                  type: 'text' as const,
                  text: `Error: rate limit exceeded for "${endpointConfig.name}". Wait a moment before calling it again.`
                }
              ]
            };
            pendingRequests.push({
              method: utils.constants.MCP_REQUEST_METHOD_TOOLS_CALL,
              toolName: endpointConfig.name,
              artifactToolId: artifactTool.id,
              input: args,
              output: result,
              latencyMs: Date.now() - startedAt,
              errorMessage: 'rate limit exceeded'
            });
            return result;
          }
          try {
            const result = await executeHttpEndpoint(
              endpointConfig,
              args,
              resolvedCredential
            );

            // Same trap as custom-code: a tool that declares an outputSchema
            // must return structuredContent or be marked as an error, or the
            // MCP SDK refuses to serialize its own result — turning a response
            // that didn't match into a protocol failure for the whole call.
            // Most often it means the endpoint answered with text, or with an
            // array, where the schema promised an object.
            const shaped =
              endpointOutputSchema &&
              !result.structuredContent &&
              !result.isError
                ? {
                    ...result,
                    isError: true,
                    content: [
                      {
                        type: 'text' as const,
                        text: `Error: "${endpointConfig.name}" declares an output schema but the response was not a JSON object.`
                      }
                    ]
                  }
                : result;

            pendingRequests.push({
              method: utils.constants.MCP_REQUEST_METHOD_TOOLS_CALL,
              toolName: endpointConfig.name,
              artifactToolId: artifactTool.id,
              input: args,
              output: shaped,
              latencyMs: Date.now() - startedAt,
              errorMessage: shaped.isError ? shaped.content[0]?.text : undefined
            });
            return shaped;
          } catch (error) {
            // executeHttpEndpoint returns expected failures as text; this only
            // fires on an unexpected throw. Surface it as text too (the tool
            // convention) rather than throwing a protocol error.
            const message =
              error instanceof Error ? error.message : String(error);
            const result = {
              content: [
                {
                  type: 'text' as const,
                  text: `Error: "${endpointConfig.name}" failed — ${message}`
                }
              ]
            };
            pendingRequests.push({
              method: utils.constants.MCP_REQUEST_METHOD_TOOLS_CALL,
              toolName: endpointConfig.name,
              artifactToolId: artifactTool.id,
              input: args,
              output: result,
              latencyMs: Date.now() - startedAt,
              errorMessage: message
            });
            return result;
          }
        }
      );

      continue;
    }

    const handler = toolRegistry.get(toolDef.key);
    if (!handler) continue;
    if (registeredToolNames.has(toolDef.key)) continue;
    registeredToolNames.add(toolDef.key);

    const schema = utils.jsonSchemaToZodShape(handler.schema);
    // Native tools may declare structured output too. None do yet — they return
    // prose — but the plumbing is the same one custom code uses, so keeping a
    // single path means a native tool can opt in without touching this loop.
    const nativeOutputSchema = handler.outputSchema
      ? utils.jsonSchemaToZodShape(handler.outputSchema)
      : undefined;
    const toolConfig = (artifactTool.config as Record<string, unknown>) || {};
    const provider = toolDef.group.provider;
    const toolCredentials = provider
      ? refreshedCredentials
          .filter(cred => cred.provider === provider)
          .map(cred => ({
            provider: cred.provider,
            accessToken: cred.accessToken,
            refreshToken: cred.refreshToken,
            expiresAt: cred.expiresAt,
            scopes: cred.scopes,
            needsReauth: cred.needsReauth === true,
            id: cred.id,
            metadata: cred.metadata
          }))
      : [];
    const reauthRequired =
      provider &&
      toolCredentials.length > 0 &&
      toolCredentials.every(cred => cred.needsReauth);

    mcpServer.registerTool(
      toolDef.key,
      {
        title: toolDef.title || handler.title,
        description: toolDef.description || handler.description,
        inputSchema: schema,
        ...(nativeOutputSchema ? { outputSchema: nativeOutputSchema } : {})
      },
      async args => {
        const startedAt = Date.now();
        if (reauthRequired) {
          const result = {
            content: [
              {
                type: 'text' as const,
                text: `Error: ${provider} credential needs to be re-authorized. Open the Tools page and re-link ${provider}.`
              }
            ]
          };
          pendingRequests.push({
            method: utils.constants.MCP_REQUEST_METHOD_TOOLS_CALL,
            toolName: toolDef.key,
            artifactToolId: artifactTool.id,
            input: args,
            output: result,
            latencyMs: Date.now() - startedAt,
            errorMessage: `${provider} credential needs re-authorization`
          });
          return result;
        }
        try {
          const result = await handler.handler(args, {
            config: toolConfig,
            credentials: toolCredentials,
            resources: exposedResources,
            prompts: promptInventory,
            channelPlatform,
            bucket,
            env: c.env,
            db: dbInstance,
            artifactId: artifact.id,
            embedQuery: (text: string) => generateEmbedding(c, text)
          });
          pendingRequests.push({
            method: utils.constants.MCP_REQUEST_METHOD_TOOLS_CALL,
            toolName: toolDef.key,
            artifactToolId: artifactTool.id,
            input: args,
            output: result,
            latencyMs: Date.now() - startedAt
          });
          return result;
        } catch (error) {
          pendingRequests.push({
            method: utils.constants.MCP_REQUEST_METHOD_TOOLS_CALL,
            toolName: toolDef.key,
            artifactToolId: artifactTool.id,
            input: args,
            output: null,
            latencyMs: Date.now() - startedAt,
            errorMessage: error instanceof Error ? error.message : String(error)
          });
          throw error;
        }
      }
    );
  }

  await mcpServer.connect(transport);

  // Read the body once so we can both inspect JSON-RPC method names (for
  // list/discovery calls the SDK auto-handles) and forward it to the transport.
  // GET (SSE stream) and DELETE (session teardown) have no body.
  let parsedBody: unknown | undefined;
  if (c.req.method === 'POST') {
    try {
      parsedBody = await c.req.json();
    } catch {
      parsedBody = undefined;
    }
  }

  const messages = parseJsonRpcMessages(parsedBody);
  const bodyOnly = collectBodyOnlyRequests(messages);

  const response = await transport.handleRequest(c, parsedBody);

  // Drop notifications (no `id`) and ping if nothing actually happened.
  const allRequests: PendingRequest[] = [...bodyOnly, ...pendingRequests];
  if (allRequests.length === 0) return response;

  const userAgent = c.req.header('user-agent') ?? null;
  const ipAddress =
    c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null;
  const client = parseClient(userAgent);

  // channelTrust / channelIdHeader / channelPlatform are resolved once at boot
  // (see above) so the same trusted-header read drives both the list-prompts
  // guidance and this session metadata.
  const sessionMetadata: Record<string, unknown> | null = channelIdHeader
    ? {
        via: 'channel',
        channelId: channelIdHeader,
        platform: channelPlatform
      }
    : null;

  const externalSessionId = resolveExternalSessionId(
    c,
    artifact.id,
    jwtUserId,
    userAgent
  );

  c.executionCtx.waitUntil(
    (async () => {
      try {
        const session = await upsertSession(dbInstance, {
          artifactId: artifact.id,
          externalSessionId,
          authKind: authContext?.kind ?? utils.constants.MCP_AUTH_KIND_JWT,
          userId: jwtUserId,
          userAgent,
          ipAddress,
          clientName: client.name,
          clientVersion: client.version,
          metadata: sessionMetadata
        });
        await flushRequests(dbInstance, session.id, artifact.id, allRequests, {
          userId: jwtUserId ?? null,
          clientName: client.name,
          viaChannel: channelIdHeader != null
        });
      } catch (error) {
        console.error('Failed to record MCP usage', error);
      }
    })()
  );

  return response;
};

const health = async (c: Context<AppEnv>) => {
  return c.json({ status: 'ok' });
};

export const MCPController = {
  business,
  health
};
