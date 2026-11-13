---
title: Analytics
description: Every project's Home dashboard shows what your assistant is doing — activity across channels and MCP clients, tool health with the calls behind each number, unused tools, data triggers, and a recent-activity feed.
order: 6
updated: 2026-11-13
---

Every project opens on its **Home** dashboard — select **Home** at the top of
the rail. It's where you see how your assistant is actually being used: activity
over time, how each tool is doing, what's going unused, and who did what.

## Why it matters

- **See real usage, not guesses.** Watch conversations per day and spot when
  your assistant is busy — or quiet.
- **Know which channels and clients matter.** Each [channel](/docs/channels/)
  and [MCP client](/docs/mcp/) is its own line, so you can tell where your
  traffic comes from.
- **Catch broken tools early.** Tool health shows errors, slow calls, and the
  model fumbling a tool's inputs — with every call one click away.
- **Keep the tool list lean.** Tools nobody used in 30 days are listed with a
  **Disable** button.

## What's on Home

From top to bottom:

1. The project's name and description, and its **MCP URL** (see
   [MCP clients](/docs/mcp/)).
2. **Build your bot with the Assistant** — only on a brand-new Pro or
   Enterprise project.
3. **Activity** — the chart.
4. Three counters: **Resources**, **Tools**, **Prompts**.
5. **Tool health** — per-tool calls, errors, and latency, plus errors, data
   sections, and unused tools.
6. **Recent activity** — a feed of individual runs.

## Activity

The **Activity** card charts conversations per day on your channels and
connected apps — including the messages that come in. Switch the range between
**7d**, **30d**, and **90d**, and the view between **Line**, **Area**, and
**Bar**. Each channel and each MCP client gets its own series in the legend
(with its total for the range); click a legend entry to hide or show it.

> Only your bot's **replies** count toward billing — the incoming messages in
> this chart are free. See [Settings → Billing & plan](/docs/settings/#billing--plan).

![The project Home: MCP URL, the Activity chart by channel, and the Resources, Tools and Prompts counters](/images/project-home.webp)

## Counters

Below the chart, three cards summarize what the project holds and how much it's
used — each links straight to that section:

- **Resources** — how many you have, total size stored, and how many reads.
- **Tools** — how many are turned on and how many calls they've received.
- **Prompts** — how many you've defined and how many times they've run.

## Tool health

**Tool health** shows how each tool did over the selected range, from MCP
clients and channel bots alike. One row per tool:

| Column | Meaning |
| --- | --- |
| **Tool** | The tool's name. **Off** if it's turned off now; **Not on this server** if no tool has that name any more (it was removed, or the model made it up). |
| **Calls** | How many times it was called. |
| **Errors** | How many of those failed. |
| **p95** | 95% of calls finished faster than this. |
| **Last used** | When it was last called. |
| **Signals** | Hints that the model is struggling with it — see below. |

The **Signals**:

- **bad arguments** — calls whose arguments didn't match the tool's input
  schema. Clearer descriptions of the inputs usually fix these.
- **retries** — called again right after it failed, or with the very same
  arguments.
- **gave up** — after this tool failed, the model called a different tool
  instead.

![Tool health: calls, errors, p95 and last use per tool, Most common errors and Tables synced from a spreadsheet](/images/home-tool-health.webp)

### Drill into a call

Click a tool to see **Calls to …**, filtered by **All** or **Errors** (with
**Load more**). Click a call to see it whole: where it came from (a channel's
bot or an **MCP client**), its **Arguments**, its **Result** or **Error**, or
**Rejected before it ran**. From there:

- **Open session** lists every tool call, prompt, and resource read in that
  session, oldest first.
- **Open conversation** jumps to the channel conversation the call happened in.

### More sections in Tool health

Under the table, Tool health adds what applies to the project:

- **Most common errors** — the errors seen most often in the range, with how
  many times each happened.
- **Index suggestions** — for projects with [Data](/docs/data/): a column that
  queries keep filtering or sorting on, reading many rows to return a few
  ("An index would help"), or an index no query used in 30 days.
- **Tables synced from a spreadsheet** — each synced table, its source file, and
  when it last synced (or was refused).
- **Database triggers** — each [trigger](/docs/data/triggers/) with its
  **Runs**, **Failed**, **p95**, **Last run**, and how many events it skipped
  (the trigger was off or deleted, or the plan no longer includes Data). Click
  one to see its runs.
- **Unused in 30 days** — tools that are on but weren't called once in 30 days
  (built-in tools, MCP servers, functions, HTTP endpoints). Every enabled tool
  is sent to the model on every turn, so select **Disable** to turn one off.
  You can turn it back on from **Tools**. On Free, if the project is at its tool
  limit, the confirmation warns that you'll have to turn another tool off before
  you can turn this one back on.

## Recent activity

The **Recent activity** feed is a running log of individual events — who
**read** a resource, **ran** a tool, or **used** a prompt, which source it came
from (a channel like Telegram, or an MCP client), and when. It's the quickest way
to confirm your assistant is doing what you expect.

![The Recent activity feed: who ran or read what, from which channel, and when](/images/home-recent-activity.webp)

## Other places to look

- **Channels → a channel → Conversations** — every exchange on that channel,
  with the tools and resources each reply used. See
  [Channels](/docs/channels/).
- **Settings → Billing & plan** — replies, storage, custom tool calls,
  Assistant credits, and Data usage for the whole organization. See
  [Settings](/docs/settings/#billing--plan).
- **The CLI** — the recent calls to your own functions, with their `ctx.log`
  output:

```bash
ganju logs                       # the last 20 calls
ganju logs --tool lookup-order   # only this one
ganju logs --limit 100
ganju logs --follow              # keep polling for new calls
```

## How long it's kept

Tool-call arguments and results are kept for 90 days, channel conversation
history for 365 days, and the "who ran what, when" audit rows behind Recent
activity for 365 days.
