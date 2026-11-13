---
title: Tools
description: Switch on the actions your AI can take — connect an integration, point it at your own API, or let the Assistant write one.
order: 6
updated: 2026-11-13
---

**Tools** are the actions your assistant can take on your behalf — from the
built-in resource helpers to integrations like Gmail, Slack, and Google
Calendar. Open **Tools** in the rail. The page has three tabs:

| Tab | What's in it |
| --- | --- |
| **[Functions](/docs/tools/functions/)** | Custom actions written in code — by the [Assistant](/docs/assistant/) for you, or by a developer with the CLI. Pro. |
| **[HTTP Endpoints](/docs/tools/http-endpoints/)** | An API you already run, described once and turned into a named tool. No code. |
| **[Catalog](/docs/tools/catalog/)** | The integrations Ganju ships, plus remote MCP servers like GitHub and Notion. |

This page is about the **Catalog** — it's where everyone starts.

> **Want the full picture?** This is the quick version. The complete
> **[Tools](/docs/tools/)** guide documents every integration, tool by tool.

## Built-in tools

Every project starts with five **Built-in** tools already on — **List
Resources**, **Read Resource**, **Send Resource**, **Search Resources**, and
**List Prompts** — so your assistant can work with your knowledge right away.
They need no connection.

## Browse the catalog

The **Catalog** lists every integration you can add: Gmail, Outlook, Slack,
Slack Search, Google Calendar, Cal.com, Web Search, Built-in, and remote MCP
servers. Each card shows how many of its tools you've enabled (Gmail alone
offers 18). Use **Search integrations...** or the filters **All**, **On**,
**Off**, and **Needs connection** to narrow the list.

![Tools, Catalog tab: the tools-exposed bar, search, filters and the integration cards](/images/tools-catalog.webp)

## Connect an integration

1. Open an integration to see the tools it offers.
2. Select **Connect Gmail** (or **Connect** plus the integration's name) and
   sign in to that account. You only connect once for the whole integration.
   Some integrations ask for an API key instead (**Add … API key**).
3. Switch on just the tools you want — here, **Send Email**. Each tool you
   enable is available to your assistant straight away.

![Gmail connected: the Connected chip, Disconnect, and each tool with its switch](/images/tool-gmail-enabled.webp)

Back in the catalog, Gmail now shows **Connected** with your enabled count
(`1/18 tools enabled`).

## On, off, or removed

- The **switch** turns a tool off but keeps its settings and connection — the
  row then reads **Off · settings kept**.
- **Remove** deletes a tool and its settings.
- **Disconnect** removes the whole integration's connection.

Prefer the switch. Every enabled tool's description is re-sent to the model on
every turn, so a long list costs more and makes the model's choice harder. The
counter at the top shows how many tools are exposed out of **40** — past that,
channels stop sending the extras. Home's [Tool health](/docs/analytics/#tool-health)
lists tools no one has used in 30 days, with a **Disable** button.

## Limits

| | Free | Pro / Enterprise |
| --- | --- | --- |
| Tools per project | 7 (built-ins included) | Unlimited |
| HTTP endpoints per project | 3 | Unlimited |
| Functions | — | ✓ |

## When the catalog doesn't cover it

- **Ask the [Assistant](/docs/assistant/)** (Pro). Describe what the bot should
  do; it writes the action, tests it, and turns it on with your click. The
  actions it writes appear under **Functions**, where you can read them — to add
  or change one, ask the Assistant.
- **[HTTP Endpoints](/docs/tools/http-endpoints/)** — describe one request
  against an API you already run and it becomes a named tool. No code, and it's
  on every plan.
- **Developers** write functions in a repository and ship them with the
  [`ganju` CLI](/docs/tools/cli/):

```bash
ganju init my-tools   # scaffold a project that deploys as-is
cd my-tools
ganju login
ganju link            # pick the organization and project
ganju deploy          # bundle, upload, publish
```

A version uploaded from the CLI shows in **Functions** read-only; it changes in
the repository, with `ganju deploy`.

Next: decide where people use it — set up [channels](/docs/getting-started/channels/).
