---
title: Gmail
description: "Send, read, search, and manage email from a connected Gmail account: 18 tools across sending, triage, labels, threads, and drafts."
order: 41
updated: 2026-11-13
---

The **Gmail** integration lets your assistant work with email on a connected
Google account: starting new messages, replying in-thread, triaging the inbox,
organizing with labels, and managing drafts. It offers **18 tools**; turn on
only the ones your assistant needs.

## Connect it

1. Open **Tools → Catalog** and select the **Gmail** card.
2. Select **Connect Gmail**, choose the Google account and approve.
3. Back on the Tools page, turn on the tools you want.

One connection serves all 18 tools. Connecting asks Google for these
permissions: read (`gmail.readonly`), send (`gmail.send`), modify
(`gmail.modify`), compose drafts (`gmail.compose`) and labels (`gmail.labels`).
Each tool row shows the one it uses under **Scopes**.

![Gmail connected: the Connected chip, Disconnect, and each tool with its switch](/images/tool-gmail-enabled.webp)

The tools have no per-tool settings. The tool names in parentheses are what
MCP clients and logs show.

## Sending

- **Send Email** (`gmail-send-email`): composes and sends a new message,
  starting a new thread. Takes `to`, `subject` and `body` (HTML), with optional
  `cc` and `bcc` (comma-separated) and `attachmentUris` (files from your
  [resources](/docs/resources/), up to ~18 MB combined). Returns the new message
  and thread IDs.
- **Reply Email** (`gmail-reply-email`): replies to a message by `messageId`,
  keeping it in the same Gmail thread and adding "Re:". Set `replyAll` to include
  the original To and Cc recipients; `attachmentUris` works as above. Use this
  rather than Send Email to keep a conversation together.
- **Forward Email** (`gmail-forward-email`): forwards a message (`messageId`)
  to `to`, with an optional intro `body` above it and optional `cc`. Adds "Fwd:"
  and starts a new thread.

## Reading & searching

- **List Emails** (`gmail-list-emails`): lists messages (from / subject / date /
  ID), filtered with Gmail search syntax in `query` (`is:unread`,
  `from:a@b.com`, `after:2025/01/01`, `has:attachment`). Empty lists recent inbox
  messages. `maxResults` 1–50, default 10.
- **Read Email** (`gmail-read-email`): opens one message by `messageId` and
  returns its headers and decoded body.
- **List Threads** (`gmail-list-threads`): lists conversations (thread ID and
  latest snippet), with the same `query` syntax. `maxResults` 1–50, default 10.
- **Get Thread** (`gmail-get-thread`): summarizes every message in a thread
  (`threadId`): date, from, subject, snippet and message ID, without full
  bodies. Scan a conversation cheaply, then Read Email the one you want.
- **Get Profile** (`gmail-get-profile`): reports which address is connected and
  its message and thread totals.

## Organizing

- **List Labels** (`gmail-list-labels`): lists every label with its ID,
  including system ones (`INBOX`, `UNREAD`, `STARRED`, `IMPORTANT`, `SPAM`). The
  label tools take IDs, not names, so this comes first.
- **Modify Labels** (`gmail-modify-labels`): adds or removes labels on one
  message: `messageId` plus `addLabelIds` and/or `removeLabelIds`. Archive =
  remove `INBOX`, mark read = remove `UNREAD`, star = add `STARRED`.
- **Batch Modify Labels** (`gmail-batch-modify-labels`): the same change on many
  messages at once (`messageIds`, up to 1,000). Ideal for bulk archive or
  mark-all-as-read.
- **Move to Trash** (`gmail-trash-email`): moves a message to Trash, where Gmail
  keeps it for 30 days. The safe choice whenever someone asks to "delete" an
  email.

## Drafts

- **Create Draft** (`gmail-create-draft`): saves a message in Drafts without
  sending it. Same fields as Send Email, attachments included. Use it when the
  person wants to review first, or when it's not clear they want it sent.
- **List Drafts** (`gmail-list-drafts`): lists drafts with their IDs,
  recipients and subjects. `maxResults` 1–50, default 10.
- **Get Draft** (`gmail-get-draft`): reads a draft in full by `draftId`, to
  confirm exactly what will go out.
- **Update Draft** (`gmail-update-draft`): replaces a draft entirely: pass
  `draftId` with the full `to`, `subject` and `body` even when changing one of
  them, and `attachmentUris` again to keep attachments; anything left out is
  removed. Doesn't send it.
- **Send Draft** (`gmail-send-draft`): sends a saved draft as it is and returns
  the message ID.
- **Delete Draft** (`gmail-delete-draft`): permanently deletes an unsent draft
  (it doesn't go to Trash).

## Sensitive actions

With [Confirm sensitive actions](/docs/settings/#confirm-sensitive-actions) on,
the assistant asks before **Send Email**, **Reply Email**, **Forward Email**,
**Send Draft**, **Move to Trash** and **Delete Draft**. Reading, labels and
creating or editing drafts run without asking. A common pattern is to enable
**Create Draft** but not **Send Email**, so a person always presses send.

## Use the connection from your own code

A [function](/docs/tools/functions/) can call the Gmail API with the same
connection: add `google-gmail` to its connections and call
`ctx.connection('google-gmail')` for a short-lived access token. An
[HTTP endpoint](/docs/tools/http-endpoints/) can use it as its **Connected
account**.

## Troubleshooting

- **"Google credential not connected".** Gmail was disconnected. Connect it
  again from the card.
- **The card shows Expired.** Google stopped accepting the sign-in (password
  changed or access revoked in the Google account). Connect again; your tools
  are kept.
- **"Attachments exceed Gmail's 18MB raw cap".** Send fewer or smaller files, or
  share a link instead.
- **A label change fails.** Use IDs from List Labels; user labels have IDs like
  `Label_12`, not their display names.

Prefer Microsoft mail? See [Outlook](/docs/tools/outlook/), which offers the same
set via Microsoft Graph.
