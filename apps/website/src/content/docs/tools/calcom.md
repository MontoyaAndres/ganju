---
title: Cal.com
description: Check availability and book or cancel meetings on a connected Cal.com account.
order: 45
updated: 2026-11-13
---

The **Cal.com** integration lets your assistant schedule through a Cal.com
account — finding a bookable meeting type, checking open slots, and creating or
cancelling bookings. It offers **4 tools**. Cal.com applies your availability,
buffers and booking rules, so a booking made by the assistant follows the same
rules as one made on your booking page.

## Connect it

Cal.com uses an **API key** — there's no sign-in step.

1. In Cal.com, create an API key (in your Cal.com settings, under the developer
   / API keys section) and copy it.
2. In Ganju, open **Tools → Catalog**, select the **Cal.com** card and choose
   **Add Cal.com API key**.
3. Paste the key and **Save**. We check it with Cal.com before storing it; it's
   encrypted and never shown again.
4. Turn on the tools you want, then pick the defaults below.

To swap the key later, use **Update API key**; **Disconnect** removes it.

![The API key dialog for an integration, with Cancel and Save](/images/tools-api-key-dialog.webp)

## Integration defaults

With the key saved and at least one Cal.com tool on, the group header shows two
settings for every Cal.com tool (a tool you turn on later inherits them):

- **Default event type** — the meeting type bookings are made against, e.g.
  "30 Min Meeting (30 min)", unless a call names another.
- **Default time zone** — used to look up availability and as the attendee's
  booking time zone when the conversation doesn't reveal theirs. Without one,
  the zone on your Cal.com profile is used.

![Cal.com connected: Update API key, Disconnect, Default event type, Default time zone and the tools](/images/tools-calcom-defaults.webp)

## Tools

The names in parentheses are what MCP clients and logs show.

- **List Event Types** (`calcom-list-event-types`) — lists the bookable meeting
  types on the account with each one's ID, title, duration and slug.
- **List Available Slots** (`calcom-list-available-slots`) — finds open start
  times between `start` and `end` (ISO 8601, UTC). Optional `eventTypeId` and
  `timeZone` (IANA) for the returned times.
- **Create Booking** (`calcom-create-booking`) — books a `start` (one of the
  times List Available Slots returned) for an attendee's `name` and `email`.
  Optional `attendeeTimeZone` — the zone their confirmation and reminders use,
  which the assistant passes whenever it knows where they are — `notes`, and
  `eventTypeId`. In a channel conversation, the name and email come from the
  person. Returns the booking UID and status.
- **Cancel Booking** (`calcom-cancel-booking`) — cancels a booking by
  `bookingUid`, with an optional `reason` shown to the attendee, who is
  notified.

The typical flow is **List Available Slots → Create Booking**.

## Sensitive actions

With [Confirm sensitive actions](/docs/settings/#confirm-sensitive-actions) on,
the assistant asks before **Create Booking** and **Cancel Booking**. The two
listing tools run without asking.

## Troubleshooting

- **"Invalid Cal.com API key (or Cal.com could not be reached)".** The key was
  refused when saving. Copy it again from Cal.com, with no spaces.
- **"Could not load event types. Check the API key and try again."** The key
  stopped working; use **Update API key**.
- **"Error: no event type".** Pick a **Default event type**, or ask the
  assistant to use a specific one.
- **"Cal.com is not connected".** The key was removed. Add it again from the card.

The API key is only used by these tools; [functions](/docs/tools/functions/)
can't borrow it. To call Cal.com from your own code, store a key as a function
secret.

Managing a Google Calendar directly instead? See
[Google Calendar](/docs/tools/google-calendar/).
