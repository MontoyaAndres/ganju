// Stand-in for the database object's query compiler, run on a local SQLite
// file so the data tools can be evaluated before the real one exists. It
// follows the same rules: identifiers are checked against the schema, every
// value is a bound parameter, and the owner's tables are the only thing the
// model can name.
import { DatabaseSync } from 'node:sqlite';

export class DataError extends Error {}

const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/;
const SYSTEM_COLUMNS = ['id', 'created_at', 'updated_at'];
const HIDDEN_COLUMNS = new Set([
  'version',
  'created_by',
  'updated_by',
  'participant_id'
]);
const NUMERIC_TYPES = new Set(['integer', 'decimal']);
const TEXT_TYPES = new Set(['text', 'long_text', 'email', 'url', 'phone']);
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const MAX_OPERATIONS = 50;
const OPERATORS = [
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'notIn',
  'contains',
  'startsWith',
  'isNull'
];

const quote = name => `"${name}"`;

const isoSeconds = date => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

// ---------------------------------------------------------------------------
// Schema

const columnSql = (table, column) => {
  const name = quote(column.name);
  const parts = [name];
  switch (column.type) {
    case 'integer':
      parts.push('INTEGER');
      break;
    case 'decimal':
      parts.push('REAL');
      break;
    case 'boolean':
      parts.push(`INTEGER CHECK (${name} IN (0, 1))`);
      break;
    case 'date':
      parts.push(`TEXT CHECK (${name} IS NULL OR date(${name}) = ${name})`);
      break;
    case 'enum':
      parts.push(
        `TEXT CHECK (${name} IN (${column.values
          .map(v => `'${v.replace(/'/g, "''")}'`)
          .join(', ')}))`
      );
      break;
    case 'json':
      parts.push(`TEXT CHECK (${name} IS NULL OR json_valid(${name}))`);
      break;
    case 'relation':
      parts.push(
        `INTEGER REFERENCES ${quote(column.table)}(id) ON DELETE ${(
          column.onDelete || 'restrict'
        ).toUpperCase()}`
      );
      break;
    default:
      parts.push('TEXT');
  }
  // "min": the owner's floor for a number, e.g. stock can't go below 0;
  // SQLite enforces it, so no prompt or forgotten guard can break it.
  if (column.min !== undefined) {
    parts.push(`CONSTRAINT ${column.name}__min CHECK (${name} IS NULL OR ${name} >= ${Number(column.min)})`);
  }
  if (column.required) parts.push('NOT NULL');
  if (column.unique) parts.push('UNIQUE');
  if (column.default !== undefined) {
    const value =
      typeof column.default === 'boolean'
        ? Number(column.default)
        : column.default;
    parts.push(
      `DEFAULT ${typeof value === 'number' ? value : `'${String(value).replace(/'/g, "''")}'`}`
    );
  }
  return parts.join(' ');
};

const tableSql = table => {
  const now = "(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))";
  return [
    `CREATE TABLE ${quote(table.name)} (`,
    [
      'id INTEGER PRIMARY KEY',
      ...table.columns.map(column => columnSql(table, column)),
      `created_at TEXT NOT NULL DEFAULT ${now}`,
      `updated_at TEXT NOT NULL DEFAULT ${now}`,
      'version INTEGER NOT NULL DEFAULT 1',
      'created_by TEXT',
      'updated_by TEXT',
      ...(table.customerScoped ? ['participant_id TEXT'] : [])
    ].join(',\n  '),
    ')'
  ].join('\n');
};

const searchableColumns = table =>
  table.columns.filter(column => column.searchable).map(column => column.name);

const ftsSql = table => {
  const columns = searchableColumns(table);
  if (columns.length === 0) return [];
  const t = table.name;
  const list = columns.map(quote).join(', ');
  const newValues = columns.map(c => `new.${quote(c)}`).join(', ');
  const oldValues = columns.map(c => `old.${quote(c)}`).join(', ');
  return [
    `CREATE VIRTUAL TABLE ${t}__fts USING fts5(${list}, content='${t}', content_rowid='id', tokenize='unicode61 remove_diacritics 2')`,
    `CREATE TRIGGER ${t}__fts_ai AFTER INSERT ON ${quote(t)} BEGIN INSERT INTO ${t}__fts(rowid, ${list}) VALUES (new.id, ${newValues}); END`,
    `CREATE TRIGGER ${t}__fts_ad AFTER DELETE ON ${quote(t)} BEGIN INSERT INTO ${t}__fts(${t}__fts, rowid, ${list}) VALUES ('delete', old.id, ${oldValues}); END`,
    `CREATE TRIGGER ${t}__fts_au AFTER UPDATE ON ${quote(t)} BEGIN INSERT INTO ${t}__fts(${t}__fts, rowid, ${list}) VALUES ('delete', old.id, ${oldValues}); INSERT INTO ${t}__fts(rowid, ${list}) VALUES (new.id, ${newValues}); END`
  ];
};

const versionTriggerSql = table =>
  `CREATE TRIGGER ${table.name}__version AFTER UPDATE ON ${quote(table.name)} WHEN old.version = new.version BEGIN UPDATE ${quote(table.name)} SET version = old.version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = new.id; END`;

const indexSql = table =>
  table.columns
    .filter(
      column =>
        column.type === 'relation' || column.filterable || column.unique
    )
    .filter(column => !column.unique)
    .map(
      column =>
        `CREATE INDEX ${table.name}_${column.name} ON ${quote(table.name)}(${quote(column.name)})`
    )
    .concat(
      table.customerScoped
        ? [
            `CREATE INDEX ${table.name}_participant ON ${quote(table.name)}(participant_id)`
          ]
        : []
    );

const validateDefinition = definition => {
  for (const table of definition.tables) {
    if (!IDENTIFIER.test(table.name) || table.name.startsWith('_ganju_')) {
      throw new Error(`bad table name ${table.name}`);
    }
    for (const column of table.columns) {
      if (
        !IDENTIFIER.test(column.name) ||
        SYSTEM_COLUMNS.includes(column.name) ||
        HIDDEN_COLUMNS.has(column.name)
      ) {
        throw new Error(`bad column name ${table.name}.${column.name}`);
      }
    }
  }
};

export const openDatabase = (definition, { now = new Date() } = {}) => {
  validateDefinition(definition);
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const table of definition.tables) {
    db.exec(tableSql(table));
    for (const statement of [
      ...ftsSql(table),
      versionTriggerSql(table),
      ...indexSql(table)
    ]) {
      db.exec(statement);
    }
  }
  const state = {
    db,
    definition,
    tables: new Map(definition.tables.map(table => [table.name, table]))
  };
  const rows = definition.seed(seedHelpers(now, definition.timeZone));
  db.exec('BEGIN');
  for (const table of definition.tables) {
    for (const row of rows[table.name] || []) {
      const { participant_id, created_at, ...values } = row;
      const record = { ...values };
      const names = Object.keys(record);
      const extra = [];
      const params = names.map(name => storeSeedValue(table, name, record[name]));
      if (created_at) extra.push(['created_at', created_at], ['updated_at', created_at]);
      if (participant_id) extra.push(['participant_id', participant_id]);
      db.prepare(
        `INSERT INTO ${quote(table.name)} (${[...names, ...extra.map(e => e[0])]
          .map(quote)
          .join(', ')}) VALUES (${[...names, ...extra].map(() => '?').join(', ')})`
      ).run(...params, ...extra.map(e => e[1]));
    }
  }
  db.exec('COMMIT');
  return state;
};

const storeSeedValue = (table, name, value) => {
  const column = table.columns.find(c => c.name === name);
  if (!column) throw new Error(`seed: unknown column ${table.name}.${name}`);
  if (column.type === 'boolean') return value ? 1 : 0;
  if (column.type === 'json') return JSON.stringify(value);
  return value;
};

// Dates for seeds, relative to the run's "now" so "today" and "this week"
// stay true whenever the eval runs. Local times are in the database's zone.
const seedHelpers = (now, timeZone) => {
  const offsetMinutes = zoneOffsetMinutes(now, timeZone);
  const localNow = new Date(now.getTime() + offsetMinutes * 60_000);
  const localMidnight = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate()
  );
  const toUtc = localMs => new Date(localMs - offsetMinutes * 60_000);
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  return {
    now,
    random,
    pick: list => list[Math.floor(random() * list.length)],
    // A datetime `days` days before today, at local `hour`:`minute`; today's
    // times are capped at a minute before now so nothing is in the future.
    at: (days, hour = 12, minute = 0) => {
      const local = localMidnight - days * 86_400_000 + (hour * 60 + minute) * 60_000;
      const utc = toUtc(local);
      return isoSeconds(utc > now ? new Date(now.getTime() - 60_000 * (1 + hour)) : utc);
    },
    // A datetime `days` days from today (negative for the past), at local time.
    future: (days, hour = 12, minute = 0) =>
      isoSeconds(toUtc(localMidnight + days * 86_400_000 + (hour * 60 + minute) * 60_000)),
    date: days =>
      new Date(localMidnight - days * 86_400_000).toISOString().slice(0, 10)
  };
};

export const zoneOffsetMinutes = (date, timeZone) => {
  if (!timeZone) return 0;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
    .formatToParts(date)
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
};

// ---------------------------------------------------------------------------
// Access

const ACCESS_RANK = { none: 0, read: 1, add: 2, full: 3 };

// Per-table access is what channel bots get; the owner's own MCP session
// (the eval's "owner" mode) can do everything.
const accessOf = (state, table) =>
  state.actor?.mode === 'owner' ? 'full' : table.access;

const visibleTables = state =>
  state.definition.tables.filter(table => ACCESS_RANK[accessOf(state, table)] >= 1);

const tableFor = (state, name, need = 'read') => {
  const table = typeof name === 'string' ? state.tables.get(name) : undefined;
  const names = visibleTables(state).map(t => t.name);
  if (!table || ACCESS_RANK[accessOf(state, table)] < 1) {
    throw new DataError(
      `Unknown table "${name}". Tables: ${names.join(', ')}.`
    );
  }
  if (ACCESS_RANK[accessOf(state, table)] < ACCESS_RANK[need]) {
    const access = accessOf(state, table);
    const allowed =
      access === 'read'
        ? 'read only'
        : access === 'add'
          ? 'read and add rows only'
          : access;
    throw new DataError(
      `Not allowed: the assistant's access to "${table.name}" is ${allowed}.`
    );
  }
  return table;
};

const isScoped = (state, table, actor) =>
  actor.mode !== 'owner' && Boolean(table.customerScoped);

// ---------------------------------------------------------------------------
// Values

const columnFor = (table, name) => {
  if (SYSTEM_COLUMNS.includes(name)) {
    return { name, type: name === 'id' ? 'integer' : 'datetime', system: true };
  }
  return table.columns.find(column => column.name === name);
};

const unknownColumn = (table, name) =>
  new DataError(
    `Unknown column "${name}" in ${table.name}. Columns: ${[
      ...SYSTEM_COLUMNS,
      ...table.columns.map(c => c.name)
    ].join(', ')}.`
  );

const normaliseDatetime = (value, column) => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new DataError(`${column}: expected an ISO 8601 date and time.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new DataError(
      `${column}: "${value}" is not a date and time; use ISO 8601, e.g. 2026-10-19T09:00:00-05:00.`
    );
  }
  return isoSeconds(date);
};

// Turns a value from the model into what the column stores, or explains why
// it can't.
const toStored = (table, column, value) => {
  const label = `${table.name}.${column.name}`;
  if (value === null) {
    if (column.required) throw new DataError(`${label} is required.`);
    return null;
  }
  switch (column.type) {
    case 'integer':
    case 'relation': {
      const n = typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : value;
      if (!Number.isInteger(n)) {
        throw new DataError(
          column.type === 'relation'
            ? `${label} takes the id (a whole number) of a row in ${column.table}.`
            : `${label} must be a whole number.`
        );
      }
      return n;
    }
    case 'decimal': {
      const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
      if (typeof n !== 'number' || Number.isNaN(n)) {
        throw new DataError(`${label} must be a number.`);
      }
      return n;
    }
    case 'boolean':
      if (value === true || value === 'true' || value === 1) return 1;
      if (value === false || value === 'false' || value === 0) return 0;
      throw new DataError(`${label} must be true or false.`);
    case 'date':
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new DataError(`${label} must be a date, YYYY-MM-DD.`);
      }
      return value;
    case 'datetime':
      return normaliseDatetime(value, label);
    case 'enum': {
      const match = column.values.find(
        v => v.toLowerCase() === String(value).toLowerCase()
      );
      if (!match) {
        throw new DataError(
          `${label} must be one of: ${column.values.join(', ')}.`
        );
      }
      return match;
    }
    case 'json':
      return JSON.stringify(value);
    case 'email':
      if (typeof value !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
        throw new DataError(`${label} must be an email address.`);
      }
      return value.trim();
    case 'url':
      if (typeof value !== 'string' || !/^https?:\/\//.test(value)) {
        throw new DataError(`${label} must be a URL starting with http(s)://.`);
      }
      return value;
    case 'phone':
      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new DataError(`${label} must be a phone number.`);
      }
      return String(value).replace(/[^\d+]/g, '');
    default:
      if (typeof value === 'object') {
        throw new DataError(`${label} must be text.`);
      }
      return String(value);
  }
};

const zoned = (iso, timeZone) => {
  const date = new Date(iso);
  if (!timeZone || Number.isNaN(date.getTime())) return iso;
  const offset = zoneOffsetMinutes(date, timeZone);
  const local = new Date(date.getTime() + offset * 60_000).toISOString().slice(0, 19);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
};

const fromStored = (column, value, timeZone) => {
  if (value === null || value === undefined) return null;
  if (column.type === 'datetime') return zoned(value, timeZone);
  if (column.type === 'boolean') return value === 1;
  if (column.type === 'json') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

// ---------------------------------------------------------------------------
// Filters

// Resolves "column" or "relation.column" to a SQL expression, adding the join
// a relation path needs.
const resolvePath = (state, table, path, joins) => {
  if (typeof path !== 'string') throw new DataError('Column names are strings.');
  const [head, tail, ...rest] = path.split('.');
  if (rest.length > 0) {
    throw new DataError(
      `"${path}": only one level of relation is supported (relation.column).`
    );
  }
  const column = columnFor(table, head);
  if (!column) throw unknownColumn(table, head);
  if (tail === undefined) {
    return { sql: `t.${quote(head)}`, column, table };
  }
  if (column.type !== 'relation') {
    throw new DataError(`"${head}" is not a relation, so "${path}" can't be used.`);
  }
  const target = tableFor(state, column.table);
  const targetColumn = columnFor(target, tail);
  if (!targetColumn) throw unknownColumn(target, tail);
  const alias = `j_${head}`;
  joins.set(alias, `LEFT JOIN ${quote(target.name)} ${alias} ON ${alias}.id = t.${quote(head)}`);
  return { sql: `${alias}.${quote(tail)}`, column: targetColumn, table: target };
};

const filterValue = (resolved, value) => {
  const { column, table } = resolved;
  if (column.type === 'datetime') return normaliseDatetime(value, column.name);
  if (column.type === 'boolean') return toStored(table, column, value);
  if (column.type === 'enum') {
    const match = column.values.find(v => v.toLowerCase() === String(value).toLowerCase());
    if (!match) {
      throw new DataError(`${table.name}.${column.name} is one of: ${column.values.join(', ')}.`);
    }
    return match;
  }
  if (NUMERIC_TYPES.has(column.type) || column.type === 'relation') {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof n !== 'number' || Number.isNaN(n)) {
      throw new DataError(`${table.name}.${column.name} compares with a number.`);
    }
    return n;
  }
  if (typeof value === 'object' && value !== null) {
    throw new DataError(`${table.name}.${column.name}: expected a value or an operator object.`);
  }
  return value;
};

const compileWhere = (state, table, where, joins, params) => {
  if (where === undefined || where === null) return [];
  if (typeof where !== 'object' || Array.isArray(where)) {
    throw new DataError('"where" is an object: { column: value, column: { operator: value } }.');
  }
  const clauses = [];
  for (const [key, condition] of Object.entries(where)) {
    if (key === 'or' || key === 'and') {
      if (!Array.isArray(condition) || condition.length === 0) {
        throw new DataError(`"${key}" takes a list of where objects.`);
      }
      const parts = condition.map(sub => {
        const inner = compileWhere(state, table, sub, joins, params);
        return inner.length ? `(${inner.join(' AND ')})` : '1';
      });
      clauses.push(`(${parts.join(key === 'or' ? ' OR ' : ' AND ')})`);
      continue;
    }
    const resolved = resolvePath(state, table, key, joins);
    // { "customer": { "name": "Ana" } } reads as "customer.name": models
    // write relation filters this way unprompted.
    if (
      resolved.column.type === 'relation' &&
      !key.includes('.') &&
      condition !== null &&
      typeof condition === 'object' &&
      !Array.isArray(condition) &&
      Object.keys(condition).some(k => !OPERATORS.includes(k))
    ) {
      clauses.push(
        ...compileWhere(
          state,
          table,
          Object.fromEntries(Object.entries(condition).map(([k, v]) => [`${key}.${k}`, v])),
          joins,
          params
        )
      );
      continue;
    }
    const isOperatorObject =
      condition !== null &&
      typeof condition === 'object' &&
      !Array.isArray(condition) &&
      resolved.column.type !== 'json';
    if (!isOperatorObject) {
      if (Array.isArray(condition)) {
        throw new DataError(`${key}: to match several values use { "in": [...] }.`);
      }
      if (condition === null) {
        clauses.push(`${resolved.sql} IS NULL`);
      } else {
        clauses.push(`${resolved.sql} = ?`);
        params.push(filterValue(resolved, condition));
      }
      continue;
    }
    for (const [operator, value] of Object.entries(condition)) {
      if (!OPERATORS.includes(operator)) {
        throw new DataError(
          `${key}: unknown operator "${operator}". Operators: ${OPERATORS.join(', ')}.`
        );
      }
      switch (operator) {
        case 'eq':
        case 'ne':
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte': {
          if (value === null && (operator === 'eq' || operator === 'ne')) {
            clauses.push(`${resolved.sql} IS ${operator === 'ne' ? 'NOT ' : ''}NULL`);
            break;
          }
          const sign = { eq: '=', ne: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' }[operator];
          if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.column === 'string') {
            const other = resolvePath(state, table, value.column, joins);
            clauses.push(`${resolved.sql} ${sign} ${other.sql}`);
            break;
          }
          clauses.push(`${resolved.sql} ${sign} ?`);
          params.push(filterValue(resolved, value));
          break;
        }
        case 'in':
        case 'notIn': {
          if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
            throw new DataError(`${key}.${operator} takes a list of 1 to 50 values.`);
          }
          clauses.push(
            `${resolved.sql} ${operator === 'notIn' ? 'NOT ' : ''}IN (${value.map(() => '?').join(', ')})`
          );
          params.push(...value.map(v => filterValue(resolved, v)));
          break;
        }
        case 'contains':
        case 'startsWith': {
          if (typeof value !== 'string') {
            throw new DataError(`${key}.${operator} takes text.`);
          }
          const escaped = value.replace(/[\\%_]/g, c => `\\${c}`);
          clauses.push(`${resolved.sql} LIKE ? ESCAPE '\\'`);
          params.push(operator === 'contains' ? `%${escaped}%` : `${escaped}%`);
          break;
        }
        case 'isNull':
          clauses.push(`${resolved.sql} IS ${value ? '' : 'NOT '}NULL`);
          break;
      }
    }
  }
  return clauses;
};

// ---------------------------------------------------------------------------
// Search

const ftsMatch = (text, any) => {
  const tokens = String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu);
  if (!tokens || tokens.length === 0) {
    throw new DataError('"search" needs at least one word.');
  }
  return tokens.slice(0, 10).map(t => `"${t}"*`).join(any ? ' OR ' : ' ');
};

// ---------------------------------------------------------------------------
// Rows out

const relationLabels = (state, table) =>
  table.columns
    .filter(column => column.type === 'relation')
    .map(column => {
      const target = state.tables.get(column.table);
      return { column, target, display: target.displayColumn || 'id' };
    });

const selectList = (state, table, joins) => {
  const list = ['t.id', 't.created_at', 't.updated_at'];
  for (const column of table.columns) list.push(`t.${quote(column.name)}`);
  for (const { column, target, display } of relationLabels(state, table)) {
    const alias = `l_${column.name}`;
    joins.set(alias, `LEFT JOIN ${quote(target.name)} ${alias} ON ${alias}.id = t.${quote(column.name)}`);
    list.push(`${alias}.${quote(display)} AS ${quote(`__label_${column.name}`)}`);
  }
  return list;
};

const shapeRow = (state, table, raw) => {
  const row = { id: raw.id };
  for (const column of table.columns) {
    const value = fromStored(column, raw[column.name], state.definition.timeZone);
    if (column.type === 'relation') {
      const target = state.tables.get(column.table);
      const display = columnFor(target, target.displayColumn || 'id');
      const label = raw[`__label_${column.name}`] ?? null;
      row[column.name] =
        value === null
          ? null
          : { id: value, label: display?.type === 'datetime' && label ? zoned(label, state.definition.timeZone) : label };
    } else {
      row[column.name] = value;
    }
  }
  row.created_at = zoned(raw.created_at, state.definition.timeZone);
  row.updated_at = zoned(raw.updated_at, state.definition.timeZone);
  return row;
};

const encodeCursor = offset => Buffer.from(JSON.stringify({ o: offset })).toString('base64url');
const decodeCursor = cursor => {
  try {
    const { o } = JSON.parse(Buffer.from(String(cursor), 'base64url').toString());
    if (!Number.isInteger(o) || o < 0) throw new Error();
    return o;
  } catch {
    throw new DataError('"cursor" is not one this tool returned.');
  }
};

// ---------------------------------------------------------------------------
// The three tools

// Models sometimes quote keys twice ("\"stock\"") or send "where" as a
// JSON string; both are read as meant.
const tidyKey = key => key.replace(/^[\s"'`]+|[\s"'`]+$/g, '');
const tidy = value => {
  if (Array.isArray(value)) return value.map(tidy);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [tidyKey(k), tidy(v)]));
  }
  return value;
};
const tidyArgs = args => {
  const out = tidy(args ?? {});
  for (const key of ['where', 'aggregate', 'groupBy', 'sort', 'include', 'operations']) {
    if (typeof out[key] === 'string') {
      try {
        out[key] = tidy(JSON.parse(out[key]));
      } catch {
        // Left as is; the compiler explains the expected shape.
      }
    }
  }
  return out;
};

export const describe = (state, rawArgs = {}, actor) => {
  state.actor = actor;
  const args = tidyArgs(rawArgs);
  const tables = args.table
    ? [tableFor(state, args.table)]
    : visibleTables(state);
  return {
    tables: tables.map(table => {
      const rowCount = state.db
        .prepare(`SELECT count(*) AS n FROM ${quote(table.name)}`)
        .get().n;
      return {
        name: table.name,
        description: table.description,
        access: accessOf(state, table),
        ...(state.actor?.mode !== 'owner' && table.customerScoped ? { onlyThisCustomersRows: true } : {}),
        rows: rowCount,
        displayColumn: table.displayColumn || 'id',
        searchable: searchableColumns(table),
        columns: [
          { name: 'id', type: 'integer' },
          ...table.columns.map(column => ({
            name: column.name,
            type: column.type,
            ...(column.required ? { required: true } : {}),
            ...(column.unique ? { unique: true } : {}),
            ...(column.values ? { values: column.values } : {}),
            ...(column.type === 'relation' ? { references: column.table } : {}),
            ...(column.default !== undefined ? { default: column.default } : {}),
            ...(column.min !== undefined ? { min: column.min } : {}),
            ...(column.description ? { description: column.description } : {})
          })),
          { name: 'created_at', type: 'datetime' },
          { name: 'updated_at', type: 'datetime' }
        ],
        referencedBy: state.definition.tables
          .filter(other => ACCESS_RANK[accessOf(state, other)] >= 1)
          .flatMap(other =>
            other.columns
              .filter(c => c.type === 'relation' && c.table === table.name)
              .map(c => `${other.name}.${c.name}`)
          )
      };
    })
  };
};

export const query = (state, rawArgs, actor) => {
  state.actor = actor;
  if (!rawArgs || typeof rawArgs !== 'object') throw new DataError('Arguments are an object.');
  const args = tidyArgs(rawArgs);
  const table = tableFor(state, args.table);
  const joins = new Map();
  const params = [];
  const where = compileWhere(state, table, args.where, joins, params);
  if (isScoped(state, table, actor)) {
    where.push('t.participant_id = ?');
    params.push(actor.participantId);
  }
  let searchJoin = '';
  const searchParams = [];
  if (args.search !== undefined && args.search !== null && args.search !== '') {
    if (searchableColumns(table).length === 0) {
      throw new DataError(
        `"${table.name}" has no searchable columns; filter with "where" instead (e.g. { "name": { "contains": "..." } }).`
      );
    }
    searchJoin = `JOIN (SELECT rowid AS _r, bm25(${table.name}__fts) AS _rank FROM ${table.name}__fts WHERE ${table.name}__fts MATCH ?) s ON s._r = t.id`;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  if (args.aggregate !== undefined) {
    return aggregate(state, table, args, { joins, params, whereSql, searchJoin, actor });
  }

  const limit = args.limit === undefined ? DEFAULT_LIMIT : args.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new DataError(`"limit" is 1 to ${MAX_LIMIT}.`);
  }
  const offset = args.cursor ? decodeCursor(args.cursor) : 0;
  const order = [];
  const sortJoins = joins;
  for (const entry of args.sort === undefined ? [] : Array.isArray(args.sort) ? args.sort : [args.sort]) {
    if (typeof entry !== 'string') {
      throw new DataError('"sort" is a list of column names; prefix with "-" for descending, e.g. ["-created_at"].');
    }
    const descending = entry.startsWith('-');
    const resolved = resolvePath(state, table, descending ? entry.slice(1) : entry, sortJoins);
    order.push(`${resolved.sql} ${descending ? 'DESC' : 'ASC'}`);
  }
  if (order.length === 0 && searchJoin) order.push('s._rank');
  order.push('t.id ASC');

  const select = selectList(state, table, joins);
  const from = `FROM ${quote(table.name)} t ${searchJoin} ${[...joins.values()].join(' ')}`;
  const run = searchText => {
    const allParams = searchJoin ? [searchText, ...params] : params;
    const total = state.db
      .prepare(`SELECT count(*) AS n ${from} ${whereSql}`)
      .get(...allParams).n;
    const rows = state.db
      .prepare(
        `SELECT ${select.join(', ')} ${from} ${whereSql} ORDER BY ${order.join(', ')} LIMIT ? OFFSET ?`
      )
      .all(...allParams, limit, offset);
    return { total, rows };
  };
  let result;
  let matched;
  if (searchJoin) {
    result = run(ftsMatch(args.search, false));
    matched = 'all words';
    if (result.total === 0) {
      result = run(ftsMatch(args.search, true));
      matched = 'any word';
    }
  } else {
    result = run();
  }
  const rows = result.rows.map(raw => shapeRow(state, table, raw));
  if (args.include !== undefined) includeRelations(state, table, rows, args.include, actor);
  return {
    table: table.name,
    ...(isScoped(state, table, actor) ? { scope: "only this customer's own rows; other customers' rows are not visible" } : {}),
    total: result.total,
    ...(matched ? { searchMatched: matched } : {}),
    rows,
    ...(offset + rows.length < result.total
      ? { nextCursor: encodeCursor(offset + rows.length) }
      : {})
  };
};

const includeRelations = (state, table, rows, include, actor) => {
  if (!Array.isArray(include)) {
    throw new DataError('"include" is a list of relation columns, e.g. ["customer"].');
  }
  for (const name of include) {
    const column = columnFor(table, name);
    if (!column) throw unknownColumn(table, name);
    if (column.type !== 'relation') {
      throw new DataError(`"${name}" is not a relation column; include takes relation columns.`);
    }
    const target = tableFor(state, column.table);
    const ids = [...new Set(rows.map(r => r[name]?.id).filter(Boolean))];
    if (ids.length === 0) continue;
    const joins = new Map();
    const scoped = isScoped(state, target, actor);
    const related = state.db
      .prepare(
        `SELECT ${selectList(state, target, joins).join(', ')} FROM ${quote(target.name)} t ${[...joins.values()].join(' ')} WHERE t.id IN (${ids.map(() => '?').join(', ')})${scoped ? ' AND t.participant_id = ?' : ''}`
      )
      .all(...ids, ...(scoped ? [actor.participantId] : []))
      .map(raw => shapeRow(state, target, raw));
    const byId = new Map(related.map(r => [r.id, r]));
    for (const row of rows) {
      if (row[name]) row[name] = byId.get(row[name].id) ?? row[name];
    }
  }
};

const AGGREGATE_FUNCTIONS = ['count', 'sum', 'avg', 'min', 'max'];

const aggregate = (state, table, args, { joins, params, whereSql, searchJoin }) => {
  const list = Array.isArray(args.aggregate) ? args.aggregate : [args.aggregate];
  if (list.length === 0 || list.length > 5) {
    throw new DataError('"aggregate" is a list of 1 to 5 { "fn": ..., "column": ... }.');
  }
  const selects = [];
  const names = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || !AGGREGATE_FUNCTIONS.includes(item.fn)) {
      throw new DataError(
        `Each aggregate is { "fn": one of ${AGGREGATE_FUNCTIONS.join(', ')}, "column": ... }.`
      );
    }
    if (item.fn === 'count' && !item.column) {
      selects.push('count(*)');
      names.push('count');
      continue;
    }
    if (!item.column) throw new DataError(`"${item.fn}" needs a "column".`);
    const resolved = resolvePath(state, table, item.column, joins);
    if (item.fn !== 'count' && item.fn !== 'min' && item.fn !== 'max' && !NUMERIC_TYPES.has(resolved.column.type)) {
      throw new DataError(`${item.fn} needs a number column; "${item.column}" is ${resolved.column.type}.`);
    }
    // { "fn": "sum", "column": "stock", "times": "unit_cost" }: the sum of
    // a product, e.g. stock value, which rows alone can't give in one call.
    if (item.times !== undefined) {
      const other = resolvePath(state, table, item.times, joins);
      if (!NUMERIC_TYPES.has(resolved.column.type) || !NUMERIC_TYPES.has(other.column.type)) {
        throw new DataError('"times" multiplies two number columns.');
      }
      selects.push(`${item.fn}(${resolved.sql} * ${other.sql})`);
      names.push(`${item.fn}_${item.column.replace('.', '_')}_times_${item.times.replace('.', '_')}`);
      continue;
    }
    selects.push(`${item.fn}(${resolved.sql})`);
    names.push(`${item.fn}_${item.column.replace('.', '_')}`);
  }
  const groupBy = args.groupBy === undefined ? [] : Array.isArray(args.groupBy) ? args.groupBy : [args.groupBy];
  if (groupBy.length > 3) throw new DataError('"groupBy" takes up to 3 columns.');
  const groupResolved = groupBy.map(path => ({ path, ...resolvePath(state, table, path, joins) }));
  const groupSelects = [];
  for (const [i, g] of groupResolved.entries()) {
    groupSelects.push(`${g.sql} AS ${quote(`__g${i}`)}`);
    if (g.column.type === 'relation') {
      const target = state.tables.get(g.column.table);
      const alias = `g_${i}`;
      joins.set(alias, `LEFT JOIN ${quote(target.name)} ${alias} ON ${alias}.id = ${g.sql}`);
      groupSelects.push(`${alias}.${quote(target.displayColumn || 'id')} AS ${quote(`__gl${i}`)}`);
    }
  }
  const from = `FROM ${quote(table.name)} t ${searchJoin} ${[...joins.values()].join(' ')}`;
  const allParams = searchJoin ? [ftsMatch(args.search, false), ...params] : params;
  const sql = `SELECT ${[...groupSelects, ...selects.map((s, i) => `${s} AS ${quote(`__a${i}`)}`)].join(', ')} ${from} ${whereSql}${
    groupResolved.length ? ` GROUP BY ${groupResolved.map((_, i) => quote(`__g${i}`)).join(', ')} ORDER BY ${quote('__a0')} DESC` : ''
  } LIMIT 100`;
  const rows = state.db.prepare(sql).all(...allParams).map(raw => {
    const out = {};
    groupResolved.forEach((g, i) => {
      const value = fromStored(g.column, raw[`__g${i}`], state.definition.timeZone);
      out[g.path] =
        g.column.type === 'relation' && value !== null
          ? { id: value, label: raw[`__gl${i}`] ?? null }
          : value;
    });
    names.forEach((name, i) => {
      const value = raw[`__a${i}`];
      out[name] = typeof value === 'number' ? Math.round(value * 100) / 100 : value;
    });
    return out;
  });
  return {
    table: table.name,
    ...(isScoped(state, table, state.actor) ? { scope: "only this customer's own rows; other customers' rows are not visible" } : {}),
    ...(groupResolved.length ? { groups: rows } : rows[0])
  };
};

// ---------------------------------------------------------------------------
// Writes

const resolveRefs = (value, results, index) => {
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 && '$ref' in value) {
    const ref = value.$ref;
    if (!Number.isInteger(ref) || ref < 0 || ref >= index || results[ref]?.op !== 'insert') {
      throw new DataError(`{ "$ref": ${JSON.stringify(ref)} } must point at an earlier insert in this list (0-based).`);
    }
    return results[ref].id;
  }
  return value;
};

const constraintMessage = (state, table, error) => {
  const text = error.message || String(error);
  let m = /NOT NULL constraint failed: \w+\.(\w+)/.exec(text);
  if (m) return `${table.name}.${m[1]} is required.`;
  m = /UNIQUE constraint failed: \w+\.(\w+)/.exec(text);
  if (m) return `Another row in ${table.name} already has this ${m[1]}.`;
  m = /CHECK constraint failed: (\w+)__min/.exec(text);
  if (m) {
    const column = table.columns.find(c => c.name === m[1]);
    return `${table.name}.${m[1]} can't go below ${column?.min ?? 0}.`;
  }
  m = /CHECK constraint failed: (\w+)/.exec(text);
  if (m) return `Invalid value for ${table.name}.${m[1]}.`;
  if (/FOREIGN KEY constraint failed/.test(text)) {
    return `A relation in ${table.name} points at a row that doesn't exist, or other rows still point at this one.`;
  }
  return `The write failed: ${text}`;
};

const targetWhere = (state, table, op, actor, joins, params) => {
  if (op.id === undefined && op.where === undefined) {
    throw new DataError(`${op.op} on ${table.name} needs "id" or "where".`);
  }
  const clauses = [];
  if (op.id !== undefined) {
    if (!Number.isInteger(op.id)) throw new DataError('"id" is a whole number.');
    clauses.push('t.id = ?');
    params.push(op.id);
  }
  clauses.push(...compileWhere(state, table, op.where, joins, params));
  if (clauses.length === 0) {
    throw new DataError(`${op.op} on ${table.name} needs a non-empty "where".`);
  }
  if (isScoped(state, table, actor)) {
    clauses.push('t.participant_id = ?');
    params.push(actor.participantId);
  }
  return clauses.join(' AND ');
};

// Explains a guard that stopped a write: the current values of the columns
// the where named, for the row the id named.
const explainGuard = (state, table, op, actor) => {
  if (op.id === undefined) return '';
  const scoped = isScoped(state, table, actor);
  const row = state.db
    .prepare(`SELECT * FROM ${quote(table.name)} WHERE id = ?${scoped ? ' AND participant_id = ?' : ''}`)
    .get(op.id, ...(scoped ? [actor.participantId] : []));
  if (!row) return ` Row ${op.id} doesn't exist in ${table.name}.`;
  const names = Object.keys(op.where || {}).filter(k => k in row);
  if (names.length === 0) return '';
  return ` Current values: ${names.map(n => `${n} = ${JSON.stringify(row[n])}`).join(', ')}.`;
};

const runOperation = (state, op, index, results, actor) => {
  if (!op || typeof op !== 'object') throw new DataError(`Operation ${index} is not an object.`);
  const kind = op.op;
  if (!['insert', 'update', 'delete'].includes(kind)) {
    throw new DataError(`Operation ${index}: "op" is insert, update or delete.`);
  }
  const table = tableFor(state, op.table, kind === 'insert' ? 'add' : 'full');
  const actorId = actor.mode === 'owner' ? 'mcp:owner' : `channel:${actor.participantId}`;

  if (kind === 'insert') {
    if (!op.values || typeof op.values !== 'object' || Array.isArray(op.values)) {
      throw new DataError(`Operation ${index}: insert needs "values", an object of column: value.`);
    }
    const names = [];
    const params = [];
    for (const [name, raw] of Object.entries(op.values)) {
      if (name === 'id' || name === 'created_at' || name === 'updated_at') {
        throw new DataError(`${table.name}.${name} is set by the database; leave it out.`);
      }
      const column = columnFor(table, name);
      if (!column) throw unknownColumn(table, name);
      names.push(name);
      params.push(toStored(table, column, resolveRefs(raw, results, index)));
    }
    const missing = table.columns.filter(
      c => c.required && c.default === undefined && !names.includes(c.name)
    );
    if (missing.length) {
      throw new DataError(
        `Insert into ${table.name} is missing required ${missing.map(c => c.name).join(', ')}.`
      );
    }
    names.push('created_by', 'updated_by');
    params.push(actorId, actorId);
    if (isScoped(state, table, actor)) {
      names.push('participant_id');
      params.push(actor.participantId);
    }
    try {
      const info = state.db
        .prepare(`INSERT INTO ${quote(table.name)} (${names.map(quote).join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
        .run(...params);
      return { op: 'insert', table: table.name, id: Number(info.lastInsertRowid) };
    } catch (error) {
      throw new DataError(constraintMessage(state, table, error));
    }
  }

  const joins = new Map();
  const params = [];
  const where = targetWhere(state, table, op, actor, joins, params);
  if (joins.size > 0) {
    throw new DataError(`${kind}: "where" on a write can't use relation paths; filter on this table's own columns.`);
  }
  const expect = op.expect === undefined ? (op.id !== undefined ? 1 : undefined) : op.expect;
  if (expect !== undefined && (!Number.isInteger(expect) || expect < 0)) {
    throw new DataError('"expect" is the number of rows that must change.');
  }
  let changes;
  try {
    if (kind === 'update') {
      if (!op.set || typeof op.set !== 'object' || Array.isArray(op.set) || Object.keys(op.set).length === 0) {
        throw new DataError(`Operation ${index}: update needs "set", an object of column: value.`);
      }
      const sets = [];
      const setParams = [];
      for (const [name, raw] of Object.entries(op.set)) {
        const column = columnFor(table, name);
        if (!column || column.system) throw column ? new DataError(`${table.name}.${name} is set by the database.`) : unknownColumn(table, name);
        const value = resolveRefs(raw, results, index);
        if (value && typeof value === 'object' && !Array.isArray(value) && column.type !== 'json') {
          const [[how, amount], ...more] = Object.entries(value);
          if (more.length || !['increment', 'decrement'].includes(how)) {
            throw new DataError(`${table.name}.${name}: set a value, or { "increment": n } / { "decrement": n }.`);
          }
          if (!NUMERIC_TYPES.has(column.type) || typeof amount !== 'number') {
            throw new DataError(`${how} needs a number column and a number.`);
          }
          sets.push(`${quote(name)} = ${quote(name)} ${how === 'increment' ? '+' : '-'} ?`);
          setParams.push(amount);
        } else {
          sets.push(`${quote(name)} = ?`);
          setParams.push(toStored(table, column, value));
        }
      }
      sets.push('updated_by = ?');
      setParams.push(actorId);
      changes = Number(
        state.db
          .prepare(`UPDATE ${quote(table.name)} AS t SET ${sets.join(', ')} WHERE ${where}`)
          .run(...setParams, ...params).changes
      );
    } else {
      const dependants = state.definition.tables.flatMap(other =>
        other.columns
          .filter(c => c.type === 'relation' && c.table === table.name && (c.onDelete || 'restrict') === 'restrict')
          .map(c => ({ other, c }))
      );
      const ids = state.db.prepare(`SELECT t.id FROM ${quote(table.name)} t WHERE ${where}`).all(...params).map(r => r.id);
      for (const { other, c } of dependants) {
        if (ids.length === 0) break;
        const n = state.db
          .prepare(`SELECT count(*) AS n FROM ${quote(other.name)} WHERE ${quote(c.name)} IN (${ids.map(() => '?').join(', ')})`)
          .get(...ids).n;
        if (n > 0) {
          throw new DataError(
            `Can't delete: ${n} row${n === 1 ? '' : 's'} in ${other.name} still point${n === 1 ? 's' : ''} at ${ids.length === 1 ? 'this row' : 'these rows'} (${other.name}.${c.name}).`
          );
        }
      }
      changes = Number(
        state.db.prepare(`DELETE FROM ${quote(table.name)} AS t WHERE ${where}`).run(...params).changes
      );
    }
  } catch (error) {
    if (error instanceof DataError) throw error;
    const message = constraintMessage(state, table, error);
    const current =
      kind === 'update' && op.id !== undefined && /can't go below/.test(message)
        ? state.db.prepare(`SELECT * FROM ${quote(table.name)} WHERE id = ?`).get(op.id)
        : undefined;
    throw new DataError(
      current
        ? `${message} Current values: ${Object.keys(op.set).filter(k => k in current).map(k => `${k} = ${JSON.stringify(current[k])}`).join(', ')}.`
        : message
    );
  }
  if (expect !== undefined && changes !== expect) {
    throw new DataError(
      `${kind} on ${table.name} changed ${changes} row${changes === 1 ? '' : 's'}, expected ${expect}; nothing was written.${explainGuard(state, table, op, actor)}`
    );
  }
  return { op: kind, table: table.name, changed: changes };
};

export const write = (state, rawArgs, actor) => {
  state.actor = actor;
  const operations = tidyArgs(rawArgs).operations;
  if (!Array.isArray(operations) || operations.length === 0 || operations.length > MAX_OPERATIONS) {
    throw new DataError(`"operations" is a list of 1 to ${MAX_OPERATIONS} insert, update or delete operations.`);
  }
  const results = [];
  state.db.exec('BEGIN');
  try {
    operations.forEach((op, index) => {
      try {
        results.push(runOperation(state, op, index, results, actor));
      } catch (error) {
        if (error instanceof DataError) {
          throw new DataError(`Operation ${index} (${op?.op} ${op?.table}): ${error.message}`);
        }
        throw error;
      }
    });
    state.db.exec('COMMIT');
  } catch (error) {
    state.db.exec('ROLLBACK');
    throw error;
  }
  return { ok: true, results };
};

// Whether a data-write call is held for confirmation under the runner's
// rules: it deletes, or sets a column to a value. Inserts, and relative
// changes such as the stock an order uses, are not; otherwise every order
// would ask.
const isRelative = value =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === 1 &&
  ('increment' in value || 'decrement' in value);

export const isSensitiveWrite = rawArgs => {
  const args = tidyArgs(rawArgs);
  return !Array.isArray(args?.operations) ||
  args.operations.some(
    op =>
      op?.op === 'delete' ||
      (op?.op === 'update' &&
        Object.values(op.set ?? {}).some(value => !isRelative(value))) ||
      (op?.op !== 'insert' && op?.op !== 'update')
  );
};

export const tableSummaries = (state, actor) => {
  state.actor = actor;
  return visibleTables(state).map(table => ({
    name: table.name,
    description: table.description,
    access: accessOf(state, table),
    scoped: actor?.mode !== 'owner' && Boolean(table.customerScoped),
    columns: table.columns.map(column => ({
      name: column.name,
      type: column.type,
      values: column.values,
      min: column.min,
      references: column.type === 'relation' ? column.table : undefined
    }))
  }));
};

export { ACCESS_RANK };
