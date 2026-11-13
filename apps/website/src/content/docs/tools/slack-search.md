---
title: Slack Search
description: Workspace-wide message search for Slack — a separate connection because Slack blocks bot tokens from searching.
order: 435
updated: 2026-11-13
---

**Slack Search** adds workspace-wide message search to your assistant. It's a
separate integration from [Slack](/docs/tools/slack/) for a technical reason:
Slack does **not** let bot tokens call `search.messages`, so search runs on a
**user token** (`xoxp`) instead of the bot token the other Slack tools use.

## Connect it

1. Open **Tools → Catalog** and select the **Slack Search** card.
2. Select **Connect Slack Search**, pick the workspace and approve.
3. Turn on **Search Messages**.

It asks for a single permission, `search:read`, and you can connect it with or
without the main Slack integration.

Because it's a *user* token, search sees what **the person who connected it**
can see in Slack — including private channels and DMs they're in. Connect it
with an account whose visibility you're comfortable giving the assistant, such
as a dedicated account.

## Tool

- **Search Messages** (`slack-search-messages`) — searches messages across the
  workspace. `query` accepts Slack's own modifiers — `in:#channel`,
  `from:@user`, `before:YYYY-MM-DD`, `has:link`. `sort` is `score` (relevance,
  the default) or `timestamp` (newest first); `maxResults` 1–50, default 10.
  Each match comes with the channel, user, `ts`, a text snippet and a
  permalink.

It only reads, so it's never held for
[Confirm sensitive actions](/docs/settings/#confirm-sensitive-actions).

Pair it with the [Slack](/docs/tools/slack/) tools: search for the thread
("what did support say about the refund?"), then **Send Message** with the
match's `ts` as `threadTs` to reply inside it.

## Use the connection from your own code

A [function](/docs/tools/functions/) can use the same user token: add
`slack-user` to its connections and call `ctx.connection('slack-user')`.

## Troubleshooting

- **"Slack credential not connected".** Slack Search isn't connected (connecting
  the main Slack card isn't enough). Connect it from its own card.
- **A message you can see isn't found.** Search only covers what the connecting
  account can see. Connect with an account that's in that channel.
