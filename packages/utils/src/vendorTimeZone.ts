// The time zone the user configured with the vendor, and where we keep it.
//
// Every scheduling question the model answers is a time-zone question first:
// "tomorrow at 9" is not an instant until you know whose 9 it is. We had two
// sources for that and neither worked. `artifact_tool.config.defaultTimeZone`
// is only written when the owner opens a dropdown and changes it, so in
// practice it is empty. The fallbacks underneath it were `undefined` (Google
// then uses the calendar's own zone, which only helps when the timestamp has no
// offset) and the string 'UTC' (Cal.com, which books the attendee in UTC and
// tells nobody).
//
// But the user already answered this question — in Google Calendar's settings,
// and in their Cal.com profile. So we ask the vendor instead of asking the
// owner again, and the answer becomes the default under any explicit choice.
//
// It is cached on `artifact_credential.metadata` because that is what it is a
// property of: the connected account, not the tool row. One artifact can have
// six calendar tools installed and they all share one connection, so the
// connection is the only place the answer belongs exactly once.

import { constants } from './constants';

// Metadata keys on artifact_credential. Namespaced with a prefix that will not
// collide with the reauth markers written by the OAuth refresh path.
const TIME_ZONE_KEY = 'timeZone';
const TIME_ZONE_CHECKED_AT_KEY = 'timeZoneCheckedAt';

// How long a cached zone is trusted. A day, because this changes when somebody
// moves or travels — rarely, and never urgently. The cost of being briefly
// stale is one meeting in the old zone; the cost of a shorter TTL is a vendor
// round trip on the path of a tool call.
const TIME_ZONE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Is this a time zone the runtime actually knows?
 *
 * Everything downstream — `Intl.DateTimeFormat`, Google's `start.timeZone`,
 * Cal.com's `attendee.timeZone` — throws or 400s on a name it cannot resolve.
 * A vendor returning something unexpected must degrade to "we don't know"
 * rather than poison every later call with a value that cannot be used.
 */
export const isValidTimeZone = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
};

/** The cached zone on a credential's metadata, or null. */
export const readCredentialTimeZone = (metadata: unknown): string | null => {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>)[TIME_ZONE_KEY];
  return isValidTimeZone(value) ? value.trim() : null;
};

/**
 * Should we ask the vendor again?
 *
 * True when there is nothing cached, when the stamp is missing or unreadable,
 * or when the TTL has passed. A cache with no stamp is treated as stale rather
 * than as fresh-forever — the conservative direction, since the only cost is
 * one request.
 */
export const credentialTimeZoneIsStale = (
  metadata: unknown,
  now: number = Date.now()
): boolean => {
  if (!readCredentialTimeZone(metadata)) return true;
  const raw = (metadata as Record<string, unknown>)[TIME_ZONE_CHECKED_AT_KEY];
  if (typeof raw !== 'string') return true;
  const checkedAt = Date.parse(raw);
  if (!Number.isFinite(checkedAt)) return true;
  return now - checkedAt >= TIME_ZONE_TTL_MS;
};

/**
 * Merge a freshly read zone into a credential's metadata.
 *
 * Merges rather than replaces, because this column also carries the reauth
 * markers — writing a bare `{ timeZone }` here would clear `needsReauth` and
 * silently re-enable a connection the refresh path had flagged as broken.
 *
 * A null zone (the vendor could not tell us) still stamps the check, so a
 * provider that never reports one is asked once a day rather than on every
 * single call.
 */
export const writeCredentialTimeZone = (
  previous: unknown,
  timeZone: string | null,
  now: Date = new Date()
): Record<string, unknown> => {
  const base =
    previous && typeof previous === 'object'
      ? { ...(previous as Record<string, unknown>) }
      : {};
  if (isValidTimeZone(timeZone)) {
    base[TIME_ZONE_KEY] = timeZone.trim();
  } else {
    delete base[TIME_ZONE_KEY];
  }
  base[TIME_ZONE_CHECKED_AT_KEY] = now.toISOString();
  return base;
};

/**
 * The zone Google Calendar is configured in, from the primary calendar.
 *
 * Deliberately NOT `GET /users/me/settings/timezone`, which is the more
 * direct answer to "what did the user configure" and needs
 * `calendar.settings.readonly` — a scope we do not request and could not add
 * without sending every already-connected user back through consent. The
 * primary calendar's zone is the same value in every case that matters, and
 * `calendar.readonly` already covers it.
 *
 * Returns null on any failure. Not knowing the zone is a state the callers
 * handle; a throw here would take a tool call or a chat turn with it.
 */
export const fetchGoogleCalendarTimeZone = async (
  accessToken: string
): Promise<string | null> => {
  try {
    const response = await fetch(
      `${constants.GOOGLE_CALENDAR_API_BASE}/calendars/primary`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        }
      }
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as { timeZone?: unknown };
    return isValidTimeZone(payload?.timeZone) ? payload.timeZone.trim() : null;
  } catch {
    return null;
  }
};

/**
 * The zone on the connected Cal.com profile.
 *
 * This is the host's zone — the one their availability is written in — which
 * is what "9am" means when the artifact owner or their bot says it. It is not
 * the attendee's zone; see the booking handler for why we use it there anyway.
 *
 * Same null-on-failure contract as the Google reader above.
 */
export const fetchCalcomTimeZone = async (
  apiKey: string
): Promise<string | null> => {
  try {
    const response = await fetch(`${constants.CALCOM_API_BASE}/me`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'cal-api-version': constants.CALCOM_API_VERSION_ME,
        Accept: 'application/json'
      }
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      data?: { timeZone?: unknown };
    };
    const value = payload?.data?.timeZone;
    return isValidTimeZone(value) ? value.trim() : null;
  } catch {
    return null;
  }
};
