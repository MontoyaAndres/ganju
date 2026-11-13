---
title: Outlook
description: Microsoft 365 mail for your assistant, backed by Microsoft Graph — 18 tools across sending, triage, folders, threads, and drafts.
order: 42
updated: 2026-11-13
---

The **Outlook** integration gives your assistant Microsoft 365 / Outlook email,
backed by **Microsoft Graph**. It mirrors the [Gmail](/docs/tools/gmail/) set —
send, read, organize and draft — with **18 tools**, using mail *folders* where
Gmail uses labels.

## Connect it

1. Open **Tools → Catalog** and select the **Outlook** card.
2. Select **Connect Outlook**, sign in with the Microsoft account and approve.
3. Back on the Tools page, turn on the tools you want.

One connection serves all 18 tools. Connecting asks Microsoft for `Mail.ReadWrite`,
`Mail.Send`, `User.Read` and `offline_access` (so the connection keeps working
without signing in again). Each tool row shows the permission it uses under
**Scopes**. If your organization's Microsoft 365 admin restricts third-party
apps, they may need to approve it first.

![Outlook before connecting: Connect Outlook, the banner and the tools greyed out](/images/tools-catalog-not-connected.webp)

The tools have no per-tool settings. Bodies are HTML unless the call passes
`contentType: "text"`. The tool names in parentheses are what MCP clients and
logs show.

## Sending

- **Send Email** (`outlook-send-email`) — sends a new message, starting a new
  conversation. Takes `to`, `subject` and `body`, with optional `cc`, `bcc`
  (comma-separated), `contentType` and `attachmentUris` (files from your
  [resources](/docs/resources/), up to 150 MB per file; large files are uploaded
  in chunks).
- **Reply** (`outlook-reply-email`) — replies to a message by `messageId`,
  keeping the conversation. Set `replyAll` to include every original recipient;
  attachments are allowed.
- **Forward** (`outlook-forward-email`) — forwards a message (`messageId`) to
  `to`, with an optional intro `body` above the quoted original, optional `cc`
  and attachments. Starts a new conversation.

## Reading & searching

- **List Emails** (`outlook-list-emails`) — lists messages (from / subject /
  received / ID), newest first. `query` is a full-text search — field operators
  like `from:` are matched as plain words, not filters. `folderId` restricts it
  to one folder (default: the inbox). `maxResults` 1–50, default 10.
- **Read Email** (`outlook-read-email`) — reads one message by `messageId`; HTML
  bodies are turned into plain text for the model.
- **List Threads** (`outlook-list-threads`) — lists conversations (one entry per
  conversation, with its latest subject and sender), with optional `query`.
  `maxResults` 1–50, default 10.
- **Get Thread** (`outlook-get-thread`) — summarizes every message in a
  conversation (`conversationId`) without full bodies; then Read Email the one
  you want.
- **Get Profile** (`outlook-get-profile`) — reports the connected account's
  name, address and inbox totals.

## Organizing

- **List Folders** (`outlook-list-folders`) — lists every mail folder, system
  and your own, with its ID and unread count.
- **Move Message** (`outlook-move-message`) — moves one message (`messageId`) to
  `destinationId`: a well-known name (`inbox`, `drafts`, `sentitems`,
  `deleteditems`, `junkemail`, `archive`) or a folder ID from List Folders.
  Archive, mark as spam, or restore from Deleted Items.
- **Batch Move Messages** (`outlook-batch-move-messages`) — moves up to 20
  messages (`messageIds`) to the same folder in one call; extra IDs are ignored.
- **Move to Trash** (`outlook-trash-email`) — moves a message to Deleted Items,
  where it can still be restored. The safe choice for "delete".

## Drafts

- **Create Draft** (`outlook-create-draft`) — saves a message in Drafts without
  sending it; same fields as Send Email, attachments included.
- **List Drafts** (`outlook-list-drafts`) — lists drafts with ID, recipient,
  subject and last-modified time. `maxResults` 1–50, default 10.
- **Get Draft** (`outlook-get-draft`) — reads a draft in full by `draftId`.
- **Update Draft** (`outlook-update-draft`) — overwrites a draft's `to`,
  `subject` and `body` (all three required). Omit `attachmentUris` to keep the
  existing attachments, or pass a list to replace them. Doesn't send it.
- **Send Draft** (`outlook-send-draft`) — sends a saved draft as it is.
- **Delete Draft** (`outlook-delete-draft`) — permanently deletes an unsent
  draft (it doesn't go to Deleted Items).

## Sensitive actions

With [Confirm sensitive actions](/docs/settings/#confirm-sensitive-actions) on,
the assistant asks before **Send Email**, **Reply**, **Forward**, **Send Draft**,
**Move to Trash** and **Delete Draft**. Reading, moving between folders and
creating or editing drafts run without asking.

## Use the connection from your own code

A [function](/docs/tools/functions/) can call Microsoft Graph with the same
connection: add `microsoft-outlook` to its connections and call
`ctx.connection('microsoft-outlook')`. An
[HTTP endpoint](/docs/tools/http-endpoints/) can use it as its **Connected
account**.

## Troubleshooting

- **"Microsoft Outlook credential not connected".** Outlook was disconnected.
  Connect it again from the card.
- **The card shows Expired.** Microsoft stopped accepting the sign-in (password
  changed, access revoked, or an admin policy). Connect again; your tools are
  kept.
- **A search with `from:` finds nothing useful.** Outlook search is full-text;
  search for the sender's name or address as plain words.
