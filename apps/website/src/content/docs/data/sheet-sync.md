---
title: Sync a table from a spreadsheet
description: Keep a table's rows in step with a Google Sheet, an Excel file or a CSV in Resources — matched by a key column, read again whenever the file changes, read-only everywhere else.
order: 58
updated: 2026-11-06
---

Many businesses already keep the menu, the prices or the stock in a
spreadsheet. A table **synced from a spreadsheet** keeps those rows in step
with it, so nobody types them twice: change a price in the sheet, and the row
in Ganju changes too.

The source is any spreadsheet or CSV in [Resources](/docs/resources/): a
Google Sheet imported from Drive, an Excel file from OneDrive, or a CSV or
`.xlsx` you uploaded. The sync goes one way: **the sheet wins**.

## Set it up

1. Make sure the table has a **unique** column that names the same row in the
   sheet and in the table, such as `sku` or `name`. That is the **key**.
2. Open the table on the **Data** page, go to its **Schema** tab, and under
   **Source: spreadsheet** click **Sync from a spreadsheet**.
3. Pick the file, the sheet (empty for the first one) and the key column, and
   click **Start syncing**.

The first sync runs right away. It makes the table what the sheet says, so
**rows whose key isn't in the sheet are deleted**.

The sheet's first row holds the headers. Each header is matched to a column by
its name or its label, the way an [import](/docs/data/#tables-and-columns)
matches them: `Precio` fills `price` when `price` is labelled "Precio".
Headers that match no column are ignored, and so are columns the sheet
doesn't have. Cells are read the way an import reads them: dates, numbers
such as `28.000`, `sí` / `no`, and a relation by the related row's display
value.

## When it syncs

- **When the file changes.** A Drive or OneDrive file is checked on its own
  [sync interval](/docs/resources/#import-from-google-drive-or-onedrive), and read again only when it changed. An
  uploaded file syncs when you replace it.
- **When you ask.** **Sync now**, on the table's Rows tab or under its source,
  fetches a Drive or OneDrive file again if it changed, then reads it. The
  **Sync now** of the item in Resources does the same.

Each sync, in one go:

- inserts the lines whose key is new,
- updates the rows whose values differ from their line,
- deletes the rows whose key is no longer in the sheet.

Rows that didn't change aren't written: they keep their version and get no
[history](/docs/data/#restore-and-download) entry. The changes are made by
`system:sheet-sync`, which is what row history shows, and they fire the
table's [triggers](/docs/data/triggers/): a price or stock change in the sheet
can still notify someone.

## Read-only while it syncs

A synced table's rows change only in the sheet. Adding, changing or deleting a
row is refused from everywhere, the dashboard, the API, the CLI, functions and
the assistant, with a message such as:

```
menu is synced from "Menú.xlsx"; change the sheet, or stop syncing it.
```

You can still change the table's columns and settings. The key column can't
be dropped, and it stays unique. **Stop syncing**, under the source, leaves the
rows as they are and makes them editable again.

## When a sync is refused

A sheet that doesn't fit is refused whole, and the table keeps its rows as
they were:

- the sheet has no column for the key, or for a required column;
- a key is empty, or appears on two lines;
- a value doesn't fit its column (text in a number column, a number below the
  column's minimum, an option that isn't in the list);
- a line deleted from the sheet is still pointed at by another table's rows.

The reason shows on the table's Rows tab and under its source, with the line
it was found on, and in **Tool health** on the project's overview. Fix the
sheet, then click **Sync now** or wait for the next change.

## Limits

- One file of up to **5 MB**, and up to **20,000** lines.
- One source per table; several tables may sync from the same file, each from
  its own sheet.
- A synced table can't be [customer-scoped](/docs/data/#who-sees-what): its
  rows come from the sheet, with no customer, so the bots wouldn't see them.
- A delete in another table that would cascade into a synced table's rows, or
  clear a relation in them, is refused; change the sheet first.

## From the API, the CLI and ganju.data.json

A table's `source` is a table setting:

```json
{
  "name": "menu",
  "source": { "uri": "gdrive://files/1AbC…", "sheet": "Precios", "key": "sku" },
  "columns": [
    { "name": "sku", "type": "text", "required": true, "unique": true },
    { "name": "name", "type": "text", "required": true },
    { "name": "price", "type": "integer", "min": 0 }
  ]
}
```

- `PATCH …/table/menu` with `{ "source": { … } }` starts syncing, and
  `{ "source": null }` stops it. `POST …/table/menu/sync` is **Sync now**.
  Each table answers with `sync`: when the last sync ran, `ok` or `failed`,
  what it inserted, updated and deleted, and why it was refused. See the
  [Data API](/docs/data-api/#change-the-tables).
- In `ganju.data.json`, `ganju data schema push` sets or removes it like any
  other setting, and `ganju data schema pull` writes it out.
  `ganju data tables` shows where each synced table comes from and how its last
  sync went; `ganju data table sync menu` is **Sync now**.
- The assistant's `data-admin` tool can stop a sync, but setting one is done
  from the dashboard, the API or the CLI, where the file is checked.
