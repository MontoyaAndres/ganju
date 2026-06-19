# Local development

How to get Ganju running on your machine and the day-to-day commands.

## Prerequisites

- **Node.js** ≥ 20 and **npm** 11 (the repo pins `npm@11.17.0` via `packageManager`).
- **A Postgres database** with the [`pgvector`](https://github.com/pgvector/pgvector) extension (Neon works well; any Postgres 15+ with `pgvector` is fine). The embedding column is a 3072-dim `halfvec`, so `pgvector` ≥ 0.7 is required.
- **Docker** — needed to run the `resource-handler` container locally via Wrangler.
- **A Cloudflare account** — Wrangler runs the Workers locally and provisions Queues/R2/Hyperdrive for deploys. A free account is enough to start; some bindings (Containers) require a paid plan to deploy.
- API keys for the integrations you want to exercise (Google, GitHub, Microsoft, Slack OAuth apps; a Gemini/embedding key; etc.). You can start with a subset.

## Install

```bash
git clone <your-fork-url> ganju
cd ganju
npm install
```

`npm install` bootstraps every workspace (`apps/*`, `packages/*`).

## Environment

Configuration is a single root `.env` file (Turbo treats it as a global dependency, and the dev script symlinks each Worker's `.dev.vars.development` to it). Bootstrap it:

```bash
cp .env.example .env
```

> The dev script also auto-creates `.env` from `.env.example` on first run if it's missing.

### Variables

| Variable | Used by | Notes |
| --- | --- | --- |
| `NODE_ENV` | all | `development` locally |
| `RESOURCE_HANDLER_PORT` | api, mcp, resource-handler | Default `8082` |
| `DATABASE_URL` | db, queue consumers, resource-handler | Postgres connection string |
| `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` | api, mcp (local) | Local Hyperdrive override → your Postgres |
| `JWT_SECRET` | api, mcp | Signs/verifies tokens between services |
| `CRYPTO_SECRET` | api, mcp | Symmetric key for encrypting stored credentials |
| `MCP_INTERNAL_SECRET` | api, mcp | Guards internal worker-to-worker / DO ingest calls |
| `BOT_OAUTH_CLIENT_ID` / `BOT_OAUTH_CLIENT_SECRET` | api | OAuth client used by MCP-client login |
| `EMBEDDING_API_KEY` | api | Gemini key for embeddings (and default LLM) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | api | Google social login + Gmail/Drive/Calendar OAuth |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | api | GitHub social login |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | api | Outlook / OneDrive OAuth |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | api | Slack OAuth |
| `NEXT_PUBLIC_API_URL` | web | `http://localhost:8080` locally |
| `NEXT_PUBLIC_WEB_URL` | web, api (CORS) | `http://localhost:3000` locally |
| `NEXT_PUBLIC_MCP_URL` | web | `http://localhost:8081` locally |
| `NEXT_PUBLIC_DOMAIN` | web, api | Base domain (blank locally) |

`NEXT_PUBLIC_*` values are also baked into the Worker `vars` per environment in each `wrangler.toml`.

## Database

The schema and migrations live in [`packages/db`](../packages/db). Drizzle config: [`packages/db/drizzle.config.ts`](../packages/db/drizzle.config.ts).

```bash
npm run generate       # generate SQL migrations from schema.ts
npm run migrate-dev    # generate + apply against $DATABASE_URL (.env)
```

Other useful commands (run inside `packages/db` or via the workspace):

```bash
npm run studio -w @ganju/db   # Drizzle Studio — browse the DB
```

Some rows are **seeded out of band** (tool groups, tool definitions, the MCP server catalog). If a tool doesn't appear in the dashboard, check those tables exist — see [DATA_MODEL.md](DATA_MODEL.md).

## Running

Start everything with Turbo:

```bash
npm run dev
```

| App | URL | How it runs |
| --- | --- | --- |
| `apps/api` | http://localhost:8080 | `wrangler dev --env development` (via [`scripts/wrangler-dev.sh`](../scripts/wrangler-dev.sh)) |
| `apps/mcp` | http://localhost:8081 | `wrangler dev --env development` |
| `apps/resource-handler` | http://localhost:8082 | Container started by Wrangler/Docker |
| `apps/web` | http://localhost:3000 | `next dev` |

To run a single app, use the workspace filter, e.g.:

```bash
npm run dev -w web
npm run dev -w api
```

## Repo-wide scripts

Defined in the root [`package.json`](../package.json), orchestrated by Turbo:

| Command | What it does |
| --- | --- |
| `npm run dev` | Start all apps in watch mode |
| `npm run build` | Build every workspace |
| `npm run start` | Start built outputs |
| `npm run generate` | Generate Drizzle migrations |
| `npm run migrate-dev` | Generate + apply migrations (dev) |
| `npm run migrate-prod` | Generate + apply migrations (prod) |
| `npm run deploy-dev` | Deploy all apps to the `development` env |
| `npm run deploy-prod` | Deploy all apps to the `production` env |
| `npm run clean` | Remove build outputs and `node_modules` |

## Conventions

- **TypeScript only.** Shared config comes from `@ganju/tsconfig`.
- **Constants live in [`packages/utils/src/constants.ts`](../packages/utils/src/constants.ts).** Don't hard-code mime types, provider URLs, size caps, or model names — add them there.
- **Workers stay light.** Push heavy work to the resource-handler container.
- **Secrets** belong in `artifact_credential` (encrypted) or env, never in `config` JSON, and are never logged.
- Code style is enforced by Prettier ([`.prettierrc`](../.prettierrc)).

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the contribution workflow and [apps/mcp/src/tools/README.md](../apps/mcp/src/tools/README.md) for the tool-authoring conventions.

## Troubleshooting

- **`pgvector` errors on migrate** — ensure the extension is installed (`CREATE EXTENSION vector;`) and the version supports `halfvec` (≥ 0.7).
- **Resource-handler won't start** — Docker must be running; Wrangler builds the image from [`apps/resource-handler/Dockerfile`](../apps/resource-handler/Dockerfile).
- **OAuth callbacks fail locally** — register `http://localhost:8080/oauth/<provider>/callback` (and the better-auth callback) as authorized redirect URIs in each provider's console.
- **`.dev.vars.development` is a symlink** — it points at the root `.env`; the dev script manages it. Don't commit it.
</content>
