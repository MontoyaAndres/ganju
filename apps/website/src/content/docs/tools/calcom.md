---
title: Cal.com
description: Check availability and book or cancel meetings on a connected Cal.com account.
order: 45
updated: 2026-07-07
---

The **Cal.com** integration lets your assistant handle scheduling through a
Cal.com account — finding a bookable meeting type, checking open slots, and
creating or cancelling bookings. It offers **4 tools**. Each acts on the
artifact's **default event type** unless you pass an `eventTypeId`.

## Connect it

Cal.com uses an **API key**. Paste your key once when adding the integration —
there's no OAuth step.

## Tools

- **List Event Types** — lists the bookable meeting templates on the account (e.g.
  "30 Min Meeting") with each one's ID, title, duration, and slug. Call this to
  find the event type ID to set as the default or target.
- **List Available Slots** — finds open booking times for an event type between a
  `start` and `end` (ISO 8601, UTC). Pass a `timeZone` to return slots in that
  zone. Use it to confirm availability before booking.
- **Create Booking** — books a slot. Takes a `start` (one of the times returned by
  List Available Slots) plus the attendee's `name` and `email`. In a channel
  conversation those details come from the participant. Returns the booking UID
  needed to cancel later.
- **Cancel Booking** — cancels a booking by its UID, with an optional reason; the
  attendee is notified. Call only when the user has clearly decided to cancel.

The typical flow is List Available Slots → Create Booking. Managing a Google
Calendar directly instead? See [Google Calendar](/docs/tools/google-calendar).
