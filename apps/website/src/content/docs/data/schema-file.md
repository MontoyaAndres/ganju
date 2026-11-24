---
title: The schema file (ganju.data.json)
description: Every field of ganju.data.json, the file where the ganju data schema commands keep a project's tables, columns and named queries as code, with a full example.
order: 60
updated: 2026-11-24
---

`ganju.data.json` holds a project's database schema as code, beside the
functions in `ganju.json`. It goes through code review like any other change,
and the CLI applies it:

```bash
ganju data schema pull    # write the database's schema to ganju.data.json
ganju data schema diff    # what push would change
ganju data schema push    # apply the file (drops and type changes need --yes)
```

`pull` on an empty database writes `{ "tables": [] }`. Start from the example
below instead, then `diff` and `push`. `--schema <file>` reads another file.

## A full example

Two related tables (dishes, and orders that point at a dish) and one named
query:

```json
{
  "tables": [
    {
      "name": "menu",
      "label": "Menu",
      "description": "The dishes we sell, with price and stock.",
      "displayColumn": "name",
      "access": "read",
      "columns": [
        { "name": "name", "type": "text", "required": true, "unique": true, "searchable": true },
        { "name": "price", "type": "decimal", "required": true, "min": 0 },
        { "name": "stock", "type": "integer", "min": 0, "default": 0 },
        { "name": "category", "type": "enum", "values": ["pizza", "drink", "dessert"], "filterable": true }
      ]
    },
    {
      "name": "orders",
      "description": "Orders customers place on WhatsApp.",
      "access": "add",
      "customerScoped": true,
      "columns": [
        { "name": "dish", "type": "relation", "table": "menu", "onDelete": "restrict", "required": true },
        { "name": "quantity", "type": "integer", "required": true, "min": 1 },
        { "name": "customer_name", "type": "text", "personal": true },
        { "name": "phone", "type": "phone", "personal": true },
        { "name": "status", "type": "enum", "values": ["new", "ready", "delivered"], "default": "new", "filterable": true },
        { "name": "notes", "type": "long_text", "description": "Anything the customer asked for, in their words." }
      ]
    }
  ],
  "queries": [
    {
      "name": "orders_by_dish",
      "description": "Units ordered per dish between two dates.",
      "sql": "SELECT m.name AS dish, sum(o.quantity) AS units FROM orders o JOIN menu m ON m.id = o.dish WHERE o.created_at >= :from AND o.created_at < :to GROUP BY m.name",
      "params": [
        { "name": "from", "type": "datetime", "required": true },
        { "name": "to", "type": "datetime", "required": true }
      ]
    }
  ]
}
```

## Tables

| Field | Required | What it is |
| --- | --- | --- |
| `name` | yes | Lowercase letters, digits and `_`, starting with a letter, up to 63 characters. |
| `columns` | yes | At least one [column](#columns), up to 93. |
| `label` | no | Shown instead of the name, up to 100 characters. |
| `description` | no | What the table holds, up to 300 characters. The assistant reads it to know when to use the table, so write one. |
| `displayColumn` | no | The column a relation to this table shows ("Margherita" instead of #12). Left out, the first `text` column; `"id"` or `null` shows the id. |
| `access` | no | What channel bots may do with the table: `none`, `read` (the default), `add` (read and add) or `full`. Your MCP clients, functions, the CLI and the dashboard always see everything. See [Who sees what](/docs/data/#who-sees-what). |
| `customerScoped` | no | `true`: on channels, each customer sees only the rows their own conversation wrote. Default `false`. |
| `history` | no | Keep who changed each row and when, for 90 days. Default `true`. |
| `source` | no | Keep the rows in step with a spreadsheet in Resources: `{ "uri": "…", "sheet": "…", "key": "column" }`. See [Sync a table from a spreadsheet](/docs/data/sheet-sync/). |

A project holds up to 50 tables.

## Columns

| Field | Required | What it is |
| --- | --- | --- |
| `name` | yes | Same rule as a table name. `id`, `created_at`, `updated_at` and `version` are taken: every row has them already. |
| `type` | yes | `text`, `long_text`, `integer`, `decimal`, `boolean`, `date`, `datetime`, `enum`, `json`, `email`, `url`, `phone`, `relation` or `file`. What each holds is in [Tables and columns](/docs/data/#tables-and-columns). |
| `label` | no | Shown instead of the name, up to 100 characters. |
| `description` | no | What the column holds, up to 300 characters. |
| `required` | no | Every row must have a value. |
| `unique` | no | No two rows share a value. |
| `filterable` | no | Indexed, so filters and sorts on it stay fast. Relations and unique columns are indexed already. |
| `searchable` | no | Included in full-text search. |
| `personal` | no | Marks the column as holding personal data (a name, a phone). It's kept with the schema and shown by `ganju data tables`; nothing else acts on it yet. |
| `values` | for `enum` | The options, up to 100. |
| `table` | for `relation` | The table it points at. |
| `onDelete` | no, `relation` only | What deleting the row it points at does: `restrict` (refuse the delete, the default), `cascade` (delete these rows too) or `set_null` (clear the column, not allowed on a required column). |
| `min` | no, numbers only | The lowest value an `integer` or `decimal` may hold. |
| `default` | no | Used when a new row leaves the column empty: a string, number, boolean or `null`. |

Flags left out are `false`.

## Named queries

`queries` is optional. Left out of the file, `push` leaves the database's
queries alone; listed, it makes them match the list. Each one:

| Field | Required | What it is |
| --- | --- | --- |
| `name` | yes | Same rule as a table name. |
| `sql` | yes | One `SELECT` (or `WITH … SELECT`) over your tables, up to 10,000 characters, with parameters like `:from`. |
| `description` | no | What it answers, up to 300 characters. |
| `params` | no | Up to 20, each `{ "name", "type", "description"?, "required"? }`. `type` is `text`, `integer`, `decimal`, `boolean`, `date` or `datetime`. |
| `assistant` | no | `true` lets channel bots run it from `data-query`. |

More in [Named queries](/docs/data/#named-queries).

## What's not in this file

Triggers and schedules go in `ganju.json`'s `triggers`, deployed with
`ganju deploy`: see [Triggers](/docs/data/triggers/) and
[Schedules](/docs/data/schedules/). Rows aren't part of the schema; load them
with `ganju data import`.
