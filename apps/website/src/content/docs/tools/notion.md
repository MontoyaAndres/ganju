---
title: Notion
description: Connect Notion's official remote MCP server to search, read, and update pages and databases.
order: 48
updated: 2026-07-07
---

**Notion** isn't a set of tools we build — it's Notion's **official remote MCP
server**, which you connect through Ganju. When you add it, Ganju links to Notion's
hosted server and exposes the tools *it* provides to your assistant, under a Notion
prefix. You always get Notion's own, up-to-date toolset — searching, reading, and
updating pages and databases — maintained by Notion, not re-implemented by us.

## How it works

Under **Tools → MCP Servers**, add **Notion** from the curated catalog. Ganju
connects to Notion's server (`https://mcp.notion.com/mcp`) over the
streamable-HTTP transport, discovers the tools it offers, and registers each one
for your assistant. The model calls them like any other tool, and Ganju proxies
each call to Notion's server.

## Connect it

Notion's server authenticates with **OAuth**. When you add it, you're sent to
Notion to sign in and grant access to the workspace and pages you choose; Ganju
stores the resulting credential securely and refreshes it automatically.

## Available tools

The exact tools come from Notion's server and can change as Notion updates it —
typically searching your workspace and reading or updating pages and databases.
After connecting, open the server in Ganju to see the current list and enable the
ones you want.

Want to connect a different vendor's server? See [GitHub](/docs/tools/github), or
expose your own API with [HTTP Endpoints](/docs/tools/http-endpoints).
