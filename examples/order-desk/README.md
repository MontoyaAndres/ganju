# order-desk

A support desk for a small store. An assistant can look up an order, leave an
internal note on it, and refund it — and it asks the person before the refund,
without a word about confirming in the code or the descriptions.

| Tool | What it does | Annotations |
| --- | --- | --- |
| `order-lookup` | Status, items, total, refunds and notes for one order | `readOnlyHint: true` |
| `order-add-note` | Adds an internal note, visible to staff only | `destructiveHint: false` |
| `order-refund` | Refunds an order in full or in part | `destructiveHint: true` |

## What it shows

- **Annotations, one tool per kind.** They are the same three answers the
  dashboard's function dialog asks for under *What it does*: only reads, changes
  things that can be undone, or sends, deletes, charges or can't be undone.
- **Confirmation done by the platform.** Turn on **Confirm sensitive actions**
  (Settings → Organization) and `order-refund` asks before it runs, everywhere:
  - In a **channel** (Telegram, WhatsApp, Slack, Discord), the bot holds the
    call, asks in the chat, and shows under its question exactly what a yes
    runs. Only a yes from the same person, within 30 minutes, runs that stored
    call.
  - In an **MCP client** (Claude, Cursor), the first call comes back *not run
    yet* with a one-time token. The assistant asks, and on a yes calls again
    with the token, which only works for those exact arguments, once, within
    10 minutes.

  `order-lookup` and `order-add-note` run straight away. A tool with no
  annotations would be asked about on every call, lookups included.
- **No "confirm first" in any description.** The platform asks, and a model
  told to ask as well asks twice.
- **Descriptions the linter accepts.** `ganju build --strict` passes: each says
  when to use the tool, every input is described, and every tool is annotated.
- **Errors the model can pass on.** A refund on an order that hasn't shipped,
  over what's left, or on an unknown order number says why and what to do.

The orders are sample data in `src/lib/orders.ts`: A-1001 (delivered), A-1002
(shipped), A-1003 (processing) and A-1004 (cancelled). Notes and refunds are
saved on the project as one JSON resource per order under
`resource://orders/<id>`, so nothing needs connecting. To use a real store,
replace `loadOrder` and `saveOrder` with its API and list its host in
`allowedHosts`.

## Run it

```bash
ganju link
ganju build --strict
ganju test order-lookup --input '{"orderId":"A-1001"}'
ganju test order-add-note --input '{"orderId":"A-1001","note":"One mug arrived chipped"}'
ganju deploy
```

Then turn on **Confirm sensitive actions**, and ask your assistant *"Order
A-1001 arrived with a chipped mug, can you refund that mug?"* It looks the order
up, then asks you before refunding 14 USD.

`ganju test` runs a tool directly and doesn't ask, so
`ganju test order-refund --input '{"orderId":"A-1002","reason":"test"}'`
records a real refund on the sample order. Remove the order's record from the
project's Resources to start over.

## Files

```
ganju.json            three tools, one per kind of effect, resourceAccess: "own"
src/orderLookup.ts    order-lookup
src/orderAddNote.ts   order-add-note
src/orderRefund.ts    order-refund
src/lib/orders.ts     sample orders, and where notes and refunds are saved
```
