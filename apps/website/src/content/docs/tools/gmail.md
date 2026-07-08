---
title: Gmail
description: Send, read, search, and manage email from a connected Gmail account — 18 tools across sending, triage, labels, threads, and drafts.
order: 41
updated: 2026-07-07
---

The **Gmail** integration lets your assistant work with email on a connected
Google account — starting new messages, replying in-thread, triaging the inbox,
organizing with labels, and managing drafts. It offers **18 tools**.

## Connect it

Gmail uses **Google OAuth**. Open the integration in the catalog, select
**Connect Gmail** to authorize once for the whole integration, then turn on just
the individual tools you want. Each tool requests only the Google scope it needs —
reading uses read-only access, sending uses send access, label changes use modify
access — so you never grant more than the tools you enable require.

## Sending

- **Send Email** — composes and sends a brand-new message. Takes `to`, `subject`,
  and an HTML `body`, with optional `cc`, `bcc`, and `attachmentUris` (files from
  your resources, up to ~18 MB combined). Starts a fresh thread and returns the
  new message and thread IDs.
- **Reply Email** — replies to an existing message by `messageId`, preserving the
  Gmail thread and auto-prefixing "Re:". Set `replyAll` to include the original To
  and Cc recipients. Use this rather than Send Email to keep a conversation
  together.
- **Forward Email** — forwards a message to a new recipient, pulling in the
  original body and adding a "Fwd:" prefix. The forwarded copy starts a new
  thread.

## Reading & searching

- **List Emails** — browses the inbox, optionally filtered with Gmail search
  syntax (`is:unread`, `from:…`, `subject:…`, `has:attachment`, `after:…`).
  Returns summary lines (from / subject / date / ID), up to 50.
- **Read Email** — opens one message by ID and returns the full headers and
  decoded body.
- **List Threads** — lists conversations (thread ID + last snippet), optionally
  filtered by the same search syntax. Best when the user asks about an ongoing
  back-and-forth.
- **Get Thread** — returns a one-line summary of every message in a thread. Scan
  a conversation cheaply, then Read Email for the message you want in full.
- **Get Profile** — reports which account is connected, plus total messages and
  threads.

## Organizing

- **List Labels** — lists every label and folder with its ID. Gmail's label tools
  take IDs, not names, so call this first to discover them.
- **Modify Labels** — adds or removes labels on a single message (archive = remove
  `INBOX`, mark read = remove `UNREAD`, star = add `STARRED`). Needs at least one
  label to add or remove.
- **Batch Modify Labels** — applies the same label changes to up to 1,000 messages
  in one call — far cheaper than looping. Ideal for bulk archive or
  mark-all-as-read.
- **Move to Trash** — moves a message to Trash (recoverable for 30 days). This is
  the safe choice whenever a user asks to "delete" an email.

## Drafts

- **Create Draft** — saves a composed message in Drafts without sending. Supports
  attachments. Use when the user wants to review before sending, or when you're
  unsure they want to send at all.
- **List Drafts** — browses saved drafts with their recipient, subject, and IDs.
- **Get Draft** — reads a draft's full contents to confirm exactly what will go
  out.
- **Update Draft** — replaces a draft entirely (every field you pass overwrites
  the old one, so include the full message even when changing one line).
- **Send Draft** — sends an already-saved draft as-is and returns the resulting
  message ID.
- **Delete Draft** — permanently deletes an unsent draft (does not go to Trash).

Prefer Microsoft mail? See [Outlook](/docs/tools/outlook), which offers the same
surface via Microsoft Graph.
