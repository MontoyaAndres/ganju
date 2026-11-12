// Schedules: triggers on the clock, in the database's time zone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  createTable,
  loadSchema,
  migrateInternal,
  setMeta,
  write
} from '../src/dataEngine.ts';
import type { SqlRow, SqlRunner } from '../src/dataEngine.ts';
import {
  nextScheduleAt,
  readOutbox,
  saveTrigger,
  scanSchedules,
  setTriggerEnabled
} from '../src/dataTriggers.ts';
import type { DataTriggerEventMessage } from '../src/dataTriggers.ts';
import { listQueries, runDraftQuery, saveQuery } from '../src/dataQueries.ts';
import {
  nextDue,
  normaliseClock,
  previousDue,
  scheduleParams,
  scheduleRowsText,
  scheduleStep
} from '../src/dataSchedules.ts';
import type { DataCaller } from '../src/dataTypes.ts';

const OWNER: DataCaller = { actor: 'user:owner' };
const BOGOTA = 'America/Bogota';

const open = () => {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const runner: SqlRunner = {
    all: (sql, params = []) =>
      (db.prepare(sql).all(...(params as never[])) as SqlRow[]).map(row => ({
        ...row
      })),
    iterate: (sql, params = []) =>
      db.prepare(sql).iterate(...(params as never[])) as Iterable<SqlRow>,
    transaction: fn => {
      const name = `sp_${depth++}`;
      db.exec(`SAVEPOINT ${name}`);
      try {
        const result = fn();
        db.exec(`RELEASE ${name}`);
        return result;
      } catch (error) {
        db.exec(`ROLLBACK TO ${name}`);
        db.exec(`RELEASE ${name}`);
        throw error;
      } finally {
        depth--;
      }
    },
    databaseSize: () => 0
  };
  migrateInternal(runner);
  setMeta(runner, 'artifact_id', 'art_1');
  setMeta(runner, 'time_zone', BOGOTA);
  return runner;
};

const bakery = () => {
  const runner = open();
  const s = () => loadSchema(runner);
  createTable(runner, s(), OWNER, {
    name: 'orders',
    access: 'full',
    columns: [
      { name: 'customer', type: 'text' },
      { name: 'total', type: 'integer' }
    ]
  });
  write(runner, s(), OWNER, {
    operations: [
      {
        op: 'insert',
        table: 'orders',
        rows: [
          { customer: 'Ana', total: 12000 },
          { customer: 'Luis', total: 8000 }
        ]
      }
    ]
  });
  saveQuery(runner, s(), OWNER, {
    name: 'days_orders',
    sql: 'SELECT customer, total, :day AS day FROM orders ORDER BY id',
    params: [{ name: 'day', type: 'date' }]
  });
  return { runner, s };
};

const NIGHTLY = {
  name: 'nightly-orders',
  on: 'schedule',
  every: 'day',
  at: '21:00',
  query: 'days_orders',
  params: { day: '{{today}}' },
  email: { to: 'owner@example.com', text: '{{count}} orders on {{date}}.' }
};

const events = (runner: SqlRunner): DataTriggerEventMessage[] =>
  readOutbox(runner, 1000).map(e => e.message);

// As if the schedule was saved at `iso`.
const savedAt = (runner: SqlRunner, iso: string) =>
  runner.all(
    "UPDATE _ganju_triggers SET scan_state = ? WHERE event = 'schedule'",
    [JSON.stringify({ through: iso })]
  );

test('the clock: every day or on chosen weekdays, at a time of day', () => {
  assert.deepEqual(normaliseClock({ every: 'day', at: '21:00' }), {
    every: 'day',
    at: '21:00',
    days: null
  });
  assert.deepEqual(normaliseClock({ every: 'week', at: '08:30' }).days, [
    'mon'
  ]);
  assert.deepEqual(
    normaliseClock({
      every: 'week',
      at: '08:30',
      days: ['Friday', 'mon', 'mon']
    }).days,
    ['mon', 'fri']
  );
  assert.throws(
    () => normaliseClock({ every: 'hour', at: '08:00' }),
    /"day" or "week"/
  );
  assert.throws(() => normaliseClock({ every: 'day', at: '9pm' }), /24-hour/);
  assert.throws(() => normaliseClock({ every: 'day', at: '24:00' }), /24-hour/);
  assert.throws(
    () => normaliseClock({ every: 'day', at: '08:00', days: ['mon'] }),
    /"week" only/
  );
  assert.throws(
    () => normaliseClock({ every: 'week', at: '08:00', days: ['someday'] }),
    /mon, tue/
  );
});

test('due times are in the database time zone', () => {
  const clock = normaliseClock({ every: 'day', at: '21:00' });
  // 21:00 in Bogota (UTC-5) is 02:00 UTC the next day.
  const now = new Date('2026-11-11T01:00:00Z');
  assert.equal(
    nextDue(clock, now, BOGOTA)?.toISOString(),
    '2026-11-11T02:00:00.000Z'
  );
  assert.equal(
    previousDue(clock, now, BOGOTA)?.toISOString(),
    '2026-11-10T02:00:00.000Z'
  );
  // Mondays at 08:00: Wednesday 2026-11-11 is followed by Monday the 16th.
  const weekly = normaliseClock({ every: 'week', at: '08:00', days: ['mon'] });
  assert.equal(
    nextDue(weekly, now, BOGOTA)?.toISOString(),
    '2026-11-16T13:00:00.000Z'
  );
  assert.equal(
    previousDue(weekly, now, BOGOTA)?.toISOString(),
    '2026-11-09T13:00:00.000Z'
  );
  // A zone with daylight saving keeps the wall-clock time across the change.
  const ny = normaliseClock({ every: 'day', at: '09:00' });
  assert.equal(
    nextDue(
      ny,
      new Date('2026-03-07T20:00:00Z'),
      'America/New_York'
    )?.toISOString(),
    '2026-03-08T13:00:00.000Z'
  );
  assert.equal(
    nextDue(
      ny,
      new Date('2026-03-06T20:00:00Z'),
      'America/New_York'
    )?.toISOString(),
    '2026-03-07T14:00:00.000Z'
  );
});

test('a due time runs once, late within six hours, and is skipped after', () => {
  const clock = normaliseClock({ every: 'day', at: '21:00' });
  const through = '2026-11-10T03:00:00Z';
  assert.deepEqual(
    scheduleStep(clock, through, new Date('2026-11-11T01:00:00Z'), BOGOTA),
    { kind: 'wait' }
  );
  assert.deepEqual(
    scheduleStep(clock, through, new Date('2026-11-11T02:00:00Z'), BOGOTA),
    { kind: 'run', dueAt: '2026-11-11T02:00:00Z' }
  );
  assert.deepEqual(
    scheduleStep(clock, through, new Date('2026-11-11T07:59:00Z'), BOGOTA),
    { kind: 'run', dueAt: '2026-11-11T02:00:00Z' }
  );
  assert.deepEqual(
    scheduleStep(clock, through, new Date('2026-11-11T08:01:00Z'), BOGOTA),
    { kind: 'skip', dueAt: '2026-11-11T02:00:00Z' }
  );
  assert.deepEqual(
    scheduleStep(
      clock,
      '2026-11-11T02:00:00Z',
      new Date('2026-11-11T03:00:00Z'),
      BOGOTA
    ),
    { kind: 'wait' }
  );
});

test('query parameters take the run date', () => {
  const due = new Date('2026-11-11T02:00:00Z');
  assert.deepEqual(
    scheduleParams(
      {
        day: '{{today}}',
        before: '{{yesterday}}',
        from: '{{today_start}}',
        to: '{{today_end}}',
        at: '{{now}}',
        fixed: 'x'
      },
      due,
      BOGOTA
    ),
    {
      day: '2026-11-10',
      before: '2026-11-09',
      from: '2026-11-10T05:00:00.000Z',
      to: '2026-11-11T05:00:00.000Z',
      at: '2026-11-11T02:00:00.000Z',
      fixed: 'x'
    }
  );
});

test('a schedule fires one event with its query rows, and not again for that time', () => {
  const { runner, s } = bakery();
  const { trigger } = saveTrigger(runner, s(), OWNER, NIGHTLY);
  assert.equal(trigger.on, 'schedule');
  assert.equal(trigger.every, 'day');
  assert.equal(trigger.at, '21:00');
  assert.equal(trigger.query, 'days_orders');
  assert.equal(trigger.table, '');
  assert.equal(
    trigger.action.type === 'email' && trigger.action.subject,
    'days_orders: {{date}}'
  );
  savedAt(runner, '2026-11-10T12:00:00Z');

  assert.equal(scanSchedules(runner, s(), new Date('2026-11-11T01:59:00Z')), 0);
  assert.equal(scanSchedules(runner, s(), new Date('2026-11-11T02:03:00Z')), 1);
  assert.equal(scanSchedules(runner, s(), new Date('2026-11-11T02:08:00Z')), 0);
  const [event] = events(runner);
  assert.equal(event.event, 'schedule');
  assert.equal(event.triggerName, 'nightly-orders');
  assert.equal(event.dueAt, '2026-11-11T02:00:00Z');
  assert.equal(event.date, '2026-11-10');
  assert.equal(event.query, 'days_orders');
  assert.equal(event.rowCount, 2);
  assert.deepEqual(event.rows, [
    { customer: 'Ana', total: 12000, day: '2026-11-10' },
    { customer: 'Luis', total: 8000, day: '2026-11-10' }
  ]);
  // The next one is the next night's.
  assert.equal(
    nextScheduleAt(runner, s(), new Date('2026-11-11T02:08:00Z')),
    Date.parse('2026-11-12T02:00:00Z')
  );
  // Down for a day: only the latest missed time, and only within six hours.
  assert.equal(scanSchedules(runner, s(), new Date('2026-11-13T09:00:00Z')), 0);
  assert.equal(scanSchedules(runner, s(), new Date('2026-11-14T03:00:00Z')), 1);
  assert.equal(events(runner).length, 2);
});

test('a query that fails becomes a failed run, not a silent one', () => {
  const { runner, s } = bakery();
  saveTrigger(runner, s(), OWNER, NIGHTLY);
  runner.all("DELETE FROM _ganju_queries WHERE name = 'days_orders'");
  savedAt(runner, '2026-11-10T12:00:00Z');
  assert.equal(scanSchedules(runner, s(), new Date('2026-11-11T02:01:00Z')), 1);
  assert.match(
    String(events(runner)[0].error),
    /Not run: the saved query days_orders failed/
  );
});

test('turned off, it fires nothing; back on, it counts from then', () => {
  const { runner, s } = bakery();
  saveTrigger(runner, s(), OWNER, NIGHTLY);
  setTriggerEnabled(runner, s(), OWNER, 'nightly-orders', false);
  savedAt(runner, '2026-11-10T12:00:00Z');
  assert.equal(scanSchedules(runner, s(), new Date('2026-11-11T02:01:00Z')), 0);
  assert.equal(
    nextScheduleAt(runner, s(), new Date('2026-11-11T02:01:00Z')),
    null
  );
  setTriggerEnabled(runner, s(), OWNER, 'nightly-orders', true);
  // Back on now (real time), so tonight's past due time doesn't go out.
  const state = JSON.parse(
    String(runner.all('SELECT scan_state FROM _ganju_triggers')[0].scan_state)
  );
  assert.ok(Date.parse(state.through) > Date.parse('2026-11-11T02:00:00Z'));
});

test('what a schedule refuses', () => {
  const { runner, s } = bakery();
  const refused = (extra: Record<string, unknown>, pattern: RegExp) =>
    assert.throws(
      () => saveTrigger(runner, s(), OWNER, { ...NIGHTLY, ...extra }),
      pattern
    );
  refused({ table: 'orders' }, /no "table"/);
  refused({ when: { total: { equals: 1 } } }, /no "when"/);
  refused({ query: 'nope' }, /no saved query named nope/);
  refused({ params: { other: 1 } }, /takes day; not other/);
  refused(
    { email: undefined, chat: { channelId: 'c', chatId: '1', text: 'x' } },
    /"email", "function" or "webhook"/
  );
  refused(
    { email: { to: 'a@example.com', text: 'Hi {{customer}}' } },
    /\{\{customer\}\}/
  );
  assert.throws(
    () =>
      saveTrigger(runner, s(), OWNER, {
        table: 'orders',
        on: 'insert',
        every: 'day',
        webhook: 'https://example.com/a'
      }),
    /"every" is for "on": "schedule" only/
  );
  for (let i = 0; i < 5; i++)
    saveTrigger(runner, s(), OWNER, { ...NIGHTLY, name: `s${i}` });
  refused({ name: 's5' }, /up to 5 schedules/);
  // Replacing one that exists isn't a new one.
  saveTrigger(runner, s(), OWNER, { ...NIGHTLY, name: 's1', at: '22:00' });
});

test('skipEmpty: a night with no rows sends nothing', () => {
  const { runner, s } = bakery();
  saveQuery(runner, s(), OWNER, {
    name: 'none',
    sql: 'SELECT customer FROM orders WHERE total < 0'
  });
  saveTrigger(runner, s(), OWNER, {
    ...NIGHTLY,
    query: 'none',
    params: null,
    skipEmpty: true
  });
  savedAt(runner, '2026-11-10T12:00:00Z');
  assert.equal(scanSchedules(runner, s(), new Date('2026-11-11T02:01:00Z')), 0);
  // Handled all the same: it doesn't come back later that night.
  assert.equal(scanSchedules(runner, s(), new Date('2026-11-11T02:30:00Z')), 0);
  assert.throws(
    () =>
      saveTrigger(runner, s(), OWNER, {
        ...NIGHTLY,
        name: 'x',
        query: null,
        params: null,
        skipEmpty: true
      }),
    /"skipEmpty" goes with "query"/
  );
});

test('rows read as one line each in an email', () => {
  assert.equal(
    scheduleRowsText(
      [
        { customer: 'Ana', total: 12000 },
        { customer: 'Luis', total: null }
      ],
      3
    ),
    'customer: Ana · total: 12000\ncustomer: Luis · total: \n… (2 / 3)'
  );
});

test("a query bounded by the run's local day takes today_start and today_end", () => {
  const { runner, s } = bakery();
  saveQuery(runner, s(), OWNER, {
    name: 'between',
    sql: 'SELECT customer FROM orders WHERE created_at >= :from AND created_at < :to',
    params: [
      { name: 'from', type: 'datetime' },
      { name: 'to', type: 'datetime' }
    ]
  });
  saveTrigger(runner, s(), OWNER, {
    ...NIGHTLY,
    query: 'between',
    params: { from: '{{today_start}}', to: '{{today_end}}' }
  });
  // The rows were written now, so the run for the day they were written on
  // carries them.
  const now = new Date();
  runner.all('UPDATE _ganju_triggers SET scan_state = ?', [
    JSON.stringify({ through: '2000-01-01T00:00:00Z' })
  ]);
  const tonight = Date.parse(
    `${new Intl.DateTimeFormat('en-CA', { timeZone: BOGOTA }).format(now)}T21:00:00-05:00`
  );
  assert.equal(scanSchedules(runner, s(), new Date(tonight + 60_000)), 1);
  const [event] = events(runner);
  assert.equal(event.error, undefined);
  assert.equal(event.rowCount, 2);
});

test('a draft query runs as saving would check it, and nothing stays', () => {
  const { runner, s } = bakery();
  const result = runDraftQuery(runner, s(), OWNER, {
    query: {
      name: 'big_orders',
      sql: 'SELECT customer FROM orders WHERE total > :min ORDER BY id',
      params: [{ name: 'min', type: 'integer' }]
    },
    params: { min: 10000 }
  });
  assert.deepEqual(result.rows, [{ customer: 'Ana' }]);
  assert.deepEqual(
    listQueries(runner).map(q => q.name),
    ['days_orders']
  );
  assert.throws(
    () =>
      runDraftQuery(runner, s(), OWNER, {
        query: { name: 'bad', sql: 'DELETE FROM orders' }
      }),
    /./
  );
  assert.equal(runner.all('SELECT count(*) AS n FROM orders')[0].n, 2);
});
