---
title: GitHub
description: Connect GitHub's official remote MCP server to give your assistant repositories, issues, and pull requests.
order: 47
updated: 2026-07-07
---

**GitHub** isn't a set of tools we build — it's GitHub's **official remote MCP
server**, which you connect through Ganju. When you add it, Ganju links to
GitHub's hosted server and exposes the tools *it* provides to your assistant,
under a GitHub prefix. You always get GitHub's own, up-to-date toolset — repos,
issues, pull requests, and more — maintained by GitHub, not re-implemented by us.

## How it works

Under **Tools → MCP Servers**, add **GitHub** from the curated catalog. Ganju
connects to GitHub's server (`https://api.githubcopilot.com/mcp/`) over the
streamable-HTTP transport, discovers the tools it offers, and registers each one
for your assistant. The model can then call them like any other tool — Ganju
proxies each call to GitHub's server and returns the result.

## Connect it

GitHub's server authenticates with a **personal access token (PAT)** sent as a
bearer token. Create a PAT in your GitHub settings (scoped to what you want the
assistant to reach) and paste it in when you add the server. It's stored securely
and used for every call to GitHub.

## Available tools

The exact tools come from GitHub's server and can change as GitHub updates it —
typically covering repositories, issues, pull requests, and related workflows.
After connecting, open the server in Ganju to see the current list and enable the
ones you want.

Want to connect a different vendor's server? See [Notion](/docs/tools/notion), or
expose your own API with [HTTP Endpoints](/docs/tools/http-endpoints).
