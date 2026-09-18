/**
 * Wall-clock time in a named time zone, with nothing but `Intl`.
 *
 * "9:00 in America/Bogota on 2026-09-21" has to become an exact instant before
 * Google will answer a free/busy question about it, and a Worker has no date
 * library to do that. `Intl.DateTimeFormat` knows every zone's offset,
 * including daylight saving, so the offset is read from it rather than
 * hard-coded.
 */

/** How far `timeZone` is ahead of UTC at `instant`, in milliseconds. */
const offsetAt = (instant: number, timeZone: string): number => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
      .formatToParts(new Date(instant))
      .map(part => [part.type, part.value])
  );

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
};

/**
 * The instant at which it is `hour`:00 on `date` (YYYY-MM-DD) in `timeZone`.
 *
 * Checked twice because the first guess uses the offset of the wrong instant,
 * which is off by an hour on the days the clocks change.
 */
export const zonedTime = (
  date: string,
  hour: number,
  timeZone: string
): Date => {
  const [year, month, day] = date.split('-').map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour);

  const first = wallClock - offsetAt(wallClock, timeZone);
  const second = wallClock - offsetAt(first, timeZone);
  return new Date(second);
};

/** "14:30", as the clock in `timeZone` shows it. */
export const clock = (instant: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(instant);
