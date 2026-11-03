---
title: Data from functions
description: Read and write the project's database from your own functions with ctx.data, message customers and staff chats with ctx.channels, and keep a function for triggers only.
order: 56
updated: 2026-11-03
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
| `insert(table, values)` | One row; returns `{ id }`. Pass a list of rows to add several; returns `{ ids }` |
| `update(table, idOrWhere, set, { where?, expect? })` | Change one row by id, or the rows a filter matches |
| `delete(table, idOrWhere, { where?, expect? })` | Delete them |
| `write(operations)` | Several inserts, updates and deletes, applied together or not at all |
| `run(name, params?, { limit? })` | A named query, by name |

`where` uses the same filters as the Data API: `{ status: "open" }`,
`{ price: { lt: 30000 } }`, `{ name: { contains: "pizza" } }`, combined with
`or`. A page has up to 500 rows; `nextCursor` reads the next one. A relation
column comes back as `{ id, label }`, and `include` brings the whole related
row.

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
  `participant_id`.
- **WhatsApp** only takes free text within 24 hours of the customer's last
  message. After that only a template Meta approved reaches them; pass it as
  `template: { name, language, params }`. Give both `text` and `template` and
  Ganju picks per customer. Without a template, `send` throws: "Outside
  WhatsApp's 24-hour window … use an approved template." Meta bills template
  messages to your own WhatsApp account.
- **`post`** takes the channel's id from the dashboard and the platform's chat
  id, such as a Telegram group's `-1001234567890`. It doesn't post to
  WhatsApp.

## Functions only triggers run

A function a [trigger](/docs/data/triggers/) runs — tell the kitchen, message
the customer — shouldn't be a tool the assistant can call. Set `"expose": false`
on it in `ganju.json`, or turn off **Assistant can use this function** in its
dialog on the Functions tab:

```json
{
  "name": "tell-customer",
  "entry": "src/tellCustomer.ts",
  "expose": false,
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
| `event` | `insert`, `update` or `delete` |
| `table` | The table's name |
| `row` | The row after the change; `null` on delete |
| `previous` | The row before the change; `null` on insert |
| `actor` | Who made the change: `channel:<customer>`, `user:<id>`, `function:<name>`… |
| `eventId` | The same on every delivery of this event. Use it to skip a repeat |
| `triggerId` | The trigger that ran it |
| `truncated`, `rowId` | Set when the row was too large to send. Read it with `ctx.data.query({ table, where: { id: rowId } })` |

Writes a triggered function makes are recorded as that trigger, never fire
that same trigger again, and can fire other triggers one level deeper. See
[Triggers and webhooks](/docs/data/triggers/#loops-and-chains).

## Usage

Every `ctx.data` call counts as one database request on the billing page's
**Data** block, with the rows it read and wrote. A function a trigger runs
counts as a custom tool call, like one the assistant calls.
