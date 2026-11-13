---
title: CLI
description: "The ganju command line: write, deploy, test and debug your project's functions from a terminal, manage its database, and ship from CI."
order: 37
updated: 2026-11-13
---

`ganju` is the command line for developers. It writes, tests and deploys a
project's [functions](/docs/tools/functions/) (the actions your bot runs),
manages the project's [database](/docs/data/), and runs the same way in CI. It
is a client of the same endpoints the app uses, so a deploy from the CLI and a
change made by the [Assistant](/docs/assistant/) land in the same place.

Inside the app, the project's owner builds by talking to the Assistant and
reads the code on the **Tools** page; nobody edits code in the browser. Reach
for the CLI when the functions belong in a repository, in code review and in a
pipeline.

```bash
npm install -g @ganju/cli
```

Node 20 or newer. The package is `@ganju/cli`, and the binary is `ganju`. To run
it without installing, use `npx @ganju/cli <command>`. Functions and Data need
the organization to be on **Pro** or **Enterprise**.

## Your first deploy

```bash
ganju init my-tools     # scaffold a project that deploys as-is
cd my-tools
ganju login             # opens your browser, signs in on this machine
ganju link              # pick the organization and project this deploys to
ganju deploy            # bundle, upload, publish
```

`ganju init` writes a working tool rather than an empty file: a `ganju.json`
with one `lookup-order` tool declared, and `src/lookupOrder.js` implementing it.
The next command succeeds, and you edit from something that ran.

`ganju deploy` prints each step, and ends with the tools now live:

```
› bundling 1 tool
  1.1 KB (from 1.6 KB) · 1 entry, router generated
› creating a draft version
› uploading v1
› uploading the source (2 files, 1.9 KB)
› publishing
✓ v1 is live on my-tools — 1 tool
  lookup-order
```

## Every command

Run `ganju help` (or `ganju <command> --help`) for the list in your terminal,
and `ganju --version` for the version you have.

### Getting started

| Command | What it does |
| --- | --- |
| `ganju init [dir]` | Scaffold `ganju.json` and a handler in `dir` (default: the current folder). Refuses if that folder already has a `ganju.json`, and keeps an existing handler rather than overwriting it. |
| `ganju login` | Sign in on this machine, in your browser. |
| `ganju logout` | Delete the stored token for this API. Nothing you deployed changes. |
| `ganju whoami` | Who this machine is signed in as, and against which API. |
| `ganju link` | Pick the organization and project, and write them into `ganju.json`. Creates `ganju.json` when there is none, so a folder that only uses `ganju data` needs no `init`. |
| `ganju link --status` | Show what `ganju.json` is linked to, without changing it. |

### Working on functions

| Command | What it does |
| --- | --- |
| `ganju build` | Lint the tools, bundle and minify them to `.ganju/bundle.js`, and report the size. |
| `ganju deploy` | Build, upload and publish. Also deploys the `triggers` in `ganju.json`, if it has any. |
| `ganju test <tool>` | Run one tool once, without publishing it. |
| `ganju logs` | Recent calls and their `ctx.log` output. |

### Managing what is live

| Command | What it does |
| --- | --- |
| `ganju versions` | Every version, which is published, and which one is live. |
| `ganju rollback <version>` | Put a previously live version back. |
| `ganju secret set\|list\|rm` | The values `ctx.secret()` reads. |
| `ganju token create\|list\|revoke` | Durable tokens for CI, scoped to this project. |

### Channels and data

| Command | What it does |
| --- | --- |
| `ganju channel templates` | The WhatsApp message templates of the project's channels, with Meta's status. |
| `ganju data …` | The project's database: tables, rows, imports, exports, saved queries, schema as code and restore. See [Project data](#project-data). |

### Flags

Every flag is listed here with the commands that read it. A flag no command
defines is an error, so a typo never runs a command you didn't mean.

| Flag | Commands | What it does |
| --- | --- | --- |
| `-h`, `--help` | any | The help text. `ganju data --help` shows the data commands. |
| `--draft` | `deploy` | Save the version without publishing it. |
| `--force` | `deploy` | Replace a live version made in the app without asking. |
| `--no-minify` | `build`, `deploy` | Keep the bundle readable. |
| `--strict` | `build` | Fail when the tool linter has warnings. |
| `--input '<json>'` | `test` | The arguments to call the tool with. |
| `--input-file <path>` | `test` | The same, from a file. |
| `--version <n\|latest\|active>` | `test` | Run an existing version instead of the code in the folder. |
| `--tool <name>` | `logs` | Only this tool's calls. |
| `--limit <n>` | `logs` | How many entries (default 20). |
| `--follow` | `logs` | Keep polling for new calls. |
| `--organization <name or id>` | `link` | Skip the organization prompt. |
| `--project <name or id>` | `link` | Skip the project prompt. |
| `--status` | `link` | Show what is linked. |
| `--expires <days\|never>` | `token create` | When the token stops working. |
| `--json` | `test`, `logs`, `versions`, `token create`, `token list`, `channel templates`, most `data` commands | Machine-readable output. |

The flags of `ganju data` are listed under [Project data](#project-data).

## `ganju.json`

One file describes the project: the tools it exposes, the rules the code runs
under, and optionally the database triggers it deploys. It travels with the
deploy, so the code and the permissions it needs are reviewed in the same pull
request.

```jsonc
{
  "artifact": "acme-support",  // written by `ganju link`
  "organizationId": "…",       // written by `ganju link`
  "projectId": "…",            // written by `ganju link`
  "uploadSource": true,        // the default: send the readable source too

  // How the code may run. One set of rules for the whole project.
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
        "properties": {
          "orderId": { "type": "string", "description": "The order number the customer gave." }
        },
        "required": ["orderId"]
      },
      "output": { "type": "object", "properties": { "status": { "type": "string" } } },
      "annotations": { "readOnlyHint": true },
      "data": { "access": "read", "tables": ["orders"] }
    }
  ]
}
```

### Project settings

| Key | What it does |
| --- | --- |
| `artifact`, `organizationId`, `projectId` | Where this deploys. Written by `ganju link`; none of them is secret, so commit them. |
| `apiUrl` | Which Ganju deployment to talk to. Default `https://api.ganju.ai`. `GANJU_API_URL` overrides it. |
| `main` | Your own router, for projects whose tools don't name an `entry`. Default `src/index.ts`. |
| `connections` | The connected accounts the code may ask a token for, and send files as, e.g. `google-gmail`, `google-calendar`. Anything else is refused when the tool runs. |
| `allowedHosts` | The hosts `fetch` may reach. An entry allows its subdomains too. **Empty or left out means any public host**. Private and loopback addresses are always blocked. |
| `timeoutMs` | How long one call may take. Default 10,000, at most 30,000. |
| `resourceAccess` | How far `ctx.resources.create` and `.delete` reach: `"own"` (the default, only what the tools wrote) or `"all"`. |
| `uploadSource` | Whether `deploy` uploads the readable source beside the bundle. On unless `false`. |
| `tools` | The tools, below. At least one. |
| `triggers` | Database triggers to deploy with the functions. Left out, `deploy` doesn't touch the database's triggers; `[]` removes the ones it deployed. See [Triggers](#triggers). |

Only the keys you write are sent; the server applies its own defaults for the
rest. The four keys `connections`, `allowedHosts`, `timeoutMs` and
`resourceAccess` are the same settings the **Settings** dialog on the
**Tools** page shows, so a change in either place shows in the other.

### Each tool

| Key | What it does |
| --- | --- |
| `name` | What the model calls, e.g. `lookup-order`. Letters, digits, `_` or `-`, up to 64 characters. |
| `title` | The readable label. |
| `description` | How the model decides whether to call it. Say **when** to use it, not only what it does. |
| `entry` | The file whose default export handles this tool. Give it on every tool, or on none. |
| `input` | JSON Schema of the arguments. Each property is offered to the model. |
| `output` | Optional JSON Schema. Declare one and the tool must return a matching object; MCP clients get structured output instead of text. |
| `annotations` | `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`. |
| `data` | What the tool may do with the project's database through `ctx.data`: `{ "access": "read" \| "write", "tables": [...] }`. Left out, everything. |
| `expose` | `false` deploys the tool for triggers only: the bot never sees it, and it doesn't count toward the project's tools. |
| `channels` | `true` lets the tool message customers and chats through `ctx.channels`. Left out, those calls are refused. |

`annotations` are the [MCP tool annotations](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-annotations).
They reach MCP clients as hints, and they decide what a channel bot confirms
when the organization turns on
[Confirm sensitive actions](/docs/settings/#confirm-sensitive-actions): a tool
that declares neither `readOnlyHint: true` nor `destructiveHint: false` is asked
about before it runs. Mark lookups read-only; leave anything that sends,
charges or deletes as `destructiveHint: true`.

`data`, `expose` and `channels` are explained in
[Data from functions](/docs/data/functions/).

**Secrets are not in this file, and must not be.** A value committed beside
your source is exactly what secrets exist to avoid. Send them once with
[`ganju secret set`](#secrets).

## Two ways to write the router

Give every tool an **`entry`** and the map from tool name to handler is
generated from `ganju.json`, so the tool name is written in exactly one place:

```js
// src/lookupOrder.js
import { defineTool } from '@ganju/sdk';

export default defineTool(async (input, ctx) => {
  const res = await fetch(`https://api.acme.com/orders/${input.orderId}`, {
    headers: { authorization: `Bearer ${await ctx.secret('ACME_KEY')}` }
  });
  return { status: (await res.json()).status };
});
```

Or give **none** of them one and write the map yourself, in the file named by
`main` (default `src/index.ts`). This is the shape of the functions the
Assistant writes, so it's also what you have if you move them into a
repository:

```js
import { createHandler, defineTool } from '@ganju/sdk';

export default createHandler({
  'lookup-order': defineTool(async (input, ctx) => ({ status: 'shipped' }))
});
```

**A mix of the two is refused rather than resolved**, because either reading
silently drops half of what you wrote.

## What the build does

`esbuild` bundles the project to one ES module, because a deployed script is a
single module, and bundling is what lets you split code across files and use
npm packages.

**`@ganju/sdk` is not bundled.** It's rewritten to `./ganju-sdk.js`, the module
the platform attaches beside every upload, so your bundle never carries a copy
that could drift from the platform it talks to.

TypeScript works. Types are **stripped, not checked**, so run `tsc --noEmit`
yourself if you want them enforced. A bundle is capped at 3 MB.

```bash
ganju build              # lint, bundle, minify, report the size
ganju build --no-minify  # keep .ganju/bundle.js readable
ganju build --strict     # fail on any lint warning (useful in CI)
```

`deploy` bundles on its own from the current source; it never reads a
`.ganju/bundle.js` you built earlier.

## The tool linter

Before it bundles, `ganju build` checks how each tool reads to a model, the
things that make a model pick the wrong tool or guess at its arguments. It
warns about:

- a **missing or very short description**, or one that never says **when** to
  use the tool;
- **no `annotations`**: the tool is then treated as one that may change things,
  and confirmed before every call when the organization confirms sensitive
  actions, lookups included;
- **input properties with no description**;
- an input property named **`confirmation`**, which the platform keeps for
  itself;
- **two tools that look alike** in name or description.

Warnings never stop a build. `--strict` makes them fail it.

`ganju deploy` prints the same checks, run by the API against the whole
server, so they also cover overlap with the project's other tools and warn
when more than 25 are enabled.

## Deploying

```bash
ganju deploy             # build, upload, publish
ganju deploy --draft     # upload a version, publish nothing
ganju deploy --force     # don't stop for a live version made in the app
```

A deploy is three steps: a draft version is created from `ganju.json`, the
bundle (and the readable source) is attached to it, and the draft is
published. A deploy that dies partway leaves a draft behind. That's
intended: `ganju versions` shows it, and the next deploy makes a new one
rather than resuming a draft whose bundle never arrived.

**A deploy replaces every function of the project** with the ones in the
folder. A function that isn't in `ganju.json` stops existing on the server.

### Deploying over changes made in the app

The project's owner may have changed the functions through the
[Assistant](/docs/assistant/) since your last deploy. When the live version was
made in the app, `ganju deploy` stops before publishing:

```
! The live version, v14, was made in the app. Deploying replaces it with this folder's code.
  These functions would stop working: check-stock
  Copy any changes made in the app that you want to keep into this project first.
Replace it? [y/N]
```

It names the functions your folder doesn't have, which would stop working. In a
terminal it asks; in a script, where there is nobody to ask, it stops, and
`--force` deploys anyway. `--draft` is never stopped, since a draft replaces
nothing.

### Your source in the app

Beside the bundle, `ganju deploy` uploads the project's **readable source**, so
the **Tools** page shows your real files instead of minified code, and so the
project's Assistant can read them. It is only shown, never run: the bundle is
what runs.

The files are what git would commit: tracked files, plus untracked ones that
aren't ignored. Outside a git repository, your `.gitignore` files are read
instead. Some things never go, whatever the ignore rules say: `node_modules`,
`.ganju`, `.git`, `.env*` files, lockfiles and binary files. A file over
256 KB is left out and named in the output; a project over 2 MB or 500 files
sends no source at all, with a warning. A failed source upload never fails the
deploy. Set `"uploadSource": false` to send only the bundle.

Because your source is there, the Assistant doesn't replace code you deploy.
When the owner asks it for a code change, it writes a patch for you instead,
which they pass on as **A change for your developer**. Apply it, then deploy as
usual.

## Testing

```bash
ganju test lookup-order --input '{"orderId":"A-1029"}'
ganju test lookup-order --input-file ./fixtures/order.json
ganju test lookup-order --version active    # what is live now
ganju test lookup-order --version latest    # the newest version
ganju test lookup-order --version 12        # one version, by number
ganju test lookup-order --input '{"orderId":"A-1029"}' --json
```

The version runs on a preview script nothing else calls, once, against **real**
connections, secrets and egress rules, and the preview is deleted afterwards.
Your live version keeps serving clients throughout. A tool that sends an email
or writes a row does it for real, so point tests at yourself or at test data.

Without `--version`, `test` bundles the folder and uploads it as a new draft
first (it prints `saved as draft vN — not published`). With `--version`, it
uploads nothing.

The input is checked against the tool's input schema before the run, and the
result against its output schema after, because those are the two ways a real
call fails. You get the tool's `ctx.log` lines, then the output or the error,
and how long it took. A failed run exits with code 1. Test runs count toward
your monthly tool calls.

## Logs

```bash
ganju logs                       # the last 20 calls
ganju logs --tool lookup-order   # only this one
ganju logs --limit 100
ganju logs --follow              # keep watching; ctrl-c to stop
ganju logs --json
```

Each entry is one completed call: when, the tool, how long it took, the
`ctx.log` lines it produced, and the error if there was one. Logs travel back
with the result, which is why a `ctx.log` costs nothing extra and why a call
arrives as one whole entry. `--follow` polls every few seconds, since a call
appears only when it finishes; it can't be combined with `--json`.

## Versions and rollback

```bash
ganju versions
ganju versions --json
ganju rollback 12
```

```
   VERSION  STATUS     TOOLS  SOURCE           CREATED
●  v14      live       3      editor           2026-11-12 21:04:10
   v13      published  2      bundle + source  2026-11-10 15:22:41
   v12      draft      2      bundle + source  2026-11-10 15:20:03
```

`SOURCE` says where a version came from: `editor` is a version made in the app
(by the Assistant), `bundle` one uploaded by the CLI, and `+ source` means its
readable source was uploaded too. Times are UTC. A version that failed to
publish is listed with its error under the table.

**Published** and **live** are not the same thing: every version that has ever
been live is published, and exactly one is the project's live version.
`ganju rollback` takes a version number (or id) that has been live before, and
moves the live pointer back to it.

A version is the unit of both code and contract. The tool names your clients
see come from that version, not from the running script, so rolling back
brings the schemas back with the code.

## Secrets

```bash
GANJU_SECRET_VALUE=sk_live_… ganju secret set ACME_KEY
ganju secret list
ganju secret rm ACME_KEY
```

These are the values `ctx.secret('ACME_KEY')` reads. Three things to know:

- **`set` replaces rather than adds.** Setting an existing name deletes the old
  value first.
- **`list` never prints a value.** It shows names and when each was set. To
  change a value, set it again.
- **A secret is live from the next call**, with no deploy.

`ganju secret set NAME VALUE` works too, but puts the value in your shell
history. To keep it out, read it without echoing:

```bash
read -s GANJU_SECRET_VALUE && export GANJU_SECRET_VALUE
ganju secret set ACME_KEY
unset GANJU_SECRET_VALUE
```

`ls` works for `list`, and `remove` or `delete` for `rm`. Secrets can also be
added and removed in the **Settings** dialog of the **Tools** page.

## Triggers

`ganju.json` can carry the project's database triggers, deployed by
`ganju deploy` right after the functions, so a trigger can name a function
the same deploy added:

```jsonc
"triggers": [
  { "table": "orders", "on": "insert", "function": "notify-kitchen" },
  {
    "table": "orders",
    "on": "update",
    "when": { "status": { "changedTo": "ready" } },
    "function": "tell-customer"
  },
  {
    "name": "nightly-orders",
    "on": "schedule",
    "every": "day",
    "at": "21:00",
    "query": "todays_orders",
    "email": { "to": "owner@example.com", "subject": "Today's orders", "text": "{{count}} orders on {{date}}" }
  }
]
```

`deploy` lists each trigger it deployed, the ones it removed, and the signing
secret of a new webhook trigger, shown once. The rules for conditions, time
triggers and actions are in
[Triggers](/docs/data/triggers/#deploy-triggers-with-the-cli), and schedules
have their own page, [Schedules](/docs/data/schedules/).

## WhatsApp templates

```bash
ganju channel templates
ganju channel templates --json
```

Lists the message templates of each WhatsApp channel in the project, as Ganju
last synced them from Meta: name, language, category, status (with Meta's
reason when rejected), and the variables. It only reads: templates are created
in the channel's **Message templates** tab in the app, where they are checked
before going to Meta for review. A function sends an approved one with
`ctx.channels.send`.

## Project data

`ganju data` manages the project's [database](/docs/data/) from a terminal.
Every command calls the [Data API](/docs/data-api/) the app uses, so a row
written here follows the same rules and is recorded under your login or
token. Run `ganju data help` for the list in your terminal.

### Database

| Command | What it does |
| --- | --- |
| `ganju data create [--name <name>]` | Create the project's database. `--replace --yes` gives up restoring a deleted one and starts a new one. |
| `ganju data info` | Status, size, tables and open index suggestions. `status` works too. |
| `ganju data drop --yes --confirm <name>` | Delete the database. It can be restored for 7 days. |
| `ganju data restore` | Undo a delete. |
| `ganju data restore --at <ISO time> --yes` | Put the database back to a point in time, e.g. `2026-10-30T09:15:00-05:00`. |
| `ganju data restore --bookmark <b> --yes` | Put it back to a bookmark (a drop prints the one that undoes it). |
| `ganju data checkpoint` | Take a bookmark of right now. Prints it alone, so `B=$(ganju data checkpoint)` works. |
| `ganju data time-zone [<zone>]` | Show or set the zone datetimes come back in and schedules run in, e.g. `America/Bogota`. `--clear` goes back to UTC. |
| `ganju data export [--format jsonl\|csv] [--out <dir>]` | Download every table (default JSONL) and the schema. |
| `ganju data changes` | The schema change log. `log` works too. |
| `ganju data copy [status\|wait\|dismiss]` | A table copy running in the background, after a column change. |
| `ganju data index add\|dismiss <id>` | Act on an index suggestion from `info`. |

### Tables and columns

| Command | What it does |
| --- | --- |
| `ganju data tables` | The tables and their columns, what the bot may do with each, and which are synced from a spreadsheet. |
| `ganju data table create <name> --schema <file>` | Create a table from a schema file. |
| `ganju data table rename <name> <new-name>` | Rename a table. |
| `ganju data table rm <name> --yes --confirm <name>` | Drop a table. |
| `ganju data table sync <name>` | Read a synced table's spreadsheet again now. |
| `ganju data column add <table> <name> <type> [--input '<json>']` | Add a column; `--input` takes its other settings. |
| `ganju data column rename <table> <name> <new-name>` | Rename a column. |
| `ganju data column change <table> <name> --input '<json>' [--yes]` | Change a column. A type change copies the table and needs `--yes`; `--no-wait` returns before the copy ends. |
| `ganju data column rm <table> <name> --yes` | Drop a column. |

### Schema as code

| Command | What it does |
| --- | --- |
| `ganju data schema pull` | Write the database's tables and saved queries to `ganju.data.json`. |
| `ganju data schema diff` | Show what `push` would change. |
| `ganju data schema push [--yes]` | Apply the file. Drops and type changes need `--yes`. |

`--schema <file>` uses another file instead of `ganju.data.json`.

### Rows

| Command | What it does |
| --- | --- |
| `ganju data rows <table>` | List rows. Takes `--where` (repeatable), `--sort`, `--search`, `--include`, `--limit` (up to 500), `--cursor`, `--all` and `--json`. |
| `ganju data get <table> <id>` | One row. `--include` expands relations. |
| `ganju data insert <table> --input '<json>'` | Add a row, or a list of rows. `--input-file rows.jsonl` reads JSON or JSONL. |
| `ganju data update <table> <id> --input '<json>' [--version <n>]` | Change a row. `--version` refuses the change if the row changed since you read it. |
| `ganju data delete <table> <id>... [--yes]` | Delete rows. `rm` works too. |
| `ganju data history <table> <id>` | A row's change history. |
| `ganju data write --input-file ops.json` | Several writes, all or nothing. |
| `ganju data import <table> <file>` | Import a CSV, Excel or JSONL file. Takes `--map 'Header=column'` (repeatable), `--sheet <name>`, `--decimal-mark . \| ,`, `--out <file>` for the refused rows, and `--replace --yes --confirm <table>` to replace every row. |

### Saved queries

| Command | What it does |
| --- | --- |
| `ganju data queries` | The saved queries, their parameters and what they read. |
| `ganju data query save --input-file <file>` | Save one: `{ "name", "description", "sql", "params", "assistant" }`. |
| `ganju data query rm <name> --yes` | Delete one. |
| `ganju data run <name> [--input '<json>'] [--limit <n>]` | Run one by name, with its parameters. |

### Filters and confirmations

`--where` takes `column=value` and `!=`, `>`, `>=`, `<`, `<=`, `~` (contains),
`^=` (starts with). `status=[open,done]` matches any of the values, and
`note=null` finds empty ones. On a text column the value is text as typed
(`phone=3001234567`); elsewhere, quotes keep a value as text: `code="007"`.
Repeat `--where` to require several conditions, or pass the JSON filter
itself: `--where '{"price":{"lt":30000}}'`.

Anything that drops, deletes or rewrites data needs `--yes`. Dropping the
database or a table also needs its name, typed with `--confirm`. In a terminal
a missing confirmation is asked for; in a script it is refused.

```bash
ganju data rows menu --where 'price<30000' --where size=30cm --sort -price --limit 50
ganju data insert menu --input '{"name":"Margherita","price":28000}'
ganju data import menu menu.xlsx --sheet Menu --map 'Price (COP)=price'
ganju data schema diff
ganju data table rm orders --yes --confirm orders
ganju data export --format csv --out backup/
```

With `GANJU_API_TOKEN` set, writes are recorded as the token, and data
commands wait out a `429` on their own. The details of each command, with
examples, are in the [Data API](/docs/data-api/#from-the-command-line) page.

## Signing in

`ganju login` opens your browser to sign in and comes back to the terminal on
its own. It's the loopback flow `gh` and `wrangler` use: the CLI listens on a
local port for the redirect, with PKCE and no client secret, and registers
itself on first login.

The login is stored in `~/.ganju/credentials.json`, readable only by you,
**per API**, so working against two deployments doesn't log you out of either.
A stored login renews itself when it expires. `ganju logout` deletes it from
this machine; it doesn't change anything you deployed.

`ganju login` refuses to run while `GANJU_API_TOKEN` is set, since that token
would be used instead.

A login can deploy; the token an MCP client like Claude Desktop gets when it
connects to your project can't. Connecting a client never hands it control of
your project.

## CI

A token from `GANJU_API_TOKEN` is never refreshed, and the token a browser
login holds lasts about an hour, so a scheduled job needs a **personal access
token**:

```bash
ganju token create "GitHub Actions" --expires 90
ganju token create ci --expires never --json | jq -r .token
ganju token list
ganju token revoke "GitHub Actions"
```

Then every command works with no browser:

```yaml
- run: npx @ganju/cli deploy
  env:
    GANJU_API_TOKEN: ${{ secrets.GANJU_API_TOKEN }}
```

Commit `ganju.json` with `organizationId` and `projectId` filled in (neither is
secret). A common setup runs `ganju build --strict` on every pull request and
`ganju deploy` on merge. A pipeline has no terminal, so a deploy over a version
made in the app stops unless you pass `--force`.

What to know about tokens:

- **Scoped to one project**, the one `ganju.json` is linked to. A token reaches
  that project's functions and data and nothing else in your account.
- **The value is shown once**, when it's created. Only a hint is kept, so
  `list` shows names, who made each, when it was last used and when it expires.
  With `--json`, `create` prints the whole token object, which is what makes the
  `jq` pipe above work.
- **`--expires`** takes a number of days, or `never`.
- **Revoke by name or id.** A name two tokens share is refused, with their ids.
  Revocation lands on the next request.
- **A token cannot create or revoke tokens.** Run `ganju token create` from a
  browser login, so a leaked token can't mint its own replacement.
- **A token outlives the account that made it**, listed as inactive, and stops
  working the moment its owner is removed.

`ls` works for `list`, `new` for `create`, and `rm`, `remove` or `delete` for
`revoke`.

## Environment

| Variable | What it does |
| --- | --- |
| `GANJU_API_URL` | Which deployment to talk to. Overrides `apiUrl` in `ganju.json`. |
| `GANJU_API_TOKEN` | A token for a machine with no browser. Replaces the stored login. |
| `GANJU_SECRET_VALUE` | `ganju secret set NAME` reads the value from here. |
| `GANJU_CONFIG_DIR` | Where the login is stored. Default `~/.ganju`. |

## What the CLI doesn't cover

Functions, the database and its triggers, and reading WhatsApp templates. The
rest is done in the app: prompts, knowledge ([resources](/docs/resources/)),
catalog tools and HTTP endpoints, [channels](/docs/channels/), members and
billing.

## Next

- **[Examples](/docs/tools/examples/)**: seven projects to deploy with these
  commands.
- **[Functions](/docs/tools/functions/)**: what a function is, the `ctx`
  reference, and how the **Tools** page shows them.
- **[Data from functions](/docs/data/functions/)**: `ctx.data`,
  `ctx.channels` and functions only triggers run.
- **[Agent skill](/docs/tools/agent-skill/)**: let a coding agent run these
  commands for you.
