// Named queries: a SELECT the owner writes once, with named parameters, for
// reports the structured query can't express. Functions run them by name, and
// so may the assistant when the owner allows it; nobody sends SQL at run time.
//
// A Durable Object refuses `PRAGMA query_only`, so nothing in SQLite stops a
// statement from writing. The check when a query is saved is the whole guard,
// in two layers:
// - our tokenizer: one statement, starting with SELECT or WITH, naming none
//   of SQLite's or our own tables, with named parameters only. A Durable
//   Object's exec runs every statement in a string ("SELECT 1; DELETE FROM
//   orders" deletes), so the single statement is checked here, on tokens.
// - SQLite's own parser: the statement is compiled with EXPLAIN, never run,
//   and refused if its program opens anything for writing or reads a table
//   that isn't one of the owner's.
import {
  DATA_IDENTIFIER_PATTERN,
  quoteIdentifier as q
} from './dataIdentifiers';
import { isScoped, toStored } from './dataCompiler';
import type { SqlValue } from './dataCompiler';
import {
  DATA_LARGE_TABLE_ROWS,
  DATA_MAX_DESCRIPTION,
  DATA_MAX_PAGE,
  DATA_MAX_RESULT_BYTES,
  DATA_ACCESS_RANK,
  DataError
} from './dataTypes';
import type {
  DataCaller,
  DataColumn,
  DataSchema,
  DataTable
} from './dataTypes';
import type { SqlRow, SqlRunner } from './dataEngine';

export const DATA_QUERY_PARAM_TYPES = [
  'text',
  'integer',
  'decimal',
  'boolean',
  'date',
  'datetime'
] as const;
export type DataQueryParamType = (typeof DATA_QUERY_PARAM_TYPES)[number];

export interface DataQueryParam {
  name: string;
  type: DataQueryParamType;
  description?: string | null;
  // Required unless false; a missing optional parameter binds NULL.
  required?: boolean;
}

// A named query as the owner writes it: the dashboard's form, the API body
// and `ganju.data.json` all use this shape.
export interface DataQueryInput {
  name: string;
  description?: string | null;
  sql: string;
  params?: DataQueryParam[];
  // The assistant may run it from data-query. Off by default.
  assistant?: boolean;
}

export interface DataQuery {
  name: string;
  description: string | null;
  sql: string;
  params: DataQueryParam[];
  assistant: boolean;
  // The owner's tables it reads, found when it was saved.
  tables: string[];
  // EXPLAIN QUERY PLAN when it was saved: "SCAN orders" means it reads the
  // whole table.
  plan: string[];
  updatedAt: string;
  updatedBy: string | null;
}

export const DATA_MAX_QUERIES = 100;
export const DATA_MAX_QUERY_SQL = 10_000;
export const DATA_MAX_QUERY_PARAMS = 20;
export const DATA_DEFAULT_QUERY_ROWS = 100;

// Tokens

type TokenKind =
  | 'word'
  | 'quoted'
  | 'string'
  | 'number'
  | 'param'
  | 'positional'
  | 'semicolon'
  | 'other';

interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
}

const WORD_START = /[\p{L}_]/u;
const WORD_PART = /[\p{L}\p{N}_$]/u;

const unterminated = (what: string) =>
  new DataError(`The SQL has an unterminated ${what}.`);

// SQLite's lexical rules, as far as telling statements, names, literals and
// parameters apart needs: comments and whitespace are dropped, everything
// else becomes a token that keeps its place in the text.
const tokenize = (sql: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  const push = (kind: TokenKind, start: number, end: number) =>
    tokens.push({ kind, text: sql.slice(start, end), start, end });
  while (i < sql.length) {
    const ch = sql[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end + 1;
    } else if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) throw unterminated('comment');
      i = end + 2;
    } else if (ch === "'" || ch === '"' || ch === '`' || ch === '[') {
      const close = ch === '[' ? ']' : ch;
      let j = i + 1;
      for (;;) {
        if (j >= sql.length) {
          throw unterminated(ch === "'" ? 'string' : 'quoted name');
        }
        if (sql[j] === close) {
          // A doubled quote is the quote itself, except in [brackets].
          if (close !== ']' && sql[j + 1] === close) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      push(ch === "'" ? 'string' : 'quoted', i, j + 1);
      i = j + 1;
    } else if (ch === ':' || ch === '@' || ch === '$') {
      let j = i + 1;
      while (j < sql.length && WORD_PART.test(sql[j])) j++;
      if (j === i + 1) {
        push('other', i, j);
      } else {
        push('param', i, j);
      }
      i = j;
    } else if (ch === '?') {
      let j = i + 1;
      while (j < sql.length && /\d/.test(sql[j])) j++;
      push('positional', i, j);
      i = j;
    } else if (ch === ';') {
      push('semicolon', i, i + 1);
      i++;
    } else if (/\d/.test(ch) || (ch === '.' && /\d/.test(sql[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < sql.length && /[\w.]/.test(sql[j])) j++;
      push('number', i, j);
      i = j;
    } else if (WORD_START.test(ch)) {
      let j = i + 1;
      while (j < sql.length && WORD_PART.test(sql[j])) j++;
      push('word', i, j);
      i = j;
    } else {
      push('other', i, i + 1);
      i++;
    }
  }
  return tokens;
};

// A quoted name's text without its quotes, the way SQLite reads it.
const nameOf = (token: Token): string => {
  if (token.kind !== 'quoted') return token.text.toLowerCase();
  const inner = token.text.slice(1, -1);
  const quote = token.text[0];
  return (
    quote === '[' ? inner : inner.split(quote + quote).join(quote)
  ).toLowerCase();
};

const FORBIDDEN_WORDS = new Set(['pragma', 'attach', 'detach', 'vacuum']);

const reservedName = (name: string) =>
  name.startsWith('_ganju_') ||
  name.startsWith('sqlite_') ||
  name.startsWith('pragma_') ||
  name.includes('__');

export interface CompiledQuerySql {
  // The SQL as run: each `:name` replaced by `?N`, its position in `params`.
  sql: string;
  params: string[];
}

/**
 * Checks a named query's text and compiles its parameters to positions. Pure:
 * what only SQLite can tell (that it reads, and what) is checked when it is
 * saved, by checkQueryPlan.
 */
export const compileQuerySql = (sql: unknown): CompiledQuerySql => {
  if (typeof sql !== 'string' || !sql.trim()) {
    throw new DataError('"sql" is the SELECT to run.');
  }
  if (sql.length > DATA_MAX_QUERY_SQL) {
    throw new DataError(
      `A named query is up to ${DATA_MAX_QUERY_SQL.toLocaleString('en-US')} characters.`
    );
  }
  const tokens = tokenize(sql);
  // Trailing semicolons are harmless; any other ends the statement early, and
  // what follows would run as a second one.
  while (tokens.length && tokens[tokens.length - 1].kind === 'semicolon') {
    tokens.pop();
  }
  if (tokens.some(t => t.kind === 'semicolon')) {
    throw new DataError(
      'A named query is one statement: remove the ";" inside it.'
    );
  }
  const head = tokens[0];
  if (
    !head ||
    head.kind !== 'word' ||
    !['select', 'with'].includes(head.text.toLowerCase())
  ) {
    throw new DataError(
      'A named query starts with SELECT or WITH; it only reads.'
    );
  }
  const params: string[] = [];
  let out = '';
  let last = 0;
  for (const token of tokens) {
    if (token.kind === 'positional') {
      throw new DataError(
        'Use named parameters (:from, :to) instead of "?", so each one can be described.'
      );
    }
    if (
      token.kind === 'word' &&
      FORBIDDEN_WORDS.has(token.text.toLowerCase())
    ) {
      throw new DataError(
        `${token.text.toUpperCase()} isn't allowed in a named query.`
      );
    }
    if (
      (token.kind === 'word' || token.kind === 'quoted') &&
      reservedName(nameOf(token))
    ) {
      throw new DataError(
        `"${nameOf(token)}" isn't one of this database's tables or columns; named queries read the tables you defined.`
      );
    }
    if (token.kind === 'param') {
      const name = token.text.slice(1);
      if (!DATA_IDENTIFIER_PATTERN.test(name)) {
        throw new DataError(
          `Parameter ${token.text}: use lowercase letters, digits and _, starting with a letter.`
        );
      }
      let index = params.indexOf(name);
      if (index === -1) index = params.push(name) - 1;
      out += `${sql.slice(last, token.start)}?${index + 1}`;
      last = token.end;
    }
  }
  out += sql.slice(last, tokens.length ? tokens[tokens.length - 1].end : 0);
  if (params.length > DATA_MAX_QUERY_PARAMS) {
    throw new DataError(
      `A named query takes up to ${DATA_MAX_QUERY_PARAMS} parameters.`
    );
  }
  return { sql: out, params };
};

// What SQLite's program does

// Opcodes that only appear in a program that changes the database file. A
// SELECT's own scratch tables (ORDER BY, DISTINCT, IN lists) use ephemeral
// cursors and never these.
const WRITE_OPCODES = new Set([
  'OpenWrite',
  'Clear',
  'Destroy',
  'CreateBtree',
  'ParseSchema',
  'DropTable',
  'DropIndex',
  'DropTrigger',
  'VUpdate',
  'VCreate',
  'VDestroy',
  'SqlExec',
  'Vacuum',
  'IncrVacuum',
  'SetCookie',
  'JournalMode'
]);

// Virtual tables are opened with VOpen, not OpenRead, and the program names
// no module. What it does give is the virtual table's address, and the
// built-in ones (json_each, dbstat) keep one per connection: so json_each's
// and json_tree's are read off a query of their own, and any other is
// refused. dbstat, for one, lists every table with its size.
const ALLOWED_VIRTUAL_TABLES = [
  "SELECT 1 FROM json_each('[]')",
  "SELECT 1 FROM json_tree('[]')"
];

const virtualTablesOf = (program: SqlRow[]): unknown[] =>
  program.filter(step => String(step.opcode) === 'VOpen').map(step => step.p4);

// SQLite's own error, without the code and offset it appends.
const sqliteMessage = (error: unknown) =>
  (error instanceof Error ? error.message : String(error))
    .replace(/\s*at offset \d+/, '')
    .replace(/:\s*SQLITE_\w+$/, '')
    .trim();

const placeholders = (count: number): SqlValue[] => Array(count).fill(null);

export interface QueryPlanCheck {
  tables: string[];
  plan: string[];
}

/**
 * Compiles the statement with EXPLAIN (nothing runs) and checks its program:
 * it may not open anything for writing or start a write transaction, and every
 * table it reads must be one of `schema`'s. Returns those tables and the plan.
 */
export const checkQueryPlan = (
  runner: SqlRunner,
  schema: DataSchema,
  compiled: CompiledQuerySql
): QueryPlanCheck => {
  let program: SqlRow[];
  try {
    program = runner.all(
      `EXPLAIN ${compiled.sql}`,
      placeholders(compiled.params.length)
    );
  } catch (error) {
    throw new DataError(`The SQL doesn't compile: ${sqliteMessage(error)}.`);
  }
  const roots = new Map<number, string>();
  for (const row of runner.all(
    "SELECT rootpage, tbl_name FROM sqlite_schema WHERE type IN ('table', 'index')"
  )) {
    roots.set(Number(row.rootpage), String(row.tbl_name));
  }
  const owned = new Set(schema.tables.map(t => t.name));
  const opened = virtualTablesOf(program);
  if (opened.length > 0) {
    const allowed = new Set(
      ALLOWED_VIRTUAL_TABLES.flatMap(sql =>
        virtualTablesOf(runner.all(`EXPLAIN ${sql}`))
      )
    );
    if (opened.some(vtab => typeof vtab !== 'string' || !allowed.has(vtab))) {
      throw new DataError(
        "A named query reads only this database's tables, with json_each and json_tree for JSON; not other virtual tables such as dbstat."
      );
    }
  }
  const tables = new Set<string>();
  for (const step of program) {
    const opcode = String(step.opcode);
    if (
      WRITE_OPCODES.has(opcode) ||
      (opcode === 'Transaction' && Number(step.p2) !== 0)
    ) {
      throw new DataError(
        'A named query only reads: this one would change the database.'
      );
    }
    if (opcode === 'OpenRead') {
      const table = roots.get(Number(step.p2));
      if (!table || !owned.has(table)) {
        throw new DataError(
          `A named query reads only this database's tables${table ? `, not "${table}"` : ''}.`
        );
      }
      tables.add(table);
    }
  }
  const plan = runner
    .all(
      `EXPLAIN QUERY PLAN ${compiled.sql}`,
      placeholders(compiled.params.length)
    )
    .map(row => String(row.detail));
  return { tables: [...tables].sort(), plan };
};

// Storage

interface StoredQueryRow {
  name: string;
  description: string | null;
  sql: string;
  params: string;
  assistant: number;
  tables: string;
  plan: string;
  updated_at: string;
  updated_by: string | null;
}

const parseList = <T>(raw: unknown): T[] => {
  try {
    const value = JSON.parse(String(raw));
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
};

const fromRow = (row: SqlRow): DataQuery => {
  const stored = row as unknown as StoredQueryRow;
  return {
    name: stored.name,
    description: stored.description,
    sql: stored.sql,
    params: parseList<DataQueryParam>(stored.params),
    assistant: Boolean(stored.assistant),
    tables: parseList<string>(stored.tables),
    plan: parseList<string>(stored.plan),
    updatedAt: stored.updated_at,
    updatedBy: stored.updated_by
  };
};

export const listQueries = (runner: SqlRunner): DataQuery[] =>
  runner.all('SELECT * FROM _ganju_queries ORDER BY name').map(fromRow);

const findQuery = (runner: SqlRunner, name: unknown): DataQuery => {
  const row =
    typeof name === 'string'
      ? runner.all('SELECT * FROM _ganju_queries WHERE name = ?', [name])[0]
      : undefined;
  if (!row) {
    const names = listQueries(runner).map(query => query.name);
    throw new DataError(
      `There is no named query "${String(name)}". Named queries: ${names.join(', ') || '(none)'}.`,
      'not_found'
    );
  }
  return fromRow(row);
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normaliseParams = (raw: unknown, used: string[]): DataQueryParam[] => {
  const list = raw === undefined || raw === null ? [] : raw;
  if (!Array.isArray(list)) {
    throw new DataError('"params" is a list of { name, type, description }.');
  }
  const params = list.map((entry, i): DataQueryParam => {
    if (!isPlainObject(entry) || typeof entry.name !== 'string') {
      throw new DataError(`params[${i}] needs a name.`);
    }
    if (!DATA_QUERY_PARAM_TYPES.includes(entry.type as DataQueryParamType)) {
      throw new DataError(
        `Parameter ${entry.name}: "type" is one of ${DATA_QUERY_PARAM_TYPES.join(', ')}.`
      );
    }
    const description =
      typeof entry.description === 'string' && entry.description.trim()
        ? entry.description.trim().slice(0, DATA_MAX_DESCRIPTION)
        : null;
    return {
      name: entry.name,
      type: entry.type as DataQueryParamType,
      ...(description ? { description } : {}),
      ...(entry.required === false ? { required: false } : {})
    };
  });
  const declared = params.map(p => p.name);
  const undeclared = used.filter(name => !declared.includes(name));
  if (undeclared.length) {
    throw new DataError(
      `Declare the type of ${undeclared.map(n => `:${n}`).join(', ')} in "params".`
    );
  }
  const unused = declared.filter(name => !used.includes(name));
  if (unused.length) {
    throw new DataError(
      `The SQL doesn't use ${unused.map(n => `:${n}`).join(', ')}.`
    );
  }
  return used.map(name => params.find(p => p.name === name)!);
};

/**
 * Saves a named query, replacing one by the same name. Refused unless it
 * passes both checks; the tables it reads and its plan are kept with it.
 */
export const saveQuery = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller,
  input: unknown
): DataQuery => {
  if (!isPlainObject(input)) throw new DataError('A named query is an object.');
  const name = input.name;
  if (typeof name !== 'string' || !DATA_IDENTIFIER_PATTERN.test(name)) {
    throw new DataError(
      'A named query needs a name: lowercase letters, digits and _, starting with a letter.'
    );
  }
  const compiled = compileQuerySql(input.sql);
  const params = normaliseParams(input.params, compiled.params);
  const { tables, plan } = checkQueryPlan(runner, schema, compiled);
  const description =
    typeof input.description === 'string' && input.description.trim()
      ? input.description.trim().slice(0, DATA_MAX_DESCRIPTION)
      : null;
  const exists =
    runner.all('SELECT 1 FROM _ganju_queries WHERE name = ?', [name]).length >
    0;
  if (!exists) {
    const count = Number(
      runner.all('SELECT count(*) AS n FROM _ganju_queries')[0]?.n ?? 0
    );
    if (count >= DATA_MAX_QUERIES) {
      throw new DataError(
        `A database holds up to ${DATA_MAX_QUERIES} named queries.`
      );
    }
  }
  runner.all(
    `INSERT INTO _ganju_queries (name, description, sql, params, assistant, tables, plan, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?)
     ON CONFLICT(name) DO UPDATE SET description = excluded.description, sql = excluded.sql,
       params = excluded.params, assistant = excluded.assistant, tables = excluded.tables,
       plan = excluded.plan, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    [
      name,
      description,
      (input.sql as string).trim(),
      JSON.stringify(params),
      input.assistant === true ? 1 : 0,
      JSON.stringify(tables),
      JSON.stringify(plan),
      caller.actor
    ]
  );
  return findQuery(runner, name);
};

export const dropQuery = (
  runner: SqlRunner,
  name: unknown
): { dropped: string } => {
  const query = findQuery(runner, name);
  runner.all('DELETE FROM _ganju_queries WHERE name = ?', [query.name]);
  return { dropped: query.name };
};

// The queries a caller may run: all of them, or for a channel bot those the
// owner let the assistant run that read only tables it may read, none of
// them scoped to a customer. A named query's SQL can't be scoped, so it could
// read every customer's rows.
const mayRun = (schema: DataSchema, caller: DataCaller, query: DataQuery) => {
  if (
    caller.tables &&
    !query.tables.every(name => caller.tables?.includes(name))
  ) {
    return false;
  }
  if (!caller.restricted) return true;
  if (!query.assistant) return false;
  return query.tables.every(name => {
    const table = schema.tables.find(t => t.name === name);
    return Boolean(
      table && DATA_ACCESS_RANK[table.access] >= 1 && !isScoped(caller, table)
    );
  });
};

export const queriesFor = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller
): DataQuery[] =>
  listQueries(runner).filter(query => mayRun(schema, caller, query));

// A parameter's value as the column of its type would store it.
const bindParam = (
  param: DataQueryParam,
  value: unknown,
  timeZone?: string
): SqlValue => {
  const column = {
    name: param.name,
    type: param.type,
    required: param.required !== false
  } as DataColumn;
  try {
    return toStored({ name: 'params' } as DataTable, column, value, timeZone);
  } catch (error) {
    if (error instanceof DataError) {
      throw new DataError(error.message.replace(/^params\./, 'Parameter '));
    }
    throw error;
  }
};

/**
 * Runs a named query with `params`, up to `limit` rows (100 by default, 500 at
 * most) and 1 MB. A query that would scan a table over 200,000 rows is refused
 * before it runs: the database serves one request at a time.
 */
export const runQuery = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller,
  args: unknown
) => {
  if (!isPlainObject(args)) throw new DataError('Arguments are an object.');
  const query = findQuery(runner, args.name ?? args.query);
  if (!mayRun(schema, caller, query)) {
    throw new DataError(
      `There is no named query "${query.name}" the assistant may run.`,
      'not_found'
    );
  }
  const given =
    args.params === undefined || args.params === null ? {} : args.params;
  if (!isPlainObject(given)) {
    throw new DataError(
      '"params" is an object, e.g. { "from": "2026-10-01" }.'
    );
  }
  const unknown = Object.keys(given).filter(
    key => !query.params.some(p => p.name === key)
  );
  if (unknown.length) {
    throw new DataError(
      `${query.name} takes ${query.params.map(p => p.name).join(', ') || 'no parameters'}; not ${unknown.join(', ')}.`
    );
  }
  const limit =
    args.limit === undefined || args.limit === null
      ? DATA_DEFAULT_QUERY_ROWS
      : args.limit;
  if (
    typeof limit !== 'number' ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > DATA_MAX_PAGE
  ) {
    throw new DataError(`"limit" is 1 to ${DATA_MAX_PAGE}.`);
  }
  const values = query.params.map(param =>
    bindParam(param, given[param.name], caller.timeZone)
  );
  const compiled = compileQuerySql(query.sql);

  // A full scan shows in the plan as "SCAN x", with or without "USING
  // (COVERING) INDEX": either way it reads every row, and on a large table
  // that is the request everyone else waits behind.
  const scans = query.plan.some(line => {
    const detail = line.trim();
    return (
      detail.startsWith('SCAN ') &&
      !detail.startsWith('SCAN CONSTANT ROW') &&
      !detail.includes('VIRTUAL TABLE')
    );
  });
  if (scans) {
    for (const name of query.tables) {
      const n = Number(
        runner.all(`SELECT max(id) AS n FROM ${q(name)}`)[0]?.n ?? 0
      );
      if (n > DATA_LARGE_TABLE_ROWS) {
        throw new DataError(
          `${query.name} reads all of ${name}, which has about ${n.toLocaleString('en-US')} rows; filter on an indexed column (id, or a column marked filterable, unique or a relation).`,
          'too_large'
        );
      }
    }
  }

  const rows: SqlRow[] = [];
  let bytes = 0;
  let truncated = false;
  try {
    for (const row of runner.iterate(compiled.sql, values)) {
      if (rows.length === limit) {
        truncated = true;
        break;
      }
      const size = JSON.stringify(row).length;
      if (rows.length > 0 && bytes + size > DATA_MAX_RESULT_BYTES) {
        truncated = true;
        break;
      }
      bytes += size;
      rows.push({ ...row });
    }
  } catch (error) {
    throw new DataError(`${query.name} failed: ${sqliteMessage(error)}.`);
  }
  return {
    query: query.name,
    rows,
    ...(truncated
      ? {
          truncated: `stopped at ${rows.length} rows; narrow the parameters or ask the owner for a query that returns fewer`
        }
      : {})
  };
};

/**
 * A query not saved yet, run as if it were: saved and run in a transaction
 * that is then rolled back, so it is checked exactly as saving checks it and
 * nothing stays.
 */
export const runDraftQuery = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller,
  args: { query: unknown; params?: unknown; limit?: unknown }
) => {
  const ran: { result?: ReturnType<typeof runQuery> } = {};
  const rollBack = new Error('draft query');
  try {
    runner.transaction(() => {
      const saved = saveQuery(runner, schema, caller, args.query);
      ran.result = runQuery(runner, schema, caller, {
        name: saved.name,
        params: args.params,
        limit: args.limit
      });
      throw rollBack;
    });
  } catch (error) {
    if (error !== rollBack) throw error;
  }
  return ran.result as ReturnType<typeof runQuery>;
};
