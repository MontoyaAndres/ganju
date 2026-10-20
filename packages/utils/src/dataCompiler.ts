// Turns the structured query and write arguments into SQL with bound values.
// Identifiers are checked against the database's own schema and quoted;
// every value a caller sends is a parameter. Pure: the engine runs the SQL.
import { quoteIdentifier as q } from './dataIdentifiers';
import { NUMERIC_TYPES } from './dataDdl';
import { utf8ToBase64Url, base64UrlToUtf8 } from './base64';
import {
  DATA_ACCESS_RANK,
  DATA_MAX_IN_VALUES,
  DATA_MAX_PARAMS,
  DATA_MAX_VALUE_BYTES,
  DataError
} from './dataTypes';
import type {
  DataAccess,
  DataCaller,
  DataColumn,
  DataColumnType,
  DataSchema,
  DataTable
} from './dataTypes';

export type SqlValue = string | number | null;

export const FILTER_OPERATORS = [
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
] as const;

// A column a filter, sort or result can name: the owner's, or one of the
// three every table shows.
export type ResolvableColumn =
  | DataColumn
  | {
      name: string;
      type: DataColumnType;
      system: true;
      unique?: boolean;
      filterable?: boolean;
    };

const SYSTEM_COLUMN_TYPES: Record<string, DataColumnType> = {
  id: 'integer',
  created_at: 'datetime',
  updated_at: 'datetime'
};

export const isSystemColumn = (
  column: ResolvableColumn
): column is Extract<ResolvableColumn, { system: true }> =>
  'system' in column && column.system === true;

export const columnFor = (
  table: DataTable,
  name: string
): ResolvableColumn | undefined => {
  if (name in SYSTEM_COLUMN_TYPES) {
    return { name, type: SYSTEM_COLUMN_TYPES[name], system: true };
  }
  return table.columns.find(column => column.name === name);
};

export const unknownColumn = (table: DataTable, name: string) =>
  new DataError(
    `Unknown column "${name}" in ${table.name}. Columns: ${[
      'id',
      ...table.columns.map(c => c.name),
      'created_at',
      'updated_at'
    ].join(', ')}.`,
    'invalid'
  );

// Access

export const accessOf = (caller: DataCaller, table: DataTable): DataAccess =>
  caller.restricted ? table.access : 'full';

export const visibleTables = (schema: DataSchema, caller: DataCaller) =>
  schema.tables.filter(table => DATA_ACCESS_RANK[accessOf(caller, table)] >= 1);

// The table a call names, if the caller may `need` it. A table the caller
// can't see is reported as unknown, so a hidden table doesn't exist for it.
export const tableFor = (
  schema: DataSchema,
  caller: DataCaller,
  name: unknown,
  need: DataAccess = 'read'
): DataTable => {
  const table =
    typeof name === 'string'
      ? schema.tables.find(t => t.name === name)
      : undefined;
  if (!table || DATA_ACCESS_RANK[accessOf(caller, table)] < 1) {
    const names = visibleTables(schema, caller).map(t => t.name);
    throw new DataError(
      typeof name === 'string'
        ? `Unknown table "${name}". Tables: ${names.join(', ') || '(none)'}.`
        : `"table" is the name of a table. Tables: ${names.join(', ') || '(none)'}.`,
      'not_found'
    );
  }
  const access = accessOf(caller, table);
  if (DATA_ACCESS_RANK[access] < DATA_ACCESS_RANK[need]) {
    const allowed =
      access === 'read'
        ? 'read only'
        : access === 'add'
          ? 'read and add rows only'
          : access;
    throw new DataError(
      `Not allowed: the assistant's access to "${table.name}" is ${allowed}.`,
      'forbidden'
    );
  }
  return table;
};

export const isScoped = (caller: DataCaller, table: DataTable) =>
  Boolean(caller.restricted && table.customerScoped);

export const canRead = (caller: DataCaller, table: DataTable) =>
  DATA_ACCESS_RANK[accessOf(caller, table)] >= 1;

// The customer a scoped call is for. A restricted caller without one would
// otherwise share a single bucket with every other caller like it.
export const participantOf = (caller: DataCaller): string => {
  if (typeof caller.participantId !== 'string' || !caller.participantId) {
    throw new DataError(
      "This conversation has no customer, so customer-scoped tables can't be used.",
      'forbidden'
    );
  }
  return caller.participantId;
};

// A join and the values it binds, which come before the WHERE's in the
// statement.
export interface SqlJoin {
  sql: string;
  params: SqlValue[];
}

export const joinsSql = (joins: Map<string, SqlJoin>): string =>
  [...joins.values()].map(join => join.sql).join(' ');

export const joinsParams = (joins: Map<string, SqlJoin>): SqlValue[] =>
  [...joins.values()].flatMap(join => join.params);

// The related table as the caller may see it: a bot reaches only its own
// customer's rows of a scoped table, through a label, a filter or a sort just
// as through a query on that table.
export const relationJoin = (
  caller: DataCaller,
  target: DataTable,
  alias: string,
  on: string
): SqlJoin => {
  const scoped = isScoped(caller, target);
  // No customer: no row of a scoped table is theirs.
  if (scoped && !caller.participantId) {
    return { sql: `LEFT JOIN ${q(target.name)} ${alias} ON 0`, params: [] };
  }
  return {
    sql: `LEFT JOIN ${q(target.name)} ${alias} ON ${alias}.id = ${on}${
      scoped ? ` AND ${alias}.participant_id = ?` : ''
    }`,
    params: scoped ? [participantOf(caller)] : []
  };
};

// Values

export const isoSeconds = (date: Date) =>
  date.toISOString().replace(/\.\d{3}Z$/, 'Z');

const LOCAL_DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;

// "2026-10-21T15:00:00" with no offset, read as a wall-clock time in
// `timeZone` (UTC without one). `new Date()` would read it in the server's
// zone: UTC on Workers, the developer's own zone on a laptop.
const localDatetime = (value: string, timeZone?: string): Date | null => {
  const m = LOCAL_DATETIME.exec(value.trim());
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m
    .slice(1, 7)
    .map(part => Number(part ?? 0));
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(wall);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return new Date(NaN);
  }
  // The offset at the guess, then again at the result, so a time next to a
  // daylight-saving change lands on the right side of it.
  let at = wall - zoneOffsetMinutes(new Date(wall), timeZone) * 60_000;
  at = wall - zoneOffsetMinutes(new Date(at), timeZone) * 60_000;
  return new Date(at);
};

const normaliseDatetime = (
  value: unknown,
  label: string,
  timeZone?: string
): string => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new DataError(`${label}: expected an ISO 8601 date and time.`);
  }
  const date =
    (typeof value === 'string' ? localDatetime(value, timeZone) : null) ??
    new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new DataError(
      `${label}: "${value}" is not a date and time; use ISO 8601, e.g. 2026-10-19T09:00:00-05:00.`
    );
  }
  return isoSeconds(date);
};

const isRealDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};

const asNumber = (value: unknown): number | undefined => {
  const n =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

const checkSize = (label: string, value: string) => {
  if (value.length > DATA_MAX_VALUE_BYTES) {
    throw new DataError(
      `${label} is too long (over ${DATA_MAX_VALUE_BYTES.toLocaleString('en-US')} characters).`,
      'too_large'
    );
  }
  return value;
};

// Turns a value from a caller into what the column stores, or explains why
// it can't. `timeZone` is the project's, for datetimes sent without an
// offset.
export const toStored = (
  table: DataTable,
  column: ResolvableColumn,
  value: unknown,
  timeZone?: string
): SqlValue => {
  const label = `${table.name}.${column.name}`;
  if (value === null || value === undefined) {
    if (!isSystemColumn(column) && column.required) {
      throw new DataError(`${label} is required.`);
    }
    return null;
  }
  switch (column.type) {
    case 'integer':
    case 'relation': {
      const n =
        typeof value === 'string' && /^-?\d+$/.test(value.trim())
          ? Number(value)
          : value;
      if (typeof n !== 'number' || !Number.isSafeInteger(n)) {
        const target = isSystemColumn(column) ? null : column.table;
        throw new DataError(
          column.type === 'relation'
            ? `${label} takes the id (a whole number) of a row in ${target}.`
            : `${label} must be a whole number.`
        );
      }
      return n;
    }
    case 'decimal': {
      const n = asNumber(value);
      if (n === undefined) throw new DataError(`${label} must be a number.`);
      return n;
    }
    case 'boolean':
      if (value === true || value === 'true' || value === 1) return 1;
      if (value === false || value === 'false' || value === 0) return 0;
      throw new DataError(`${label} must be true or false.`);
    case 'date':
      if (
        typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !isRealDate(value)
      ) {
        throw new DataError(`${label} must be a date, YYYY-MM-DD.`);
      }
      return value;
    case 'datetime':
      return normaliseDatetime(value, label, timeZone);
    case 'enum': {
      const values = isSystemColumn(column) ? [] : (column.values ?? []);
      const match = values.find(
        v => v.toLowerCase() === String(value).toLowerCase()
      );
      if (!match) {
        throw new DataError(`${label} must be one of: ${values.join(', ')}.`);
      }
      return match;
    }
    case 'json':
      return checkSize(label, JSON.stringify(value));
    case 'email': {
      const text = typeof value === 'string' ? value.trim() : '';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) {
        throw new DataError(`${label} must be an email address.`);
      }
      return checkSize(label, text);
    }
    case 'url':
      if (typeof value !== 'string' || !/^https?:\/\/\S+$/i.test(value.trim())) {
        throw new DataError(`${label} must be a URL starting with http(s)://.`);
      }
      return checkSize(label, value.trim());
    case 'phone': {
      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new DataError(`${label} must be a phone number.`);
      }
      const phone = String(value).replace(/[^\d+]/g, '');
      if (!/^\+?\d{4,20}$/.test(phone)) {
        throw new DataError(`${label} must be a phone number.`);
      }
      return phone;
    }
    default:
      if (typeof value === 'object') {
        throw new DataError(`${label} must be text.`);
      }
      return checkSize(label, String(value));
  }
};

export const zoneOffsetMinutes = (date: Date, timeZone?: string): number => {
  if (!timeZone) return 0;
  const parts: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(date)) {
    parts[part.type] = part.value;
  }
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

// A stored UTC datetime in the caller's zone, with the offset. Given UTC,
// models told customers "8:00 p. m." for a 3 pm appointment.
export const zoned = (iso: string, timeZone?: string): string => {
  const date = new Date(iso);
  if (!timeZone || Number.isNaN(date.getTime())) return iso;
  const offset = zoneOffsetMinutes(date, timeZone);
  const local = new Date(date.getTime() + offset * 60_000)
    .toISOString()
    .slice(0, 19);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
};

export const fromStored = (
  column: ResolvableColumn,
  value: unknown,
  timeZone?: string
): unknown => {
  if (value === null || value === undefined) return null;
  if (column.type === 'datetime') return zoned(String(value), timeZone);
  if (column.type === 'boolean') return value === 1;
  if (column.type === 'json') {
    try {
      return JSON.parse(String(value));
    } catch {
      return value;
    }
  }
  return value;
};

// Filters

export interface ResolvedPath {
  sql: string;
  column: ResolvableColumn;
  table: DataTable;
  // A column of the queried table itself, not reached through a relation.
  own: boolean;
}

export interface CompileContext {
  schema: DataSchema;
  caller: DataCaller;
  table: DataTable;
  joins: Map<string, SqlJoin>;
  params: SqlValue[];
}

// "column" or "relation.column", adding the join a relation path needs.
export const resolvePath = (
  ctx: CompileContext,
  path: unknown
): ResolvedPath => {
  if (typeof path !== 'string') {
    throw new DataError('Column names are strings.');
  }
  const [head, tail, ...rest] = path.split('.');
  if (rest.length > 0) {
    throw new DataError(
      `"${path}": only one level of relation is supported (relation.column).`
    );
  }
  const column = columnFor(ctx.table, head);
  if (!column) throw unknownColumn(ctx.table, head);
  if (tail === undefined) {
    return { sql: `t.${q(head)}`, column, table: ctx.table, own: true };
  }
  if (isSystemColumn(column) || column.type !== 'relation' || !column.table) {
    throw new DataError(
      `"${head}" is not a relation, so "${path}" can't be used.`
    );
  }
  const target = tableFor(ctx.schema, ctx.caller, column.table);
  const targetColumn = columnFor(target, tail);
  if (!targetColumn) throw unknownColumn(target, tail);
  const alias = `j_${head}`;
  ctx.joins.set(alias, relationJoin(ctx.caller, target, alias, `t.${q(head)}`));
  return {
    sql: `${alias}.${q(tail)}`,
    column: targetColumn,
    table: target,
    own: false
  };
};

const filterValue = (
  resolved: ResolvedPath,
  value: unknown,
  timeZone?: string
): SqlValue => {
  const { column, table } = resolved;
  const label = `${table.name}.${column.name}`;
  if (column.type === 'datetime') {
    return normaliseDatetime(value, label, timeZone);
  }
  if (column.type === 'boolean' || column.type === 'enum') {
    if (column.type === 'enum') {
      const values = isSystemColumn(column) ? [] : (column.values ?? []);
      const match = values.find(
        v => v.toLowerCase() === String(value).toLowerCase()
      );
      if (!match) {
        throw new DataError(`${label} is one of: ${values.join(', ')}.`);
      }
      return match;
    }
    return toStored(table, column, value);
  }
  if (NUMERIC_TYPES.has(column.type) || column.type === 'relation') {
    const n = asNumber(value);
    if (n === undefined) {
      throw new DataError(`${label} compares with a number.`);
    }
    return n;
  }
  if (typeof value === 'object' && value !== null) {
    throw new DataError(
      `${label}: expected a value or an operator object.`
    );
  }
  if (typeof value === 'boolean') return String(value);
  return value as SqlValue;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// The conditions of a `where`, as SQL joined with AND by the caller.
// `indexed` collects the columns of the queried table an AND-ed condition
// filters on, which is what lets a large table be aggregated.
export const compileWhere = (
  ctx: CompileContext,
  where: unknown,
  indexed?: Set<string>
): string[] => {
  if (where === undefined || where === null) return [];
  if (!isPlainObject(where)) {
    throw new DataError(
      '"where" is an object: { column: value, column: { operator: value } }.'
    );
  }
  const clauses: string[] = [];
  for (const [key, condition] of Object.entries(where)) {
    if (key === 'or' || key === 'and') {
      if (!Array.isArray(condition) || condition.length === 0) {
        throw new DataError(`"${key}" takes a list of where objects.`);
      }
      const parts = condition.map(sub => {
        const inner = compileWhere(
          ctx,
          sub,
          key === 'and' ? indexed : undefined
        );
        // An empty entry would match every row: { "or": [{}] } is "1".
        if (inner.length === 0) {
          throw new DataError(
            `Each entry in "${key}" is a where object with at least one condition.`
          );
        }
        return `(${inner.join(' AND ')})`;
      });
      clauses.push(`(${parts.join(key === 'or' ? ' OR ' : ' AND ')})`);
      continue;
    }
    const resolved = resolvePath(ctx, key);
    // { "customer": { "name": "Ana" } } reads as "customer.name": models
    // write relation filters this way unprompted.
    if (
      resolved.column.type === 'relation' &&
      !key.includes('.') &&
      isPlainObject(condition) &&
      Object.keys(condition).some(
        k => !(FILTER_OPERATORS as readonly string[]).includes(k)
      )
    ) {
      clauses.push(
        ...compileWhere(
          ctx,
          Object.fromEntries(
            Object.entries(condition).map(([k, v]) => [`${key}.${k}`, v])
          )
        )
      );
      continue;
    }
    if (resolved.own && indexed) {
      const column = resolved.column;
      if (
        column.name === 'id' ||
        (!isSystemColumn(column) &&
          (column.unique ||
            column.filterable ||
            column.type === 'relation' ||
            column.type === 'file'))
      ) {
        indexed.add(column.name);
      }
    }
    if (!isPlainObject(condition) || resolved.column.type === 'json') {
      if (Array.isArray(condition)) {
        throw new DataError(
          `${key}: to match several values use { "in": [...] }.`
        );
      }
      if (condition === null) {
        clauses.push(`${resolved.sql} IS NULL`);
      } else {
        clauses.push(`${resolved.sql} = ?`);
        ctx.params.push(
          resolved.column.type === 'json'
            ? JSON.stringify(condition)
            : filterValue(resolved, condition, ctx.caller.timeZone)
        );
      }
      continue;
    }
    for (const [operator, value] of Object.entries(condition)) {
      if (!(FILTER_OPERATORS as readonly string[]).includes(operator)) {
        throw new DataError(
          `${key}: unknown operator "${operator}". Operators: ${FILTER_OPERATORS.join(', ')}.`
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
            clauses.push(
              `${resolved.sql} IS ${operator === 'ne' ? 'NOT ' : ''}NULL`
            );
            break;
          }
          const sign = {
            eq: '=',
            ne: '!=',
            gt: '>',
            gte: '>=',
            lt: '<',
            lte: '<='
          }[operator];
          // { "stock": { "lt": { "column": "reorder_level" } } }
          if (isPlainObject(value) && typeof value.column === 'string') {
            const other = resolvePath(ctx, value.column);
            clauses.push(`${resolved.sql} ${sign} ${other.sql}`);
            break;
          }
          clauses.push(`${resolved.sql} ${sign} ?`);
          ctx.params.push(filterValue(resolved, value, ctx.caller.timeZone));
          break;
        }
        case 'in':
        case 'notIn': {
          if (
            !Array.isArray(value) ||
            value.length === 0 ||
            value.length > DATA_MAX_IN_VALUES
          ) {
            throw new DataError(
              `${key}.${operator} takes a list of 1 to ${DATA_MAX_IN_VALUES} values.`
            );
          }
          clauses.push(
            `${resolved.sql} ${operator === 'notIn' ? 'NOT ' : ''}IN (${value
              .map(() => '?')
              .join(', ')})`
          );
          ctx.params.push(
            ...value.map(v => filterValue(resolved, v, ctx.caller.timeZone))
          );
          break;
        }
        case 'contains':
        case 'startsWith': {
          if (typeof value !== 'string') {
            throw new DataError(`${key}.${operator} takes text.`);
          }
          const escaped = value.replace(/[\\%_]/g, c => `\\${c}`);
          clauses.push(`${resolved.sql} LIKE ? ESCAPE '\\'`);
          ctx.params.push(
            operator === 'contains' ? `%${escaped}%` : `${escaped}%`
          );
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

export const assertParamCount = (params: readonly unknown[]) => {
  if (params.length > DATA_MAX_PARAMS) {
    throw new DataError(
      `This query uses ${params.length} values; the limit is ${DATA_MAX_PARAMS}. Use fewer "in" values or split it.`,
      'too_large'
    );
  }
};

// Search

// FTS5 query for the words in `text`: each word as a quoted prefix, so
// nothing the caller types is FTS syntax. All words, or any with `any`.
export const ftsMatch = (text: unknown, any: boolean): string => {
  const tokens = String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu);
  if (!tokens || tokens.length === 0) {
    throw new DataError('"search" needs at least one word.');
  }
  return tokens
    .slice(0, 10)
    .map(t => `"${t}"*`)
    .join(any ? ' OR ' : ' ');
};

// Cursors

export interface SortKey {
  sql: string;
  descending: boolean;
}

export interface KeysetCursor {
  // The table and sort the cursor was made for.
  k: string;
  // The last row's sort values, then its id.
  v: SqlValue[];
  // Search fallback in force: "any" word rather than all.
  m?: 'any';
}

export const encodeCursor = (cursor: KeysetCursor): string =>
  utf8ToBase64Url(JSON.stringify(cursor));

export const decodeCursor = (raw: unknown, signature: string): KeysetCursor => {
  try {
    const cursor = JSON.parse(base64UrlToUtf8(String(raw))) as KeysetCursor;
    if (
      !cursor ||
      cursor.k !== signature ||
      !Array.isArray(cursor.v) ||
      cursor.v.some(
        v => v !== null && typeof v !== 'string' && typeof v !== 'number'
      )
    ) {
      throw new Error('mismatch');
    }
    return cursor;
  } catch {
    throw new DataError(
      '"cursor" is not one this query returned; send the same table and sort with the cursor from the previous page.'
    );
  }
};

// Rows strictly after `values` in the order `keys`, as one condition. NULLs
// sort first ascending and last descending, as in SQLite. The last key is
// unique (the id), so no row is skipped or repeated across pages, even when
// rows share a sort value.
export const keysetCondition = (
  keys: readonly SortKey[],
  values: readonly SqlValue[],
  params: SqlValue[]
): string => {
  const branches: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    const parts: string[] = [];
    for (let j = 0; j < i; j++) {
      if (values[j] === null) {
        parts.push(`${keys[j].sql} IS NULL`);
      } else {
        parts.push(`${keys[j].sql} = ?`);
        params.push(values[j]);
      }
    }
    const { sql, descending } = keys[i];
    const value = values[i];
    if (!descending) {
      if (value === null) {
        parts.push(`${sql} IS NOT NULL`);
      } else {
        parts.push(`${sql} > ?`);
        params.push(value);
      }
    } else {
      if (value === null) continue;
      parts.push(`(${sql} < ? OR ${sql} IS NULL)`);
      params.push(value);
    }
    branches.push(`(${parts.join(' AND ')})`);
  }
  return branches.length ? `(${branches.join(' OR ')})` : '0';
};

// Inserts

// How many rows of `columnsPerRow` values fit in one statement.
export const rowsPerInsert = (columnsPerRow: number): number =>
  Math.max(1, Math.floor(DATA_MAX_PARAMS / Math.max(1, columnsPerRow)));

// Splits rows into groups that each bind at most 100 parameters.
export const chunkRows = <T>(rows: readonly T[], columnsPerRow: number): T[][] => {
  if (columnsPerRow > DATA_MAX_PARAMS) {
    throw new DataError(
      `A row with ${columnsPerRow} values can't be written in one statement.`,
      'too_large'
    );
  }
  const size = rowsPerInsert(columnsPerRow);
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
};

// Arguments

// Models sometimes quote keys twice ("\"stock\"") or send "where" as a JSON
// string; both are read as meant. Keys inside a value a row stores (a json
// column) are left alone: only column names and our own operators are ours
// to tidy.
const tidyKey = (key: string) => key.replace(/^[\s"'`]+|[\s"'`]+$/g, '');
const tidy = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(tidy);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [tidyKey(k), tidy(v)])
    );
  }
  return value;
};

const VALUE_OPERATORS = ['increment', 'decrement', '$ref'];

// A value in "values", "rows" or "set": { "\"decrement\"": 2 } is ours,
// anything else is what the column stores, as sent.
const tidyValue = (value: unknown): unknown => {
  if (!isPlainObject(value)) return value;
  const entries = Object.entries(value);
  if (entries.length !== 1) return value;
  const key = tidyKey(entries[0][0]);
  return VALUE_OPERATORS.includes(key) ? { [key]: entries[0][1] } : value;
};

const tidyColumns = (values: unknown): unknown =>
  isPlainObject(values)
    ? Object.fromEntries(
        Object.entries(values).map(([k, v]) => [tidyKey(k), tidyValue(v)])
      )
    : values;

const tidyOperation = (op: unknown): unknown => {
  if (!isPlainObject(op)) return op;
  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(op)) {
    const key = tidyKey(rawKey);
    out[key] =
      key === 'values' || key === 'set'
        ? tidyColumns(value)
        : key === 'rows' && Array.isArray(value)
          ? value.map(tidyColumns)
          : key === 'where'
            ? tidy(value)
            : value;
  }
  return out;
};

export const tidyArgs = (args: unknown): Record<string, unknown> => {
  if (!isPlainObject(args ?? {})) {
    throw new DataError('Arguments are an object.');
  }
  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(
    (args ?? {}) as Record<string, unknown>
  )) {
    out[tidyKey(rawKey)] = value;
  }
  for (const key of [
    'where',
    'aggregate',
    'groupBy',
    'sort',
    'include',
    'operations'
  ]) {
    if (typeof out[key] === 'string') {
      try {
        out[key] = JSON.parse(out[key] as string);
      } catch {
        // Left as is; the compiler explains the expected shape.
      }
    }
  }
  for (const [key, value] of Object.entries(out)) {
    if (key === 'operations') {
      out[key] = Array.isArray(value) ? value.map(tidyOperation) : value;
    } else if (key !== 'search' && key !== 'cursor') {
      out[key] = tidy(value);
    }
  }
  return out;
};

const singleId = (value: unknown): boolean => {
  const n = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n);
};

// Whether an update can touch one row at most: it names an `id`, or its
// "where" pins id to one value ({ "id": 1 }, { "id": { "eq": 1 } },
// { "id": { "in": [1] } }). Other keys sit beside it with AND, so they only
// narrow it further.
const targetsOneRow = (op: Record<string, unknown>): boolean => {
  if (typeof op.id === 'number') return true;
  if (!isPlainObject(op.where) || !('id' in op.where)) return false;
  const id = op.where.id;
  if (singleId(id)) return true;
  if (!isPlainObject(id)) return false;
  return (
    singleId(id.eq) ||
    (Array.isArray(id.in) && id.in.length === 1 && singleId(id.in[0]))
  );
};

const isRelativeChange = (value: unknown) =>
  isPlainObject(value) &&
  Object.keys(value).length === 1 &&
  ('increment' in value || 'decrement' in value);

// Whether a write is held for confirmation: it deletes, or sets a column to
// a value. Inserts are not, or every order would ask. A relative change (the
// stock an order uses) is not held when it reaches one row by id, or when the
// column has a minimum that stops it; otherwise "lower every price by
// 27,999" would run without asking. Without `schema`, only the id counts.
export const isSensitiveWrite = (
  rawArgs: unknown,
  schema?: DataSchema
): boolean => {
  const args = tidyArgs(rawArgs);
  const operations = args.operations;
  if (!Array.isArray(operations)) return true;
  return operations.some(op => {
    if (!isPlainObject(op)) return true;
    if (op.op === 'insert') return false;
    if (op.op !== 'update') return true;
    const oneRow = targetsOneRow(op);
    const table = schema?.tables.find(t => t.name === op.table);
    return Object.entries(isPlainObject(op.set) ? op.set : {}).some(
      ([name, value]) => {
        if (!isRelativeChange(value)) return true;
        if (oneRow) return false;
        const column = table?.columns.find(c => c.name === name);
        return column?.min === null || column?.min === undefined;
      }
    );
  });
};
