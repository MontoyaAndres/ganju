import { defineTool } from '@ganju/sdk';

import { busyBetween, calendarTimeZone } from './lib/google';
import { clock, zonedTime } from './lib/time';

/**
 * The open slots on one day that are long enough for a meeting.
 *
 * Asks Google when the calendar is busy, then walks the working day and keeps
 * every gap of at least `durationMinutes`. Only free/busy is read, never event
 * titles or attendees, so nothing private ends up in the conversation.
 */
export default defineTool<{
  date: string;
  durationMinutes: number;
  startHour?: number;
  endHour?: number;
}>(async (input, ctx) => {
  const startHour = Math.round(input.startHour ?? 9);
  const endHour = Math.round(input.endHour ?? 17);
  if (endHour <= startHour) {
    throw new Error('The working day has to end after it starts');
  }
  const minutes = Math.round(input.durationMinutes);

  // Hours are the person's local hours, so the calendar's own time zone
  // decides what "9 to 5" means.
  const timeZone = await calendarTimeZone(ctx);
  const dayStart = zonedTime(input.date, startHour, timeZone);
  const dayEnd = zonedTime(input.date, endHour, timeZone);

  const busy = (await busyBetween(ctx, dayStart, dayEnd))
    .map(block => ({ start: new Date(block.start), end: new Date(block.end) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // Walk the day: every stretch between the end of one busy block and the
  // start of the next is free.
  const free: Array<{ start: string; end: string; minutes: number }> = [];
  let cursor = dayStart;

  for (const block of [...busy, { start: dayEnd, end: dayEnd }]) {
    const gap = (block.start.getTime() - cursor.getTime()) / 60_000;
    if (gap >= minutes) {
      free.push({
        start: clock(cursor, timeZone),
        end: clock(block.start, timeZone),
        minutes: gap
      });
    }
    if (block.end > cursor) cursor = block.end;
  }

  ctx.log(
    `${input.date} ${startHour}:00–${endHour}:00 ${timeZone}: ${busy.length} busy, ${free.length} free`
  );

  return {
    date: input.date,
    timeZone,
    busy: busy.map(block => ({
      start: clock(block.start, timeZone),
      end: clock(block.end, timeZone)
    })),
    free
  };
});
