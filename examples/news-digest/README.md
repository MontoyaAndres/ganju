# news-digest

Today's Hacker News front page, in the chat or in someone's inbox with the list
attached as a Markdown file.

| Tool | What it does |
| --- | --- |
| `hn-top-stories` | The current top stories, with points, comments and links |
| `email-hn-digest` | Saves the digest on the project and emails it from your Gmail |

## What it shows

- **`ctx.resources.create` to make a file.** The digest is written as
  `text/markdown` with a `fileName`, under one uri per day
  (`resource://news-digest/2026-09-18`), so running it twice in a day replaces
  the earlier copy.
- **`ctx.sendFile` to deliver it.** `sendFile` takes resource uris, never bytes.
  The platform reads the file and attaches it, so the same call can send a
  file far larger than a Worker could hold. It also sends to Outlook and
  Slack, with `to: 'outlook'` or `to: 'slack'`.
- **`connections` gates sending too.** Sending as an account needs the same
  permission as reading its token, so `google-gmail` is in `ganju.json`.
- **Parallel requests, bounded.** Each story is one request, fetched together.
  `limit` stops at 15 because every `fetch` counts toward the project's
  outbound request budget.

## Set up

1. On the project's **Tools** page, connect **Gmail**.
2. Then:

```bash
ganju link
ganju test hn-top-stories --input '{"limit":5}'
ganju test email-hn-digest --input '{"to":"you@example.com","limit":5}'
ganju deploy
```

The second test sends a real email. Send it to yourself.

## Files

```
ganju.json            two tools, connections: ["google-gmail"]
src/topStories.ts     hn-top-stories
src/emailDigest.ts    email-hn-digest: create the file, then send it
src/lib/hackerNews.ts fetching stories, and formatting them as Markdown and text
```
