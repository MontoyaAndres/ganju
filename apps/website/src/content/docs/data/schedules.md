---
title: Schedules
description: "Run something every day or every week at a set time, in the database's time zone: email a saved query's rows, or hand them to a function or a webhook."
order: 58
updated: 2026-11-13
---

A **schedule** runs on the clock: every day, or every week on the days you
choose, at a set time in the database's [time zone](/docs/data/#time-zone).
It can carry the rows of a [saved query](/docs/data/#named-queries), such as
today's orders, and email them to you, or hand them to a function or a
webhook. "Every night at 9, email me today's orders." "Every Monday at 8, send
last week's sales to our system."

A schedule has no table and nothing has to be written for it to run. To react
when rows change, or a set time after a row's date, use a
[trigger](/docs/data/triggers/).

## Create one

Open **Schedules** in the list on the Data page and click **New schedule**.
The list shows each schedule as "Every day at 21:00" or "Every Monday,
Thursday at 08:00", with the query whose rows it sends.

1. **Name** and **Description**: optional. Lowercase letters, digits, `-` and
   `_`; left empty, one is made up.
2. **Repeats**: **Every day** or **Every week**. For every week, tick the
   days.
3. **At**: the time, such as 21:00, in the database's time zone. The view's
   help line names that zone; change it in **Database settings**.
4. **Rows from**: a saved query whose rows go with each run, or **No query:
   just the time**. Make the query first under **Queries**.
5. The query's parameters: a value, or one of the run's dates (below).
6. **Don't run when the query returns no rows**: skips the days with nothing.
7. **Then**: **Send an email**, **Run a function** or **Call a webhook**.

![The New schedule dialog: Name, Repeats, At, Rows from a saved query and Then "Send an email"](/images/data-schedule-dialog.webp)

Each schedule can be turned on and off, edited and deleted from the list, and
**Recent runs** shows each run with its status and error, and **Retry** for a
failed one. A database holds up to 5 schedules; they count toward its 50
triggers. Daily is the most often a schedule runs.

You can also ask the project's [Assistant](/docs/assistant/): "every night at
9, email me today's orders". It writes the query and the schedule, can send you
a test of the email before it is due, and you apply both.

## The run's dates

A query parameter can take the run's own date instead of a fixed value. Each is
worked out in the database's time zone:

| Value | What it is |
| --- | --- |
| `{{today}}` | The run's date, such as `2026-11-13` |
| `{{yesterday}}` | The day before |
| `{{today_start}}` | The start of the run's day, as a UTC date and time |
| `{{today_end}}` | The end of the run's day (the next midnight), as a UTC date and time |
| `{{now}}` | The time the run is for, as a UTC date and time |

Use `{{today}}` and `{{yesterday}}` for a `date` column, and `{{today_start}}`
and `{{today_end}}` for a column such as `created_at`, stored in UTC.

A query for the day's orders, saved as `todays_orders` with two `datetime`
parameters:

```sql
SELECT customer, items, total FROM orders
WHERE created_at >= :from AND created_at < :to
ORDER BY created_at
```

If you later change a query a schedule runs so that its parameters no longer
match, saving the query warns you: change the schedule too, or its runs fail.

## Actions

- **Send an email**: up to 10 addresses. The text takes `{{date}}` (the run's
  date) and `{{count}}` (how many rows), and is followed by the rows, one per
  line. The subject defaults to the query's name and the date. The same
  confirmation as a trigger's email applies: members of the organization get
  it right away, other addresses confirm first. See
  [Actions](/docs/data/triggers/#actions).
- **Run a function**: the function gets the run as its event, with the rows.
  Keep it out of the assistant's tools with `"expose": false`; see
  [Data from functions](/docs/data/functions/#functions-only-triggers-run).
- **Call a webhook**: the run is POSTed as JSON and signed, like a trigger's.
  See [Verify a webhook](/docs/data/triggers/#verify-a-webhook).

## What a run sends

A function or webhook gets:

```json
{
  "eventId": "…",
  "triggerId": "trg_…",
  "trigger": "nightly-orders",
  "table": "",
  "event": "schedule",
  "rowId": 0,
  "row": null,
  "previous": null,
  "actor": null,
  "at": "2026-11-14T02:00:03Z",
  "dueAt": "2026-11-14T02:00:00Z",
  "date": "2026-11-13",
  "query": "todays_orders",
  "rows": [{ "customer": "Ana", "items": "2× Margherita", "total": 56000 }],
  "rowCount": 1
}
```

- `dueAt` is the time the run was for, in UTC; `date` is that day in the
  database's time zone.
- `rows` holds up to 200 rows and 48 KB; `rowsTruncated` says some were left
  out. `rowCount` counts up to 500 rows; `rowCountMore` says there were more.
- The webhook's `x-ganju-event` header is `schedule`.

## In `ganju.json` and the API

A schedule is a trigger with `"on": "schedule"` and no `table` or `when`. List
it under `"triggers"` in `ganju.json` and `ganju deploy` publishes it, or send
it to `POST /trigger` in the [Data API](/docs/data-api/#named-queries-triggers-and-schedules):

```json
{
  "name": "nightly-orders",
  "on": "schedule",
  "every": "day",
  "at": "21:00",
  "query": "todays_orders",
  "params": { "from": "{{today_start}}", "to": "{{today_end}}" },
  "skipEmpty": true,
  "email": { "to": "you@example.com", "subject": "Orders {{date}}", "text": "{{count}} orders today:" }
}
```

| Field | What it is |
| --- | --- |
| `every` | `day` or `week` |
| `days` | With `week`: some of `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun`. Monday when left out |
| `at` | A 24-hour time, such as `08:00` or `21:00` |
| `query` | Optional. A saved query's name |
| `params` | With `query`: a value per parameter, or one of [the run's dates](#the-runs-dates). Every required parameter needs one |
| `skipEmpty` | With `query`: `true` runs nothing when it returns no rows |
| one action | `email`, `function` or `webhook` |

`name`, `description`, `enabled` and `rateLimit` work as on any
[trigger](/docs/data/triggers/#deploy-triggers-with-the-cli).

## When it runs

- **Once per time.** Each due time runs once, even if the database restarts.
- **Missed runs.** A run missed at its time (the database was down) goes out
  once, late, if it is back within 6 hours, and is skipped after that.
- **Changing the time zone** restarts the clocks in the new zone; a time that
  already passed there today isn't sent late.
- **A query that fails** means nothing goes out for that time; the run list
  shows the query's error.
- **Skipped when empty.** With **Don't run when the query returns no rows**, a
  day with no rows leaves no run at all.
- **Delivery, retries** and turning off after 20 failures in a row work as for
  triggers: see [How events are delivered](/docs/data/triggers/#how-events-are-delivered).
  When Ganju turns a schedule off, the organization's admins get an email.
- **Plans.** Each run counts as a trigger run. If the organization's plan no
  longer includes Data, schedules pause.
