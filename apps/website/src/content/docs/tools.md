---
title: Tools
description: Give your bot the ability to take action — integrations like Gmail, Outlook, Slack and Calendar, your own HTTP APIs, and functions the Assistant or your developer writes.
order: 4
updated: 2026-11-13
---

**Tools** are the actions your bot can take. Where
[resources](/docs/resources/) let it *read* your knowledge, tools let it *do*
things: send an email, post to Slack, book a meeting, search the live web,
check your stock, or call your own API. Every project ships with a set of
built-in tools, and you add more whenever you need them.

## Three kinds of tool

The **Tools** page has three tabs, one per kind:

| Tab | What it is | Who makes it | Plan |
| --- | --- | --- | --- |
| **[Functions](/docs/tools/functions/)** | Tools in code: several steps, logic, your database, a key combined with a computation. | The [Assistant](/docs/assistant/) writes them; a developer can deploy them with the [CLI](/docs/tools/cli/). The tab shows them read-only. | Pro and Enterprise |
| **[HTTP Endpoints](/docs/tools/http-endpoints/)** | One request against an API you already run, described in a form. No code. | You, in the form, or the Assistant. | All plans |
| **[Catalog](/docs/tools/catalog/)** | The integrations we ship and maintain: connect an account, switch on the tools you want. | You, or the Assistant. | All plans |

Start at the catalog. If your case is covered there, connecting an account is
the whole job. If it isn't, an HTTP endpoint is the shortest path to your own
API, and a function is what you reach for when one request isn't enough. You
don't have to choose yourself: tell the [Assistant](/docs/assistant/) what the
bot should do, and it picks the simplest of these that works.

![Tools, Catalog tab: the tools-exposed bar, search, filters and the integration cards](/images/tools-catalog.webp)

## Why use tools

- **Go from answering to acting.** Your bot doesn't just reply: it books the
  meeting, sends the follow-up, and saves the order.
- **Connect once, reuse everywhere.** Authorize an integration once, and every
  enabled tool works across all your channels and MCP clients.
- **Enable only what you need.** Turn tools on one by one, so the bot can do
  exactly what you allow and nothing more.
- **Bring your own API.** Add an HTTP endpoint or connect a vendor's remote
  MCP server to reach services we don't ship.

## How a tool works

Under the hood, your project is an **MCP server**, and a tool is a function
that server exposes to any connected AI. The flow is always the same:

1. **You enable a tool.** It's added to the bot's toolset and described to the
   model: its name, what it does, and the inputs it expects.
2. **You connect the integration once.** Tools that touch an outside account
   (Gmail, Slack, Calendar…) need access. You authorize it once, with OAuth or
   an API key, and Ganju stores the credential encrypted and refreshes it.
   Built-in tools need no connection.
3. **The model decides to call it.** When someone asks something in a channel
   or client, the model reads the available tools and, if one fits, calls it
   with the right arguments.
4. **Ganju runs it and returns the result.** The call runs with your stored
   credentials, and the result goes back to the model to finish the reply.
   Every call is recorded toward your usage.

When your organization turns on
[Confirm sensitive actions](/docs/settings/#confirm-sensitive-actions), a
channel bot asks the person before a tool sends, books, deletes or changes
something, and runs it only on a yes.

## Default tools

Every project starts with five **built-in** tools already installed, so your
bot can work with your [resources](/docs/resources/) and
[prompts](/docs/prompts/) from day one, with no connection:

- **List Resources**: list every resource available to the bot.
- **Read Resource**: read the contents of a stored resource.
- **Send Resource**: deliver a resource to the person as a chat attachment.
- **Search Resources**: find the resources most relevant to a question, by
  meaning.
- **List Prompts**: list the prompts and commands the bot offers, and how to
  run them on the current channel.

Once the project has a [database](/docs/data/), the bot also gets
[data tools](/docs/data/#the-assistants-data-tools) to read and change the
tables you allow it to.

## Turning tools on and off

Every tool has a switch and a remove button, and they do different things.
**Off** stops offering the tool while keeping its settings and connection;
**Remove** deletes it with its settings. Only tools that are on count toward
the limit, so you can keep more configured than you expose at once:

- **Free**: up to 7 tools on at once.
- **Pro and Enterprise**: up to 40 on at once, the most a channel sends to the
  model.

Each tool counts as one, including each function and each tool of a remote MCP
server, and a function only triggers run doesn't count.

Keep the list short on purpose. Every enabled tool's description is sent to the
model on every turn, so a long list costs tokens and makes the model's choice
harder. The Catalog tab shows how many you expose.

## Available tools

Each integration has its own page with what it does, how to connect it, and
every tool it offers:

- **[Built-in](/docs/tools/built-in/)**: the five core resource and prompt
  tools every project ships with.
- **[Gmail](/docs/tools/gmail/)**: send, read, search and manage email (18
  tools).
- **[Outlook](/docs/tools/outlook/)**: Microsoft 365 mail (18 tools).
- **[Slack](/docs/tools/slack/)**: post messages, browse channels and upload
  files.
- **[Slack Search](/docs/tools/slack-search/)**: workspace-wide message search
  (a separate connection).
- **[Google Calendar](/docs/tools/google-calendar/)**: create and manage events
  and find open time.
- **[Cal.com](/docs/tools/calcom/)**: check availability and book or cancel
  meetings.
- **[Web Search](/docs/tools/web-search/)**: search the live web and extract
  page content.
- **[GitHub](/docs/tools/github/)**: GitHub's official remote MCP server for
  repos, issues and pull requests.
- **[Notion](/docs/tools/notion/)**: Notion's official remote MCP server to
  search and update pages and databases.
- **[Greeting](/docs/tools/greeting/)**: a tiny demo tool for testing a new
  server.

And the two you build:

- **[HTTP Endpoints](/docs/tools/http-endpoints/)**: your own APIs as named
  tools, with no code.
- **[Functions](/docs/tools/functions/)**: tools in code, written by the
  [Assistant](/docs/assistant/) or deployed with the
  **[`ganju` CLI](/docs/tools/cli/)**.

Next: decide where people talk to your bot. Set up
[channels](/docs/getting-started/channels/).
