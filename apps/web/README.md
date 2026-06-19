# `web` — dashboard

The [Next.js](https://nextjs.org) management dashboard (Pages Router, MUI + Emotion), deployed to Cloudflare via [OpenNext](https://opennext.js.org). It talks to [`apps/api`](../api) over REST.

## What it does

The UI for everything a tenant manages: organizations, projects, members & invitations, the artifact's prompts / resources / tools / channels, org-level LLMs, and the per-artifact overview with usage charts.

## Layout

| Path | What |
| --- | --- |
| [`src/pages`](src/pages) | Routes (Pages Router) |
| [`src/components/views`](src/components/views) | Page-level views (tools, resources, prompts, channels, settings, overview, …) |
| [`src/components/layouts`](src/components/layouts) | Auth/home shells |
| [`src/utils`](src/utils) | SSR helpers, auth client, fetchers |
| [`src/theme.ts`](src/theme.ts) | MUI theme |

Shared components come from [`@ganju/ui`](../../packages/ui).

## Local dev

```bash
npm run dev -w web    # http://localhost:3000
```

Reads `NEXT_PUBLIC_*` from the root `.env` (via `dotenv`). Cloudflare build/deploy uses `cf-build` / `deploy-dev` / `deploy-prod` (see [`package.json`](package.json) and [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md)).
</content>
