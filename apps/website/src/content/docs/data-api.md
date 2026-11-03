---
title: Data API
description: Manage a project's tables and rows over HTTP — create tables, insert and search rows, write orders safely, and export — with a personal access token.
order: 7
updated: 2026-11-03
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
ganju token create "orders sync" --expires 90
```

```bash
export GANJU_TOKEN=ganju_pat_...
export DATA=https://api.ganju.ai/organization/<organizationId>/project/<projectId>/artifact/data
curl -H "Authorization: Bearer $GANJU_TOKEN" $DATA
```

A token only reaches the project it was made for. Each token can make 120
requests a minute to each route. Past that, the API answers `429`: wait a minute
and try again.

## Create the database and a table

```bash
curl -X POST -H "Authorization: Bearer $GANJU_TOKEN" $DATA

curl -X POST -H "Authorization: Bearer $GANJU_TOKEN" -H "Content-Type: application/json" \
  $DATA/table -d '{
    "name": "menu",
    "displayColumn": "name",
    "columns": [
      { "name": "name",  "type": "text",    "required": true, "searchable": true },
      { "name": "price", "type": "integer", "min": 0 },
      { "name": "stock", "type": "integer", "min": 0, "default": 0 },
      { "name": "size",  "type": "enum",    "values": ["30cm", "40cm"] }
    ]
  }'
```

Column types are `text`, `long_text`, `integer`, `decimal`, `boolean`, `date`,
`datetime`, `enum`, `json`, `email`, `url`, `phone`, `relation` and `file`. A
`relation` names the table it points at and what deleting that row does
(`restrict`, `cascade` or `set_null`).

Every row also has `id`, `created_at`, `updated_at` and `version`. The database
sets these; you never send them.

## Insert, read and search rows

```bash
# One row, or up to 500 at once with "rows"
curl -X POST ... $DATA/table/menu/row -d '{ "values": { "name": "Margherita", "price": 28000, "stock": 10 } }'
curl -X POST ... $DATA/table/menu/row -d '{ "rows": [{ "name": "Hawaiian" }, { "name": "Pepperoni" }] }'

# Filter, sort, search and page
curl ... "$DATA/table/menu/row?where=%7B%22price%22%3A%7B%22lt%22%3A30000%7D%7D&sort=-price&limit=50"
curl ... "$DATA/table/menu/row?q=pizza"
```

- **`where`** is JSON: `{"status":"open"}`, `{"price":{"lt":30000}}`,
  `{"name":{"contains":"pizza"}}`, combined with `and` / `or`.
- **`sort`** is a list of columns. Put `-` in front of a column to sort
  descending: `-created_at,name`.
- **`q`** searches the columns marked `searchable`, best matches first.
- **`include`** brings in related rows: `include=customer`.
- A page has up to 500 rows (1 MB). When there are more, the answer has
  `nextCursor`; send it back as `cursor` to read the next page.

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
curl -X DELETE ... $DATA/table/menu/row/12 -d '{ "version": 4 }'
```

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

`POST /write` takes a list of inserts, updates and deletes across tables. They
all apply together, or none of them do. A later step can use the id of an
earlier insert as `{ "$ref": <step> }`, in its values or as the `id` of the row
it updates or deletes. An update can change a number relative to itself, with a
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

If two customers order the last pizza at the same time, one order goes through.
The other gets a 409 ("changed 0 rows, expected 1"), and none of its steps are
written.

## Change the tables

| Route | What it does |
| --- | --- |
| `GET /table` | Tables, columns and relations |
| `POST /table` | Create a table |
| `PATCH /table/:table` | Rename it, change its label, description or settings |
| `DELETE /table/:table` | Drop it. Send `{ "confirmName": "<table>" }` |
| `POST /table/:table/column` | Add a column |
| `PATCH /table/:table/column/:column` | Rename or change a column, including its type |
| `DELETE /table/:table/column/:column` | Drop a column |
| `GET /change` | The log of these changes: who, what, when |

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
  days, with who made it. A change made with a token is shown as
  `cli:<token id>`.
- **`POST /checkpoint`**: a restore point at this exact moment. It answers
  with a `bookmark`; take one before a large change, such as replacing a
  table's rows, to undo exactly that change later.
- **`POST /restore-point`**: put the whole database back as it was at a time in
  the last 30 days (`{ "timestamp": "2026-10-20T15:00:00-05:00" }`), or at the
  `bookmark` a checkpoint, a dropped table or column, a type change or an
  earlier restore answered with. The answer has an `undoBookmark` that undoes
  the restore.
- **`POST /export`**: start a copy of the database: one JSONL or CSV file per
  table, plus `schema.json`. Poll `GET /export` until its `status` is `done`,
  then download each file with
  `GET /export/file?exportId=<id>&table=<table>`. Leave out `table` to get
  `schema.json`. Exports also work during the 7 days after you delete the
  database.

## Named queries and triggers

| Route | What it does |
| --- | --- |
| `GET /query` | Named queries |
| `POST /query` | Save one: `{ "name", "description", "sql", "params", "assistant" }` |
| `DELETE /query/:name` | Delete one |
| `POST /query/:name/run` | Run one: `{ "params": { "from": "2026-10-01T00:00:00-05:00" } }` |
| `GET /trigger` | Triggers |
| `POST /trigger` | Save one, by name |
| `PATCH /trigger/:name` | Turn it on or off: `{ "enabled": false }` |
| `DELETE /trigger/:name` | Delete one |
| `POST /trigger/deploy` | Replace the triggers a CLI deploy made: `{ "triggers": [...] }` |
| `GET /trigger/:name/run` | Its recent runs |
| `POST /trigger/:name/run/:runId/retry` | Send a failed or skipped run again |

See [Named queries](/docs/data/#named-queries) and
[Triggers and webhooks](/docs/data/triggers/) for what they take.

## From the command line

The CLI's `ganju data` commands call these same routes, for the project in
`ganju.json`. Install it with `npm install -g @ganju/cli`, then `ganju login`
and `ganju link`. On a machine with no browser, set `GANJU_API_TOKEN` to a
personal access token instead: the CLI's writes are then recorded as
`cli:<token id>`, and waits out a `429` on its own.

```bash
ganju data create
ganju data info
ganju data tables

# Rows: filter, sort, search, page
ganju data rows menu --where 'price<30000' --where size=30cm --sort -price --limit 50
ganju data rows menu --search pizza --json
ganju data get menu 12
ganju data insert menu --input '{"name":"Margherita","price":28000}'
ganju data insert menu --input-file menu.jsonl
ganju data update menu 12 --input '{"stock":{"decrement":2}}' --version 3
ganju data delete orders 7 --yes

# A CSV or JSONL file, matched to the columns the way the dashboard does
ganju data import menu menu.csv
ganju data import menu menu.csv --map 'Price (COP)=price'
ganju data import menu menu.csv --replace --yes --confirm menu
```

`--where` takes `column=value` and `!=`, `>`, `>=`, `<`, `<=`, `~` (contains),
`^=` (starts with). `status=[open,done]` matches any of the values, and
`note=null` finds empty ones. On a text, phone, email, URL, enum or date column
the value is always text, so `phone=3001234567` works as typed; elsewhere,
quotes keep a value as text: `code="007"`. Repeat `--where` to require several
conditions, or pass the JSON `where` itself.

`delete` shows what a cascade would also remove, and refuses when a restrict
blocks it. `import` reads numbers like "28.000", matches relations by the name
the other table shows, and puts the rows it refused, with why, in a CSV you
can fix and import again.

### Schema as code

`ganju data schema pull` writes the database's tables to `ganju.data.json`, in
the same shape as an export's `schema.json`. Edit it and review it like code.
`ganju data schema diff` shows what would change, and `ganju data schema push`
applies it:

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

### Destructive commands

Anything that drops, deletes or rewrites data needs `--yes`. Dropping the
database or a table also needs its name, typed with `--confirm`:

```bash
ganju data table rm orders --yes --confirm orders
ganju data drop --yes --confirm acme-support
ganju data restore                              # undo the delete, within 7 days
ganju data restore --at 2026-10-30T09:15:00-05:00 --yes
ganju data restore --bookmark <bookmark> --yes  # the undo a drop printed
ganju data export --format csv --out backup/
```

In a terminal, a missing flag is asked for. In a script, it is refused.

## Errors

Errors are JSON with a readable `error` and a `code`:

| Status | When |
| --- | --- |
| `400` | The request isn't valid. `errors` lists each field |
| `402` | The organization's plan doesn't include Data |
| `403` | The token is for another project, or the database is read-only after a downgrade |
| `404` | No database, table or row by that name |
| `409` | A stale `version`, a guard that changed nothing, a change below a column's minimum, a constraint (for example, rows still point at this one), a full database, or a table copy still running |
| `429` | Too many requests for this token |
