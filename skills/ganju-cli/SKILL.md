---
name: ganju-cli
description: Write, test, deploy and debug Ganju custom tools (Functions) with the `ganju` CLI and the `@ganju/sdk` handler API. Use this whenever the user works in a folder with a `ganju.json`, imports `@ganju/sdk` or `defineTool`, mentions `@ganju/cli` or any `ganju` command (init, link, build, test, deploy, logs, versions, rollback, secret, token), or wants to add a custom tool to their Ganju MCP server, assistant or bot — even if they only say "make my assistant able to do X" in a Ganju project, or ask why a Ganju tool call failed.
---

# Ganju CLI

Ganju **Functions** are tools the user writes in TypeScript or JavaScript. They
run on Cloudflare Workers inside the user's Ganju project, and every MCP client
and channel (Claude, ChatGPT, Slack, Telegram…) connected to that project can
call them. The `ganju` CLI builds, tests, publishes and debugs them from a
terminal.

A project is one folder:

```
ganju.json       the tools (names, descriptions, JSON schemas) and what the code may reach
src/<tool>.ts    one handler per tool: export default defineTool(async (input, ctx) => …)
src/lib/*.ts     shared helpers (optional)
```

The whole project deploys as **one script**. Every version carries both the
code and the tool contract, so rolling back restores both.

## Before you run anything

Some steps need the person, not you. Knowing which saves a round of failed
commands.

| Step | Who | Why |
| --- | --- | --- |
| `npm install -g @ganju/cli` (Node 20+) | You | Or use `npx @ganju/cli <command>` |
| `ganju login` | **The user** | Opens a browser to sign in. Ask them to run it; in Claude Code they can type `! ganju login` |
| `ganju link` | You, with flags | Interactive prompts fail without a terminal. Use `--organization "<name or id>" --project "<name or id>"`. A wrong name fails with a hint listing the available ones, so a best guess is safe; otherwise ask |
| `ganju secret set NAME` | **Preferably the user** | You shouldn't see or log secret values. See [Secrets](#secrets) |
| `ganju token create` | **The user** | Requires a browser login; a token can't mint tokens |
| Connecting Gmail/Calendar/Slack… | **The user**, in the dashboard | Project → **Tools** page. The CLI can't connect accounts |

Check where you stand with `ganju whoami` and `ganju link --status`.

For help, run `ganju help`. It lists every command and flag and is safe on
every version. Current releases refuse unknown flags and accept `--help` on
any command. Older releases silently ignored flags they didn't know, so there
`ganju init --help` scaffolds a project and `ganju deploy --help` deploys.
Don't guess flags either way: the draft-only deploy is `ganju deploy --draft`,
not `--dry-run`.
`GANJU_API_TOKEN` in the environment replaces the stored login (used in CI).
`GANJU_API_URL` or `apiUrl` in `ganju.json` points at a non-default deployment.
The default is `https://api.ganju.ai`.

Functions need the project's organization to be on the **Pro** plan. A plan
error from `deploy` or `test` means that, not a bug in the code.

## The loop

```bash
ganju init my-tools && cd my-tools     # or start from an example (see below)
# the user runs: ganju login
ganju link --organization "Acme" --project "Support bot"
# edit ganju.json and src/
ganju build                             # compiles; catches syntax/import errors, costs nothing
ganju test <tool> --input '{"…":"…"}'   # runs for real, without publishing
ganju deploy                            # publishes; now live for every client
ganju logs --tool <tool>                # what real calls did
```

**Use `ganju build` as the fast check.** It runs esbuild locally, needs no
login, and fails with file:line on bad syntax or a missing import. Types are
stripped, not checked. If the project has a `tsconfig.json` or you want type
safety, run `npx tsc --noEmit` as well.

**`ganju test` is real.** It uploads the current code as a draft version,
deploys it to a preview script, calls the tool once with real secrets,
connections and egress rules, then deletes the preview. So a test of a tool
that sends email sends a real email, and a test that creates a GitHub issue
creates one. Before testing a tool with side effects, tell the user what will
happen, and point it at a safe target such as their own address or a scratch
repo. Tests count toward the monthly call quota and leave a draft version
behind, which is harmless.

`ganju test` checks the input against the tool's input schema before running
and the output against its output schema after. Both are reported. Treat an
output-schema violation as a failure even if the output looks right, because
real MCP calls fail on it.

**`ganju deploy` changes what live users get.** If the project is already
serving people, say what's changing and confirm before deploying.
`ganju deploy --draft` uploads without publishing. `ganju rollback <n>` undoes a
bad deploy in one step.

**A deploy replaces the project's whole set of custom tools.** A project has one
script, and the new version contains exactly the tools in this folder. Any tool
from the live version that isn't in `ganju.json` disappears for every client,
including tools written in the dashboard editor or deployed from another
folder. Before the first deploy from a folder to an existing project, run
`ganju versions`. If there's a live version you didn't build here, ask the user
whether its tools should be kept, and bring them into this folder first. Catalog
integrations (Gmail, Calendar…) and HTTP endpoints are separate and aren't
affected.

Add `--json` to `test`, `logs` and `versions` when you need to parse the result.
Every command exits non-zero on failure.

## Writing a tool

`ganju init [dir]` scaffolds a JavaScript project with a placeholder
`lookup-order` tool. Remove the placeholder (its `ganju.json` entry and its
file) unless the user wants it, or it ships as a real tool that answers
`"unknown"`. The scaffold also leaves `allowedHosts` empty, which means *any*
host, so fill it in.

For TypeScript, which is what the examples use, rename the entries to `.ts`
and add a `package.json` with `@ganju/sdk` and `typescript` as dev
dependencies, so `ctx` has types. Add a `tsconfig.json` too, with
`"target": "ES2022"`, `"module": "ESNext"`, `"moduleResolution": "Bundler"`,
`"strict": true`, `"noEmit": true` and `"lib": ["ES2022", "DOM"]`. Then
`npx tsc --noEmit` type-checks what `ganju build` only compiles.

Declare the tool in `ganju.json`:

```json
{
  "connections": [],
  "allowedHosts": ["api.example.com"],
  "timeoutMs": 10000,
  "tools": [
    {
      "name": "lookup-order",
      "title": "Look up order",
      "description": "Find an order by its id. Use when the customer gives an order number.",
      "entry": "src/lookupOrder.ts",
      "input": {
        "type": "object",
        "properties": { "orderId": { "type": "string", "description": "e.g. A-1029" } },
        "required": ["orderId"]
      },
      "output": {
        "type": "object",
        "properties": { "status": { "type": "string" }, "eta": { "type": "string" } }
      }
    }
  ]
}
```

Implement it:

```ts
// src/lookupOrder.ts
import { defineTool } from '@ganju/sdk';

export default defineTool<{ orderId: string }>(async (input, ctx) => {
  const key = await ctx.secret('EXAMPLE_API_KEY');
  const res = await fetch(`https://api.example.com/orders/${encodeURIComponent(input.orderId)}`, {
    headers: { authorization: `Bearer ${key}` }
  });
  if (res.status === 404) throw new Error(`No order ${input.orderId}. Ask the customer to check the number.`);
  if (!res.ok) throw new Error(`The order service answered ${res.status}`);

  const order = (await res.json()) as { status: string; eta?: string };
  ctx.log(`${input.orderId} → ${order.status}`);
  return { status: order.status, ...(order.eta ? { eta: order.eta } : {}) };
});
```

These rules come from how the platform works. Following them avoids most
failed deploys and failed calls:

- **Every tool has an `entry`, or none do.** With entries, the CLI generates the
  router, so the tool name is written once. A mix is refused. The alternative is
  no entries plus a `main` file exporting
  `createHandler({ 'tool-name': defineTool(…) })`, which is mainly for scripts
  moved out of the dashboard editor.
- **The `description` is how the model decides to call the tool.** Say *when*
  to use it, not just what it does. For tools that write, send, delete or spend,
  add "Confirm with the person before calling this."
- **Leave missing output fields out, never set them to `null`.** The output
  schema has one `type` per property and no nullable form, so a `null` fails
  the whole call. Use `...(x ? { x } : {})`.
- **The schema supports a subset of JSON Schema.** Types are `string`,
  `number`, `boolean`, `object` and `array`. There's no `integer`, so round
  numbers yourself. Also supported: `enum`, `pattern`, `minLength`/`maxLength`,
  `minimum`/`maximum` and `items`. The output schema's top level must be
  `"type": "object"`.
- **Every host your code `fetch`es must be in `allowedHosts`.** An entry covers
  its subdomains, so `example.com` allows `api.example.com`. An **empty list
  means any public host**. Private and loopback addresses are always blocked.
- **The code runs as a Worker, not in Node.** Use `fetch`, `crypto.subtle`,
  `TextEncoder`, `URL` and `Intl`. There's no `fs`, no `process`, no `node:*`
  modules and no `require`. npm packages work if they have a browser or worker
  build; they're bundled, and the bundle must stay under 3 MB.
- **Throw an `Error` whose message says what to do next.** Its message is what
  the model sees, so "No order A-1. Ask the customer to check the number." helps
  it recover, while a bare status code doesn't.
- **Tool names use letters, digits, `-` and `_` (up to 64), and are unique in
  the project.** Kebab-case like `lookup-order` is the convention. Prefixes
  `gmail-`, `outlook-`, `slack-`, `calendar-`, `calcom-` and `web-` are
  reserved, as are `greeting` and the built-in `list-resources`,
  `search-resources`, `read-resource` and `send-resource`. Up to 50 tools per
  project.

For the full field list, read `references/ganju-json.md`.

## What `ctx` gives a handler

| Member | Use it for |
| --- | --- |
| `ctx.secret(name)` | An API key stored with `ganju secret set`. Read at call time |
| `ctx.connection(provider)` | A short-lived OAuth access token for an account the user connected in the dashboard. The provider must also be listed in `connections` |
| `ctx.resources.search / list / read` | The project's knowledge base: uploaded files, crawled sites, notes |
| `ctx.resources.create / delete` | Write a file or note back onto the project (`index: true` to make it searchable) |
| `ctx.sendFile({ to, uris, message })` | Deliver resources as attachments via `gmail`, `outlook` or `slack`, without the bytes passing through your code |
| `ctx.log(...)` | Lines shown by `ganju test` and `ganju logs` (first 50 per call) |

Connection names: `google-gmail`, `google-calendar`, `google-drive`,
`microsoft-outlook`, `microsoft-onedrive`, `slack`, `slack-user`.

For signatures, return shapes and gotchas, read `references/ctx.md` before
using `resources`, `sendFile` or `connection`.

## Secrets

Secrets never go in `ganju.json`, in source, or in a command's arguments, where
they'd land in shell history. The CLI reads the value from `GANJU_SECRET_VALUE`:

```bash
read -s GANJU_SECRET_VALUE && export GANJU_SECRET_VALUE   # user types it, not echoed
ganju secret set STRIPE_KEY
unset GANJU_SECRET_VALUE
```

Hand this to the user to run rather than asking them to paste the value into
the conversation. `ganju secret list` shows names only, and nothing can read a
value back. `set` replaces a value, and the new one is live from the next call
with no redeploy. Names are case-sensitive and must match `ctx.secret('…')`
exactly.

## Debugging

1. **Reproduce with `ganju test <tool> --input '…'`.** It prints the output,
   the error, `ctx.log` lines and schema violations.
2. **For what happened on real calls, use `ganju logs`**, with `--tool <name>`,
   `--limit 50` or `--follow`. Each entry is one finished call: latency, error
   and log lines.
3. **To see what's live, use `ganju versions`.** It marks the live version and
   shows any version with an error.
4. **To check whether the live code or your edit is at fault, run
   `ganju test <tool> --version active`.** It runs what's live without uploading.
5. **If a deploy broke things, `ganju rollback <n>`**, then fix and redeploy.

Add `ctx.log` lines around the step you're unsure of. They cost nothing and
come back with the result. Most errors name their own fix; for the common ones,
see `references/troubleshooting.md`.

## CI

The user mints a project-scoped token once, from a browser login:

```bash
ganju token create "GitHub Actions" --expires 90
```

Then in the pipeline:

```yaml
- run: npx @ganju/cli deploy
  env:
    GANJU_API_TOKEN: ${{ secrets.GANJU_API_TOKEN }}
```

`ganju.json` must be committed with `organizationId` and `projectId` filled in,
which `ganju link` writes. Neither is secret. Put `ganju build` in the PR check
and `ganju deploy` on merge.

## Starting from an example

The Ganju repository has five small projects in `examples/`, each showing one
capability. Copying the closest one is usually faster than starting from
`ganju init`:

| Example | Shows |
| --- | --- |
| `weather` | `fetch` + `allowedHosts`, input bounds, no setup |
| `github-issues` | `ctx.secret`, `pattern` / `enum` in schemas, a write tool |
| `team-notes` | every `ctx.resources` method, stable uris, `index: true` |
| `calendar-free-time` | `ctx.connection('google-calendar')`, time zones with `Intl` |
| `news-digest` | `ctx.resources.create` then `ctx.sendFile` to Gmail |

Source: https://github.com/MontoyaAndres/ganju/tree/main/examples. Docs:
https://ganju.ai/docs/tools/examples/

## Before you call it done

- `ganju build` passes. If there's a tsconfig, `tsc --noEmit` passes too.
- Every tool passes `ganju test` with a realistic input and no schema
  violations, including one failure case such as a not-found or bad input,
  showing an error message the model can act on.
- Every `fetch` host is in `allowedHosts`, and every `ctx.connection` provider
  is in `connections`.
- No secret values in files, commands or the conversation.
- The user has agreed before `ganju deploy` to a project that's in use. After
  deploying, tell them the version number and the tool names that are now
  live, which `deploy` prints.
