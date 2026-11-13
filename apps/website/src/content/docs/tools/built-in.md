---
title: Built-in
description: The five core tools every project ships with — how your assistant lists, searches, reads, and delivers your resources and prompts.
order: 40
updated: 2026-11-13
---

Every project starts with five **built-in** tools already on. They're the core
that lets your assistant work with your [resources](/docs/resources/) and
[prompts](/docs/prompts/) from day one — no connection or API key required. This
is what makes a Ganju assistant answer from *your* content instead of guessing.

You'll find them on the **Built-in** card of the
[Catalog](/docs/tools/catalog/) tab, each with its own switch.

![The Built-in integration with its five tools switched on](/images/tools-catalog-builtin.webp)

## Tools

The name in parentheses is the tool name MCP clients and logs show.

- **Search Resources** (`search-resources`) — the workhorse. It searches every
  resource on the server for the passages most relevant to a `query`, **by
  meaning and by exact words**, so it finds paraphrases as well as literal IDs,
  codes, SKUs and names. Returns the top excerpts (`limit`: default 5, max 20),
  most relevant first, each with its URI, title, score and text — plus, when
  known, a link to the original (`source`: the web page, or the file in Google
  Drive or OneDrive), the `page`, the `section` (heading path, sheet or slide)
  and when it was last updated. The assistant is told to run it before
  answering anything about your data and to cite what it uses.
- **List Resources** (`list-resources`) — lists the resources on the server a
  page at a time, as `{uri, title, description, mimeType}`, with a total and a
  cursor for the next page (`limit`: default 100, max 500). Use it to browse the
  inventory and pick a URI; Search Resources is for finding content that
  matches a question.
- **Read Resource** (`read-resource`) — fetches the text of one resource by
  `uri` so the assistant can quote, summarize or reason about it. Returns plain
  text or JSON. Binary files (PDFs, images, audio, video, archives) aren't
  inlined — those are delivered with Send Resource, and their text is reachable
  through Search Resources.
- **Send Resource** (`send-resource`) — delivers a resource (`uri`) to the
  person as an attachment in the channel: a preview, player or download link
  rather than raw text. Use it when someone asks to see, receive or download a
  file. An optional `caption` adds a short message alongside it.
- **List Prompts** (`list-prompts`) — lists every [prompt](/docs/prompts/) and
  command the server exposes — the ones you created and the ones from a
  connected remote MCP server — with the exact slash command (for example
  `/summarize`) and arguments to run each on the current channel.

None of them reach anyone outside the conversation or change your data, so
none is held for [Confirm sensitive actions](/docs/settings/#confirm-sensitive-actions).

## How they fit together

A typical answer chains them: **Search Resources** finds the relevant excerpts,
then the assistant either cites those directly, calls **Read Resource** to pull
a full document, or **Send Resource** to hand the person the file. **List
Resources** and **List Prompts** are for discovery — showing what's available
and how to use it.

## Keep them on

The built-in tools count toward your tool limit (on Free, 5 of the 7), but
they're the last thing to cut. You can turn one off or remove it like any other
row, and the assistant then loses that ability — without Search Resources it
answers blind. When a channel has more than 40 tools, these five are the ones
always kept.

If the project has a [database](/docs/data/), the assistant also gets three data
tools for it. They aren't in the catalog; see
[the assistant's data tools](/docs/data/#the-assistants-data-tools).

Next, add capabilities beyond your own content — see [Gmail](/docs/tools/gmail/),
[Slack](/docs/tools/slack/), or [Web Search](/docs/tools/web-search/).
