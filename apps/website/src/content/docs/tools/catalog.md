---
title: Catalog
description: "The integrations we ship: connect an account once, switch on the tools you want, and turn them off again without losing the setup."
order: 39
updated: 2026-11-13
---

The **Catalog** is everything we ship and maintain: Gmail, Outlook, Slack,
Google Calendar, Cal.com, web search, and the official remote MCP servers of
GitHub and Notion. If your case is covered here you never have to write code
for it: connect an account once and switch on the tools you want.

The **Tools** page of a project has three tabs: **Functions** (your own code),
**HTTP Endpoints** (one request against your API) and **Catalog**. This page is
about the last one.

![Tools, Catalog tab: the tools-exposed bar, search, filters and the integration cards](/images/tools-catalog.webp)

## The grid

Each integration is a card with its icon, a one-line description and how many
of its tools are on (**5/18 tools enabled**). A card whose account is linked
shows a **Connected** chip; one whose sign-in has lapsed shows **Expired**.

Above the grid:

- **The tool budget**: how many tools this project exposes, out of 40 (**12 of
  40 tools exposed**). Each one is re-sent to the model on every turn; the bar
  warns you as you get close.
- **Search integrations...**: matches card names, descriptions and the names of
  the tools inside them, so searching "draft" finds Gmail and Outlook.
- **Filters**: **All**, **On** (at least one tool enabled), **Off** (nothing
  enabled) and **Needs connection** (integrations that need an account you
  haven't linked yet, and remote MCP servers you haven't connected).

Opening a card shows every tool in the group, each with its description, a
**Scopes** chip (hover it to see the permission the tool needs) and its own
switch. **Back to catalog** returns to the grid.

Some cards are not integrations with an account:

- **Built-in**: the five resource and prompt tools every project starts with.
  No connection needed. See [Built-in](/docs/tools/built-in/).
- **Greeting**: a one-tool smoke test for confirming a new server responds. See
  [Greeting](/docs/tools/greeting/).
- **GitHub** and **Notion**: remote MCP servers run by the vendor. Connecting
  one brings the tools *their* server offers. They open a dialog instead of a
  tool list; see [GitHub](/docs/tools/github/) and
  [Notion](/docs/tools/notion/).

## Connect once, enable per tool

Most integrations need a one-time connection, and **one connection serves the
whole group**: connect Gmail once and all 18 of its tools can use it. Until
you connect, the group shows a banner (*Connect Gmail to enable these tools. You
only need to connect once for the whole integration.*) and its switches are
greyed out.

There are two kinds of connection:

| Kind | Integrations | How |
| --- | --- | --- |
| **Sign in (OAuth)** | Gmail, Outlook, Slack, Slack Search, Google Calendar | Select **Connect Gmail** (or the integration's name). You're sent to the provider to approve, then brought back to the Tools page with *Connected Gmail. Toggle the tools you want to enable below.* |
| **API key** | Cal.com, Web Search (Tavily) | Select **Add Cal.com API key**, paste the key and **Save**. We check the key with the vendor before storing it, so a wrong key is refused on the spot. |

Credentials are encrypted at rest, never shown again, and OAuth tokens are
refreshed for you. Once connected, the group header offers **Disconnect** (and
**Update API key** for key-based integrations).

![Outlook before connecting: Connect Outlook, the banner and the tools greyed out](/images/tools-catalog-not-connected.webp)

### When a tool needs more permissions

Connecting asks for every permission the integration's tools use, so normally
you approve once and you're done. If a connection was made before a tool needed
a permission it doesn't have, turning that tool on opens **Additional
permissions required**: **Grant permissions** sends you back to the provider to
add the missing scope on top of your existing connection.

## The tool budget

Every enabled tool's schema is re-sent to the model on **every** call, so tool
count is a direct cost, and models choose worse past a few dozen options. We
measured it on our own traffic: an assistant with 5 tools averages ~1,100 input
tokens per turn, one with 12 averages ~13,100. A shorter tool list is a cheaper,
sharper assistant. Turn on the tools you need, not the whole group.

The limits that apply:

- **Free:** 7 tools turned on per project. The five built-in tools count toward
  it.
- **Pro and Enterprise:** no plan limit, but a project can have at most **40**
  tools turned on.
- Each tool you allow from a remote MCP server counts as one, and a project
  with a [database](/docs/data/) adds its three data tools to the count.

Past the limit, turning one more on is refused with a message saying how many
are on; turn something off or upgrade. Channels also never send more than 40
tools to the model, and the built-in resource tools are always kept first, so
your assistant never loses the ability to read your knowledge.

## Off and Remove are different things

Every enabled or previously enabled row has both, because they answer different
questions:

| | What happens |
| --- | --- |
| **Off** (switch) | The tool stops being exposed. Its configuration, its credential and its settings survive, and it stops counting toward your tool limit. The row is marked **Off · settings kept**. |
| **Remove** (trash) | The row is deleted, and the settings go with it. The confirmation reminds you to turn it off instead if you only want it gone from the server. |

Turning a tool off frees a slot, so on Free you can rotate through more tools
than your plan exposes at once. Turning one back on re-checks the limit.

**Disconnect** is a third thing: it revokes the stored credential for the whole
integration. Every enabled tool in the group stops working immediately, but
your installed tools stay listed, so reconnecting brings them back as they were.

For a **remote MCP server**, the on/off switch (**Exposed**) lives in its dialog
and **Disconnect** removes it.

## Sensitive actions

Every catalog tool is labelled with what it does to the world: read-only,
changes that can be undone (drafts, labels, moving mail), or actions that reach
someone else or can't be taken back (sending, posting, booking, deleting).
When your organization turns on
[Confirm sensitive actions](/docs/settings/#confirm-sensitive-actions), the
assistant asks before running a tool of the last kind. Each integration page
lists which of its tools those are.

## Connections are shared

A connected account belongs to the project's assistant, not to one tool. The
same Gmail connection is available to:

- every Gmail tool in the catalog;
- an [HTTP endpoint](/docs/tools/http-endpoints/) using **Connected account**
  authentication, instead of holding a second copy of the credential;
- a [function](/docs/tools/functions/), through `ctx.connection('google-gmail')`,
  but only if the provider is listed in that function's connections (the
  **Connections** section of Function settings, or `"connections"` in
  `ganju.json` when you deploy with the [CLI](/docs/tools/cli/)). Your code never
  receives the refresh token, only a short-lived access token.

The connection names are `google-gmail`, `microsoft-outlook`, `slack`,
`slack-user` (Slack Search) and `google-calendar`. API keys (Cal.com, Tavily)
are not connections: only the catalog tools use them.

Disconnecting an integration affects all three.

## With the assistant

On paid plans, the [Assistant](/docs/assistant/) can work with the catalog for
you: it looks up what the catalog offers, and proposes adding a catalog tool,
turning tools on or off, or removing them, as a change you approve, with
undo. When a tool needs an account, it shows you a card to connect it; it never
asks for a password or a token. API keys (Cal.com, Web Search) and remote MCP
servers that need a sign-in or a token are added by you on the Tools page.

The `ganju` CLI doesn't manage catalog tools; it deploys functions, which can
use the same connections.

## The integrations

| | |
| --- | --- |
| **[Built-in](/docs/tools/built-in/)** | The five core resource and prompt tools |
| **[Gmail](/docs/tools/gmail/)** | Send, read, search and manage email (18 tools) |
| **[Outlook](/docs/tools/outlook/)** | Microsoft 365 mail via Graph (18 tools) |
| **[Slack](/docs/tools/slack/)** | Post messages, browse channels, look up users, upload files (4 tools) |
| **[Slack Search](/docs/tools/slack-search/)** | Workspace-wide message search (1 tool) |
| **[Google Calendar](/docs/tools/google-calendar/)** | Create and manage events, find open slots (6 tools) |
| **[Cal.com](/docs/tools/calcom/)** | Check availability and book or cancel meetings (4 tools) |
| **[Web Search](/docs/tools/web-search/)** | Search the live web and extract pages (2 tools) |
| **[GitHub](/docs/tools/github/)** | GitHub's official remote MCP server |
| **[Notion](/docs/tools/notion/)** | Notion's official remote MCP server |
| **[Greeting](/docs/tools/greeting/)** | A tiny demo tool for testing a new server |

## Troubleshooting

- **The switches are greyed out.** The integration isn't connected yet. Use
  **Connect** or **Add API key** in the group header.
- **The card says Expired.** The provider stopped accepting the stored sign-in
  (password changed, access revoked). Open the card and connect again; your
  tools and settings are kept.
- **A tool answers "credential not connected" or "not connected".** Someone
  disconnected the integration. Connect it again from its card.
- **Turning a tool on is refused.** You're at your tool limit. Turn off a tool
  you don't need, or upgrade.
- **The bot ignores a tool it has.** Check it's on (not **Off · settings kept**)
  and that its description fits the request, and remember a channel sends at
  most 40 tools.

## Not here?

Two escape hatches, in order of effort:

- **[HTTP Endpoints](/docs/tools/http-endpoints/)**: one request against an API
  you already run, described in a form. Available on every plan.
- **[Functions](/docs/tools/functions/)**: your own code, when you need logic
  rather than a single call.
