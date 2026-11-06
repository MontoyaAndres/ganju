// Triggers: rules on a table that run something when its rows change. The
// object keeps them with the data, and every write goes through it, so no
// change is missed:
// - each table has SQLite triggers that copy every changed row, old and new,
//   into _ganju_changes, but only while one of the owner's triggers listens
//   on that table and event (so tables nobody watches write nothing extra);
// - before the write's transaction commits, the changes are matched against
//   the owner's triggers and the matches stored in _ganju_outbox, so a write
//   that commits always has its events and one that rolls back never does;
// - the object's alarm hands the outbox to a queue, and the queue's consumer
//   runs the action.
// Conditions are data, never code, evaluated here against the old and new
// row.
import { DATA_IDENTIFIER_PATTERN } from './dataIdentifiers';
import { fromStored } from './dataCompiler';
import { DATA_MAX_DESCRIPTION, DataError } from './dataTypes';
import type { DataCaller, DataSchema, DataTable } from './dataTypes';
import type { SqlRow, SqlRunner } from './dataEngine';

export const DATA_TRIGGER_EVENTS = ['insert', 'update', 'delete'] as const;
export type DataTriggerEvent = (typeof DATA_TRIGGER_EVENTS)[number];

export const DATA_TRIGGER_ACTIONS = [
  'function',
  'webhook',
  'chat',
  'email',
  'customer'
] as const;
export type DataTriggerActionType = (typeof DATA_TRIGGER_ACTIONS)[number];

export const DATA_MAX_TRIGGERS = 50;
// A chain of triggers (a triggered function's write firing another trigger)
// stops at this depth with a visible error.
export const DATA_TRIGGER_MAX_DEPTH = 3;
// Runs a minute per trigger; past it, events wait in the queue.
export const DATA_TRIGGER_DEFAULT_RATE = 60;
export const DATA_TRIGGER_MAX_RATE = 600;
export const DATA_TRIGGER_MAX_TEXT = 2000;
export const DATA_TRIGGER_MAX_EMAILS = 10;
// Conditions nest `all` / `any` this deep, with this many tests in all.
const MAX_CONDITION_DEPTH = 4;
const MAX_CONDITION_TESTS = 20;
// Events handed to the queue per alarm step, and the most of a row an event
// carries: a queue message holds 128 KB, so a larger row is left out and the
// receiver reads it by id. Sizes are UTF-8 bytes, not characters.
export const DATA_OUTBOX_BATCH = 100;
export const DATA_TRIGGER_MAX_ROW_BYTES = 48_000;
export const DATA_TRIGGER_MAX_MESSAGE_BYTES = 120_000;

const encoder = new TextEncoder();
export const utf8Bytes = (value: unknown): number =>
  encoder.encode(typeof value === 'string' ? value : JSON.stringify(value))
    .length;

type Scalar = string | number | boolean | null;

// One column's test. Several keys on one column must all hold.
export interface DataTriggerTest {
  changedTo?: Scalar;
  changedFrom?: Scalar;
  changed?: true;
  equals?: Scalar;
}

// `{ status: { changedTo: "READY" } }`; several columns must all hold;
// `{ all: [...] }` and `{ any: [...] }` combine.
export type DataTriggerCondition =
  | { all: DataTriggerCondition[] }
  | { any: DataTriggerCondition[] }
  | { [column: string]: DataTriggerTest };

export interface DataTriggerTemplate {
  name: string;
  language: string;
  // Each {{n}} of the template, in order: a row field, or fixed text.
  params?: string[];
}

export type DataTriggerAction =
  | { type: 'function'; function: string }
  | { type: 'webhook'; url: string }
  | { type: 'chat'; channelId: string; chatId: string; text: string }
  | { type: 'email'; to: string[]; subject: string; text: string }
  | { type: 'customer'; text: string; template?: DataTriggerTemplate };

// A trigger as the owner writes it: the dashboard, the API and ganju.json's
// "triggers" use this shape, with exactly one action key.
export interface DataTriggerInput {
  name?: string;
  description?: string | null;
  table: string;
  on: DataTriggerEvent;
  when?: DataTriggerCondition | null;
  enabled?: boolean;
  // false: refuse to save over a trigger that already has this name.
  replace?: boolean;
  rateLimit?: number;
  function?: string;
  webhook?: string;
  chat?: { channelId: string; chatId: string; text: string };
  email?: { to: string[] | string; subject?: string; text: string };
  customer?: { text: string; template?: DataTriggerTemplate };
}

export interface DataTrigger {
  id: string;
  name: string;
  description: string | null;
  table: string;
  on: DataTriggerEvent;
  when: DataTriggerCondition | null;
  action: DataTriggerAction;
  enabled: boolean;
  // Why it is off, when Ganju turned it off (failures in a row).
  disabledReason: string | null;
  // Deployed from ganju.json: the dashboard shows it but doesn't edit it.
  managed: 'cli' | null;
  rateLimit: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

// What the consumer reads to run one: the trigger with its webhook secret.
export interface DataTriggerWithSecret extends DataTrigger {
  secret: string | null;
}

// One event, as the queue carries it. `row` and `previous` are the row after
// and before the change (null on insert / delete); both are left out, with
// `truncated`, when the row is too large for a message.
export interface DataTriggerEventMessage {
  eventId: string;
  artifactId: string;
  triggerId: string;
  triggerName: string;
  table: string;
  event: DataTriggerEvent;
  rowId: number;
  row: Record<string, unknown> | null;
  previous: Record<string, unknown> | null;
  actor: string | null;
  // 1 for a change made by anyone but a triggered function; a triggered
  // function's writes fire at its depth + 1.
  depth: number;
  at: string;
  truncated?: true;
  // The row's customer on a customer-scoped table, kept when the row is
  // left out for its size.
  participantId?: string;
  // Not run: the chain went too deep. Recorded as a failed run.
  error?: string;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const NAME_PATTERN = /^[a-z][a-z0-9_-]{0,62}$/;
const SYSTEM_FIELDS = [
  'id',
  'created_at',
  'updated_at',
  'version',
  'created_by',
  'updated_by',
  'participant_id'
];

const isScalar = (value: unknown): value is Scalar =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'boolean' ||
  (typeof value === 'number' && Number.isFinite(value));

// Conditions

const TEST_KEYS = ['changedTo', 'changedFrom', 'changed', 'equals'] as const;

const normaliseCondition = (
  table: DataTable,
  raw: unknown,
  depth = 0,
  count = { tests: 0 }
): DataTriggerCondition => {
  if (!isPlainObject(raw) || Object.keys(raw).length === 0) {
    throw new DataError(
      '"when" is an object such as { "status": { "changedTo": "READY" } }.'
    );
  }
  if (depth >= MAX_CONDITION_DEPTH) {
    throw new DataError(
      `"when" nests all / any at most ${MAX_CONDITION_DEPTH} deep.`
    );
  }
  if ('all' in raw || 'any' in raw) {
    const key = 'all' in raw ? 'all' : 'any';
    if (
      Object.keys(raw).length !== 1 ||
      !Array.isArray(raw[key]) ||
      raw[key].length === 0
    ) {
      throw new DataError(
        `"${key}" is a non-empty list of conditions, alone in its object.`
      );
    }
    const list = (raw[key] as unknown[]).map(item =>
      normaliseCondition(table, item, depth + 1, count)
    );
    return key === 'all' ? { all: list } : { any: list };
  }
  const out: Record<string, DataTriggerTest> = {};
  for (const [column, test] of Object.entries(raw)) {
    if (
      !table.columns.some(c => c.name === column) &&
      !SYSTEM_FIELDS.includes(column)
    ) {
      throw new DataError(
        `"when" names ${table.name}.${column}, which doesn't exist.`
      );
    }
    if (!isPlainObject(test) || Object.keys(test).length === 0) {
      throw new DataError(
        `"when".${column} is a test: changedTo, changedFrom, changed or equals.`
      );
    }
    const clean: DataTriggerTest = {};
    for (const [key, value] of Object.entries(test)) {
      if (!(TEST_KEYS as readonly string[]).includes(key)) {
        throw new DataError(
          `"when".${column}.${key}: a test is changedTo, changedFrom, changed or equals.`
        );
      }
      if (key === 'changed') {
        if (value !== true)
          throw new DataError(`"when".${column}.changed is true.`);
        clean.changed = true;
      } else {
        if (!isScalar(value)) {
          throw new DataError(
            `"when".${column}.${key} is a text, number, true / false or null.`
          );
        }
        clean[key as 'changedTo' | 'changedFrom' | 'equals'] = value;
      }
      if (++count.tests > MAX_CONDITION_TESTS) {
        throw new DataError(
          `"when" holds at most ${MAX_CONDITION_TESTS} tests.`
        );
      }
    }
    out[column] = clean;
  }
  return out;
};

// Values compare as JSON, so 3 and 3.0 match and "3" doesn't.
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Whether a change matches a condition. A missing side counts as all null:
 * an insert "changed to" the values it was created with, and a delete
 * "changed from" the values it had. `equals` tests the row after the change,
 * or the deleted row.
 */
export const conditionMatches = (
  when: DataTriggerCondition | null | undefined,
  row: Record<string, unknown> | null,
  previous: Record<string, unknown> | null
): boolean => {
  if (!when) return true;
  if ('all' in when && Array.isArray(when.all)) {
    return (when.all as DataTriggerCondition[]).every(c =>
      conditionMatches(c, row, previous)
    );
  }
  if ('any' in when && Array.isArray(when.any)) {
    return (when.any as DataTriggerCondition[]).some(c =>
      conditionMatches(c, row, previous)
    );
  }
  const after = row ?? {};
  const before = previous ?? {};
  const current = row ?? previous ?? {};
  return Object.entries(when as Record<string, DataTriggerTest>).every(
    ([column, test]) => {
      const now = after[column] ?? null;
      const then = before[column] ?? null;
      if (test.changed && same(now, then)) return false;
      if (
        'changedTo' in test &&
        !(same(now, test.changedTo) && !same(then, test.changedTo))
      ) {
        return false;
      }
      if (
        'changedFrom' in test &&
        !(same(then, test.changedFrom) && !same(now, test.changedFrom))
      ) {
        return false;
      }
      if ('equals' in test && !same(current[column] ?? null, test.equals))
        return false;
      return true;
    }
  );
};

// Templates

/**
 * A message built from a row: each {{field}} becomes that field's value as
 * plain text. Never markup: the row is customer-written content, and the
 * senders send it as text.
 */
export const renderTriggerText = (
  text: string,
  row: Record<string, unknown> | null
): string =>
  text.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g, (_, field: string) => {
    const value = row?.[field];
    if (value === null || value === undefined) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });

export interface DataTriggerCustomerMessage {
  text: string;
  template: { name: string; language: string; params: string[] } | null;
}

// What a "customer" action sends for a row: its text, and the template with
// each value filled in. A test send builds it the same way as a real run.
export const renderCustomerMessage = (
  action: { text: string; template?: DataTriggerTemplate },
  row: Record<string, unknown> | null
): DataTriggerCustomerMessage => ({
  text: renderTriggerText(action.text, row),
  template: action.template
    ? {
        name: action.template.name,
        language: action.template.language,
        params: (action.template.params ?? []).map(p =>
          renderTriggerText(p, row)
        )
      }
    : null
});

const templateFields = (text: string) =>
  [...text.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g)].map(m => m[1]);

// Definitions

const cleanText = (
  value: unknown,
  label: string,
  max = DATA_TRIGGER_MAX_TEXT
) => {
  if (typeof value !== 'string' || !value.trim())
    throw new DataError(`${label} is required.`);
  if (value.length > max)
    throw new DataError(`${label} is at most ${max} characters.`);
  return value.trim();
};

const assertFields = (table: DataTable, text: string, label: string) => {
  for (const field of templateFields(text)) {
    if (
      !table.columns.some(c => c.name === field) &&
      !SYSTEM_FIELDS.includes(field)
    ) {
      throw new DataError(
        `${label} uses {{${field}}}, which isn't a column of ${table.name}.`
      );
    }
  }
};

const normaliseAction = (
  table: DataTable,
  input: Record<string, unknown>
): DataTriggerAction => {
  const given = DATA_TRIGGER_ACTIONS.filter(
    key => input[key] !== undefined && input[key] !== null
  );
  if (given.length !== 1) {
    throw new DataError(
      'A trigger runs one thing: "function", "webhook", "chat", "email" or "customer".'
    );
  }
  const type = given[0];
  const value = input[type];
  switch (type) {
    case 'function':
      if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(value)) {
        throw new DataError(
          '"function" is the name of one of this project\'s functions.'
        );
      }
      return { type, function: value };
    case 'webhook': {
      if (typeof value !== 'string' || value.length > 2000) {
        throw new DataError('"webhook" is an https URL.');
      }
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new DataError('"webhook" is an https URL.');
      }
      if (url.protocol !== 'https:')
        throw new DataError('"webhook" must use https.');
      return { type, url: url.toString() };
    }
    case 'chat': {
      if (!isPlainObject(value)) {
        throw new DataError('"chat" is { "channelId", "chatId", "text" }.');
      }
      const text = cleanText(value.text, '"chat.text"');
      assertFields(table, text, '"chat.text"');
      return {
        type,
        channelId: cleanText(value.channelId, '"chat.channelId"', 100),
        chatId: cleanText(String(value.chatId ?? ''), '"chat.chatId"', 200),
        text
      };
    }
    case 'email': {
      if (!isPlainObject(value))
        throw new DataError('"email" is { "to", "subject", "text" }.');
      const to = (Array.isArray(value.to) ? value.to : [value.to]).map(v =>
        typeof v === 'string' ? v.trim().toLowerCase() : ''
      );
      if (
        to.length === 0 ||
        to.length > DATA_TRIGGER_MAX_EMAILS ||
        to.some(v => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
      ) {
        throw new DataError(
          `"email.to" is 1 to ${DATA_TRIGGER_MAX_EMAILS} email addresses.`
        );
      }
      const text = cleanText(value.text, '"email.text"');
      const subject =
        value.subject === undefined || value.subject === null
          ? `${table.name}: {{id}}`
          : cleanText(value.subject, '"email.subject"', 200);
      assertFields(table, text, '"email.text"');
      assertFields(table, subject, '"email.subject"');
      return { type, to: [...new Set(to)], subject, text };
    }
    case 'customer': {
      if (!table.customerScoped) {
        throw new DataError(
          `"customer" messages the row's customer, so ${table.name} must be customer-scoped.`
        );
      }
      if (!isPlainObject(value))
        throw new DataError('"customer" is { "text", "template"? }.');
      const text = cleanText(value.text, '"customer.text"');
      assertFields(table, text, '"customer.text"');
      if (value.template === undefined || value.template === null)
        return { type, text };
      const t = value.template;
      if (!isPlainObject(t)) {
        throw new DataError(
          '"customer.template" is { "name", "language", "params"? }.'
        );
      }
      const params = t.params === undefined ? [] : t.params;
      if (
        !Array.isArray(params) ||
        params.length > 20 ||
        !params.every(p => typeof p === 'string')
      ) {
        throw new DataError('"customer.template.params" is a list of texts.');
      }
      for (const param of params as string[])
        assertFields(table, param, '"customer.template.params"');
      return {
        type,
        text,
        template: {
          name: cleanText(t.name, '"customer.template.name"', 512),
          language: cleanText(t.language, '"customer.template.language"', 20),
          params: params as string[]
        }
      };
    }
  }
};

// A "customer" action as the dialog has it, saved or not, checked against
// its table the way saving it would be.
export const normaliseCustomerAction = (
  schema: DataSchema,
  tableName: string,
  value: unknown
): Extract<DataTriggerAction, { type: 'customer' }> => {
  const table = schema.tables.find(t => t.name === tableName);
  if (!table) {
    throw new DataError(`There is no table named ${tableName}.`, 'not_found');
  }
  return normaliseAction(table, { customer: value }) as Extract<
    DataTriggerAction,
    { type: 'customer' }
  >;
};

const defaultName = (table: string, on: string, action: DataTriggerAction) => {
  const target =
    action.type === 'function'
      ? action.function.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
      : action.type;
  return `${table}-${on}-${target}`.slice(0, 63);
};

interface NormalisedTrigger {
  name: string;
  // No name was given: saving picks a free one from it.
  defaultName: boolean;
  description: string | null;
  table: DataTable;
  on: DataTriggerEvent;
  when: DataTriggerCondition | null;
  action: DataTriggerAction;
  // null: not given, so a saved trigger stays on or off as it was.
  enabled: boolean | null;
  replace: boolean;
  rateLimit: number;
}

export const normaliseTrigger = (
  schema: DataSchema,
  input: unknown
): NormalisedTrigger => {
  if (!isPlainObject(input)) throw new DataError('A trigger is an object.');
  const table = schema.tables.find(t => t.name === input.table);
  if (!table) {
    throw new DataError(
      typeof input.table === 'string'
        ? `There is no table named ${input.table}.`
        : 'A trigger needs "table".',
      typeof input.table === 'string' ? 'not_found' : 'invalid'
    );
  }
  const on = input.on;
  if (!(DATA_TRIGGER_EVENTS as readonly unknown[]).includes(on)) {
    throw new DataError('"on" is insert, update or delete.');
  }
  const action = normaliseAction(table, input);
  const unnamed = input.name === undefined || input.name === null;
  const name = unnamed
    ? defaultName(table.name, on as string, action)
    : input.name;
  if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
    throw new DataError(
      "A trigger's name is lowercase letters, digits, _ and -, starting with a letter."
    );
  }
  const rate = input.rateLimit ?? DATA_TRIGGER_DEFAULT_RATE;
  if (
    typeof rate !== 'number' ||
    !Number.isInteger(rate) ||
    rate < 1 ||
    rate > DATA_TRIGGER_MAX_RATE
  ) {
    throw new DataError(
      `"rateLimit" is 1 to ${DATA_TRIGGER_MAX_RATE} runs a minute.`
    );
  }
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    throw new DataError('"enabled" is true or false.');
  }
  if (input.replace !== undefined && typeof input.replace !== 'boolean') {
    throw new DataError('"replace" is true or false.');
  }
  return {
    name,
    defaultName: unnamed,
    description:
      typeof input.description === 'string' && input.description.trim()
        ? input.description.trim().slice(0, DATA_MAX_DESCRIPTION)
        : null,
    table,
    on: on as DataTriggerEvent,
    when:
      input.when === undefined || input.when === null
        ? null
        : normaliseCondition(table, input.when),
    action,
    enabled: typeof input.enabled === 'boolean' ? input.enabled : null,
    replace: input.replace !== false,
    rateLimit: rate
  };
};

// The default name, numbered past the names already taken: two unnamed
// triggers on the same event never replace each other.
const freeName = (runner: SqlRunner, base: string) => {
  const taken = new Set(
    runner.all('SELECT name FROM _ganju_triggers').map(row => String(row.name))
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const name = `${base.slice(0, 63 - suffix.length)}${suffix}`;
    if (!taken.has(name)) return name;
  }
};

const parse = <T>(value: unknown): T | null => {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const toTrigger = (schema: DataSchema, row: SqlRow): DataTrigger => ({
  id: String(row.id),
  name: String(row.name),
  description: (row.description as string | null) ?? null,
  table: schema.tables.find(t => t.id === Number(row.table_id))?.name ?? '',
  on: row.event as DataTriggerEvent,
  when: parse<DataTriggerCondition>(row.condition),
  action: parse<DataTriggerAction>(row.action) as DataTriggerAction,
  enabled: row.enabled === 1,
  disabledReason: (row.disabled_reason as string | null) ?? null,
  managed: row.managed === 'cli' ? 'cli' : null,
  rateLimit: Number(row.rate_limit),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  updatedBy: (row.updated_by as string | null) ?? null
});

export const listTriggers = (
  runner: SqlRunner,
  schema: DataSchema
): DataTrigger[] =>
  runner
    .all('SELECT * FROM _ganju_triggers ORDER BY name')
    .map(row => toTrigger(schema, row));

const findRow = (runner: SqlRunner, nameOrId: unknown): SqlRow => {
  const row = runner.all(
    'SELECT * FROM _ganju_triggers WHERE name = ? OR id = ?',
    [String(nameOrId), String(nameOrId)]
  )[0];
  if (!row)
    throw new DataError(
      `There is no trigger named ${String(nameOrId)}.`,
      'not_found'
    );
  return row;
};

export const getTrigger = (
  runner: SqlRunner,
  schema: DataSchema,
  nameOrId: unknown
): DataTriggerWithSecret => {
  const row = findRow(runner, nameOrId);
  return {
    ...toTrigger(schema, row),
    secret: (row.secret as string | null) ?? null
  };
};

const newSecret = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `whsec_${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
};

export interface SavedTrigger {
  trigger: DataTrigger;
  // A webhook's signing secret, the one time it is made: shown once.
  secret?: string;
}

const upsert = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller,
  trigger: NormalisedTrigger,
  managed: 'cli' | null
): SavedTrigger => {
  const existing = runner.all('SELECT * FROM _ganju_triggers WHERE name = ?', [
    trigger.name
  ])[0];
  if (existing && !trigger.replace) {
    throw new DataError(
      `A trigger named ${trigger.name} already exists; give this one another name.`,
      'conflict'
    );
  }
  if (existing && (existing.managed === 'cli') !== (managed === 'cli')) {
    throw new DataError(
      existing.managed === 'cli'
        ? `${trigger.name} is deployed from ganju.json; change it there.`
        : `A trigger named ${trigger.name} was made in the dashboard; give this one another name.`,
      'conflict'
    );
  }
  if (!existing) {
    const count = Number(
      runner.all('SELECT count(*) AS n FROM _ganju_triggers')[0]?.n ?? 0
    );
    if (count >= DATA_MAX_TRIGGERS) {
      throw new DataError(
        `A database holds up to ${DATA_MAX_TRIGGERS} triggers.`
      );
    }
  }
  // A webhook keeps its secret while it stays a webhook.
  const keep =
    existing?.secret && trigger.action.type === 'webhook'
      ? String(existing.secret)
      : null;
  const secret =
    trigger.action.type === 'webhook' ? (keep ?? newSecret()) : null;
  const id = existing
    ? String(existing.id)
    : `trg_${crypto.randomUUID().replace(/-/g, '')}`;
  // Left out, "enabled" keeps the trigger as it was, and why Ganju turned it
  // off: a deploy doesn't turn back on what the dashboard or Ganju turned off.
  const enabled = trigger.enabled ?? (existing ? existing.enabled === 1 : true);
  const reason = enabled
    ? null
    : ((existing?.disabled_reason as string | null | undefined) ?? null);
  runner.all(
    `INSERT INTO _ganju_triggers (id, name, description, table_id, event, condition, action, enabled, disabled_reason, managed, rate_limit, secret, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description,
       table_id = excluded.table_id, event = excluded.event, condition = excluded.condition,
       action = excluded.action, enabled = excluded.enabled, disabled_reason = excluded.disabled_reason,
       managed = excluded.managed, rate_limit = excluded.rate_limit, secret = excluded.secret,
       updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    [
      id,
      trigger.name,
      trigger.description,
      trigger.table.id,
      trigger.on,
      trigger.when ? JSON.stringify(trigger.when) : null,
      JSON.stringify(trigger.action),
      enabled ? 1 : 0,
      reason,
      managed,
      trigger.rateLimit,
      secret,
      caller.actor
    ]
  );
  ensureChangeCapture(runner, trigger.table);
  const saved = toTrigger(schema, findRow(runner, id));
  return secret && secret !== keep
    ? { trigger: saved, secret }
    : { trigger: saved };
};

export const saveTrigger = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller,
  input: unknown
): SavedTrigger =>
  runner.transaction(() => {
    const trigger = normaliseTrigger(schema, input);
    if (trigger.defaultName) trigger.name = freeName(runner, trigger.name);
    return upsert(runner, schema, caller, trigger, null);
  });

export const dropTrigger = (
  runner: SqlRunner,
  nameOrId: unknown
): { dropped: string } => {
  const row = findRow(runner, nameOrId);
  runner.all('DELETE FROM _ganju_triggers WHERE id = ?', [row.id]);
  return { dropped: String(row.name) };
};

// On / off, by the owner or by Ganju after failures in a row (with why).
export const setTriggerEnabled = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller,
  nameOrId: unknown,
  enabled: boolean,
  reason: string | null = null
): DataTrigger => {
  const row = findRow(runner, nameOrId);
  runner.all(
    `UPDATE _ganju_triggers SET enabled = ?, disabled_reason = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_by = ? WHERE id = ?`,
    [enabled ? 1 : 0, enabled ? null : reason, caller.actor, row.id]
  );
  if (enabled) {
    const table = schema.tables.find(t => t.id === Number(row.table_id));
    if (table) ensureChangeCapture(runner, table);
  }
  return toTrigger(schema, findRow(runner, row.id));
};

/**
 * The triggers ganju.json deploys: each one saved, and every other trigger
 * the CLI deployed before removed. Those made in the dashboard stay. One
 * transaction, so a bad entry changes nothing.
 */
export const replaceManagedTriggers = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller,
  inputs: unknown
): {
  triggers: DataTrigger[];
  removed: string[];
  secrets: Record<string, string>;
} => {
  if (!Array.isArray(inputs) || inputs.length > DATA_MAX_TRIGGERS) {
    throw new DataError(
      `"triggers" is a list of up to ${DATA_MAX_TRIGGERS} triggers.`
    );
  }
  return runner.transaction(() => {
    const normalised = inputs.map((input, i) => {
      try {
        return normaliseTrigger(schema, input);
      } catch (error) {
        if (error instanceof DataError) {
          throw new DataError(
            `Trigger ${i}: ${error.message}`,
            error.code,
            error.details
          );
        }
        throw error;
      }
    });
    const names = new Set<string>();
    for (const trigger of normalised) {
      if (names.has(trigger.name)) {
        throw new DataError(
          `Two triggers are named ${trigger.name}; give each a "name" of its own.`
        );
      }
      names.add(trigger.name);
    }
    const removed: string[] = [];
    for (const row of runner.all(
      "SELECT id, name FROM _ganju_triggers WHERE managed = 'cli'"
    )) {
      if (names.has(String(row.name))) continue;
      runner.all('DELETE FROM _ganju_triggers WHERE id = ?', [row.id]);
      removed.push(String(row.name));
    }
    const secrets: Record<string, string> = {};
    const triggers = normalised.map(trigger => {
      const saved = upsert(runner, schema, caller, trigger, 'cli');
      if (saved.secret) secrets[saved.trigger.name] = saved.secret;
      return saved.trigger;
    });
    return { triggers, removed, secrets };
  });
};

// Change capture

const jsonRowSql = (table: DataTable, side: 'new' | 'old') => {
  const fields = [...SYSTEM_FIELDS, ...table.columns.map(c => c.name)];
  // json_set takes its arguments in pairs, and SQLite caps a function at 127
  // arguments, so wide tables are built in pieces.
  let out = "'{}'";
  for (let i = 0; i < fields.length; i += 50) {
    const pairs = fields
      .slice(i, i + 50)
      .map(f => `'$."${f}"', ${side}."${f}"`)
      .join(', ');
    out = `json_set(${out}, ${pairs})`;
  }
  return out;
};

/**
 * The SQLite triggers that copy a table's changed rows into _ganju_changes.
 * Each runs only while an enabled trigger of the owner's listens for that
 * event on the table. Named like the table's other triggers, so they are
 * dropped and remade with them when its columns change.
 */
export const changeCaptureTriggers = (
  table: Pick<DataTable, 'id' | 'name' | 'columns'>
) => {
  const t = `"${table.name}"`;
  const prefix = `tr_${table.id}_`;
  const listening = (event: DataTriggerEvent) =>
    `EXISTS (SELECT 1 FROM _ganju_triggers WHERE table_id = ${table.id} AND event = '${event}' AND enabled = 1)`;
  const capture = (
    event: DataTriggerEvent,
    rowId: string,
    oldJson: string,
    newJson: string
  ) =>
    `INSERT INTO _ganju_changes (table_id, event, row_id, actor, old, new) VALUES (${table.id}, '${event}', ${rowId}, (SELECT actor FROM _ganju_context WHERE id = 1), ${oldJson}, ${newJson})`;
  const full = table as DataTable;
  return [
    {
      name: `${prefix}ev_ai`,
      sql: `CREATE TRIGGER IF NOT EXISTS "${prefix}ev_ai" AFTER INSERT ON ${t} WHEN ${listening('insert')} BEGIN ${capture('insert', 'new.id', 'NULL', jsonRowSql(full, 'new'))}; END`
    },
    {
      name: `${prefix}ev_au`,
      sql: `CREATE TRIGGER IF NOT EXISTS "${prefix}ev_au" AFTER UPDATE ON ${t} WHEN ${listening('update')} BEGIN ${capture('update', 'new.id', jsonRowSql(full, 'old'), jsonRowSql(full, 'new'))}; END`
    },
    {
      name: `${prefix}ev_ad`,
      sql: `CREATE TRIGGER IF NOT EXISTS "${prefix}ev_ad" AFTER DELETE ON ${t} WHEN ${listening('delete')} BEGIN ${capture('delete', 'old.id', jsonRowSql(full, 'old'), 'NULL')}; END`
    }
  ];
};

// Tables made before triggers existed have no capture triggers until their
// columns next change; the first trigger on one adds them.
export const ensureChangeCapture = (runner: SqlRunner, table: DataTable) => {
  for (const trigger of changeCaptureTriggers(table)) runner.all(trigger.sql);
};

const shape = (
  table: DataTable,
  raw: unknown
): Record<string, unknown> | null => {
  const stored = parse<Record<string, unknown>>(raw);
  if (!stored) return null;
  const out: Record<string, unknown> = {};
  for (const field of SYSTEM_FIELDS) out[field] = stored[field] ?? null;
  for (const column of table.columns) {
    out[column.name] = fromStored(column, stored[column.name] ?? null);
  }
  if (!table.customerScoped) delete out.participant_id;
  return out;
};

/**
 * A row as a trigger event carries it, read from the table: `id`, or the
 * newest row. Null when there is none. A test send and a run whose event
 * was too large to carry its row build their message from it, so it reads
 * as it does for the event, system fields and the customer included.
 */
export const readEventRow = (
  runner: SqlRunner,
  schema: DataSchema,
  tableName: string,
  id?: number
): Record<string, unknown> | null => {
  const table = schema.tables.find(t => t.name === tableName);
  if (!table) {
    throw new DataError(`There is no table named ${tableName}.`, 'not_found');
  }
  const [stored] =
    id === undefined
      ? runner.all(`SELECT * FROM "${table.name}" ORDER BY id DESC LIMIT 1`)
      : runner.all(`SELECT * FROM "${table.name}" WHERE id = ?`, [id]);
  return stored ? shape(table, JSON.stringify(stored)) : null;
};

const DEPTH_PATTERN = /^trigger:([^\s]+)$/;

/**
 * Turns the changes a write captured into events, inside the write's
 * transaction. A trigger never matches the writes of a run it started
 * (actor `trigger:<id>`), and a chain stops at DATA_TRIGGER_MAX_DEPTH with
 * an event that only records why. Returns how many events were stored.
 */
export const collectTriggerEvents = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller
): number => {
  const changes = runner.all('SELECT * FROM _ganju_changes ORDER BY id');
  if (changes.length === 0) return 0;
  runner.all('DELETE FROM _ganju_changes');
  const artifactId =
    (runner.all("SELECT value FROM _ganju_meta WHERE key = 'artifact_id'")[0]
      ?.value as string | undefined) ?? null;
  const triggers = runner
    .all('SELECT * FROM _ganju_triggers WHERE enabled = 1')
    .map(row => toTrigger(schema, row));
  const ownTrigger = DEPTH_PATTERN.exec(caller.actor)?.[1] ?? null;
  const depth = (caller.triggerDepth ?? 0) + 1;
  let stored = 0;
  for (const change of changes) {
    const table = schema.tables.find(t => t.id === Number(change.table_id));
    if (!table) continue;
    const event = change.event as DataTriggerEvent;
    const listening = triggers.filter(
      t => t.table === table.name && t.on === event
    );
    if (listening.length === 0) continue;
    const row = shape(table, change.new);
    const previous = shape(table, change.old);
    const customer = row?.participant_id ?? previous?.participant_id;
    for (const trigger of listening) {
      if (trigger.id === ownTrigger) continue;
      if (!conditionMatches(trigger.when, row, previous)) continue;
      const message: DataTriggerEventMessage = {
        eventId: `evt_${crypto.randomUUID().replace(/-/g, '')}`,
        artifactId: artifactId ?? '',
        triggerId: trigger.id,
        triggerName: trigger.name,
        table: table.name,
        event,
        rowId: Number(change.row_id),
        row,
        previous,
        actor: (change.actor as string | null) ?? null,
        depth,
        at: new Date().toISOString(),
        ...(typeof customer === 'string' && customer
          ? { participantId: customer }
          : {})
      };
      if (depth > DATA_TRIGGER_MAX_DEPTH) {
        message.row = null;
        message.previous = null;
        message.error = `Not run: a chain of triggers stops at depth ${DATA_TRIGGER_MAX_DEPTH} (this change was made by ${caller.actor}).`;
      } else if (utf8Bytes([row, previous]) > DATA_TRIGGER_MAX_ROW_BYTES) {
        message.row = null;
        message.previous = null;
        message.truncated = true;
      }
      runner.all(
        'INSERT INTO _ganju_outbox (id, trigger_id, message) VALUES (?, ?, ?)',
        [message.eventId, trigger.id, JSON.stringify(message)]
      );
      stored++;
    }
  }
  return stored;
};

// The outbox, oldest first, for the alarm to hand to the queue.
export const readOutbox = (
  runner: SqlRunner,
  limit = DATA_OUTBOX_BATCH
): { seq: number; message: DataTriggerEventMessage }[] =>
  runner
    .all('SELECT seq, message FROM _ganju_outbox ORDER BY seq LIMIT ?', [limit])
    .map(row => ({
      seq: Number(row.seq),
      message: JSON.parse(String(row.message)) as DataTriggerEventMessage
    }));

export const deleteOutbox = (runner: SqlRunner, throughSeq: number) => {
  runner.all('DELETE FROM _ganju_outbox WHERE seq <= ?', [throughSeq]);
};

export const outboxSize = (runner: SqlRunner): number =>
  Number(runner.all('SELECT count(*) AS n FROM _ganju_outbox')[0]?.n ?? 0);

// After a restore: events pending at the restored moment were sent then.
// Those stored before `before` came back with the restore; later ones are
// writes made since, and stay.
export const clearOutbox = (runner: SqlRunner, before: string): number => {
  const n = Number(
    runner.all('SELECT count(*) AS n FROM _ganju_outbox WHERE created_at < ?', [
      before
    ])[0]?.n ?? 0
  );
  runner.all('DELETE FROM _ganju_outbox WHERE created_at < ?', [before]);
  runner.all('DELETE FROM _ganju_changes');
  return n;
};

const conditionColumns = (condition: unknown): string[] => {
  if (!isPlainObject(condition)) return [];
  if (Array.isArray(condition.all))
    return condition.all.flatMap(conditionColumns);
  if (Array.isArray(condition.any))
    return condition.any.flatMap(conditionColumns);
  return Object.keys(condition);
};

const actionTexts = (action: DataTriggerAction | null): string[] => {
  switch (action?.type) {
    case 'chat':
      return [action.text];
    case 'email':
      return [action.subject, action.text];
    case 'customer':
      return [action.text, ...(action.template?.params ?? [])];
    default:
      return [];
  }
};

/**
 * The triggers whose condition or {{field}} texts name a column. Dropping it
 * is refused while any does, since they are only checked when saved and
 * would quietly stop matching.
 */
export const triggersUsingColumn = (
  runner: SqlRunner,
  tableId: number,
  column: string
): string[] =>
  runner
    .all(
      'SELECT name, condition, action FROM _ganju_triggers WHERE table_id = ? ORDER BY name',
      [tableId]
    )
    .filter(
      row =>
        conditionColumns(parse(row.condition)).includes(column) ||
        actionTexts(parse<DataTriggerAction>(row.action)).some(text =>
          templateFields(text).includes(column)
        )
    )
    .map(row => String(row.name));

const renameInCondition = (
  condition: unknown,
  from: string,
  to: string
): unknown => {
  if (!isPlainObject(condition)) return condition;
  if (Array.isArray(condition.all))
    return { all: condition.all.map(c => renameInCondition(c, from, to)) };
  if (Array.isArray(condition.any))
    return { any: condition.any.map(c => renameInCondition(c, from, to)) };
  return Object.fromEntries(
    Object.entries(condition).map(([key, test]) => [
      key === from ? to : key,
      test
    ])
  );
};

const renameInText = (text: string, from: string, to: string) =>
  text.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g, (match, field: string) =>
    field === from ? `{{${to}}}` : match
  );

const renameInAction = (
  action: DataTriggerAction,
  from: string,
  to: string
): DataTriggerAction => {
  const r = (text: string) => renameInText(text, from, to);
  switch (action.type) {
    case 'chat':
      return { ...action, text: r(action.text) };
    case 'email':
      return { ...action, subject: r(action.subject), text: r(action.text) };
    case 'customer':
      return {
        ...action,
        text: r(action.text),
        ...(action.template
          ? {
              template: {
                ...action.template,
                params: action.template.params?.map(r)
              }
            }
          : {})
      };
    default:
      return action;
  }
};

/**
 * A renamed column, renamed in the triggers that use it too, inside the
 * rename's transaction. Those deployed from ganju.json then differ from the
 * file until it is changed to match. Returns the triggers changed.
 */
export const renameColumnInTriggers = (
  runner: SqlRunner,
  tableId: number,
  from: string,
  to: string
): string[] => {
  const names = triggersUsingColumn(runner, tableId, from);
  for (const name of names) {
    const row = runner.all(
      'SELECT id, condition, action FROM _ganju_triggers WHERE name = ?',
      [name]
    )[0];
    const condition = parse(row.condition);
    const action = parse<DataTriggerAction>(row.action);
    runner.all(
      `UPDATE _ganju_triggers SET condition = ?, action = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      [
        condition === null
          ? null
          : JSON.stringify(renameInCondition(condition, from, to)),
        action ? JSON.stringify(renameInAction(action, from, to)) : row.action,
        row.id
      ]
    );
  }
  return names;
};
