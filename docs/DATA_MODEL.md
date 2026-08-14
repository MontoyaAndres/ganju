# Data model

The schema is defined with Drizzle in [`packages/db/src/lib/schema.ts`](../packages/db/src/lib/schema.ts). This document is a map of the entities and how they relate. Treat the schema file as the source of truth — column-level details live there.

## Tenancy hierarchy

```
user
 └── organization        (ownerId → user)
      ├── organizationUser     (role: ADMIN)   membership
      ├── organizationLlm      org-level LLM configs (provider, model, apiKey, systemPrompt)
      ├── invitation           org/project invites (token, status, expiry)
      └── project          (organizationId → organization)
           ├── projectUser      membership
           └── artifact         the MCP server (see below)
```

- A **user** authenticates via better-auth (`session`, `account`, `verification`, `jwks`, plus the OAuth provider tables `oauth_client`, `oauth_access_token`, `oauth_refresh_token`, `oauth_consent`).
- An **organization** is the billing/ownership boundary; **projects** group work inside it; both have a membership join table with a `role`.
- **organizationLlm** holds reusable LLM connections (Anthropic / OpenAI / OpenAI-compatible / Google) that channels reference.

## The artifact and its children

The **artifact** is the unit that becomes an MCP server (one per project, addressed by `slug`). It keeps denormalized counters (prompt/resource/tool/credential/channel counts and usage tallies) for fast dashboard reads.

```
artifact (slug, projectId, …counters)
 ├── artifactPrompt        title, messages[], optional input schema
 ├── artifactResource      a file / website / drive item (see Resources)
 │    └── artifactResourceChunk   embedded text chunk (halfvec[1536], HNSW cosine index)
 ├── artifactTool          an installed tool instance (→ toolDefinition, optional → mcpServerCatalog)
 │    └── artifactToolVersion     a custom-code release (script + tool manifest)
 ├── artifactCredential    encrypted secret (OAuth tokens / API keys / per-tool secrets)
 ├── channel               a chat-platform bot binding (see Channels)
 ├── mcpSession            an MCP client session (+ mcpRequest per request)
 └── artifactExecution     audit row: who ran which tool/prompt/resource, when
```

### Resources

`artifactResource` carries `type` (`static` | `template`), `sourceType` (`FILE` | `WEBSITE` | `GOOGLE_DRIVE_FOLDER` | `ONE_DRIVE_FOLDER`), `status` (`PENDING`/`COMPLETED`/`FAILED`), mime type, and either inline `content`, an R2 `fileKey`, or a crawl/sync config. Folders and crawls are hierarchical via `parentResourceId` (self-reference) with a `childResourceCount`.

Embeddable resources are chunked into `artifactResourceChunk` rows, each holding the chunk text and a 1536-dimension `halfvec` embedding indexed with HNSW cosine — this backs the `search-resources` tool.

### Tools catalog

Tools are defined by a small catalog and installed per artifact:

```
toolGroup (key, provider?)            e.g. "gmail" → provider "google-gmail"
 └── toolDefinition (key)             e.g. "gmail-send-email"
       └── artifactTool               an install on one artifact (config, metadata)

mcpServerCatalog (slug, url, authKind, verified)   curated remote MCP servers
 └── artifactTool.mcpServerCatalogId               an mcp-proxy install links here
```

Three special definitions (`http-endpoint`, `mcp-proxy`, `custom-code`) produce **many** MCP tools from one definition — their per-install `config` describes the actual tools. Full mechanics: [apps/mcp/src/tools/README.md](../apps/mcp/src/tools/README.md).

### Custom-code versions

`custom-code` is the one definition whose behaviour is user code rather than user configuration, so its tool list is versioned rather than living on the install row:

```
artifactTool (definition "custom-code", config.activeVersionId)
 └── artifactToolVersion (version, status, tools[], sourceKey, sourceHash, scriptTag)
```

One row per release holds **both halves** — the deployed script and the manifest the MCP server registers from — so publish and rollback move code and schemas together. `config.activeVersionId` names the single `published` version; the MCP boot loop reads that version's `tools` and never calls the dispatcher, so a slow or failed deploy can't break `tools/list`. `status` is `draft` | `published` | `archived`, `version` is monotonic per tool (unique with `artifactToolId`), and `sourceKey` points at the bundle in R2.

### Channels (chat bots)

```
channel (platform, credentials, webhookSecret, → artifact, → organizationLlm?)
 ├── channelConversation   one chat/DM/thread (scope: private | group | channel)
 │    └── channelMessage    a message (role, content, token/latency stats)
 │         └── channelMessageUsage   what the turn exercised (tool/prompt/resource)
 └── channelParticipant    an external user, optionally linked to a Ganju user
```

`platform` is one of `telegram` | `slack` | `whatsapp` | `discord`. `externalIdentity` links a platform user to a Ganju `user` per channel.

## Observability & audit tables

| Table                       | What it records                                                                |
| --------------------------- | ------------------------------------------------------------------------------ |
| `mcpSession` / `mcpRequest` | Each MCP client session and individual request (method, tool, latency, errors) |
| `artifactExecution`         | Unified audit of tool/prompt/resource runs (source, actor, channel/user)       |
| `channelMessageUsage`       | Per-message breakdown of what a channel turn used                              |
| `errorLog`                  | Cross-service error capture (service, path, stack, references)                 |

## Conventions

- **IDs** are UUIDv7 text primary keys (`uuid()` default), so they sort roughly by creation time.
- **Timestamps** — most tables have `createdAt` / `updatedAt` (auto-updated); append-only audit tables have only `createdAt`.
- **Counters** on `artifact` / `organization` / `project` are maintained in application code — keep them in sync when you add a create/delete path.
- **Enums** are plain text columns validated against constant arrays in [`packages/utils/src/constants.ts`](../packages/utils/src/constants.ts) (e.g. `STATUS_*`, `CHANNEL_PLATFORMS`, `LLM_PROVIDERS`).
- **Seeded data** — `toolGroup`, `toolDefinition`, and `mcpServerCatalog` rows are inserted out of band, not created through the app UI. The `custom-code` pair has a script: `node scripts/seed-custom-code.mjs [--prod]`.
