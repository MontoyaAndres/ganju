# `mcp` — MCP-server Worker

The Hono Cloudflare Worker that **is** the Model Context Protocol server. Clients reach it at `https://mcp.<domain>/<slug>`. Entry point: [`src/index.ts`](src/index.ts).

## How it works

It's **stateless**: a fresh `McpServer` is assembled per request from the artifact's stored config (prompts, resources, tools, credentials), then it serves `initialize` / `tools/list` / `tools/call` / `resources/*` / `prompts/*`.

- The auth gate ([`src/middleware/auth.ts`](src/middleware/auth.ts)) runs only on artifact-bearing routes; `/.well-known/oauth-protected-resource` is public so a 401 can point clients at the authorization server (RFC 9728).
- Credentials are refreshed (if near expiry) and filtered to a tool group's provider before the handler runs — handlers only see `credentials[0].accessToken`.
- Heavy/binary work is delegated to the resource-handler container.

## Layout

| Path                                                     | What                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [`src/tools`](src/tools)                                 | Tool definitions + registry — **read [`src/tools/README.md`](src/tools/README.md)** |
| [`src/controllers/mcp`](src/controllers/mcp)             | Per-request server boot + dispatch                                                  |
| [`src/controllers/wellKnown`](src/controllers/wellKnown) | OAuth protected-resource metadata                                                   |
| [`src/utils`](src/utils)                                 | Credential refresh, interpolation, rate limiting, remote MCP client, embeddings     |

## Adding or changing a tool

[`src/tools/README.md`](src/tools/README.md) is the authoritative guide: native vs. proxied tools, the `http-endpoint` and `mcp-proxy` definitions, provider auth, config & the Tools UI, channel-bot behavior, and conventions.

## Local dev

```bash
npm run dev -w mcp    # http://localhost:8081
```

Bindings are in [`wrangler.toml`](wrangler.toml).
