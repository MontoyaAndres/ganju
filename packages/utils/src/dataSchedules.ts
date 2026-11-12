// Schedules: triggers that fire on the clock ("every day at 21:00", "every
// Monday at 08:00") in the database's time zone, with no row changing. The
// object's alarm wakes at the next due time and stores one event, in the same
// transaction that records the time as done, so none fires twice.
import { isoSeconds, localDatetime } from './dataCompiler';
import { DataError } from './dataTypes';

export const DATA_SCHEDULE_EVERY = ['day', 'week'] as const;
export type DataScheduleEvery = (typeof DATA_SCHEDULE_EVERY)[number];
// Sunday first, as Date's getUTCDay counts.
export const DATA_SCHEDULE_DAYS = [
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat'
] as const;
export type DataScheduleDay = (typeof DATA_SCHEDULE_DAYS)[number];

export const DATA_MAX_SCHEDULES = 5;
// A due time missed by up to this much (the object was down, a deploy) still
// runs once, late; older ones are skipped.
export const DATA_SCHEDULE_CATCH_UP_MS = 6 * 3_600_000;
// Rows of the saved query an event carries, and their size in UTF-8 bytes.
export const DATA_SCHEDULE_MAX_ROWS = 200;
export const DATA_SCHEDULE_MAX_ROW_BYTES = 48_000;
// The values a schedule's query parameters can take from the run itself, in
// the database's time zone.
// `today_start` / `today_end` bound the run's local day as UTC times, for a
// datetime column such as created_at.
export const DATA_SCHEDULE_PARAM_VALUES = [
  '{{today}}',
  '{{yesterday}}',
  '{{today_start}}',
  '{{today_end}}',
  '{{now}}'
] as const;

export interface DataScheduleClock {
  every: DataScheduleEvery;
  // "21:00", 24-hour.
  at: string;
  // With "week" only; Monday when left out.
  days: DataScheduleDay[] | null;
}

const AT_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const normaliseClock = (
  input: Record<string, unknown>
): DataScheduleClock => {
  const every = input.every;
  if (!(DATA_SCHEDULE_EVERY as readonly unknown[]).includes(every)) {
    throw new DataError('A schedule needs "every": "day" or "week".');
  }
  const at = typeof input.at === 'string' ? input.at.trim() : '';
  if (!AT_PATTERN.test(at)) {
    throw new DataError(
      '"at" is a time of day, 24-hour, such as "21:00" or "08:30".'
    );
  }
  const raw = input.days;
  if (raw === undefined || raw === null) {
    return {
      every: every as DataScheduleEvery,
      at,
      days: every === 'week' ? ['mon'] : null
    };
  }
  if (every !== 'week') {
    throw new DataError('"days" is for "every": "week" only.');
  }
  const list = Array.isArray(raw) ? raw : [raw];
  const days = list.map(day =>
    typeof day === 'string' ? day.trim().toLowerCase().slice(0, 3) : ''
  );
  if (
    days.length === 0 ||
    !days.every(day => (DATA_SCHEDULE_DAYS as readonly string[]).includes(day))
  ) {
    throw new DataError(
      '"days" is a list of mon, tue, wed, thu, fri, sat and sun.'
    );
  }
  // Kept in week order, each once.
  const set = new Set(days);
  return {
    every: 'week',
    at,
    days: DATA_SCHEDULE_DAYS.filter(day => set.has(day))
  };
};

// The calendar date `at` is on in `timeZone`, as YYYY-MM-DD.
export const localDate = (at: Date, timeZone?: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(at);

const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

const runsOn = (clock: DataScheduleClock, date: string) =>
  clock.every === 'day' ||
  (clock.days ?? ['mon']).includes(
    DATA_SCHEDULE_DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]
  );

// The due time on `date` (local), or null on a day it doesn't run or a time
// a daylight-saving change skips.
const dueOn = (
  clock: DataScheduleClock,
  date: string,
  timeZone?: string
): Date | null => {
  if (!runsOn(clock, date)) return null;
  const at = localDatetime(`${date}T${clock.at}:00`, timeZone);
  return at && !Number.isNaN(at.getTime()) ? at : null;
};

/** The latest due time at or before `now`, within the last eight days. */
export const previousDue = (
  clock: DataScheduleClock,
  now: Date,
  timeZone?: string
): Date | null => {
  const today = localDate(now, timeZone);
  for (let back = 0; back <= 8; back++) {
    const due = dueOn(clock, shiftDate(today, -back), timeZone);
    if (due && due.getTime() <= now.getTime()) return due;
  }
  return null;
};

/** The first due time after `now`. */
export const nextDue = (
  clock: DataScheduleClock,
  now: Date,
  timeZone?: string
): Date | null => {
  const today = localDate(now, timeZone);
  for (let ahead = -1; ahead <= 8; ahead++) {
    const due = dueOn(clock, shiftDate(today, ahead), timeZone);
    if (due && due.getTime() > now.getTime()) return due;
  }
  return null;
};

export type DataScheduleStep =
  // Fire for this due time.
  | { kind: 'run'; dueAt: string }
  // A due time came and went too long ago: skip it.
  | { kind: 'skip'; dueAt: string }
  | { kind: 'wait' };

/**
 * What a check at `now` does, given the last due time handled (`through`).
 * Only the latest due time is looked at, so a long outage runs at most one
 * late event.
 */
export const scheduleStep = (
  clock: DataScheduleClock,
  through: string,
  now: Date,
  timeZone?: string
): DataScheduleStep => {
  const due = previousDue(clock, now, timeZone);
  if (!due) return { kind: 'wait' };
  const dueAt = isoSeconds(due);
  if (dueAt <= through) return { kind: 'wait' };
  return now.getTime() - due.getTime() <= DATA_SCHEDULE_CATCH_UP_MS
    ? { kind: 'run', dueAt }
    : { kind: 'skip', dueAt };
};

/** A schedule's query parameters, with {{today}}, {{yesterday}} and {{now}} filled in for the run. */
export const scheduleParams = (
  params: Record<string, unknown> | null,
  due: Date,
  timeZone?: string
): Record<string, unknown> => {
  const today = localDate(due, timeZone);
  const midnight = (date: string) =>
    localDatetime(`${date}T00:00:00`, timeZone)?.toISOString() ?? '';
  const values: Record<string, string> = {
    '{{today}}': today,
    '{{yesterday}}': shiftDate(today, -1),
    '{{today_start}}': midnight(today),
    '{{today_end}}': midnight(shiftDate(today, 1)),
    '{{now}}': due.toISOString()
  };
  return Object.fromEntries(
    Object.entries(params ?? {}).map(([key, value]) => [
      key,
      typeof value === 'string' && value.trim() in values
        ? values[value.trim()]
        : value
    ])
  );
};

const cell = (value: unknown) =>
  value === null || value === undefined
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);

/**
 * A schedule's rows as plain text for an email: one line per row,
 * "column: value · column: value", and a last line when some were left out.
 */
export const scheduleRowsText = (
  rows: Record<string, unknown>[],
  rowCount: number
): string => {
  const lines = rows.map(row =>
    Object.entries(row)
      .map(([key, value]) => `${key}: ${cell(value)}`)
      .join(' · ')
  );
  if (rowCount > rows.length) lines.push(`… (${rows.length} / ${rowCount})`);
  return lines.join('\n');
};
