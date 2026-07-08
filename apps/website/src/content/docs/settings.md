---
title: Settings
description: Your organization's control room — rename it, manage billing and usage, invite members, bring your own language models, and handle destructive actions.
order: 6
updated: 2026-07-07
---

**Settings** is your organization's control room. A left sub-nav jumps between each
area — **Organization**, **Billing & plan**, **Members**, **Projects**, **Models**,
and the **Danger zone**.

## Organization

The **Organization** section shows when it was created, how many projects and
members it has, and lets you rename it.

## Billing & plan

**Billing & plan** shows your current plan, its renewal date, and your usage
against each allowance. **Manage billing** opens the Stripe customer portal; on the
Free plan you'll see **Upgrade to Pro** instead. The screenshot below shows a **Pro**
organization — `Pro plan · active`, with assistant replies tracked against the
`3,000` included.

![The Settings page showing Organization details and the Pro plan's Billing & plan usage breakdown](/images/settings-1.webp)

### Compare plans

|                            | **Free**                               | **Pro**                              | **Enterprise** |
| -------------------------- | -------------------------------------- | ------------------------------------ | -------------- |
| Price                      | $0                                     | **$20 / mo**                         | Custom         |
| Assistant replies included | **100 / mo**                           | **3,000 / mo**                       | Unlimited      |
| Past the included replies  | Assistant pauses — upgrade to continue | Keep going on **your own model key** | Custom terms   |
| Embedded content (RAG)     | 5 MB                                   | 5 GB                                 | Unlimited      |
| File storage               | 30 MB                                  | Unlimited                            | Unlimited      |
| Projects                   | 1                                      | Unlimited                            | Unlimited      |
| Prompts per assistant      | 3                                      | Unlimited                            | Unlimited      |
| Tools per assistant        | 7                                      | Unlimited                            | Unlimited      |
| Channels per assistant     | 1                                      | Unlimited                            | Unlimited      |
| Invite team members        | —                                      | ✓                                    | ✓              |
| Bring your own model       | —                                      | ✓                                    | ✓              |

**Enterprise** is a custom plan for larger organizations — everything in Pro, plus
proxying your own / existing MCP server, a custom web address and tools, SSO and
contract terms, and dedicated support with guaranteed response times. Pricing and
allowances are arranged directly — [contact sales](/contact).

### How the message allowance really works

The one number to understand is **assistant replies**. Only your assistant's
_replies_ count — incoming user messages are always free.

Every plan includes an allowance of replies that run on **Ganju's shared model**.
Because Ganju pays for that inference, the shared model is an _allowance_, not
unlimited:

- **Free** — 100 replies a month on the shared model. When you hit the cap the
  assistant pauses until the next cycle, or you upgrade. Free can't bring its own
  model key.
- **Pro** — 3,000 replies a month on the shared model, included in the $20 base.
  Past 3,000, a channel keeps replying **only if it runs on a model you've added in
  [Models](#models--bring-your-own)** — your own provider key. Those own-key replies
  are unlimited.

### Overage (Pro)

Pro adds nothing to your bill until you go past the included amounts:

- **Extra replies** — $2 per 1,000, and only for replies on **your own model key**.
  This is a **platform fee** for running the tools and compute of each turn — _not_
  a resale of model tokens (you pay your provider directly via your key). Ganju
  never flat-rates its own model's inference, which is why shared-model use stops at
  the included allowance instead of billing overage.
- **Extra embedded content (RAG)** — $0.50 per GB beyond the included 5 GB.
- **Custom domain** — $15 / mo add-on.

> Want more for free? Ganju is Apache-2.0 — you can self-host and run on your own
> keys without these caps.

## Members & projects

Invite teammates to the organization by **email** — they accept the invitation
in-app — and each member has a role (the creator is the **Owner**; others are
**Admins**). Below, **Projects** lists every project under the organization; each
has its own member list, so you can control exactly who can access which project.

![The Members section and the Projects section, each with an invite-by-email field and member roles](/images/settings-2.webp)

## Models — bring your own

By default your channels use the **system default** model, but under **Models** you
can bring your own. Select **Add model**, then fill in:

- **Display name** — a label to recognize it by (e.g. "My assistant").
- **Model** — pick from the catalog: Anthropic (Claude), OpenAI (GPT), or Google
  (Gemini) models.
- **API key** — your own key for that provider; it's stored securely.
- **Base URL** _(optional)_ — point at a compatible or proxied endpoint.
- **System prompt** _(optional)_ — a persistent instruction that shapes how this
  model behaves.

Add a model once and reuse it across any [channel](/docs/channels) in the
organization — each channel can pick one of your configured models or fall back to
the system default.

![The New model form with display name, model, API key, base URL, and system prompt fields](/images/settings-4.webp)

## Danger zone

The **Danger zone** holds destructive, organization-wide actions. **Remove
organization** permanently deletes the organization and everything inside it —
every project, channel, conversation, message, resource, tool, and model. It can't
be undone, so it asks you to confirm. Only the **Owner** can remove the
organization.

![The Danger zone with the Remove organization action and its permanent-delete warning](/images/settings-3.webp)
