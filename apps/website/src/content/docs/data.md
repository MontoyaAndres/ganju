---
title: Data
description: Give a project its own database (tables with typed columns, relations and search) that the assistant, your functions, the CLI and the API all read and write, with restore to any moment in the last 30 days.
order: 7
updated: 2026-11-13
---

Every project on **Pro** or **Enterprise** can have its own **database**: tables
with typed columns, relations between them, and full-text search. It is where a
menu, orders, bookings or stock live, so the assistant can look things up and
write them down, and your own code can too.

The assistant, your [functions](/docs/data/functions/), the
[CLI](/docs/data-api/#from-the-command-line), the [Data API](/docs/data-api/)
and the dashboard all use the same database, under the same rules. Nothing can
write to it around them.

> **Data or Resources?** Rows with fields (menus, orders, customers, bookings,
> stock) go in Data. Documents and pages the assistant reads and quotes go in
> [Resources](/docs/resources/).

## Create the database

Open **Data** in the project. With no database yet, the page explains what it
is for and shows **Name (optional)** and **Create database**. The name defaults
to the project's slug; you type it to delete the database later.

From the CLI:

```bash
ganju data create                 # named after the project's slug
ganju data create --name pizzeria
```

A project has one database. Most projects never need one, so nothing is
created until you ask. On Free, the page shows **Data is part of Pro** with
**See plans** instead.

## The Data page

Once the database exists, the page has a list on the left and the selected
item on the right:

- **Tables**, each with its row count. Search them with **Search tables**,
  create one with **+** (**New table**) or the upload icon (**New table from a
  file**).
- **Queries**: the [named queries](#named-queries).
- **Schedules**: the [schedules](/docs/data/schedules/), things that run every
  day or week at a set time.
- **Database settings** (the gear at the top): size, [time zone](#time-zone),
  download, restore and delete.

![The Data page: tables with row counts, Queries and Schedules on the left, and a table's Rows tab](/images/data-tables.webp)

A table opens on three tabs: **Rows**, **Schema** and **Triggers**.

## Tables and columns

A table holds one kind of thing (the dishes you sell, your orders, your
customers), with a column for each detail. Click **New table**, give it a
**Table name** (lowercase letters, digits and `_`, such as `order_lines`) and
its columns, or **New table from a file** to start from a spreadsheet: see
[Import a file](#import-a-file).

![The New table dialog: Table name, Label, Description and the first column](/images/data-new-table.webp)

| Type | In the dashboard | Holds |
| --- | --- | --- |
| `text` | Text | Short text |
| `long_text` | Long text | Notes and descriptions |
| `integer` | Whole number | Whole numbers, with an optional minimum (stock can't go below 0) |
| `decimal` | Decimal number | Decimal numbers, with an optional minimum |
| `boolean` | Yes / no | Yes or no |
| `date` | Date | A day |
| `datetime` | Date and time | A moment, stored in UTC and shown in a time zone |
| `enum` | Options | One of a list of up to 100 options, such as `open`, `ready`, `delivered` |
| `json` | JSON | Any JSON value |
| `email`, `url`, `phone` | Email, URL, Phone | Text checked for that shape |
| `relation` | Relation | A row of another table (**Points at**). **When that row is deleted**: **Block the delete**, **Delete these rows too** or **Clear this column** |
| `file` | File | A file in [Resources](/docs/resources/), by its uri |

Each column has a **Name**, a **Type**, an optional **Label** (shown instead of
the name) and a **Description**, and can also be:

- **Required**: every row must have it.
- **Unique**: no two rows share a value.
- **Filterable**: indexed, so filters and sorts on it stay fast as the table
  grows. Relations and unique columns are indexed on their own.
- **Searchable**: included in full-text search. Search ignores accents, so
  "jalapeno" finds "jalapeño".

Under **More options**: a **Minimum** for numbers (writes below it are
refused) and a **Default**, used when a new row leaves the column empty.

A **File** column takes a file you **Upload** (it is kept in Resources, under
**Data attachments**) or one you **Pick from resources**. Its **Searchable in
resources** option indexes the files uploaded from then on, so the assistant's
resource search finds them. If the file is later deleted from Resources, the
row shows **File missing**.

Every row also has `id`, `created_at`, `updated_at` and a `version` that goes
up with each change. The database sets them.

The **Description** of a table and of each column tells the assistant what it
holds ("the pizzas we sell, with price and stock"). Write one: it is what the
assistant reads to know which table to use.

### Rows

The **Rows** tab is a grid. Sort and filter from each column's header, look
for text with **Search rows**, and page through the table. **Refresh** reloads
it, **Import** adds rows from a file, and **New row** opens an empty row.
Select several rows to **Delete** them together.

![A table's Rows tab: the grid, Refresh, Import and New row](/images/data-rows.webp)

Click a row to open it in a side panel, change its fields and save. The panel
shows when it was **Created** and **Updated** and its **Version**. A relation
field searches the other table as you type; it shows the other table's
**Display column** ("Margherita" instead of #12).

![The row panel: each column's field, Created, Updated and Version, with Save and Delete](/images/data-row-panel.webp)

If someone changed the row after you opened it, saving tells you who and
offers **Load latest version**. Deleting shows first what else would go: rows
that would be deleted too, cleared, or that block the delete.

### Schema

The **Schema** tab has:

- **Columns**, with their type and rules. **Add column**, or edit and drop
  one from its row. Changing a column's type checks every row first; if some
  don't fit, nothing changes and you get the list. On a table over 100,000 rows
  the change runs in the background, with its progress at the top.
- **Table settings**: name, label, description, **Display column**, and who
  sees it ([Who sees what](#who-sees-what)).
- **Source: spreadsheet**: keep the table in step with a spreadsheet. See
  [Sync a table from a spreadsheet](/docs/data/sheet-sync/).
- **Relations** to and from this table, and its **Indexes**.
- **Drop table**, which asks you to type its name.

Dropping a table or a column, or changing a type, can be undone right after:
**Undo** puts the whole database back to just before the change.

![A table's Schema tab: columns with their type and rules, and Table settings](/images/data-schema.webp)

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
`ganju data info`; `ganju data index add <id>` and
`ganju data index dismiss <id>` act on one.

## Import a file

**New table from a file** reads a CSV, TSV or Excel file (`.xlsx`, `.xls`)
whose first row holds the column names. It guesses each column's name and type
from the first 200 rows; fix any of them, or untick a column to leave it out,
before creating the table. A workbook with several sheets asks which **Sheet**.

**Import**, on a table's Rows tab, adds a file's rows to a table that exists:

- Each column of the file goes into the table column you choose, matched by
  name or label first. **Leave out** skips one.
- **Add the rows to the table**, or **Replace all rows in the table** (you
  type the table's name to confirm, and can **Undo import** right after).
- **Numbers in this file**: values like `28.000` read two ways, so pick how
  the file writes decimals when Ganju can't tell.
- A relation is matched by the other table's display column. **Values with
  no match** lets you pick the row each unknown value means.
- The **Preview** marks the rows with a problem; they are left out, and you
  can **Download the rows left out (CSV)** to fix and import again.

From the CLI, `ganju data import <table> <file>` does the same with CSV, Excel
and JSONL files. See [the command line](/docs/data-api/#from-the-command-line).

## Who sees what

Your own MCP clients, as the project's owner, the dashboard, the CLI and your
functions see every table and every row. **Channel bots** (the assistant
answering customers on WhatsApp, Telegram, Slack or Discord) see only what
each table's settings allow. In the table's **Schema** tab, under **Table
settings**:

- **Assistant access (channel bots)**:
  - **None**: bots don't see the table.
  - **Read** (the default): bots can look rows up, but not change them.
  - **Read and add**: bots can look rows up and add new ones, such as orders.
  - **Full**: bots can add, change and delete rows. Deletes still ask the
    customer to confirm.
- **Each customer sees only their own rows**: on channels, a row is tied to the
  customer whose conversation wrote it, so "my orders" means theirs. A bot
  never reads another customer's rows.
- **Keep row history** (on by default): who changed each row and when, for 90
  days. Read it with `ganju data history <table> <id>` or the
  [Data API](/docs/data-api/#history-restore-and-export).

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

## Build it with the Assistant

The project's [Assistant](/docs/assistant/) can set the database up for you in
plain words: "make a table of the pizzas we sell with price and stock", "email
me each new order", "every night at 9, send me today's orders". It can:

- create the database, and set its [time zone](#time-zone);
- create, change and drop tables and columns, and add, change or delete rows
  (up to 200 at a time);
- save and delete [named queries](#named-queries), and run one to show you the
  answer;
- create, turn on or off and delete [triggers](/docs/data/triggers/) and
  [schedules](/docs/data/schedules/), and send you a test of an email before it
  is due.

Nothing changes until you apply it. The Assistant proposes a list of changes,
each in a plain line; you review it and click **Apply**, and anything that
deletes asks you to type the name of what goes. Data changes applied this way
can be undone with **Undo**. Undoing a dropped table or column, a type change,
or deleted rows puts the whole database back to just before that change, so
anything written since is replaced; the change says so before you apply it.

If a developer manages the tables from code with `ganju data schema push`, the
Assistant warns that their next push will put back a change made there.

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

Open **Queries** on the Data page and click **New query**. Give it a **Name**
(lowercase letters, digits and `_`), a **Description** and the SQL. Each
parameter under **Parameters** has a type (`text`, `integer`, `decimal`,
`boolean`, `date` or `datetime`) and can be **Required**; a value is checked
against its type before the query runs. A query is checked when it is saved:
it can only read, and only your tables. **Reads** lists the tables it reads,
and if it reads a whole large table, the dialog says which column to index.
**Run** tries it with values you type.

![The Queries view with its description and the New query button](/images/data-queries.webp)

A saved query runs by name from your functions (`ctx.data.run`), the CLI
(`ganju data run`), the API (`POST /query/:name/run`), a
[schedule](/docs/data/schedules/) and, if you turn on **The assistant can run
it**, from `data-query`. A query that reads a table where each customer sees
only their own rows is never offered to channel bots, since it would see every
customer's rows.

A run returns up to 100 rows by default, 500 at most, and 1 MB. A query that
would read the whole of a table over 200,000 rows is refused: filter on an
indexed column.

A project holds up to 100 named queries, each up to 10,000 characters of SQL
and 20 parameters. They are kept in `ganju.data.json` with the schema too,
under `"queries"`.

## Time zone

**Database settings → Time zone** sets the zone dates and times come back in
for the assistant, your functions and the API when they don't ask for one. A
date and time written without an offset is read in it too. It is also the zone
[schedules](/docs/data/schedules/) run in, and the midnight a
[time trigger](/docs/data/triggers/#time-triggers) on a date column counts
from. Without one, it is UTC. The dashboard always shows times in your
browser's zone.

![The Database settings dialog: size, Time zone, Download a copy and Restore to a point in time](/images/data-settings.webp)

From the CLI:

```bash
ganju data time-zone                  # prints it
ganju data time-zone America/Bogota
ganju data time-zone --clear          # back to UTC
```

Through the API it is `PATCH` on the database with `{ "timeZone":
"America/Bogota" }`, or `null` for UTC. The Assistant can set it too.

## Restore and download

All three are in **Database settings**:

- **Restore to a point in time**: bring the whole database back to how it was
  at any moment in the last 30 days. Everything written after that moment is
  replaced, and you can **Undo restore** right after. Trigger events still
  waiting to be sent are dropped, and the rows a restore brings back don't fire
  triggers.
- **Restore points**: before a large change, take one with
  `ganju data checkpoint` or `POST /checkpoint`, and restore to it to undo
  exactly that change.
- **Download a copy**: every table as its own JSONL or CSV file, plus the
  schema, prepared in the background. From the CLI:
  `ganju data export --format csv --out backup/`.

## Delete the database

**Database settings → Delete database** removes every table and row; you type
the database's name to confirm. For 7 days you can restore it (**Restore
database** on the Data page, or `ganju data restore`), or download a copy.
After that it goes for good. What the assistant and your functions read and
write there stops working at once.

## Limits

| | Per database |
| --- | --- |
| Size | 9 GB. Past it, writes that add data are refused; reads, deletes and downloads keep working |
| Tables | 50 |
| Columns | 93 per table |
| Options in an `enum` | 100 |
| Rows per page | 500, or 1 MB |
| One insert | 500 rows |
| One write | 50 operations and 5,000 rows, all or nothing |
| Named queries | 100 |
| Triggers and schedules | 50 in all, of which up to 10 time triggers and 5 schedules |
| Row history | 90 days |
| Restore | Any moment in the last 30 days |
| After a delete | 7 days to restore |

## Plans and billing

Data is part of **Pro** and **Enterprise**. If the organization moves to Free,
its databases stay, **read-only**: you can read and download everything, the
assistant and your functions can still read, and nothing can be changed until
you upgrade. Triggers and schedules pause.

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
trigger runs. This usage is measured but not billed yet; a price will be set
once there are real usage numbers, and announced before it applies.

## Next

- [Data from functions](/docs/data/functions/): `ctx.data` and `ctx.channels`
  in your own code.
- [Triggers and webhooks](/docs/data/triggers/): run something when rows change.
- [Schedules](/docs/data/schedules/): run something every day or week at a set
  time.
- [Sync a table from a spreadsheet](/docs/data/sheet-sync/): keep a menu, prices
  or stock in step with a Google Sheet, an Excel file or a CSV.
- [Data API](/docs/data-api/): the same database over HTTP, and the `ganju data`
  commands.
