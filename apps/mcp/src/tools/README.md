# MCP Tools

Tools exposed to MCP clients (Claude Desktop, ChatGPT, Cursor, Notion Custom Agents, channel bots). Each tool is a `ToolDefinition` registered in [registry.ts](registry.ts) and wired to a `toolDefinition` row via its `key`.

## How a tool plugs in

- A row in `tool_group` (with optional `provider` for OAuth-bound tools) and a row in `tool_definition` (with a unique `key`).
- A `ToolDefinition` exported from this folder and registered in [registry.ts](registry.ts) under the same `key`.
- Handler receives [`ToolContext`](types.ts): `config`, `credentials[]` (already refreshed and filtered to the group's `provider`), `resources[]`, `bucket` (R2), `env`, `db`, `artifactId`, `embedQuery`.
- Handler returns `{ content: [{ type: 'text', text }] }`. Anything CPU/binary-heavy (PDF, headless browser, large multipart) belongs in [apps/resource-handler](../../../resource-handler/) — call it through the `RESOURCE_HANDLER` DO.
- OAuth providers live in [constants.ts](../../../../packages/utils/src/constants.ts) (`OAUTH_PROVIDERS`, `OAUTH_AUTH_URLS`, `OAUTH_TOKEN_URLS`) and refresh is handled by [`refreshOAuthToken`](../../../../packages/utils/src/oauth.ts).

## Build vs. proxy

Two flavors of tool in this codebase:

- **Native tools** — TypeScript handlers in this folder. One `tool_definition` row = one MCP tool. Use when the vendor has no MCP server, when the tool is Anju domain logic, or when channel runtime needs end-to-end control.
- **Proxied tools** — `mcp-proxy` and `http-endpoint` definitions where one `tool_definition` row produces *many* MCP tools at server boot, derived from the `artifact_tool.config` of each instance. Use when the vendor already ships an MCP server (Notion, GitHub, Linear, Stripe, Atlassian, Sentry, Cloudflare), or when the user wants to expose their own backend without a TypeScript handler.

The default position: **proxy first, build only when there's no good MCP server or it's Anju-specific**. Hand-rolling a Notion tool when Notion ships and maintains its own is wasted effort.

## Shipped

| Key | Group | Provider | Notes |
|---|---|---|---|
| `greeting` | greeting | — | Sample tool. Keep as smoke test. |
| `list-resources` | resources | — | Lists artifact resources. |
| `search-resources` | resources | — | Vector search via `embedQuery` over `artifact_resource_chunk`. |
| `read-resource` | resources | — | Reads one resource (handles templates with `{{var}}` substitution). |
| `send-resource` | resources | — | Pushes a resource into the active channel conversation. |
| `gmail-send-email` / `gmail-reply-email` / `gmail-forward-email` | gmail | `google-gmail` | Compose flow. |
| `gmail-list-emails` / `gmail-read-email` / `gmail-trash-email` | gmail | `google-gmail` | Inbox read flow. |
| `gmail-list-labels` / `gmail-modify-labels` / `gmail-batch-modify-labels` | gmail | `google-gmail` | Label mgmt. |
| `gmail-list-threads` / `gmail-get-thread` | gmail | `google-gmail` | Thread view. |
| `gmail-create-draft` / `gmail-list-drafts` / `gmail-get-draft` / `gmail-update-draft` / `gmail-delete-draft` / `gmail-send-draft` | gmail | `google-gmail` | Draft CRUD. |
| `gmail-get-profile` | gmail | `google-gmail` | Account info. |

Baseline pattern to copy when adding a new native provider: [gmail/index.ts](gmail/index.ts).

## Roadmap — native tools to build

Build order reuses already-scaffolded OAuth providers first, then no-auth tools, then new providers.

### Tier 1 — Free / default-discoverable

#### Outlook
- **Group:** `outlook` · **Provider:** `microsoft-outlook` (already in `OAUTH_PROVIDERS`)
- **Tools:** mirror the Gmail suite — `outlook-send-email`, `outlook-reply-email`, `outlook-forward-email`, `outlook-list-emails`, `outlook-read-email`, `outlook-trash-email`, `outlook-list-folders`, `outlook-move-message`, `outlook-list-threads`, `outlook-get-thread`, `outlook-create-draft`, `outlook-list-drafts`, `outlook-get-draft`, `outlook-update-draft`, `outlook-delete-draft`, `outlook-send-draft`, `outlook-get-profile`
- **API:** Microsoft Graph `/me/messages`, `/me/mailFolders`, `/me/sendMail`
- **Scopes:** `Mail.ReadWrite Mail.Send offline_access`
- **Notes:** Outlook uses folders instead of labels; map the Gmail label tools to `outlook-list-folders` + `outlook-move-message`. Attachments >3MB require the upload-session endpoint — route those through the resource-handler.

#### Slack (post-out)
- **Group:** `slack` · **Provider:** `slack` (already in `OAUTH_PROVIDERS`)
- **Tools:** `slack-send-message`, `slack-list-channels`, `slack-search-messages`, `slack-get-user`, `slack-upload-file`
- **API:** `chat.postMessage`, `conversations.list`, `search.messages`, `users.info`, `files.upload`
- **Scopes:** `chat:write channels:read groups:read search:read users:read files:write`
- **Notes:** Distinct from Slack-as-channel — this is the agent posting *out* mid-conversation (notifications, escalations, "logged this in #support").

#### Google Calendar
- **Group:** `google-calendar` · **Provider:** new `google-calendar` (don't reuse `google-gmail` — keeps consent screens scoped per use case and reauth granular)
- **Tools:** `calendar-list-events`, `calendar-create-event`, `calendar-update-event`, `calendar-delete-event`, `calendar-find-free-slots`, `calendar-list-calendars`
- **API:** `https://www.googleapis.com/calendar/v3`
- **Scopes:** `https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly`

#### Cal.com
- **Group:** `calcom` · **Provider:** `calcom` (API key, no OAuth)
- **Tools:** `calcom-list-event-types`, `calcom-list-available-slots`, `calcom-create-booking`, `calcom-cancel-booking`
- **API:** Cal.com v2
- **Config:** API key per artifact (encrypted via `utils.encryptString`)
- **Notes:** Picked over Calendly for MVP — open-source, simpler auth, friendlier free tier.

#### Web Search
- **Group:** `web` · **Provider:** none
- **Tool:** `web-search`
- **API:** Tavily (start here — cleanest LLM-grounded results) or Brave Search
- **Config:** Org-level API key in env (`TAVILY_API_KEY`), or per-artifact override
- **Notes:** Closes the RAG gap. Return top-N snippets + URLs as text content so the model cites them.

### Tier 2 — Paid

#### HubSpot
- **Group:** `hubspot` · **Provider:** `hubspot` (new)
- **Tools:** `hubspot-find-contact`, `hubspot-create-contact`, `hubspot-update-contact`, `hubspot-create-deal`, `hubspot-create-ticket`, `hubspot-add-note`
- **API:** HubSpot CRM v3
- **Scopes:** `crm.objects.contacts.write crm.objects.deals.write tickets oauth`

#### Intercom
- **Group:** `intercom` · **Provider:** `intercom` (new)
- **Tools:** `intercom-create-ticket`, `intercom-add-note`, `intercom-find-contact`, `intercom-create-contact`, `intercom-tag-conversation`
- **API:** Intercom v2.11
- **Notes:** Pick over Zendesk as the *first* CRM escalation — cleanest API, sensible free tier.

#### Lead Capture
- **Group:** `leads` · **Provider:** none
- **Tool:** `collect-lead`
- **Storage:** new table `artifact_lead` (id, artifactId, conversationId, fields JSON, createdAt) — add to [schema.ts](../../../../packages/db/src/lib/schema.ts)
- **Config schema:** fields to collect (label, key, required, type), surfaced to the model via the tool's input schema
- **Notes:** Most useful for *channel* bots (Telegram/WhatsApp support) where the conversation starts anonymous. MCP-client users are already identified, so this is paid-tier, not default-on.

### Tier 3 — Pro / Enterprise

| Group | Provider | Tools | Notes |
|---|---|---|---|
| `salesforce` | `salesforce` | `find-contact`, `create-lead`, `create-opportunity`, `create-case` | Mirror HubSpot shape. |
| `zendesk` | `zendesk` | `create-ticket`, `update-ticket`, `add-comment`, `search-tickets` | Second escalation option after Intercom. |
| `twilio` | `twilio` (API key) | `sms-send`, `whatsapp-send` | Outbound messaging mid-conversation. |
| `sheets` | new `google-sheets` provider | `sheets-append-row`, `sheets-read-range`, `sheets-find-row` | "Log to spreadsheet" — common ask. |
| `airtable` | `airtable` (PAT) | `airtable-list-records`, `airtable-create-record`, `airtable-update-record` | Same use case as Sheets, different audience. |
| `custom-code` | — | User-authored JS handler | Enterprise differentiator. Sandbox via `vm` or isolate. See [TASKS.md:27](../../../../TASKS.md#L27). |

## Roadmap — proxy via `mcp-proxy`, don't build

Skip the native handler for these. Use the `mcp-proxy` definition (spec below) to connect the vendor's official MCP server.

| Service | Official MCP | Tier |
|---|---|---|
| Notion | [makenotion/notion-mcp-server](https://github.com/makenotion/notion-mcp-server) | Paid |
| GitHub | [github/github-mcp-server](https://github.com/github/github-mcp-server) | Paid |
| Linear | Linear MCP (changelog 2025-05) | Paid |
| Stripe | [stripe/agent-toolkit](https://github.com/stripe/agent-toolkit) | Paid |
| Atlassian (Jira + Confluence) | Atlassian Remote MCP | Paid / Pro |
| Sentry | Sentry official MCP | Pro |
| Cloudflare | Cloudflare MCP | Pro |
| PayPal | PayPal MCP | Pro |
| Bring-your-own URL | any HTTP MCP server | Pro / Enterprise |

For Pro/Enterprise users, allow arbitrary MCP URLs. For Free/Paid, only the curated list above — see security notes in the `mcp-proxy` section.

## The `mcp-proxy` tool definition

One `tool_definition` (`key = 'mcp-proxy'`) that produces *many* MCP tools at runtime, derived from each `artifact_tool` of this kind on the artifact.

### `artifact_tool.config` shape

```ts
{
  url: string;                          // remote MCP server URL
  transport: 'streamable-http' | 'sse'; // default 'streamable-http'
  auth?:
    | { kind: 'none' }
    | { kind: 'bearer'; token: string }              // stored in artifact_credential
    | { kind: 'oauth'; credentialId: string }        // bound to an existing OAuth credential
    | { kind: 'header'; name: string; value: string };
  prefix?: string;        // default = the vendor slug; tools register as `<prefix>__<remote-key>`
  allowedTools?: string[]; // optional allowlist of remote tool keys; default = all
  allowedResources?: boolean; // expose remote resources to the artifact (default false)
  allowedPrompts?: boolean;   // expose remote prompts (default false)
  curatedServerId?: string;   // if set, validates against the curated registry
}
```

### Server-boot integration

In [controllers/mcp/index.ts](../controllers/mcp/index.ts), after the local prompt/resource/tool registration loop but before `mcpServer.connect(transport)`:

1. For each `artifact_tool` whose definition key is `mcp-proxy`, build an MCP `Client` against `config.url` with the configured transport and auth.
2. Call `client.listTools()`. For each remote tool, register it on the local `mcpServer` with key `<prefix>__<remoteKey>`, forwarding the input schema verbatim and routing the handler to `client.callTool({ name: remoteKey, arguments: args })`.
3. Same for `client.listResources()` / `client.listPrompts()` when their allow-flags are on.
4. Cache the discovery payload in `mcp_session.metadata` keyed by `(artifactToolId, serverEtag)` so the next request to the same session skips the round-trip. Invalidate on session close.
5. Record each proxied call in `mcp_request` like any native tool. Track which `artifactToolId` it routed through so analytics can attribute "Notion tool calls" vs "GitHub tool calls."

### Security

- Free/Paid tiers: `config.url` must match an entry in a curated server registry (table `mcp_server_catalog` with `slug`, `name`, `url`, `auth_kind`, `default_scopes`, `verified`). Reject otherwise.
- Pro/Enterprise: arbitrary URLs allowed, but never `localhost`, private IPs, or `127.0.0.0/8` ranges. Resolve once and pin the resolved IP for the session.
- Strip every header from the remote response except `mcp-session-id` and `content-type`. Don't forward `set-cookie` or vendor auth headers back to the MCP client.
- Tool descriptions from the remote server are untrusted user content (the remote could attempt prompt injection). Prefix the tool description with `[via <vendor>]` so the model knows it's third-party.

### Required code changes

- New `mcp-proxy` entry in [registry.ts](registry.ts) whose handler is unused (registration happens at boot) but whose schema rejects direct calls.
- Boot-time hook in [controllers/mcp/index.ts](../controllers/mcp/index.ts) that runs the discovery loop above.
- New table `mcp_server_catalog` in [schema.ts](../../../../packages/db/src/lib/schema.ts) for the curated list.
- An MCP client wrapper in [apps/mcp/src/utils/](../utils/) — wraps `@modelcontextprotocol/sdk/client` with retry, timeout, and the body-size cap.

## The `http-endpoint` tool definition

One `tool_definition` (`key = 'http-endpoint'`) that produces *one* named MCP tool per `artifact_tool` row. Lets users expose their own HTTP endpoints to the agent without writing TypeScript.

Each `artifact_tool` of this kind = one named tool the model can call. So one artifact might have three rows: `lookup-order`, `create-refund`, `check-stock` — three concrete MCP tools, all backed by this same definition.

### `artifact_tool.config` shape

```ts
{
  // Identity — surfaced to the model
  name: string;          // becomes the MCP tool key, e.g. 'lookup-order'
  title: string;         // human label, e.g. 'Look up order'
  description: string;   // tool description for the model; explain when to call it

  // Request
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;           // supports {{arg}} interpolation from the input args
  headers?: Array<{
    name: string;
    value: string;       // supports {{arg}} interpolation + secret refs (see auth)
  }>;
  query?: Array<{ name: string; value: string }>; // supports interpolation
  body?: {
    kind: 'none' | 'json' | 'form' | 'text';
    template: string;    // raw string; {{arg}} interpolated; for 'json' it must parse
  };

  // Input schema the model fills in — same shape as the existing JsonSchema util
  inputSchema: JsonSchema;

  // Response handling
  response: {
    contentType?: 'auto' | 'json' | 'text';
    maxBytes?: number;       // cap at 256KB by default; truncate with marker
    jsonPath?: string;       // optional: extract a sub-tree before returning
    successStatus?: number[]; // default [200..299]; non-success returns as error text
  };

  // Auth — kept out of `headers` so secrets aren't in plain config
  auth?:
    | { kind: 'none' }
    | { kind: 'bearer'; credentialId: string }
    | { kind: 'basic'; credentialId: string }
    | { kind: 'api-key'; in: 'header' | 'query'; name: string; credentialId: string }
    | { kind: 'oauth'; credentialId: string };

  // Safety
  timeoutMs?: number;     // default 10_000, cap 30_000
  allowedHosts?: string[]; // org-enforced allowlist if set; rejects others
}
```

### Behavior

1. At MCP server boot, for each `artifact_tool` of definition `http-endpoint`, register one MCP tool with `name`, `title`, `description`, and `inputSchema` from the config.
2. On invocation: interpolate `{{arg}}` in url/headers/query/body using the validated input args (URL-encoded for query, JSON-stringified for body where appropriate).
3. Resolve `auth.credentialId` against `artifact_credential`; add the resolved header / query param right before the fetch. Never log the resolved value.
4. Fire the request with the timeout. If the status is outside `successStatus`, return `Error: HTTP <status> — <truncated body>` as text content (per the convention below).
5. Apply `response.jsonPath` if set, then cap to `maxBytes`, then return as text content.

### Security

- `url` host validated: never `localhost`, `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, or `::1`. Resolve before fetch; reject if DNS returns a private range (defense against rebinding).
- `allowedHosts`, if set on the artifact (or org-wide), takes precedence — any host outside the list is rejected.
- Body size cap on the request (1MB default), response cap on `maxBytes`.
- Credentials referenced by `credentialId` only — never inlined in headers. Stored encrypted in `artifact_credential` like every other secret.
- Rate-limit per `artifact_tool` (e.g. 60/min) to prevent the model from hammering a customer's backend in a loop.

### Required code changes

- New `http-endpoint` entry in [registry.ts](registry.ts) (handler unused; registration at boot).
- Boot-time hook in [controllers/mcp/index.ts](../controllers/mcp/index.ts) that walks `http-endpoint` rows and registers a tool per row, sharing the same dispatch helper.
- Shared interpolation helper in [apps/mcp/src/utils/](../utils/) that handles `{{arg}}` substitution with HTML/URL/JSON escaping per context (don't naively `replaceAll` — interpolating into a JSON body without escaping is an injection vector).
- UI in [apps/web](../../../web/) for the config form: name, description, method, URL, headers list, body editor, input schema builder, auth picker, host allowlist. This is the user-facing surface — without a clean form, the feature is unusable.

## Conventions

- **Naming:** native tools are `<group>-<verb>-<object>` (`gmail-send-email`, `hubspot-create-contact`). Verbs: `list`, `get`, `create`, `update`, `delete`, `send`, `search`, `find`. Proxied tools take the form `<vendor>__<remote-key>` (double underscore so the vendor prefix is visually distinct).
- **Schemas:** zod-friendly JSON Schema. Mark every required arg `required`; give every field a `description` — the model reads it.
- **Errors:** return as `text` content with the prefix `Error: …` rather than throwing, unless the failure should retry. Throwing is captured as `errorMessage` in `mcp_request` and shown to the user as a tool failure.
- **OAuth re-auth:** when a credential needs re-auth (see [`isCredentialNeedingReauth`](../../../../packages/utils/src/oauth.ts)), surface a clear `Error: <provider> credential needs to be re-authorized. Open the Tools page and re-link <provider>.` — matches the pattern in [mcp/index.ts](../controllers/mcp/index.ts).
- **Per-tool config:** static settings (default channel, default mailbox, allowed domains) live in `artifact_tool.config`. Per-call args live in the tool's input schema. Don't put secrets in `config` — those belong in `artifact_credential` or org-level env.
- **Heavy work:** anything that needs Playwright, PDF parsing, multipart >100MB, or long-running fetch goes to the resource-handler container, not in-Worker.

## Tier gating

Tier is enforced at the `artifact_tool` insert path (not here in the registry). The catalog endpoint should return all definitions but flag premium ones so the UI can paywall — see [CatalogController](../../../api/src/controllers/catalog/) for the surface that lists them. Two extra rules for the proxy/endpoint definitions:

- `mcp-proxy` rows on Free/Paid must match the curated `mcp_server_catalog`. Pro/Enterprise can use arbitrary URLs.
- `http-endpoint` rows on Free are capped at N tools (e.g. 1); Paid at M (e.g. 10); Pro/Enterprise unlimited. The host allowlist is org-enforced only on Pro+ (Free/Paid users can call any non-private host within the cap).
