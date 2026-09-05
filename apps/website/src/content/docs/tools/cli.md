---
title: CLI
description: The ganju command line — write, deploy, test and debug your custom tools from a terminal, and ship them from CI.
order: 37
updated: 2026-09-05
---

`ganju` is the terminal half of [Functions](/docs/tools/functions). Everything it
does, the dashboard does too — it is a client of the same endpoints, not a second
way in — so the choice between them is about where your tools live rather than
what they can do. Reach for the CLI when your tools belong in a repository, in
code review, and in a pipeline.

```bash
npm install -g @ganju/cli
```

Node 20 or newer. The package is `@ganju/cli`, and the binary is `ganju`.

## Your first deploy

```bash
ganju init my-tools     # scaffold a project that deploys as-is
cd my-tools
ganju login             # opens your browser, signs in on this machine
ganju link              # pick the organization and project this deploys to
ganju deploy            # bundle, upload, publish
```

`ganju init` writes a working tool rather than an empty file — a `ganju.json`
with one `lookup-order` tool declared, and `src/lookupOrder.js` implementing it —
so the next command succeeds and you edit from something that ran.

`ganju deploy` prints what it did at each step, and ends with the tools now live:

```
✓ v3 is live on acme-support — 2 tools
  lookup-order
  refund-status
```

## The commands

### Getting started

| | |
| --- | --- |
| `ganju init [dir]` | Scaffold `ganju.json` and a handler. Keeps an existing handler rather than overwriting it. |
| `ganju login` | Sign in on this machine. |
| `ganju logout` | Forget the stored token. |
| `ganju whoami` | Who this machine is signed in as. |
| `ganju link` | Write the organization and project into `ganju.json`. `--organization` / `--project` skip the prompts; `--status` just reads what's linked. |

### Working on tools

| | |
| --- | --- |
| `ganju build` | Bundle and minify to `.ganju/bundle.js`, and report the size. `--no-minify` keeps it readable. |
| `ganju deploy` | Build, upload and publish. `--draft` stops before publishing. |
| `ganju test <tool>` | Run one tool without publishing it. |
| `ganju logs` | Recent calls and their `ctx.log` output. |

### Managing what is live

| | |
| --- | --- |
| `ganju versions` | Every version, which is published, and which one is actually live. |
| `ganju rollback <version>` | Put a previously live version back. |
| `ganju secret set\|list\|rm` | The values `ctx.secret()` reads. |
| `ganju token create\|list\|revoke` | Credentials for CI, scoped to this project. |

`--json` is available wherever machine-readable output makes sense.

## `ganju.json`

One file describes the whole script — the tools it exposes and the rules it runs
under. It travels with the deploy, so the code and the permissions it needs are
reviewed in the same pull request.

```jsonc
{
  "artifact": "acme-support",
  "organizationId": "…", // written by `ganju link`
  "projectId": "…",

  // Row-level, because that is the level they are enforced at: one script per
  // project, one set of rules for all of it.
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

Those four settings are exactly what the dashboard's **Settings** dialog writes.
Two doors onto one row — change them in either place and the other reflects it.

**Secrets are not in this file, and must not be.** A value committed beside your
source is the thing this feature exists to avoid. Send them once with
[`ganju secret set`](#secrets).

## Two ways to write the router

Give every tool an **`entry`** and the map from tool name to handler is generated
from the manifest, so the tool name is written in exactly one place — and
`lookup-order` vs `lookupOrder` stops being a mistake anyone can make:

```js
// src/lookupOrder.js
import { defineTool } from '@ganju/sdk';

export default defineTool(async (input, ctx) => {
  const { accessToken } = await ctx.connection('google-gmail');
  const res = await fetch(`https://api.acme.com/orders/${input.orderId}`);
  return { status: (await res.json()).status };
});
```

Or give **none** of them one and write the map yourself, in the file named by
`main` (default `src/index.ts`). That's what the dashboard editor produces, so
it's also what you have if you're moving a script out of the browser:

```js
import { createHandler, defineTool } from '@ganju/sdk';

export default createHandler({
  'lookup-order': defineTool(async (input, ctx) => ({ status: 'shipped' }))
});
```

**A mix of the two is refused rather than resolved**, because either resolution
silently drops half of what you wrote.

## What the build does

`esbuild` bundles the project to one ES module — not as an optimisation, but
because a deployed script *is* a single module, and bundling is what makes more
than one source file possible.

**`@ganju/sdk` is not bundled.** It's rewritten to `./ganju-sdk.js`, the sibling
module the publish pipeline attaches to every upload. A copy inside your bundle
would be dead weight, and a version frozen into it would drift from the broker it
talks to.

TypeScript works. Types are **stripped, not checked** — a bundle is already
compiled by the time it reaches the upload endpoint — so run `tsc` yourself if
you want them enforced.

A CLI upload is stored as a compiled `bundle`, which is why the dashboard shows
it read-only rather than inviting someone to overwrite a real build with the
contents of a text box. You can still read it there, and still roll back to it.

## Testing

```bash
ganju test lookup-order --input '{"orderId":"A-1029"}'
ganju test lookup-order --input-file ./fixtures/order.json
ganju test lookup-order --version active
```

This is the same preview run the dashboard's test panel makes: the version
deploys to a script nothing dispatches to, runs once against **real** connections,
secrets and egress rules, and is deleted afterwards. Your live version keeps
serving clients throughout.

`--version active` runs what is currently live and uploads nothing — useful for
reproducing a report without touching anything. Without it, `test` builds and
uploads your working tree first.

The input is checked against the tool's own schema before the run, and the result
against its output schema after, because those are the two ways a real call
fails. Test runs count toward your monthly tool calls.

## Logs

```bash
ganju logs                       # the last 20 calls
ganju logs --tool lookup-order   # only this one
ganju logs --limit 100
ganju logs --follow
```

Each entry is one completed call: the tool, how long it took, the error if there
was one, and the `ctx.log` lines your handler produced. Logs travel back with the
result rather than being shipped line by line, which is why a `ctx.log` costs no
round trip and why a call arrives as one whole entry.

**`--follow` is polling, and says so.** There is nothing to tail — a row appears
when a call finishes. Calls are kept for 90 days.

## Versions and rollback

```bash
ganju versions
ganju rollback 12
```

`versions` distinguishes **published** from **live**, which are not the same
thing: every version that has ever been live is published, and exactly one is the
project's active version. Rolling back moves that pointer without changing any
row's status.

A version is the unit of both code and contract — the tool names your clients see
come from that row, not from the running script — so rolling back takes the
schemas with it.

A deploy that dies partway leaves a draft behind. That's the intended state
rather than a leak: `ganju versions` shows it, and the next deploy makes a new
one rather than resuming a draft whose bundle never arrived.

## Secrets

```bash
GANJU_SECRET_VALUE=sk_live_… ganju secret set ACME_KEY
ganju secret list
ganju secret rm ACME_KEY
```

These are the values `ctx.secret('ACME_KEY')` reads. Three things to know:

- **`set` replaces rather than adds.** A second secret under one name would
  silently win while the first stayed visible in every list and reachable by
  nothing, so setting an existing name deletes the old row first.
- **`list` can never print a value.** The endpoint strips it from every row it
  returns, so the CLI has no way to show you what a secret is set to. Set a new
  one to change it.
- **A secret is live from the next call**, with no deploy after it.

`ganju secret set NAME VALUE` works, but puts the value in your shell history —
`GANJU_SECRET_VALUE` exists so the happy path doesn't leak it to `~/.zsh_history`.

## Signing in

`ganju login` is a **loopback redirect** (RFC 8252), the same flow `gh` and
`wrangler` use: the CLI holds a port open, sends your browser to the authorize
endpoint, and reads the code off the redirect. The client is public — no secret,
PKCE instead, because a secret shipped in an npm package is a secret every user
of that package has. It registers itself on first login, so nothing has to be
provisioned by hand.

Tokens live in `~/.ganju/credentials.json`, mode `0600`, **keyed by API origin** —
so working against a local deployment and a hosted one at the same time doesn't
log you out of one every time you touch the other.

A login carries an authority an MCP client's token deliberately does not.
Connecting Claude Desktop to one of your MCP servers gives it a live token for
your account; that token is refused by the control plane, so connecting a client
is never an act of full delegation.

## CI

A browser login produces a token that lives an hour, and the CLI never refreshes
one handed to it through the environment — there's nowhere to write the new value
back to. Fine for a job you start by hand, useless for a scheduled one whose
second run is always after that hour is up.

**Personal access tokens** are the durable answer:

```bash
ganju token create "GitHub Actions" --expires 90
ganju token create ci --json | jq -r .token   # pipes into a secret store
ganju token list
ganju token revoke "GitHub Actions"
```

Then every command works with no browser:

```yaml
- run: npx @ganju/cli deploy
  env:
    GANJU_API_TOKEN: ${{ secrets.GANJU_API_TOKEN }}
```

Six things worth knowing:

- **Scoped to one project.** A token in one repository's settings reaches that
  repository's server and nothing else in your account, however much its holder
  would otherwise be authorized to touch.
- **No picker, because there's nothing to choose.** `token create` mints against
  the project `ganju.json` is already linked to.
- **The value exists once**, in the response that creates it — what's stored is
  its hash. The value goes to stdout alone with every other line on stderr, which
  is what makes the `jq` pipe above clean.
- **Revocation lands on the next request.** Authentication is a lookup, not a
  cached lease.
- **A token cannot manage tokens.** Minting is deliberately something a person
  does, so a leaked credential can't quietly mint its own replacement. Run
  `ganju token create` from a browser login.
- **A token outlives the account that made it**, marked inactive rather than
  vanishing — so a pipeline that stops has something to point at instead of
  failing for no visible reason. It stops authenticating the moment its owner is
  gone.

`GANJU_API_TOKEN` also accepts a plain OAuth access token, which is the
hand-started case; the `ganju_pat_…` value above is the one a schedule can be
built on.

## Environment

| | |
| --- | --- |
| `GANJU_API_URL` | Which deployment to talk to. Also settable per project as `apiUrl` in `ganju.json`. |
| `GANJU_API_TOKEN` | A token for a machine with no browser. Bypasses the stored login entirely. |
| `GANJU_SECRET_VALUE` | `ganju secret set NAME` reads the value from here, keeping it out of shell history. |
| `GANJU_CONFIG_DIR` | Where the token store lives. Default `~/.ganju`. |

## What the CLI does not cover

Custom tools, end to end — and that's the boundary. Prompts, knowledge
([resources](/docs/resources)), catalog tools, [channels](/docs/channels),
members and billing are dashboard-only for now.

## Next

- **[Functions](/docs/tools/functions)** — the same work in the browser, plus the
  reference for `ctx` and the settings these commands write.
- **[HTTP Endpoints](/docs/tools/http-endpoints)** — when one request is all you
  need, and no code.
