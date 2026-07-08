---
title: Slack
description: Post messages, browse channels, look up users, upload files, and search the workspace in Slack.
order: 43
updated: 2026-07-07
---

The **Slack** integration lets your assistant participate in a Slack workspace —
posting messages and threads, discovering channels and users, and sharing files
from your resources. Workspace-wide message **search** is a separate connection
(Slack blocks bot tokens from searching), so it's covered below as its own step.

## Connect it

Slack uses **OAuth**. Connecting installs a bot token (`xoxb`) for the four core
tools. To use **Search Messages** you additionally connect **Slack Search**, which
adds a user token (`xoxp`) — Slack requires a user token for `search.messages`.

## Core tools

- **Send Message** — posts to a channel, DM, or thread. `channel` accepts an ID
  (`C…`/`G…`/`D…`, preferred) or a name (`#general`); set `threadTs` to reply
  inside an existing thread. Text uses Slack's mrkdwn by default. Returns the
  message `ts` so later replies can thread onto it.
- **List Channels** — lists conversations the token can see (public by default;
  include private channels, group DMs, or DMs via `types`). Returns name, member
  count, topic, and channel ID. Use it to resolve a channel name to an ID before
  posting.
- **Get User** — looks up a user by `userId` **or** `email` (pass exactly one).
  Returns the ID, display and real name, email (if visible), and active/bot flags.
  Use it to turn a mention or email into a Slack ID.
- **Upload File** — shares a stored resource into a channel via Slack's
  external-upload flow. Takes `resourceUri`, the destination `channel`, and an
  optional `initialComment` and `threadTs`. Up to 100 MB per file. Use this rather
  than Send Message when sharing a document or image.

## Searching the workspace

Message search is a **separate** integration — [Slack Search](/docs/tools/slack-search) —
because Slack blocks bot tokens from searching and requires a user token. Connect
it to add the **Search Messages** tool, then search to find prior context before
replying with Send Message.
