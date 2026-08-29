import { utils } from '@ganju/utils';

import { ToolContext, ToolDefinition } from '../types';
import {
  resolveEffectiveTimeZone,
  refreshVendorTimeZoneIfStale
} from '../timeZone';

const CALCOM_API_BASE = utils.constants.CALCOM_API_BASE;

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

// The Cal.com API key is stored like any other credential — the MCP server
// filters credentials to this tool group's provider, so credentials[0] is it.
const getApiKey = (
  context: ToolContext
): { ok: true; key: string } | { ok: false; response: ToolResult } => {
  const credential = context.credentials[0];
  if (!credential) {
    return {
      ok: false,
      response: text(
        'Error: Cal.com is not connected. Add your Cal.com API key on the Tools page.'
      )
    };
  }
  return { ok: true, key: credential.accessToken };
};

// The artifact owner locks the event type on config; the model may override it
// via an explicit eventTypeId arg (escape hatch).
const resolveEventTypeId = (
  args: Record<string, unknown>,
  context: ToolContext
): number | undefined =>
  cfgNumber(args.eventTypeId) ?? cfgNumber(context.config?.defaultEventTypeId);

// Explicit arg, then the group-level default, then the zone on the connected
// Cal.com profile — the one the host's availability is written in, read from
// `GET /v2/me` and cached on the credential.
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
    utils.fetchCalcomTimeZone
  );
  return resolveEffectiveTimeZone(args, context);
};

interface CalcomResponse {
  status?: string;
  data?: unknown;
  error?: { message?: string; details?: unknown };
}

const calcomFetch = async (
  apiKey: string,
  path: string,
  version: string,
  init?: RequestInit
): Promise<Response> => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'cal-api-version': version,
    Accept: 'application/json',
    ...((init?.headers as Record<string, string>) || {})
  };
  if (init?.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(`${CALCOM_API_BASE}${path}`, { ...init, headers });
};

// Cal.com wraps every response in { status, data, error }. Centralize the
// success/error unwrap so each tool only deals with `data`.
const callCalcom = async (
  apiKey: string,
  path: string,
  version: string,
  init?: RequestInit
): Promise<{ ok: true; data: any } | { ok: false; error: string }> => {
  const response = await calcomFetch(apiKey, path, version, init);
  if (!response.ok) {
    return { ok: false, error: await utils.parseHttpErrorMessage(response) };
  }
  const body = (await response.json().catch(() => ({}))) as CalcomResponse;
  if (body.status === 'error') {
    return { ok: false, error: body.error?.message || 'unknown Cal.com error' };
  }
  return { ok: true, data: body.data };
};

export const listEventTypes: ToolDefinition = {
  title: 'Cal.com: List Event Types',
  description:
    'List the event types on the connected Cal.com account (the bookable meeting templates, e.g. "30 Min Meeting"). Returns each event type\'s ID, title, duration, and slug. Call this to discover the eventTypeId the artifact owner should lock as the default, or to find a specific event type\'s ID before passing it as the eventTypeId override to the other Cal.com tools.',
  schema: { type: 'object', properties: {} },
  handler: async (_args, context) => {
    const auth = getApiKey(context);
    if (!auth.ok) return auth.response;

    const result = await callCalcom(
      auth.key,
      '/event-types',
      utils.constants.CALCOM_API_VERSION_EVENT_TYPES
    );
    if (!result.ok) {
      return text(`Error listing event types: ${result.error}`);
    }

    const items: Array<{
      id?: number;
      title?: string;
      slug?: string;
      lengthInMinutes?: number;
      length?: number;
    }> = Array.isArray(result.data) ? result.data : [];
    if (items.length === 0) return text('No event types found.');

    const lines = items.map(et => {
      const minutes = et.lengthInMinutes ?? et.length;
      const duration = minutes ? `${minutes} min` : 'unknown duration';
      return `- ${et.title || '(untitled)'} (${duration}) | slug: ${et.slug || '?'} | ID: ${et.id}`;
    });
    return text(`Found ${items.length} event type(s):\n\n${lines.join('\n')}`);
  }
};

export const listAvailableSlots: ToolDefinition = {
  title: 'Cal.com: List Available Slots',
  description:
    "Find open booking slots for a Cal.com event type between start and end (both required ISO 8601, UTC). The event type is the artifact's default unless you pass eventTypeId. Pass timeZone (IANA) to return slots in that zone — otherwise the configured default zone is used. Use this to confirm availability before calcom-create-booking; the typical flow is list-available-slots → create-booking. Returns the open start times.",
  schema: {
    type: 'object',
    properties: {
      eventTypeId: {
        type: 'number',
        description:
          "Optional event type ID override. Defaults to the artifact's configured event type."
      },
      start: {
        type: 'string',
        description:
          'Start of the search window as an ISO 8601 timestamp (UTC).'
      },
      end: {
        type: 'string',
        description: 'End of the search window as an ISO 8601 timestamp (UTC).'
      },
      timeZone: {
        type: 'string',
        description:
          'Optional IANA time zone for the returned slots (e.g. "America/New_York").'
      }
    },
    required: ['start', 'end']
  },
  handler: async (args, context) => {
    const auth = getApiKey(context);
    if (!auth.ok) return auth.response;

    const eventTypeId = resolveEventTypeId(args, context);
    if (eventTypeId === undefined) {
      return text(
        'Error: no event type. Set a default event type for this integration or pass eventTypeId (see calcom-list-event-types).'
      );
    }
    const timeZone = await resolveTimeZone(args, context);

    const params = new URLSearchParams();
    params.set('eventTypeId', String(eventTypeId));
    params.set('start', String(args.start));
    params.set('end', String(args.end));
    if (timeZone) params.set('timeZone', timeZone);

    const result = await callCalcom(
      auth.key,
      `/slots?${params.toString()}`,
      utils.constants.CALCOM_API_VERSION_SLOTS
    );
    if (!result.ok) {
      return text(`Error listing slots: ${result.error}`);
    }

    // data is an object keyed by date → array of { start }.
    const byDate = (result.data || {}) as Record<
      string,
      Array<{ start?: string }>
    >;
    const slots: string[] = [];
    for (const date of Object.keys(byDate)) {
      for (const slot of byDate[date] || []) {
        if (slot.start) slots.push(slot.start);
      }
    }
    if (slots.length === 0) {
      return text('No available slots in that window.');
    }

    const shown = slots.slice(0, 50);
    const more =
      slots.length > shown.length
        ? `\n…and ${slots.length - shown.length} more.`
        : '';
    return text(
      `Found ${slots.length} available slot(s) for event type ${eventTypeId}:\n\n${shown
        .map(s => `- ${s}`)
        .join('\n')}${more}`
    );
  }
};

export const createBooking: ToolDefinition = {
  title: 'Cal.com: Create Booking',
  description:
    "Book a Cal.com slot. Pass `start` (ISO 8601, UTC — one of the times returned by calcom-list-available-slots) and the attendee's `name` and `email`. The event type is the artifact's default unless you pass eventTypeId. Pass attendeeTimeZone (IANA) whenever the conversation reveals where the attendee is — it is what their confirmation and reminders are rendered in. Omitted, it falls back to the zone configured on the connected Cal.com account, which is a guess about the attendee rather than a fact. In a channel conversation the attendee name/email come from the participant. Returns the booking UID (needed for calcom-cancel-booking) and status.",
  schema: {
    type: 'object',
    properties: {
      eventTypeId: {
        type: 'number',
        description:
          "Optional event type ID override. Defaults to the artifact's configured event type."
      },
      start: {
        type: 'string',
        description:
          'Slot start as an ISO 8601 timestamp (UTC), from calcom-list-available-slots.'
      },
      name: { type: 'string', description: "Attendee's full name." },
      email: { type: 'string', description: "Attendee's email address." },
      attendeeTimeZone: {
        type: 'string',
        description:
          'Attendee IANA time zone (e.g. "America/New_York"). Defaults to the configured zone.'
      },
      notes: {
        type: 'string',
        description: 'Optional note stored with the booking.'
      }
    },
    required: ['start', 'name', 'email']
  },
  handler: async (args, context) => {
    const auth = getApiKey(context);
    if (!auth.ok) return auth.response;

    const eventTypeId = resolveEventTypeId(args, context);
    if (eventTypeId === undefined) {
      return text(
        'Error: no event type. Set a default event type for this integration or pass eventTypeId (see calcom-list-event-types).'
      );
    }
    // The attendee's zone, which is genuinely not the same question as the
    // host's — we are booking on behalf of whoever is in the conversation, and
    // nothing tells us where they are. The host's configured zone is the best
    // available guess (a local business books local customers) and is a far
    // better one than the 'UTC' this used to hardcode, which silently confirmed
    // every booking in a zone nobody lives in. An explicit `attendeeTimeZone`
    // still wins, and the model should pass one whenever the conversation
    // reveals it.
    await refreshVendorTimeZoneIfStale(
      context,
      context.credentials[0],
      utils.fetchCalcomTimeZone
    );
    const timeZone =
      cfgString(args.attendeeTimeZone) ||
      cfgString(context.config?.defaultTimeZone) ||
      utils.readCredentialTimeZone(context.credentials[0]?.metadata) ||
      'UTC';

    const body: Record<string, unknown> = {
      start: String(args.start),
      eventTypeId,
      attendee: {
        name: String(args.name),
        email: String(args.email),
        timeZone
      }
    };
    const notes = cfgString(args.notes);
    if (notes) body.metadata = { notes };

    const result = await callCalcom(
      auth.key,
      '/bookings',
      utils.constants.CALCOM_API_VERSION_BOOKINGS,
      { method: 'POST', body: JSON.stringify(body) }
    );
    if (!result.ok) {
      return text(`Error creating booking: ${result.error}`);
    }

    const booking = (result.data || {}) as {
      uid?: string;
      status?: string;
      start?: string;
      end?: string;
    };
    const when =
      booking.start && booking.end ? ` ${booking.start} → ${booking.end}` : '';
    return text(
      `Booking created. UID: ${booking.uid || 'unknown'} | status: ${booking.status || 'unknown'}${when}`
    );
  }
};

export const cancelBooking: ToolDefinition = {
  title: 'Cal.com: Cancel Booking',
  description:
    'Cancel a Cal.com booking by its UID (returned when the booking was created, or surfaced elsewhere). Only call this when the user has clearly decided to cancel — the attendee is notified. Optionally pass a reason. Returns confirmation.',
  schema: {
    type: 'object',
    properties: {
      bookingUid: {
        type: 'string',
        description:
          'UID of the booking to cancel (from calcom-create-booking).'
      },
      reason: {
        type: 'string',
        description: 'Optional cancellation reason shown to the attendee.'
      }
    },
    required: ['bookingUid']
  },
  handler: async (args, context) => {
    const auth = getApiKey(context);
    if (!auth.ok) return auth.response;

    const uid = String(args.bookingUid);
    const result = await callCalcom(
      auth.key,
      `/bookings/${encodeURIComponent(uid)}/cancel`,
      utils.constants.CALCOM_API_VERSION_BOOKINGS,
      {
        method: 'POST',
        body: JSON.stringify({
          cancellationReason: cfgString(args.reason) || 'Cancelled by assistant'
        })
      }
    );
    if (!result.ok) {
      return text(`Error cancelling booking: ${result.error}`);
    }

    return text(`Booking ${uid} cancelled.`);
  }
};
