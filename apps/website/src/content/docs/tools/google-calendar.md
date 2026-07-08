---
title: Google Calendar
description: Create and manage calendar events, invite attendees, and find open time slots on a connected Google account.
order: 44
updated: 2026-07-07
---

The **Google Calendar** integration lets your assistant read and manage schedules
on a connected Google account — listing calendars, browsing and editing events,
and finding open time to meet. It offers **6 tools**. Most tools act on the
artifact's **default calendar** unless you pass a specific `calendarId`.

## Connect it

Google Calendar uses **Google OAuth**. Read tools request read-only access; the
create, update, and delete tools request calendar-events access.

## Tools

- **List Calendars** — lists every calendar on the account with its ID, name, time
  zone, and access role. Call this to find the ID to lock as the default, or to
  target a specific calendar.
- **List Events** — lists events in a time window (`timeMin`/`timeMax`, ISO 8601),
  expanding recurring events into individual instances ordered by start. An
  optional `query` does free-text search; leave `timeMin` empty to default to now.
- **Create Event** — adds an event. Needs a `summary` and `startTime`, plus either
  an `endTime` or `durationMinutes`. Optionally set description, location, time
  zone, and `attendees` (who are emailed an invite); a Google Meet link is added
  automatically when configured. The model converts natural language like
  "tomorrow at 7am" into ISO before calling.
- **Update Event** — patches an existing event by `eventId` — only the fields you
  pass change. Move it via start/end times, or edit summary, location, or
  attendees. Passing `attendees` replaces the whole list.
- **Delete Event** — permanently removes an event by ID; attendees are notified.
  Call only when the user has clearly decided to cancel.
- **Find Free Slots** — queries free/busy between `timeMin` and `timeMax` to return
  open gaps, honoring any configured working hours, buffers, and minimum notice.
  Pass `durationMinutes` to require gaps of at least that length. The typical flow
  is Find Free Slots → Create Event.

Booking through a scheduling page instead? See [Cal.com](/docs/tools/calcom).
