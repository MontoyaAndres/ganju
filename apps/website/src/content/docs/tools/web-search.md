---
title: Web Search
description: Search the live web and read full page content, powered by Tavily.
order: 46
updated: 2026-11-13
---

The **Web Search** integration gives your assistant access to the live web,
powered by **Tavily** — so it can answer with current facts and cite sources
when the answer isn't in your resources. It offers **2 tools**.

## Connect it

Web Search uses your own **Tavily API key**; searches are billed to your Tavily
account.

1. Create an account at Tavily and copy an API key from its dashboard.
2. In Ganju, open **Tools → Catalog**, select the **Web Search** card and choose
   **Add Web Search API key**.
3. Paste the key and **Save**. We run a tiny test search with it before storing
   it; it's encrypted and never shown again.
4. Turn on **Web Search** and, if you want, **Web Extract**.

To swap the key later, use **Update API key**; **Disconnect** removes it.

![The API key dialog for an integration, with Cancel and Save](/images/tools-api-key-dialog.webp)

## Tools

The names in parentheses are what MCP clients and logs show.

- **Web Search** (`web-search`) — searches the web for a `query` and returns the
  top results (title, URL and a snippet), plus a synthesized answer when one is
  available. Options:
  - `maxResults` — 1–20, default 5.
  - `searchDepth` — `basic` (default) or `advanced`, which digs deeper but is
    slower and costs more Tavily credits.
  - `topic` — `general` (default) or `news`, with `days` to keep only the last
    N days.
  - `includeDomains` / `excludeDomains` — restrict results to, or drop them
    from, given sites.

  The assistant is told to cite the URLs it relies on.
- **Web Extract** (`web-extract`) — fetches the full, cleaned text of one or
  more pages (`urls`). `extractDepth` is `basic` (default) or `advanced`, which
  also pulls tables and embedded data at a higher cost. Use it after a search,
  or when the person shares a link, to read a page rather than rely on the
  snippet. Pages that can't be fetched are reported separately.

The typical flow is **Web Search** to find sources → **Web Extract** to read the
most relevant ones in full. Both only read, so neither is held for
[Confirm sensitive actions](/docs/settings/#confirm-sensitive-actions).

## Troubleshooting

- **"Invalid Tavily API key (or Tavily could not be reached)".** The key was
  refused when saving. Copy it again from Tavily.
- **"Web search is not connected".** The key was removed. Add it again from the
  card.
- **Searches start failing after working.** Check your Tavily plan's credits.
- **The assistant answers from the web instead of your documents.** Make sure
  your [resources](/docs/resources/) cover the topic; the assistant searches
  them first, and you can steer it in the bot's instructions.

The API key is only used by these tools; [functions](/docs/tools/functions/)
can't borrow it. For a narrower lookup against one site you control, an
[HTTP endpoint](/docs/tools/http-endpoints/) may be a better fit.
