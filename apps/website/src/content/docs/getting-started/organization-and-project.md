---
title: Create an organization & project
description: Set up your team and your first workspace, and learn your way around a project.
order: 3
updated: 2026-11-25
minutes: 3
outcome: "An organization, your first project, and you know your way around its Home."
---

Your **organization** represents your team or company; it's where members,
billing, and projects live. Inside it, each **project** is a self-contained
workspace for one bot, with its own knowledge, data, tools, channels, and MCP
URL.

## Create your organization

The first time you sign in, Ganju shows **Create Your Organization** and sets up
the organization and its first project together:

1. Under **Organization**, enter a **Name**: your team or company. You can
   change it later.
2. Under **Project**, enter the project's **Name** and, optionally, a
   **Description** of what the bot is for.
3. Select **Create Organization**.

Names need at least 3 characters (100 at most); a description can be up to 500.

![The Create Your Organization form, with fields for the organization name, project name, and project description](/images/new-org-project.webp)

Right after you create it, Ganju offers **Start your 7-day free trial**:

- **Start free trial** opens checkout with a card. Nothing is charged during the
  trial. Pro ($29 a month plus usage) starts automatically when it ends, unless
  you cancel before. You get a reminder email 3 days before.
- **Not now** leaves the organization without a plan: you can build, but the bot
  doesn't answer, and the Assistant, Data, and functions stay off. You can start
  the trial later from **Settings → Billing & plan**.

The trial is one per person and includes everything in Pro, with 300 bot
replies on Ganju's AI model and 300 Assistant credits. A banner above every page
shows the days left. See
[Settings → Billing & plan](/docs/settings/#billing--plan).

## Your project's Home

You land on the project's **Home**. At the top: the project name and
description, and its **MCP URL**, the address AI clients like Claude connect to
(see [MCP clients](/docs/mcp/)). Below: the **Activity** chart, counters for
**Resources**, **Tools**, and **Prompts**, **Tool health**, and **Recent
activity**, all explained in [Analytics](/docs/analytics/).

When the organization has a plan, a brand-new project also shows **Build your bot with the
Assistant** with an **Open the Assistant** button. The card goes away once the
project has resources, prompts, channels, or tools beyond the built-in ones.

## Find your way around

The left rail is the same in every project:

| Rail item | What you do there |
| --- | --- |
| **Home** | Watch activity and health; copy the MCP URL. |
| **Assistant** | Describe what the bot should do and let it build it. |
| **Knowledge** | Two tabs: **Resources** (files, websites, Google Drive, OneDrive) and **Prompts** (templates that become slash commands). |
| **Data** | The project's tables. |
| **Tools** | Three tabs: **Functions**, **HTTP Endpoints**, and **Catalog**. |
| **Channels** | Connect Telegram, WhatsApp, Slack, or Discord, and set the **Bot instructions**. |

The grid icon at the top of the rail opens **Organizations & Projects**, to
switch project or create a new one; see
[Organizations & projects](/docs/organizations-and-projects/).

## Built-in tools

Every project starts with five built-in tools already on (**List Resources**,
**Read Resource**, **Send Resource**, **Search Resources**, and **List
Prompts**), so your bot can work with your knowledge right away. That's the
**5** on the Tools counter. They need no connection.

![The Built-in integration with its five tools switched on](/images/tools-catalog-builtin.webp)

## Invite your team

Members belong to the organization, and each project has its own member list
too. To invite someone:

- From **Organizations**, select **Invite** on the organization's card, enter an
  **Email**, and select **Send invitation**.
- Or open **Settings → Members** (whole organization) or **Settings → Projects →
  Members** (one project only).

They receive an email and accept once signed in with that address. Details in
[Settings → Members](/docs/settings/#members).

## Using the CLI with this project

If a developer will write actions in code, they point a repository at this
organization and project once:

```bash
ganju login
ganju link                                   # pick the organization and project
ganju link --organization "Acme" --project "Support bot"   # or skip the prompts
ganju link --status                          # what this folder is linked to
```

`--organization` and `--project` take a name or an id. See the
[CLI guide](/docs/tools/cli/).
