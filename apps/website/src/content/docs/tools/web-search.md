---
title: Web Search
description: Search the live web and read full page content, powered by Tavily.
order: 46
updated: 2026-07-07
---

The **Web Search** integration gives your assistant access to the live web,
powered by **Tavily** — so it can answer with current facts and cite sources when
the answer isn't in your resources. It offers **2 tools**.

## Connect it

Web Search uses an **API key** (Tavily). Paste your key once when adding the
integration.

## Tools

- **Web Search** — searches the live web and returns the top results (title, URL,
  and a snippet), plus a synthesized answer when available. Use it for current
  information — news, prices, releases — or to verify a claim. Set `topic` to
  `"news"` with an optional `days` window for recent events. The assistant should
  cite the URLs it relies on.
- **Web Extract** — fetches the full, cleaned text of one or more specific pages by
  URL. Use it after a search (or when the user provides a link) to read a page in
  depth rather than relying on the short snippet. Pages that can't be fetched are
  reported separately.

The typical flow is Web Search to find sources → Web Extract to read the most
relevant ones in full.
