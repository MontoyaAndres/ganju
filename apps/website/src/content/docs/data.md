---
title: Data
description: Give a project its own database — tables with typed columns, relations and search — that the assistant, your functions, the CLI and the API all read and write, with restore to any moment in the last 30 days.
order: 7
updated: 2026-11-03
---

Every project on **Pro** or **Enterprise** can have its own **database**: tables
with typed columns, relations between them, and full-text search. It is where a
menu, orders, bookings or stock live, so the assistant can look things up and
write them down, and your own code can too.

The assistant, your [functions](/docs/data/functions/), the
[CLI](/docs/data-api/#from-the-command-line), the [Data API](/docs/data-api/)
and the dashboard all use the same database, under the same rules. Nothing can
write to it around them.

> **Data or Resources?** Rows with fields — menus, orders, customers, bookings,
> stock — go in Data. Documents and pages the assistant reads and quotes go in
> [Resources](/docs/resources/).

## Create the database

Open **Data** in the project and click **Create database**. The name is
optional (it defaults to the project's slug); you type it to delete the
database later. From the CLI it's `ganju data create`.

A project has one database. Most projects never need one, so nothing is
created until you ask.

## Tables and columns

A table holds one kind of thing — the dishes you sell, your orders, your
customers — with a column for each detail. Click **New table**, or **New table
from a file** to start from a CSV or JSONL file: the columns and their types are
guessed for you.

| Type | Holds |
| --- | --- |
| `text`, `long_text` | Text. Long text is for notes and descriptions |
| `integer`, `decimal` | Whole and decimal numbers, with an optional minimum (stock can't go below 0) |
| `boolean` | Yes / no |
| `date`, `datetime` | A day, or a moment with its time zone |
| `enum` | One of a list of options, such as `open`, `ready`, `delivered` |
| `json` | Any JSON value |
| `email`, `url`, `phone` | Text checked for that shape |
| `relation` | A row of another table. You choose what deleting that row does: block the delete, delete these rows too, or clear this column |
| `file` | A file's address (its uri) |

Each column can also be:

- **Required**: every row must have it.
- **Unique**: no two rows share a value.
- **Filterable**: indexed, so filters and sorts on it stay fast as the table
  grows. Relations and unique columns are indexed on their own.
- **Searchable**: included in full-text search. Search ignores accents, so
  "jalapeno" finds "jalapeño".

Every row also has `id`, `created_at`, `updated_at` and a `version` that goes
up with each change. The database sets them.

The **Description** of a table and of each column tells the assistant what it
holds ("the pizzas we sell, with price and stock"). Write one: it is what the
assistant reads to know which table to use.

Each table has three tabs:

- **Rows**: search, filter, add, edit and delete rows. If someone changed a row
  after you opened it, saving tells you who and lets you load the latest
  version. Deleting shows first what else would go: rows that would be deleted
  too, cleared, or that block the delete.
- **Schema**: columns, relations and indexes. Changing a column's type checks
  every row first; if some don't fit, nothing changes and you get the list.
  Dropping a table or a column can be undone right after.
- **Triggers**: run something when the table's rows change. See
  [Triggers and webhooks](/docs/data/triggers/).

### Index suggestions

Ganju watches how your tables are queried, without storing anything in your
database, and once a day suggests an index where one would pay off. A
suggestion shows at the top of the table's **Schema** tab with the numbers
behind it, for example: "340 queries this week filtered or sorted on `status`,
and each read about 12,000 rows to return 8."

A column is suggested when, over the last 7 days:

- it has no index;
- 50 or more queries filtered or sorted on it;
- those queries read on average 1,000 rows or more, and 20 or more for every
  row they returned.

**Add index** marks the column filterable and records it in the change log.
**Dismiss** hides the suggestion until its numbers double.

Ganju also flags an index that no query used in 30 days on a table that is
written to a lot, since every write updates the index too. It is only a flag:
nothing is removed. Turn off **Filterable** on the column if nothing needs it.

Open suggestions also show in the project's **Tool health** and in
`ganju data info` (`ganju data index add|dismiss <id>` acts on one).

## Who sees what

Your own MCP clients, as the project's owner, the dashboard, the CLI and your
functions see every table and every row. **Channel bots** — the assistant
answering customers on WhatsApp, Telegram, Slack or Discord — see only what
each table's settings allow. Open a table's settings:

- **Assistant access (channel bots)**:
  - **None**: bots don't see the table.
  - **Read**: bots can look rows up, but not change them.
  - **Read and add**: bots can look rows up and add new ones, such as orders.
  - **Full**: bots can add, change and delete rows. Deletes still ask the
    customer to confirm.
- **Each customer sees only their own rows**: on channels, a row is tied to the
  customer whose conversation wrote it, so "my orders" means theirs. A bot
  never reads another customer's rows.
- **Keep row history**: who changed each row and when, for 90 days.

Text a customer wrote into a row is treated as outside content, like a web
page: the assistant reads it, but doesn't follow instructions in it.

## The assistant's data tools

Once the project has a database, the assistant gets these tools, on every
channel and MCP client, without installing anything:

| Tool | What it does |
| --- | --- |
| `data-describe` | Lists the tables and columns it can see |
| `data-query` | Finds, filters, searches, counts and sums rows, or runs a [named query](#named-queries) |
| `data-write` | Adds, changes and deletes rows, several at once, all or nothing |
| `data-admin` | Creates and changes tables, columns and named queries, imports and exports. Only for the organization's admins, from their own MCP clients |

A channel bot's tools only reach the tables, and the rows, its settings allow.
On a channel, changing or deleting rows asks the customer first; adding rows,
such as placing an order, doesn't.

## Named queries

Some reports the filters can't express: sales per dish last week, the customers
who haven't ordered in a month. Write those once as a **named query**: one
`SELECT` (or `WITH … SELECT`) over your tables, with parameters like `:from`.

```sql
SELECT m.name AS dish, sum(l.quantity) AS units, sum(l.quantity * l.price) AS revenue
FROM order_lines l
JOIN menu m ON m.id = l.dish
JOIN orders o ON o.id = l."order"
WHERE o.created_at >= :from AND o.created_at < :to
GROUP BY m.name
ORDER BY revenue DESC
```

Open **Queries** on the Data page to write one. Each parameter has a type
(`text`, `integer`, `decimal`, `boolean`, `date` or `datetime`), and a value is
checked against it before the query runs. A query is checked when it is saved:
it can only read, and only your tables. If it reads a whole large table, the
dialog says so and which column to index.

A saved query runs by name from your functions (`ctx.data.run`), the CLI
(`ganju data run`), the API (`POST /query/:name/run`) and, if you turn on **The
assistant can run it**, from `data-query`. A query that reads a table where each
customer sees only their own rows is never offered to channel bots, since it
would see every customer's rows.

A project holds up to 100 named queries. They are kept in `ganju.data.json`
with the schema too, under `"queries"`.

## Time zone

**Database settings → Time zone** sets the zone dates and times come back in
for the assistant, your functions and the API when they don't ask for one. The
dashboard shows them in your browser's zone. From the CLI:
`ganju data time-zone America/Bogota`.

## Restore and download

- **Restore to a point in time**: bring the whole database back to how it was
  at any moment in the last 30 days, from **Database settings**. Everything
  written after that moment is replaced, and you can undo the restore right
  after. Trigger events still waiting to be sent are dropped, and the rows a
  restore brings back don't fire triggers.
- **Restore points**: before a large change, take one with
  `ganju data checkpoint` or `POST /checkpoint`, and restore to it to undo
  exactly that change.
- **Download a copy**: every table as its own JSONL or CSV file, plus the
  schema, prepared in the background.

## Delete the database

**Database settings → Delete database** removes every table and row. For 7
days you can restore it, or download a copy. After that it goes for good.
What the assistant and your functions read and write there stops working at
once.

## Limits

| | Per database |
| --- | --- |
| Size | 9 GB. Past it, writes that add data are refused; reads, deletes and downloads keep working |
| Tables | 50 |
| Columns | 93 per table |
| Rows per page | 500, or 1 MB |
| One write | 50 operations and 5,000 rows, all or nothing |
| Named queries | 100 |
| Triggers | 50 |
| Row history | 90 days |
| Restore | Any moment in the last 30 days |

## Plans and billing

Data is part of **Pro** and **Enterprise**. If the organization moves to Free,
its databases stay, **read-only**: you can read and download everything, the
assistant and your functions can still read, and nothing can be changed until
you upgrade.

A database whose organization stays on Free is deleted after a notice:

- **Day 30 on Free:** the owner and the admins get an email listing each
  database (project, size, tables), saying it is read-only and the date it will
  be deleted, with links to upgrade and to download a copy.
- **3 days before that date (day 41):** a reminder.
- **From day 44:** Ganju deletes it by hand. A copy is kept for 90 days; write
  to support if you need it.

Moving back to Pro or Enterprise at any point stops this and keeps everything.
Downloading a copy doesn't stop it. A Pro database that is simply idle is never
deleted.

**Settings → Billing & plan** shows a **Data** block for the current period: storage
(checked every hour) and the period's peak, rows read and written, requests and
trigger runs.

## Next

- [Data from functions](/docs/data/functions/): `ctx.data` and `ctx.channels`
  in your own code.
- [Triggers and webhooks](/docs/data/triggers/): run something when rows change.
- [Data API](/docs/data-api/): the same database over HTTP, and the `ganju data`
  commands.
