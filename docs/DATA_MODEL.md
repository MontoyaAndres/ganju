# Data model

The schema is defined with Drizzle in [`packages/db/src/lib/schema.ts`](../packages/db/src/lib/schema.ts). This document is a map of the entities and how they relate. Treat the schema file as the source of truth — column-level details live there.

## Tenancy hierarchy

```
user
 └── organization        (ownerId → user)
      ├── organizationUser     (role: ADMIN)   membership
      ├── subscription         the plan, its Stripe ids, and the usage counters (one per org)
      ├── organizationLlm      org-level LLM configs (provider, model, apiKey, systemPrompt)
      ├── accessToken         a machine credential, scoped to one project, acting as one user
      ├── invitation           org/project invites (token, status, expiry)
      └── project          (organizationId → organization)
           ├── projectUser      membership
           └── artifact         the MCP server (see below)
```

- A **user** authenticates via better-auth (`session`, `account`, `verification`, `jwks`, plus the OAuth provider tables `oauth_client`, `oauth_access_token`, `oauth_refresh_token`, `oauth_consent`).
- **accessToken** is the durable credential a machine authenticates with, where a browser login cannot happen — CI, a container, an SSH session. It resolves to the user who minted it and is confined to **one project**, so the request middleware answers the question it already asked ("which user is this") while gaining a boundary the membership checks do not have: those authorize everything its holder can reach, and a credential in one repository's CI settings must not inherit that. `organizationId` is denormalized from the project rather than a second scope. `tokenHash` holds a SHA-256; the value exists once, in the response that created it, so nothing can print it back. Revoking is a row delete, and authentication is a lookup by hash, so it lands on the next request. `userId` is `on delete set null` rather than a cascade — deleting the account keeps the row, so a pipeline that stops has something to point at, though the token no longer authenticates once there is nobody for it to act as.
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

`artifactResource` carries `type` (`static` | `template`), `sourceType` (`FILE` | `WEBSITE` | `GOOGLE_DRIVE_FOLDER` | `ONE_DRIVE_FOLDER` | `CUSTOM_CODE`), `status` (`PENDING`/`COMPLETED`/`FAILED`), mime type, and either inline `content`, an R2 `fileKey`, or a crawl/sync config. Folders and crawls are hierarchical via `parentResourceId` (self-reference) with a `childResourceCount`.

`CUSTOM_CODE` is provenance rather than a kind of file: it marks a row a user's tool wrote through `ctx.resources.create`, and it is what `artifact_tool.config.resourceAccess` is checked against — `own` (the default) confines a script to rows carrying it, `all` lets it replace and remove uploaded and crawled resources too. A created resource is **not** indexed unless the call asked for it, so script output stays out of the search corpus by default: listable and sendable, searchable only on request.

Embeddable resources are chunked into `artifactResourceChunk` rows, each holding the chunk text and a 1536-dimension `halfvec` embedding indexed with HNSW cosine — this backs the `search-resources` tool.

### Tools catalog

The catalog of shipped tools is **code, not rows** — `TOOL_CATALOG` in [@ganju/utils](../packages/utils/src/toolCatalog.ts), 12 groups and 62 tools, paired with a handler in the MCP registry that the compiler keeps in step. An install names an entry in it by key:

```
TOOL_CATALOG (code)                   group "gmail" → provider "google-gmail"
                                      tool  "gmail-send-email"
 └── artifactTool.toolKey             an install on one artifact (config, enabled, metadata)

mcpServerCatalog (slug, url, authKind, verified)   curated remote MCP servers
 └── artifactTool.mcpServerCatalogId               an mcp-proxy install links here
```

`artifactTool.enabled` is what a dashboard toggle moves: a disabled row keeps its config and its credentials but does not register at boot, does not claim its name against another install, and does not count toward the artifact's tool quota. **Removing** a tool deletes the row; turning it off does not. Read paths are lenient — a stored `toolKey` the current catalog no longer offers still parses, and the boot loop skips what it cannot resolve rather than failing the whole artifact — while writes validate against `isToolKey`.

Three special definitions (`http-endpoint`, `mcp-proxy`, `custom-code`) produce **many** MCP tools from one definition — their per-install `config` describes the actual tools. Full mechanics: [apps/mcp/src/tools/README.md](../apps/mcp/src/tools/README.md).

### Custom-code versions

`custom-code` is the one definition whose behaviour is user code rather than user configuration, so its tool list is versioned rather than living on the install row:

```
artifactTool (toolKey "custom-code", config.activeVersionId)
 └── artifactToolVersion (version, status, tools[], sourceKey, sourceHash, sourceKind, scriptName, scriptTag)
```

One row per release holds **both halves** — the deployed script and the manifest the MCP server registers from — so publish and rollback move code and schemas together. `config.activeVersionId` names the single `published` version; the MCP boot loop reads that version's `tools` and never calls the dispatcher, so a slow or failed deploy can't break `tools/list`. `status` is `draft` | `published` | `archived`, `version` is monotonic per tool (unique with `artifactToolId`), and `sourceKey` points at the bundle in R2.

Two columns carry more than their names suggest:

- **`scriptName`** is the dispatch-namespace name this version's bundle was uploaded to, and the name the boot loop actually dispatches to. Every upload mints its own, so this is a pointer rather than a convention — which is what lets a publish write to a name that has never existed (read-your-writes) instead of over the artifact's one script (not read-your-writes, and observed taking ~40s to converge). Keeping it on this row rather than on `artifact_tool.config` is what makes code, contract and the script serving them one row. Null on any version published before the column existed, whose bundle sits under the legacy derived name; the read path falls back to it.
- **`sourceKind`** says whether the stored bytes are readable: `'editor'` means a person typed them and the dashboard can reopen them, `'bundle'` means the CLI uploaded a compiled artifact, which the editor shows read-only rather than inviting someone to overwrite a real build with the contents of a text box.

### Channels (chat bots)

```
channel (platform, credentials, webhookSecret, → artifact, → organizationLlm?)
 ├── channelConversation   one chat/DM/thread (scope: private | group | channel)
 │    └── channelMessage    a message (role, content, token/latency stats)
 │         └── channelMessageUsage   what the turn exercised (tool/prompt/resource)
 └── channelParticipant    an external user, optionally linked to a Ganju user
```

`platform` is one of `telegram` | `slack` | `whatsapp` | `discord`. `externalIdentity` links a platform user to a Ganju `user` per channel.

## Billing & metering

**`subscription`** is one row per organization (unique FK, cascade) holding the plan and everything billing needs: `plan`, `status`, the three Stripe ids (`stripeCustomerId` / `stripeSubscriptionId` / `stripePriceId`), the Stripe period (`currentPeriodStart` / `currentPeriodEnd`), `cancelAtPeriodEnd`, and the `customDomain` add-on. Plan **limits** are not here — they live in code, in [`PLAN_LIMITS`](../packages/utils/src/constants.ts), so a plan's allowances are the same everywhere and a row cannot disagree with them.

Three axes are metered, and each is a counter plus a mark:

| Axis | Counter | Reported mark |
| ---- | ------- | ------------- |
| Channel messages on the customer's own LLM key | `messageCount` | `reportedMessageOverage` |
| Channel messages on our shared key | `sharedMessageCount` | `reportedSharedMessageOverage` |
| Custom tool calls (dispatches into user code) | `toolCallCount` | `reportedToolCallOverage` |
| Embedded storage | — live sum over resource chunks | `reportedEmbeddedOverageMb` |

- **The counters are columns, not queries.** `mcpRequest` holds one row per call and counting them would answer the same question — but that table is purged on a 90-day retention window, which is shorter than some billing disputes, and an hourly cron scanning every artifact in an organization is a scan where reading one row is a read.
- **The marks are the only memory of what was already billed.** The hourly sweep reports the delta between an axis's counter and its mark, then advances the mark — so a mark that moves without its Stripe event landing loses that usage for good, while a mark that stays put costs one retry. Each meter therefore reports independently: one rejected event must not abort the others or strand their marks.
- **`messagePeriodStart` is the usage period, and it is not the Stripe period.** A rollover zeroes every counter and every mark together. A null value reads as a period that has ended, so `ensureSubscription` stamps it at creation — usage recorded before a row's first budget check would otherwise be discarded.
- **Only custom tool calls count as tool calls.** A shipped integration or a proxied remote server is one screened fetch from a Worker we already pay for; metering those would bill for something that rounds to zero and turn the tool list into a thing to ration.

`lastStripeEventAt` guards webhook ordering — a stale event arriving after a newer one is ignored rather than reapplied.

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
- **Seeded data** — `mcpServerCatalog` rows are inserted out of band, not created through the app UI. `toolGroup` and `toolDefinition` no longer exist: the shipped tool catalog is `TOOL_CATALOG` in [@ganju/utils](../packages/utils/src/toolCatalog.ts), and `artifact_tool.tool_key` names an entry in it.
