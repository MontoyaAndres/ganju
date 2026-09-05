---
title: Tools
description: Give your AI the ability to take action — integrations like Gmail, Outlook, Slack and Calendar, your own HTTP APIs, and functions you write yourself.
order: 4
updated: 2026-09-05
---

**Tools** are the actions your assistant can take on your behalf. Where
[resources](/docs/resources) let it *read* your knowledge, tools let it *do*
things — send an email, post to Slack, book a meeting, search the live web, or
call your own API. Every project ships with a set of built-in tools, and you add
more whenever you need them.

## Three ways to add one

The **Tools** page has three tabs, matching the three things you can put on your
server:

| Tab | What it is | Plan |
| --- | --- | --- |
| **[Functions](/docs/tools/functions)** | Code you write. Multi-step logic, transforms, anything that combines a credential with a computation. | Pro |
| **[HTTP Endpoints](/docs/tools/http-endpoints)** | One request against an API you already run, described in a form. No code. | All plans |
| **[Catalog](/docs/tools/catalog)** | The integrations we ship and maintain — connect an account, switch on the tools you want. | All plans |

Start at the catalog. If your case is covered there, connecting an account is the
whole job. If it isn't, an HTTP endpoint is the shortest path to your own API,
and a function is what you reach for when one request isn't enough.

## Why use tools

- **Go from answering to acting.** Your AI doesn't just reply — it books the
  meeting, sends the follow-up, and files the ticket.
- **Connect once, reuse everywhere.** Authorize an integration a single time and
  every enabled tool works across all your linked channels and MCP clients.
- **Enable only what you need.** Turn tools on one by one, so the assistant can do
  exactly what you allow — and nothing more.
- **Bring your own API.** Add a custom HTTP endpoint or connect a vendor's remote
  MCP server to expose services we don't ship out of the box.

## How a tool works

Under the hood, your project is an **MCP server** — and a tool is just a function
that server exposes to any connected AI. The flow is always the same:

1. **You enable a tool.** It's added to your assistant's toolset and described to
   the model — its name, what it does, and the inputs it expects.
2. **You connect the integration once.** Tools that touch an outside account
   (Gmail, Slack, Calendar…) need access. You authorize the integration a single
   time — with OAuth or an API key — and Ganju stores the credential securely and
   refreshes it automatically. Built-in tools need no connection.
3. **The model decides to call it.** When someone makes a request in a channel or
   client, the model reads the available tools and, if one fits, calls it with the
   right arguments — no code from you.
4. **Ganju runs it and returns the result.** The call runs with your stored
   credentials, scoped to only the permissions that tool needs, and the result
   flows back to the model to finish the reply or complete the action. Every call
   is recorded toward your usage.

## Default tools

Every project starts with five **built-in** tools already installed, so your
assistant can work with your [resources](/docs/resources) and
[prompts](/docs/prompts) from day one — no connection required:

- **List Resources** — list every resource available to this assistant.
- **Read Resource** — read the contents of a stored resource.
- **Send Resource** — deliver a resource to the user as a chat attachment.
- **Search Resources** — find the resources most relevant to a question using
  semantic search.
- **List Prompts** — list the prompts and commands this assistant exposes, and how
  to run them on the current channel.

## Turning tools on and off

Every tool has a switch and a delete, and they do different things. **Off** stops
the tool being exposed while keeping its configuration and its connection;
**Remove** deletes the row and takes the settings with it. Turning a tool off
frees a slot against your plan's tool count, so you can rotate through more than
you expose at once.

Keep the list short on purpose. Every enabled tool's schema is re-sent to the
model on every call, so a long tool list costs tokens on every turn and makes the
model's choice harder. Channels cap the list at 40 for that reason.

## Available tools

Each integration has its own page covering what it does, how to connect it, and
every tool it offers:

- **[Built-in](/docs/tools/built-in)** — the five core resource and prompt tools
  every project ships with.
- **[Gmail](/docs/tools/gmail)** — send, read, search, and manage email (18 tools).
- **[Outlook](/docs/tools/outlook)** — Microsoft 365 mail via Graph (18 tools).
- **[Slack](/docs/tools/slack)** — post messages, browse channels, and upload
  files.
- **[Slack Search](/docs/tools/slack-search)** — workspace-wide message search
  (separate user-token connection).
- **[Google Calendar](/docs/tools/google-calendar)** — create and manage events
  and find open time slots.
- **[Cal.com](/docs/tools/calcom)** — check availability and book or cancel
  meetings.
- **[Web Search](/docs/tools/web-search)** — search the live web and extract page
  content, powered by Tavily.
- **[GitHub](/docs/tools/github)** — connect GitHub's official remote MCP server
  for repos, issues, and pull requests.
- **[Notion](/docs/tools/notion)** — connect Notion's official remote MCP server
  to search and update pages and databases.
- **[Greeting](/docs/tools/greeting)** — a tiny demo tool for testing a new server.

And the two you build yourself:

- **[HTTP Endpoints](/docs/tools/http-endpoints)** — expose your own APIs as named
  tools, with no code.
- **[Functions](/docs/tools/functions)** — write your own tools in JavaScript,
  from the browser or the **[`ganju` CLI](/docs/tools/cli)**.

Next: decide where people use your assistant — set up
[channels](/docs/getting-started/channels).
