# `ganju` — the CLI

Write, deploy and debug custom tools from a terminal. Everything here is a thin
client of endpoints the dashboard already uses; nothing in it is a second write
path onto the same rows.

```bash
npm install -g @ganju/cli

ganju init my-tools
cd my-tools
ganju login
ganju link
ganju deploy
```

Out of the box this talks to **`https://api.ganju.ai`**, so a fresh install needs
no configuration. Point it somewhere else — your own instance, or a local API —
with `GANJU_API_URL`.

## Commands

| Command | What it does |
| --- | --- |
| `ganju init [dir]` | Scaffold a `ganju.json` and a handler that deploys as-is |
| `ganju login` / `logout` / `whoami` | Sign in on this machine, and out |
| `ganju link` | Point `ganju.json` at an organization and project (`--status` to just read it) |
| `ganju build` | Compile and minify, write `.ganju/bundle.js`, report the size |
| `ganju deploy` | Build, upload and publish (`--draft` to stop before publishing) |
| `ganju test <tool>` | Run one tool against a sample input without publishing it |
| `ganju logs` | Recent calls, with their `ctx.log` output (`--follow` to keep watching) |
| `ganju versions` / `ganju rollback <n>` | What exists, which one is live, and going back |
| `ganju secret set\|list\|rm` | The values `ctx.secret()` reads |

## `ganju.json`

```jsonc
{
  "artifact": "acme-support",
  "organizationId": "…", // written by `ganju link`
  "projectId": "…",

  // Row-level, because that is the level they are enforced at: one script per
  // artifact, one set of rules for all of it. They travel with the deploy.
  "connections": ["google-gmail"],
  "allowedHosts": ["api.acme.com"],
  "timeoutMs": 10000,
  "resourceAccess": "own",

  "tools": [
    {
      "name": "lookup-order",
      "title": "Look up order",
      "description": "Find an order by its id. Use when the customer gives an order number.",
      "entry": "src/lookupOrder.js",
      "input": {
        "type": "object",
        "properties": { "orderId": { "type": "string" } },
        "required": ["orderId"]
      },
      "output": { "type": "object", "properties": { "status": { "type": "string" } } }
    }
  ]
}
```

**Secrets are not in this file, and must not be.** `ctx.secret('ACME_KEY')`
resolves a credential through the broker at call time, so a secret is something
you send once rather than a value committed next to your source. Use
`ganju secret set`. It is live from the next call, with no deploy after it.

### Two ways to write the router

Give every tool an **`entry`** and the router is generated from the manifest — so
the tool name is written in exactly one place, and `lookup-order` vs
`lookupOrder` stops being a thing that can happen:

```js
// src/lookupOrder.js
import { defineTool } from '@ganju/sdk';

export default defineTool(async (input, ctx) => {
  const { accessToken } = await ctx.connection('google-gmail');
  return { status: 'shipped' };
});
```

Or give **none** of them one and write the map yourself, in the file named by
`main` (default `src/index.ts`):

```js
import { createHandler, defineTool } from '@ganju/sdk';

export default createHandler({
  'lookup-order': defineTool(async (input, ctx) => ({ status: 'shipped' }))
});
```

A mix of the two is refused rather than resolved, because both resolutions
silently drop half of what the author wrote.

## What the build does

`esbuild`, bundling to one ES module — which is not an optimisation but the step
that makes more than one source file possible, since a deployed script is a
single module. TypeScript works; types are stripped, never checked, so run `tsc`
yourself if you want them enforced.

`@ganju/sdk` is **not** bundled. It is rewritten to `./ganju-sdk.js`, the sibling
module the publish pipeline attaches to every upload — so a copy inside the
bundle would be dead weight, and a version frozen into it would drift from the
broker it talks to.

The upload is a `bundle`, which means the dashboard's editor shows it read-only
rather than inviting someone to overwrite a real build with the contents of a
text box. Use the dashboard for code you want to edit there.

## Environment

| Variable | For |
| --- | --- |
| `GANJU_API_URL` | Which deployment to talk to. Also settable per project as `apiUrl` in `ganju.json` |
| `GANJU_API_TOKEN` | An access token for a machine with no browser (CI, a container, SSH). Bypasses the stored login entirely |
| `GANJU_SECRET_VALUE` | `ganju secret set NAME` reads the value from here, to keep it out of shell history |
| `GANJU_CONFIG_DIR` | Where the token store lives. Default `~/.ganju` |

## Signing in

`ganju login` is a loopback redirect (RFC 8252) against the same authorization
server MCP clients use: the CLI holds a port open, sends your browser to the
authorize endpoint, and reads the code off the redirect. The client is public —
no secret, PKCE instead, because a secret shipped in an npm package is a secret
every user of the package has. It registers itself through RFC 7591 dynamic
registration on first login, so nothing has to be provisioned by hand.

Tokens live in `~/.ganju/credentials.json`, mode `0600`, keyed by API origin —
so working against a local API and against production at the same time does not
log you out of one every time you touch the other.

## Building it from this repo

`npm run build -w @ganju/cli` type-checks with `tsc` and then bundles with
esbuild into a single `dist/index.js`.

It bundles rather than declaring `@ganju/utils` as a dependency, even though
that package is published: a globally installed CLI should not drag zod, dayjs
and a cipher suite onto someone's machine to read eight constants, and three
packages released in lockstep should not be able to half-resolve against each
other. Those eight values live in `@ganju/utils/cliConstants`, a module that
imports nothing — importing the main constants module would inline the whole
object literal, since a bundler cannot tree-shake one.

`esbuild` stays a real dependency, because it ships a platform-specific binary
that cannot be bundled.
