# calendar-free-time

Finds the open slots on a day of your Google Calendar that fit a meeting, so an
assistant can answer *"when am I free on Tuesday for an hour?"* or suggest
times to someone.

| Tool | What it does |
| --- | --- |
| `find-free-time` | Busy blocks and free slots for one day, within working hours |

## What it shows

- **`ctx.connection`.** `ctx.connection('google-calendar')` returns a
  short-lived access token for the account connected on the Tools page. The
  refresh token never reaches your code, and the platform refreshes the
  access token for you. Your code only makes API calls.
- **`connections` as a permission.** `google-calendar` is listed in
  `ganju.json`. Without that line the call is refused, even if the account is
  connected.
- **Reading only what it needs.** It asks Google's free/busy endpoint, which
  returns times but never event titles or attendees.
- **Time zones without a library.** `src/lib/time.ts` uses `Intl` to turn
  "9:00 in the calendar's time zone" into an exact time, including on the
  days the clocks change.

## Set up

1. On the project's **Tools** page, connect **Google Calendar**.
2. Then:

```bash
ganju link
ganju test find-free-time --input '{"date":"2026-09-21","durationMinutes":60}'
ganju deploy
```

Change the working day with `startHour` and `endHour` (default 9 and 17), in
the calendar's own time zone.

## Files

```
ganju.json            one tool, connections: ["google-calendar"]
src/findFreeTime.ts   find-free-time: the gap-finding walk
src/lib/google.ts     authenticated Calendar requests
src/lib/time.ts       local time in a named zone → an exact instant
```
