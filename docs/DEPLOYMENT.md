# Deployment

Ganju deploys to Cloudflare. Each Worker app has a `wrangler.toml` with `development` and `production` environments; the web app deploys through [OpenNext](https://opennext.js.org).

> The committed `wrangler.toml` files reference specific account resources (Hyperdrive IDs, custom domains under `vocesqueabrazan.com` / `ganju.ai`). When deploying your own instance, replace these with your account's resource IDs and domains.

## Environments

| Env           | Trigger               | Domains (example)                    |
| ------------- | --------------------- | ------------------------------------ |
| `development` | `npm run deploy-dev`  | `development-{api,mcp,app}.<domain>` |
| `production`  | `npm run deploy-prod` | `{api,mcp,app}.<domain>`             |

Per-app deploy scripts (`deploy-dev` / `deploy-prod`) run `wrangler deploy --env <env>` (or `opennextjs-cloudflare deploy` for web). The root scripts fan out across workspaces via Turbo.

## Cloudflare resources to provision

Create these in your Cloudflare account (names must match the `wrangler.toml` for each env, or update the toml):

- **Hyperdrive** — pointing at your Postgres; put its id under `[[env.<env>.hyperdrive]]`.
- **R2 bucket** — `ganju-storage-<env>` (binding `STORAGE_BUCKET`).
- **Queues** (each with a dead-letter queue): `ganju-index`, `ganju-crawl-discover`, `ganju-crawl-page`, `ganju-gdrive-discover`, `ganju-gdrive-file`, `ganju-onedrive-discover`, `ganju-onedrive-file` — each suffixed `-<env>`. See [`apps/api/wrangler.toml`](../apps/api/wrangler.toml).
- **Email routing** (`SEND_EMAIL`) — destinations must be verified; it only delivers to verified Email Routing addresses, not arbitrary recipients.
- **Containers** — the `ResourceHandler` container (`instance_type = standard-1`) is built from [`apps/resource-handler/Dockerfile`](../apps/resource-handler/Dockerfile). Requires a **paid** Workers plan.
- **Durable Objects** — `ResourceHandler` and `DiscordGatewayDO` (declared via `wrangler.toml` migrations `v1`/`v2`).

## Secrets

`wrangler.toml` `vars` hold only non-secret, public config (the `NEXT_PUBLIC_*` URLs, `NODE_ENV`, ports). **Secrets are set with `wrangler secret`**, per app and per environment:

```bash
cd apps/api
wrangler secret put JWT_SECRET --env production
wrangler secret put CRYPTO_SECRET --env production
wrangler secret put MCP_INTERNAL_SECRET --env production
wrangler secret put EMBEDDING_API_KEY --env production
wrangler secret put GOOGLE_CLIENT_SECRET --env production
# …and the rest of the provider client secrets
```

See the variable table in [DEVELOPMENT.md](DEVELOPMENT.md#variables) for the full list and which app needs each.

## Database migrations

Run migrations against the target database **before** (or as part of) a deploy:

```bash
npm run migrate-prod   # generates + applies against .env.prod
```

`migrate-prod` reads `.env.prod` (via `dotenv-cli`); keep production credentials there, out of version control.

## Deploy order

1. Provision the Cloudflare resources above.
2. Set secrets for each Worker env.
3. Apply DB migrations.
4. Seed catalog tables (`tool_group`, `tool_definition`, `mcp_server_catalog`) if not already present.
5. Deploy:
   ```bash
   npm run deploy-prod
   ```

## Observability

Workers have observability logs enabled in both envs (`[env.<env>.observability]`). Use `wrangler tail --env <env>` to stream logs, and watch the dead-letter queues for stuck background jobs. Cross-service errors also land in the `error_log` table (see [DATA_MODEL.md](DATA_MODEL.md)).
