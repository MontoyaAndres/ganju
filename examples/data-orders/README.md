# data-orders

A restaurant's order desk on the project's own database. Orders, their lines
and the stock they use are rows in Data, not a spreadsheet, so the dashboard,
the assistant and these functions all read the same numbers.

| Tool | What it does | `data` |
| --- | --- | --- |
| `place-order` | Saves an order and its lines and takes the dishes out of stock, all or nothing | `access: write`, three tables |
| `sales-report` | Units and revenue per dish for a period, from a saved query | `access: read` |
| `notify-kitchen` | Posts each new order to the staff's group; run by a trigger only | `access: write`, three tables |
| `tell-customer` | Tells the customer their order is ready; run by a trigger only | `access: read`, `orders` |

## What it shows

- **`ctx.data`, with no setup.** Every function of a project with a database
  gets it. Calls go through the platform under the same rules as the Data API,
  and writes are recorded as `function:place-order` in each row's history.
- **One write for one order.** `ctx.data.write` applies the order, its lines
  and each stock decrement together. Each decrement has a guard (`stock >=
  quantity`); if one dish is short the whole order is refused with how many are
  left, and nothing is half-saved.
- **A saved query instead of SQL.** `sales_by_dish`, in `ganju.data.json`
  beside the tables, is a `SELECT` with `:from` and `:to`, checked when saved to
  only read. `ctx.data.run` runs it by name.
- **Narrowing a function.** `data` in `ganju.json` limits what a function may
  do. `sales-report` can only read; `place-order` reaches only its three
  tables. The platform enforces it, so it holds whatever the code does with
  the model's input.

## Triggers

`"triggers"` in `ganju.json` runs a function when rows change, and `ganju
deploy` deploys them with the functions:

- **A new order** runs `notify-kitchen`, which posts "New order #42: 2×
  Margherita" to the staff's Telegram group with `ctx.channels.post`.
- **An order that becomes `ready`** runs `tell-customer`, which messages the
  customer with `ctx.channels.send`. `changedTo` fires on the change only:
  editing the address of an order that is already ready doesn't message them
  again. The message is recorded on their conversation, so the bot's next
  turn knows they were told.

Both have `"expose": false`: deployed for triggers, never offered to the
assistant, and not counted toward its tools. A trigger runs a function at
least once, so `notify-kitchen` keeps the event's id on the order and skips a
repeat; its own write to the order is recorded as the trigger and never fires
it again. The row is what the customer wrote: pass it to a model as untrusted
text.

## Who the customer is

A function a bot calls isn't told which customer is talking, and `ctx.data`
sees every customer's rows. `place-order` is an order desk for the owner's own
assistant: the customer's name and phone are whatever the model passes in, and
the order has no customer to message. On a customer-facing bot the bot takes
the order itself with `data-write`: `orders` is customer-scoped, so each order
carries the customer it came from (`participant_id`), which is who
`tell-customer` messages. Taking dishes out of stock from the bot needs
`access: "full"` on `menu`.

## Run it

```bash
ganju link
ganju data create
ganju data schema push --schema ganju.data.json
ganju data insert menu --input '[{"name":"Margherita","price":28000,"stock":10},{"name":"Hawaiana","price":30000,"stock":2}]'
ganju build --strict
ganju test place-order --input '{"customer":"Ana","items":[{"dish":"Margherita","quantity":2}]}'
ganju secret set KITCHEN_CHANNEL_ID <the Telegram channel's id from the dashboard>
ganju secret set KITCHEN_CHAT_ID <the staff group's chat id, e.g. -1001234567890>
ganju deploy
```

Ask your assistant *"Two Hawaianas and one Margherita for Ana, 3001234567"*,
then *"and three more Hawaianas"*: the second is refused, since two were left.
`ganju data run sales_by_dish --input '{"from":"2026-10-01T00:00:00-05:00","to":"2026-11-01T00:00:00-05:00"}'`
shows the same report as `sales-report`.
