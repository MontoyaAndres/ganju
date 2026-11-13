---
title: Organizations & projects
description: How Ganju is structured — an organization holds your team, billing, and plan; each project inside it is a self-contained workspace for one assistant.
order: 1
updated: 2026-11-13
---

Ganju has two levels. Your **organization** represents your team or company —
it's where members, billing, your [plan](/docs/settings/), and your own language
models live. Inside it, each **project** is a self-contained workspace for one
assistant, with its own [knowledge](/docs/resources/), [prompts](/docs/prompts/),
[data](/docs/data/), [tools](/docs/tools/), [channels](/docs/channels/), and
[MCP URL](/docs/mcp/). One organization can hold many projects.

## What lives where

| Organization | Project |
| --- | --- |
| Plan, billing, and usage | Resources and prompts (**Knowledge**) |
| Members (Owner and admins) | Its own member list |
| Language models you bring (**Models**) | Data (tables, triggers, schedules) |
| **Confirm sensitive actions** (applies to every project) | Tools: catalog connections, HTTP endpoints, functions |
| Assistant credits (shared by all projects) | Channels and their **Bot instructions** |
| | MCP URL, activity, and tool health |
| | Access tokens for the CLI |

## Why two levels

- **One workspace per assistant.** Give each client, product, or use case its
  own project — their knowledge, data, and tools stay completely separate.
- **Shared team and billing.** Members and the plan sit at the organization
  level, so everything inside is covered by one subscription and one member
  list.
- **Clean separation, one account.** Run a Free organization for personal
  projects and a Pro one for your company, side by side, from the same login.

## Switch between them

The **Organizations & Projects** switcher — the grid icon at the top of the left
rail — is how you move around. Pick an organization on the left (each shows its
member count) to see its projects on the right, then open one. At the bottom:
**Manage organizations** and **New project**.

![The Organizations & Projects switcher: organizations on the left, their projects on the right, Manage organizations and New project](/images/org-project-switcher.webp)

## Create a project

1. Select **New project** in the switcher. The **Create a new project** dialog
   shows which organization it goes into (**In …**).
2. Enter a **Name** (at least 3 characters) and, optionally, a **Description**.
3. Select **Create**.

You land on the new project's Home, which starts with the five built-in tools.
On Pro and Enterprise it offers to **Open the Assistant**.

![The Create a new project dialog: Name and Description](/images/new-project-dialog.webp)

**Free** organizations have **one project**. Creating a second one asks you to
upgrade; Pro and Enterprise have no project limit.

## Manage organizations

**Manage organizations** opens the **Organizations** page, listing every
organization you belong to. Each card shows your badges (**Owner** if you
created it, and its plan: **Free**, **Pro**, or **Enterprise**), its project and
member counts, and when it was created — with **Invite** and **Settings**
actions. If you were added to just one project in an organization, its card
reads **Project access** instead and says how many projects you can open.

Above the list, **Your invitations** shows invitations waiting for you, with
**Accept** and **Decline**.

![The Organizations page: one card per organization with its role and plan, counts, and Invite and Settings](/images/new-org.webp)

### Create another organization

Select **New organization**. The **Create a new organization** dialog asks for
the organization **Name** and its first project's **Project name** and
**Project description** — every organization starts with one project.

You can own **one Free organization**. To create more, at least one
organization you own must be on a paid plan — upgrade one to Pro and you can add
others (each new one starts on Free with its own billing).

## Who can do what

Organization membership and project membership are separate:

- **Organization members** see the organization's full **Settings** — rename
  it, billing, members, projects, models. The person who creates an
  organization is its **Owner**; everyone invited to it joins as an **Admin**.
  Only the Owner can remove the organization.
- **Project members** can open that project. Whoever creates a project is a
  member of it; anyone else is added from **Settings → Projects → Members**, or
  by an invitation to that project.

So someone can be in a project without being in the organization (their card
on **Organizations** reads **Project access**, and Settings shows them only the
projects they're in), and an organization member who opens a project they
aren't in sees **You don't have access to this project**, with a link to the
organization settings where a project member can add them.

## From a terminal

The [`ganju` CLI](/docs/tools/cli/) works against one project at a time. Link a
folder to an organization and project by name or id:

```bash
ganju link                                                # choose from a list
ganju link --organization "Acme" --project "Support bot"  # no prompts
ganju link --status                                       # what this folder points at
```

Next: shape how your assistant behaves with [prompts](/docs/prompts/), or let
the [Assistant](/docs/assistant/) build it with you.
