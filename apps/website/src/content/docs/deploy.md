---
title: Deploy it yourself
description: Ganju is open source (Apache-2.0). Run your own instance on Cloudflare and Postgres — your keys, your infrastructure.
order: 8
updated: 2026-11-13
---

Ganju is **open source under Apache-2.0**, so you can run the whole platform
yourself instead of using the hosted version. Self-hosting means your own model
keys, full control of your data, and plans you grant yourself — you just bring
the infrastructure.

This page is an overview; the repository holds the authoritative, always-current
runbook:
[README](https://github.com/MontoyaAndres/ganju#readme),
[DEVELOPMENT.md](https://github.com/MontoyaAndres/ganju/blob/main/docs/DEVELOPMENT.md),
and [DEPLOYMENT.md](https://github.com/MontoyaAndres/ganju/blob/main/docs/DEPLOYMENT.md).

## What it runs on

Ganju runs almost entirely on the **Cloudflare** developer platform, with
**Postgres + [pgvector](https://github.com/pgvector/pgvector)** for storage and
retrieval. It's an npm-workspaces + [Turborepo](https://turbo.build/) monorepo:

| App | Runtime | Responsibility |
|---|---|---|
| `apps/api` | Cloudflare Worker | Control plane — auth, CRUD, OAuth, channel webhooks, queues, crons, the Assistant |
| `apps/mcp` | Cloudflare Worker | The MCP server every project exposes |
| `apps/data` | Cloudflare Worker | Project databases (one SQLite Durable Object per database) |
| `apps/tool-broker` | Cloudflare Worker | What customer-written functions call for connections, secrets and files |
| `apps/tool-outbound` | Cloudflare Worker | Screens every outbound request a customer's function makes |
| `apps/web` | Next.js (OpenNext → Cloudflare) | The dashboard |
| `apps/website` | Cloudflare Pages | The marketing site and these docs |
| `apps/resource-handler` | Container | Heavy work — document extraction, crawling, large sends. Built and deployed with `apps/api` |

> **Heads up:** you need a **paid** Cloudflare Workers plan. The
> `ResourceHandler` container requires it, and
> [Functions](/docs/tools/functions/) deploy into a Workers for Platforms
> dispatch namespace, which is a separate paid add-on.

## Run it locally first

You'll need Node.js 20 or newer, npm 11, Docker (for the resource-handler
container), a Cloudflare account, and a Postgres database (15+) with
`pgvector` 0.8 or newer.

```bash
git clone https://github.com/MontoyaAndres/ganju
cd ganju
npm install
cp .env.example .env      # then fill in the values
npm run migrate-dev       # generate + apply DB migrations
npm run dev               # start all apps via Turbo
```

Default local ports:

| App | Port |
|---|---|
| `apps/api` | 8080 |
| `apps/mcp` | 8081 |
| `apps/resource-handler` | 8082 |
| `apps/tool-broker` | 8083 |
| `apps/tool-outbound` | 8084 |
| `apps/data` | 8085 |
| `apps/web` | 3000 |

`apps/data` must be running for project databases to work locally. Functions
always run in the remote dispatch namespace, so `wrangler dev` must be logged in
to the Cloudflare account that owns it.

The `.env` covers:

- `DATABASE_URL` and the local Hyperdrive connection string.
- Auth and crypto secrets: `JWT_SECRET`, `CRYPTO_SECRET` (exactly 32 bytes,
  base64 — `openssl rand -base64 32`), `MCP_INTERNAL_SECRET`,
  `CUSTOM_CODE_TOKEN_SECRET`.
- `EMBEDDING_API_KEY` — a Gemini key for embeddings and the default model.
- `ANTHROPIC_API_KEY` — for the [Assistant](/docs/assistant/).
- OAuth client IDs and secrets for the providers you want: Google (sign-in,
  Gmail, Drive, Calendar), GitHub (sign-in), Microsoft (Outlook, OneDrive),
  Slack.
- `BOT_OAUTH_CLIENT_ID` / `BOT_OAUTH_CLIENT_SECRET` — the client channel bots
  use to link accounts. Provision its row with
  `npx dotenv -e .env -- node scripts/provision-bot-client.mjs`.
- `CLOUDFLARE_ACCOUNT_ID` and `CUSTOM_CODE_CF_API_TOKEN` — to publish functions.
- `EMAIL_FROM` and `ALERT_EMAIL`.
- Only if you want billing: your Polar keys.
- The `NEXT_PUBLIC_*` URLs of the API, web app, and MCP server.

## Provision Cloudflare resources

For a hosted deployment, create these in your Cloudflare account (names must
match each app's `wrangler.toml`, or update the toml to match yours):

- **Hyperdrive** — pointing at your Postgres.
- **R2 bucket** — `ganju-storage-<env>` (binding `STORAGE_BUCKET`).
- **KV namespace** — `<env>-JWKS_CACHE`, bound in `apps/mcp`.
- **Queues** — eight, each with a dead-letter queue: `ganju-index`,
  `ganju-crawl-discover`, `ganju-crawl-page`, `ganju-gdrive-discover`,
  `ganju-gdrive-file`, `ganju-onedrive-discover`, `ganju-onedrive-file`,
  `ganju-data-triggers` (suffixed `-<env>`, with a `-dlq-<env>` twin).
- **Workers for Platforms dispatch namespace** — `ganju-tools-<env>`, where
  customer functions are deployed.
- **Email Service** (`SEND_EMAIL`) — onboard your sending domain under Email
  Service so mail reaches any recipient; before that it only delivers to
  verified Email Routing destinations.
- **Containers** — the `ResourceHandler` container, built from
  `apps/resource-handler/Dockerfile` during the `apps/api` deploy.
- **Durable Objects** — created by the migrations in each `wrangler.toml`:
  `ResourceHandler`, `DiscordGatewayDO`, `MessageBufferDO`, and
  `BuilderConversationDO` in `apps/api`, and `ProjectDatabase` in `apps/data`.
- **Custom domains** — `api`, `mcp`, and `app` under your zone.

The committed `wrangler.toml` files reference the hosted account's resource IDs
and domains (`ganju.ai`) — replace those with **your** resource IDs and domain.

## Set secrets

`wrangler.toml` `vars` hold only non-secret config (the `NEXT_PUBLIC_*` URLs,
`NODE_ENV`, ports). Everything sensitive is set with `wrangler secret`, per app
and per environment — and only **after** that Worker's first deploy, since a
Worker must exist before it can hold a secret:

```bash
cd apps/api
wrangler secret put JWT_SECRET --env production
wrangler secret put CRYPTO_SECRET --env production
wrangler secret put MCP_INTERNAL_SECRET --env production
wrangler secret put EMBEDDING_API_KEY --env production
wrangler secret put GOOGLE_CLIENT_SECRET --env production
# …and the rest: see DEPLOYMENT.md for the full list per Worker
```

`apps/api`, `apps/mcp`, and `apps/tool-broker` each need their own set.
`apps/tool-outbound` and `apps/web` need none. Three secrets must be
**identical** across the Workers that share them:

| Secret | Shared by |
|---|---|
| `CRYPTO_SECRET` | api, mcp, tool-broker |
| `MCP_INTERNAL_SECRET` | api, mcp |
| `CUSTOM_CODE_TOKEN_SECRET` | api, tool-broker |

Choose `CRYPTO_SECRET` once: every stored OAuth token and API key is encrypted
under it, so rotating it later orphans them all.

## Deploy

Each Worker app ships `development` and `production` environments; the root
scripts fan out across the workspace via Turbo.

1. Provision the Cloudflare resources above.
2. Apply DB migrations against your target database (code and schema ship
   together — migrate first):
   ```bash
   npm run migrate-prod   # generates + applies against .env.prod
   ```
3. **First deploy only:** deploy the Workers in order, because some bind to
   each other — `apps/tool-outbound` and `apps/data`, then `apps/api` (with its
   service binding to the MCP Worker temporarily commented out), then
   `apps/mcp`, then `apps/api` again with the binding restored, then
   `apps/tool-broker`, `apps/web`, and `apps/website`. DEPLOYMENT.md has the
   details.
4. Set the secrets for each Worker environment, and provision the bot OAuth
   client against the same database.
5. From then on, every deploy is:
   ```bash
   npm run migrate-prod   # if the schema moved
   npm run deploy-prod    # or deploy-dev for the development environment
   ```

There's no catalog seeding step: the shipped tool catalog is code. The curated
remote MCP servers (`mcp_server_catalog`) are the only rows you add yourself.

Under the hood each app runs `wrangler deploy --env <env>` (or
`opennextjs-cloudflare deploy` for the dashboard). With `production`, your apps
land on `{api,mcp,app}.<your-domain>`; `development` uses the `development-`
prefix.

## Check it works

- `https://api.<your-domain>/.well-known/oauth-authorization-server` answers —
  MCP clients read it to discover how to sign in.
- `https://mcp.<your-domain>/health` answers.
- Sign in at `https://app.<your-domain>`, create an organization, and confirm
  the tools catalog renders.
- Publish a small function (`ganju deploy` with `GANJU_API_URL` pointing at your
  API) — the only thing that exercises the dispatch namespace, the broker, and
  the outbound Worker together.

## Plans and billing on your instance

Billing is optional. Without a Polar token, checkout and the billing portal are
off, and every organization runs with the **Free** plan's limits until you grant
it a plan. As the operator you do that in the database, by setting the
organization's `subscription` row to `plan = 'PRO'` (or `'ENTERPRISE'`) and
`status = 'active'`. To sell plans yourself, set up Polar as described in
DEPLOYMENT.md.

## Observe & operate

Workers have observability enabled — stream logs with
`wrangler tail --env <env>`, watch the dead-letter queues for stuck background
jobs, and check the `error_log` table for cross-service errors. Two crons run on
`apps/api`: every 15 minutes (the error digest, emailed to `ALERT_EMAIL`) and
hourly (usage metering, the retention purge, data jobs, and alerts). For the
data model and architecture, see
[ARCHITECTURE.md](https://github.com/MontoyaAndres/ganju/blob/main/docs/ARCHITECTURE.md)
and [DATA_MODEL.md](https://github.com/MontoyaAndres/ganju/blob/main/docs/DATA_MODEL.md)
in the repo.

Prefer not to run any of this? The [hosted version](https://app.ganju.ai)
handles all of it — start on the Free plan and
[upgrade](/docs/settings/#billing--plan) when you grow.
