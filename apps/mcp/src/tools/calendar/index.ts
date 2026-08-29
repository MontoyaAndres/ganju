import { utils } from '@ganju/utils';

import { ToolContext, ToolDefinition } from '../types';
import {
  resolveEffectiveTimeZone,
  refreshVendorTimeZoneIfStale
} from '../timeZone';

const CALENDAR_API_BASE = utils.constants.GOOGLE_CALENDAR_API_BASE;

type ToolResult = { content: Array<{ type: 'text'; text: string }> };

const text = (value: string): ToolResult => ({
  content: [{ type: 'text', text: value }]
});

// artifact_tool.config is untyped JSON, so every read is defensive.
const cfgString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

const cfgNumber = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

const cfgBool = (v: unknown): boolean => v === true || v === 'true';

// create/update: notify per config; default to notifying when attendees exist.
const resolveSendUpdates = (
  config: Record<string, unknown>,
  hasAttendees: boolean
): string | undefined => {
  const configured = cfgString(config.sendUpdates);
  if (
    configured &&
    utils.constants.CALENDAR_SEND_UPDATES_VALUES.includes(configured as never)
  ) {
    return configured;
  }
  return hasAttendees ? utils.constants.CALENDAR_SEND_UPDATES_ALL : undefined;
};

const getAccessToken = (
  context: ToolContext
): { ok: true; token: string } | { ok: false; response: ToolResult } => {
  const credential = context.credentials[0];
  if (!credential) {
    return {
      ok: false,
      response: text('Error: Google Calendar credential not connected')
    };
  }
  return { ok: true, token: credential.accessToken };
};

// The artifact owner locks the working calendar on artifact_tool.config; the
// model may only override it via an explicit calendarId arg (escape hatch).
const resolveCalendarId = (
  args: Record<string, unknown>,
  context: ToolContext
): string => {
  const override = cfgString(args.calendarId);
  if (override) return override;
  const configured = cfgString(context.config?.defaultCalendarId);
  if (configured) return configured;
  return utils.constants.CALENDAR_DEFAULT_CALENDAR_ID;
};

// Time zone an event/lookup operates in. Explicit arg, then the group-level
// default, then the zone the user set in Google Calendar itself — read from the
// primary calendar and cached on the connection, refreshed here when it has
// aged out. Undefined only when the vendor could not tell us either, in which
// case Google falls back to the calendar's own zone for timestamps that carry
// no offset.
const resolveTimeZone = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<string | undefined> => {
  const explicit =
    cfgString(args.timeZone) || cfgString(context.config?.defaultTimeZone);
  if (explicit) return explicit;

  await refreshVendorTimeZoneIfStale(
    context,
    context.credentials[0],
    utils.fetchGoogleCalendarTimeZone
  );
  return resolveEffectiveTimeZone(args, context);
};

const calendarFetch = async (
  token: string,
  path: string,
  init?: RequestInit
): Promise<Response> => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...((init?.headers as Record<string, string>) || {})
  };
  if (init?.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(`${CALENDAR_API_BASE}${path}`, { ...init, headers });
};

interface CalendarEvent {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{ email?: string; responseStatus?: string }>;
}

const formatEventWhen = (
  slot: { dateTime?: string; date?: string } | undefined
): string => {
  if (!slot) return 'unknown';
  return slot.dateTime || slot.date || 'unknown';
};

const buildTimeSlot = (
  iso: string,
  timeZone?: string
): { dateTime: string; timeZone?: string } => {
  const slot: { dateTime: string; timeZone?: string } = { dateTime: iso };
  if (timeZone) slot.timeZone = timeZone;
  return slot;
};

// Offset in ms such that: wallClockEpoch = realInstant.getTime() + offset.
const tzOffsetMs = (instant: Date, timeZone: string): number => {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = dtf.formatToParts(instant);
  const get = (t: string) =>
    Number(parts.find(p => p.type === t)?.value ?? '0');
  let hour = get('hour');
  if (hour === 24) hour = 0; // some engines emit 24 for midnight
  const asUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second')
  );
  return asUTC - instant.getTime();
};

// The UTC instant for a wall-clock time in the given zone. One-pass; DST
// transition edges can be off by an hour in rare cases — fine for slot hints.
const wallClockToUtc = (
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string
): Date => {
  const naiveUTC = Date.UTC(year, month - 1, day, hour, 0, 0);
  const offset = tzOffsetMs(new Date(naiveUTC), timeZone);
  return new Date(naiveUTC - offset);
};

const localYmd = (
  instant: Date,
  timeZone: string
): { year: number; month: number; day: number } => {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = dtf.formatToParts(instant);
  const get = (t: string) =>
    Number(parts.find(p => p.type === t)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day') };
};

interface Interval {
  start: Date;
  end: Date;
}

// One working-hours window per qualifying local day across the search range.
const buildWorkingWindows = (
  windowStart: Date,
  windowEnd: Date,
  timeZone: string,
  startHour: number,
  endHour: number,
  days: number[]
): Interval[] => {
  const windows: Interval[] = [];
  let { year, month, day } = localYmd(windowStart, timeZone);

  for (let i = 0; i < 366; i++) {
    const dayStart = wallClockToUtc(year, month, day, startHour, timeZone);
    if (dayStart.getTime() > windowEnd.getTime()) break;

    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (days.includes(weekday)) {
      const dayEnd = wallClockToUtc(year, month, day, endHour, timeZone);
      windows.push({ start: dayStart, end: dayEnd });
    }

    const next = new Date(Date.UTC(year, month - 1, day) + 24 * 3600 * 1000);
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }
  return windows;
};

const intersectIntervals = (a: Interval[], b: Interval[]): Interval[] => {
  const out: Interval[] = [];
  for (const x of a) {
    for (const y of b) {
      const start = Math.max(x.start.getTime(), y.start.getTime());
      const end = Math.min(x.end.getTime(), y.end.getTime());
      if (end > start) out.push({ start: new Date(start), end: new Date(end) });
    }
  }
  return out.sort((p, q) => p.start.getTime() - q.start.getTime());
};

const formatInstant = (d: Date, timeZone?: string): string => {
  if (!timeZone) return d.toISOString();
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
    .format(d)
    .replace(',', '');
  return `${s} (${timeZone})`;
};

export const listCalendars: ToolDefinition = {
  title: 'Calendar: List Calendars',
  description:
    "List every calendar on the connected Google account (calendarList.list). Returns each calendar's ID, summary/name, time zone, access role (owner/writer/reader), and whether it is the primary calendar. Call this first to discover the calendar ID the artifact owner should lock as the default, or to find a specific calendar's ID before passing it as the calendarId override to other calendar tools.",
  schema: { type: 'object', properties: {} },
  handler: async (_args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const response = await calendarFetch(auth.token, '/users/me/calendarList');
    if (!response.ok) {
      return text(
        `Error listing calendars: ${await utils.parseHttpErrorMessage(response)}`
      );
    }

    const data = (await response.json()) as {
      items?: Array<{
        id?: string;
        summary?: string;
        primary?: boolean;
        accessRole?: string;
        timeZone?: string;
      }>;
    };
    const items = data.items || [];
    if (items.length === 0) return text('No calendars found.');

    const lines = items.map(cal => {
      const primary = cal.primary ? ' (primary)' : '';
      return `- ${cal.summary || '(untitled)'}${primary} | role: ${cal.accessRole || 'unknown'} | tz: ${cal.timeZone || 'unknown'} | ID: ${cal.id}`;
    });
    return text(`Found ${items.length} calendar(s):\n\n${lines.join('\n')}`);
  }
};

export const listEvents: ToolDefinition = {
  title: 'Calendar: List Events',
  description:
    "List events on a calendar within a time window, expanding recurring events into individual instances and ordering them by start time. Provide timeMin / timeMax as ISO 8601 timestamps; leave timeMin empty to default to now. If timeMax is omitted the tool looks ahead a configured number of days. Optional `query` does a free-text search. Returns up to maxResults lines with summary / start / end / location / event ID. Uses the artifact's default calendar unless you pass calendarId.",
  schema: {
    type: 'object',
    properties: {
      calendarId: {
        type: 'string',
        description:
          "Optional calendar ID override. Defaults to the artifact's configured calendar, or the primary calendar."
      },
      timeMin: {
        type: 'string',
        description:
          'Lower bound (inclusive) ISO 8601 timestamp. Defaults to the current time when omitted.'
      },
      timeMax: {
        type: 'string',
        description:
          'Upper bound (exclusive) ISO 8601 timestamp. Defaults to the configured look-ahead window when omitted.'
      },
      query: {
        type: 'string',
        description: 'Optional free-text search over event fields.'
      },
      maxResults: {
        type: 'number',
        minimum: 1,
        maximum: 50,
        description: 'Maximum number of events to return (1-50).'
      }
    }
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const config = context.config || {};
    const calendarId = resolveCalendarId(args, context);

    const requested =
      cfgNumber(args.maxResults) ?? cfgNumber(config.defaultMaxResults) ?? 10;
    const maxResults = Math.max(1, Math.min(50, requested));

    const timeMin = cfgString(args.timeMin) || new Date().toISOString();
    let timeMax = cfgString(args.timeMax);
    const windowDays = cfgNumber(config.defaultWindowDays);
    if (!timeMax && windowDays && windowDays > 0) {
      timeMax = new Date(
        new Date(timeMin).getTime() + windowDays * 86400 * 1000
      ).toISOString();
    }

    const params = new URLSearchParams();
    params.set('singleEvents', 'true');
    params.set('orderBy', 'startTime');
    params.set('maxResults', String(maxResults));
    params.set('timeMin', timeMin);
    if (timeMax) params.set('timeMax', timeMax);
    if (args.query) params.set('q', String(args.query));

    const response = await calendarFetch(
      auth.token,
      `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`
    );
    if (!response.ok) {
      return text(
        `Error listing events: ${await utils.parseHttpErrorMessage(response)}`
      );
    }

    const data = (await response.json()) as { items?: CalendarEvent[] };
    const events = data.items || [];
    if (events.length === 0) return text('No events found in that window.');

    const lines = events.map(ev => {
      const loc = ev.location ? ` @ ${ev.location}` : '';
      return `- ${ev.summary || '(no title)'} | ${formatEventWhen(ev.start)} → ${formatEventWhen(ev.end)}${loc} | ID: ${ev.id}`;
    });
    return text(
      `Found ${events.length} event(s) on ${calendarId}:\n\n${lines.join('\n')}`
    );
  }
};

export const createEvent: ToolDefinition = {
  title: 'Calendar: Create Event',
  description:
    'Create an event on a calendar. Pass `summary` and `startTime` (ISO 8601). Give `endTime` (ISO 8601) or `durationMinutes`; if neither is set the configured default duration is used. You (the model) convert natural language like "tomorrow at 7am" into ISO before calling. Optionally set description, location, timeZone (IANA; omit to use the zone configured on the connected Google Calendar account), and attendees (emails, who are emailed an invite). A Google Meet link is attached automatically when the integration is configured for it. Writes to the artifact\'s default calendar unless you pass calendarId. Returns the new event ID and a link.',
  schema: {
    type: 'object',
    properties: {
      calendarId: {
        type: 'string',
        description: 'Optional calendar ID override.'
      },
      summary: { type: 'string', description: 'Event title.' },
      startTime: {
        type: 'string',
        description: 'Event start as an ISO 8601 timestamp.'
      },
      endTime: {
        type: 'string',
        description:
          'Event end as an ISO 8601 timestamp. Optional if durationMinutes (or a configured default) is available.'
      },
      durationMinutes: {
        type: 'number',
        minimum: 1,
        description: 'Event length in minutes, used when endTime is omitted.'
      },
      description: {
        type: 'string',
        description: 'Optional event description / notes.'
      },
      location: {
        type: 'string',
        description: 'Optional location (free text or address).'
      },
      timeZone: {
        type: 'string',
        description:
          'Optional IANA time zone applied to start and end. Omit to use the configured default or the calendar zone.'
      },
      attendees: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of attendee email addresses.'
      }
    },
    required: ['summary', 'startTime']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const config = context.config || {};
    const calendarId = resolveCalendarId(args, context);
    const timeZone = await resolveTimeZone(args, context);
    const attendees = utils.toStringArray(args.attendees);

    const startIso = String(args.startTime);
    const startDate = new Date(startIso);
    if (Number.isNaN(startDate.getTime())) {
      return text('Error: startTime must be a valid ISO 8601 timestamp.');
    }

    let endIso = cfgString(args.endTime);
    if (!endIso) {
      const minutes =
        cfgNumber(args.durationMinutes) ??
        cfgNumber(config.defaultDurationMinutes) ??
        utils.constants.CALENDAR_DEFAULT_EVENT_DURATION_MINUTES;
      endIso = new Date(startDate.getTime() + minutes * 60000).toISOString();
    }

    const body: Record<string, unknown> = {
      summary: String(args.summary),
      start: buildTimeSlot(startIso, timeZone),
      end: buildTimeSlot(endIso, timeZone)
    };
    if (args.description) body.description = String(args.description);

    const location =
      cfgString(args.location) || cfgString(config.defaultLocation);
    if (location) body.location = location;

    const visibility = cfgString(config.defaultVisibility);
    if (
      visibility &&
      visibility !== utils.constants.CALENDAR_VISIBILITY_DEFAULT
    ) {
      body.visibility = visibility;
    }

    if (attendees.length > 0) {
      body.attendees = attendees.map(email => ({ email }));
    }

    const params = new URLSearchParams();
    const sendUpdates = resolveSendUpdates(config, attendees.length > 0);
    if (sendUpdates) params.set('sendUpdates', sendUpdates);

    if (cfgBool(config.addGoogleMeet)) {
      body.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: {
            type: utils.constants.CALENDAR_CONFERENCE_TYPE_GOOGLE_MEET
          }
        }
      };
      params.set('conferenceDataVersion', '1');
    }

    const response = await calendarFetch(
      auth.token,
      `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      { method: 'POST', body: JSON.stringify(body) }
    );
    if (!response.ok) {
      return text(
        `Error creating event: ${await utils.parseHttpErrorMessage(response)}`
      );
    }

    const ev = (await response.json()) as CalendarEvent;
    const link = ev.htmlLink ? ` (${ev.htmlLink})` : '';
    const meetNote = ev.hangoutLink ? ` Meet: ${ev.hangoutLink}.` : '';
    const inviteNote = attendees.length
      ? ` ${attendees.length} attendee(s) invited.`
      : '';
    return text(
      `Event created on ${calendarId}. Event ID: ${ev.id}${link}.${inviteNote}${meetNote}`
    );
  }
};

export const updateEvent: ToolDefinition = {
  title: 'Calendar: Update Event',
  description:
    "Patch an existing event (partial update — only the fields you pass change). Requires `eventId`. Move it via startTime/endTime (ISO 8601), or change summary / description / location / timeZone / attendees. Passing attendees REPLACES the whole attendee list. Operates on the artifact's default calendar unless you pass calendarId. Returns confirmation and a link.",
  schema: {
    type: 'object',
    properties: {
      calendarId: {
        type: 'string',
        description: 'Optional calendar ID override.'
      },
      eventId: {
        type: 'string',
        description: 'ID of the event to update (from calendar-list-events).'
      },
      summary: { type: 'string', description: 'New event title.' },
      startTime: {
        type: 'string',
        description: 'New start as an ISO 8601 timestamp.'
      },
      endTime: {
        type: 'string',
        description: 'New end as an ISO 8601 timestamp.'
      },
      description: { type: 'string', description: 'New description.' },
      location: { type: 'string', description: 'New location.' },
      timeZone: {
        type: 'string',
        description:
          'IANA time zone applied to any startTime/endTime in this call.'
      },
      attendees: {
        type: 'array',
        items: { type: 'string' },
        description:
          'New full list of attendee emails. REPLACES the existing attendees.'
      }
    },
    required: ['eventId']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const config = context.config || {};
    const calendarId = resolveCalendarId(args, context);
    const timeZone = await resolveTimeZone(args, context);

    const body: Record<string, unknown> = {};
    if (args.summary !== undefined) body.summary = String(args.summary);
    if (args.description !== undefined) {
      body.description = String(args.description);
    }
    if (args.location !== undefined) body.location = String(args.location);
    if (args.startTime) {
      body.start = buildTimeSlot(String(args.startTime), timeZone);
    }
    if (args.endTime) {
      body.end = buildTimeSlot(String(args.endTime), timeZone);
    }
    let hasAttendees = false;
    if (args.attendees !== undefined) {
      const attendees = utils.toStringArray(args.attendees);
      hasAttendees = attendees.length > 0;
      body.attendees = attendees.map(email => ({ email }));
    }

    if (Object.keys(body).length === 0) {
      return text(
        'Error: nothing to update — pass at least one field (summary, startTime, endTime, description, location, or attendees).'
      );
    }

    const params = new URLSearchParams();
    const sendUpdates = resolveSendUpdates(config, hasAttendees);
    if (sendUpdates) params.set('sendUpdates', sendUpdates);

    const response = await calendarFetch(
      auth.token,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(String(args.eventId))}?${params.toString()}`,
      { method: 'PATCH', body: JSON.stringify(body) }
    );
    if (!response.ok) {
      return text(
        `Error updating event: ${await utils.parseHttpErrorMessage(response)}`
      );
    }

    const ev = (await response.json()) as CalendarEvent;
    const link = ev.htmlLink ? ` (${ev.htmlLink})` : '';
    return text(`Event ${args.eventId} updated on ${calendarId}${link}.`);
  }
};

export const deleteEvent: ToolDefinition = {
  title: 'Calendar: Delete Event',
  description:
    "Delete an event by its ID. This is permanent, so only call it when the user has clearly decided to cancel. Requires `eventId`. Attendees are notified of the cancellation per the integration's notification setting. Operates on the artifact's default calendar unless you pass calendarId. Returns confirmation.",
  schema: {
    type: 'object',
    properties: {
      calendarId: {
        type: 'string',
        description: 'Optional calendar ID override.'
      },
      eventId: {
        type: 'string',
        description: 'ID of the event to delete (from calendar-list-events).'
      }
    },
    required: ['eventId']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const config = context.config || {};
    const calendarId = resolveCalendarId(args, context);

    const params = new URLSearchParams();
    const configured = cfgString(config.sendUpdates);
    params.set(
      'sendUpdates',
      configured &&
        utils.constants.CALENDAR_SEND_UPDATES_VALUES.includes(
          configured as never
        )
        ? configured
        : utils.constants.CALENDAR_SEND_UPDATES_ALL
    );

    const response = await calendarFetch(
      auth.token,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(String(args.eventId))}?${params.toString()}`,
      { method: 'DELETE' }
    );
    if (!response.ok && response.status !== 204) {
      return text(
        `Error deleting event: ${await utils.parseHttpErrorMessage(response)}`
      );
    }

    return text(`Event ${args.eventId} deleted from ${calendarId}.`);
  }
};

export const findFreeSlots: ToolDefinition = {
  title: 'Calendar: Find Free Slots',
  description:
    "Find open time gaps on a calendar between timeMin and timeMax (both required ISO 8601) by querying free/busy. The integration may constrain results to configured working hours/days, add a buffer between meetings, enforce a minimum notice and a maximum advance window, and apply a default slot length. Pass durationMinutes to require gaps at least that long. Checks the artifact's default calendar unless you pass calendarId. Typical flow: find-free-slots → create-event. Returns a list of free intervals.",
  schema: {
    type: 'object',
    properties: {
      calendarId: {
        type: 'string',
        description: 'Optional calendar ID override.'
      },
      timeMin: {
        type: 'string',
        description: 'Start of the search window (ISO 8601).'
      },
      timeMax: {
        type: 'string',
        description: 'End of the search window (ISO 8601).'
      },
      durationMinutes: {
        type: 'number',
        minimum: 1,
        description:
          'Minimum gap length in minutes. Falls back to the configured default.'
      }
    },
    required: ['timeMin', 'timeMax']
  },
  handler: async (args, context) => {
    const auth = getAccessToken(context);
    if (!auth.ok) return auth.response;

    const config = context.config || {};
    const calendarId = resolveCalendarId(args, context);
    const timeZone = await resolveTimeZone(args, context);

    let windowStart = new Date(String(args.timeMin));
    let windowEnd = new Date(String(args.timeMax));
    if (
      Number.isNaN(windowStart.getTime()) ||
      Number.isNaN(windowEnd.getTime())
    ) {
      return text(
        'Error: timeMin and timeMax must be valid ISO 8601 timestamps.'
      );
    }

    // Clamp the window by booking policy.
    const now = Date.now();
    const minNoticeHours = cfgNumber(config.minNoticeHours);
    if (minNoticeHours && minNoticeHours > 0) {
      const earliest = now + minNoticeHours * 3600 * 1000;
      if (windowStart.getTime() < earliest) windowStart = new Date(earliest);
    }
    const maxAdvanceDays = cfgNumber(config.maxAdvanceDays);
    if (maxAdvanceDays && maxAdvanceDays > 0) {
      const latest = now + maxAdvanceDays * 86400 * 1000;
      if (windowEnd.getTime() > latest) windowEnd = new Date(latest);
    }
    if (windowStart.getTime() >= windowEnd.getTime()) {
      return text(
        'No free slots: the search window is empty after applying the booking policy (minimum notice / maximum advance).'
      );
    }

    const response = await calendarFetch(auth.token, '/freeBusy', {
      method: 'POST',
      body: JSON.stringify({
        timeMin: windowStart.toISOString(),
        timeMax: windowEnd.toISOString(),
        items: [{ id: calendarId }]
      })
    });
    if (!response.ok) {
      return text(
        `Error querying free/busy: ${await utils.parseHttpErrorMessage(response)}`
      );
    }

    const data = (await response.json()) as {
      calendars?: Record<
        string,
        { busy?: Array<{ start: string; end: string }>; errors?: unknown[] }
      >;
    };
    const calendarData =
      data.calendars?.[calendarId] ??
      (data.calendars ? Object.values(data.calendars)[0] : undefined);

    if (calendarData?.errors && calendarData.errors.length > 0) {
      return text(
        `Error: free/busy lookup failed for ${calendarId} (the calendar may not exist or is not accessible).`
      );
    }

    // Expand each busy block by the configured buffer, then merge overlaps.
    const bufferMs = (cfgNumber(config.bufferMinutes) ?? 0) * 60000;
    const busy = (calendarData?.busy || [])
      .map(b => ({
        start: new Date(new Date(b.start).getTime() - bufferMs),
        end: new Date(new Date(b.end).getTime() + bufferMs)
      }))
      .filter(
        b => !Number.isNaN(b.start.getTime()) && !Number.isNaN(b.end.getTime())
      )
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    const merged: Interval[] = [];
    for (const block of busy) {
      const last = merged[merged.length - 1];
      if (last && block.start.getTime() <= last.end.getTime()) {
        if (block.end.getTime() > last.end.getTime()) last.end = block.end;
      } else {
        merged.push({ start: new Date(block.start), end: new Date(block.end) });
      }
    }

    let free: Interval[] = [];
    let cursor = windowStart;
    for (const block of merged) {
      if (block.start.getTime() > cursor.getTime()) {
        free.push({ start: cursor, end: block.start });
      }
      if (block.end.getTime() > cursor.getTime()) cursor = block.end;
    }
    if (cursor.getTime() < windowEnd.getTime()) {
      free.push({ start: cursor, end: windowEnd });
    }

    // Constrain to working hours/days when configured (requires a time zone).
    const startHour = cfgNumber(config.workingHoursStart);
    const endHour = cfgNumber(config.workingHoursEnd);
    const workingDaysRaw = Array.isArray(config.workingDays)
      ? (config.workingDays as unknown[])
          .map(d => cfgNumber(d))
          .filter((d): d is number => d !== undefined && d >= 0 && d <= 6)
      : [];
    const hasWorkingHours =
      startHour !== undefined && endHour !== undefined && endHour > startHour;
    if (timeZone && (hasWorkingHours || workingDaysRaw.length > 0)) {
      const days =
        workingDaysRaw.length > 0 ? workingDaysRaw : [0, 1, 2, 3, 4, 5, 6];
      const windows = buildWorkingWindows(
        windowStart,
        windowEnd,
        timeZone,
        hasWorkingHours ? startHour! : 0,
        hasWorkingHours ? endHour! : 24,
        days
      );
      free = intersectIntervals(free, windows);
    }

    const minMs =
      (cfgNumber(args.durationMinutes) ??
        cfgNumber(config.defaultDurationMinutes) ??
        0) * 60000;

    const qualifying = free.filter(
      slot => slot.end.getTime() - slot.start.getTime() >= minMs
    );
    if (qualifying.length === 0) {
      return text(
        `No free slots${minMs ? ` of at least ${Math.round(minMs / 60000)} minute(s)` : ''} found on ${calendarId} in that window.`
      );
    }

    const lines = qualifying.map(slot => {
      const mins = Math.round(
        (slot.end.getTime() - slot.start.getTime()) / 60000
      );
      return `- ${formatInstant(slot.start, timeZone)} → ${formatInstant(slot.end, timeZone)} (${mins} min)`;
    });
    return text(
      `Found ${qualifying.length} free slot(s) on ${calendarId}:\n\n${lines.join('\n')}`
    );
  }
};
