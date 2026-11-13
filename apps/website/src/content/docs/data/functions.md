---
title: Data from functions
description: Read and write the project's database from your own functions with ctx.data, message customers and staff chats with ctx.channels, and keep a function for triggers and schedules only.
order: 56
updated: 2026-11-13
---

Your [functions](/docs/tools/functions/) reach the project's
[database](/docs/data/) through `ctx.data`. Every call goes through the
platform, under the same rules as the dashboard and the assistant: a row below
a column's minimum is refused, a write that must all happen either does or
doesn't, and each change is recorded as the function that made it.

There is no SQL from a function. For a report the filters can't express, save a
[named query](/docs/data/#named-queries) and run it by name.

## `ctx.data`

| Call | What it does |
| --- | --- |
| `describe(table?)` | Tables, columns, row counts and descriptions; one table when named |
| `query({ table, where, search, sort, limit, cursor, include, aggregate, groupBy })` | Find rows, or count, sum and average them |
| `search(table, text, options?)` | Full-text search over a table's searchable columns, best matches first |
| `insert(table, values)` | One row; returns `{ id }`. Pass a list of rows (up to 500) to add several; returns `{ ids }` |
| `update(table, idOrWhere, set, { where?, expect? })` | Change one row by id, or the rows a filter matches; returns `{ changed }` |
| `delete(table, idOrWhere, { where?, expect? })` | Delete them; returns `{ changed }` |
| `write(operations)` | Up to 50 inserts, updates and deletes, applied together or not at all |
| `run(name, params?, { limit? })` | A named query, by name; returns `{ query, rows, truncated? }` |

### Filters

`where` uses the same filters as the Data API and the assistant:

```ts
{ status: 'open' }                              // equals
{ price: { lt: 30000 } }                        // eq, ne, gt, gte, lt, lte
{ status: { in: ['open', 'ready'] } }           // in, notIn (up to 50 values)
{ name: { contains: 'pizza' } }                 // contains, startsWith (any case)
{ note: { isNull: true } }                      // empty, or not
{ 'customer.name': 'Ana' }                      // a column of the related row
{ or: [{ status: 'open' }, { total: { gte: 100000 } }] }
```

Several keys must all hold; `or` matches any of its filters, and `and` groups
them. A date and time without an offset is read in the database's
[time zone](/docs/data/#time-zone).

### Reading rows

```ts
const { rows, nextCursor } = await ctx.data.query({
  table: 'orders',
  where: { status: 'open' },
  sort: ['-created_at'],
  include: ['customer'],
  limit: 50
});
```

- A page has 20 rows by default, up to 500 (or 1 MB). Pass `nextCursor` back as
  `cursor` to read the next one.
- `sort` is a list of up to 3 columns; `-` in front sorts descending.
- A relation column comes back as `{ id, label }`, and `include` brings the
  whole related row instead.
- A file column comes back as `{ uri, title, mimeType }`, or `{ uri, missing:
  true }` when the file was deleted from Resources. Read the file with
  `ctx.resources.read(uri)`; write the column with the uri.
- Dates and times come back in the database's time zone, with their offset.

To count or add up instead of listing, pass `aggregate`, and `groupBy` (up to
3 columns) for one result per group:

```ts
const { groups } = await ctx.data.query({
  table: 'orders',
  where: { created_at: { gte: '2026-11-01T00:00:00-05:00' } },
  aggregate: [{ fn: 'count' }, { fn: 'sum', column: 'total' }],
  groupBy: ['status']
});
```

`fn` is `count`, `sum`, `avg`, `min` or `max`. `times` multiplies before adding
up: `{ fn: 'sum', column: 'stock', times: 'unit_cost' }` is the value of the
stock.

### Writing rows

```ts
const { id } = await ctx.data.insert('orders', { customer: 7, status: 'open' });
await ctx.data.update('menu', 12, { stock: { decrement: 2 } }, { where: { stock: { gte: 2 } } });
await ctx.data.delete('orders', { status: 'cancelled' });
```

A number can change relative to itself with `{ increment: n }` or
`{ decrement: n }`. `where` in the options is a guard that must hold, and
`expect` says how many rows must change; when either fails, nothing is written
and the call throws.

A refused call throws, with a message written for a person: "menu.stock can't
go below 0".

## Write an order in one step

From the [data-orders example](https://github.com/MontoyaAndres/ganju/tree/main/examples/data-orders):
the order, a line per dish pointing at it, and the stock taken down, in one
`write`. `{ $ref: 0 }` is the id the first insert created. Each stock change
carries a guard, so two customers ordering the last pizza can't both get it:
the second write fails whole, and nothing of it is saved.

```ts
import { defineTool } from '@ganju/sdk';

export default defineTool<{ dish: number; quantity: number }>(
  async (input, ctx) => {
    const { results } = await ctx.data.write([
      { op: 'insert', table: 'orders', values: { status: 'open' } },
      {
        op: 'insert',
        table: 'order_lines',
        values: { order: { $ref: 0 }, dish: input.dish, quantity: input.quantity }
      },
      {
        op: 'update',
        table: 'menu',
        id: input.dish,
        set: { stock: { decrement: input.quantity } },
        where: { stock: { gte: input.quantity } }
      }
    ]);
    return { order: (results[0] as { id: number }).id };
  }
);
```

Each result says what its step did: `{ op: 'insert', table, id }` (or `ids`
for several rows) and `{ op: 'update' | 'delete', table, changed }`.

## What a function may touch

Left alone, a function can read and write every table. Narrow it with `data` on
the tool in `ganju.json`:

```json
{
  "name": "sales-report",
  "entry": "src/salesReport.ts",
  "data": { "access": "read", "tables": ["menu", "orders", "order_lines"] }
}
```

- `access`: `read` or `write`.
- `tables`: the only tables it sees. The others don't exist for it, in filters
  and relations too.

The platform enforces this, not your script. Use it for any function a channel
bot calls after reading what a customer wrote. `tables` limits what the
function names, not what the schema does: deleting a row still deletes the rows
that point at it with "delete these rows too", in tables outside the list as
well.

**A function sees every row, including in tables where each customer sees only
their own.** When a channel bot calls a function, the call doesn't say which
customer is talking, and anything about the customer in its input came from the
model. Don't treat it as who they are.

Changes a function makes are recorded as `function:<name>` in the row's
history.

## `ctx.channels`

Message the project's customers and staff chats. Messages go out as the bot,
as plain text, and are recorded on the conversation, so the bot's next turn
knows what the customer was told. They aren't billed as assistant replies.

A function only gets `ctx.channels` when it asks for it: set `"channels": true`
on it in `ganju.json`, or turn on **Can message through channels** in its
dialog on the Functions tab. Without it, every call throws "… can't use
ctx.channels". `ganju deploy` lists the functions that have it. Versions
published before this setting existed keep `ctx.channels`; add it to
`ganju.json` before you deploy them again.

```json
{
  "name": "tell-customer",
  "entry": "src/tellCustomer.ts",
  "channels": true
}
```

```ts
// A customer the bot has spoken with, in their private chat
await ctx.channels.send({
  participantId: order.participant_id,
  text: `Your order #${order.id} is ready.`
});

// A chat the bot is in: a Telegram group, or a Slack or Discord channel
await ctx.channels.post({
  channelId: await ctx.secret('KITCHEN_CHANNEL_ID'),
  chatId: await ctx.secret('KITCHEN_CHAT_ID'),
  text: 'New order #42: 2× Margherita'
});
```

- **`send`** writes to the customer's latest private conversation, on the
  channel they used. The channel's daily limit per customer applies. A row in a
  table where each customer sees only their own rows carries the customer as
  `participant_id`. It returns `{ messageId, conversationId, channelId,
  platform, sent }`, where `sent` is `text` or `template`.
- **WhatsApp** only takes free text within 24 hours of the customer's last
  message. After that only a template Meta approved reaches them; pass it as
  `template: { name, language, params }`, with one value per variable. Give
  both `text` and `template` and Ganju picks per customer. Without a template,
  `send` throws: "Outside WhatsApp's 24-hour window … use an approved
  template." When it can read the account's templates, Ganju checks the
  template is approved before calling Meta, and
  throws with Meta's reason when it is in review, rejected, paused or
  disabled. Meta bills template messages to your own WhatsApp account.
  Telegram, Slack and Discord have no window and take the text.
- **`templates()`** lists the templates Meta approved on the project's
  WhatsApp channels that Ganju can send, each with its `channelId`, `name`,
  `language`, `category`, `text` and `variables` (`{ n, label, example }`), so
  a function can choose one. Templates are created in the channel's
  [Message templates](/docs/channels/whatsapp/#5-message-templates).
- **`post`** takes the channel's id from the dashboard and the platform's chat
  id, such as a Telegram group's `-1001234567890`. It doesn't post to
  WhatsApp.

## Functions only triggers run

A function a [trigger](/docs/data/triggers/) or a
[schedule](/docs/data/schedules/) runs — tell the kitchen, message the
customer, send the nightly report — shouldn't be a tool the assistant can call.
Set `"expose": false` on it in `ganju.json`, or turn off **Assistant can use
this function** in its dialog on the Functions tab:

```json
{
  "name": "tell-customer",
  "entry": "src/tellCustomer.ts",
  "expose": false,
  "channels": true,
  "data": { "access": "read", "tables": ["orders"] }
}
```

It is still deployed, and shows a **Triggers only** tag. The assistant never
sees it, on channels or MCP clients, and it doesn't count toward the project's
tool limit.

A trigger calls it with the event instead of the model's arguments:

```ts
import { defineTool, type TriggerEvent } from '@ganju/sdk';

export default defineTool<TriggerEvent>(async (event, ctx) => {
  const order = event.row;
  if (typeof order?.participant_id !== 'string') return { skipped: 'no customer' };
  const sent = await ctx.channels.send({
    participantId: order.participant_id,
    text: `Your order #${order.id} is ready. Thank you!`
  });
  return { sent: sent.sent };
});
```

| Field | What it is |
| --- | --- |
| `event` | `insert`, `update`, `delete`, `time` (a [time trigger](/docs/data/triggers/#time-triggers)'s row came due) or `schedule` |
| `table` | The table's name; empty on `schedule` |
| `row` | The row after the change; `null` on delete and on `schedule`. On `time`, the row as it was when it came due |
| `previous` | The row before the change; `null` on insert, `time` and `schedule` |
| `actor` | Who made the change: `channel:<customer>`, `user:<id>`, `function:<name>`…; `null` on `time` |
| `eventId` | The same on every delivery of this event. Use it to skip a repeat |
| `triggerId` | The trigger that ran it |
| `dueAt` | On `time` and `schedule`: when it came due (ISO 8601, UTC) |
| `truncated`, `rowId` | Set when the row was too large to send. Read it with `ctx.data.query({ table, where: { id: rowId } })` |
| `date` | On `schedule`: the run's date in the database's time zone (`YYYY-MM-DD`) |
| `query`, `rows`, `rowCount` | On `schedule` with a query: its name, its rows (up to 200) and how many it returned (counted up to 500) |
| `rowsTruncated`, `rowCountMore` | On `schedule`: some rows were left out for size; there were more rows than counted |

A schedule's function gets the rows straight away:

```ts
export default defineTool<TriggerEvent>(async (event, ctx) => {
  const total = (event.rows ?? []).reduce((sum, r) => sum + Number(r.total ?? 0), 0);
  await ctx.channels.post({
    channelId: await ctx.secret('KITCHEN_CHANNEL_ID'),
    chatId: await ctx.secret('KITCHEN_CHAT_ID'),
    text: `${event.date}: ${event.rowCount ?? 0} orders, ${total} in sales`
  });
});
```

The row is content a customer may have written. Pass it to an AI model as
untrusted text, never as instructions.

Writes a triggered function makes are recorded as that trigger, never fire
that same trigger again, and can fire other triggers one level deeper. See
[Triggers and webhooks](/docs/data/triggers/#loops-and-chains).

## Usage

Every `ctx.data` call counts as one database request on the billing page's
**Data** block, with the rows it read and wrote. A function a trigger or a
schedule runs counts as a custom tool call, like one the assistant calls.
