---
title: Greeting
description: A tiny demo tool for confirming a new MCP server is wired up correctly.
order: 50
updated: 2026-11-13
---

**Greeting** is a demo and smoke-test tool. It's there so you can confirm a
brand-new MCP server is connected and responding before you add anything real —
it needs no connection and has no side effects.

## Turn it on

Open **Tools → Catalog**, select the **Greeting** card and switch on its one
tool. It counts toward your [tool limit](/docs/tools/catalog/#the-tool-budget)
like any other, so turn it off again once you've checked.

## Tool

- **Greeting** (`greeting`) — returns a templated hello for a `name`, in English
  or Spanish (`language`: `en` or `es`). It's only for testing — ask your client
  to "test the greeting tool"; in normal conversation the assistant replies
  directly instead of calling it.

Once you've confirmed the server works, move on to a real integration like
[Gmail](/docs/tools/gmail/), [Slack](/docs/tools/slack/), or
[Web Search](/docs/tools/web-search/).
