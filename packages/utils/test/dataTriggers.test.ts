// Triggers in the engine: what a write stores in the outbox, on node:sqlite
// through the same runner the object uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  createTable,
  addColumn,
  updateColumn,
  dropColumn,
  dropTable,
  loadSchema,
  migrateInternal,
  setMeta,
  write
} from '../src/dataEngine.ts';
import type { SqlRow, SqlRunner } from '../src/dataEngine.ts';
import {
  clearOutbox,
  conditionMatches,
  dropTrigger,
  listTriggers,
  normaliseCustomerAction,
  readEventRow,
  readOutbox,
  renderCustomerMessage,
  renderTriggerText,
  replaceManagedTriggers,
  saveTrigger,
  setTriggerEnabled,
  utf8Bytes
} from '../src/dataTriggers.ts';
import type { DataTriggerEventMessage } from '../src/dataTriggers.ts';
import { DataError } from '../src/dataTypes.ts';
import type { DataCaller } from '../src/dataTypes.ts';

const open = () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
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
  return runner;
};

const OWNER: DataCaller = { actor: 'user:owner' };
const BOT: DataCaller = {
  actor: 'channel:ana',
  restricted: true,
  participantId: 'ana'
};

const shop = () => {
  const runner = open();
  const s = () => loadSchema(runner);
  createTable(runner, s(), OWNER, {
    name: 'menu',
    access: 'full',
    columns: [
      { name: 'name', type: 'text', required: true },
      { name: 'stock', type: 'integer', required: true, min: 0, default: 0 }
    ]
  });
  createTable(runner, s(), OWNER, {
    name: 'orders',
    access: 'full',
    customerScoped: true,
    columns: [
      {
        name: 'status',
        type: 'enum',
        values: ['pending', 'ready', 'delivered'],
        default: 'pending'
      },
      { name: 'address', type: 'text' },
      { name: 'paid', type: 'boolean', default: false }
    ]
  });
  createTable(runner, s(), OWNER, {
    name: 'order_lines',
    access: 'full',
    columns: [
      {
        name: 'order',
        type: 'relation',
        table: 'orders',
        onDelete: 'cascade',
        required: true
      },
      { name: 'dish', type: 'relation', table: 'menu', required: true },
      { name: 'quantity', type: 'integer', required: true, min: 1 }
    ]
  });
  write(runner, s(), OWNER, {
    operations: [
      { op: 'insert', table: 'menu', rows: [{ name: 'Margherita', stock: 5 }] }
    ]
  });
  return { runner, s };
};

const events = (runner: SqlRunner): DataTriggerEventMessage[] =>
  readOutbox(runner, 1000).map(e => e.message);

// Clears every stored event.
const LATER = '9999-01-01T00:00:00Z';

test('an insert stores its event with the row; a rolled-back write stores none', () => {
  const { runner, s } = shop();
  saveTrigger(runner, s(), OWNER, {
    table: 'orders',
    on: 'insert',
    function: 'notify-kitchen'
  });
  write(runner, s(), BOT, {
    operations: [
      { op: 'insert', table: 'orders', values: { address: 'Calle 1' } },
      {
        op: 'insert',
        table: 'order_lines',
        values: { order: { $ref: 0 }, dish: 1, quantity: 2 }
      },
      { op: 'update', table: 'menu', id: 1, set: { stock: { decrement: 2 } } }
    ]
  });
  const [event] = events(runner);
  assert.equal(events(runner).length, 1);
  assert.equal(event.triggerName, 'orders-insert-notify-kitchen');
  assert.equal(event.artifactId, 'art_1');
  assert.equal(event.event, 'insert');
  assert.equal(event.row?.status, 'pending');
  assert.equal(event.row?.paid, false, 'booleans come back as booleans');
  assert.equal(event.row?.participant_id, 'ana');
  assert.equal(event.previous, null);
  assert.equal(event.actor, 'channel:ana');
  assert.equal(event.depth, 1);
  assert.match(event.eventId, /^evt_/);

  // Out of stock: the whole write rolls back, its event with it.
  assert.throws(() =>
    write(runner, s(), BOT, {
      operations: [
        { op: 'insert', table: 'orders', values: { address: 'Calle 2' } },
        { op: 'update', table: 'menu', id: 1, set: { stock: { decrement: 9 } } }
      ]
    })
  );
  assert.equal(events(runner).length, 1);
  assert.equal(runner.all('SELECT count(*) AS n FROM _ganju_changes')[0].n, 0);
});

test('changedTo fires on the transition only', () => {
  const { runner, s } = shop();
  saveTrigger(runner, s(), OWNER, {
    name: 'tell-customer',
    table: 'orders',
    on: 'update',
    when: { status: { changedTo: 'ready' } },
    function: 'tell-customer'
  });
  write(runner, s(), BOT, {
    operations: [{ op: 'insert', table: 'orders', values: {} }]
  });
  write(runner, s(), OWNER, {
    operations: [
      { op: 'update', table: 'orders', id: 1, set: { address: 'x' } }
    ]
  });
  assert.equal(events(runner).length, 0);
  write(runner, s(), OWNER, {
    operations: [
      { op: 'update', table: 'orders', id: 1, set: { status: 'ready' } }
    ]
  });
  write(runner, s(), OWNER, {
    operations: [
      { op: 'update', table: 'orders', id: 1, set: { address: 'y' } }
    ]
  });
  const list = events(runner);
  assert.equal(list.length, 1);
  assert.equal(list[0].previous?.status, 'pending');
  assert.equal(list[0].row?.status, 'ready');
  assert.equal(list[0].rowId, 1);
});

test('a trigger never matches its own run; a chain stops at depth 3', () => {
  const { runner, s } = shop();
  const { trigger } = saveTrigger(runner, s(), OWNER, {
    name: 'stamp',
    table: 'orders',
    on: 'update',
    function: 'stamp'
  });
  saveTrigger(runner, s(), OWNER, {
    name: 'audit',
    table: 'orders',
    on: 'update',
    webhook: 'https://example.com/hook'
  });
  write(runner, s(), OWNER, {
    operations: [{ op: 'insert', table: 'orders', values: {} }]
  });
  clearOutbox(runner, LATER);
  // The function the trigger ran updates the row it was triggered by.
  write(
    runner,
    s(),
    { actor: `trigger:${trigger.id}`, triggerDepth: 1 },
    {
      operations: [
        { op: 'update', table: 'orders', id: 1, set: { paid: true } }
      ]
    }
  );
  const list = events(runner);
  assert.deepEqual(
    list.map(e => e.triggerName),
    ['audit']
  );
  assert.equal(list[0].depth, 2);

  clearOutbox(runner, LATER);
  write(
    runner,
    s(),
    { actor: 'trigger:trg_other', triggerDepth: 3 },
    {
      operations: [
        { op: 'update', table: 'orders', id: 1, set: { paid: false } }
      ]
    }
  );
  const deep = events(runner);
  assert.equal(deep.length, 2);
  assert.ok(
    deep.every(
      e => e.depth === 4 && /depth 3/.test(e.error ?? '') && e.row === null
    )
  );
});

test('cascades are caught; tables nobody watches capture nothing', () => {
  const { runner, s } = shop();
  saveTrigger(runner, s(), OWNER, {
    table: 'order_lines',
    on: 'delete',
    webhook: 'https://example.com/lines'
  });
  write(runner, s(), OWNER, {
    operations: [
      { op: 'insert', table: 'orders', values: {} },
      {
        op: 'insert',
        table: 'order_lines',
        values: { order: { $ref: 0 }, dish: 1, quantity: 1 }
      }
    ]
  });
  assert.equal(
    events(runner).length,
    0,
    'insert into a table watched only for deletes'
  );
  write(runner, s(), OWNER, {
    operations: [{ op: 'delete', table: 'orders', id: 1 }]
  });
  const [event] = events(runner);
  assert.equal(event.table, 'order_lines');
  assert.equal(event.previous?.quantity, 1);
  assert.equal(event.row, null);
});

test('conditions: changedFrom, changed, equals, all and any', () => {
  const before = { status: 'pending', paid: false };
  const after = { status: 'ready', paid: false };
  assert.ok(
    conditionMatches({ status: { changedFrom: 'pending' } }, after, before)
  );
  assert.ok(!conditionMatches({ paid: { changed: true } }, after, before));
  assert.ok(conditionMatches({ paid: { equals: false } }, after, before));
  assert.ok(
    conditionMatches(
      { any: [{ paid: { changed: true } }, { status: { changed: true } }] },
      after,
      before
    )
  );
  assert.ok(
    !conditionMatches(
      { all: [{ paid: { changed: true } }, { status: { changed: true } }] },
      after,
      before
    )
  );
  // An insert changed to what it was created with; a delete from what it had.
  assert.ok(conditionMatches({ status: { changedTo: 'ready' } }, after, null));
  assert.ok(
    conditionMatches({ status: { changedFrom: 'ready' } }, null, after)
  );
  assert.ok(conditionMatches({ status: { equals: 'ready' } }, null, after));
});

test('a trigger is checked when saved', () => {
  const { runner, s } = shop();
  const refuses = (input: unknown, pattern: RegExp) =>
    assert.throws(
      () => saveTrigger(runner, s(), OWNER, input),
      (error: unknown) =>
        error instanceof DataError && pattern.test(error.message)
    );
  refuses(
    { table: 'nope', on: 'insert', function: 'x' },
    /no table named nope/
  );
  refuses(
    { table: 'orders', on: 'upsert', function: 'x' },
    /insert, update or delete/
  );
  refuses({ table: 'orders', on: 'insert' }, /runs one thing/);
  refuses(
    { table: 'orders', on: 'insert', function: 'x', webhook: 'https://a.co' },
    /runs one thing/
  );
  refuses({ table: 'orders', on: 'insert', webhook: 'http://a.co' }, /https/);
  refuses(
    {
      table: 'orders',
      on: 'update',
      when: { colour: { changed: true } },
      function: 'x'
    },
    /orders.colour/
  );
  refuses(
    {
      table: 'orders',
      on: 'update',
      when: { status: { becomes: 'x' } },
      function: 'x'
    },
    /changedTo/
  );
  refuses(
    { table: 'menu', on: 'insert', customer: { text: 'hi' } },
    /customer-scoped/
  );
  refuses(
    {
      table: 'orders',
      on: 'insert',
      chat: { channelId: 'c', chatId: '1', text: 'New {{total}}' }
    },
    /\{\{total\}\}/
  );
});

test("ganju.json triggers replace the CLI's own, leave the dashboard's, and show a webhook secret once", () => {
  const { runner, s } = shop();
  saveTrigger(runner, s(), OWNER, {
    name: 'mine',
    table: 'orders',
    on: 'insert',
    function: 'a'
  });
  const first = replaceManagedTriggers(runner, s(), { actor: 'cli:tok' }, [
    { table: 'orders', on: 'insert', function: 'notify-kitchen' },
    {
      name: 'hook',
      table: 'orders',
      on: 'update',
      webhook: 'https://example.com/h'
    }
  ]);
  assert.deepEqual(
    first.triggers.map(t => t.managed),
    ['cli', 'cli']
  );
  assert.match(first.secrets.hook, /^whsec_/);
  const second = replaceManagedTriggers(runner, s(), { actor: 'cli:tok' }, [
    {
      name: 'hook',
      table: 'orders',
      on: 'update',
      webhook: 'https://example.com/h2'
    }
  ]);
  assert.deepEqual(second.removed, ['orders-insert-notify-kitchen']);
  assert.deepEqual(second.secrets, {}, 'the secret is kept, not shown again');
  assert.deepEqual(
    listTriggers(runner, s())
      .map(t => t.name)
      .sort(),
    ['hook', 'mine']
  );
  assert.throws(
    () =>
      saveTrigger(runner, s(), OWNER, {
        name: 'hook',
        table: 'orders',
        on: 'insert',
        function: 'b'
      }),
    /ganju\.json/
  );
  assert.throws(
    () =>
      replaceManagedTriggers(runner, s(), { actor: 'cli:tok' }, [
        { name: 'mine', table: 'orders', on: 'insert', function: 'b' }
      ]),
    /dashboard/
  );
  assert.throws(
    () =>
      replaceManagedTriggers(runner, s(), { actor: 'cli:tok' }, [
        { table: 'orders', on: 'insert', function: 'b' },
        { table: 'orders', on: 'insert', function: 'b' }
      ]),
    /"name" of its own/
  );
});

test('off, dropped, schema changes and tables made before triggers', () => {
  const { runner, s } = shop();
  const { trigger } = saveTrigger(runner, s(), OWNER, {
    table: 'menu',
    on: 'update',
    function: 'restock'
  });
  setTriggerEnabled(runner, s(), OWNER, trigger.id, false);
  write(runner, s(), OWNER, {
    operations: [{ op: 'update', table: 'menu', id: 1, set: { stock: 4 } }]
  });
  assert.equal(events(runner).length, 0);
  setTriggerEnabled(runner, s(), OWNER, trigger.name, true);

  // A new column remakes the table's triggers; the capture comes back with it.
  addColumn(runner, s(), OWNER, 'menu', { name: 'price', type: 'integer' });
  write(runner, s(), OWNER, {
    operations: [{ op: 'update', table: 'menu', id: 1, set: { price: 9 } }]
  });
  assert.equal(events(runner)[0].row?.price, 9);

  // A table from before triggers: the first trigger on it adds the capture.
  for (const row of runner.all(
    "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'tr_%_ev_%'"
  )) {
    runner.all(`DROP TRIGGER "${String(row.name)}"`);
  }
  clearOutbox(runner, LATER);
  dropTrigger(runner, trigger.name);
  saveTrigger(runner, s(), OWNER, {
    table: 'menu',
    on: 'update',
    function: 'restock'
  });
  write(runner, s(), OWNER, {
    operations: [{ op: 'update', table: 'menu', id: 1, set: { stock: 3 } }]
  });
  assert.equal(events(runner).length, 1);

  createTable(runner, s(), OWNER, {
    name: 'scratch',
    columns: [{ name: 'n', type: 'integer' }]
  });
  saveTrigger(runner, s(), OWNER, {
    table: 'scratch',
    on: 'insert',
    function: 'x'
  });
  dropTable(runner, s(), OWNER, 'scratch');
  assert.ok(!listTriggers(runner, s()).some(t => t.name.startsWith('scratch')));
});

test('a type change that copies the table keeps its events', () => {
  const { runner, s } = shop();
  saveTrigger(runner, s(), OWNER, {
    table: 'orders',
    on: 'update',
    function: 'x'
  });
  write(runner, s(), BOT, {
    operations: [{ op: 'insert', table: 'orders', values: { address: '12' } }]
  });
  updateColumn(runner, s(), OWNER, 'orders', 'address', { type: 'integer' });
  write(runner, s(), OWNER, {
    operations: [{ op: 'update', table: 'orders', id: 1, set: { address: 13 } }]
  });
  const [event] = events(runner);
  assert.equal(event.previous?.address, 12);
  assert.equal(event.row?.address, 13);
});

test('templates insert field values as plain text', () => {
  assert.equal(
    renderTriggerText('New order #{{id}}: {{ note }}{{missing}}', {
      id: 42,
      note: '<b>2× Margherita</b>'
    }),
    'New order #42: <b>2× Margherita</b>'
  );
});

test('a customer message fills its text and each template value from the row', () => {
  const row = { id: 7, status: 'ready', address: null };
  assert.deepEqual(
    renderCustomerMessage(
      {
        text: 'Order #{{id}} is {{status}}',
        template: { name: 'pedido_listo', language: 'es', params: ['{{id}}', 'Calle {{address}}', 'fixed'] }
      },
      row
    ),
    {
      text: 'Order #7 is ready',
      template: { name: 'pedido_listo', language: 'es', params: ['7', 'Calle ', 'fixed'] }
    }
  );
  // No template, or one without params.
  assert.deepEqual(renderCustomerMessage({ text: 'Hi {{id}}' }, row), {
    text: 'Hi 7',
    template: null
  });
  assert.deepEqual(
    renderCustomerMessage({ text: 'Hi', template: { name: 'hello', language: 'en' } }, null).template,
    { name: 'hello', language: 'en', params: [] }
  );
});

test('a row read back is the row its event carries, system fields included', () => {
  const { runner, s } = shop();
  createTable(runner, s(), OWNER, {
    name: 'bookings',
    access: 'full',
    customerScoped: true,
    columns: [
      { name: 'dish', type: 'relation', table: 'menu' },
      { name: 'at', type: 'datetime' },
      { name: 'paid', type: 'boolean' },
      { name: 'extra', type: 'json' },
      { name: 'note', type: 'text' }
    ]
  });
  saveTrigger(runner, s(), OWNER, { table: 'bookings', on: 'insert', webhook: 'https://example.com/b' });
  write(runner, s(), BOT, {
    operations: [
      {
        op: 'insert',
        table: 'bookings',
        values: { dish: 1, at: '2026-11-06T08:00:00-05:00', paid: true, extra: { seats: 2 }, note: 'ventana' }
      }
    ]
  });
  write(runner, s(), BOT, {
    operations: [{ op: 'insert', table: 'bookings', values: { note: 'later' } }]
  });
  const [first, second] = events(runner);
  assert.deepEqual(readEventRow(runner, s(), 'bookings', first.rowId), first.row);
  // No id: the newest row.
  assert.deepEqual(readEventRow(runner, s(), 'bookings'), second.row);
  assert.equal(
    renderTriggerText('{{dish}} at {{at}} for {{participant_id}}, by {{created_by}}', first.row),
    '1 at 2026-11-06T13:00:00Z for ana, by channel:ana'
  );
  assert.equal(readEventRow(runner, s(), 'bookings', 999), null);
  assert.throws(
    () => readEventRow(runner, s(), 'nope'),
    (error: unknown) => error instanceof DataError && error.code === 'not_found'
  );
});

test("a test send's unsaved customer action is checked like a saved one", () => {
  const { s } = shop();
  assert.deepEqual(
    normaliseCustomerAction(s(), 'orders', {
      text: ' #{{id}} ',
      template: { name: 'pedido_listo', language: 'es', params: ['{{status}}'] }
    }),
    {
      type: 'customer',
      text: '#{{id}}',
      template: { name: 'pedido_listo', language: 'es', params: ['{{status}}'] }
    }
  );
  assert.throws(
    () => normaliseCustomerAction(s(), 'orders', { text: 'Hi {{total}}' }),
    /"customer.text" uses \{\{total\}\}, which isn't a column of orders\./
  );
  assert.throws(
    () => normaliseCustomerAction(s(), 'menu', { text: 'Hi' }),
    /menu must be customer-scoped/
  );
  assert.throws(
    () => normaliseCustomerAction(s(), 'nope', { text: 'Hi' }),
    (error: unknown) => error instanceof DataError && error.code === 'not_found'
  );
});

test('unnamed triggers are numbered; replace: false refuses a taken name', () => {
  const { runner, s } = shop();
  const hook = { table: 'orders', on: 'insert', webhook: 'https://example.com/a' } as const;
  const first = saveTrigger(runner, s(), OWNER, hook);
  const second = saveTrigger(runner, s(), OWNER, { ...hook, webhook: 'https://example.com/b' });
  assert.equal(first.trigger.name, 'orders-insert-webhook');
  assert.equal(second.trigger.name, 'orders-insert-webhook-2');
  assert.equal(listTriggers(runner, s()).length, 2);

  assert.throws(
    () => saveTrigger(runner, s(), OWNER, { ...hook, name: 'orders-insert-webhook', replace: false }),
    /already exists/
  );
  // Without it, a name still means "save over".
  saveTrigger(runner, s(), OWNER, { ...hook, name: 'orders-insert-webhook', webhook: 'https://example.com/c' });
  assert.equal(listTriggers(runner, s()).length, 2);
});

test('a deploy keeps a trigger off when ganju.json leaves "enabled" out', () => {
  const { runner, s } = shop();
  const cli = { actor: 'cli:tok' };
  const manifest = [{ name: 'kitchen', table: 'orders', on: 'insert', function: 'notify' }];
  replaceManagedTriggers(runner, s(), cli, manifest);
  setTriggerEnabled(runner, s(), { actor: 'system:triggers' }, 'kitchen', false, 'Turned off by Ganju.');

  replaceManagedTriggers(runner, s(), cli, manifest);
  let [kitchen] = listTriggers(runner, s());
  assert.equal(kitchen.enabled, false);
  assert.equal(kitchen.disabledReason, 'Turned off by Ganju.');

  replaceManagedTriggers(runner, s(), cli, [{ ...manifest[0], enabled: true }]);
  [kitchen] = listTriggers(runner, s());
  assert.equal(kitchen.enabled, true);
  assert.equal(kitchen.disabledReason, null);
});

test("a rename carries a column's triggers along; a drop is refused", () => {
  const { runner, s } = shop();
  saveTrigger(runner, s(), OWNER, {
    name: 'ready',
    table: 'orders',
    on: 'update',
    when: { any: [{ status: { changedTo: 'ready' } }] },
    function: 'x'
  });
  saveTrigger(runner, s(), OWNER, {
    name: 'mail',
    table: 'orders',
    on: 'insert',
    email: { to: 'a@example.com', subject: 'Order {{id}}', text: 'Deliver to {{ address }}' }
  });

  updateColumn(runner, s(), OWNER, 'orders', 'status', { name: 'state' });
  updateColumn(runner, s(), OWNER, 'orders', 'address', { name: 'street' });
  const byName = Object.fromEntries(listTriggers(runner, s()).map(t => [t.name, t]));
  assert.deepEqual(byName.ready.when, { any: [{ state: { changedTo: 'ready' } }] });
  assert.equal(byName.mail.action.type === 'email' && byName.mail.action.text, 'Deliver to {{street}}');
  assert.equal(byName.mail.action.type === 'email' && byName.mail.action.subject, 'Order {{id}}');

  // The renamed trigger still fires.
  write(runner, s(), BOT, {
    operations: [{ op: 'insert', table: 'orders', values: { street: '12' } }]
  });
  clearOutbox(runner, LATER);
  write(runner, s(), OWNER, {
    operations: [{ op: 'update', table: 'orders', id: 1, set: { state: 'ready' } }]
  });
  assert.deepEqual(events(runner).map(e => e.triggerName), ['ready']);

  // A rename that also copies the table goes in two steps.
  assert.throws(
    () => updateColumn(runner, s(), OWNER, 'orders', 'street', { name: 'addr', type: 'long_text' }),
    /rename it on its own/
  );
  assert.throws(() => dropColumn(runner, s(), OWNER, 'orders', 'street'), /trigger mail uses it/);
  dropTrigger(runner, 'mail');
  dropColumn(runner, s(), OWNER, 'orders', 'street');
});

test('row size is measured in bytes; a restore clears only events from before it', () => {
  const { runner, s } = shop();
  saveTrigger(runner, s(), OWNER, { table: 'orders', on: 'insert', function: 'x' });
  // 20,000 characters, 60,000 bytes: past the cap only when counted in bytes.
  const address = '€'.repeat(20_000);
  assert.ok(utf8Bytes(address) > 48_000 && address.length < 48_000);
  write(runner, s(), BOT, {
    operations: [{ op: 'insert', table: 'orders', values: { address } }]
  });
  const [event] = events(runner);
  assert.equal(event.truncated, true);
  assert.equal(event.row, null);
  // The customer stays on the event, and the row reads back whole.
  assert.equal(event.participantId, 'ana');
  const readBack = readEventRow(runner, s(), 'orders', event.rowId);
  assert.equal(readBack?.participant_id, 'ana');
  assert.equal(readBack?.address, address);

  runner.all("UPDATE _ganju_outbox SET created_at = '2026-01-01T00:00:00Z'");
  write(runner, s(), BOT, {
    operations: [{ op: 'insert', table: 'orders', values: { address: 'b' } }]
  });
  assert.equal(clearOutbox(runner, '2026-06-01T00:00:00Z'), 1);
  assert.equal(events(runner)[0].row?.address, 'b');
});
