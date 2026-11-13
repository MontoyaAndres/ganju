---
title: Settings
description: "Your organization's control room: rename it, manage billing and usage, invite members, create access tokens, bring your own language models, and handle destructive actions."
order: 6
updated: 2026-11-13
---

**Settings** is your organization's control room. Open it from your avatar menu
at the bottom of the rail (**Settings**), or with **Settings** on an
organization's card on the **Organizations** page. A left sub-nav jumps between
each area:

| Section | What's there | Who sees it |
| --- | --- | --- |
| [**Organization**](#organization) | Name, counts, **Confirm sensitive actions** | Organization members |
| [**Billing & plan**](#billing--plan) | Plan, usage, upgrade or manage billing, Assistant credit limit | Organization members |
| [**Members**](#members) | Who's in the organization, invitations | Organization members |
| [**Projects**](#projects) | Each project's members and access tokens | Everyone |
| [**Models**](#models-bring-your-own) | Your own language models | Organization members |
| [**Your data**](#your-data) | Export your personal data, Terms and Privacy | Everyone |
| [**Danger zone**](#danger-zone) | Remove the organization, delete your account | Everyone (removing the organization: Owner only) |

Someone who's only in a project, not in the organization, sees just
**Projects**, **Your data**, and **Danger zone**.

## Organization

The **Organization** section shows when it was **Created**, how many
**Projects** and **Members** it has, and lets you change the **Organization
name** (3 to 100 characters) → **Save changes**.

![Settings, Organization: created date, project and member counts, the name, and Confirm sensitive actions](/images/settings-organization.webp)

### Confirm sensitive actions

Off by default. Turn it on (**Confirmation is on**) and the assistant asks the
person before any action that reaches someone else or can't be undone, and runs
it only on a yes. It applies to every project in the organization.

- **In channels** (Telegram, WhatsApp, Slack, Discord), the bot holds the call
  and asks in the chat. Under its question it lists exactly what a yes will
  run (the tool and each argument), written by the platform, not the model.
  Only the person who was asked can answer. A yes within 30 minutes runs those
  stored calls; anything else, including "yes, but change the time", drops
  them. Telegram private chats, Discord and WhatsApp offer **Yes / No** buttons;
  elsewhere the answer is typed.
- **In MCP clients** (Claude, Cursor, ChatGPT), the first call comes back *not
  run yet* with a one-time token. The assistant asks in its own chat and, on a
  yes, calls again with the token. It only works for those exact arguments,
  once, within 10 minutes.

**What counts as sensitive** comes from each tool's
[MCP annotations](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-annotations):
anything not marked read-only (`readOnlyHint: true`) or safe to undo
(`destructiveHint: false`) is confirmed.

- **Built-in tools** are already marked. Searching, listing and reading run
  straight away. Sending or forwarding email, posting to Slack, creating,
  changing or deleting calendar events and bookings, and deleting mail or
  drafts are confirmed.
- **[HTTP endpoints](/docs/tools/http-endpoints/)**: choose **What it does** in
  the endpoint dialog. Left unset, a `GET` counts as a read and any other
  method is confirmed.
- **[Functions](/docs/tools/functions/)**: each function declares its
  `annotations`, and developers set them in `ganju.json`. The
  [order desk example](/docs/tools/examples/#order-desk) shows one tool of
  each kind.
- **Connected MCP servers** use the annotations the remote server declares, and
  you can mark which of their tools only read.

A tool that declares nothing is treated as one that may change things, so it's
confirmed on every call, lookups included. `ganju build` warns about it.

What it doesn't do: an MCP client's assistant is told to ask, but the server
never sees the person's words, only the second call. It stops a sensitive
action from happening in one step, not an assistant set on skipping the
question.

**After outside content, whatever this setting says.** Once an MCP client's
session has read outside content (an email, a web page, another server's
answer), a sensitive action needs the signed-in person's own approval in the
dashboard. See [MCP clients → Approving actions](/docs/mcp/#approving-actions).

## Billing & plan

**Billing & plan** shows your current plan (**Free plan**, **Pro plan**, or
**Enterprise plan**), its renewal date, and your usage against each allowance.

- On **Free** you see what Pro adds and **Upgrade to Pro**, which opens checkout.
- On a paid plan, **Manage billing** opens the billing portal: payment method,
  invoices, and cancelling. If the plan is set to end, it says **Your plan ends
  on …**.

![Billing & plan on Pro: the usage rows, Assistant credits, Extra credits a month and the broken-action email switch](/images/settings-billing-pro.webp)

### What the usage rows mean

| Row | Counts | Plans |
| --- | --- | --- |
| **Assistant replies this month** | Your bot's replies on every channel. Incoming messages are free. | All |
| **Of those, on our AI model** | Replies that ran on Ganju's shared model rather than one of your own. | Pro, Enterprise |
| **Embedded content (RAG)** | The searchable text of your resources. | All |
| **Custom tool calls** | Calls to [functions](/docs/tools/functions/), your own code. Catalog integrations and remote MCP servers don't count. | Pro, Enterprise |
| **Assistant credits** | What the [Assistant](/docs/assistant/) and its test chat used. | Pro, Enterprise |
| **File storage** | Uploaded files. | All |
| **Projects** | Projects in the organization. | All |

Past an included amount, a row shows how much you're over and the rate it bills
at. When the organization has had voice notes this period, a line under the rows
shows how many (transcribing them is included; only the reply counts). On Pro
and Enterprise a **Data** block shows the period's database storage, rows
written and read, requests, and trigger runs, tracked but not billed yet: Data is
included in your plan.

### Assistant credits

The Assistant bills in **credits**: 1,000 a month are included on Pro and
Enterprise. Below the credits row:

- **Extra credits a month**: how many credits past the included ones the
  organization may use, at $2 per 100. **2,000** by default; **0** stops at the
  included credits. Select **Save**.
- **Email the owner and admins when a project's action stops working**: a
  switch for the alert sent when an action the Assistant built keeps failing.

If the Assistant runs on your organization's own Anthropic key (chosen in the
Assistant tab under **Pay with**, from a Claude model in
[Models](#models-bring-your-own)), it uses no credits; only its customer test
chat does.

### Compare plans

|                              | **Free**                               | **Pro**                              | **Enterprise** |
| ---------------------------- | -------------------------------------- | ------------------------------------ | -------------- |
| Price                        | $0                                     | **$29 / mo**                         | Custom         |
| Assistant replies included   | **100 / mo**                           | **3,000 / mo** (up to 1,000 on Ganju's model) | Custom terms |
| Past the included replies    | Assistant pauses; upgrade to continue  | Keeps going, billed as overage       | Custom terms   |
| Embedded content (RAG)       | 5 MB                                   | 1 GB, then $2 / GB                   | Custom terms   |
| File storage                 | 30 MB                                  | Unlimited                            | Unlimited      |
| Projects                     | 1                                      | Unlimited                            | Unlimited      |
| Prompts per project          | 3                                      | Unlimited                            | Unlimited      |
| Tools turned on per project  | 7                                      | Unlimited                            | Unlimited      |
| HTTP endpoints per project   | 3                                      | Unlimited                            | Unlimited      |
| Channels per project         | 1                                      | Unlimited                            | Unlimited      |
| Automatic resource sync      | None (sync by hand)                    | Daily or weekly                      | Daily or weekly |
| [Assistant](/docs/assistant/) |                                       | ✓ 1,000 credits / mo included        | ✓              |
| [Data](/docs/data/)          |                                        | ✓ up to 50 tables, 9 GB per database | ✓              |
| [Functions](/docs/tools/functions/) |                                 | ✓ 1,000,000 calls / mo included      | ✓              |
| Invite team members          |                                        | ✓                                    | ✓              |
| Bring your own model         |                                        | ✓                                    | ✓              |

**Enterprise** is a custom plan for larger organizations: everything in Pro with
no limits on projects, tools, prompts or channels, a custom web address and
tools, and a named contact for support. Pricing, allowances and contract terms
are arranged directly, so [contact sales](/contact/).

You can own **one Free organization**. To create more, at least one organization
you own must be on a paid plan.

### How the message allowance really works

The one number to understand is **assistant replies**. Only your assistant's
_replies_ count; incoming user messages are always free.

Every plan includes an allowance of replies that run on **Ganju's shared model**.
Because Ganju pays for that inference, the shared model is an _allowance_, not
unlimited:

- **Free**: 100 replies a month on the shared model. When you hit the cap the
  assistant pauses until the next cycle, or you upgrade. Free can't bring its
  own model key.
- **Pro**: 3,000 replies a month included, of which up to **1,000 may run on
  the shared model**. Past those 1,000, shared replies keep working and bill at
  the higher shared rate below. Adding your own provider key in
  [Models](#models-bring-your-own) moves them to the much cheaper own-key rate,
  which is what most people do once they're sending real volume. The billing
  page links straight to it (**connect your own model**).

### Overage (Pro)

Pro adds nothing to your bill until you go past the included amounts:

- **Extra replies on your own model key**: $2 per 1,000. This is a **platform
  fee** for running the tools and compute of each turn, _not_ a resale of model
  tokens (you pay your provider directly via your key).
- **Extra replies on Ganju's model**: $15 per 1,000 beyond the first 1,000.
  Higher because Ganju is buying the inference for you, so this rate covers a
  real cost rather than just the platform work.
- **Extra embedded content (RAG)**: $2 per GB beyond the included 1 GB.
  Searchable content is stored with a search index several times its own size,
  which is why this costs more per GB than plain file storage (which is free).
- **Extra calls to tools you wrote**: $5 per million beyond the included
  1,000,000. Only your own code counts here; calls to the integrations Ganju
  ships, and to remote MCP servers you connect, are bundled.
- **Extra [Assistant](/docs/assistant/) credits**: $2 per 100 beyond the
  included 1,000, up to the limit you set under **Extra credits a month**.
- **Custom domain**: $15 / mo add-on.

### If a payment fails or you cancel

While a subscription is active, trialing, or past due, its paid features keep
working. Once it's canceled or unpaid, the organization falls back to the Free
plan's limits. Project databases are kept, read-only.

> Want more for free? Ganju is Apache-2.0, so you can
> [self-host](/docs/deploy/) and run on your own keys.

## Members

**Members** lists everyone in the organization, with **You** next to your own
name and **Owner** next to the person who created it; everyone else is an
**Admin**.

- **Invite a teammate by email**, then **Invite**. They receive an email and
  accept the invitation in-app once signed in with that address. Invitations
  expire after 7 days.
- **Pending invitations** shows who hasn't answered yet; **Revoke invitation**
  cancels one.
- **Remove member** takes someone out immediately.

Inviting members is a **Pro** feature. Invitations can also be sent from an
organization's card on the **Organizations** page (**Invite**).

![Settings, Members: the owner and an admin, and the invite-by-email field](/images/settings-members.webp)

## Projects

**Projects** lists the projects under the organization. Each project has:

- **Open →**: go to the project.
- **Members**: the project's own member list, with the same invite, remove,
  and revoke actions as above. Project members can open that project even if
  they aren't in the organization.
- **Access tokens**: durable credentials for the [`ganju` CLI](/docs/tools/cli/)
  on machines that can't open a browser.

![Settings, Projects: each project with Members, Access tokens and Open](/images/settings-members.webp)

### Access tokens

A token acts as you, on that project and nothing else: for a CI job, a
container, or a server reached over SSH.

1. Under the project, open **Access tokens**.
2. Fill in **What is it for** (e.g. "GitHub Actions deploy"). It's the only thing
   anyone will have to go on when deciding whether revoking it breaks a deploy.
3. Pick **Expires**: **In 30 days**, **In 90 days**, **In a year**, or **Never**.
4. Select **Create token**, copy the value, and select **I have copied it**.
   It's shown **once**; Ganju keeps only a hash.

Set it as `GANJU_API_TOKEN` wherever the CLI runs; `ganju deploy` works with it
unchanged. Each token shows when it was last used and when it expires;
**Revoke token** stops it immediately. A token whose owner was deleted is marked
**Inactive** and no longer works, so revoke it and create a new one.

![A project's Access tokens: "What is it for", Expires and Create token](/images/settings-access-tokens.webp)

The same from a terminal, in a folder linked to the project:

```bash
ganju token create "GitHub Actions" --expires 90   # days, or "never"
ganju token list
ganju token revoke "GitHub Actions"
```

A token can't create other tokens; run `ganju token create` from a browser
login (`ganju login`).

## Models: bring your own

By default your channels use the **System default** model. Under **Models**
you can bring your own (Pro and Enterprise; on Free this section explains it's a
Pro feature). Select **Add model**, then fill in:

- **Display name**: a label to recognize it by (e.g. "Production Gemini").
- **Model**: pick from the catalog: Gemini 3.8 Flash, Gemini 3.1 Pro,
  GPT-5.4 mini, GPT-5.5, Claude Haiku 4.5, Claude Sonnet 5, Claude Opus 5, or
  **Custom (OpenAI-compatible)** for any service that speaks the OpenAI
  chat-completions protocol (a gateway, an aggregator, or your own server). A
  custom model also needs its **Model ID** (e.g. `anthropic/claude-opus-5`).
- **API key**: your own key for that provider; it's stored encrypted. When
  editing, leave it blank to keep the current one.
- **Base URL**: optional for catalog models; required for a custom model, and
  it must be a public `https://` address.
- **System prompt** _(optional)_: a persistent instruction for this model.
  For instructions that apply to the whole bot, use the project's
  [Bot instructions](/docs/getting-started/channels/#tell-the-bot-how-to-answer).

Select **Create model**. Add a model once and reuse it across any
[channel](/docs/channels/) in the organization; each channel picks one of your
models under **Language model**, or falls back to the system default. Use
**Edit** or **Remove** on a model's row; a model in use by a channel must be
re-pointed first.

![The New model form: Display name, Model, API key, Base URL and System prompt](/images/settings-models-new.webp)

## Your data

Personal, not organization-wide:

- **Export your data** → **Download my data** downloads everything Ganju holds
  about you as JSON: profile, sign-in methods, sessions, memberships,
  invitations you sent, and your acceptance record. Organization content
  (resources, prompts, conversations) belongs to the organization and is
  downloaded from its own pages.
- **Terms and privacy** shows when you accepted the current Terms and Privacy
  Policy. If they've changed, review them and select **I accept**.

## Danger zone

Permanent actions. Export anything you want to keep first.

- **Remove organization**: permanently deletes the organization and everything
  inside it: every project, channel, conversation, message, resource, tool, and
  language model. Only the **Owner** sees it. Confirm with **Yes, remove
  permanently**.
- **Delete your account**: deletes your profile, sign-in methods, sessions,
  linked chat identities, and acceptance record, and removes you from every
  organization and project. Organizations you **own** must be removed or
  transferred first; the app lists them if any are left. Confirm with **Yes,
  delete my account**.

![The Danger zone: Remove organization and Delete your account](/images/settings-danger-zone.webp)

## Troubleshooting

- **I can't find Billing or Members.** You're in a project but not in the
  organization. Ask an organization member to invite you.
- **"Connecting your own AI model is a Pro feature".** Free organizations run on
  the shared model; upgrade to add your own.
- **The Assistant stopped mid-month.** The organization used its included
  credits and its **Extra credits a month**. An organization member can raise
  the limit under Billing & plan.
- **Removing a model fails.** A channel still uses it, so change that channel's
  **Language model** first.
