import type { ToolContext } from '@ganju/sdk';

/**
 * Google Calendar, as the project's connected account.
 *
 * `ctx.connection('google-calendar')` hands over a short-lived access token for
 * the account connected on the Tools page. The refresh token never leaves the
 * platform, and the platform refreshes the access token when it is close to
 * expiring, so this code never deals with OAuth at all. It only works because
 * `google-calendar` is listed in `connections` in `ganju.json`.
 */

const API = 'https://www.googleapis.com/calendar/v3';

export const calendar = async <T>(
  ctx: ToolContext,
  path: string,
  body?: unknown
): Promise<T> => {
  const { accessToken } = await ctx.connection('google-calendar');

  const response = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  if (!response.ok) {
    const detail = (
      (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null
    )?.error?.message;
    throw new Error(
      `Google Calendar answered ${response.status}${detail ? ` — ${detail}` : ''}`
    );
  }
  return (await response.json()) as T;
};

/** The time zone the person's calendar is set to, e.g. "Europe/Madrid". */
export const calendarTimeZone = async (ctx: ToolContext): Promise<string> => {
  const setting = await calendar<{ value: string }>(
    ctx,
    '/users/me/settings/timezone'
  );
  return setting.value;
};

export interface Busy {
  start: string;
  end: string;
}

/** The busy blocks on the primary calendar between two instants. */
export const busyBetween = async (
  ctx: ToolContext,
  from: Date,
  to: Date
): Promise<Busy[]> => {
  const result = await calendar<{
    calendars: Record<string, { busy?: Busy[]; errors?: unknown[] }>;
  }>(ctx, '/freeBusy', {
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    items: [{ id: 'primary' }]
  });

  const primary = result.calendars.primary;
  if (primary?.errors?.length) {
    throw new Error('Google could not read the primary calendar');
  }
  return primary?.busy ?? [];
};
