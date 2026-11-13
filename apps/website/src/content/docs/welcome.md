---
title: Welcome
description: Connect your AI to your files, tools, and apps, then offer it to anyone through the channels they already use.
order: 0
updated: 2026-11-13
---

Welcome to the Ganju docs. Ganju connects AI assistants like Claude, ChatGPT,
and Gemini to your own files, tools, and apps, with no servers to run, and no
code to write.

Then it lets you **offer that AI to whoever you want** (clients, your team, or
individual people) through the channels they already use: Telegram, WhatsApp,
Slack, and Discord. One workspace, delivered everywhere.

These guides take you from a blank workspace to a live assistant you can share
with anyone.

## How the app is laid out

Everything happens inside a **project**: one bot, with its own knowledge,
actions, and channels. A project's left rail has the same sections every time:

| Section | What it's for |
| --- | --- |
| **Home** | The project's dashboard: its MCP URL, activity, tool health, and recent activity. |
| **Assistant** | Describe in your own words what your bot should know or do, and it builds it with you. Pro and Enterprise. |
| **Knowledge** | What your bot knows: the **Resources** tab (files, websites, Drive folders) and the **Prompts** tab (reusable templates). |
| **Data** | The project's own database: tables your bot reads and writes. Pro and Enterprise. |
| **Tools** | What your bot can do: the **Catalog** of integrations, **HTTP Endpoints**, and **Functions**. |
| **Channels** | Where people talk to it (Telegram, WhatsApp, Slack, Discord), plus the **Bot instructions** shared by all of them. |

**Settings** (from your avatar menu) belongs to the organization: plan and
billing, members, projects, your own models, and access tokens.

![The project Home and the rail: Home, Assistant, Knowledge, Data, Tools and Channels](/images/project-home.webp)

## Start here

- **[Getting started](/docs/getting-started/)**: sign in, create your first
  organization and project, and get a bot answering on a channel in a few
  minutes.
- **[Organizations & projects](/docs/organizations-and-projects/)**: how Ganju
  is structured: an organization for your team and billing, a project per
  assistant.

## Explore what Ganju can do

Once you're set up, these guides go deeper on each capability: the building
blocks you combine to shape exactly what your assistant knows, does, and where it
lives:

- **[Assistant](/docs/assistant/)**: describe what your bot should know or do,
  and it writes the actions, tests them, and turns them on with your click.
  Billed in credits on paid plans.
- **[Prompts](/docs/prompts/)**: reusable, multi-turn templates with typed
  variables that become **slash commands** in every channel.
- **[Resources](/docs/resources/)**: ground your AI in your own knowledge:
  import from Google Drive or OneDrive, crawl a website, or upload files, all
  searchable with citations.
- **[Data](/docs/data/)**: give a project its own database: tables the
  assistant and your functions read and write, with triggers that run when rows
  change.
- **[Tools](/docs/tools/)**: let it take action: email (Gmail, Outlook), Slack,
  calendars (Google, Cal.com), web search, remote MCP servers like GitHub and
  Notion, or your own HTTP APIs.
- **[Functions](/docs/tools/functions/)**: custom actions in code. In the app,
  the Assistant writes them for you and you can read them; developers write and
  ship them from a repository.
- **[`ganju` CLI](/docs/tools/cli/)**: the developer's side: build, deploy,
  test, read logs, roll back, manage project data, and ship from CI.
- **[Channels](/docs/channels/)**: deliver it to real people on Telegram,
  WhatsApp, Slack, and Discord, with step-by-step setup for each.
- **[MCP clients](/docs/mcp/)**: connect the same assistant to Claude, ChatGPT,
  Cursor, or VS Code with one URL.
- **[Analytics](/docs/analytics/)**: activity over time, tool health with every
  call behind it, unused tools, and a recent-activity feed.
- **[Settings](/docs/settings/)**: manage your plan and billing, invite your
  team, bring your own language model, and create access tokens for CI.
- **[Deploy it yourself](/docs/deploy/)**: Ganju is open source (Apache-2.0);
  run your own instance on Cloudflare and Postgres.

## Plans at a glance

Ganju is free to start. **Free** gives you one project with a small monthly
allowance of replies; **Pro** ($29/mo) lifts the limits and adds the Assistant,
Data, Functions, team members, and your own models. See
[Settings → Compare plans](/docs/settings/#compare-plans) for every number.

> Every page on this site is also available as Markdown; just add `.md` to the
> URL (you're reading [`/docs/welcome.md`](/docs/welcome.md)). See
> [`/llms.txt`](/llms.txt) for the full index.
