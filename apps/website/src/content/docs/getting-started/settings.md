---
title: Settings
description: Manage your organization, plan, members, models, access tokens, and more from one place.
order: 8
updated: 2026-11-13
---

**Settings** is your organization's control room. Open it from your avatar menu
(**Settings**) or from an organization's card on the **Organizations** page. A
left sub-nav jumps between each area: **Organization**, **Billing & plan**,
**Members**, **Projects**, **Models**, **Your data**, and the **Danger zone**.

> **Want the full picture?** This is the quick version. The complete
> **[Settings](/docs/settings/)** guide explains how the Free, Pro, and
> Enterprise plans really work, billing and overage, members, access tokens, and
> bringing your own model.

## Organization

See when the organization was created and how many projects and members it has,
and rename it under **Organization name** → **Save changes**.

Here too: **Confirm sensitive actions**. Turn it on and your bots ask the person
before sending an email or message, booking or changing a calendar event,
deleting something, or running any other action that isn't read-only — and act
only on a yes. Details in
[Settings → Confirm sensitive actions](/docs/settings/#confirm-sensitive-actions).

![Settings, Organization: created date, project and member counts, the name, and Confirm sensitive actions](/images/settings-organization.webp)

## Billing & plan

Your current plan and renewal date, and usage against each allowance: assistant
replies (and how many ran on Ganju's model), embedded (RAG) content, custom tool
calls, Assistant credits, file storage, and projects. Only your assistant's
replies count toward billing; incoming messages are free. On Free you'll see
**Upgrade to Pro**; on a paid plan, **Manage billing**.

![Billing & plan on Pro: the usage rows, Assistant credits, Extra credits a month and the broken-action email switch](/images/settings-billing-pro.webp)

## Members & projects

**Members** lists everyone in the organization. Invite a teammate by email —
they accept the invitation in-app — and remove members or revoke pending
invitations. Inviting is a Pro feature.

**Projects** lists every project; each has its own **Members** (who can open
that project) and **Access tokens** (for deploying from CI with the
[`ganju` CLI](/docs/tools/cli/)).

![Settings: Members with the invite field, and Projects with Members, Access tokens and Open](/images/settings-members.webp)

## Language models

By default your channels use the system model. On Pro you can bring your own:
under **Models**, select **Add model**, give it a **Display name**, choose the
**Model** (Gemini, GPT, or Claude models, or **Custom (OpenAI-compatible)**),
and paste your **API key** — with an optional **Base URL** and **System
prompt**. Add it once and pick it in any channel's **Language model**.

![The New model form: Display name, Model, API key, Base URL and System prompt](/images/settings-models-new.webp)

## Your data & Danger zone

**Your data** downloads everything Ganju holds about you as JSON and shows the
Terms and Privacy Policy you accepted. The **Danger zone** has **Remove
organization** (owner only) and **Delete your account**. Both are permanent.

Next: open a [channel](/docs/getting-started/channels/) to go live, or read the
full [Settings](/docs/settings/) guide.
