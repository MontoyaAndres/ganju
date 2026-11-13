---
title: Functions
description: Your own tools in code — the Assistant writes them for you, developers deploy them with the CLI, and the Tools page shows what is live, lets you test it and roll back.
order: 36
updated: 2026-11-13
---

**Functions** are tools written in code. In the app they're called
**actions**: "check if a pizza is in stock", "save a booking", "email me each
new order". A function is the way to do anything that isn't one HTTP request
or an integration we ship: several steps, logic, a call to your own API
combined with a key, reading and writing the project's
[database](/docs/data/).

Your code runs on Cloudflare's edge, in an isolate we deploy for you. There is
no server to run and no pipeline to wire up. Connected accounts, file sending,
the database and your channels reach the code as **host capabilities**, so it
never handles a refresh token or a 40 MB attachment.

> Functions are part of **Pro** and **Enterprise**. On Free, the Functions tab
> shows **Write your own tools** with **Upgrade to Pro**, and
> [HTTP Endpoints](/docs/tools/http-endpoints/) are the custom tool that needs
> no code.

![The Functions tab on the Free plan: "Write your own tools" with a code sample and Upgrade to Pro](/images/tools-functions-free.webp)

## Who writes them

Nobody types code into the app. A project's functions come from one of two
places:

- **The [Assistant](/docs/assistant/).** The owner describes what the bot
  should do, and the Assistant writes the function, tests it, and turns it on
  when the owner presses **Apply**. This is how most projects get their
  actions.
- **A developer with the [`ganju` CLI](/docs/tools/cli/).** The functions live
  in a repository, and `ganju deploy` uploads them.

Both write to the same versions, so the **Tools** page, `ganju versions` and
the Assistant always agree on what is live. When a developer deploys, the
Assistant stops writing code for that project: it answers a code change with a
patch for the developer instead. When the Assistant changed the functions
since the developer's last deploy, `ganju deploy` warns before replacing them.

## The Functions tab

**Tools → Functions** shows the project's functions: what is live, every
earlier version, and the code, read-only.

![The Functions tab: the info box with "Open the assistant", the version picker, the version details and the functions with their switches and Run](/images/functions-assistant-readonly.webp)

Across the top:

- **Version**, a picker with every version (`v14 · live`, `v13 · published`,
  `v12 · draft`). Choose one and its functions and code open.
- **Roll back to v13**, only on projects without the Assistant: shown when the
  open version was live before but isn't now, it puts that version back. Where
  the Assistant writes the actions, ask it to go back instead.
- **Settings**, what the code may reach. See [Settings](#settings).

When the Assistant writes the project's functions, an info box says so:
**Your actions are written by the assistant. You can read them here; to add or
change one, ask it.**, with **Open the assistant**. A project with no
functions yet shows the same button.

Under it, a row describes the open version: **Version**, **Status** (`live`,
`published`, `draft` or `archived`), how many **Functions** it has, its
**Source**, and when it was **Created** and **Published**. The source is one
of:

| Source | Where it came from |
| --- | --- |
| **Dashboard editor** | Written in the app, by the Assistant. |
| **CLI (source)** | Deployed with the CLI, with its readable source. The page shows your files. |
| **CLI bundle** | Deployed with the CLI without its source. The page shows the compiled bundle. |

A version that failed to publish shows its error in a banner.

### Each function

Every function is a row with its title, description, name, how many inputs it
takes, and tags: **structured output** when it declares an output schema, and
**Triggers only** when only database triggers run it.

- The **switch** (on the live version) decides whether the server offers the
  function, **without a redeploy**. Turning one off keeps its code and shortens
  the tool list the model reads on every turn. At least one has to stay on.
- **Run** expands the function and runs it with its sample input. See
  [Test before anyone sees it](#test-before-anyone-sees-it).
- Expanding the row shows its **Input schema** and **Output schema**.

### The code

Below the functions is the open version's code, marked **read-only**, with a
file explorer beside it. `index.js` is the entry the platform calls, and
`ganju-sdk.js` is shown dimmed as **attached**: the platform adds it to every
deploy. A version from the CLI with its source shows your project's files
instead, with a note that it changes in the project, with `ganju deploy`.

## What a function looks like

A project is one script holding all its functions. The entry module exports a
router, and each function is an async handler that gets the model's arguments
and a `ctx`:

```js
import { createHandler, defineTool } from './ganju-sdk.js';

const checkStock = async (input, ctx) => {
  const { rows } = await ctx.data.query({
    table: 'stock',
    where: { pizza: input.pizza }
  });
  return { pizza: input.pizza, left: rows[0]?.quantity ?? 0 };
};

export default createHandler({ 'check-stock': defineTool(checkStock) });
```

Beside the code, each version carries a **manifest** that declares every
function the way the model sees it:

| Field | What it's for |
| --- | --- |
| **name** | What the model calls, e.g. `check-stock`. It must be a key of the router. |
| **title** | The readable label. |
| **description** | How the model decides whether to call it. It says **when** to use it ("Use when a customer asks whether a pizza is available"). |
| **input schema** | JSON Schema. Every property is offered to the model as an argument. |
| **output schema** | Optional. With one, the function must return a matching object, and MCP clients get structured output instead of text. |
| **annotations** | What it does: only reads, changes things that can be undone, or sends, deletes, charges or can't be undone. Decides what a channel bot confirms first. |
| **data** | What it may do with the database: read or write, and which tables. |
| **expose** | Off: only triggers run it, and it doesn't count toward the project's tools. |
| **channels** | On: it may message customers and chats through `ctx.channels`. |

Code the Assistant writes is plain JavaScript modules with no build step and no
npm packages, at most 25 files. A developer deploying with the CLI can use
TypeScript and packages, since the CLI bundles them. The `ganju.json` fields
for all of the above are in the [CLI reference](/docs/tools/cli/#each-tool).

## What your code can do

| `ctx` member | What it gives you |
| --- | --- |
| `ctx.connection(provider)` | A short-lived access token for a connected account, e.g. `google-calendar`. Never the refresh token. |
| `ctx.secret(name)` | A key stored in **Settings** or with `ganju secret set`, read at call time. |
| `ctx.resources.search / read / list` | The same knowledge your bot answers from. |
| `ctx.resources.create / delete` | Write a file or note to the project, or remove one. Not searchable unless created with `index: true`. |
| `ctx.sendFile(options)` | Email or post stored files as real attachments through Gmail, Outlook or Slack (up to 10 per call). The bytes never pass through your code. |
| `ctx.data` | The project's database: `describe`, `query`, `search`, `insert`, `update`, `delete`, `write` (all or nothing) and `run` (a saved query). |
| `ctx.channels` | Message a customer the bot has talked to (`send`), post to a chat the bot is in (`post`), and list approved WhatsApp templates (`templates`). |
| `ctx.log(...)` | Lines that show in the test panel, in the logs the Assistant reads, and in `ganju logs`. |
| `fetch` | The global you know, screened on the way out. |

`ctx.data` and `ctx.channels` are covered in
[Data from functions](/docs/data/functions/), along with functions that only
triggers run.

`ctx.sendFile` is the thing your code couldn't do on its own: a function's
memory is capped, so large attachments are sent by the platform from storage.
`ctx.resources.create` takes up to 1 MB of text or 10 MB of file bytes.

## Settings

**Settings** opens **Function settings**: what the code may reach, and what it
may spend doing it. None of it lives in the code, on purpose: a limit the code
could widen isn't a limit. They can be changed here, and a developer sets the
same values in `ganju.json`; a change in either place shows in the other.

![The Function settings dialog: Connections with their status, then Secrets](/images/function-settings-live.webp)

- **Connections**: the accounts the code may ask a token for, and send files
  as. Each shows whether it's **Connected**, **Needs re-authorization** or
  **Not connected**. Anything not switched on is refused when the function
  runs. Switching on one you haven't connected yet is allowed: the call fails
  with a message saying so.
- **Secrets**: the values `ctx.secret()` reads. Encrypted, read on each call,
  and never sent back to the browser. Adding or removing one takes effect on
  the next call, with no redeploy. The Assistant asks for the ones it needs
  with a card where you paste the key.
- **Allowed hosts**: a comma-separated allowlist for outbound requests. **Empty
  means any public host**, not none. Private and loopback addresses are always
  blocked.
- **Timeout (ms)**: how long one call may take. Default 10,000, at most 30,000.
- **Resource access**: how far `ctx.resources.create` and `.delete` reach.
  **Only what this tool wrote** is the default and the safe one; **Every
  resource in this project** lets a function replace and remove uploaded and
  crawled resources too.

Connections, hosts, timeout and resource access save together with **Save**; a
secret acts the moment you add or remove it.

## Test before anyone sees it

Expand a function and use **Run** with a **Sample input**.

![A function expanded to its input and output schemas, with a sample input field, Format and Run](/images/functions-test.webp)

A test runs the open version on a preview script nothing else calls, once,
and deletes it. That means it runs **the real thing** (real connections,
secrets and egress rules) while your live version keeps serving clients.
A function that sends an email or saves a row does it for real.

You get back the output, the `ctx.log` lines, the error if there was one, and
how long it took. The sample input is checked against the input schema before
the run, and the result against the output schema after, because those are
the two ways a real call fails.

The Assistant tests the same way while it builds, and developers use
[`ganju test`](/docs/tools/cli/#testing). Test runs count toward your monthly
tool calls.

## Versions, turning on and rolling back

A version is the unit of both **code and contract**: the tool names your
clients see come from the version, not from the running script, so going back
brings the schemas back with the code.

- The Assistant saves **drafts** while it works. Nobody sees a draft. It turns
  one on through a change set, which goes live when the owner presses
  **Apply**, and **Undo** on that card goes back.
- Ask the Assistant to go back ("put the actions back the way they were
  yesterday") and it finds the version that was live then and stages it, saying
  which actions added since would go.
- A developer publishes with `ganju deploy` and goes back with
  `ganju rollback`.

**Published** and **live** are different: every version that has been live is
published, and exactly one is live.

## Limits and cost

- **Per call**: 5 seconds of CPU, and your timeout (at most 30 seconds) for
  the whole call. A result over 256 KB is cut short.
- **Per minute**: 60 calls per tool.
- **Per script**: up to 50 functions, and a 3 MB bundle.
- **Per month**: 1,000,000 tool calls included on Pro and Enterprise, then $5
  per million. Only calls into **your own code** count; the integrations we
  ship and remote MCP servers you connect don't.
- **Outbound requests** are screened: private, loopback and link-local
  addresses are always refused, and your allowed hosts apply on top.

## When a function fails

The Assistant watches the functions it built. When one fails often, or an
account it uses needs signing in again, the Assistant tab shows **Something
stopped working**, and **Fix it with the assistant** asks it to read the logs
and propose a fix. See
[When an action stops working](/docs/assistant/#when-an-action-stops-working).
Developers read the same calls with [`ganju logs`](/docs/tools/cli/#logs).

## Next

- **[Assistant](/docs/assistant/)**: build and change functions by describing
  them.
- **[`ganju` CLI](/docs/tools/cli/)**: deploy them from a repository and from
  CI.
- **[Data from functions](/docs/data/functions/)**: `ctx.data`,
  `ctx.channels` and triggers.
- **[Examples](/docs/tools/examples/)**: seven ready-to-deploy projects.
