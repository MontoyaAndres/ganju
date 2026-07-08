---
title: HTTP Endpoints
description: Expose your own HTTP APIs to the assistant as named tools — no integration required.
order: 49
updated: 2026-07-07
---

**HTTP Endpoints** let you turn your own APIs into tools. Instead of waiting for a
built-in integration, you describe an HTTP request once and it becomes a named
tool the assistant can call — perfect for internal services, webhooks, or any
third-party API with an HTTP interface.

## How it works

Each endpoint you add registers as its own tool. You define:

- the **method and URL** to call (with placeholders the model fills in at call
  time);
- any **headers** — including auth like an API key or bearer token, stored
  securely;
- the **inputs** the tool accepts, which become the arguments the model provides;
- how the request body is built from those inputs.

When the model calls the tool, Ganju makes the HTTP request on your behalf and
returns the response for the model to use. Requests are screened against SSRF
(they can't be pointed at internal addresses) and rate-limited to protect your
services.

## When to use it

Reach for an HTTP endpoint when you want the assistant to hit an API we don't ship
as a first-class integration — your own backend, a CRM, an internal lookup, or a
partner API. For a vendor that publishes an official remote MCP server, prefer
connecting that instead (see [GitHub](/docs/tools/github) and
[Notion](/docs/tools/notion)), since it brings a whole maintained toolset rather
than a single request.
