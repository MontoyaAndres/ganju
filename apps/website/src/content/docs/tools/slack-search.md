---
title: Slack Search
description: Workspace-wide message search for Slack — a separate connection because Slack blocks bot tokens from searching.
order: 435
updated: 2026-07-07
---

**Slack Search** adds workspace-wide message search to your assistant. It's a
separate integration from [Slack](/docs/tools/slack) for a technical reason: Slack
does **not** allow bot tokens to call `search.messages`, so search needs a **user
token** (`xoxp`) instead of the bot token the core Slack tools use.

## Connect it

Connect **Slack Search** once on the Tools page, alongside (or instead of) the main
Slack integration. It authorizes a user token used only for searching. If it isn't
connected, the search tool returns the standard credential-not-connected error.

## Tool

- **Search Messages** — searches messages across the whole workspace. The `query`
  accepts Slack's own modifiers — `in:#channel`, `from:@user`,
  `before:YYYY-MM-DD`, `has:link` — and returns matches with the channel, user,
  timestamp, a text snippet, and a permalink. It's the way to pull prior context
  ("what did support say about X?") before the assistant composes a reply.

Pair it with the core [Slack](/docs/tools/slack) tools: search to find the
relevant thread, then Send Message to reply into it.
