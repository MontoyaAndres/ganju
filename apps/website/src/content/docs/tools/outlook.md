---
title: Outlook
description: Microsoft 365 mail for your assistant, backed by Microsoft Graph — 18 tools across sending, triage, folders, threads, and drafts.
order: 42
updated: 2026-07-07
---

The **Outlook** integration gives your assistant Microsoft 365 email, backed by
**Microsoft Graph**. It mirrors the [Gmail](/docs/tools/gmail) surface — send,
read, organize, and draft — with **18 tools**, using mail *folders* where Gmail
uses labels.

## Connect it

Outlook uses **Microsoft OAuth**. Connect once for the whole account, then enable
the individual tools you need. Each tool requests only the Graph scope it requires
(`Mail.Read`, `Mail.Send`, `Mail.ReadWrite`, or `User.Read`), so permissions stay
minimal.

## Sending

- **Send Email** — sends a new message. Body is HTML by default (pass
  `contentType='text'` for plain text); supports attachments, with large files
  uploaded via Graph's chunked upload session. Starts a fresh conversation.
- **Reply** — replies to a message via Graph's createReply flow, preserving the
  conversation. Set `replyAll` to include all original recipients.
- **Forward** — forwards a message to a new recipient; the forwarded copy starts a
  new conversation, with an optional intro above the quoted original.

## Reading & searching

- **List Emails** — lists inbox messages, optionally filtered with a Graph
  `$search` query. Returns summary lines (from / subject / received / ID).
- **Read Email** — reads one message by ID; HTML bodies are stripped to plain text
  for the model.
- **List Threads** — lists conversation threads (one entry per `conversationId`
  with its latest message).
- **Get Thread** — summarizes every message in a conversation; call Read Email for
  full bodies.
- **Get Profile** — reports the connected account's name, address, and inbox
  totals.

## Organizing

- **List Folders** — lists every mail folder (system and user-created) with its ID
  and unread counts. Call this to find the IDs the move tools need.
- **Move Message** — moves one message to another folder by well-known name
  (`inbox`, `archive`, `junkemail`, `deleteditems`…) or folder ID. Archive, mark
  spam, or restore from trash.
- **Batch Move Messages** — moves up to 20 messages to the same folder in one call.
- **Move to Trash** — moves a message to Deleted Items (restorable until purged) —
  the safe choice for "delete".

## Drafts

- **Create Draft** — saves a composed message in Drafts without sending; supports
  attachments.
- **List Drafts** — lists saved drafts with recipient, subject, and last-modified
  time.
- **Get Draft** — reads a draft's full contents before sending.
- **Update Draft** — replaces a draft's fields; omit `attachmentUris` to keep
  existing attachments, or pass a new list to replace them.
- **Send Draft** — sends an existing draft as-is.
- **Delete Draft** — permanently deletes an unsent draft (removed immediately, not
  moved to Deleted Items).
