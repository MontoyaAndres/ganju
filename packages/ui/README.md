# `@ganju/ui`

Shared React component library used by [`apps/web`](../../apps/web), built on [MUI](https://mui.com) + [Emotion](https://emotion.sh).

Components are consumed directly from source (`exports` → `./src/index.tsx`), so there's no build step — the web app bundles them.

## Components

Each lives under [`src/components/<name>`](src/components) with an `index.tsx` and (where styled) a `styles.tsx`:

`alert`, `breadcrumbs`, `button`, `cloud-drive-browser`, `copyable-block`, `icons` (telegram/discord/slack/whatsapp), `input`, `markdown`, `modal`, `portal`, `select`, `skeleton`, `status`, `truncated-text`.

## Conventions

- Follow the existing `index.tsx` + `styles.tsx` split when adding a component.
- Re-export new components from [`src/components/index.tsx`](src/components/index.tsx) / [`src/index.tsx`](src/index.tsx).
- Theme tokens come from the web app's [`theme.ts`](../../apps/web/src/theme.ts).
