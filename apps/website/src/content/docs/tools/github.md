---
title: GitHub
description: Connect GitHub's official remote MCP server to give your assistant repositories, issues, and pull requests.
order: 47
updated: 2026-11-13
---

**GitHub** isn't a set of tools we build — it's GitHub's **official remote MCP
server**, connected through Ganju. Ganju links to GitHub's hosted server, lists
the tools *it* offers, and exposes the ones you pick to your assistant. You get
GitHub's own, up-to-date toolset — repositories, issues, pull requests and more —
maintained by GitHub, not re-implemented by us.

## How it works

The **GitHub** card sits in **Tools → Catalog** next to the other
integrations, marked *Remote MCP server · connect to enable tools* until you
connect it. Ganju talks to GitHub's server (`https://api.githubcopilot.com/mcp/`)
over streamable HTTP. Every tool you allow is registered on your MCP server as
`github__<tool>` (for example `github__search_repositories`); when the
assistant calls one, Ganju forwards the call to GitHub with your token and
returns the result.

## Connect it

GitHub's server authenticates with a **personal access token** (PAT).

1. In GitHub, go to **Settings → Developer settings → Personal access tokens**
   and create a token. Give it access only to the repositories and permissions
   you want the assistant to have — the token is the ceiling of what it can do.
2. In Ganju, open **Tools → Catalog** and select the **GitHub** card.
3. Paste the token in **GitHub token** and select **Connect & list tools**. If
   GitHub refuses it, you'll see *Could not list tools with this token.*
4. Choose the tools (see below) and select **Connect GitHub** to save.

The token is encrypted and never shown again.

## Choose the tools

After listing, the dialog shows **Tools (x/y)** with every tool GitHub's server
offers, each with its own checkbox, plus **All** and **None**. Each tool you
allow counts as one toward your [tool limit](/docs/tools/catalog/#the-tool-budget),
and the dialog tells you how many more you can turn on. GitHub's server offers
many tools; pick the handful your assistant needs.

Under the list:

- **Trust this server's read-only labels** — tools GitHub itself marks as
  read-only skip confirmation. A server could mislabel a tool, so turn this on
  only for servers you trust.
- **Only reads — looks things up, changes nothing** — mark tools yourself, so
  they run without asking for confirmation, even after the assistant has read
  outside content. Everything else is treated as a sensitive action.
- **Resources & prompts (optional)** — if the server offers resources or
  prompts, they're off by default; only the ones you enable here are exposed.

![The GitHub tools dialog: the tool count, trust read-only labels, each tool with "Only reads", Exposed, Disconnect and Save](/images/tools-mcp-github-tools.webp)

## Change, turn off, disconnect

Open the GitHub card again to change which tools are allowed, then **Save**.
The **Exposed** switch at the bottom turns the whole server off without losing
the setup (*Kept, but not on your MCP server*); **Disconnect** removes it and
its token.

## Available tools

The tools come from GitHub's server and can change as GitHub updates it —
typically covering repositories, files, issues, pull requests and related
workflows. The dialog always shows the current list. Responses are capped in
size before they reach the model, and results from the server are treated as
outside content.

## Troubleshooting

- **"Could not list tools with this token."** The token is wrong, expired or
  lacks access. Create a new one and connect again.
- **A tool fails with a permission error.** The token doesn't cover that
  repository or permission; widen the token in GitHub.
- **"Could not reach the remote MCP server".** GitHub's server didn't answer;
  try again later.

Want another vendor's server? See [Notion](/docs/tools/notion/), or expose your
own API with [HTTP Endpoints](/docs/tools/http-endpoints/).
