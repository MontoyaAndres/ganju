---
title: Data API
description: Manage a project's database over HTTP — create tables, insert and search rows, write orders safely, run named queries, manage triggers and schedules, restore and export — with a personal access token, or from the ganju data commands.
order: 7
updated: 2026-11-13
---

Every project on **Pro** or **Enterprise** can have its own **database**: tables
with typed columns, relations between them, and full-text search. The **Data
API** is how you manage it from your own code. The dashboard and the CLI use the
same routes, so anything they can do, your code can do too. [Data](/docs/data/)
explains the database itself.

The full reference is an OpenAPI file:
[`https://api.ganju.ai/openapi/data.json`](https://api.ganju.ai/openapi/data.json).
Load it into Postman, Insomnia or a code generator.

## Authenticate

Create a personal access token for the project with the CLI, and send it as a
bearer token:

```bash
ganju token create "orders sync" --expires 90   # or --expires never
```

The token is printed once. `ganju token list` shows your tokens and
`ganju token revoke "orders sync"` stops one.

Every route lives under the project's database. The organization and project
ids are in your `ganju.json` once you've run `ganju link`:

```bash
export GANJU_TOKEN=ganju_pat_...
export DATA=https://api.ganju.ai/organization/<organizationId>/project/<projectId>/artifact/data
curl -H "Authorization: Bearer $GANJU_TOKEN" $DATA
```

A token only reaches the project it was made for. Each token can make 120
requests a minute to each route, within 300 a minute for your account in all.
Past that, the API answers `429` with a `Retry-After` header: wait a minute and
try again.

The examples below write `curl ...` for
`curl -H "Authorization: Bearer $GANJU_TOKEN" -H "Content-Type: application/json"`.

## The database

| Route | What it does |
| --- | --- |
| `GET /` | The database: `status`, size, `timeZone`, its tables, open index suggestions (`indexAdvice`) and a table copy in progress (`copy`). `database` is `null` when the project has none |
| `POST /` | Create it: `{ "name"? }`, the project's slug by default. Safe to repeat. While a deleted database can still be restored, this is refused unless you send `"replaceDeleted": true`, which gives up that restore |
| `PATCH /` | Its settings: `{ "timeZone": "America/Bogota" }`, or `null` for UTC |
| `DELETE /` | Delete it: `{ "confirmName": "<database name>" }`. It can be restored for 7 days |
| `POST /restore` | Undo a delete, within those 7 days |

(`/` here is `$DATA` itself.)

```bash
curl -X POST ... $DATA -d '{ "name": "pizzeria" }'
curl -X PATCH ... $DATA -d '{ "timeZone": "America/Bogota" }'
```

The **time zone** is the one dates and times come back in for anyone who
doesn't ask for another, and the one a date and time without an offset is read
in. A row read can ask for its own with `?timeZone=Europe/Madrid`.

## Create a table

```bash
curl -X POST ... $DATA/table -d '{
  "name": "menu",
  "label": "Menu",
  "description": "The pizzas we sell, with price and stock",
  "displayColumn": "name",
  "access": "read",
  "columns": [
    { "name": "name",  "type": "text",    "required": true, "searchable": true },
    { "name": "price", "type": "integer", "min": 0 },
    { "name": "stock", "type": "integer", "min": 0, "default": 0 },
    { "name": "size",  "type": "enum",    "values": ["30cm", "40cm"] }
  ]
}'
```

A table takes:

| Field | What it is |
| --- | --- |
| `name` | Lowercase letters, digits and `_`, starting with a letter, up to 63 characters |
| `label`, `description` | Shown instead of the name, and what the assistant reads (up to 100 and 300 characters) |
| `displayColumn` | What a relation to this table shows: `"name"` instead of the id |
| `access` | What channel bots may do: `none`, `read` (the default), `add` or `full`. See [Who sees what](/docs/data/#who-sees-what) |
| `customerScoped` | `true`: each customer sees only their own rows |
| `history` | Keep row history; `true` by default |
| `source` | Sync it from a spreadsheet: `{ "uri", "sheet"?, "key" }`. See [Sync a table from a spreadsheet](/docs/data/sheet-sync/) |
| `columns` | Up to 93 |

and each column:

| Field | What it is |
| --- | --- |
| `name`, `type` | The type is `text`, `long_text`, `integer`, `decimal`, `boolean`, `date`, `datetime`, `enum`, `json`, `email`, `url`, `phone`, `relation` or `file` |
| `label`, `description` | As for a table |
| `required`, `unique`, `filterable`, `searchable` | `true` or `false` |
| `values` | For `enum`: the options, up to 100 |
| `table`, `onDelete` | For `relation`: the table it points at, and what deleting that row does: `restrict`, `cascade` or `set_null` |
| `min` | For `integer` and `decimal`: the lowest value allowed |
| `default` | Used when a new row leaves it empty |

Every row also has `id`, `created_at`, `updated_at` and `version`. The database
sets these; you never send them.

## Insert, read and search rows

```bash
# One row, or up to 500 at once with "rows"
curl -X POST ... $DATA/table/menu/row -d '{ "values": { "name": "Margherita", "price": 28000, "stock": 10 } }'
curl -X POST ... $DATA/table/menu/row -d '{ "rows": [{ "name": "Hawaiian" }, { "name": "Pepperoni" }] }'

# One row
curl ... $DATA/table/menu/row/12

# Filter, sort, search and page
curl ... "$DATA/table/menu/row?where=%7B%22price%22%3A%7B%22lt%22%3A30000%7D%7D&sort=-price&limit=50"
curl ... "$DATA/table/menu/row?q=pizza"
```

An insert answers `{ "ids": [...] }`. A list answers `{ table, rows, total,
nextCursor }`:

- **`where`** is JSON: `{"status":"open"}`, `{"price":{"lt":30000}}`,
  `{"name":{"contains":"pizza"}}`. The operators are `eq`, `ne`, `gt`, `gte`,
  `lt`, `lte`, `in`, `notIn`, `contains`, `startsWith` and `isNull`; combine
  them with `and` / `or`, and filter on a related row's column with
  `"customer.name"`.
- **`sort`** is a list of columns. Put `-` in front of a column to sort
  descending: `-created_at,name`.
- **`q`** searches the columns marked `searchable`, best matches first.
- **`include`** brings in related rows: `include=customer`.
- **`limit`** is 20 by default, up to 500. A page holds up to 500 rows and
  1 MB. When there are more, the answer has `nextCursor`; send it back as
  `cursor` to read the next page. `total` comes on the first page.
- **`timeZone`** returns dates and times in that zone instead of the
  database's.

A relation comes back as `{ id, label }`. A file column comes back as
`{ uri, id, title, mimeType }`, or `{ uri, missing: true }` when no resource has
the uri any more; write it with the uri.

In JavaScript:

```js
const res = await fetch(`${DATA}/table/menu/row?q=${encodeURIComponent('pizza')}`, {
  headers: { Authorization: `Bearer ${process.env.GANJU_TOKEN}` }
});
const { rows, nextCursor } = await res.json();
```

## Change and delete rows without losing edits

Each row has a `version` that goes up by one with every change. Send back the
version you read:

```bash
curl -X PATCH ... $DATA/table/menu/row/12 -d '{ "set": { "price": 30000 }, "version": 3 }'
curl -X PATCH ... $DATA/table/menu/row/12 -d '{ "set": { "stock": { "decrement": 2 } } }'
curl -X DELETE ... $DATA/table/menu/row/12 -d '{ "version": 4 }'
```

A change answers `{ row }`, and a delete `{ deleted }`. A number can change
relative to itself with `{ "increment": n }` or `{ "decrement": n }`.

Someone may change the row after you read it. If they do, the answer is **409**,
with the row as it is now in `details.current` and who changed it in
`details.updatedBy`. Reload and try again. To overwrite their change, send the
request without `version`.

Before deleting, you can ask what the delete would do to the rows that point
at it. Nothing is deleted:

```bash
curl -X POST ... $DATA/table/orders/delete-preview -d '{ "ids": [12, 13] }'
```

Leave out `ids` to preview deleting every row. The answer lists each column
that points at a deleted row, with how many rows it would delete (`cascade`),
clear (`set_null`) or that refuse the delete (`restrict`). Cascades are
followed all the way down, and `depth` says how many cascades away each one
is. `blocked` is true when a restrict would refuse the delete. Past 200,000
affected rows, `truncated` is true and each count is a lower bound.

## Write an order safely

`POST /write` takes a list of up to 50 inserts, updates and deletes across
tables, touching up to 5,000 rows. They all apply together, or none of them do.
A later step can use the id of an earlier insert as `{ "$ref": <step> }`, in its
values or as the `id` of the row it updates or deletes. An update or delete
names one row by `id`, or the rows a `where` matches; `expect` says how many
rows must change. An update can change a number relative to itself, with a
guard:

```bash
curl -X POST ... $DATA/write -d '{
  "operations": [
    { "op": "insert", "table": "orders", "values": { "customer": "Ana" } },
    { "op": "insert", "table": "order_lines",
      "values": { "order": { "$ref": 0 }, "product": 12, "qty": 2 } },
    { "op": "update", "table": "menu", "id": 12,
      "set": { "stock": { "decrement": 2 } }, "where": { "stock": { "gte": 2 } } }
  ]
}'
```

It answers `{ results }`, one per step: `{ op, table, id }` for an insert
(`ids` for several rows), `{ op, table, changed }` for an update or delete.

If two customers order the last pizza at the same time, one order goes through.
The other gets a 409 ("changed 0 rows, expected 1"), and none of its steps are
written.

## Change the tables

| Route | What it does |
| --- | --- |
| `GET /table` | Tables, columns and relations, and each synced table's last `sync` |
| `POST /table` | Create a table |
| `PATCH /table/:table` | Rename it, change its label, description or settings. A `null` puts a setting back to its default |
| `POST /table/:table/sync` | Sync a table that has a `source` from its spreadsheet now (five a minute) |
| `DELETE /table/:table` | Drop it. Send `{ "confirmName": "<table>" }` |
| `POST /table/:table/column` | Add a column |
| `PATCH /table/:table/column/:column` | Rename or change a column, including its type |
| `DELETE /table/:table/column/:column` | Drop a column |
| `POST /advice/:adviceId` | Add a suggested index: marks the column filterable |
| `DELETE /advice/:adviceId` | Dismiss an index suggestion until its numbers double |
| `DELETE /copy` | Dismiss a failed table copy |
| `GET /change` | The log of these changes: who, what, when (`?limit=`, `?cursor=`) |

A table's `source` (`{ "uri", "sheet", "key" }`) keeps its rows in step with a
spreadsheet or CSV in Resources, and makes them read-only to every other
writer; `{ "source": null }` stops it. See
[Sync a table from a spreadsheet](/docs/data/sheet-sync/).

Changing a column's type checks every value first. If any value doesn't fit, the
change is refused and the answer lists the first 10 rows that don't. Dropping a
table or a column, and changing a type, answers with a `bookmark`. To undo the
change, restore to it.

A type change copies the table, and so does dropping a relation column. Up to
100,000 rows that happens in the request. On a larger table the copy runs in
the background. The answer has `copy`, with how many rows are copied so far,
and the table keeps its old columns until the copy is done. Meanwhile reads
and writes to other tables work as usual. A 409 answers table changes, and
writes that would change the copied table's rows: inserts, updates and
deletes on it, and deletes in a table it points at with cascade or set null.
`GET` on the database
shows its progress in `copy`. If the copy fails, the table is left as it was
and `copy` shows the `error` until you dismiss it with `DELETE /copy`.

## History, restore and export

- **`GET /table/:table/row/:id/history`**: every change to a row in the last 90
  days, newest first, with who made it (`?limit=` up to 100, `?cursor=`). A
  change made with a token is shown as `cli:<token id>`.
- **`POST /checkpoint`**: a restore point at this exact moment. It answers
  with a `bookmark`; take one before a large change, such as replacing a
  table's rows, to undo exactly that change later.
- **`POST /restore-point`**: put the whole database back as it was at a time in
  the last 30 days (`{ "timestamp": "2026-10-20T15:00:00-05:00" }`), or at the
  `bookmark` a checkpoint, a dropped table or column, a type change or an
  earlier restore answered with (`{ "bookmark": "…" }`). The answer has an
  `undoBookmark` that undoes the restore. Calls in flight while it restarts
  fail.
- **`POST /export`**: start a copy of the database, `{ "format": "jsonl" }` or
  `"csv"`: one file per table, plus `schema.json`. It answers `{ exportId,
  status }`. Poll `GET /export` (or `?exportId=`) until its `status` is
  `done`, then download each file with
  `GET /export/file?exportId=<id>&table=<table>`. Leave out `table` to get
  `schema.json`. Exports also work during the 7 days after you delete the
  database.

## Named queries, triggers and schedules

| Route | What it does |
| --- | --- |
| `GET /query` | Named queries, each with its SQL, parameters, the tables it reads and its plan (`SCAN orders` means it reads the whole table) |
| `POST /query` | Save one: `{ "name", "description", "sql", "params", "assistant" }`. Saving under an existing name replaces it |
| `DELETE /query/:name` | Delete one |
| `POST /query/:name/run` | Run one: `{ "params": { "from": "2026-10-01T00:00:00-05:00" }, "limit": 100 }`. Answers `{ query, rows, truncated? }` |
| `GET /trigger` | Triggers and schedules, and `pending`: events not yet sent |
| `POST /trigger` | Save a trigger or a schedule |
| `PATCH /trigger/:name` | Turn it on or off: `{ "enabled": false }` |
| `DELETE /trigger/:name` | Delete one |
| `POST /trigger/deploy` | Replace the triggers a CLI deploy made: `{ "triggers": [...] }` |
| `GET /trigger/:name/run` | Its recent runs, up to 50 |
| `POST /trigger/:name/run/:runId/retry` | Send a failed or skipped run again |
| `GET /trigger/test-send` | Your own chats with the project's bots, where a test can go |
| `POST /trigger/test-send` | Send a test of a customer message or an email, built from a row |

Each query parameter in `params` is `{ "name", "type", "description"?,
"required"? }`, with `type` one of `text`, `integer`, `decimal`, `boolean`,
`date` or `datetime`. A run returns up to `limit` rows (100 by default, 500 at
most) and 1 MB.

```bash
curl -X POST ... $DATA/query -d '{
  "name": "sales_by_dish",
  "description": "Units and revenue per dish between two times",
  "sql": "SELECT m.name AS dish, sum(l.quantity) AS units FROM order_lines l JOIN menu m ON m.id = l.dish JOIN orders o ON o.id = l.\"order\" WHERE o.created_at >= :from AND o.created_at < :to GROUP BY m.name",
  "params": [
    { "name": "from", "type": "datetime" },
    { "name": "to", "type": "datetime" }
  ]
}'

curl -X POST ... $DATA/trigger -d '{
  "table": "orders", "on": "update",
  "when": { "status": { "changedTo": "ready" } },
  "customer": { "text": "Your order #{{id}} is ready." }
}'
```

See [Named queries](/docs/data/#named-queries),
[Triggers and webhooks](/docs/data/triggers/) and
[Schedules](/docs/data/schedules/) for what they take.

## From the command line

The CLI's `ganju data` commands call these same routes, for the project in
`ganju.json`. Install it with `npm install -g @ganju/cli`, then `ganju login`
and `ganju link`. On a machine with no browser, set `GANJU_API_TOKEN` to a
personal access token instead (`ganju token create`): the CLI's writes are then
recorded as `cli:<token id>`, and it waits out a `429` on its own. Run
`ganju data` alone to list every command. Most commands take `--json` for
output a script can read.

### The database

```bash
ganju data create [--name <name>]       # Pro and Enterprise
ganju data info                         # status, size, time zone, tables, index suggestions
ganju data time-zone                    # prints the database's time zone
ganju data time-zone America/Bogota     # the zone dates and times come back in
ganju data time-zone --clear            # back to UTC
ganju data changes                      # the schema change log
ganju data checkpoint                   # a bookmark of right now, alone on stdout
ganju data export --format csv --out backup/   # jsonl by default
ganju data copy                         # a table copy running in the background
ganju data copy wait
ganju data copy dismiss                 # clear a failed one

# Index suggestions: add one, or dismiss it until its numbers double
ganju data index add <id>
ganju data index dismiss <id>
```

`ganju data create --replace` starts a new database while a deleted one can
still be restored, giving up that restore.

### Tables and columns

```bash
ganju data tables
ganju data table create menu --schema menu.json
ganju data table rename menu dishes
ganju data table sync menu              # read a synced table's sheet again now
ganju data column add menu notes long_text
ganju data column add menu size enum --input '{"values":["30cm","40cm"]}'
ganju data column rename menu notes description
ganju data column change menu price --input '{"type":"decimal"}' --yes
```

`table create` takes a file with `{ "columns": [...] }`, a list of columns, or
a `ganju.data.json` that has the table. `column change` and `column rm` wait for
a table copy to finish unless you pass `--no-wait`.

### Rows

```bash
ganju data rows menu --where 'price<30000' --where size=30cm --sort -price --limit 50
ganju data rows menu --search pizza --json
ganju data rows orders --include customer --all
ganju data get menu 12 [--include <relations>]
ganju data insert menu --input '{"name":"Margherita","price":28000}'
ganju data insert menu --input-file menu.jsonl
ganju data update menu 12 --input '{"stock":{"decrement":2}}' --version 3
ganju data delete orders 7 8 --yes
ganju data history orders 7
ganju data write --input-file ops.json  # {"operations":[...]}, all or nothing
```

`--where` takes `column=value` and `!=`, `>`, `>=`, `<`, `<=`, `~` (contains),
`^=` (starts with). `status=[open,done]` matches any of the values, and
`note=null` finds empty ones. On a text, phone, email, URL, enum or date column
the value is always text, so `phone=3001234567` works as typed; elsewhere,
quotes keep a value as text: `code="007"`. Repeat `--where` to require several
conditions, or pass the JSON `where` itself: `--where '{"price":{"lt":30000}}'`.
`--limit` is up to 500 a page; `--cursor` reads the next page and `--all`
reads every page.

`delete` shows what a cascade would also remove, and refuses when a restrict
blocks it.

### Import a file

```bash
# A CSV, Excel or JSONL file, matched to the columns the way the dashboard does
ganju data import menu menu.csv
ganju data import menu menu.xlsx --sheet Menu
ganju data import menu menu.csv --map 'Price (COP)=price'
ganju data import menu menu.csv --decimal-mark ,
ganju data import menu menu.csv --replace --yes --confirm menu
```

`import` matches headers to columns by name or label (`--map` points one at a
column), reads numbers like "28.000" (`--decimal-mark` says how the file writes
decimals when it's unclear), matches relations by the name the other table
shows, and puts the rows it refused, with why, in a CSV you can fix and import
again (`--out` names it). A `--replace` refused as a whole changes nothing and
writes the whole file back with each row to blame marked. A date and time in
the file without an offset is read in your computer's time zone.

### Named queries

```bash
ganju data queries                              # the saved queries and what they read
ganju data query save --input-file sales.json   # { name, description, sql, params, assistant }
ganju data run sales_by_dish --input '{"from":"2026-10-01T00:00:00-05:00","to":"2026-11-01T00:00:00-05:00"}'
ganju data query rm sales_by_dish --yes
```

`run` returns up to `--limit` rows (100 by default, 500 at most), with dates
and times in your computer's time zone.

### Schema as code

`ganju data schema pull` writes the database's tables, and its named queries
under `"queries"`, to `ganju.data.json`, in the same shape as an export's
`schema.json`. Edit it and review it like code. `ganju data schema diff` shows
what would change, and `ganju data schema push` applies it (`--schema <file>`
uses another file):

```bash
ganju data schema diff
+ create table orders (customer, status)
+ add column menu.notes long_text
~ change table menu: label "Menu"
- change menu.price: type "decimal" (copies the table) (needs --yes)
- drop column menu.code (needs --yes)
```

Tables and columns are matched by name, and new tables are created in an
order where every relation's target exists first. New tables and columns and
changed settings are applied straight away. Drops and type changes are listed
and applied only with `--yes`, after a restore point that undoes them. A rename
in the file reads as a drop and an add: rename with
`ganju data column rename` or `ganju data table rename` instead.

Each push is noted in the change log, so the project's Assistant warns that a
change made in the dashboard will be put back by the next push.

Triggers and schedules aren't in `ganju.data.json`: list them under
`"triggers"` in `ganju.json` and `ganju deploy` publishes them. See
[Deploy triggers with the CLI](/docs/data/triggers/#deploy-triggers-with-the-cli).

### Destructive commands

Anything that drops, deletes or rewrites data needs `--yes` (`-y`). Dropping
the database or a table also needs its name, typed with `--confirm`:

```bash
ganju data column rm menu code --yes
ganju data table rm orders --yes --confirm orders
ganju data drop --yes --confirm acme-support
ganju data restore                              # undo the delete, within 7 days
ganju data restore --at 2026-10-30T09:15:00-05:00 --yes
ganju data restore --bookmark <bookmark> --yes  # the undo a drop printed
```

`--at` takes an ISO time with its offset (or `Z` for UTC). In a terminal, a
missing flag is asked for. In a script, it is refused.

## Errors

Errors are JSON with a readable `error` and a `code`, and `details` when there
is more to say:

| Status | When |
| --- | --- |
| `400` | The request isn't valid. `errors` lists each field, with its `path` and `message` |
| `401` | No session or token |
| `402` | The organization's plan doesn't include Data |
| `403` | The token is for another project, you aren't allowed in the project, or the database is read-only after a downgrade |
| `404` | No database, table or row by that name |
| `409` | A stale `version`, a guard that changed nothing, a change below a column's minimum, a constraint (for example, rows still point at this one), a synced table's rows, a full database, or a table copy still running |
| `429` | Too many requests for this token |
