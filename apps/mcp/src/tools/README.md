# MCP Tools

Tools exposed to MCP clients (Claude Desktop, ChatGPT, Cursor, Notion Custom Agents, channel bots). Each tool is a `ToolDefinition` registered in [registry.ts](registry.ts) and wired to a `toolDefinition` row via its `key`.

## How a tool plugs in

- A row in `tool_group` (with optional `provider` for OAuth- or API-key-bound tools) and a row in `tool_definition` (with a unique `key`).
- A `ToolDefinition` exported from this folder and registered in [registry.ts](registry.ts) under the same `key`.
- Handler receives [`ToolContext`](types.ts): `config`, `credentials[]` (already refreshed and filtered to the group's `provider`), `resources[]`, `bucket` (R2), `env`, `db`, `artifactId`, `embedQuery`.
- Handler returns `{ content: [{ type: 'text', text }] }`. Anything CPU/binary-heavy (PDF, headless browser, large multipart) belongs in [apps/resource-handler](../../../resource-handler/) — call it through the `RESOURCE_HANDLER` DO.
- Auth and per-tool/group config are wired the same way for every provider — see [Provider auth](#provider-auth) and [Config & the Tools UI](#config--the-tools-ui).

## Build vs. proxy

Two flavors of tool in this codebase:

- **Native tools** — TypeScript handlers in this folder. One `tool_definition` row = one MCP tool. Use when the vendor has no MCP server, when the tool is Ganju domain logic, or when channel runtime needs end-to-end control.
- **Proxied tools** — `mcp-proxy` and `http-endpoint` definitions where one `tool_definition` row produces _many_ MCP tools at server boot, derived from the `artifact_tool.config` of each instance. Use when the vendor already ships an MCP server (Notion, GitHub, Linear, Stripe, Atlassian, Sentry, Cloudflare), or when the user wants to expose their own backend without a TypeScript handler.

The default position: **proxy first, build only when there's no good MCP server or it's Ganju-specific**. Hand-rolling a Notion tool when Notion ships and maintains its own is wasted effort.

## Provider auth

A tool group's `provider` ties it to an `artifact_credential` row; the MCP server refreshes (if applicable) and filters `credentials[]` to that provider before calling the handler — so **handlers never deal with auth flow, only `credentials[0].accessToken`**. Two flavors:

**OAuth** (Gmail, Outlook, Google Drive/Calendar, Slack):

- Register in [constants.ts](../../../../packages/utils/src/constants.ts): `OAUTH_PROVIDERS`, `OAUTH_AUTH_URLS`, `OAUTH_TOKEN_URLS`.
- Add scopes + client env names in [apps/api providers.ts](../../../api/src/utils/providers.ts) and the refresh env map in [apps/mcp refreshCredential.ts](../utils/refreshCredential.ts).
- Refresh is automatic via [`refreshOAuthToken`](../../../../packages/utils/src/oauth.ts); expired refresh tokens flip the credential to `needsReauth`.
- Tools UI shows **Connect** → `GET /oauth/:provider/authorize` → consent → callback stores the credential.

**API key** (Cal.com and Tavily; pattern for Airtable/etc.):

- Add the provider to `API_KEY_PROVIDERS` in [constants.ts](../../../../packages/utils/src/constants.ts). No `providers.ts` entry, no scopes, no refresh.
- The key is stored as an `artifact_credential` (encrypted `accessToken`, null `refreshToken`/`expiresAt`) via `POST …/artifact/credential` → [`ArtifactController.createCredential`](../../../api/src/controllers/artifact/index.ts). **The key is validated against the vendor before it's persisted** (Cal.com: `validateCalcomApiKey` hits `GET /v2/event-types`; Tavily: `validateTavilyApiKey` runs a minimal 1-result `POST /search`); an invalid key is rejected with an `Invalid …` error that surfaces in the UI, and nothing is written.
- `refreshCredentialIfNeeded` is a no-op for these (no refresh token), so `credentials[0].accessToken` is the raw key.
- Tools UI shows **Add API key** (a modal that POSTs the key) instead of Connect; Disconnect/`needsReauth`/connected-state reuse the OAuth plumbing.

## Config & the Tools UI

Config lives on `artifact_tool.config` (JSON, per tool). Two scopes:

- **Group-level** — settings that describe the _connection_, not one tool: Google Calendar's `defaultCalendarId` / `defaultTimeZone` / `sendUpdates`, Cal.com's `defaultEventTypeId` / `defaultTimeZone`. Edited **once** in the group header and **fanned out** to every installed tool in the group (`saveGroupToolConfig` in [apps/web tools view](../../../web/src/components/views/tools/index.tsx)). Dropdowns are populated by API listing endpoints (`GET …/artifact/google-calendar/calendars`, `GET …/artifact/calcom/event-types`). Newly-enabled tools inherit the current group defaults.
- **Per-tool** — knobs that tune one tool (list page size, working hours, buffer, Meet on/off). Declared as a typed schema in `CALENDAR_TOOL_FIELDS` in [constants.ts](../../../../packages/utils/src/constants.ts) and rendered as a form in the tool's edit modal. Tools that only have group-level settings show a "managed at the group level" note instead of the raw JSON editor.

Handlers resolve every setting the same way: **`args.<override>` → `config.<default>` → fallback**. The override arg is an escape hatch, not the default — the agent's job is "book at 7am", the owner's job is "book where". Don't put secrets in `config` (they belong in `artifact_credential`).

### Time zone: the fallback comes from the vendor, not from us

Time zone is the one setting where `config.<default>` → fallback was not good enough, and it is worth reading before adding any setting that has the same shape.

Every scheduling question the model answers is a time-zone question first: "tomorrow at 9" is not an instant until you know whose 9 it is. The chain above had two answers and neither worked. `config.defaultTimeZone` is only written when the owner opens a dropdown and **changes** it, so in practice it is empty on nearly every install — and the fallbacks underneath it were `undefined` for Google (which then uses the calendar's own zone, and only helps when the timestamp carries no offset) and the literal `'UTC'` for Cal.com, which booked the attendee in a zone nobody lives in and told no one.

**But the user already answered this question** — in Google Calendar's settings, and in their Cal.com profile. So we ask the vendor rather than asking the owner again, and that answer becomes the default under any explicit choice. One new step, third in the chain:

**`args.timeZone` → `config.defaultTimeZone` → the zone cached on the connection → vendor-specific fallback**

[timeZone.ts](./timeZone.ts) owns the chain (`resolveEffectiveTimeZone`) and the refresh (`refreshVendorTimeZoneIfStale`); [vendorTimeZone.ts](../../../../packages/utils/src/vendorTimeZone.ts) owns the cache and the two vendor readers.

**It is cached on `artifact_credential.metadata`, because that is what it is a property of** — the connected account, not the tool row. One artifact can have six calendar tools installed and they all share one connection, so the connection is the only place the answer belongs exactly once. Two keys, `timeZone` and `timeZoneCheckedAt`, namespaced so they cannot collide with the reauth markers the OAuth refresh path writes to the same column. `writeCredentialTimeZone` **merges** rather than replaces for exactly that reason: a bare `{ timeZone }` would clear `needsReauth` and silently re-enable a connection the refresh path had flagged as broken.

**Three places fill the cache, and the ordering rule is the same in all of them: after the commit, best-effort.**

- **On connect** — the OAuth callback ([oauth/index.ts](../../../api/src/controllers/oauth/index.ts)) for Google Calendar, and `createCredential` ([artifact/index.ts](../../../api/src/controllers/artifact/index.ts)) for a Cal.com key — so the model has the zone from the moment the account is linked rather than from the first tool call. A connection that works is worth more than a zone we can look up again, so nothing here can fail the callback the user is waiting on. Note the API-key replace path nulls `metadata` first, which is correct — a new key can be a different account — and this is what puts the zone back.
- **On the tool-call path**, when the cached value has aged out. The TTL is **24 hours**: this changes when somebody moves or travels, rarely and never urgently, so the cost of being briefly stale is one meeting in the old zone, while a shorter TTL is a vendor round trip on the path of every call. The alternative — refreshing only when the owner opens the dashboard — leaves an artifact whose owner moved cities booking in the old zone indefinitely, and the owner has no reason to visit a page about a thing they believe is working.

A cache with no `timeZoneCheckedAt` stamp reads as **stale rather than fresh-forever** — the conservative direction, since the only cost is one request. A vendor that reports no zone still stamps the check, so it is asked once a day rather than on every call. And the refresh writes the new metadata back onto the in-memory credential too, since several tools can run against one boot.

**Everything about the read is best-effort.** Both readers return `null` on a non-200, on a throw, and on a zone `Intl.DateTimeFormat` cannot resolve — because everything downstream (`Intl`, Google's `start.timeZone`, Cal.com's `attendee.timeZone`) throws or 400s on a name it cannot parse, so a vendor returning something unexpected must degrade to "we don't know" rather than poison every later call. A throw here would take a tool call or a whole chat turn with it.

Two vendor details worth not rediscovering:

- **Google reads `GET /calendars/primary`, deliberately not `GET /users/me/settings/timezone`.** The settings endpoint is the more direct answer to "what did the user configure" and needs `calendar.settings.readonly` — a scope we do not request and could not add without sending every already-connected user back through consent. The primary calendar's zone is the same value in every case that matters, and `calendar.readonly` already covers it.
- **Cal.com's `/v2/me` zone is the _host's_**, the one their availability is written in. For `calcom-create-booking` that is a guess about the attendee rather than a fact — but it is a far better guess than the hardcoded `'UTC'` it replaced, since a local business books local customers. An explicit `attendeeTimeZone` still wins, and the tool description now tells the model to pass one whenever the conversation reveals where the attendee is.

**The channel runner reads the cache, never fetches it.** The zone goes in the system prompt, because by the time a handler runs the instant is already chosen — the model has to resolve "today" and "9am" before it calls anything. A chat turn must not wait on Google or Cal.com to answer before the model starts thinking, so the runner takes whatever is cached and moves on. Fixed in the same pass: it recognised only the `calendar-` prefix, so an artifact that booked exclusively through Cal.com got neither the zone nor the ISO-8601 instruction beside it. Both prefixes count as scheduling tools now.

**Verified** by [verify-vendor-timezone.mjs](../../../../scripts/verify-vendor-timezone.mjs) — 36 checks, all passing. Pure logic and a stubbed fetch, no network and no credential decrypted: the precedence chain at every rung, the merge preserving reauth markers, the staleness rule including a missing and an unparseable stamp, and both readers' parsing and degrade-to-null contract, including that Google hits `/calendars/primary` and Cal.com sends its version header.

## Shipped

| Key                                                                                                                                           | Group           | Provider            | Notes                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `greeting`                                                                                                                                    | greeting        | —                   | Sample tool. Keep as smoke test.                                                                                                                                                                                                                                              |
| `list-resources`                                                                                                                              | resources       | —                   | Lists artifact resources.                                                                                                                                                                                                                                                     |
| `search-resources`                                                                                                                            | resources       | —                   | Vector search via `embedQuery` over `artifact_resource_chunk`.                                                                                                                                                                                                                |
| `read-resource`                                                                                                                               | resources       | —                   | Reads one resource (handles templates with `{{var}}` substitution).                                                                                                                                                                                                           |
| `send-resource`                                                                                                                               | resources       | —                   | Pushes a resource into the active channel conversation.                                                                                                                                                                                                                       |
| `gmail-send-email` / `gmail-reply-email` / `gmail-forward-email`                                                                              | gmail           | `google-gmail`      | Compose flow.                                                                                                                                                                                                                                                                 |
| `gmail-list-emails` / `gmail-read-email` / `gmail-trash-email`                                                                                | gmail           | `google-gmail`      | Inbox read flow.                                                                                                                                                                                                                                                              |
| `gmail-list-labels` / `gmail-modify-labels` / `gmail-batch-modify-labels`                                                                     | gmail           | `google-gmail`      | Label mgmt.                                                                                                                                                                                                                                                                   |
| `gmail-list-threads` / `gmail-get-thread`                                                                                                     | gmail           | `google-gmail`      | Thread view.                                                                                                                                                                                                                                                                  |
| `gmail-create-draft` / `gmail-list-drafts` / `gmail-get-draft` / `gmail-update-draft` / `gmail-delete-draft` / `gmail-send-draft`             | gmail           | `google-gmail`      | Draft CRUD.                                                                                                                                                                                                                                                                   |
| `gmail-get-profile`                                                                                                                           | gmail           | `google-gmail`      | Account info.                                                                                                                                                                                                                                                                 |
| `outlook-send-email` / `outlook-reply-email` / `outlook-forward-email`                                                                        | outlook         | `microsoft-outlook` | Compose flow. Attachments >3MB use Graph upload session via resource-handler.                                                                                                                                                                                                 |
| `outlook-list-emails` / `outlook-read-email` / `outlook-trash-email`                                                                          | outlook         | `microsoft-outlook` | Inbox read flow.                                                                                                                                                                                                                                                              |
| `outlook-list-folders` / `outlook-move-message` / `outlook-batch-move-messages`                                                               | outlook         | `microsoft-outlook` | Folder mgmt (Outlook's analog to Gmail labels).                                                                                                                                                                                                                               |
| `outlook-list-threads` / `outlook-get-thread`                                                                                                 | outlook         | `microsoft-outlook` | Thread view (conversationId-based).                                                                                                                                                                                                                                           |
| `outlook-create-draft` / `outlook-list-drafts` / `outlook-get-draft` / `outlook-update-draft` / `outlook-delete-draft` / `outlook-send-draft` | outlook         | `microsoft-outlook` | Draft CRUD.                                                                                                                                                                                                                                                                   |
| `outlook-get-profile`                                                                                                                         | outlook         | `microsoft-outlook` | Account info.                                                                                                                                                                                                                                                                 |
| `slack-send-message`                                                                                                                          | slack           | `slack`             | Post to a channel / DM / thread via `chat.postMessage`. Routes through resource-handler.                                                                                                                                                                                      |
| `slack-list-channels`                                                                                                                         | slack           | `slack`             | Discover channel IDs via `conversations.list`.                                                                                                                                                                                                                                |
| `slack-search-messages`                                                                                                                       | slack           | `slack`             | `search.messages` — **user token (xoxp) only**, requires `search:read`.                                                                                                                                                                                                       |
| `slack-get-user`                                                                                                                              | slack           | `slack`             | `users.info` / `users.lookupByEmail`.                                                                                                                                                                                                                                         |
| `slack-upload-file`                                                                                                                           | slack           | `slack`             | Upload an artifact resource via `files.getUploadURLExternal` + `completeUploadExternal`. 100MB cap.                                                                                                                                                                           |
| `calendar-list-calendars`                                                                                                                     | google-calendar | `google-calendar`   | `calendarList.list` — discover calendar IDs (and which to lock as default).                                                                                                                                                                                                   |
| `calendar-list-events`                                                                                                                        | google-calendar | `google-calendar`   | `events.list` with `singleEvents`/`orderBy=startTime`. Defaults `timeMin` to now.                                                                                                                                                                                             |
| `calendar-create-event`                                                                                                                       | google-calendar | `google-calendar`   | `events.insert`. Emails attendees (`sendUpdates=all`) when any are passed.                                                                                                                                                                                                    |
| `calendar-update-event`                                                                                                                       | google-calendar | `google-calendar`   | `events.patch` (partial). Passing attendees replaces the list.                                                                                                                                                                                                                |
| `calendar-delete-event`                                                                                                                       | google-calendar | `google-calendar`   | `events.delete`. Permanent; notifies attendees.                                                                                                                                                                                                                               |
| `calendar-find-free-slots`                                                                                                                    | google-calendar | `google-calendar`   | `freeBusy.query` → computed gaps; optional `durationMinutes` filter.                                                                                                                                                                                                          |
| `calcom-list-event-types`                                                                                                                     | calcom          | `calcom` (API key)  | `GET /v2/event-types` — discover the `eventTypeId` to lock as default.                                                                                                                                                                                                        |
| `calcom-list-available-slots`                                                                                                                 | calcom          | `calcom` (API key)  | `GET /v2/slots` — open slots for the default event type.                                                                                                                                                                                                                      |
| `calcom-create-booking`                                                                                                                       | calcom          | `calcom` (API key)  | `POST /v2/bookings` against the default event type; attendee from the conversation.                                                                                                                                                                                           |
| `calcom-cancel-booking`                                                                                                                       | calcom          | `calcom` (API key)  | `POST /v2/bookings/{uid}/cancel`.                                                                                                                                                                                                                                             |
| `web-search`                                                                                                                                  | web             | `tavily` (API key)  | `POST /search` — top-N results + synthesized `answer`; `topic=news` with `days` window.                                                                                                                                                                                       |
| `web-extract`                                                                                                                                 | web             | `tavily` (API key)  | `POST /extract` — full cleaned page text for known URL(s).                                                                                                                                                                                                                    |
| `http-endpoint`                                                                                                                               | (per-instance)  | per-endpoint secret | **Proxied definition** — one installed row = one named tool against a user HTTP API. Config builder + raw-JSON editor in the Tools UI. See [the http-endpoint section](#the-http-endpoint-tool-definition).                                                                   |
| `mcp-proxy`                                                                                                                                   | (per-instance)  | per-server secret   | **Proxied definition** — one installed row connects a curated remote MCP server and registers one `<prefix>__<tool>` per remote tool. Full stack shipped (discovery + boot + write-path + connect/configure UI). See [the mcp-proxy section](#the-mcp-proxy-tool-definition). |

Baseline pattern to copy when adding a new native provider: [gmail/index.ts](gmail/index.ts).

## Roadmap — native tools to build

Build order reuses already-scaffolded OAuth providers first, then no-auth tools, then new providers. **Tier 1 is already shipped** (along with Gmail, Outlook, and Slack — see the [Shipped](#shipped) table); it's kept here for context. The actual remaining build targets start at **Tier 2**.

### Tier 1 — Free / default-discoverable (shipped)

Both calendar integrations are **shipped end-to-end** (tools + config UI) — see the table above and the [Provider auth](#provider-auth) / [Config & the Tools UI](#config--the-tools-ui) sections:

> **Google Calendar** (`google-calendar`, OAuth). Group-level default calendar / time zone / attendee-notification controls, plus per-tool forms for `list-events`, `create-event`, and `find-free-slots`. Falls back to the `primary` calendar and the calendar's own zone when unset.

> **Cal.com** (`calcom`, **API key — no OAuth**). The Tools page shows an **Add API key** modal (the key is validated against Cal.com before it's stored), plus group-level **default event type** (dropdown from `calcom-list-event-types`) and **default time zone**. NL booking flow: the model converts "7am tomorrow" to ISO, then `calcom-list-available-slots` → `calcom-create-booking` against `defaultEventTypeId`; the attendee name/email come from the channel conversation participant.

Web Search is **shipped end-to-end** (tools + the generic API-key UI):

> **Web Search** (`web`, **Tavily API key — no OAuth**). The Tools page shows an **Add API key** modal (the key is validated against Tavily via a minimal 1-result search before it's stored). Tools: `web-search` (`POST /search` — top-N results + a synthesized `answer`; `topic=news` honors an optional `days` window; `includeDomains`/`excludeDomains` allow/blocklists) and `web-extract` (`POST /extract` — full cleaned text for specific URLs). Per-tool config: `defaultMaxResults`, `defaultSearchDepth`, `defaultTopic`. Closes the RAG gap — results carry URLs so the model can cite them.

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
- **Notes:** Pick over Zendesk as the _first_ CRM escalation — cleanest API, sensible free tier.

#### Lead Capture

- **Group:** `leads` · **Provider:** none
- **Tool:** `collect-lead`
- **Storage:** new table `artifact_lead` (id, artifactId, conversationId, fields JSON, createdAt) — add to [schema.ts](../../../../packages/db/src/lib/schema.ts)
- **Config schema:** fields to collect (label, key, required, type), surfaced to the model via the tool's input schema
- **Notes:** Most useful for _channel_ bots (Telegram/WhatsApp support) where the conversation starts anonymous. MCP-client users are already identified, so this is paid-tier, not default-on.

### Tier 3 — Pro / Enterprise

| Group         | Provider                     | Tools                                                                       | Notes                                                                                                |
| ------------- | ---------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `salesforce`  | `salesforce`                 | `find-contact`, `create-lead`, `create-opportunity`, `create-case`          | Mirror HubSpot shape.                                                                                |
| `zendesk`     | `zendesk`                    | `create-ticket`, `update-ticket`, `add-comment`, `search-tickets`           | Second escalation option after Intercom.                                                             |
| `twilio`      | `twilio` (API key)           | `sms-send`, `whatsapp-send`                                                 | Outbound messaging mid-conversation.                                                                 |
| `sheets`      | new `google-sheets` provider | `sheets-append-row`, `sheets-read-range`, `sheets-find-row`                 | "Log to spreadsheet" — common ask.                                                                   |
| `airtable`    | `airtable` (PAT)             | `airtable-list-records`, `airtable-create-record`, `airtable-update-record` | Same use case as Sheets, different audience.                                                         |
| `custom-code` | —                            | User-authored JS handler                                                    | Enterprise differentiator. Sandbox via `vm` or isolate. See [TASKS.md:27](../../../../TASKS.md#L27). |

## Roadmap — proxy via `mcp-proxy`, don't build

Skip the native handler for these. Use the `mcp-proxy` definition (spec below) to connect the vendor's official MCP server.

| Service                       | Official MCP                                                                    | Tier             |
| ----------------------------- | ------------------------------------------------------------------------------- | ---------------- |
| Notion                        | [makenotion/notion-mcp-server](https://github.com/makenotion/notion-mcp-server) | Paid             |
| GitHub                        | [github/github-mcp-server](https://github.com/github/github-mcp-server)         | Paid             |
| Linear                        | Linear MCP (changelog 2025-05)                                                  | Paid             |
| Stripe                        | [stripe/agent-toolkit](https://github.com/stripe/agent-toolkit)                 | Paid             |
| Atlassian (Jira + Confluence) | Atlassian Remote MCP                                                            | Paid / Pro       |
| Sentry                        | Sentry official MCP                                                             | Pro              |
| Cloudflare                    | Cloudflare MCP                                                                  | Pro              |
| PayPal                        | PayPal MCP                                                                      | Pro              |
| Bring-your-own URL            | any HTTP MCP server                                                             | Pro / Enterprise |

For Pro/Enterprise users, allow arbitrary MCP URLs. For Free/Paid, only the curated list above — see security notes in the `mcp-proxy` section.

## The `mcp-proxy` tool definition

**Shipped end to end** (discovery + boot registration + write-path + connect/configure UI). One `tool_definition` (`key = 'mcp-proxy'`) where each installed `artifact_tool` connects one remote MCP server (a vendor's official server) and registers _many_ local MCP tools — one `<prefix>__<remoteKey>` per remote tool. Connected from the Tools page via the [McpProxyModal](../../../../apps/web/src/components/views/tools/McpProxyModal.tsx) (paste a token → discover → toggle tools → save).

So one artifact might install one `mcp-proxy` row for GitHub and get `github__search_repositories`, `github__get_file_contents`, … as concrete MCP tools.

### Key design choice: configure-time discovery

The MCP worker boots a fresh `McpServer` per request (stateless). Rather than calling the remote `listTools()` on every request (latency, and a down remote would break the whole artifact endpoint), discovery happens **once at configure-time** in `apps/api`: when the tool is created/updated, the API connects to the remote, lists its tools, and stores the tool list + input schemas on `artifact_tool.metadata.discovery`. The boot loop registers tools from that stored payload — **zero remote round-trips for `initialize`/`tools/list`; only `tools/call` connects to the remote.** (This mirrors how `http-endpoint` stores its `inputSchema` in config.)

### Catalog & relationship

Curated servers live in `mcp_server_catalog` (slug, name, url, transport, auth_kind, default_scopes, verified) — an admin-seeded registry, the proxy analog of `tool_definition`. It's surfaced to the UI via `GET /catalog/mcp-servers`, so a server like **GitHub** shows up in the catalog as its own card. An install links to it through a real FK column `artifact_tool.mcp_server_catalog_id` (with a Drizzle relation), so the link is first-class and queryable ("which artifacts connect GitHub") rather than buried in JSON.

Because a server's tools are discovered dynamically (not pre-seeded), the UI lists them via the **preview endpoint** `POST …/artifact/mcp-proxy/discover`. It accepts an **inline token** (`{ curatedServerId, token }`) and connects/lists _without persisting anything_ — so the token is **validated before it's stored**: if it can list tools it's good, and only then does the UI persist a credential and create the install. (It also accepts a stored `credentialId` to re-list an existing connection.) The chosen tool subset is saved as the `allowed*` lists below; the full available set is stored on `metadata.discovery` so the toggles re-render without re-hitting the remote.

### `artifact_tool.config` shape

```ts
{
  curatedServerId: string;              // catalog row id (also mirrored to the FK column)
  url: string;                          // filled server-side from the catalog row
  transport: 'streamable-http' | 'sse'; // filled server-side from the catalog row
  prefix?: string;                      // default = catalog slug; tools register as `<prefix>__<remoteKey>`
  // Per-item enable lists, all filtered at boot. Empty/absent semantics differ:
  allowedTools?: string[];              // by name; absent/empty = ALL tools (UI defaults on)
  allowedResources?: string[];          // by uri; opt-in — absent/empty = none (UI defaults off)
  allowedPrompts?: string[];            // by name; opt-in — absent/empty = none (UI defaults off)
  auth?:                                // secrets referenced by id, never inlined
    | { kind: 'none' }
    | { kind: 'bearer'; credentialId: string }
    | { kind: 'header'; name: string; credentialId: string }
    | { kind: 'oauth'; credentialId: string };
  timeoutMs?: number;                   // default 10_000, cap 30_000
}
```

`metadata.discovery` holds the configure-time result — the FULL set the remote exposes: `{ discoveredAt, serverInfo?, tools: [{ name, title?, description?, inputSchema }], resources?: [{ uri, name?, title?, description?, mimeType? }], prompts?: [{ name, title?, description?, arguments? }] }`. Prompt `arguments` (`{ name, description?, required? }[]`) drive the local prompt's argument schema at boot.

### Security

- **Curated-only (all tiers, for now).** `config.curatedServerId` must reference a `verified` row in `mcp_server_catalog`. Arbitrary URLs are rejected — deferred to a future Pro tier alongside real tier-gating.
- The remote host is SSRF-screened against private/loopback/link-local ranges (shared `isBlockedHost`) at **three** egress points: discovery (apps/api), tool calls (apps/mcp), and — for sending a proxied resource as a file — the resource-handler container, which connects to the remote server itself. Defense-in-depth even though the URL comes from the curated catalog. Workers can't resolve DNS, so only literal hosts/IPs are screened (no rebinding defense — same caveat as http-endpoint).
- Secrets are referenced by `credentialId` (stored encrypted in `artifact_credential`, provider `mcp-proxy`), decrypted server-side, and applied as a single transport header that is never logged. We use the SDK `Client` to forward calls, so no raw remote response headers (`set-cookie`, vendor auth) reach the MCP client — only the tool-result content. For the file-send path the worker decrypts the secret and hands it to the container in the request body over the internal Durable Object binding (never the public internet) — the same trust boundary the Slack/Gmail/Outlook container sends already use.
- Remote tool/prompt **names and schemas** are untrusted too. Names are validated/length-capped via [`buildProxyToolName`](../../../../packages/utils/src/mcpProxy.ts) (skip-and-log on a bad name); schema compilation and registration are wrapped per-item so one malformed remote tool/prompt can't abort the whole artifact's MCP boot — it's skipped and logged. Proxied resources dedupe by uri against native + earlier installs. Descriptions register with a `[via <prefix>] …` marker (possible prompt injection). A proxied **tool call** result is bounded to one response (verbatim blocks when it fits, else flattened to text); a proxied **resource read** is returned in full (it may be delivered to the user as a file, where truncating would corrupt it) — the model-context cap is applied by the caller that feeds a read into the model, and Worker memory bounds the read regardless.
- The bound credential's type is enforced: `bearer`/`header` must reference a per-tool `mcp-proxy` secret; `oauth` must reference an actual OAuth connection — so a config can't point a raw bearer at an unrelated token. Configure-time discovery refreshes an expired OAuth token in place ([refreshArtifactCredential](../../../api/src/utils/refreshArtifactCredential.ts)) and surfaces a clear re-auth error rather than connecting with a stale token.
- A proxied `tools/call` forwards the remote result's content blocks (text/image/resource) and `structuredContent` verbatim when within the response budget, falling back to a single flattened (untruncated) text block otherwise — no raw remote response headers (`set-cookie`, vendor auth) reach the MCP client.
- Per-`artifact_tool` rate limit (60 req / 60s) via the shared `HTTP_ENDPOINT_RATE_LIMITER` binding ([allowProxyToolCall](../utils/rateLimit.ts)), keyed by tool id — a loop guard across both proxied definitions.

### As built

- `mcp-proxy` entry in [registry.ts](registry.ts) — a parent definition whose handler rejects direct calls; real dispatch happens at boot.
- Shared zod schema `MCP_PROXY_CONFIG` + `McpProxyToolConfig`/`McpProxyDiscovery` (+ discovered tool/resource/prompt) types in [packages/utils schema.ts](../../../../packages/utils/src/schema.ts); constants in [constants.ts](../../../../packages/utils/src/constants.ts) (`TOOL_DEFINITION_KEY_MCP_PROXY`, transports/auth-kinds, limits, `CREDENTIAL_PROVIDER_MCP_PROXY`, `PER_TOOL_CREDENTIAL_PROVIDERS`).
- New table `mcp_server_catalog` + FK column `artifact_tool.mcp_server_catalog_id` (with Drizzle relation) in [schema.ts](../../../../packages/db/src/lib/schema.ts) (curated list; rows seeded out-of-band like the tool/group rows). API endpoints `GET /catalog/mcp-servers` ([CatalogController](../../../api/src/controllers/catalog/index.ts)) and `POST …/artifact/mcp-proxy/discover` (preview — lists a server's live tools/resources/prompts without persisting).
- Remote MCP client wrappers around `@modelcontextprotocol/sdk/client` with auth-header injection, SSRF screen, and a connect/list timeout: [apps/mcp utils/remoteMcpClient.ts](../utils/remoteMcpClient.ts) (per-call forwarding) and [apps/api utils/remoteMcpClient.ts](../../../api/src/utils/remoteMcpClient.ts) (configure-time discovery of tools + resources + prompts, capability-gated).
- Dispatcher [mcpProxy/index.ts](mcpProxy/index.ts): `parseMcpProxyConfig`, `parseMcpProxyDiscovery`, `buildProxyAuthHeader`, `executeMcpProxyCall` (connect → `callTool` → flatten content to text; errors return as `Error: …` text), plus `executeMcpProxyResourceRead` (connect → `readResource` → normalize contents, returned in full — no size cap, so a resource sent as a file isn't corrupted) and `executeMcpProxyPromptGet` (connect → `getPrompt` → flatten messages to text). Resource/prompt failures throw, flowing through the protocol's read/get error path like native handlers.
- Boot-time hook in [controllers/mcp/index.ts](../controllers/mcp/index.ts) registers, per install: one local tool per discovered remote tool **filtered by `config.allowedTools`** (absent/empty = all); plus **opt-in** remote resources (by uri in `allowedResources`) and prompts (by name in `allowedPrompts`, arg schema built from the discovered `arguments`). Everything registers as `<prefix>__<remoteKey>` / `[via <prefix>]`, deduped against native + earlier installs. All three surfaces are gated by the same per-`artifact_tool` rate limit and recorded in `mcp_request` with the routing `artifactToolId` — not just `tools/call`, but proxied `resources/read` and `prompts/get` too (an over-limit resource/prompt throws, matching their error path; an over-limit tool returns `Error: …` text).
- Write-path in [ArtifactController](../../../api/src/controllers/artifact/index.ts): `discoverMcpProxy` resolves the curated server + auth credential and lists the full remote surface; `buildMcpProxyToolData` (used by create/update) stores the resolved config + full `metadata.discovery` and sets the FK column; `previewMcpProxy` powers the picker. `createCredential`/`removeTool` treat `mcp-proxy` as a per-tool secret provider (fresh labelled rows; orphan cleanup on removal).
- Web UI in [tools/](../../../../apps/web/src/components/views/tools/): each `verified` catalog server (from `GET /catalog/mcp-servers`) renders as its own card; the generic "MCP Servers" tool group is hidden. The [McpProxyModal](../../../../apps/web/src/components/views/tools/McpProxyModal.tsx) drives connect → discover (`POST …/mcp-proxy/discover`, inline-token validate-before-store) → per-tool enable/disable toggles (resources/prompts in an opt-in section) → save (persists the credential, then creates/updates the install) and disconnect. Auth input follows the server's `authKind` — `none` (no token), `bearer`, `header` (header name surfaced), or `oauth`. For `oauth` the modal probes `/mcp-proxy/discover` for an existing connection; if none, a "Connect" button runs **MCP-protocol OAuth** and the tools page re-opens the modal on `?connected=<slug>` to finish tool selection.

### MCP-protocol OAuth (`auth_kind = 'oauth'`)

Modern remote MCP servers (e.g. Notion's `mcp.notion.com`) are their **own** OAuth authorization server — the token must be issued by the MCP server itself via the MCP authorization spec, not a vendor API OAuth. So `oauth` servers do NOT use [providers.ts](../../../api/src/utils/providers.ts) (that's native tools only) and need no pre-registered app/client id. [apps/api utils/mcpProxyOauth.ts](../../../api/src/utils/mcpProxyOauth.ts) drives it with the MCP SDK helpers:

1. **Start** (`POST …/artifact/mcp-proxy/oauth/start`): discover the server's protected-resource → auth-server metadata, **dynamic client registration** (RFC 7591) at the server's `/register`, build a **PKCE** authorize URL, and persist a _pending_ credential (registration + code-verifier + CSRF nonce on `metadata.mcpOauth`). Returns the authorize URL; the browser redirects.
2. **Callback** (`GET /oauth/mcp-proxy/callback`): validate the nonce, exchange the code (+ verifier) at the server's `/token`, store the issued tokens (encrypted), and redirect back to `…/tools?connected=<slug>`.
3. **Refresh**: against the MCP server's own `/token` — `resolveMcpProxyOauthSecret` (configure-time, [apps/api](../../../api/src/utils/mcpProxyOauth.ts)) and `refreshMcpOauthRuntime` (boot-time, [apps/mcp utils/mcpOauth.ts](../utils/mcpOauth.ts)).

The credential lives on the `artifact_credential` row keyed by `provider = <slug>` (so it's shared, not a per-tool secret) with all registration/auth-server state on `metadata.mcpOauth`; the install references it by id from `config.auth.credentialId`. On disconnect, `removeTool` deletes this credential too (once no other install on the artifact references it) — it's recognized as install-owned by its `metadata.mcpOauth`, the same orphan-cleanup that removes per-tool `bearer`/`header` secrets. A shared native OAuth/api-key credential (no `mcpOauth` marker, provider not in `PER_TOOL_CREDENTIAL_PROVIDERS`) is never touched.

### Not yet built (deferred)

- Tier-gating caps and arbitrary BYO-URL for Pro/Enterprise — not built for any tool yet.

## The `http-endpoint` tool definition

**Shipped end-to-end** (dispatcher + boot registration + config UI). One `tool_definition` (`key = 'http-endpoint'`) that produces _one_ named MCP tool per `artifact_tool` row. Lets users expose their own HTTP endpoints to the agent without writing TypeScript.

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

- `url` host screened against private/loopback/link-local ranges (`localhost`, `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, IPv6 link-local/unique-local). Only the final URL is checked, and only **literal** hosts/IPs — the Workers runtime can't resolve DNS, so DNS-rebinding isn't defended against here (noted inline in [httpEndpoint/index.ts](httpEndpoint/index.ts)).
- `allowedHosts`, if set on the config, takes precedence — any host outside the list is rejected (private ranges are rejected regardless).
- Request body capped at 1MB (`HTTP_ENDPOINT_MAX_REQUEST_BYTES`); response capped at `response.maxBytes`, itself clamped to the 256KB default ceiling.
- Credentials referenced by `credentialId` only — never inlined in headers. Stored encrypted in `artifact_credential` like every other secret; applied just before the fetch and never logged.
- Config is re-validated server-side on write (`HTTP_ENDPOINT_CONFIG.safeParse` in [ArtifactController.createTool / updateTool](../../../api/src/controllers/artifact/index.ts)), so a hand-crafted POST can't store a config that bypasses the schema. The MCP boot loop also skips any row that fails to parse.
- Per-`artifact_tool` rate limit (60 req / 60s) via the Cloudflare native rate-limiting binding `HTTP_ENDPOINT_RATE_LIMITER`, keyed by tool id — a loop guard so the model can't hammer a backend. See [allowProxyToolCall](../utils/rateLimit.ts) (shared with mcp-proxy) and the `[[unsafe.bindings]]` block in [wrangler.toml](../../wrangler.toml). A missing binding (local dev / inspector) degrades to "allow". Over-limit calls return `Error: rate limit exceeded …` text and are still recorded in `mcp_request`.

### As built

- `http-endpoint` entry in [registry.ts](registry.ts) — a parent definition whose handler rejects direct calls; real dispatch happens at boot.
- Shared zod schema `HTTP_ENDPOINT_CONFIG` in [packages/utils schema.ts](../../../../packages/utils/src/schema.ts) (fills defaults, clamps `timeoutMs`/`maxBytes`, validates the auth discriminated union); constants in [constants.ts](../../../../packages/utils/src/constants.ts) (`TOOL_DEFINITION_KEY_HTTP_ENDPOINT`, methods/body-kinds/auth-kinds, limits, `CREDENTIAL_PROVIDER_HTTP_ENDPOINT`).
- Dispatcher [httpEndpoint/index.ts](httpEndpoint/index.ts): `parseHttpEndpointConfig` + `executeHttpEndpoint` (SSRF screen, auth application, body shaping, timeout/abort, response cap + `jsonPath` extraction). Errors return as `Error: …` text per the convention.
- Per-context `{{arg}}` interpolation in [utils/interpolate.ts](../utils/interpolate.ts) — `url`/`json`/`header`/`raw` escaping so a value can't inject into the wrong context.
- Boot-time hook in [controllers/mcp/index.ts](../controllers/mcp/index.ts) that registers one named tool per `http-endpoint` row, resolves its `auth.credentialId` against the refreshed credentials, dedupes tool names, and records each call in `mcp_request`.
- Tools UI: [HttpEndpointModal.tsx](../../../web/src/components/views/tools/HttpEndpointModal.tsx) (guided form + raw-JSON mode, inline per-endpoint secret creation) and the endpoint-list rendering in the [tools view](../../../web/src/components/views/tools/index.tsx).
- Per-endpoint secrets are their own `artifact_credential` rows (provider `http-endpoint`, labelled in `metadata`), created via [ArtifactController.createCredential](../../../api/src/controllers/artifact/index.ts). Removing an endpoint deletes its secret in `removeTool` — but only when no other endpoint references the same `credentialId` and only for `http-endpoint`-provider rows (a shared OAuth/api-key credential is never touched).

## Channel bots (Telegram)

Channel bots are MCP consumers like any other client (Claude Desktop, ChatGPT, …) and call the same registered tools — but the channel runtime ([runner.ts](../../../api/src/controllers/channel/runner.ts)) drives a tool-calling loop directly against the MCP `Client`, which has two consequences the desktop clients don't have. Everything below applies to **native and proxied** surfaces alike; proxied (mcp-proxy / http-endpoint) tools are what make it matter, since they only exist once a server is connected.

### Resources reach the agent through two tools, not the resource protocol

The channel agent's loop consumes **tools**, not the MCP `resources/*` protocol. Artifact resources are reachable because the artifact has the native `resources` tool group installed (`list-resources` / `read-resource` / `search-resources` / `send-resource`) — so **a channel can't see any resource, proxied or artifact, unless that group is installed**. Those native handlers, however, only see _artifact_ resources. To also surface proxied (remote) resources, the runner intercepts three of them in [`executeToolCall`](../../../api/src/controllers/channel/runner.ts):

- `list-resources` → `client.listResources()` — returns the FULL set the server exposes (artifact + every connected proxy), tolerant of a `-32601` from a server that registered none.
- `read-resource` for a **non-artifact** uri → `client.readResource()` — forwards to the remote via the proxy. Artifact uris keep the native path (its binary-safe R2 short-circuit).
- `send-resource` for a **non-artifact** uri → the runner resolves only the remote MCP connection details + (decrypted) auth header and queues a `remote-resource` `ChannelAttachment`. The **resource-handler container** then connects to the remote server, reads, decodes the `blob`/`text`, and sends the file itself (`/telegram/send-remote-resource` → `handleTelegramSendRemoteResource`) — so the file bytes never transit either 128 MiB worker. Bounded by container memory and Telegram's per-file limit, not the worker. (Artifact files still go the multipart route: the worker has those bytes in R2/row content already.)

`search-resources` stays artifact-only — proxied resources aren't indexed into `artifact_resource_chunk`, so there's nothing to vector-search.

### Prompts surface as slash commands

MCP prompts aren't part of the agent's tool loop either, so they're exposed as Telegram **slash commands**. [`loadProxiedPrompts`](../../../api/src/controllers/channel/proxiedPrompts.ts) enumerates each install's enabled proxied prompts (`config.allowedPrompts`, opt-in) under their boot-time name `<prefix>__<remote>`. [`resolveSlashPrompt`](../../../api/src/controllers/channel/telegram.ts) matches a typed `/command` against artifact prompts first, then proxied prompts — returning the MCP prompt name plus a **null** `artifact_prompt` FK (the proxied name isn't an `artifact_prompt` id, so recording it as one would violate the FK; threaded as `promptArtifactId` in `RunOptions`).

The bot's command menu is registered at channel creation ([ChannelController.create](../../../api/src/controllers/channel/index.ts)) and re-pushed on **any** change to the artifact's prompt set — artifact prompt create/update/remove, or an mcp-proxy install added/updated/removed — via [`syncTelegramCommandsForArtifact`](../../../api/src/utils/telegramCommands.ts), so autocomplete tracks the current set instead of going stale until the channel is recreated. (Invoking by typing the command works regardless; the resync is only for the autocomplete menu.)

### Usage records

Every tool / resource / prompt invocation is written to `channel_message_usage` and shown in the dashboard's per-message usage. Two adaptations for proxied definitions, which back many MCP tools per `artifact_tool` row:

- **`tool_name`** records the specific invoked name (`github__search_repositories`, `lookup-order`), because the parent definition's title (`MCP Proxy`, `HTTP endpoint`) is generic. The channels view prefers it for proxied definitions.
- The runner maps proxied call-names back to their parent `artifact_tool` id (mcp-proxy via [`buildProxyToolName`](../../../../packages/utils/src/mcpProxy.ts) over the allowed discovered set; http-endpoint via `config.name`), so `artifactToolId` is populated and the **"Open in Tools"** link navigates — a by-`tool_definition`-key lookup alone resolves these to `null`.

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
