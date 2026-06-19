# Contributing to Ganju

Thanks for your interest in contributing! This guide covers how to get set up, the conventions we follow, and how to propose changes.

## Getting started

1. **Fork and clone** the repository.
2. Follow [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) to install dependencies, configure `.env`, set up the database, and run the apps.
3. Skim [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) so you know which app owns the area you're touching.

## Project layout

It's an npm-workspaces + Turborepo monorepo. The pieces:

- **`apps/api`** — control-plane Worker (auth, CRUD, OAuth, webhooks, queues)
- **`apps/mcp`** — the MCP-server Worker (tool/resource/prompt dispatch)
- **`apps/resource-handler`** — Node container for heavy work
- **`apps/web`** — Next.js dashboard
- **`packages/*`** — `db`, `utils`, `ui`, `containers`, `tsconfig`

Each app/package has its own `README.md` describing its responsibility.

## Conventions

- **TypeScript everywhere.** Extend `@ganju/tsconfig`; don't loosen `strict`.
- **Formatting** is handled by Prettier (`.prettierrc`). Run your editor's format-on-save or `npx prettier --write` before committing.
- **Constants over literals.** Mime types, provider URLs, size caps, model names, and status strings belong in [`packages/utils/src/constants.ts`](packages/utils/src/constants.ts). Validate "enum" columns against the constant arrays there.
- **Keep Workers light.** CPU/binary/large-memory work goes to `apps/resource-handler`, not into a Worker handler.
- **Never inline secrets.** Store them encrypted in `artifact_credential` (or env) and reference by id; never put them in `config` JSON and never log resolved values.
- **Screen untrusted egress.** New outbound fetches to user-supplied hosts must use the shared SSRF screen.
- **Match the surrounding code.** Comment density, naming, and idioms should look like the file you're editing.

### Adding a tool

Tools have their own detailed guide — read [apps/mcp/src/tools/README.md](apps/mcp/src/tools/README.md) before adding or changing one. The short version: **proxy before you build** (prefer `mcp-proxy` to a vendor's official server over a hand-written handler), and follow the naming/error/auth conventions in that doc.

### Changing the database

- Edit [`packages/db/src/lib/schema.ts`](packages/db/src/lib/schema.ts).
- Run `npm run generate` to produce a migration, and `npm run migrate-dev` to apply it.
- Commit the generated SQL migration alongside the schema change.
- Update [docs/DATA_MODEL.md](docs/DATA_MODEL.md) if you add or reshape an entity.
- If you add a create/delete path for something a counter tracks, keep the counter in sync.

## Commits and pull requests

- Use clear, descriptive commit messages. The existing history uses a `Type: summary` style (e.g. `Feat: …`, `Fix: …`).
- Branch off `main`; open PRs against `main`.
- Before opening a PR:
  - `npm run build` passes for affected workspaces.
  - The app runs and the change works locally (use `/verify`-style manual checks for behavior, not just types).
  - Docs are updated if you changed setup, architecture, the data model, or tool behavior.
- Describe **what** changed and **why**, and call out anything reviewers should test or that isn't covered.

## Reporting bugs and proposing features

Open an issue with enough to reproduce (steps, expected vs. actual, environment) or, for features, the problem you're solving and a sketch of the approach. The roadmap and plan notes live in [TASKS.md](TASKS.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
</content>
