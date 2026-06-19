# `api` — control-plane Worker

The Hono Cloudflare Worker that everything except live MCP traffic flows through. Entry point: [`src/index.ts`](src/index.ts).

## Responsibilities

- **Auth** — [better-auth](https://www.better-auth.com): social login (Google, GitHub) and an OIDC provider for MCP-client OAuth. Discovery at `/.well-known/oauth-authorization-server`.
- **CRUD** — organizations, projects, artifacts, prompts, resources, tools, credentials, channels, org LLMs. See [`src/controllers`](src/controllers).
- **Integration OAuth** — `/oauth/:provider/authorize` + callbacks for Gmail, Google Drive/Calendar, Outlook, OneDrive, Slack.
- **Channel webhooks** — `/channel/:channelId/webhook/:platform` for Telegram/Slack/WhatsApp/Discord, plus the Discord Gateway Durable Object ([`src/durable-objects/discordGateway.ts`](src/durable-objects/discordGateway.ts)).
- **Queue consumers** — the `queue()` handler dispatches index/crawl/drive-sync jobs ([`src/queue`](src/queue)).

## Layout

| Path | What |
| --- | --- |
| [`src/controllers`](src/controllers) | Route handlers, grouped by resource |
| [`src/middleware`](src/middleware) | Auth/user guards |
| [`src/queue`](src/queue) | Background job consumers |
| [`src/durable-objects`](src/durable-objects) | Discord Gateway DO |
| [`src/utils`](src/utils) | OAuth, providers, LLM clients, channel formatting, embeddings |

## Local dev

```bash
npm run dev -w api    # http://localhost:8080
```

Bindings (Hyperdrive, R2, queues, Email, containers, DOs) are declared in [`wrangler.toml`](wrangler.toml). See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) and [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md).
</content>
