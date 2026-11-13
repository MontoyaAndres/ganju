---
title: Getting started
description: "A summary of the setup walkthrough: sign in, build your project, and share your AI, one short page at a time."
order: 1
updated: 2026-11-13
---

Getting started walks you through setting up Ganju from scratch, one short page
per step. Follow them in order the first time, or jump to whichever piece you
need. Here's what each page covers:

1. **[Sign in](/docs/getting-started/sign-in/)**: create your account with
   Google or GitHub and accept an invitation if you have one.
2. **[Create an organization & project](/docs/getting-started/organization-and-project/)**:
   set up your team and your first workspace, and find your way around the
   project.
3. **[Prompts](/docs/getting-started/prompts/)**: reusable templates that
   become slash commands in your channels.
4. **[Resources](/docs/getting-started/resources/)**: add the files, websites,
   and Drive folders your AI can search.
5. **[Tools](/docs/getting-started/tools/)**: switch on the actions your AI can
   take, like email, calendar, and web search.
6. **[Channels](/docs/getting-started/channels/)**: offer your AI on Telegram,
   WhatsApp, Slack, or Discord, and tell it how to answer.
7. **[Settings](/docs/getting-started/settings/)**: manage members, plan and
   billing, and the model your AI runs on.

Work through them and you'll have a live assistant answering real people on a
channel.

> Each item above is its own page in the sidebar under **Get started**. New
> here? Begin with **[Sign in](/docs/getting-started/sign-in/)**.

## The shortcut: the Assistant

On **Pro** and **Enterprise**, a new project opens with a card on its Home:
**Build your bot with the Assistant**. Select **Open the Assistant** and tell it
in your own words what your bot should do, like "answer from my menu", "take orders
and email them to me". It writes the actions, tests them, and asks you before
turning anything on. You can still follow the steps below by hand at any time;
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
