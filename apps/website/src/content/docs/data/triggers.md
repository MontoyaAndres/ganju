---
title: Triggers and webhooks
description: Run something when a table's rows change or a set time after a row's date — a function, a signed webhook, a chat message, an email or a message to the customer — and how testing, delivery, retries and webhook signatures work.
order: 57
updated: 2026-11-13
---

A **trigger** is a rule on a table: when a row is added, changed or deleted,
and a condition holds, Ganju runs one action. A new order posts to the
kitchen's group; an order that becomes `ready` messages the customer; every
change to `bookings` reaches your own system as a webhook.

Triggers fire for every write, wherever it came from: the assistant on a
channel, the dashboard, the CLI, the API, a function or a
[spreadsheet sync](/docs/data/sheet-sync/). A write that is undone (because a
guard failed, say) fires nothing.

A [time trigger](#time-triggers) fires when time passes instead, with nothing
written: an order still `pending` 30 minutes after it was placed, a booking
nobody confirmed by noon the day before.

A [schedule](/docs/data/schedules/) runs on the clock, every day or every week
at a set time, with no table: "every night at 9, email me today's orders".

## Create one

Open a table on the **Data** page, then its **Triggers** tab, and click **New
trigger**:

1. **Name** and **Description**: optional. A name is lowercase letters,
   digits, `_` and `-`, starting with a letter; left empty, one is made up.
2. **When**: **A row is added**, **A row changes**, **A row is deleted**, or
   **Time passes** (see [time triggers](#time-triggers)).
3. **Only if**: optional. A column, a test (**changes to**, **changes from**,
   **is**, **changes (any value)**) and a value, such as `status` **changes
   to** `ready`. **Advanced (JSON)** takes any [condition](#conditions).
4. **Then**: the [action](#actions).
5. **Runs a minute**: 60 by default, up to 600. Past it, events wait and go out
   later.

![The New trigger dialog: Name, When, Only if, Then "Run a function" and Runs a minute](/images/data-trigger-dialog.webp)

Each trigger shows as a card on the Triggers tab with what it does in one
line, such as "status changes to ready". From the card you can turn it on and
off, **Edit** it, **Delete** it, and open **Recent runs**: each event it
handled, with its status (**Running**, **Waiting**, **Done**, **Failed** or
**Skipped**), its attempts and error, and **Retry** to send a failed one again.
When events are waiting to go out, the tab says how many.

A database holds up to 50 triggers, schedules included. Dropping a table
deletes its triggers. Renaming a column renames it in the triggers that use it,
in their conditions and `{{column}}` texts. A column a trigger uses can't be
dropped until you change or delete that trigger.

You can also ask the project's [Assistant](/docs/assistant/) to make one ("when
an order becomes ready, message the customer"): it proposes the trigger and you
apply it.

## Conditions

A condition tests the row before and after the change:

| Test | In the dashboard | Holds when |
| --- | --- | --- |
| `{ "status": { "changedTo": "ready" } }` | changes to | `status` is now `ready` and wasn't before |
| `{ "status": { "changedFrom": "open" } }` | changes from | `status` was `open` and isn't now |
| `{ "price": { "changed": true } }` | changes (any value) | `price` has a different value |
| `{ "zone": { "equals": "north" } }` | is | `zone` is `north` (on the row after the change, or the deleted row) |

An added row has no "before", and a deleted row no "after", so each counts as
every column empty: an insert **changes to** the values it was created with,
and a delete **changes from** the values it had. On a trigger for changed
rows, `status` **changes to** `ready` fires once, when the order becomes ready,
not again on every later edit of a ready order.

Tests on several columns must all hold. `all` and `any` combine conditions:

```json
{
  "any": [
    { "status": { "changedTo": "ready" } },
    { "all": [{ "status": { "equals": "open" } }, { "total": { "changed": true } }] }
  ]
}
```

Values compare exactly: `3` and `3.0` match, `"3"` and `3` don't. `null`, or a
value left empty in the dashboard, means empty.

## Time triggers

Choose **Time passes** under **When**, then **How long** and from which time
of the row:

- **The row's time**: **When it was added (created_at)**, **When it last
  changed (updated_at)**, or a date or date and time column of the table, such
  as a booking's `starts_at`.
- **How long**: an amount in minutes, hours or days, from 5 minutes to 30
  days, **after** that time, or **before** it on a date or date and time
  column (a reminder the day before a booking). A date with no time counts
  from midnight in the database's [time zone](/docs/data/#time-zone).
- **Only if**: tested on the row as it is when it comes due, so the only test
  is **is** (`equals`). `status` **is** `pending` fires for an order still
  pending 30 minutes on, not for one already marked ready.

Each row fires once for each time it comes due. On `updated_at`, the next
change makes a new due time, so a trigger for "no change in 2 days" fires
again two days after each change. Rows that were already due when you saved
the trigger, or while it was off, don't fire: a new trigger doesn't send a
backlog.

Ganju looks for due rows every 5 minutes, so a run can start up to 5 minutes
after the due time. The column gets an index while a time trigger uses it,
and it can't be dropped, or changed to a type that isn't a date, until you
change or delete the trigger.

Limits: a database holds up to 10 time triggers, and each fires up to 100
events per check (the rest go out at the next one). A database's time
triggers share 2,000 events a day (UTC): once that is reached, every time
trigger with another row due that day is turned off, its card says why, and
the organization's admins get an email. A time trigger is also turned off
while its runs are paused (the plan no longer includes Data, or the month's
trigger runs are used up). Turn it back on when you're ready; it counts from
then, so what came due while it was off isn't sent.

In `ganju.json` and the API:

```json
{
  "name": "still-pending",
  "table": "orders",
  "on": "time",
  "after": { "column": "created_at", "minutes": 30 },
  "when": { "status": { "equals": "pending" } },
  "customer": { "text": "Your order #{{id}} is taking longer than usual; we're on it." }
}
```

`minutes` goes from 5 to 43,200 (30 days), and is negative for before:
`{ "column": "starts_at", "minutes": -1440 }` is a day before. The event's
`event` is `time`, `previous` and `actor` are `null`, and `dueAt` says when the
row came due.

## Schedules

Schedules run at a set time every day or every week, with no table, and can
carry a saved query's rows, such as today's orders. They have their own place
on the Data page and their own page here: [Schedules](/docs/data/schedules/).
They share the actions, delivery, retries and webhook signatures described on
this page.

## Actions

| Action | In the dashboard | In `ganju.json` | What happens |
| --- | --- | --- | --- |
| Run a function | **Run a function** | `"function": "notify-kitchen"` | The function runs with the event. See [functions only triggers run](/docs/data/functions/#functions-only-triggers-run) |
| Call a webhook | **Call a webhook** | `"webhook": "https://example.com/hooks/orders"` | The event is POSTed as JSON, [signed](#verify-a-webhook) |
| Send a chat message | **Send a chat message** | `"chat": { "channelId": "…", "chatId": "-1001234567890", "text": "New order #{{id}}" }` | Posted to a Telegram group or a Slack or Discord channel the bot is in |
| Send an email | **Send an email** | `"email": { "to": ["kitchen@example.com"], "subject": "Order {{id}}", "text": "…" }` | Up to 10 addresses. The subject defaults to `<table>: {{id}}` |
| Message the customer | **Message the customer** | `"customer": { "text": "Your order #{{id}} is ready." }` | Sent to the customer whose conversation wrote the row, on the channel they used |

**Function** lists the functions deployed in the project, marking those that
are **triggers only** and any that is no longer deployed. **Channel** lists
the project's Telegram, Slack and Discord channels; **Chat id** is the
Telegram group's id (such as `-1001234`) or the Slack or Discord channel's id.
Texts are up to 2,000 characters.

In a message, `{{column}}` inserts that column's value from the row, as plain
text. `id`, `created_at`, `updated_at` and `participant_id` work too. Messages
are never formatted as markup: a row may hold text a customer wrote.

**Email** goes to the organization's members right away. Any other address
first gets one email from Ganju, naming the project and the organization, with
a link to confirm it wants these emails. Until it confirms, runs leave it out:
a run that reached someone else is **ok** and says who was left out, and one
that reached nobody is **skipped**. The dashboard and `ganju deploy` list who
still has to confirm. An organization sends at most 20 of these links a day;
the rest go out when the trigger is saved again. Every email to a confirmed
address has a link to unsubscribe, and supports one-click unsubscribe in mail
apps.

**Message the customer** needs a table where **each customer sees only their
own rows**, since that is how a row knows its customer. A row the owner typed in
has no customer, and its run fails saying so. The channel's daily limit per
customer applies.

On **WhatsApp**, free text only reaches a customer within 24 hours of their last
message. Turn on **Use a WhatsApp template**, pick one of the templates Meta
approved on the project's WhatsApp channels, and give each of its variables a
column of the row or a fixed text; the labels you gave the variables show next
to them. Templates are created in the channel's
[Message templates](/docs/channels/whatsapp/#5-message-templates). In
`ganju.json`, `params` has one value per variable, in order:

```json
"customer": {
  "text": "Your order #{{id}} is ready.",
  "template": { "name": "order_ready", "language": "es", "params": ["{{id}}"] }
}
```

Within the window the customer gets the text; outside it, the template. When it
can read the account's templates, Ganju checks the template is approved before
sending it: one in review, rejected,
paused or disabled fails the run with Meta's reason, and so do Meta's own
refusals (the customer turned off marketing messages, the number's quality was
limited), in words on the run list. Meta bills template messages to your own
WhatsApp account. A chat message can't go to WhatsApp.

Messages sent by a trigger are recorded on the conversation, so the bot's next
turn knows what the customer was told. They aren't billed as assistant replies.

## Test a message before saving

The trigger dialog can send what you wrote, saved or not, built from a row of
the table (**Newest row** by default, or one you pick under **Row**). It isn't
a run: it isn't listed under the trigger's runs and doesn't count toward any
limit per customer.

- **Message the customer**: **Test this message** sends it to your own chat
  with the bot. Link that chat first: from your phone, write to the project's
  bot, send `/link`, and open the link it answers with while signed in to
  Ganju. With more than one linked chat, pick one under **Send to**. **Send as
  the template** sends the WhatsApp template even inside the 24-hour window;
  off, a test decides between text and template the way a real run does.
- **Send an email**: the test goes only to your own account's address,
  whatever **To** says, with "[Test]" before the subject.

Click **Send a test**; the dialog shows what went out, and Meta's or the
channel's refusal when there is one. You can send five tests a minute.

The API has the same: `GET /trigger/test-send` lists your linked chats, and
`POST /trigger/test-send` sends one, with `{ table, customer, rowId?,
participantId?, asTemplate? }` or `{ table, email, rowId? }`.

## Deploy triggers with the CLI

List them under `"triggers"` in `ganju.json`, next to your functions, and
`ganju deploy` publishes both:

```json
{
  "tools": [ … ],
  "triggers": [
    { "table": "orders", "on": "insert", "function": "notify-kitchen" },
    {
      "name": "order-ready",
      "table": "orders",
      "on": "update",
      "when": { "status": { "changedTo": "ready" } },
      "function": "tell-customer"
    },
    { "table": "orders", "on": "update", "webhook": "https://example.com/hooks/orders", "rateLimit": 120 }
  ]
}
```

| Field | What it is |
| --- | --- |
| `name` | Optional. Lowercase letters, digits, `_` and `-`, starting with a letter |
| `description` | Optional, up to 300 characters |
| `table` | The table. Left out on a schedule |
| `on` | `insert`, `update`, `delete`, `time` (with `after`, see [time triggers](#time-triggers)) or `schedule` (see [schedules](/docs/data/schedules/)) |
| `when` | Optional. A [condition](#conditions) |
| `after` | On `time`: `{ "column", "minutes" }` |
| `rateLimit` | Runs a minute, 1 to 600; 60 when left out |
| `enabled` | `true` or `false`. Left out, a deploy keeps it as it was |
| one action | `function`, `webhook`, `chat`, `email` or `customer`; exactly one |

- Without a `name`, one is made from the table, the event and the action:
  `orders-insert-notify-kitchen`. In the dashboard and the API, saving a
  trigger without a name always creates a new one, numbered when the name is
  taken (`orders-insert-webhook-2`), so it never replaces another.
- `ganju deploy` adds and updates the triggers listed and removes the ones it
  deployed before that aren't listed anymore. Triggers made in the dashboard are
  left alone, and a name used by both is refused. All of it applies, or none.
- **Renaming a column a deployed trigger uses:** run
  `ganju data column rename`, which renames it in the trigger too, then change
  ganju.json to the new name before the next deploy. A deploy that still names
  the old column is refused. `ganju data schema push` reads a renamed column as
  a drop and an add, and a drop is refused while a trigger uses the column.
- **Dropping one:** take it out of the trigger in ganju.json and deploy first,
  then drop the column.
- A trigger turned off in the dashboard, or by Ganju after failures, stays off
  through later deploys unless its entry says `"enabled": true`.
- Leave `"triggers"` out and a deploy doesn't touch the database's triggers.
  `"triggers": []` removes the ones the CLI deployed.
- A new webhook's signing secret is printed once.

In the dashboard, a deployed trigger shows **Managed by the CLI (ganju.json)**.
You change it in the file, but can still turn it off and on there.

## From the Data API

The [Data API](/docs/data-api/#named-queries-triggers-and-schedules) has the
same routes the dashboard uses:

| Route | What it does |
| --- | --- |
| `GET /trigger` | Every trigger and schedule, and `pending`: events not yet sent. Webhook secrets are never listed |
| `POST /trigger` | Save one (the shape above). A new webhook answers with its `secret`, once; addresses still to confirm come back as `confirming`. `"replace": false` refuses to save over a trigger of that name |
| `PATCH /trigger/:name` | Turn it on or off: `{ "enabled": false }`. Turning it on clears why Ganju turned it off |
| `DELETE /trigger/:name` | Delete it |
| `POST /trigger/deploy` | What `ganju deploy` sends: `{ "triggers": [...] }` |
| `GET /trigger/:name/run` | Its recent runs, newest first, up to 50 (`?limit=`) |
| `POST /trigger/:name/run/:runId/retry` | Run a failed or skipped event again, with the same `eventId` |
| `GET /trigger/test-send`, `POST /trigger/test-send` | [Test a message](#test-a-message-before-saving) |

## How events are delivered

- **At least once.** The same event can arrive twice. Every event has an
  `eventId`, the same on every delivery and on a **Retry**, so a receiver can
  skip one it already handled. The data-orders example keeps it on the row.
- **Order** is kept per row as far as possible, not across rows.
- **Retries.** A failed run is tried three more times, waiting longer each time.
  Some failures aren't retried, because trying again wouldn't change them: a
  function that isn't published, a customer outside WhatsApp's window, a
  chain that went too deep, a webhook URL that points at a private address.
- **Turned off after 20 failures in a row.** The trigger's card says why, and
  the organization's admins get an email. Turn it back on once the
  cause is fixed.
- **Rate.** A trigger's runs a minute count from when each run starts, so a
  backlog goes out at that rate too.
- **Large rows.** A row over 48 KB (in UTF-8 bytes) is sent without `row` and `previous`, with
  `truncated: true` and its `rowId`, to read it by id.
- **Restores.** Events still waiting when you restore the database are
  dropped, and the rows a restore brings back don't fire triggers.

### Loops and chains

- A function a trigger runs writes as that trigger (`trigger:<id>`), and those
  writes never fire the same trigger again. `notify-kitchen` can mark the
  order it just posted without posting it twice.
- Its writes can fire *other* triggers, one level deeper. A chain stops at
  three levels, and the run that would go deeper fails with that error.

## Verify a webhook

A webhook trigger gets a secret that starts with `whsec_`. It is shown once,
when the trigger is created (or printed once by `ganju deploy`). Keep it with
your receiver.

Each event is a `POST` with a JSON body:

```json
{
  "eventId": "…",
  "triggerId": "trg_…",
  "trigger": "orders-update-webhook",
  "table": "orders",
  "event": "update",
  "rowId": 42,
  "row": { "id": 42, "status": "ready", "total": 56000, … },
  "previous": { "id": 42, "status": "open", "total": 56000, … },
  "actor": "user:…",
  "at": "2026-11-03T15:04:05Z"
}
```

A time trigger's event has `"event": "time"`, `"previous": null`, `"actor":
null` and `dueAt`, when the row came due. A
[schedule's](/docs/data/schedules/#what-a-run-sends) has `"event":
"schedule"`, an empty `table`, `"row": null`, `dueAt`, `date` (the run's date
in the database's time zone) and, with a query, `query`, `rows` and
`rowCount` (`rowsTruncated` when some were left out). A row too large to send
comes with `"truncated": true`.

and these headers:

| Header | Value |
| --- | --- |
| `content-type` | `application/json` |
| `user-agent` | `Ganju-Webhooks/1` |
| `x-ganju-signature` | `t=<unix seconds>,v1=<signature>` |
| `x-ganju-event-id` | The `eventId` |
| `x-ganju-event` | `<table>.<event>`, such as `orders.update` or `orders.time`; `schedule` for a schedule |
| `x-ganju-trigger` | The trigger's name |

The signature is the hex HMAC-SHA256 of `<t>.<raw body>`, keyed with the
secret. To check it, recompute it over the body exactly as it arrived, before
parsing it, compare in constant time, and refuse an old `t`:

```js
import crypto from 'node:crypto';
import express from 'express';

const SECRET = process.env.GANJU_WEBHOOK_SECRET; // whsec_…
const TOLERANCE_SECONDS = 5 * 60;

const verify = (header, rawBody) => {
  const parts = Object.fromEntries(
    (header ?? '').split(',').map(part => part.split('='))
  );
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isInteger(t)) return false;
  if (Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECONDS) return false;
  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(`${t}.${rawBody}`)
    .digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(parts.v1, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const app = express();
app.post(
  '/hooks/orders',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const raw = req.body.toString('utf8');
    if (!verify(req.get('x-ganju-signature'), raw)) return res.sendStatus(401);
    const event = JSON.parse(raw);
    // Skip an eventId you already handled, then do the work.
    res.sendStatus(200);
  }
);
app.listen(3000);
```

Answer with a `2xx` within 10 seconds. Anything else, a redirect included, is
a failure and is retried. Each delivery is signed again with a new `t`. The URL
must be `https`, and private or local addresses are refused.

## Usage and limits

- Every run counts on the billing page's **Data** block, as a trigger run. A
  run that calls a function also counts as a custom tool call.
- On **Pro**, triggers run up to 5,000,000 times a month. Past that, they
  pause until the next billing period, and the organization's admins get an
  email. Enterprise has no such limit.
- Email triggers run up to 500 times in 24 hours per organization on Pro, and
  5,000 on Enterprise. The limit counts runs, and each run writes to up to 10
  addresses. Past it, runs are skipped and say so.
- If the organization's plan no longer includes Data, triggers pause: their
  runs are skipped.
