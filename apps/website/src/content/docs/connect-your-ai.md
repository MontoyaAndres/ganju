---
title: Connect your AI
description: Link Claude, ChatGPT, Cursor, or any MCP-compatible client to your workspace.
order: 9
updated: 2026-06-23
---

Ganju speaks the **Model Context Protocol (MCP)**, the standard way AI clients
connect to outside tools and information. Any MCP-compatible client can connect.

## Your connection URL

Each workspace has its own URL that looks like:

```
https://app.ganju.ai/mcp/your-workspace
```

Keep it private — it grants access to everything you've connected.

## Add it to a client

- **Claude** — add the URL as a custom MCP connector.
- **Cursor** — add it under MCP servers in settings.
- **ChatGPT / Gemini** — connect using your own account where supported.

Once connected, ask your assistant a question about your files or tell it to use
a tool — it will route through Ganju securely.
