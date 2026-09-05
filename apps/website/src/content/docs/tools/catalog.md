---
title: Catalog
description: The integrations we ship — connect an account once, switch on the tools you want, and turn them off again without losing the setup.
order: 39
updated: 2026-09-05
---

The **Catalog** is everything we ship and maintain: Gmail, Outlook, Slack,
calendars, web search, and vendors' own remote MCP servers. If your case is
covered here you should never have to write code for it — connect an account
once and switch on the tools you want.

## The grid

Each integration is a card showing what it does and how many of its tools you
have enabled (`0/18`, `5/5`). Search narrows the grid; opening a card shows every
tool in the group with its own switch.

Three cards are not integrations at all:

- **Built-in** — the five resource and prompt tools every project ships with,
  enabled from day one. No connection needed. See
  [Built-in](/docs/tools/built-in).
- **Greeting** — a one-tool smoke test, for confirming a new server is alive.
- **Remote MCP servers** — GitHub and Notion publish their own MCP servers, and
  connecting one brings its whole maintained toolset rather than a single
  request.

## Connect once, enable per tool

Most integrations need a one-time connection. Select **Connect**, authorize with
OAuth or paste an API key, and the credential is stored encrypted and refreshed
for you. **One connection serves the whole group** — connect Gmail once and all
18 of its tools can use it.

Then enable the tools you actually want. This is deliberately per tool rather
than per account, and it is worth knowing why: every enabled tool's schema is
re-sent to the model on **every** call, so tool count is a direct cost. We
measured it on our own traffic — an assistant with 5 tools averages ~1,100 input
tokens per turn, one with 12 averages ~13,100. A shorter tool list is a cheaper,
sharper assistant.

Channels cap the tool list at 40 for the same reason. The built-in resource tools
are always kept, so trimming can never cost your assistant the ability to read
your knowledge base.

## Off and Remove are different things

Every row has both, because they answer different questions:

| | What happens |
| --- | --- |
| **Off** (switch) | The tool stops being exposed. Its configuration, its credential and its settings all survive, and it stops counting toward your tool quota. A disabled row is marked **Off · settings kept**. |
| **Remove** (trash) | The row is deleted, and the settings go with it. |

Turning a tool off frees a quota slot, so on Free you can rotate through more
tools than your plan exposes at once. Turning one back on re-checks the quota,
which is the one place you can cross a cap without creating anything.

For a **remote MCP server**, the switch lives in its dialog and **Disconnect**
is the removal.

## Connections are shared

A connected account is a property of the assistant, not of one tool. That means
the same Gmail connection is available to:

- every Gmail tool in the catalog;
- an [HTTP endpoint](/docs/tools/http-endpoints) using OAuth authentication,
  instead of holding a second copy of the credential;
- a [function](/docs/tools/functions), through `ctx.connection('google-gmail')`
  — but only if you listed the provider in that function's settings. Your code
  never receives the refresh token, only a short-lived access token.

Disconnecting an integration affects all three.

## The integrations

| | |
| --- | --- |
| **[Built-in](/docs/tools/built-in)** | The five core resource and prompt tools |
| **[Gmail](/docs/tools/gmail)** | Send, read, search and manage email (18 tools) |
| **[Outlook](/docs/tools/outlook)** | Microsoft 365 mail via Graph (18 tools) |
| **[Slack](/docs/tools/slack)** | Post messages, browse channels, upload files |
| **[Slack Search](/docs/tools/slack-search)** | Workspace-wide message search |
| **[Google Calendar](/docs/tools/google-calendar)** | Create and manage events, find open slots |
| **[Cal.com](/docs/tools/calcom)** | Check availability and book or cancel meetings |
| **[Web Search](/docs/tools/web-search)** | Search the live web and extract pages |
| **[GitHub](/docs/tools/github)** | GitHub's official remote MCP server |
| **[Notion](/docs/tools/notion)** | Notion's official remote MCP server |
| **[Greeting](/docs/tools/greeting)** | A tiny demo tool for testing a new server |

## Not here?

Two escape hatches, in order of effort:

- **[HTTP Endpoints](/docs/tools/http-endpoints)** — one request against an API
  you already run, described in a form. Available on every plan.
- **[Functions](/docs/tools/functions)** — your own code, when you need logic
  rather than a single call.
