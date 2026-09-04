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

| Variable                                                   | Used by                               | Notes                                              |
| ---------------------------------------------------------- | ------------------------------------- | -------------------------------------------------- |
| `NODE_ENV`                                                 | all                                   | `development` locally                              |
| `RESOURCE_HANDLER_PORT`                                    | api, mcp, resource-handler            | Default `8082`                                     |
| `DATABASE_URL`                                             | db, queue consumers, resource-handler | Postgres connection string                         |
| `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` | api, mcp (local)                      | Local Hyperdrive override → your Postgres          |
| `JWT_SECRET`                                               | api, mcp                              | Signs/verifies tokens between services             |
| `CRYPTO_SECRET`                                            | api, mcp                              | Symmetric key for encrypting stored credentials    |
| `MCP_INTERNAL_SECRET`                                      | api, mcp                              | Guards internal worker-to-worker / DO ingest calls |
| `BOT_OAUTH_CLIENT_ID` / `BOT_OAUTH_CLIENT_SECRET`          | api                                   | Bot OAuth client — needs a matching `oauth_client` row, see below |
| `EMBEDDING_API_KEY`                                        | api                                   | Gemini key for embeddings (and default LLM)        |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                | api                                   | Google social login + Gmail/Drive/Calendar OAuth   |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`                | api                                   | GitHub social login                                |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`          | api                                   | Outlook / OneDrive OAuth                           |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`                  | api                                   | Slack OAuth                                        |
| `NEXT_PUBLIC_API_URL`                                      | web                                   | `http://localhost:8080` locally                    |
| `NEXT_PUBLIC_WEB_URL`                                      | web, api (CORS)                       | `http://localhost:3000` locally                    |
| `NEXT_PUBLIC_MCP_URL`                                      | web                                   | `http://localhost:8081` locally                    |
| `NEXT_PUBLIC_DOMAIN`                                       | web, api                              | Base domain (blank locally)                        |

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

The **`mcp_server_catalog`** rows are seeded out of band — they are the curated
remote MCP servers, and nothing in the app creates them. The shipped tool catalog
is **not** seeded: `tool_group` and `tool_definition` were dropped in migration
0065, and the catalog is now `TOOL_CATALOG` in
[@ganju/utils](../packages/utils/src/toolCatalog.ts), paired with a handler the
compiler keeps in step. So if a shipped tool is missing from the dashboard it is
a code or migration problem, never a missing row — see
[DATA_MODEL.md](DATA_MODEL.md).

### Bot OAuth client

`BOT_OAUTH_CLIENT_ID` / `BOT_OAUTH_CLIENT_SECRET` name a row that has to exist in
`oauth_client`. Channel bots authenticate as it for `/link` and for the
bot-on-behalf-of token grant; without the row every `/link` answers "Could not
start account linking". It can't be created through `/auth/oauth2/register`,
which mints its own id and secret, so provision it from the env values:

```bash
npx dotenv -e .env -- node scripts/provision-bot-client.mjs
```

Idempotent, and re-runnable after rotating the secret. The secret is stored
hashed (SHA-256, base64url) since the move to `@better-auth/oauth-provider` — a
hand-written INSERT holding the plaintext authenticates as "Bad client secret".

## Running

Start everything with Turbo:

```bash
npm run dev
```

| App                     | URL                   | How it runs                                                                                    |
| ----------------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/api`              | http://localhost:8080 | `wrangler dev --env development` (via [`scripts/wrangler-dev.sh`](../scripts/wrangler-dev.sh)) |
| `apps/mcp`              | http://localhost:8081 | `wrangler dev --env development`                                                               |
| `apps/resource-handler` | http://localhost:8082 | Container started by Wrangler/Docker                                                           |
| `apps/tool-broker`      | http://localhost:8083 | `wrangler dev --env development` (via the same script as `apps/api`)                          |
| `apps/tool-outbound`    | http://localhost:8084 | `wrangler dev --env development` (via the same script as `apps/api`)                          |
| `apps/web`              | http://localhost:3000 | `next dev`                                                                                     |

**The two tool Workers run locally, but a deployed script does not talk to them.**
This is the one thing to know before debugging a custom tool by editing
`apps/tool-broker` and wondering why nothing changes. The broker is reached over
a **service binding injected into the customer's script at upload time**, and
that binding names the *deployed* Worker (`CUSTOM_CODE_BROKER_SERVICE`, e.g.
`ganju-tool-broker-development`). The script itself lives in the dispatch
namespace, which is remote. So a `ctx.connection()` call from a tool you just
published goes to the deployed broker no matter what is running on 8083.

What the local processes are good for is driving them directly — which is what
[`scripts/verify-custom-code-resources.mjs`](../scripts/verify-custom-code-resources.mjs)
does, bundling the real broker module and calling it rather than re-implementing
its SQL. To exercise the whole chain instead, deploy the broker
(`npm run deploy-dev -w tool-broker`) and use a probe script; those drive the
deployed stack on purpose, for exactly this reason.

**The dispatch namespace runs remotely, always.** There is no local emulation of
Workers for Platforms, so `DISPATCH` is marked `remote = true` in both
`apps/api` and `apps/mcp` — without it miniflare refuses the binding outright
(`Binding DISPATCH needs to be run remotely`) and every publish, test run and
custom-tool call fails locally. With it, `wrangler dev` proxies to the real
`ganju-tools-development` namespace, and a local test run really does deploy a
preview script into it — the same namespace the deployed environment uses.

**Being logged in is not the requirement. Being logged into _this project's_
account is.** `wrangler dev` needs a session (`wrangler login`, or
`CLOUDFLARE_API_TOKEN` in the environment), and if that session belongs to
another Cloudflare account the namespace is simply not there to reach. What you
get is not a missing-namespace error, it is:

```
✘ [ERROR] Failed to establish remote session due to an authentication issue.
  Your credentials may have expired or been revoked.
```

which sends you to re-authenticate as the same account you already are. The
tell is that `wrangler whoami` **succeeds** and prints an account id that does
not match `CLOUDFLARE_ACCOUNT_ID` in `.env` — so check those two against each
other before believing the message:

```bash
npx wrangler whoami | grep -A2 'Account ID'
grep '^CLOUDFLARE_ACCOUNT_ID=' .env
```

If they differ, `wrangler logout && wrangler login` into the account that owns
the namespace. Anyone with more than one Cloudflare account will meet this, and
the error names the wrong cause every time.

To run a single app, use the workspace filter, e.g.:

```bash
npm run dev -w web
npm run dev -w api
```

## Repo-wide scripts

Defined in the root [`package.json`](../package.json), orchestrated by Turbo:

| Command                | What it does                             |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | Start all apps in watch mode             |
| `npm run build`        | Build every workspace                    |
| `npm run start`        | Start built outputs                      |
| `npm run generate`     | Generate Drizzle migrations              |
| `npm run migrate-dev`  | Generate + apply migrations (dev)        |
| `npm run migrate-prod` | Generate + apply migrations (prod)       |
| `npm run deploy-dev`   | Deploy all apps to the `development` env |
| `npm run deploy-prod`  | Deploy all apps to the `production` env  |
| `npm run clean`        | Remove build outputs and `node_modules`  |

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
