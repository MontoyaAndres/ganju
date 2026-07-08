---
title: Deploy it yourself
description: Ganju is open source (Apache-2.0). Run your own instance on Cloudflare and Postgres — no plan caps, your keys, your infrastructure.
order: 8
updated: 2026-07-07
---

Ganju is **open source under Apache-2.0**, so you can run the whole platform
yourself instead of using the hosted version. Self-hosting means no plan caps, your
own model keys, and full control of your data — you just bring the infrastructure.

This page is an overview; the repository holds the authoritative, always-current
runbook:
[README](https://github.com/MontoyaAndres/ganju#readme),
[DEVELOPMENT.md](https://github.com/MontoyaAndres/ganju/blob/main/docs/DEVELOPMENT.md),
and [DEPLOYMENT.md](https://github.com/MontoyaAndres/ganju/blob/main/docs/DEPLOYMENT.md).

## What it runs on

Ganju runs almost entirely on the **Cloudflare** developer platform, with
**Postgres + [pgvector](https://github.com/pgvector/pgvector)** for storage and
retrieval. It's an npm-workspaces + [Turborepo](https://turbo.build/) monorepo with
four deployable apps:

| App | Runtime | Responsibility |
|---|---|---|
| `apps/api` | Cloudflare Worker | Control plane — auth, CRUD, OAuth, channel webhooks, queues |
| `apps/mcp` | Cloudflare Worker | The MCP server itself |
| `apps/web` | Next.js (OpenNext → Cloudflare) | The dashboard |
| `apps/resource-handler` | Node container | Heavy work — document extraction, crawling, large sends |

> **Heads up:** the `ResourceHandler` container requires a **paid** Cloudflare
> Workers plan.

## Run it locally first

```bash
git clone https://github.com/MontoyaAndres/ganju
cd ganju
npm install
cp .env.example .env      # then fill in the values
npm run migrate-dev       # generate + apply DB migrations
npm run dev               # start all apps via Turbo
```

Default local ports: API `8080`, MCP `8081`, resource-handler `8082`, web `3000`.
You'll need Node, npm, and a Postgres database with the `pgvector` extension. The
`.env` covers database credentials, auth/crypto secrets, a Gemini embedding key, the
OAuth client IDs/secrets for the providers you want (Google, GitHub, Microsoft,
Slack), and — only if you want billing — your Stripe keys.

## Provision Cloudflare resources

For a hosted deployment, create these in your Cloudflare account (names must match
each app's `wrangler.toml`, or update the toml to match yours):

- **Hyperdrive** — pointing at your Postgres.
- **R2 bucket** — `ganju-storage-<env>` (binding `STORAGE_BUCKET`).
- **Queues** — seven, each with a dead-letter queue: `ganju-index`,
  `ganju-crawl-discover`, `ganju-crawl-page`, `ganju-gdrive-discover`,
  `ganju-gdrive-file`, `ganju-onedrive-discover`, `ganju-onedrive-file` (suffixed
  `-<env>`).
- **Email routing** (`SEND_EMAIL`) — destinations must be verified; it only delivers
  to verified Email Routing addresses.
- **Containers** — the `ResourceHandler` container (built from
  `apps/resource-handler/Dockerfile`), on a paid plan.
- **Durable Objects** — `ResourceHandler` and `DiscordGatewayDO`.

The committed `wrangler.toml` files reference the hosted account's Hyperdrive IDs
and domains (`ganju.ai`) — replace those with **your** resource IDs and domain.

## Set secrets

`wrangler.toml` `vars` hold only non-secret config (the `NEXT_PUBLIC_*` URLs,
`NODE_ENV`, ports). Everything sensitive is set with `wrangler secret`, per app and
per environment:

```bash
cd apps/api
wrangler secret put JWT_SECRET --env production
wrangler secret put CRYPTO_SECRET --env production
wrangler secret put MCP_INTERNAL_SECRET --env production
wrangler secret put EMBEDDING_API_KEY --env production
wrangler secret put GOOGLE_CLIENT_SECRET --env production
# …and the rest of the provider client secrets
```

## Deploy

Each Worker app ships `development` and `production` environments; the root scripts
fan out across the workspace via Turbo.

1. Provision the Cloudflare resources above.
2. Set the secrets for each Worker environment.
3. Apply DB migrations against your target database:
   ```bash
   npm run migrate-prod   # generates + applies against .env.prod
   ```
4. Seed the catalog tables (`tool_group`, `tool_definition`, `mcp_server_catalog`)
   if they aren't already present.
5. Deploy:
   ```bash
   npm run deploy-prod    # or deploy-dev for the development environment
   ```

Under the hood each app runs `wrangler deploy --env <env>` (or
`opennextjs-cloudflare deploy` for the dashboard). With `production`, your apps land
on `{api,mcp,app}.<your-domain>`; `development` uses the `development-` prefix.

## Observe & operate

Workers have observability enabled — stream logs with `wrangler tail --env <env>`,
watch the dead-letter queues for stuck background jobs, and check the `error_log`
table for cross-service errors. For the data model and architecture, see
[ARCHITECTURE.md](https://github.com/MontoyaAndres/ganju/blob/main/docs/ARCHITECTURE.md)
and [DATA_MODEL.md](https://github.com/MontoyaAndres/ganju/blob/main/docs/DATA_MODEL.md)
in the repo.

Prefer not to run any of this? The [hosted version](https://app.ganju.ai) handles all
of it — start on the Free plan and [upgrade](/docs/settings#billing--plan) when you
grow.
