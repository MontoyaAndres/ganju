---
title: Notion
description: Connect Notion's official remote MCP server to search, read, and update pages and databases.
order: 48
updated: 2026-11-13
---

**Notion** isn't a set of tools we build — it's Notion's **official remote MCP
server**, connected through Ganju. Ganju links to Notion's hosted server, lists
the tools *it* offers, and exposes the ones you pick to your assistant. You get
Notion's own, up-to-date toolset — searching, reading and updating pages and
databases — maintained by Notion, not re-implemented by us.

## How it works

The **Notion** card sits in **Tools → Catalog** next to the other
integrations, marked *Remote MCP server · connect to enable tools* until you
connect it. Ganju talks to Notion's server (`https://mcp.notion.com/mcp`) over
streamable HTTP. Every tool you allow is registered on your MCP server as
`notion__<tool>`; when the assistant calls one, Ganju forwards the call to
Notion and returns the result.

## Connect it

Notion's server signs you in with **OAuth** — no token to copy.

1. Open **Tools → Catalog** and select the **Notion** card.
2. Select **Connect Notion**. You're sent to Notion to sign in and choose the
   workspace and the pages the assistant may reach.
3. You come back to the Tools page with the Notion dialog open. Choose the
   tools (see below) and **Save**.

Ganju stores the resulting credential encrypted and refreshes it for you. The
assistant only reaches the pages you shared during sign-in.

![The Connect Notion dialog before signing in to Notion](/images/tools-mcp-notion-connect.webp)

## Choose the tools

After connecting, the dialog shows **Tools (x/y)** with every tool Notion's
server offers, each with its own checkbox, plus **All** and **None**. Each tool
you allow counts as one toward your
[tool limit](/docs/tools/catalog/#the-tool-budget), and the dialog tells you how
many more you can turn on.

Under the list:

- **Trust this server's read-only labels** — tools Notion itself marks as
  read-only skip confirmation. Turn this on only for servers you trust.
- **Only reads — looks things up, changes nothing** — mark tools yourself, so
  they run without asking for confirmation, even after the assistant has read
  outside content. Everything else is treated as a sensitive action.
- **Resources & prompts (optional)** — if the server offers resources or
  prompts, they're off by default; only the ones you enable here are exposed.

The dialog works the same way as GitHub's; see the screenshot on
[GitHub](/docs/tools/github/#choose-the-tools).

## Change, turn off, disconnect

Open the Notion card again to change which tools are allowed, then **Save**.
The **Exposed** switch at the bottom turns the whole server off without losing
the setup; **Disconnect** removes it and its sign-in.

## Available tools

The tools come from Notion's server and can change as Notion updates it —
typically searching your workspace and reading, creating or updating pages and
databases. The dialog always shows the current list. Responses are capped in
size before they reach the model, and results from the server are treated as
outside content.

## Troubleshooting

- **"Could not start the Notion connection."** Try again; if it persists, the
  sign-in page couldn't be reached.
- **A page isn't found.** It wasn't shared during sign-in. Disconnect and
  connect again, choosing that page.
- **A call says the credential needs to be re-authorized.** Open the Notion card
  on the Tools page and connect again.

Want another vendor's server? See [GitHub](/docs/tools/github/), or expose your
own API with [HTTP Endpoints](/docs/tools/http-endpoints/).
