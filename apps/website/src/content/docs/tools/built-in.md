---
title: Built-in
description: The five core tools every project ships with — how your assistant lists, searches, reads, and delivers your resources and prompts.
order: 40
updated: 2026-07-07
---

Every project starts with five **built-in** tools already installed. They're the
core that lets your assistant work with your [resources](/docs/resources) and
[prompts](/docs/prompts) from day one — no connection or API key required, and they
can't be removed. This is what makes a Ganju assistant answer from *your* content
instead of guessing.

## Tools

- **Search Resources** — the workhorse. It semantic-searches every resource
  attached to the server for the chunks most relevant to a `query`, ranked by
  similarity, and returns the top excerpts (default 5, max 20) with their URI,
  title, score, and text. The assistant runs this before answering anything about
  your data so it replies from real content rather than hallucinating.
- **List Resources** — enumerates every resource on the server as a list of
  `{uri, title, description, mimeType}`. Use it to browse the full inventory and
  pick a URI, versus Search Resources when you're looking for content that matches
  a question.
- **Read Resource** — fetches the textual contents of one resource by URI so the
  assistant can quote, summarize, or reason about it inline. Returns plain text or
  stringified JSON. Binary files (PDFs, images, audio) aren't inlined here — those
  are delivered with Send Resource.
- **Send Resource** — delivers a resource to the user as a channel attachment —
  a preview, player, or download link rather than raw text. Use it when someone
  asks to see, receive, or download a file. An optional `caption` adds a short
  message alongside it.
- **List Prompts** — lists every [prompt](/docs/prompts) and command the server
  exposes — both the ones you created and any from connected MCP servers — along
  with the exact slash command and arguments to run each on the current channel.

## How they fit together

A typical answer chains them: **Search Resources** finds the relevant excerpts,
then the assistant either cites those directly, calls **Read Resource** to pull a
full document, or **Send Resource** to hand the user the file. **List Resources**
and **List Prompts** are for discovery — showing what's available and how to use
it.

Next, add capabilities beyond your own content — see [Gmail](/docs/tools/gmail),
[Slack](/docs/tools/slack), or [Web Search](/docs/tools/web-search).
