---
title: Getting started
description: "Seven short pages take you from no account to a bot answering real people on Telegram, WhatsApp, Slack, or Discord. All of it works on the Free plan."
order: 1
updated: 2026-11-13
---

## How the pieces fit

A Ganju **project** is one bot. People reach it through a **channel** (or an AI
app like Claude, through the project's [MCP URL](/docs/mcp/)), and on every
message the bot can use three things you give it:

| Piece | What it gives the bot | Where in the app | Step |
| --- | --- | --- | --- |
| **Prompts** | Ready-made requests people run as slash commands, like `/start`. | Knowledge → Prompts | 3 |
| **Resources** | Your files, Drive folders, and websites, to answer from instead of guessing. | Knowledge → Resources | 4 |
| **Tools** | Actions it can take: send an email, book a meeting, search the web, call your API. | Tools | 5 |

**Bot instructions** on the Channels page set its tone and rules, and
**Settings** holds the plan, members, and models for the whole organization.

![A project's Home: the MCP URL, the Activity chart by channel, and the Resources, Tools and Prompts counters](/images/project-home.webp)

## The shortcut: the Assistant

On **Pro** and **Enterprise**, a new project opens with a card on its Home:
**Build your bot with the Assistant**. Select **Open the Assistant** and tell it
in your own words what your bot should do, like "answer from my menu" or "take
orders and email them to me". It writes the actions, tests them, and asks you
before turning anything on. The steps above still work by hand at any time;
they're the same building blocks the Assistant uses. See
**[Assistant](/docs/assistant/)**.

## What you need

- A Google or GitHub account to sign in with.
- For a channel, an account on that platform (a Telegram bot takes two minutes).
- Nothing to install. Developers who want to write actions in code can add the
  [`ganju` CLI](/docs/tools/cli/) later:

```bash
npm install -g @ganju/cli
```

## Free and Pro, for these steps

Everything in the walkthrough works on Free. Pro raises the limits and adds the
Assistant:

| | Free | Pro / Enterprise |
| --- | --- | --- |
| Prompts per project | 3 | Unlimited |
| Searchable content | 5 MB | 1 GB included |
| Tools switched on at once | 7 | 40 |
| HTTP endpoints per project | 3 | Unlimited |
| Channels per project | 1 | Unlimited |
| Bot replies a month | 100, then it pauses | 3,000 included, then billed |
| Assistant, functions, and Data | No | Yes |
| Invite teammates | No | Yes |

Prices and the full comparison are in
[Settings → Compare plans](/docs/settings/#compare-plans).

## Go deeper

The pages above are the quick path. When you're ready to expand what your
assistant can do, each building block has a fuller guide:

- **[Organizations & projects](/docs/organizations-and-projects/)**: the
  organization/project structure, the switcher, and running Free and Pro side by
  side.
- **[Assistant](/docs/assistant/)**: build by describing, with credits on paid
  plans.
- **[Prompts](/docs/prompts/)**: multi-turn templates, typed variables, and
  editing as JSON.
- **[Resources](/docs/resources/)**: Google Drive, OneDrive, website crawls,
  and uploads, with semantic search, citations, and sync.
- **[Data](/docs/data/)**: a database per project, with triggers and
  schedules.
- **[Tools](/docs/tools/)**: the full catalog plus your own
  [HTTP endpoints](/docs/tools/http-endpoints/) and
  [functions](/docs/tools/functions/), and the
  [`ganju` CLI](/docs/tools/cli/) that ships them.
- **[Channels](/docs/channels/)**: per-platform setup for Telegram, WhatsApp,
  Slack, and Discord.
- **[MCP clients](/docs/mcp/)**: connect Claude, ChatGPT, Cursor, or VS Code to
  the same project.
- **[Analytics](/docs/analytics/)**: what the Home dashboard tells you.
- **[Settings](/docs/settings/)**: plans and billing, members, access tokens,
  and bringing your own model.
