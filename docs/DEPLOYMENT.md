# Deployment

Ganju deploys to Cloudflare. Each Worker app has a `wrangler.toml` with `development` and `production` environments; the web app deploys through [OpenNext](https://opennext.js.org) and the marketing site through Cloudflare Pages.

> The committed `wrangler.toml` files reference this account's resources (Hyperdrive ids, KV ids, custom domains under `vocesqueabrazan.com` for development and `ganju.ai` for production). When deploying your own instance, replace them with your own.

## What deploys

| App | Worker name (production) | Deploy command |
| --- | --- | --- |
| [apps/api](../apps/api) | `ganju-api-production` | `wrangler deploy --env production` |
| [apps/mcp](../apps/mcp) | `ganju-mcp-production` | `wrangler deploy --env production` |
| [apps/tool-broker](../apps/tool-broker) | `ganju-tool-broker-production` | `wrangler deploy --env production` |
| [apps/tool-outbound](../apps/tool-outbound) | `ganju-tool-outbound-production` | `wrangler deploy --env production` |
| [apps/web](../apps/web) | `ganju-web-production` | `opennextjs-cloudflare deploy --env production` |
| [apps/website](../apps/website) | Pages project `ganju-website-production` | `wrangler pages deploy` |

[apps/resource-handler](../apps/resource-handler) has no deploy of its own — it is a **container image** built from its Dockerfile as part of the api deploy, and reached over a Durable Object binding.

`npm run deploy-prod` at the root fans these out through Turbo. **That is correct for a routine deploy and wrong for the first one** — see [First deploy](#first-deploy-order-matters).

## Current state of production

**Production is live as of 5 Sep 2026.** Re-check rather than trust this table; the commands are in each row.

| | State | How to check |
| --- | --- | --- |
| Hyperdrive `ganju-db-production` | ✅ its own Neon database | `wrangler hyperdrive list` |
| R2 `ganju-storage-production` | ✅ | `wrangler r2 bucket list` |
| Queues (7 + 7 dead-letter) | ✅ | `wrangler queues list` |
| KV `production-JWKS_CACHE` | ✅ | `wrangler kv namespace list` |
| Dispatch namespace `ganju-tools-production` | ✅ | `wrangler dispatch-namespace list` |
| Pages `ganju-website-production` | ✅ | `wrangler pages project list` |
| The five Workers | ✅ all deployed | `wrangler deployments list --env production` |
| Custom domains | ✅ `api` / `mcp` / `app`.ganju.ai all answering | `curl -o /dev/null -w '%{http_code}' https://api.ganju.ai/.well-known/oauth-authorization-server` |
| Secrets | ✅ 31 — api 19, mcp 3, tool-broker 9 | `wrangler secret list --env production` |
| Migrations | ✅ 71 applied, through `0070` | `select count(*) from drizzle.__drizzle_migrations` |
| Bot OAuth client | ✅ row provisioned | `select count(*) from oauth_client` |
| `mcp_server_catalog` | ✅ 2 rows (GitHub, Notion) | `select count(*) from mcp_server_catalog` |
| End-to-end CLI probe | ✅ 61/61 against production | [probe-cli.mjs](../scripts/probe-cli.mjs) |
| **Stripe live mode** | ❌ empty — account not activated | [PRICING.md](PRICING.md) |

**Verified end to end on 5 Sep** by pointing the CLI probe at production — 61 checks, all passing: OAuth login through dynamic registration, `ganju deploy` publishing into `ganju-tools-production`, an MCP client listing and calling the tool and getting its `structuredContent` back, `ganju test` against a real preview script, logs, secrets, project-scoped access tokens, rollback, and both refusals (a reserved tool name, and the plan gate on FREE). It scaffolds a throwaway PRO org and removes it; the namespace was back to `script_count: 0` afterwards.

```bash
PROBE_ENV_FILE=.env.prod PROBE_NAMESPACE=ganju-tools-production \
PROBE_API_URL=https://api.ganju.ai PROBE_MCP_URL=https://mcp.ganju.ai \
node scripts/probe-cli.mjs
```

**The env file and the namespace move together.** A run that read production's database while deploying into the development namespace would report a green publish against a script nothing serves.

One thing remains, and it is not code:

- **Stripe is blocked on account activation**, which is a business step rather than a technical one. It blocks payment and nothing else — `createStripe` returns `null` on a missing key, the metering sweep returns early, and `getPlan` / `getStatus` never touch Stripe, so the entire Free tier works and the usage counters keep incrementing in Postgres. Only `createCheckout`, `createPortal` and `webhook` refuse. **Leave `STRIPE_SECRET_KEY` unset rather than filling it with a placeholder** — unset is the handled path; a bogus key builds a real client that throws hourly.

## Cloudflare resources

For a fresh instance. Names must match the `wrangler.toml` for each env, or update the toml.

- **Hyperdrive** — pointing at your Postgres; id under `[[env.<env>.hyperdrive]]`.
- **R2 bucket** — `ganju-storage-<env>` (binding `STORAGE_BUCKET`).
- **KV namespace** — `<env>-JWKS_CACHE`, bound in apps/mcp as `JWKS_CACHE`.
- **Queues**, each with a dead-letter queue: `ganju-index`, `ganju-crawl-discover`, `ganju-crawl-page`, `ganju-gdrive-discover`, `ganju-gdrive-file`, `ganju-onedrive-discover`, `ganju-onedrive-file` — each suffixed `-<env>`, plus a `-dlq-<env>` twin. See [apps/api/wrangler.toml](../apps/api/wrangler.toml).
- **Email Service** (`SEND_EMAIL`) — onboard the sending domain under Email Service in the dashboard (it adds the MX/SPF/DKIM/DMARC records). Until that's done the binding only delivers to verified Email Routing destinations; once onboarded it sends to any recipient. Workers Paid includes 3,000 sends/month, then $0.35 per 1,000 — sends to verified destinations stay free.
- **Workers for Platforms dispatch namespace** — `ganju-tools-<env>`, which is what customer-written tools deploy into. The $25/mo is a per-account platform fee and namespaces are not a billed unit, so the charge starts with the first script. Bound in **both** apps/api (to upload and smoke-test a publish) and apps/mcp (to run a call). See [CUSTOM_TOOLS.md](CUSTOM_TOOLS.md).
- **Containers** — the `ResourceHandler` container (`instance_type = standard-1`) is built from [apps/resource-handler/Dockerfile](../apps/resource-handler/Dockerfile) during the api deploy. Requires a **paid** Workers plan.
- **Durable Objects** — `ResourceHandler`, `DiscordGatewayDO` and `MessageBufferDO`, created by the `v1`/`v2`/`v3` migrations in apps/api's toml. All three classes live in apps/api; apps/mcp and apps/tool-broker reach `ResourceHandler` through `script_name = "ganju-api-production"`.
- **Custom domains** — `api`, `mcp` and `app` under your zone. apps/mcp also claims `*.mcp.<domain>/*` for per-artifact subdomains.

## Secrets

`wrangler.toml` `vars` hold only non-secret public config — the `NEXT_PUBLIC_*` URLs, `NODE_ENV`, ports, and the two `CUSTOM_CODE_*` names that identify the dispatch namespace and the broker service. **Everything else is set with `wrangler secret`**, per app and per environment.

**A Worker must exist before it can hold a secret.** `wrangler secret put` against an undeployed name answers *"If this is a new Worker, run `wrangler deploy` first"*. So secrets come **after** the first deploy, not before it — which means the first deploy of each Worker boots without them and answers 500s until they land. Setting a secret publishes a new version on its own; no redeploy is needed after.

The exact set each Worker needs, taken from what development actually has:

**apps/api** — 27

```
ALERT_EMAIL                 EMAIL_FROM              MICROSOFT_CLIENT_ID
BOT_OAUTH_CLIENT_ID         EMBEDDING_API_KEY       MICROSOFT_CLIENT_SECRET
BOT_OAUTH_CLIENT_SECRET     GITHUB_CLIENT_ID        SLACK_CLIENT_ID
CLOUDFLARE_ACCOUNT_ID       GITHUB_CLIENT_SECRET    SLACK_CLIENT_SECRET
CRYPTO_SECRET               GOOGLE_CLIENT_ID        STRIPE_SECRET_KEY
CUSTOM_CODE_CF_API_TOKEN    GOOGLE_CLIENT_SECRET    STRIPE_WEBHOOK_SECRET
CUSTOM_CODE_TOKEN_SECRET    JWT_SECRET              STRIPE_PRICE_PRO
                            MCP_INTERNAL_SECRET     STRIPE_PRICE_ENTERPRISE
                                                    STRIPE_PRICE_MESSAGE_OVERAGE
                                                    STRIPE_PRICE_SHARED_MESSAGE_OVERAGE
                                                    STRIPE_PRICE_EMBEDDED_OVERAGE
                                                    STRIPE_PRICE_TOOL_CALL_OVERAGE
```

**apps/mcp** — 3: `CRYPTO_SECRET`, `EMBEDDING_API_KEY`, `MCP_INTERNAL_SECRET`

> Development also has `JWT_SECRET` set on apps/mcp. **It is vestigial** — apps/mcp reads no such variable. Machine JWTs are verified offline against the JWKS it fetches from the API and caches in KV ([middleware/auth.ts](../apps/mcp/src/middleware/auth.ts)), which is public-key verification and needs no shared symmetric secret. Setting it does no harm; leaving it out costs nothing.

**apps/tool-broker** — 9: `CRYPTO_SECRET`, `CUSTOM_CODE_TOKEN_SECRET`, `EMBEDDING_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`

**apps/tool-outbound** and **apps/web** — none. The outbound Worker screens hosts and holds no credential by design, and the web app's config is all public.

```bash
cd apps/api
wrangler secret put JWT_SECRET --env production
# …and the rest of the list above
```

**Three of these must be byte-identical across the Workers that share them**, because one signs or encrypts what another reads:

| Secret | Shared by | What breaks if they differ |
| --- | --- | --- |
| `CRYPTO_SECRET` | api, mcp, tool-broker | Every stored credential decrypts to garbage |
| `MCP_INTERNAL_SECRET` | api, mcp | Worker-to-Worker and Durable Object ingest calls |
| `CUSTOM_CODE_TOKEN_SECRET` | api, tool-broker | Every `ctx.*` call from a customer's tool answers 401 |

**`CRYPTO_SECRET` has a format, not just a length.** [crypto.ts](../packages/utils/src/crypto.ts) base64-decodes it and throws unless it is **exactly 32 bytes** — `openssl rand -base64 32`. A hex string or a passphrase deploys fine and then fails on the first credential read. Choose it once: every stored OAuth token and API key is encrypted under it, so rotating it later orphans all of them.

**The rest are opaque strings, and length past 32 bytes buys nothing.** `JWT_SECRET`, `MCP_INTERNAL_SECRET` and `CUSTOM_CODE_TOKEN_SECRET` are all fed to HMAC-SHA256 (or to better-auth, which derives its own keys), and HMAC hashes any key longer than its 64-byte block down to 32 bytes before use. So a 1KB secret is exactly as strong as a 32-byte one. `openssl rand -hex 32` is enough for each. Development's `JWT_SECRET` is far longer than that for historical reasons rather than good ones.

**Two are read from a secret and skipped in silence when unset**, which is the failure mode worth knowing because nothing errors:

- `STRIPE_PRICE_*` — checkout omits any overage line whose variable is unset. Deliberate, so the base plan can launch before the meters exist, but an unset `STRIPE_PRICE_TOOL_CALL_OVERAGE` serves custom tool calls for free while the hourly cron still reports the usage.
- `CUSTOM_CODE_CF_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` — publishing a customer's tool uploads through the Cloudflare API with these. Without them the dashboard's Deploy button and `ganju deploy` fail at the upload step, well after the plan gate has passed.

`BOT_OAUTH_CLIENT_ID` / `BOT_OAUTH_CLIENT_SECRET` also need a matching row in `oauth_client`, or channel `/link` fails. After setting the secrets, provision it against the same environment's database:

```bash
npx dotenv -e .env.prod -- node scripts/provision-bot-client.mjs
```

## Database

Migrations live in [packages/db](../packages/db) and run from a local shell against the target database, never from a Worker.

`migrate-prod` reads **`.env.prod`** through `dotenv-cli`. That file is gitignored and is not in the repo — create it with at least `DATABASE_URL` pointing at the production Neon database (the one behind the `ganju-db-production` Hyperdrive config, which is a different database from development's).

```bash
npm run migrate-prod   # generate + apply against .env.prod
```

There are 71 migrations, through `0070_tool_call_metering`. **Code and schema must ship together**, because the current code writes to columns the later migrations add: `artifact_tool.tool_key` and `.enabled` from the first request, `artifact_tool_version.script_name` at boot, `access_token` on any request carrying a `ganju_pat_` bearer token, and `subscription.tool_call_count` on every custom tool call. Deploy without migrating and the first request fails.

Check what the target database already has before assuming a range:

```sql
select count(*) from drizzle.__drizzle_migrations;
```

**There is no catalog seeding step.** An older version of this document said to seed `tool_group` and `tool_definition` — migration `0065` **drops** both, and the shipped tool catalog is now code in [@ganju/utils](../packages/utils/src/toolCatalog.ts) with `artifact_tool.tool_key` naming an entry in it. `mcp_server_catalog` is the only table still populated out of band; see the note in [Current state](#current-state-of-production).

## First deploy: order matters

`npm run deploy-prod` fans out through Turbo with **no ordering between the Workers**, and the bindings are ordered — two of them circularly:

- **apps/tool-outbound** binds nothing external.
- **apps/api** binds a service to `ganju-mcp-production`, and routes its dispatch namespace's egress through `ganju-tool-outbound-production`.
- **apps/mcp** binds a service to `ganju-api-production`, reaches `ResourceHandler` with `script_name = "ganju-api-production"`, and uses the same outbound service.
- **apps/tool-broker** reaches `ResourceHandler` with `script_name = "ganju-api-production"`.

A binding naming a Worker that does not exist fails the deploy, and api ↔ mcp name each other. So the first deploy has to be sequenced by hand, breaking the cycle once:

1. **apps/tool-outbound** — no dependencies, and both dispatch bindings need it.
2. **apps/api**, with the `MCP` service binding temporarily commented out. This also creates the three Durable Object classes and builds the resource-handler container image, which is why everything else waits on it. apps/api also binds a service named `API` **to itself**; if that is refused on a Worker that does not exist yet, comment it out too and restore it in step 4 alongside `MCP`.
3. **apps/mcp** — api now exists, so its service and DO bindings resolve.
4. **apps/api** again, with the commented bindings restored.
5. **apps/tool-broker**, then **apps/web**, then **apps/website**.

Then set the secrets from the lists above, and run the post-deploy checks.

**Only the first deploy needs this.** Once every name exists, `npm run deploy-prod` is safe, because the bindings resolve against Workers that are already there.

## Routine deploys

```bash
npm run migrate-prod   # if the schema moved
npm run deploy-prod
```

Migrate first. A Worker reading a column that does not exist yet fails on its first request; a database carrying a column nothing reads yet is inert.

## After deploying

- `https://api.ganju.ai/.well-known/oauth-authorization-server` answers. apps/api has **no** `/health` route, and this is the only useful unauthenticated GET on it — it is also what MCP clients read to discover how to log in, so a 404 here is a product outage rather than a probe failing. This is the check that catches the missing route rather than a missing deploy.
- `https://mcp.ganju.ai/health` answers (apps/mcp does have one), and `/.well-known/oauth-protected-resource` answers without auth.
- Sign in at `https://app.ganju.ai`, create an organization, and confirm the tools catalog renders — that exercises Hyperdrive, the session cookie and `tool_key` resolution in one action.
- Publish a trivial custom tool, which is the only thing that exercises the dispatch namespace, `CUSTOM_CODE_CF_API_TOKEN`, the broker token and the outbound Worker together.
- Watch the dead-letter queues, and `error_log` (see [DATA_MODEL.md](DATA_MODEL.md)).

**A note on reading a suspended or empty artifact:** an MCP server with nothing registered advertises no `tools` capability, so `tools/list` answers `-32601 Method not found` rather than an empty list. That is the correct state, not a broken server.

## Stripe

Live mode is a separate exercise from the deploy and **nothing carries over from test mode**. It needs, in order: four meters whose event names match `STRIPE_METER_*` in [constants.ts](../packages/utils/src/constants.ts) exactly (a typo means events are discarded silently); five package prices on the Pro product; a webhook at `https://api.ganju.ai/billing/webhook` for `checkout.session.completed` and `customer.subscription.{created,updated,deleted}`; and the `STRIPE_*` secrets above. Full detail, including why the tool-call price is packaged per 1,000 rather than per million, is in [PRICING.md](PRICING.md).

## Observability

Workers have observability logs enabled in both envs (`[env.<env>.observability]`). Use `wrangler tail --env production` to stream logs — the outbound Worker is the only place that shows where a customer's script is trying to go. Two crons run on apps/api in production, both entering the same `scheduled` handler, which branches on which one fired:

| Cron | Does |
| --- | --- |
| `*/15 * * * *` | The error digest alone |
| `0 * * * *` | Overage metering, the retention purge, the custom-code script sweep, the error digest again (so a missed 15-minute run is picked up rather than waiting), and custom-tool usage alerts |

Both alert crons email `ALERT_EMAIL`, so that secret being unset is the difference between hearing about an incident and not. Cross-service errors land in `error_log`.
