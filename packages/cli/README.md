# `ganju` — the CLI

Write, deploy and debug custom tools from a terminal, and manage a project's
database. Everything here is a thin
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
| `ganju link` | Point `ganju.json` at an organization and project, creating the file if there is none (`--status` to just read it) |
| `ganju build` | Lint the tools, compile and minify, write `.ganju/bundle.js`, report the size. `--strict` fails on lint warnings |
| `ganju deploy` | Build, upload and publish (`--draft` to stop before publishing, `--force` to replace a live version made in the app) |
| `ganju test <tool>` | Run one tool against a sample input without publishing it |
| `ganju logs` | Recent calls, with their `ctx.log` output (`--follow` to keep watching) |
| `ganju versions` / `ganju rollback <n>` | What exists, which one is live, and going back |
| `ganju secret set\|list\|rm` | The values `ctx.secret()` reads |
| `ganju token create\|list\|revoke` | Personal access tokens for CI, scoped to the linked project |
| `ganju data …` | The project's database: tables, rows, import, export, restore and schema as code — [below](#ganju-data) |

## `ganju data`

The project's database (Pro and Enterprise), from the terminal. Every command
calls the [Data API](https://ganju.ai/docs/data-api) route the dashboard uses,
for the project `ganju.json` is linked to (`ganju link` in an empty folder makes
one, no `ganju init` needed), so a write here is checked by the
same rules and recorded the same way: under your account after `ganju login`,
or as `cli:<token id>` with `GANJU_API_TOKEN` set to a personal access token.
A `429` from a token's per-minute limit is waited out rather than failing a
long import halfway.

### Database

| Command | What it does |
| --- | --- |
| `ganju data create [--name <name>]` | Make the database. `--replace --yes` starts over while a deleted one is still restorable, giving that one up |
| `ganju data info` | Status, size, tables, and a table copy in progress |
| `ganju data index add\|dismiss <id>` | Act on an index suggestion. `info` lists them, with their ids: Ganju suggests indexing a column that queries often filter on while reading many more rows than they return. It also flags an index no query used in 30 days on a table written to a lot; nothing is removed |
| `ganju data drop --yes --confirm <name>` | Delete it, restorable for 7 days |
| `ganju data restore` | Undo a delete |
| `ganju data restore --at <ISO time> --yes` | Put everything back as it was then (within 30 days). The time needs its offset: `2026-10-30T09:15:00-05:00` or `…Z` |
| `ganju data restore --bookmark <b> --yes` | Put everything back to a bookmark: the one a drop, a type change, an import `--replace` or a checkpoint printed |
| `ganju data checkpoint` | A bookmark of right now, alone on stdout: `B=$(ganju data checkpoint)` |
| `ganju data time-zone [<zone>] [--clear]` | The zone datetimes come back in for the assistant, functions and anyone who sends none, e.g. `America/Bogota`. Without a zone, prints it |
| `ganju data export [--format jsonl\|csv] [--out <dir>]` | `schema.json` and one file per table, downloaded into a folder |
| `ganju data changes` | The schema change log: who changed what, when |
| `ganju data copy [status\|wait\|dismiss]` | A type change on a table over 100,000 rows copies it in the background; follow it, or clear a failed one |

### Tables and columns

| Command | What it does |
| --- | --- |
| `ganju data tables` | Every table with its columns |
| `ganju data table create <name> --schema <file>` | The file holds `{ "columns": [...] }`, a bare list of columns, or a `ganju.data.json` (the table of that name is used) |
| `ganju data table rename <name> <new-name>` | |
| `ganju data table rm <name> --yes --confirm <name>` | Drop it. Prints the bookmark that brings it back |
| `ganju data column add <table> <name> <type> [--input '<json>']` | `--input` holds the rest: `'{"required":true,"min":0}'`, `'{"table":"menu","onDelete":"cascade"}'` |
| `ganju data column rename <table> <name> <new-name>` | Keeps every value |
| `ganju data column change <table> <name> --input '<json>'` | Any setting. A new `type` or relation `table` copies the table and needs `--yes` |
| `ganju data column rm <table> <name> --yes` | Drop it. Prints the bookmark that brings it back |

A change that copies a large table waits for the copy and shows its progress;
`--no-wait` hands the terminal back, and `ganju data copy wait` picks it up.
While it runs, the table refuses other changes and writes that reach it.

### Rows

| Command | What it does |
| --- | --- |
| `ganju data rows <table>` | A page of rows. `--where`, `--sort -price,name`, `--search <text>`, `--limit` (up to 500), `--cursor`, `--include <relation columns>`, `--all` for every page, `--json` |
| `ganju data get <table> <id>` | One row, with its `version` |
| `ganju data insert <table> --input '<json>' \| --input-file rows.jsonl` | One row, a JSON list or a JSONL file. Up to 5,000 rows go in as one write, all or nothing; past that, 5,000 at a time |
| `ganju data update <table> <id> --input '<json>' [--version <n>]` | Values, or relative changes: `'{"stock":{"decrement":2}}'`. With `--version`, a row changed since is refused, showing who changed it and how it is now |
| `ganju data delete <table> <id>... [--yes]` | Shows what a cascade would also remove first, and refuses when a restrict blocks it. Several ids are deleted together or not at all |
| `ganju data history <table> <id>` | Every change in the last 90 days, and who made it |
| `ganju data write --input-file ops.json` | Several inserts, updates and deletes across tables, all or nothing (`{ "$ref": <step> }` for an earlier insert's id) |
| `ganju data import <table> <file>` | A `.csv`, `.tsv`, `.json` or `.jsonl` file, in batches of 500 |

### Named queries

A `SELECT` saved once with named parameters (`:from`), for reports the row
filters can't express. It is checked when saved: one statement, reading only
this database's tables. Functions run it with `ctx.data.run`; with
`"assistant": true` channel bots can run it too.

| Command | What it does |
| --- | --- |
| `ganju data queries` | The saved queries, their parameters and the tables they read |
| `ganju data query save --input-file sales.json` | `{ "name", "description", "sql", "params": [{ "name": "from", "type": "datetime" }], "assistant" }`. Saving an existing name replaces it |
| `ganju data query rm <name> --yes` | Delete it |
| `ganju data run <name> [--input '{"from":"2026-10-01T00:00:00-05:00"}'] [--limit 100] [--json]` | Its rows, up to 500 |

**`--where`** is one condition per flag, and every one has to hold:

| You type | The API gets |
| --- | --- |
| `--where status=open` | `{"status":"open"}` |
| `--where 'price<30000'` (also `<=` `>` `>=` `!=`) | `{"price":{"lt":30000}}` |
| `--where 'name~pizza'` / `--where 'name^=Marg'` | `{"name":{"contains":"pizza"}}` / `{"name":{"startsWith":"Marg"}}` |
| `--where 'status=[open,done]'` / `--where 'id!=[1,2]'` | `{"status":{"in":["open","done"]}}` / `{"id":{"notIn":[1,2]}}` |
| `--where note=null` / `--where note!=null` | `{"note":null}` / `{"note":{"ne":null}}` |
| `--where phone=3001234567` | `{"phone":"3001234567"}` — on a text column the value is text as typed |
| `--where 'code="007"'` | `{"code":"007"}` — quotes keep a value as text on any column |
| `--where 'price>=10' --where 'price<20'` | `{"price":{"gte":10,"lt":20}}` |
| `--where 'product.name=Margherita'` | a column of the table a relation points at |
| `--where '{"price":{"lt":30000}}'` | the JSON itself, as is |

On a text, long text, phone, email, URL, enum, date or datetime column, a
value is text as typed (only `null` means empty), read from the table's
column types, through relations too. On other columns, numbers, `true`, `false`
and `null` mean themselves, and anything else is text. Raw JSON is sent as
written.
Quote the whole condition for your shell when it holds `<`, `>` or spaces.

**`import`** makes the dashboard's choices, with the same code: headers are
matched to columns by name or label (ignoring case, accents and punctuation),
`--map 'Precio (COP)=price'` points one by hand (`--map 'Notes='` leaves it
out), numbers like `28.000` and `1.234,5` are read with their thousands
separators (`--decimal-mark . | ,` when the file is ambiguous), and a relation
column matches the other table's display value, so "Margherita" becomes its
row's id. Every cell is checked before anything is sent; a batch refused for
one row is split until that row is found, so it costs only itself. The rows
refused, and why, are written to `<file>.refused.csv` (or `--out`), ready to
fix and import again.

`--replace` swaps every row of the table for the file's. It needs `--yes` and
`--confirm <table>`, shows what rows elsewhere point at the old ones (and stops
if a restrict would block it), and takes a checkpoint first, printing the
bookmark that undoes it. Up to 5,000 rows on both sides it is one write: the
old rows go only if every new one lands. When that write is refused, the rows
behind it are found with test writes that never commit (up to 20 of them), and
the whole file is written to `<file>.marked.csv` with each problem beside its
row; nothing in the table changed.

A spreadsheet (`.xlsx`, `.xls`, `.ods`) is read directly: its first sheet, or
the one `--sheet <name>` names. Blank lines are skipped and dates come in as
dates.

### Schema as code: `ganju.data.json`

```bash
ganju data schema pull     # write the database's schema to ganju.data.json
ganju data schema diff     # what push would change
ganju data schema push     # apply it
```

The file is `{ "tables": [...] }`, each table written the way you would type it
to create it — the same shape as an export's `schema.json`, so either works
with `--schema <file>`. `pull` after `push` gives back the same file, so its
diff in a pull request is a change to the schema and nothing else.

`diff` matches tables and columns **by name**:

```
+ create table orders (customer, status)
+ add column menu.notes long_text
~ change table menu: label "Menu"
~ change menu.stock: default 5 (copies the table)
- change menu.price: type "decimal" (copies the table) (needs --yes)
- drop column menu.code (needs --yes)
- drop table promos (needs --yes)
```

- Named queries go in `"queries": [...]`, each as `ganju data query save`
  takes it, and are matched by name too: `+ save query sales_by_dish (:from,
  :to)`. `pull` writes them when the database has any. A file without
  `queries` leaves the database's queries alone; with it, a query missing from
  the file is dropped, which needs `--yes`.
- Keys left out of the file mean their defaults (`access` `read`, `history`
  true, `onDelete` `restrict`, the first text column as `displayColumn`), so a
  short hand-written file and a pulled one compare equal.
- New tables are created in an order where every relation's target exists
  first. Two new tables that point at each other are created with one relation
  column held back, and that column is added once both exist.
- Dropped tables go in an order the API accepts: it refuses to drop a table
  while any other points at it. Tables dropped together that point at each
  other lose one relation column first, which frees the rest.
- `push` applies new tables, new columns and changed settings straight away.
  **Drops and type changes** (including pointing a relation at another table)
  are listed and applied only with `--yes`, after a checkpoint whose bookmark
  undoes them. Without `--yes` in a script, push applies the rest and exits 1
  naming what it left out; in a terminal it asks.
- A renamed table or column reads as a drop and an add, which `--yes` would
  apply by emptying the old one. Rename with `ganju data table rename` or
  `ganju data column rename`, then `pull`.

### Destructive commands

Anything that drops, deletes or rewrites data needs `--yes`; dropping the
database or a table, and `import --replace`, also need the name typed with
`--confirm`. In a terminal a missing flag is asked for. Without one — CI, a
pipe — the command refuses and changes nothing, rather than wait on a prompt.

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

  // Upload this folder's readable source beside the bundle (default true).
  "uploadSource": true,

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
      "output": { "type": "object", "properties": { "status": { "type": "string" } } },
      "annotations": { "readOnlyHint": true }
    }
  ]
}
```

`annotations` are the [MCP tool annotations](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-annotations),
with the spec's names: `readOnlyHint`, `destructiveHint`, `idempotentHint`,
`openWorldHint`. They reach MCP clients as hints, and they decide what a channel
bot confirms when the organization turns on **Confirm sensitive actions**: a
tool that declares neither `readOnlyHint: true` nor `destructiveHint: false` is
asked about before it runs. Mark lookups read-only; leave anything that sends,
charges or deletes unmarked.

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

### The source, beside the bundle

`ganju deploy` also uploads the project's readable source, so the dashboard
shows your real files (read-only) instead of the minified bundle. It is only
shown; the bundle is what runs.

- **Which files:** what git would commit, meaning tracked files plus untracked
  ones your `.gitignore` doesn't exclude. Outside a git repository, the
  `.gitignore` files in the project are read directly.
- **Never uploaded:** `node_modules`, `.ganju`, `.git`, `.env*`, lockfiles
  (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lock[b]`) and binary
  files.
- **Size:** a file over 256 KB is left out on its own. A project over 2 MB (or
  500 files) uploads no source at all, says so, and deploys anyway.
- **Turning it off:** set `"uploadSource": false` in `ganju.json`.

### Replacing code made in the app

A deploy publishes this folder as the whole project. If the live version was
made in the app (by the assistant or the dashboard's editor), `ganju deploy` says so first and lists the
functions that would stop working. In a terminal it asks before going on; in a
script it stops unless you pass `--force`. A `--draft` deploy replaces nothing,
so it isn't checked.

## The tool linter

`ganju build` checks how each tool in `ganju.json` reads to a model, and warns
about:

- a missing or very short description, or one that never says when to use the
  tool;
- no `annotations` — the tool is then treated as one that may change things,
  and confirmed before every call when the organization confirms sensitive
  actions;
- input properties with no description;
- two tools that look alike in name or description.

Warnings never stop a build unless you pass `--strict`, which is meant for CI.
`ganju deploy` prints the same checks as run by the API, which also sees the
server's other tools — so overlap with them, and too many enabled tools, show up
there.

## Environment

| Variable | For |
| --- | --- |
| `GANJU_API_URL` | Which deployment to talk to. Also settable per project as `apiUrl` in `ganju.json` |
| `GANJU_API_TOKEN` | An access token for a machine with no browser (CI, a container, SSH). Bypasses the stored login entirely. `ganju token create` mints a durable one |
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
object literal, since a bundler cannot tree-shake one. `ganju data` carries
`@ganju/utils/dataImport` and the modules it needs, so an import checks each
cell with the database's own rules, but not zod: the Data API's route list is
imported for its types only, and the copy the CLI calls is held to it by
`tsc`.

`npm test -w @ganju/cli` runs the unit tests (`node:test`): the `--where`
shorthand, the schema diff and its ordering, and the CSV reader.

`esbuild` stays a real dependency, because it ships a platform-specific binary
that cannot be bundled.
