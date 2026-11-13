---
title: Google Calendar
description: Create and manage calendar events, invite attendees, and find open time slots on a connected Google account.
order: 44
updated: 2026-11-13
---

The **Google Calendar** integration lets your assistant read and manage a
schedule on a connected Google account: listing calendars, browsing and editing
events, and finding open time to meet. It offers **6 tools**, and you set which
calendar and time zone they use once, for the whole integration.

## Connect it

1. Open **Tools → Catalog** and select the **Google Calendar** card.
2. Select **Connect Google Calendar**, choose the Google account and approve.
3. Turn on the tools you want, then set the defaults below.

Connecting asks Google for `calendar.readonly` (calendars, events and free/busy)
and `calendar.events` (create, change and delete events).

## Integration defaults

Once connected and with at least one calendar tool on, the group header shows
three settings that apply to every calendar tool (a tool you turn on later
inherits them):

- **Default calendar**: which calendar events and free/busy lookups use,
  unless a call names another. The account's primary calendar is used until you
  pick one.
- **Default time zone**: how event times are read, and the zone the working
  hours of Find Free Slots are in. Without one, the zone set in Google Calendar
  is used.
- **Attendee notifications**: whether Google emails guests when events are
  created, changed or cancelled: **Notify everyone**, **Notify external guests
  only** or **Don't send notifications**.

![Google Calendar connected: Default calendar, Default time zone, Attendee notifications and the tools](/images/tools-calendar-defaults.webp)

## Per-tool settings

Three tools have extra settings, under the pencil icon (**Configure**) on their
row:

**Create Event**

- **Default duration (minutes)**: used when an event has no end time (60 if
  unset).
- **Add a Google Meet link**: attaches a Meet conference to every new event.
- **Default location**: used when the call gives none.
- **Visibility**: **Calendar default**, **Public** or **Private**.

**List Events**

- **Default max results**: how many events a call returns when it doesn't
  say (1–50; 10 if unset).
- **Default look-ahead (days)**: with no end time, events this many days
  ahead are listed.

**Find Free Slots**, your booking policy:

- **Working hours start (0–23)** and **Working hours end (1–24)**: local hours,
  in the default time zone (or the one set in Google Calendar).
- **Working days**: which weekdays count.
- **Default slot length (minutes)**: the shortest gap worth returning.
- **Buffer between meetings (minutes)**: kept free around every busy block.
- **Minimum notice (hours)**: nothing sooner than this from now.
- **Max advance (days)**: nothing further out than this.

## Tools

The names in parentheses are what MCP clients and logs show. Every tool except
List Calendars takes an optional `calendarId` to use another calendar than the
default.

- **List Calendars** (`calendar-list-calendars`): lists every calendar on the
  account with its ID, name, time zone, access role and whether it's the
  primary one.
- **List Events** (`calendar-list-events`): lists events between `timeMin` and
  `timeMax` (ISO 8601), with recurring events expanded into single instances,
  ordered by start. `timeMin` defaults to now; `query` searches event text;
  `maxResults` 1–50, default 10. Returns summary, start, end, location and event
  ID.
- **Create Event** (`calendar-create-event`): adds an event. Needs `summary`
  and `startTime`; give `endTime` or `durationMinutes`, or the default duration
  applies. Times are the local time meant (e.g. `2026-09-30T15:00:00`) in the
  event's time zone; the model turns "tomorrow at 7am" into that. Optional
  `description`, `location`, `timeZone` (IANA) and `attendees` (emails, who get
  an invite). Returns the event ID and a link.
- **Update Event** (`calendar-update-event`): changes an event by `eventId`;
  only the fields passed change (`summary`, `startTime`, `endTime`,
  `description`, `location`, `timeZone`, `attendees`). Passing `attendees`
  **replaces** the whole guest list.
- **Delete Event** (`calendar-delete-event`): permanently removes an event by
  `eventId`; guests are notified according to **Attendee notifications**.
- **Find Free Slots** (`calendar-find-free-slots`): returns the open gaps
  between `timeMin` and `timeMax` (both required), from Google's free/busy,
  after applying your booking policy. `durationMinutes` asks for gaps at least
  that long.

The typical flow is **Find Free Slots → Create Event**.

## Sensitive actions

With [Confirm sensitive actions](/docs/settings/#confirm-sensitive-actions) on,
the assistant asks before **Create Event**, **Update Event** and **Delete
Event**, since guests can be emailed about each. The three reading tools run
without asking.

## Use the connection from your own code

A [function](/docs/tools/functions/) can call the Google Calendar API with the
same connection: add `google-calendar` to its connections and call
`ctx.connection('google-calendar')`.

## Troubleshooting

- **"Could not load calendars. Reconnect Google Calendar and try again."** The
  connection lapsed; connect again from the card.
- **"Google Calendar credential not connected".** The integration was
  disconnected.
- **Events land an hour off.** Set a **Default time zone**, or tell the
  assistant the zone; a time with `Z` or an offset is taken as that exact
  instant.
- **"No free slots: the search window is empty after applying the booking
  policy".** Minimum notice or max advance cut the whole window. Ask for a
  different range or relax the policy.

Booking through a scheduling page instead? See [Cal.com](/docs/tools/calcom/).
