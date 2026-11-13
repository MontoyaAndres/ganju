---
title: Slack
description: Post messages, browse channels, look up users, and upload files in a Slack workspace.
order: 43
updated: 2026-11-13
---

The **Slack** integration lets your assistant act in a Slack workspace —
posting messages and thread replies, finding channels and people, and sharing
files from your resources. It offers **4 tools**. Message **search** is a
separate integration, [Slack Search](/docs/tools/slack-search/), because Slack
doesn't let a bot token search.

This is about Slack as a set of *tools* the assistant calls. To put the
assistant itself in Slack, so people can talk to it there, see the
[Slack channel](/docs/channels/slack/).

## Connect it

1. Open **Tools → Catalog** and select the **Slack** card.
2. Select **Connect Slack**, pick the workspace and approve.
3. Back on the Tools page, turn on the tools you want.

Connecting installs a bot in the workspace with these permissions:
`chat:write`, `channels:read`, `groups:read`, `mpim:read`, `im:read`,
`users:read`, `users:read.email` and `files:write`. Each tool row shows the ones
it uses under **Scopes**.

The bot posts as itself and only sees what a bot can see: to post in a channel,
or to list a private one, invite the bot to it first (`/invite @YourBot` in
Slack).

![Tools, Catalog tab: the tools-exposed bar, search, filters and the integration cards](/images/tools-catalog.webp)

## Tools

The names in parentheses are what MCP clients and logs show.

- **Send Message** (`slack-send-message`) — posts `text` to a channel, DM or
  thread. `channel` takes an ID (`C…`, `G…`, `D…` — preferred) or a name
  (`#general`); `threadTs` replies inside an existing thread. Text uses Slack's
  mrkdwn (`*bold*`, `_italic_`, `<@U123>` mentions) unless `mrkdwn` is `false`.
  Returns the message `ts`, so later replies can thread onto it.
- **List Channels** (`slack-list-channels`) — lists conversations the bot can
  see, with name, member count, archived state, topic and channel ID. `types`
  defaults to `public_channel,private_channel` (also `mpim`, `im`);
  `includeArchived` adds archived ones; `query` filters by name; `maxResults`
  1–200, default 50. Use it to turn a channel name into an ID before posting.
- **Get User** (`slack-get-user`) — looks up a person by `userId` **or**
  `email` (exactly one). Returns the ID, display and real name, email (if
  visible), bot and deleted flags, and status. Use it to turn an email into a
  Slack ID before a DM.
- **Upload File** (`slack-upload-file`) — shares a stored resource
  (`resourceUri`) into a `channel`, with an optional `title`,
  `initialComment` and `threadTs`. Up to 100 MB per file. Use this rather than
  Send Message to share a document or image.

## Sensitive actions

With [Confirm sensitive actions](/docs/settings/#confirm-sensitive-actions) on,
the assistant asks before **Send Message** and **Upload File**. List Channels
and Get User run without asking.

## Searching the workspace

Connect [Slack Search](/docs/tools/slack-search/) to add **Search Messages**:
search for prior context, then reply with Send Message using the `ts` the search
returned as `threadTs`.

## Use the connection from your own code

A [function](/docs/tools/functions/) can call the Slack Web API with the bot
token: add `slack` to its connections and call `ctx.connection('slack')`.

## Troubleshooting

- **"Slack credential not connected".** Slack was disconnected. Connect it again
  from the card.
- **`not_in_channel` or `channel_not_found`.** The bot isn't a member of that
  channel. Invite it in Slack, or use List Channels to check the ID.
- **Get User returns no email.** The person's email isn't visible to the bot in
  that workspace; look them up by `userId` instead.
