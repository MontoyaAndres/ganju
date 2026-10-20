// What a project's database does, written against a tiny SQL runner so the
// same code runs inside the Durable Object (apps/data) and on node:sqlite in
// the tests and the tool-design eval. The runner executes; everything about
// which SQL is allowed and how results look is decided here.
import { identifierIssue, quoteIdentifier as q } from './dataIdentifiers';
import {
  DATA_NOW_SQL,
  NUMERIC_TYPES,
  SEARCHABLE_TYPES,
  UNIQUE_TYPES,
  columnDefinitionSql,
  conversionSql,
  createTableSql,
  desiredIndexes,
  desiredTriggers,
  ftsCreateSql,
  ftsTableName,
  invalidAfterConversionSql,
  isIndexedColumn,
  searchableColumns,
  triggerPrefix
} from './dataDdl';
import {
  accessOf,
  assertParamCount,
  canRead,
  chunkRows,
  columnFor,
  compileWhere,
  decodeCursor,
  encodeCursor,
  fromStored,
  ftsMatch,
  isScoped,
  isSystemColumn,
  joinsParams,
  joinsSql,
  keysetCondition,
  participantOf,
  relationJoin,
  resolvePath,
  tableFor,
  tidyArgs,
  toStored,
  unknownColumn,
  visibleTables,
  zoned
} from './dataCompiler';
import type { CompileContext, SortKey, SqlJoin, SqlValue } from './dataCompiler';
import {
  DATA_ACCESS_LEVELS,
  DATA_COLUMN_TYPES,
  DATA_DEFAULT_PAGE,
  DATA_HISTORY_DAYS,
  DATA_LARGE_TABLE_ROWS,
  DATA_MAX_AGGREGATES,
  DATA_MAX_COLUMNS,
  DATA_MAX_DESCRIPTION,
  DATA_MAX_ENUM_VALUES,
  DATA_MAX_GROUPS,
  DATA_MAX_GROUP_BY,
  DATA_MAX_INSERT_ROWS,
  DATA_MAX_LABEL,
  DATA_MAX_PARAMS,
  DATA_MAX_PAGE,
  DATA_MAX_RESULT_BYTES,
  DATA_MAX_ROWS_PER_WRITE,
  DATA_MAX_SORT_KEYS,
  DATA_MAX_TABLES,
  DATA_MAX_WRITE_OPERATIONS,
  DATA_ON_DELETE,
  DATA_REBUILD_MAX_ROWS,
  DataError
} from './dataTypes';
import type {
  DataAccess,
  DataCaller,
  DataColumn,
  DataColumnInput,
  DataColumnType,
  DataDefaultValue,
  DataOnDelete,
  DataSchema,
  DataTable,
  DataTableInput
} from './dataTypes';

export type SqlRow = Record<string, SqlValue>;

export interface SqlRunner {
  all(sql: string, params?: readonly SqlValue[]): SqlRow[];
  // Rows one at a time, for reads that stop at a size: a page of large rows
  // must not be loaded whole before the 1 MB cap applies.
  iterate(sql: string, params?: readonly SqlValue[]): Iterable<SqlRow>;
  transaction<T>(fn: () => T): T;
  databaseSize(): number;
}

const first = (runner: SqlRunner, sql: string, params?: readonly SqlValue[]) =>
  runner.all(sql, params)[0];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Internal tables

// Our own tables inside every database. Each entry is one version; the
// object runs the ones it hasn't on first use after a deploy, so they must
// be additive and fast.
export const INTERNAL_MIGRATIONS: readonly (readonly string[])[] = [
  [
    'CREATE TABLE IF NOT EXISTS _ganju_meta (key TEXT PRIMARY KEY, value TEXT) WITHOUT ROWID',
    `CREATE TABLE _ganju_tables (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      label TEXT,
      description TEXT,
      display_column_id INTEGER,
      access TEXT NOT NULL DEFAULT 'read',
      customer_scoped INTEGER NOT NULL DEFAULT 0,
      history INTEGER NOT NULL DEFAULT 1,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (${DATA_NOW_SQL}),
      updated_at TEXT NOT NULL DEFAULT (${DATA_NOW_SQL})
    )`,
    `CREATE TABLE _ganju_columns (
      id INTEGER PRIMARY KEY,
      table_id INTEGER NOT NULL REFERENCES _ganju_tables(id),
      name TEXT NOT NULL,
      label TEXT,
      description TEXT,
      type TEXT NOT NULL,
      required INTEGER NOT NULL DEFAULT 0,
      is_unique INTEGER NOT NULL DEFAULT 0,
      filterable INTEGER NOT NULL DEFAULT 0,
      searchable INTEGER NOT NULL DEFAULT 0,
      personal INTEGER NOT NULL DEFAULT 0,
      enum_values TEXT,
      relation_table_id INTEGER REFERENCES _ganju_tables(id),
      on_delete TEXT,
      min REAL,
      default_value TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (${DATA_NOW_SQL}),
      updated_at TEXT NOT NULL DEFAULT (${DATA_NOW_SQL}),
      UNIQUE (table_id, name)
    )`,
    `CREATE TABLE _ganju_row_log (
      id INTEGER PRIMARY KEY,
      table_id INTEGER NOT NULL,
      row_id INTEGER NOT NULL,
      op TEXT NOT NULL,
      actor TEXT,
      at TEXT NOT NULL,
      changes TEXT NOT NULL
    )`,
    'CREATE INDEX _ganju_row_log_row ON _ganju_row_log(table_id, row_id)',
    'CREATE TABLE _ganju_context (id INTEGER PRIMARY KEY CHECK (id = 1), actor TEXT)'
  ]
];

export const INTERNAL_SCHEMA_VERSION = INTERNAL_MIGRATIONS.length;

export const hasInternalTables = (runner: SqlRunner): boolean =>
  runner.all(
    "SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = '_ganju_meta'"
  ).length > 0;

export const getMeta = (runner: SqlRunner, key: string): string | null => {
  const row = first(runner, 'SELECT value FROM _ganju_meta WHERE key = ?', [
    key
  ]);
  return row ? (row.value as string | null) : null;
};

export const setMeta = (
  runner: SqlRunner,
  key: string,
  value: string | null
): void => {
  if (value === null) {
    runner.all('DELETE FROM _ganju_meta WHERE key = ?', [key]);
    return;
  }
  runner.all(
    'INSERT INTO _ganju_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
};

// Brings our own tables up to date. Returns the version now in force.
export const migrateInternal = (runner: SqlRunner): number =>
  runner.transaction(() => {
    const current = hasInternalTables(runner)
      ? Number(getMeta(runner, 'schema_version') ?? 0)
      : 0;
    for (let v = current; v < INTERNAL_MIGRATIONS.length; v++) {
      for (const statement of INTERNAL_MIGRATIONS[v]) runner.all(statement);
    }
    if (current < INTERNAL_MIGRATIONS.length) {
      setMeta(runner, 'schema_version', String(INTERNAL_MIGRATIONS.length));
    }
    return INTERNAL_MIGRATIONS.length;
  });

// Schema

const parseJson = <T>(value: SqlValue): T | null => {
  if (value === null) return null;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return null;
  }
};

export const loadSchema = (runner: SqlRunner): DataSchema => {
  const tables = runner.all(
    'SELECT t.*, d.name AS display_column FROM _ganju_tables t LEFT JOIN _ganju_columns d ON d.id = t.display_column_id ORDER BY t.position, t.id'
  );
  const columns = runner.all(
    'SELECT c.*, r.name AS relation_table FROM _ganju_columns c LEFT JOIN _ganju_tables r ON r.id = c.relation_table_id ORDER BY c.table_id, c.position, c.id'
  );
  return {
    tables: tables.map(row => ({
      id: Number(row.id),
      name: String(row.name),
      label: (row.label as string | null) ?? null,
      description: (row.description as string | null) ?? null,
      displayColumn: (row.display_column as string | null) ?? null,
      access: (row.access as DataAccess) ?? 'read',
      customerScoped: row.customer_scoped === 1,
      history: row.history === 1,
      position: Number(row.position),
      columns: columns
        .filter(c => c.table_id === row.id)
        .map(c => {
          const stored = parseJson<{ v: DataDefaultValue }>(c.default_value);
          return {
            id: Number(c.id),
            name: String(c.name),
            type: c.type as DataColumnType,
            label: (c.label as string | null) ?? null,
            description: (c.description as string | null) ?? null,
            required: c.required === 1,
            unique: c.is_unique === 1,
            filterable: c.filterable === 1,
            searchable: c.searchable === 1,
            personal: c.personal === 1,
            values: parseJson<string[]>(c.enum_values),
            table: (c.relation_table as string | null) ?? null,
            onDelete: (c.on_delete as DataOnDelete | null) ?? null,
            min: c.min === null ? null : Number(c.min),
            default: stored ? stored.v : undefined,
            position: Number(c.position)
          };
        })
    }))
  };
};

// The table as the owner would write it again: what `ganju.data.json` and an
// export's schema.json hold.
export const toTableInput = (table: DataTable): DataTableInput => ({
  name: table.name,
  label: table.label,
  description: table.description,
  displayColumn: table.displayColumn,
  access: table.access,
  customerScoped: table.customerScoped,
  history: table.history,
  columns: table.columns.map(column => {
    const out: DataColumnInput = { name: column.name, type: column.type };
    if (column.label) out.label = column.label;
    if (column.description) out.description = column.description;
    if (column.required) out.required = true;
    if (column.unique) out.unique = true;
    if (column.filterable) out.filterable = true;
    if (column.searchable) out.searchable = true;
    if (column.personal) out.personal = true;
    if (column.values) out.values = column.values;
    if (column.table) out.table = column.table;
    if (column.onDelete) out.onDelete = column.onDelete;
    if (column.min !== null) out.min = column.min;
    if (column.default !== undefined) out.default = column.default;
    return out;
  })
});

const tableNamed = (schema: DataSchema, name: unknown): DataTable => {
  const table = schema.tables.find(t => t.name === name);
  if (!table) {
    throw new DataError(
      `Unknown table "${String(name)}". Tables: ${schema.tables.map(t => t.name).join(', ') || '(none)'}.`,
      'not_found'
    );
  }
  return table;
};

const columnNamed = (table: DataTable, name: unknown): DataColumn => {
  const column = table.columns.find(c => c.name === name);
  if (!column) throw unknownColumn(table, String(name));
  return column;
};

// Validation of definitions

const cleanText = (
  value: unknown,
  max: number,
  label: string
): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new DataError(`${label} is text.`);
  const text = value.trim();
  if (text.length > max) {
    throw new DataError(`${label} is up to ${max} characters.`);
  }
  return text || null;
};

const flag = (value: unknown, label: string): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value !== 'boolean') {
    throw new DataError(`${label} is true or false.`);
  }
  return value;
};

type ColumnDraft = Omit<DataColumn, 'id' | 'position'>;

// Checks one column definition against the schema it will join. `selfTable`
// is the table the column belongs to, so a relation can point at it.
export const normaliseColumn = (
  input: unknown,
  schema: DataSchema,
  selfTable: string
): ColumnDraft => {
  if (!isPlainObject(input)) {
    throw new DataError('A column is an object: { "name", "type", ... }.');
  }
  const name = input.name;
  const nameIssue = identifierIssue(name, 'column');
  if (nameIssue) throw new DataError(nameIssue);
  const label = `${selfTable}.${name as string}`;
  const type = input.type;
  if (!(DATA_COLUMN_TYPES as readonly unknown[]).includes(type)) {
    throw new DataError(
      `${label}: "type" is one of ${DATA_COLUMN_TYPES.join(', ')}.`
    );
  }
  const column: ColumnDraft = {
    name: name as string,
    type: type as DataColumnType,
    label: cleanText(input.label, DATA_MAX_LABEL, `${label} label`),
    description: cleanText(
      input.description,
      DATA_MAX_DESCRIPTION,
      `${label} description`
    ),
    required: flag(input.required, `${label} required`),
    unique: flag(input.unique, `${label} unique`),
    filterable: flag(input.filterable, `${label} filterable`),
    searchable: flag(input.searchable, `${label} searchable`),
    personal: flag(input.personal, `${label} personal`),
    values: null,
    table: null,
    onDelete: null,
    min: null,
    default: undefined
  };

  if (column.type === 'enum') {
    const values = input.values;
    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      values.length > DATA_MAX_ENUM_VALUES
    ) {
      throw new DataError(
        `${label}: an enum lists 1 to ${DATA_MAX_ENUM_VALUES} "values".`
      );
    }
    const seen = new Set<string>();
    column.values = values.map(value => {
      if (typeof value !== 'string' || !value.trim() || value.length > 100) {
        throw new DataError(`${label}: each value is text, 1 to 100 characters.`);
      }
      const key = value.trim().toLowerCase();
      if (seen.has(key)) throw new DataError(`${label}: "${value}" is listed twice.`);
      seen.add(key);
      return value.trim();
    });
  } else if (input.values !== undefined && input.values !== null) {
    throw new DataError(`${label}: only enum columns take "values".`);
  }

  if (column.type === 'relation') {
    const target = input.table;
    if (
      typeof target !== 'string' ||
      (target !== selfTable && !schema.tables.some(t => t.name === target))
    ) {
      throw new DataError(
        `${label}: a relation names the table it points at in "table". Tables: ${schema.tables.map(t => t.name).join(', ') || '(none)'}.`
      );
    }
    const onDelete = input.onDelete ?? 'restrict';
    if (!(DATA_ON_DELETE as readonly unknown[]).includes(onDelete)) {
      throw new DataError(
        `${label}: "onDelete" is one of ${DATA_ON_DELETE.join(', ')}.`
      );
    }
    if (onDelete === 'set_null' && column.required) {
      throw new DataError(
        `${label} is required, so deleting the row it points at can't clear it; use restrict or cascade.`
      );
    }
    column.table = target;
    column.onDelete = onDelete as DataOnDelete;
  } else if (input.table !== undefined && input.table !== null) {
    throw new DataError(`${label}: only relation columns take "table".`);
  }

  if (input.min !== undefined && input.min !== null) {
    if (!NUMERIC_TYPES.has(column.type)) {
      throw new DataError(`${label}: only integer and decimal columns take "min".`);
    }
    if (typeof input.min !== 'number' || !Number.isFinite(input.min)) {
      throw new DataError(`${label}: "min" is a number.`);
    }
    column.min = input.min;
  }

  if (column.unique && !UNIQUE_TYPES.has(column.type)) {
    throw new DataError(`${label}: a ${column.type} column can't be unique.`);
  }
  if (column.searchable && !SEARCHABLE_TYPES.has(column.type)) {
    throw new DataError(
      `${label}: only text columns can be searchable (text, long_text, email, url, phone, enum).`
    );
  }
  // The search table has a column of its own called rank.
  if (column.searchable && column.name === 'rank') {
    throw new DataError(
      `${label}: a column named "rank" can't be searchable; rename it (e.g. "ranking").`
    );
  }
  if (column.filterable && (column.type === 'json' || column.type === 'long_text')) {
    throw new DataError(
      `${label}: a ${column.type} column can't be filterable; mark it searchable instead.`
    );
  }

  if (input.default !== undefined && input.default !== null) {
    if (column.type === 'relation' || column.type === 'file') {
      throw new DataError(`${label}: a ${column.type} column can't have a default.`);
    }
    if (column.unique) {
      throw new DataError(`${label}: a unique column can't have a default.`);
    }
    const fake: DataTable = {
      id: 0,
      name: selfTable,
      label: null,
      description: null,
      displayColumn: null,
      access: 'read',
      customerScoped: false,
      history: false,
      position: 0,
      columns: []
    };
    const stored = toStored(fake, { ...column, id: 0, position: 0 }, input.default);
    if (column.min !== null && typeof stored === 'number' && stored < column.min) {
      throw new DataError(`${label}: the default is below the minimum, ${column.min}.`);
    }
    column.default =
      column.type === 'boolean'
        ? stored === 1
        : column.type === 'json'
          ? (input.default as DataDefaultValue)
          : (stored as DataDefaultValue);
  }
  return column;
};

const normaliseAccess = (value: unknown, fallback: DataAccess): DataAccess => {
  if (value === undefined || value === null) return fallback;
  if (!(DATA_ACCESS_LEVELS as readonly unknown[]).includes(value)) {
    throw new DataError(`"access" is one of ${DATA_ACCESS_LEVELS.join(', ')}.`);
  }
  return value as DataAccess;
};

// Keeping indexes, triggers and the search table in line with the metadata

const tableObjects = (runner: SqlRunner, type: string, table: string) =>
  runner
    .all(
      'SELECT name, sql FROM sqlite_master WHERE type = ? AND tbl_name = ?',
      [type, table]
    )
    .map(row => ({ name: String(row.name), sql: row.sql as string | null }));

const dropTriggers = (runner: SqlRunner, table: DataTable) => {
  const prefix = triggerPrefix(table);
  for (const row of runner.all(
    "SELECT name FROM sqlite_master WHERE type = 'trigger' AND substr(name, 1, ?) = ?",
    [prefix.length, prefix]
  )) {
    runner.all(`DROP TRIGGER IF EXISTS ${q(String(row.name))}`);
  }
};

const duplicateValues = (
  runner: SqlRunner,
  table: DataTable,
  column: DataColumn
) =>
  runner
    .all(
      `SELECT ${q(column.name)} AS value, count(*) AS n FROM ${q(table.name)} WHERE ${q(column.name)} IS NOT NULL GROUP BY ${q(column.name)} HAVING count(*) > 1 ORDER BY n DESC LIMIT 10`
    )
    .map(row => `${JSON.stringify(row.value)} (${row.n} rows)`);

// Makes the table's indexes, triggers and search table match `table`.
// `previousName` is the name before a rename, whose search table goes.
const syncTableObjects = (
  runner: SqlRunner,
  table: DataTable,
  previousName?: string
) => {
  const wanted = desiredIndexes(table);
  const wantedNames = new Set(wanted.map(i => i.name));
  const existing = tableObjects(runner, 'index', table.name).filter(
    i => i.name.startsWith('ix_') || i.name.startsWith('ux_')
  );
  for (const index of existing) {
    if (!wantedNames.has(index.name)) {
      runner.all(`DROP INDEX IF EXISTS ${q(index.name)}`);
    }
  }
  const have = new Set(existing.map(i => i.name));
  for (const index of wanted) {
    if (have.has(index.name)) continue;
    try {
      runner.all(index.sql);
    } catch (error) {
      const column = table.columns.find(c => index.name.endsWith(`_${c.id}`));
      if (column && /UNIQUE/i.test(String((error as Error)?.message))) {
        throw new DataError(
          `${table.name}.${column.name} can't be unique: these values repeat: ${duplicateValues(runner, table, column).join(', ')}.`,
          'constraint'
        );
      }
      throw error;
    }
  }

  dropTriggers(runner, table);
  const wantedFts = ftsCreateSql(table);
  const ftsName = ftsTableName(table);
  const currentFts = first(
    runner,
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    [ftsName]
  );
  if (previousName && previousName !== table.name) {
    runner.all(`DROP TABLE IF EXISTS ${q(`${previousName}__fts`)}`);
  }
  if ((currentFts?.sql ?? null) !== wantedFts) {
    runner.all(`DROP TABLE IF EXISTS ${q(ftsName)}`);
    if (wantedFts) {
      runner.all(wantedFts);
      runner.all(`INSERT INTO ${q(ftsName)}(${q(ftsName)}) VALUES ('rebuild')`);
    }
  }
  for (const trigger of desiredTriggers(table)) runner.all(trigger.sql);
};

// Errors

// SQLite's message, for the person or model that made the call.
export const translateSqliteError = (
  schema: DataSchema,
  table: DataTable,
  error: unknown
): DataError => {
  if (error instanceof DataError) return error;
  const text = String((error as Error)?.message ?? error);
  const columnById = (id: string) => {
    for (const t of schema.tables) {
      const column = t.columns.find(c => String(c.id) === id);
      if (column) return { table: t, column };
    }
    return undefined;
  };
  let m = /NOT NULL constraint failed: [\w"]+\.(\w+)/.exec(text);
  if (m) return new DataError(`${table.name}.${m[1]} is required.`, 'constraint');
  m = /UNIQUE constraint failed: [\w"]+\.(\w+)/.exec(text);
  if (m) {
    return new DataError(
      `Another row in ${table.name} already has this ${m[1]}.`,
      'constraint'
    );
  }
  m = /CHECK constraint failed: min_(\d+)/.exec(text);
  if (m) {
    const found = columnById(m[1]);
    if (found) {
      return new DataError(
        `${found.table.name}.${found.column.name} can't go below ${found.column.min ?? 0}.`,
        'constraint'
      );
    }
  }
  m = /CHECK constraint failed: chk_(\d+)/.exec(text);
  if (m) {
    const found = columnById(m[1]);
    if (found) {
      return new DataError(
        `Invalid value for ${found.table.name}.${found.column.name} (${found.column.type}).`,
        'constraint'
      );
    }
  }
  if (/FOREIGN KEY constraint failed/.test(text)) {
    return new DataError(
      `A relation in ${table.name} points at a row that doesn't exist, or other rows still point at this one.`,
      'constraint'
    );
  }
  if (/SQLITE_FULL|database or disk is full/i.test(text)) {
    return new DataError(
      'The database is full: delete or archive rows to make room.',
      'full'
    );
  }
  if (/too many SQL variables/i.test(text)) {
    return new DataError('This call uses too many values at once.', 'too_large');
  }
  // Never SQLite's own text: it names our internal tables and constraints.
  console.error('data-sqlite-error', text);
  return new DataError(
    `The database refused this change to ${table.name}; check the values against the table's columns.`,
    'invalid'
  );
};

// Rows out

const estimateRows = (runner: SqlRunner, table: DataTable): number =>
  Number(first(runner, `SELECT max(id) AS n FROM ${q(table.name)}`)?.n ?? 0);

const assertBounded = (
  runner: SqlRunner,
  table: DataTable,
  what: string,
  column?: string
) => {
  const rows = estimateRows(runner, table);
  if (rows <= DATA_LARGE_TABLE_ROWS) return;
  throw new DataError(
    `${table.name} has about ${rows.toLocaleString('en-US')} rows, so ${what} needs a filter on an indexed column (id, or a column marked filterable, unique or a relation)${
      column ? `, or "${column}" marked filterable so it is indexed` : ''
    }.`,
    'too_large',
    { suggestIndex: column ?? null }
  );
};

const relationLabels = (schema: DataSchema, table: DataTable) =>
  table.columns
    .filter(column => column.type === 'relation' && column.table)
    .map(column => {
      const target = schema.tables.find(t => t.name === column.table);
      return { column, target, display: target?.displayColumn ?? 'id' };
    })
    .filter(
      (
        x
      ): x is { column: DataColumn; target: DataTable; display: string } =>
        Boolean(x.target)
    );

// The columns a row comes back with, plus each relation's label read from
// the related table as the caller may see it: none from a table hidden from
// it, and only its own customer's rows from a scoped one.
const selectList = (
  schema: DataSchema,
  caller: DataCaller,
  table: DataTable,
  joins: Map<string, SqlJoin>
) => {
  const list = ['t.id', 't.created_at', 't.updated_at', 't.version'];
  for (const column of table.columns) list.push(`t.${q(column.name)}`);
  for (const { column, target, display } of relationLabels(schema, table)) {
    const label = q(`__label_${column.name}`);
    if (!canRead(caller, target)) {
      list.push(`NULL AS ${label}`);
      continue;
    }
    const alias = `l_${column.name}`;
    joins.set(alias, relationJoin(caller, target, alias, `t.${q(column.name)}`));
    list.push(`${alias}.${q(display)} AS ${label}`);
  }
  return list;
};

type ShapedRow = Record<string, unknown> & { id: number };

// `version` comes back to the dashboard, the CLI and the owner's sessions,
// for edits that must not overwrite someone else's; never to a bot.
const shapeRow = (
  schema: DataSchema,
  table: DataTable,
  raw: SqlRow,
  caller: DataCaller
): ShapedRow => {
  const timeZone = caller.timeZone;
  const row: ShapedRow = { id: Number(raw.id) };
  for (const column of table.columns) {
    const value = fromStored(column, raw[column.name], timeZone);
    if (column.type === 'relation') {
      const target = schema.tables.find(t => t.name === column.table);
      const display = target
        ? columnFor(target, target.displayColumn ?? 'id')
        : undefined;
      const label = raw[`__label_${column.name}`] ?? null;
      row[column.name] =
        value === null
          ? null
          : {
              id: value,
              label:
                display && label !== null
                  ? fromStored(display, label, timeZone)
                  : label
            };
    } else {
      row[column.name] = value;
    }
  }
  row.created_at = zoned(String(raw.created_at), timeZone);
  row.updated_at = zoned(String(raw.updated_at), timeZone);
  if (!caller.restricted && raw.version !== undefined) {
    row.version = Number(raw.version);
  }
  return row;
};

const SCOPE_NOTE =
  "only this customer's own rows; other customers' rows are not visible";

// describe

export const describe = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller,
  rawArgs: unknown = {}
) => {
  const args = tidyArgs(rawArgs);
  const tables =
    args.table !== undefined && args.table !== null
      ? [tableFor(schema, caller, args.table)]
      : visibleTables(schema, caller);
  return {
    tables: tables.map(table => {
      // A scoped bot counts only its customer's rows (served by the
      // participant index), never the table's size.
      const scoped = isScoped(caller, table);
      const estimate = scoped ? 0 : estimateRows(runner, table);
      const rows = scoped
        ? Number(
            first(
              runner,
              `SELECT count(*) AS n FROM ${q(table.name)} WHERE participant_id = ?`,
              [participantOf(caller)]
            )?.n ?? 0
          )
        : estimate <= DATA_LARGE_TABLE_ROWS
          ? Number(
              first(runner, `SELECT count(*) AS n FROM ${q(table.name)}`)?.n ?? 0
            )
          : undefined;
      return {
        name: table.name,
        ...(table.label ? { label: table.label } : {}),
        description: table.description,
        access: accessOf(caller, table),
        ...(isScoped(caller, table) ? { onlyThisCustomersRows: true } : {}),
        ...(rows === undefined ? { rowsAbout: estimate } : { rows }),
        displayColumn: table.displayColumn ?? 'id',
        searchable: searchableColumns(table).map(c => c.name),
        columns: [
          { name: 'id', type: 'integer' },
          ...table.columns.map(column => ({
            name: column.name,
            type: column.type,
            ...(column.label ? { label: column.label } : {}),
            ...(column.required ? { required: true } : {}),
            ...(column.unique ? { unique: true } : {}),
            ...(column.values ? { values: column.values } : {}),
            ...(column.type === 'relation' ? { references: column.table } : {}),
            ...(column.default !== undefined ? { default: column.default } : {}),
            ...(column.min !== null ? { min: column.min } : {}),
            ...(column.description ? { description: column.description } : {})
          })),
          { name: 'created_at', type: 'datetime' },
          { name: 'updated_at', type: 'datetime' }
        ],
        referencedBy: visibleTables(schema, caller).flatMap(other =>
          other.columns
            .filter(c => c.type === 'relation' && c.table === table.name)
            .map(c => `${other.name}.${c.name}`)
        )
      };
    })
  };
};

// query

const searchJoinSql = (table: DataTable) => {
  const fts = q(ftsTableName(table));
  return `JOIN (SELECT rowid AS _r, bm25(${fts}) AS _rank FROM ${fts} WHERE ${fts} MATCH ?) s ON s._r = t.id`;
};

export const query = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller,
  rawArgs: unknown
) => {
  if (!isPlainObject(rawArgs)) throw new DataError('Arguments are an object.');
  const args = tidyArgs(rawArgs);
  const table = tableFor(schema, caller, args.table);
  const ctx: CompileContext = {
    schema,
    caller,
    table,
    joins: new Map(),
    params: []
  };
  const indexed = new Set<string>();
  const where = compileWhere(ctx, args.where, indexed);
  if (isScoped(caller, table)) {
    where.push('t.participant_id = ?');
    ctx.params.push(participantOf(caller));
  }
  const searching =
    args.search !== undefined && args.search !== null && args.search !== '';
  if (searching && searchableColumns(table).length === 0) {
    throw new DataError(
      `"${table.name}" has no searchable columns; filter with "where" instead (e.g. { "name": { "contains": "..." } }).`
    );
  }

  if (args.aggregate !== undefined && args.aggregate !== null) {
    return aggregate(runner, ctx, args, where, searching, indexed.size > 0);
  }

  const limit = args.limit === undefined || args.limit === null ? DATA_DEFAULT_PAGE : args.limit;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > DATA_MAX_PAGE) {
    throw new DataError(`"limit" is 1 to ${DATA_MAX_PAGE}.`);
  }

  const sortList =
    args.sort === undefined || args.sort === null
      ? []
      : Array.isArray(args.sort)
        ? args.sort
        : [args.sort];
  if (sortList.length > DATA_MAX_SORT_KEYS) {
    throw new DataError(`"sort" takes up to ${DATA_MAX_SORT_KEYS} columns.`);
  }
  const keys: (SortKey & { unindexed?: string })[] = [];
  let endsUnique = false;
  for (const entry of sortList) {
    if (typeof entry !== 'string' || entry === '' || entry === '-') {
      throw new DataError(
        '"sort" is a list of column names; prefix with "-" for descending, e.g. ["-created_at"].'
      );
    }
    const descending = entry.startsWith('-');
    const resolved = resolvePath(ctx, descending ? entry.slice(1) : entry);
    if (resolved.column.type === 'json') {
      throw new DataError(`${resolved.column.name} is json and can't be sorted.`);
    }
    const servedByIndex =
      resolved.own &&
      (resolved.column.name === 'id' ||
        (!isSystemColumn(resolved.column) && isIndexedColumn(resolved.column)));
    keys.push({
      sql: resolved.sql,
      descending,
      ...(servedByIndex ? {} : { unindexed: resolved.column.name })
    });
    if (resolved.own && resolved.column.name === 'id') {
      endsUnique = true;
      break;
    }
  }
  if (keys.length === 0 && searching) keys.push({ sql: 's._rank', descending: false });
  if (!endsUnique) keys.push({ sql: 't.id', descending: false });

  const unindexedSort = keys.find(k => k.unindexed);
  if (unindexedSort && indexed.size === 0 && !searching) {
    assertBounded(runner, table, 'sorting it', unindexedSort.unindexed);
  }

  const signature = JSON.stringify([
    table.name,
    keys.map(k => `${k.descending ? '-' : ''}${k.sql}`)
  ]);
  const cursor =
    args.cursor !== undefined && args.cursor !== null && args.cursor !== ''
      ? decodeCursor(args.cursor, signature)
      : null;
  if (cursor && cursor.v.length !== keys.length) {
    throw new DataError('"cursor" is not one this query returned.');
  }

  const labelJoins = new Map<string, SqlJoin>();
  const select = selectList(schema, caller, table, labelJoins);
  keys.forEach((key, i) => select.push(`${key.sql} AS ${q(`__s${i}`)}`));

  // Rows are read one at a time and the page stops at 1 MB, so a page of
  // large rows is never held in memory whole.
  const run = (match: string | null) => {
    const fromParams: SqlValue[] = match ? [match] : [];
    const searchJoin = match ? searchJoinSql(table) : '';
    const conditions = [...where];
    const countSql = `SELECT count(*) AS n FROM ${q(table.name)} t ${searchJoin} ${joinsSql(ctx.joins)} ${
      conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    }`;
    const pageParams: SqlValue[] = [];
    if (cursor) conditions.push(keysetCondition(keys, cursor.v, pageParams));
    const joins = new Map([...ctx.joins, ...labelJoins]);
    const rowsSql = `SELECT ${select.join(', ')} FROM ${q(table.name)} t ${searchJoin} ${joinsSql(joins)} ${
      conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    } ORDER BY ${keys.map(k => `${k.sql} ${k.descending ? 'DESC' : 'ASC'}`).join(', ')} LIMIT ?`;
    const params = [
      ...fromParams,
      ...joinsParams(joins),
      ...ctx.params,
      ...pageParams,
      limit + 1
    ];
    assertParamCount(params);
    const rows: ShapedRow[] = [];
    let bytes = 0;
    let last: SqlRow | undefined;
    let more = false;
    for (const raw of runner.iterate(rowsSql, params)) {
      if (rows.length === limit) {
        more = true;
        break;
      }
      const row = shapeRow(schema, table, raw, caller);
      const size = JSON.stringify(row).length;
      if (rows.length > 0 && bytes + size > DATA_MAX_RESULT_BYTES) {
        more = true;
        break;
      }
      bytes += size;
      rows.push(row);
      last = raw;
    }
    const countParams = [...fromParams, ...joinsParams(ctx.joins), ...ctx.params];
    const total = cursor
      ? undefined
      : Number(first(runner, countSql, countParams)?.n ?? 0);
    return { rows, bytes, last, more, total };
  };

  let matched: 'all words' | 'any word' | undefined;
  let result: ReturnType<typeof run>;
  try {
    if (searching) {
      const any = cursor?.m === 'any';
      result = run(ftsMatch(args.search, any));
      matched = any ? 'any word' : 'all words';
      if (!cursor && result.rows.length === 0) {
        result = run(ftsMatch(args.search, true));
        matched = 'any word';
      }
    } else {
      result = run(null);
    }
  } catch (error) {
    throw translateSqliteError(schema, table, error);
  }

  const { rows: out, last, more } = result;
  const includeTruncated =
    args.include !== undefined && args.include !== null
      ? includeRelations(
          runner,
          schema,
          caller,
          table,
          out,
          args.include,
          DATA_MAX_RESULT_BYTES - result.bytes
        )
      : false;
  return {
    table: table.name,
    ...(isScoped(caller, table) ? { scope: SCOPE_NOTE } : {}),
    ...(result.total !== undefined ? { total: result.total } : {}),
    ...(matched ? { searchMatched: matched } : {}),
    rows: out,
    ...(includeTruncated
      ? {
          includeTruncated:
            'some related rows were left as { id, label } to keep the result under 1 MB; ask for fewer rows'
        }
      : {}),
    ...(more && last
      ? {
          nextCursor: encodeCursor({
            k: signature,
            v: keys.map((_, i) => last[`__s${i}`] ?? null),
            ...(matched === 'any word' ? { m: 'any' as const } : {})
          })
        }
      : {})
  };
};

// Replaces each relation in `rows` named in `include` with the related row,
// read as the caller may see it, within `budget` bytes. Returns whether any
// was left as { id, label } to stay inside it.
const includeRelations = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller,
  table: DataTable,
  rows: ShapedRow[],
  include: unknown,
  budget: number
): boolean => {
  if (!Array.isArray(include)) {
    throw new DataError('"include" is a list of relation columns, e.g. ["customer"].');
  }
  let truncated = false;
  for (const name of include) {
    const column = typeof name === 'string' ? columnFor(table, name) : undefined;
    if (!column) throw unknownColumn(table, String(name));
    if (isSystemColumn(column) || column.type !== 'relation' || !column.table) {
      throw new DataError(
        `"${name}" is not a relation column; include takes relation columns.`
      );
    }
    const target = tableFor(schema, caller, column.table);
    const ids = [
      ...new Set(
        rows
          .map(r => (r[name] as { id?: number } | null)?.id)
          .filter((id): id is number => typeof id === 'number')
      )
    ];
    if (ids.length === 0) continue;
    const scoped = isScoped(caller, target);
    const joins = new Map<string, SqlJoin>();
    const select = selectList(schema, caller, target, joins);
    const fixed = [...joinsParams(joins), ...(scoped ? [participantOf(caller)] : [])];
    // Up to 500 ids, so they go in pieces that each stay under 100 values.
    const size = DATA_MAX_PARAMS - fixed.length;
    const byId = new Map<number, ShapedRow>();
    let spent = 0;
    fetch: for (let i = 0; i < ids.length; i += size) {
      const slice = ids.slice(i, i + size);
      const params = [...joinsParams(joins), ...slice, ...(scoped ? [participantOf(caller)] : [])];
      assertParamCount(params);
      for (const raw of runner.iterate(
        `SELECT ${select.join(', ')} FROM ${q(target.name)} t ${joinsSql(joins)} WHERE t.id IN (${slice
          .map(() => '?')
          .join(', ')})${scoped ? ' AND t.participant_id = ?' : ''}`,
        params
      )) {
        const related = shapeRow(schema, target, raw, caller);
        spent += JSON.stringify(related).length;
        if (spent > budget) {
          truncated = true;
          break fetch;
        }
        byId.set(related.id, related);
      }
    }
    for (const row of rows) {
      const ref = row[name] as { id?: number } | null;
      if (ref?.id === undefined) continue;
      const related = byId.get(ref.id);
      if (!related) continue;
      const cost = JSON.stringify(related).length;
      if (cost > budget) {
        truncated = true;
        continue;
      }
      budget -= cost;
      row[name] = related;
    }
  }
  return truncated;
};

const AGGREGATE_FUNCTIONS = ['count', 'sum', 'avg', 'min', 'max'] as const;

const aggregate = (
  runner: SqlRunner,
  ctx: CompileContext,
  args: Record<string, unknown>,
  where: string[],
  searching: boolean,
  indexedFilter: boolean
) => {
  const { schema, caller, table } = ctx;
  const list = Array.isArray(args.aggregate) ? args.aggregate : [args.aggregate];
  if (list.length === 0 || list.length > DATA_MAX_AGGREGATES) {
    throw new DataError(
      `"aggregate" is a list of 1 to ${DATA_MAX_AGGREGATES} { "fn": ..., "column": ... }.`
    );
  }
  const selects: string[] = [];
  const names: string[] = [];
  for (const item of list) {
    if (
      !isPlainObject(item) ||
      !(AGGREGATE_FUNCTIONS as readonly unknown[]).includes(item.fn)
    ) {
      throw new DataError(
        `Each aggregate is { "fn": one of ${AGGREGATE_FUNCTIONS.join(', ')}, "column": ... }.`
      );
    }
    const fn = item.fn as string;
    if (fn === 'count' && !item.column) {
      selects.push('count(*)');
      names.push('count');
      continue;
    }
    if (typeof item.column !== 'string') {
      throw new DataError(`"${fn}" needs a "column".`);
    }
    const resolved = resolvePath(ctx, item.column);
    if (
      fn !== 'count' &&
      fn !== 'min' &&
      fn !== 'max' &&
      !NUMERIC_TYPES.has(resolved.column.type)
    ) {
      throw new DataError(
        `${fn} needs a number column; "${item.column}" is ${resolved.column.type}.`
      );
    }
    // { "fn": "sum", "column": "stock", "times": "unit_cost" }: the sum of a
    // product, e.g. stock value, which rows alone can't give in one call.
    if (item.times !== undefined && item.times !== null) {
      const other = resolvePath(ctx, item.times);
      if (
        !NUMERIC_TYPES.has(resolved.column.type) ||
        !NUMERIC_TYPES.has(other.column.type)
      ) {
        throw new DataError('"times" multiplies two number columns.');
      }
      selects.push(`${fn}(${resolved.sql} * ${other.sql})`);
      names.push(
        `${fn}_${item.column.replace('.', '_')}_times_${String(item.times).replace('.', '_')}`
      );
      continue;
    }
    selects.push(`${fn}(${resolved.sql})`);
    names.push(`${fn}_${item.column.replace('.', '_')}`);
  }
  const groupBy =
    args.groupBy === undefined || args.groupBy === null
      ? []
      : Array.isArray(args.groupBy)
        ? args.groupBy
        : [args.groupBy];
  if (groupBy.length > DATA_MAX_GROUP_BY) {
    throw new DataError(`"groupBy" takes up to ${DATA_MAX_GROUP_BY} columns.`);
  }
  const groups = groupBy.map(path => ({
    path: String(path),
    ...resolvePath(ctx, path)
  }));
  if (!indexedFilter && !searching) {
    assertBounded(
      runner,
      table,
      'an aggregate over it',
      groups.find(g => g.own && !isSystemColumn(g.column))?.column.name
    );
  }
  const groupSelects: string[] = [];
  groups.forEach((g, i) => {
    groupSelects.push(`${g.sql} AS ${q(`__g${i}`)}`);
    if (g.column.type === 'relation' && !isSystemColumn(g.column) && g.column.table) {
      const target = schema.tables.find(t => t.name === (g.column as DataColumn).table);
      if (target && canRead(caller, target)) {
        const alias = `g_${i}`;
        ctx.joins.set(alias, relationJoin(caller, target, alias, g.sql));
        groupSelects.push(
          `${alias}.${q(target.displayColumn ?? 'id')} AS ${q(`__gl${i}`)}`
        );
      }
    }
  });
  const match = searching ? ftsMatch(args.search, false) : null;
  const from = `FROM ${q(table.name)} t ${match ? searchJoinSql(table) : ''} ${joinsSql(ctx.joins)}`;
  const params = [...(match ? [match] : []), ...joinsParams(ctx.joins), ...ctx.params];
  assertParamCount(params);
  const sql = `SELECT ${[
    ...groupSelects,
    ...selects.map((s, i) => `${s} AS ${q(`__a${i}`)}`)
  ].join(', ')} ${from} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}${
    groups.length
      ? ` GROUP BY ${groups.map((_, i) => q(`__g${i}`)).join(', ')} ORDER BY ${q('__a0')} DESC`
      : ''
  } LIMIT ${DATA_MAX_GROUPS + 1}`;
  let raw: SqlRow[];
  try {
    raw = runner.all(sql, params);
  } catch (error) {
    throw translateSqliteError(schema, table, error);
  }
  const truncated = raw.length > DATA_MAX_GROUPS;
  const rows = raw.slice(0, DATA_MAX_GROUPS).map(r => {
    const out: Record<string, unknown> = {};
    groups.forEach((g, i) => {
      const value = fromStored(g.column, r[`__g${i}`], caller.timeZone);
      out[g.path] =
        g.column.type === 'relation' && value !== null
          ? { id: value, label: r[`__gl${i}`] ?? null }
          : value;
    });
    names.forEach((name, i) => {
      const value = r[`__a${i}`];
      out[name] =
        typeof value === 'number' ? Math.round(value * 100) / 100 : value;
    });
    return out;
  });
  return {
    table: table.name,
    ...(isScoped(caller, table) ? { scope: SCOPE_NOTE } : {}),
    ...(groups.length ? { groups: rows } : (rows[0] ?? {})),
    ...(truncated
      ? {
          groupsTruncated: `only the ${DATA_MAX_GROUPS} largest groups by the first aggregate; filter to see the rest`
        }
      : {})
  };
};

// write

const ACTOR_PATTERN =
  /^(user|cli|mcp|channel|function|trigger|system):[^\s]{1,200}$/;

export const assertActor = (caller: DataCaller) => {
  if (typeof caller?.actor !== 'string' || !ACTOR_PATTERN.test(caller.actor)) {
    throw new DataError(
      'A write needs an actor (user:, cli:, mcp:, channel:, function:, trigger: or system: followed by an id).',
      'forbidden'
    );
  }
};

export const assertWritable = (
  runner: SqlRunner,
  caller: DataCaller,
  addsData: boolean
) => {
  assertActor(caller);
  if (caller.limits?.readOnly) {
    throw new DataError(
      "This organization's plan no longer includes Data, so the database is read-only. Upgrade to Pro to change it.",
      'read_only'
    );
  }
  const max = caller.limits?.maxBytes;
  if (addsData && typeof max === 'number' && runner.databaseSize() >= max) {
    throw new DataError(
      'The database is full: delete or archive rows to make room. Reads, deletes and exports still work.',
      'full',
      { size: runner.databaseSize(), limit: max }
    );
  }
};

// Every write names its actor here first, so row history (kept by triggers)
// records who made each change, cascades included.
const setContextActor = (runner: SqlRunner, actor: string) => {
  runner.all(
    'INSERT INTO _ganju_context (id, actor) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET actor = excluded.actor WHERE actor IS NOT excluded.actor',
    [actor]
  );
};

type WriteResult =
  | { op: 'insert'; table: string; id: number }
  | { op: 'insert'; table: string; ids: number[] }
  | { op: 'update' | 'delete'; table: string; changed: number };

const resolveRefs = (
  value: unknown,
  results: readonly WriteResult[],
  index: number
): unknown => {
  if (isPlainObject(value) && Object.keys(value).length === 1 && '$ref' in value) {
    const ref = value.$ref;
    const target =
      typeof ref === 'number' && Number.isInteger(ref) && ref >= 0 && ref < index
        ? results[ref]
        : undefined;
    if (!target || target.op !== 'insert' || !('id' in target)) {
      throw new DataError(
        `{ "$ref": ${JSON.stringify(ref)} } must point at an earlier single-row insert in this list (0-based).`
      );
    }
    return target.id;
  }
  return value;
};

const insertValues = (
  table: DataTable,
  values: unknown,
  results: readonly WriteResult[],
  index: number,
  timeZone?: string
): Map<string, SqlValue> => {
  if (!isPlainObject(values)) {
    throw new DataError('An insert takes "values", an object of column: value.');
  }
  const out = new Map<string, SqlValue>();
  for (const [name, raw] of Object.entries(values)) {
    if (name === 'id' || name === 'created_at' || name === 'updated_at') {
      throw new DataError(`${table.name}.${name} is set by the database; leave it out.`);
    }
    const column = table.columns.find(c => c.name === name);
    if (!column) throw unknownColumn(table, name);
    out.set(name, toStored(table, column, resolveRefs(raw, results, index), timeZone));
  }
  const missing = table.columns.filter(
    c =>
      c.required &&
      (c.default === undefined || c.default === null) &&
      !out.has(c.name)
  );
  if (missing.length) {
    throw new DataError(
      `Insert into ${table.name} is missing required ${missing.map(c => c.name).join(', ')}.`
    );
  }
  return out;
};

// A bot may only point a relation at a row it could read: none in a table
// hidden from it, and only its own customer's in a scoped one. Otherwise it
// could link an order to another customer and read their name back as the
// label.
const assertRelationsVisible = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller,
  table: DataTable,
  values: Map<string, SqlValue>
) => {
  if (!caller.restricted) return;
  for (const [name, value] of values) {
    if (value === null) continue;
    const column = table.columns.find(c => c.name === name);
    if (column?.type !== 'relation' || !column.table) continue;
    const target = schema.tables.find(t => t.name === column.table);
    if (!target) continue;
    if (!canRead(caller, target)) {
      throw new DataError(
        `${table.name}.${name} points at a table the assistant can't use.`,
        'forbidden'
      );
    }
    if (!isScoped(caller, target)) continue;
    const found = first(
      runner,
      `SELECT 1 AS found FROM ${q(target.name)} WHERE id = ? AND participant_id = ?`,
      [value, participantOf(caller)]
    );
    if (!found) {
      throw new DataError(
        `${table.name}.${name}: there is no row ${value} in ${target.name}.`,
        'not_found'
      );
    }
  }
};

const targetWhere = (
  ctx: CompileContext,
  op: Record<string, unknown>
): string => {
  const { table, caller } = ctx;
  if (op.id === undefined && op.where === undefined) {
    throw new DataError(`${op.op} on ${table.name} needs "id" or "where".`);
  }
  const clauses: string[] = [];
  if (op.id !== undefined) {
    if (typeof op.id !== 'number' || !Number.isInteger(op.id)) {
      throw new DataError('"id" is a whole number.');
    }
    clauses.push('t.id = ?');
    ctx.params.push(op.id);
  }
  clauses.push(...compileWhere(ctx, op.where));
  if (clauses.length === 0) {
    throw new DataError(`${op.op} on ${table.name} needs a non-empty "where".`);
  }
  if (ctx.joins.size > 0) {
    throw new DataError(
      `${op.op}: "where" on a write can't use relation paths; filter on this table's own columns.`
    );
  }
  if (op.version !== undefined) {
    if (typeof op.version !== 'number' || !Number.isInteger(op.version)) {
      throw new DataError('"version" is the whole number the row was read with.');
    }
    clauses.push('t.version = ?');
    ctx.params.push(op.version);
  }
  if (isScoped(caller, table)) {
    clauses.push('t.participant_id = ?');
    ctx.params.push(participantOf(caller));
  }
  return clauses.join(' AND ');
};

// The current values of the columns a guard named, for the row an id named,
// so "not enough stock" says how much there is.
const explainGuard = (
  runner: SqlRunner,
  ctx: CompileContext,
  op: Record<string, unknown>,
  names: string[]
): string => {
  if (typeof op.id !== 'number') return '';
  const { table, caller } = ctx;
  const scoped = isScoped(caller, table);
  const row = first(
    runner,
    `SELECT * FROM ${q(table.name)} WHERE id = ?${scoped ? ' AND participant_id = ?' : ''}`,
    [op.id, ...(scoped ? [participantOf(caller)] : [])]
  );
  if (!row) return ` Row ${op.id} doesn't exist in ${table.name}.`;
  const shown = names.filter(n => n in row && table.columns.some(c => c.name === n));
  if (shown.length === 0) return '';
  return ` Current values: ${shown.map(n => `${n} = ${JSON.stringify(row[n])}`).join(', ')}.`;
};

const versionConflict = (
  runner: SqlRunner,
  schema: DataSchema,
  ctx: CompileContext,
  op: Record<string, unknown>
): DataError | null => {
  if (op.version === undefined || typeof op.id !== 'number') return null;
  const { table, caller } = ctx;
  // The row as this caller may read it: a bot sending a stale version for
  // another customer's id learns nothing.
  const scoped = isScoped(caller, table);
  const joins = new Map<string, SqlJoin>();
  const select = selectList(schema, caller, table, joins);
  const row = first(
    runner,
    `SELECT ${select.join(', ')}, t.updated_by FROM ${q(table.name)} t ${joinsSql(joins)} WHERE t.id = ?${
      scoped ? ' AND t.participant_id = ?' : ''
    }`,
    [...joinsParams(joins), op.id, ...(scoped ? [participantOf(caller)] : [])]
  );
  if (!row || Number(row.version) === op.version) return null;
  return new DataError(
    `Row ${op.id} in ${table.name} was changed since it was read (now version ${row.version}).`,
    'conflict',
    {
      current: shapeRow(schema, table, row, caller),
      version: Number(row.version),
      updatedBy: row.updated_by
    }
  );
};

const runOperation = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller,
  op: unknown,
  index: number,
  results: WriteResult[]
): WriteResult => {
  if (!isPlainObject(op)) throw new DataError('An operation is an object.');
  const kind = op.op;
  if (kind !== 'insert' && kind !== 'update' && kind !== 'delete') {
    throw new DataError('"op" is insert, update or delete.');
  }
  const table = tableFor(schema, caller, op.table, kind === 'insert' ? 'add' : 'full');
  const actor = caller.actor;
  const scoped = isScoped(caller, table);

  if (kind === 'insert') {
    const many = op.rows !== undefined;
    if (many && op.values !== undefined) {
      throw new DataError('An insert takes "values" (one row) or "rows" (a list), not both.');
    }
    const list = many ? op.rows : [op.values];
    if (!Array.isArray(list) || list.length === 0 || list.length > DATA_MAX_INSERT_ROWS) {
      throw new DataError(`"rows" is a list of 1 to ${DATA_MAX_INSERT_ROWS} rows.`);
    }
    const prepared = list.map((values, i) => {
      try {
        const stored = insertValues(table, values, results, index, caller.timeZone);
        assertRelationsVisible(runner, schema, caller, table, stored);
        return stored;
      } catch (error) {
        if (many && error instanceof DataError) {
          throw new DataError(`Row ${i}: ${error.message}`, error.code, error.details);
        }
        throw error;
      }
    });
    // One column list for the whole batch, so rows that leave a column out
    // get NULL there rather than its default only when another row sets it.
    const names = [...new Set(prepared.flatMap(values => [...values.keys()]))];
    const columns = [...names, 'created_by', 'updated_by', ...(scoped ? ['participant_id'] : [])];
    const ids: number[] = [];
    try {
      for (const chunk of chunkRows(prepared, columns.length)) {
        const usesDefaults = chunk.some(values => names.some(n => !values.has(n)));
        if (usesDefaults && chunk.length > 1) {
          // Rows with different columns go one by one, so each missing
          // column takes its default.
          for (const values of chunk) ids.push(insertOne(runner, table, values, actor, scoped, caller));
          continue;
        }
        const params: SqlValue[] = [];
        for (const values of chunk) {
          for (const name of names) params.push(values.get(name) ?? null);
          params.push(actor, actor);
          if (scoped) params.push(participantOf(caller));
        }
        const rows = runner.all(
          `INSERT INTO ${q(table.name)} (${columns.map(q).join(', ')}) VALUES ${chunk
            .map(() => `(${columns.map(() => '?').join(', ')})`)
            .join(', ')} RETURNING id`,
          params
        );
        ids.push(...rows.map(r => Number(r.id)));
      }
    } catch (error) {
      throw translateSqliteError(schema, table, error);
    }
    return many
      ? { op: 'insert', table: table.name, ids }
      : { op: 'insert', table: table.name, id: ids[0] };
  }

  const ctx: CompileContext = { schema, caller, table, joins: new Map(), params: [] };
  const where = targetWhere(ctx, op);
  const expect =
    op.expect === undefined ? (op.id !== undefined ? 1 : undefined) : op.expect;
  if (
    expect !== undefined &&
    (typeof expect !== 'number' || !Number.isInteger(expect) || expect < 0)
  ) {
    throw new DataError('"expect" is the number of rows that must change.');
  }

  // An update or delete by "where" counts what it would touch first, so a
  // runaway one is refused before it writes (and bills) anything.
  const assertBoundedTarget = () => {
    if (op.id !== undefined) return [] as number[];
    assertParamCount(ctx.params);
    const ids = runner
      .all(`SELECT t.id FROM ${q(table.name)} t WHERE ${where} LIMIT ${DATA_MAX_ROWS_PER_WRITE + 1}`, ctx.params)
      .map(r => Number(r.id));
    if (ids.length > DATA_MAX_ROWS_PER_WRITE) {
      throw new DataError(
        `This ${kind} would ${kind === 'update' ? 'change' : 'remove'} more than ${DATA_MAX_ROWS_PER_WRITE.toLocaleString('en-US')} rows; narrow the "where".`,
        'too_large'
      );
    }
    return ids;
  };

  let changed: number;
  if (kind === 'update') {
    if (!isPlainObject(op.set) || Object.keys(op.set).length === 0) {
      throw new DataError('An update takes "set", an object of column: value.');
    }
    const sets: string[] = [];
    const setParams: SqlValue[] = [];
    const absolute = new Map<string, SqlValue>();
    for (const [name, raw] of Object.entries(op.set)) {
      const column = table.columns.find(c => c.name === name);
      if (!column) {
        throw columnFor(table, name)
          ? new DataError(`${table.name}.${name} is set by the database.`)
          : unknownColumn(table, name);
      }
      const value = resolveRefs(raw, results, index);
      if (isPlainObject(value) && column.type !== 'json') {
        const entries = Object.entries(value);
        const [how, amount] = entries[0] ?? [];
        if (entries.length !== 1 || (how !== 'increment' && how !== 'decrement')) {
          throw new DataError(
            `${table.name}.${name}: set a value, or { "increment": n } / { "decrement": n }.`
          );
        }
        if (!NUMERIC_TYPES.has(column.type) || typeof amount !== 'number' || !Number.isFinite(amount)) {
          throw new DataError(`${how} needs a number column and a number.`);
        }
        if (column.type === 'integer' && !Number.isInteger(amount)) {
          throw new DataError(`${table.name}.${name} is a whole number; ${how} by a whole number.`);
        }
        sets.push(`${q(name)} = ${q(name)} ${how === 'increment' ? '+' : '-'} ?`);
        setParams.push(amount);
      } else {
        const stored = toStored(table, column, value, caller.timeZone);
        sets.push(`${q(name)} = ?`);
        setParams.push(stored);
        absolute.set(name, stored);
      }
    }
    assertRelationsVisible(runner, schema, caller, table, absolute);
    assertBoundedTarget();
    sets.push('version = version + 1', `updated_at = ${DATA_NOW_SQL}`, 'updated_by = ?');
    setParams.push(caller.actor);
    const params = [...setParams, ...ctx.params];
    assertParamCount(params);
    try {
      changed = runner.all(
        `UPDATE ${q(table.name)} AS t SET ${sets.join(', ')} WHERE ${where} RETURNING id`,
        params
      ).length;
    } catch (error) {
      const translated = translateSqliteError(schema, table, error);
      if (translated.message.includes("can't go below")) {
        throw new DataError(
          `${translated.message}${explainGuard(runner, ctx, op, Object.keys(op.set))}`,
          'guard'
        );
      }
      throw translated;
    }
  } else {
    assertParamCount(ctx.params);
    const ids =
      op.id !== undefined
        ? runner
            .all(`SELECT t.id FROM ${q(table.name)} t WHERE ${where}`, ctx.params)
            .map(r => Number(r.id))
        : assertBoundedTarget();
    // A readable "3 rows in order_lines still point at this order" before
    // SQLite's bare foreign key error.
    for (const other of schema.tables) {
      for (const c of other.columns) {
        if (c.type !== 'relation' || c.table !== table.name) continue;
        if ((c.onDelete ?? 'restrict') !== 'restrict' || ids.length === 0) continue;
        // A relation to its own table binds each id twice.
        const self = other.name === table.name;
        const size = self ? Math.floor(DATA_MAX_PARAMS / 2) : DATA_MAX_PARAMS;
        let n = 0;
        for (let i = 0; i < ids.length; i += size) {
          const slice = ids.slice(i, i + size);
          n += Number(
            first(
              runner,
              `SELECT count(*) AS n FROM ${q(other.name)} WHERE ${q(c.name)} IN (${slice.map(() => '?').join(', ')})${
                self ? ` AND id NOT IN (${slice.map(() => '?').join(', ')})` : ''
              }`,
              self ? [...slice, ...slice] : slice
            )?.n ?? 0
          );
        }
        if (n > 0) {
          throw new DataError(
            `Can't delete: ${n} row${n === 1 ? '' : 's'} in ${other.name} still point${n === 1 ? 's' : ''} at ${
              ids.length === 1 ? 'this row' : 'these rows'
            } (${other.name}.${c.name}).`,
            'constraint',
            { table: other.name, column: c.name, count: n }
          );
        }
      }
    }
    try {
      changed = runner.all(
        `DELETE FROM ${q(table.name)} AS t WHERE ${where} RETURNING id`,
        ctx.params
      ).length;
    } catch (error) {
      throw translateSqliteError(schema, table, error);
    }
  }

  if (kind === 'update' && changed > DATA_MAX_ROWS_PER_WRITE) {
    throw new DataError(
      `This update would change more than ${DATA_MAX_ROWS_PER_WRITE.toLocaleString('en-US')} rows; narrow the "where".`,
      'too_large'
    );
  }
  if (expect !== undefined && changed !== expect) {
    const conflict = versionConflict(runner, schema, ctx, op);
    if (conflict) throw conflict;
    throw new DataError(
      `${kind} on ${table.name} changed ${changed} row${changed === 1 ? '' : 's'}, expected ${expect}; nothing was written.${explainGuard(
        runner,
        ctx,
        op,
        Object.keys(isPlainObject(op.where) ? op.where : {})
      )}`,
      'guard'
    );
  }
  return { op: kind, table: table.name, changed };
};

const insertOne = (
  runner: SqlRunner,
  table: DataTable,
  values: Map<string, SqlValue>,
  actor: string,
  scoped: boolean,
  caller: DataCaller
): number => {
  const names = [...values.keys(), 'created_by', 'updated_by', ...(scoped ? ['participant_id'] : [])];
  const params = [...values.values(), actor, actor, ...(scoped ? [participantOf(caller)] : [])];
  return Number(
    runner.all(
      `INSERT INTO ${q(table.name)} (${names.map(q).join(', ')}) VALUES (${names.map(() => '?').join(', ')}) RETURNING id`,
      params
    )[0]?.id
  );
};

// A list of inserts, updates and deletes across tables, applied together or
// not at all. A guard that fails rolls every operation back.
export const write = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller,
  rawArgs: unknown
) => {
  const operations = tidyArgs(rawArgs).operations;
  if (
    !Array.isArray(operations) ||
    operations.length === 0 ||
    operations.length > DATA_MAX_WRITE_OPERATIONS
  ) {
    throw new DataError(
      `"operations" is a list of 1 to ${DATA_MAX_WRITE_OPERATIONS} insert, update or delete operations.`
    );
  }
  const addsData = operations.some(
    op => !isPlainObject(op) || op.op !== 'delete'
  );
  assertWritable(runner, caller, addsData);
  return runner.transaction(() => {
    setContextActor(runner, caller.actor);
    const results: WriteResult[] = [];
    operations.forEach((op, index) => {
      try {
        results.push(runOperation(runner, schema, caller, op, index, results));
      } catch (error) {
        if (error instanceof DataError) {
          const label = isPlainObject(op) ? `${String(op.op)} ${String(op.table)}` : '?';
          throw new DataError(
            `Operation ${index} (${label}): ${error.message}`,
            error.code,
            { ...error.details, operation: index }
          );
        }
        throw error;
      }
    });
    return { ok: true as const, results };
  });
};

// Row history

export const rowHistory = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller,
  args: { table: string; id: number; limit?: number; cursor?: number }
) => {
  const table = tableFor(schema, caller, args.table);
  if (!Number.isInteger(args.id)) throw new DataError('"id" is a whole number.');
  // A bot reads the history of its own customer's rows only, and of rows
  // that still exist: a deleted row's owner can't be told apart.
  if (
    isScoped(caller, table) &&
    !first(
      runner,
      `SELECT 1 AS found FROM ${q(table.name)} WHERE id = ? AND participant_id = ?`,
      [args.id, participantOf(caller)]
    )
  ) {
    throw new DataError(`There is no row ${args.id} in ${table.name}.`, 'not_found');
  }
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
  const entries = runner.all(
    `SELECT id, op, actor, at, changes FROM _ganju_row_log WHERE table_id = ? AND row_id = ?${
      args.cursor ? ' AND id < ?' : ''
    } ORDER BY id DESC LIMIT ?`,
    [table.id, args.id, ...(args.cursor ? [args.cursor] : []), limit + 1]
  );
  const page = entries.slice(0, limit);
  return {
    table: table.name,
    id: args.id,
    entries: page.map(e => ({
      op: e.op,
      actor: e.actor,
      at: zoned(String(e.at), caller.timeZone),
      changes: parseJson<Record<string, [unknown, unknown]>>(e.changes) ?? {}
    })),
    ...(entries.length > limit ? { nextCursor: Number(page[page.length - 1].id) } : {})
  };
};

// Deletes history older than the retention window, a bounded batch at a
// time. Returns how many entries went, so the caller knows whether to go on.
export const pruneHistory = (
  runner: SqlRunner,
  now: Date = new Date(),
  batch = 5_000
): number => {
  const cutoff = new Date(now.getTime() - DATA_HISTORY_DAYS * 86_400_000)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');
  return runner.all(
    'DELETE FROM _ganju_row_log WHERE id IN (SELECT id FROM _ganju_row_log WHERE at < ? ORDER BY id LIMIT ?) RETURNING id',
    [cutoff, batch]
  ).length;
};

// Schema changes

const insertColumnMeta = (
  runner: SqlRunner,
  schema: DataSchema,
  tableId: number,
  tableName: string,
  column: ColumnDraft,
  position: number,
  selfId: number
): number => {
  const relationTableId =
    column.type === 'relation'
      ? column.table === tableName
        ? selfId
        : (schema.tables.find(t => t.name === column.table)?.id ?? null)
      : null;
  return Number(
    runner.all(
      `INSERT INTO _ganju_columns (table_id, name, label, description, type, required, is_unique, filterable, searchable, personal, enum_values, relation_table_id, on_delete, min, default_value, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        tableId,
        column.name,
        column.label,
        column.description,
        column.type,
        column.required ? 1 : 0,
        column.unique ? 1 : 0,
        column.filterable ? 1 : 0,
        column.searchable ? 1 : 0,
        column.personal ? 1 : 0,
        column.values ? JSON.stringify(column.values) : null,
        relationTableId,
        column.onDelete,
        column.min,
        column.default === undefined ? null : JSON.stringify({ v: column.default }),
        position
      ]
    )[0].id
  );
};

const updateColumnMeta = (
  runner: SqlRunner,
  schema: DataSchema,
  table: DataTable,
  id: number,
  column: ColumnDraft
) => {
  const relationTableId =
    column.type === 'relation'
      ? column.table === table.name
        ? table.id
        : (schema.tables.find(t => t.name === column.table)?.id ?? null)
      : null;
  runner.all(
    `UPDATE _ganju_columns SET name = ?, label = ?, description = ?, type = ?, required = ?, is_unique = ?, filterable = ?, searchable = ?, personal = ?, enum_values = ?, relation_table_id = ?, on_delete = ?, min = ?, default_value = ?, updated_at = ${DATA_NOW_SQL} WHERE id = ?`,
    [
      column.name,
      column.label,
      column.description,
      column.type,
      column.required ? 1 : 0,
      column.unique ? 1 : 0,
      column.filterable ? 1 : 0,
      column.searchable ? 1 : 0,
      column.personal ? 1 : 0,
      column.values ? JSON.stringify(column.values) : null,
      relationTableId,
      column.onDelete,
      column.min,
      column.default === undefined ? null : JSON.stringify({ v: column.default }),
      id
    ]
  );
};

const touchTable = (runner: SqlRunner, tableId: number) =>
  runner.all(`UPDATE _ganju_tables SET updated_at = ${DATA_NOW_SQL} WHERE id = ?`, [tableId]);

const setDisplayColumn = (
  runner: SqlRunner,
  tableId: number,
  name: string | null
) => {
  runner.all(
    'UPDATE _ganju_tables SET display_column_id = (SELECT id FROM _ganju_columns WHERE table_id = ? AND name = ?) WHERE id = ?',
    [tableId, name, tableId]
  );
};

const reload = (runner: SqlRunner, name: string) =>
  tableNamed(loadSchema(runner), name);

const assertDdlAllowed = (caller: DataCaller) => {
  assertActor(caller);
  if (caller.limits?.readOnly) {
    throw new DataError(
      "This organization's plan no longer includes Data, so the database is read-only. Upgrade to Pro to change it.",
      'read_only'
    );
  }
};

export const createTable = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller,
  input: unknown
): DataTable => {
  assertDdlAllowed(caller);
  if (!isPlainObject(input)) throw new DataError('A table is an object: { "name", "columns" }.');
  const nameIssue = identifierIssue(input.name, 'table');
  if (nameIssue) throw new DataError(nameIssue);
  const name = input.name as string;
  if (schema.tables.some(t => t.name === name)) {
    throw new DataError(`There is already a table "${name}".`, 'conflict');
  }
  const maxTables = Math.min(caller.limits?.maxTables ?? DATA_MAX_TABLES, DATA_MAX_TABLES);
  if (schema.tables.length >= maxTables) {
    throw new DataError(`A database holds up to ${maxTables} tables.`, 'too_large', {
      limit: maxTables
    });
  }
  if (!Array.isArray(input.columns) || input.columns.length === 0) {
    throw new DataError(`${name}: "columns" lists at least one column.`);
  }
  if (input.columns.length > DATA_MAX_COLUMNS) {
    throw new DataError(`A table has up to ${DATA_MAX_COLUMNS} columns.`, 'too_large');
  }
  const columns = input.columns.map(c => normaliseColumn(c, schema, name));
  const names = new Set<string>();
  for (const c of columns) {
    if (names.has(c.name)) throw new DataError(`${name}.${c.name} is listed twice.`);
    names.add(c.name);
  }
  // "id" is what a table without a display column shows anyway.
  const displayColumn =
    input.displayColumn === 'id' ? null : (input.displayColumn ?? null);
  if (displayColumn !== null && !names.has(String(displayColumn))) {
    throw new DataError(`"displayColumn" is one of ${name}'s columns.`);
  }
  const access = normaliseAccess(input.access, 'read');
  const customerScoped = flag(input.customerScoped, 'customerScoped');
  const history = input.history === undefined ? true : flag(input.history, 'history');

  return runner.transaction(() => {
    const position = Number(
      first(runner, 'SELECT coalesce(max(position), -1) + 1 AS p FROM _ganju_tables')?.p ?? 0
    );
    const tableId = Number(
      runner.all(
        'INSERT INTO _ganju_tables (name, label, description, access, customer_scoped, history, position) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
        [
          name,
          cleanText(input.label, DATA_MAX_LABEL, `${name} label`),
          cleanText(input.description, DATA_MAX_DESCRIPTION, `${name} description`),
          access,
          customerScoped ? 1 : 0,
          history ? 1 : 0,
          position
        ]
      )[0].id
    );
    const stored: DataColumn[] = columns.map((c, i) => ({
      ...c,
      id: insertColumnMeta(runner, schema, tableId, name, c, i, tableId),
      position: i
    }));
    if (displayColumn !== null) setDisplayColumn(runner, tableId, String(displayColumn));
    runner.all(createTableSql(name, stored));
    const table = reload(runner, name);
    syncTableObjects(runner, table);
    return table;
  });
};

export const updateTable = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller,
  name: string,
  patch: unknown
): DataTable => {
  assertDdlAllowed(caller);
  const table = tableNamed(schema, name);
  if (!isPlainObject(patch)) throw new DataError('The change is an object.');
  const allowed = ['name', 'label', 'description', 'displayColumn', 'access', 'customerScoped', 'history'];
  for (const key of Object.keys(patch)) {
    if (!allowed.includes(key)) {
      throw new DataError(`"${key}" can't be changed here; tables take ${allowed.join(', ')}.`);
    }
  }
  return runner.transaction(() => {
    let current = table.name;
    if (patch.name !== undefined && patch.name !== table.name) {
      const issue = identifierIssue(patch.name, 'table');
      if (issue) throw new DataError(issue);
      if (schema.tables.some(t => t.name === patch.name)) {
        throw new DataError(`There is already a table "${String(patch.name)}".`, 'conflict');
      }
      dropTriggers(runner, table);
      runner.all(`DROP TABLE IF EXISTS ${q(ftsTableName(table))}`);
      runner.all(`ALTER TABLE ${q(table.name)} RENAME TO ${q(patch.name as string)}`);
      runner.all('UPDATE _ganju_tables SET name = ? WHERE id = ?', [patch.name as string, table.id]);
      current = patch.name as string;
    }
    const sets: string[] = [];
    const params: SqlValue[] = [];
    if ('label' in patch) {
      sets.push('label = ?');
      params.push(cleanText(patch.label, DATA_MAX_LABEL, 'label'));
    }
    if ('description' in patch) {
      sets.push('description = ?');
      params.push(cleanText(patch.description, DATA_MAX_DESCRIPTION, 'description'));
    }
    if ('access' in patch) {
      sets.push('access = ?');
      params.push(normaliseAccess(patch.access, table.access));
    }
    if ('customerScoped' in patch) {
      sets.push('customer_scoped = ?');
      params.push(flag(patch.customerScoped, 'customerScoped') ? 1 : 0);
    }
    if ('history' in patch) {
      sets.push('history = ?');
      params.push(flag(patch.history, 'history') ? 1 : 0);
    }
    if (sets.length) {
      runner.all(`UPDATE _ganju_tables SET ${sets.join(', ')} WHERE id = ?`, [...params, table.id]);
    }
    if ('displayColumn' in patch) {
      const display = patch.displayColumn === 'id' ? null : patch.displayColumn;
      if (display !== null && !table.columns.some(c => c.name === display)) {
        throw new DataError(`"displayColumn" is one of ${table.name}'s columns.`);
      }
      setDisplayColumn(runner, table.id, display === null ? null : String(display));
    }
    touchTable(runner, table.id);
    const updated = reload(runner, current);
    syncTableObjects(runner, updated, table.name);
    return updated;
  });
};

export const dropTable = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller,
  name: string
): { dropped: string } => {
  assertDdlAllowed(caller);
  const table = tableNamed(schema, name);
  const referencedBy = schema.tables.flatMap(other =>
    other.name === table.name
      ? []
      : other.columns
          .filter(c => c.type === 'relation' && c.table === table.name)
          .map(c => `${other.name}.${c.name}`)
  );
  if (referencedBy.length) {
    throw new DataError(
      `${table.name} can't be dropped while ${referencedBy.join(', ')} point${referencedBy.length === 1 ? 's' : ''} at it; drop or change those columns first.`,
      'constraint',
      { referencedBy }
    );
  }
  runner.transaction(() => {
    dropTriggers(runner, table);
    runner.all(`DROP TABLE IF EXISTS ${q(ftsTableName(table))}`);
    runner.all(`DROP TABLE ${q(table.name)}`);
    runner.all('UPDATE _ganju_tables SET display_column_id = NULL WHERE id = ?', [table.id]);
    runner.all('DELETE FROM _ganju_columns WHERE table_id = ?', [table.id]);
    runner.all('DELETE FROM _ganju_tables WHERE id = ?', [table.id]);
  });
  return { dropped: table.name };
};

export const addColumn = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller,
  tableName: string,
  input: unknown
): DataTable => {
  assertDdlAllowed(caller);
  const table = tableNamed(schema, tableName);
  if (table.columns.length >= DATA_MAX_COLUMNS) {
    throw new DataError(`A table has up to ${DATA_MAX_COLUMNS} columns.`, 'too_large');
  }
  const column = normaliseColumn(input, schema, table.name);
  if (table.columns.some(c => c.name === column.name)) {
    throw new DataError(`${table.name} already has a column "${column.name}".`, 'conflict');
  }
  if (column.required && (column.default === undefined || column.default === null)) {
    throw new DataError(
      `${table.name}.${column.name} is required, so existing rows need a value: give it a default, or add it optional, fill it in and then make it required.`
    );
  }
  return runner.transaction(() => {
    const position = table.columns.length
      ? Math.max(...table.columns.map(c => c.position)) + 1
      : 0;
    const id = insertColumnMeta(runner, schema, table.id, table.name, column, position, table.id);
    runner.all(
      `ALTER TABLE ${q(table.name)} ADD COLUMN ${columnDefinitionSql({ ...column, id, position })}`
    );
    touchTable(runner, table.id);
    const updated = reload(runner, table.name);
    syncTableObjects(runner, updated);
    return updated;
  });
};

const REBUILD_KEYS = ['type', 'required', 'values', 'min', 'default', 'table', 'onDelete'] as const;

// Whether a column change copies the table. The database object asks before
// running it: a copy has to switch foreign keys off first, at the start of
// its own request.
export const columnChangeNeedsRebuild = (
  schema: DataSchema,
  tableName: string,
  columnName: string,
  patch: unknown
): boolean => {
  const table = schema.tables.find(t => t.name === tableName);
  const column = table?.columns.find(c => c.name === columnName);
  if (!column || !isPlainObject(patch)) return false;
  return REBUILD_KEYS.some(key => {
    if (!(key in patch)) return false;
    const next = patch[key];
    const now = column[key as keyof DataColumn];
    return JSON.stringify(next ?? null) !== JSON.stringify(now ?? null);
  });
};

export const dropColumnNeedsRebuild = (
  schema: DataSchema,
  tableName: string,
  columnName: string
): boolean => {
  const column = schema.tables
    .find(t => t.name === tableName)
    ?.columns.find(c => c.name === columnName);
  return column?.type === 'relation';
};

// Copies the table into a new one with `columns`, converting each value from
// the old column named in `from`. Runs in one transaction; the caller has
// switched foreign keys off for this request. Any row that wouldn't survive
// stops the change before anything is written, and a broken relation found
// after the swap rolls it back.
const rebuildTable = (
  runner: SqlRunner,
  schema: DataSchema,
  table: DataTable,
  columns: { draft: ColumnDraft; id: number | null; from: DataColumn | null }[],
  dropped?: DataColumn
): DataTable => {
  const rows = Number(first(runner, `SELECT count(*) AS n FROM ${q(table.name)}`)?.n ?? 0);
  if (rows > DATA_REBUILD_MAX_ROWS) {
    throw new DataError(
      `${table.name} has ${rows.toLocaleString('en-US')} rows; this change copies the table and works up to ${DATA_REBUILD_MAX_ROWS.toLocaleString('en-US')} rows for now.`,
      'too_large'
    );
  }
  const rules = (c: ColumnDraft) =>
    JSON.stringify([c.type, c.required, c.values, c.min, c.table]);
  for (const c of columns) {
    if (!c.from || rules(c.from) === rules(c.draft)) continue;
    const to: DataColumn = { ...c.draft, id: c.id ?? 0, position: 0 };
    const src = `t.${q(c.from.name)}`;
    const converted = conversionSql(c.from.type, to, src);
    const bad = runner.all(
      `SELECT t.id, ${src} AS value FROM ${q(table.name)} t WHERE ${invalidAfterConversionSql(to, src, converted)} LIMIT 10`
    );
    if (bad.length) {
      throw new DataError(
        `${table.name}.${c.from.name} can't become ${to.type}${to.required ? ', required' : ''}: ${bad.length === 10 ? 'these rows (and maybe more)' : 'these rows'} don't fit: ${bad
          .map(r => `id ${r.id} = ${JSON.stringify(r.value)}`)
          .join(', ')}. Nothing was changed.`,
        'constraint',
        { rows: bad.map(r => ({ id: r.id, value: r.value })) }
      );
    }
  }

  return runner.transaction(() => {
    dropTriggers(runner, table);
    runner.all(`DROP TABLE IF EXISTS ${q(ftsTableName(table))}`);
    if (dropped) {
      if (table.displayColumn === dropped.name) setDisplayColumn(runner, table.id, null);
      runner.all('DELETE FROM _ganju_columns WHERE id = ?', [dropped.id]);
    }
    const stored: DataColumn[] = columns.map((c, position) => {
      const id =
        c.id ?? insertColumnMeta(runner, schema, table.id, table.name, c.draft, position, table.id);
      if (c.id !== null) updateColumnMeta(runner, schema, table, c.id, c.draft);
      runner.all('UPDATE _ganju_columns SET position = ? WHERE id = ?', [position, id]);
      return { ...c.draft, id, position };
    });
    const temp = `${table.name}__new`;
    runner.all(`DROP TABLE IF EXISTS ${q(temp)}`);
    runner.all(createTableSql(temp, stored));
    const targets = ['id', ...stored.map(c => c.name), 'created_at', 'updated_at', 'version', 'created_by', 'updated_by', 'participant_id'];
    const sources = [
      't.id',
      ...columns.map((c, i) =>
        c.from ? conversionSql(c.from.type, stored[i], `t.${q(c.from.name)}`) : 'NULL'
      ),
      't.created_at',
      't.updated_at',
      't.version',
      't.created_by',
      't.updated_by',
      't.participant_id'
    ];
    runner.all(
      `INSERT INTO ${q(temp)} (${targets.map(q).join(', ')}) SELECT ${sources.join(', ')} FROM ${q(table.name)} t`
    );
    runner.all(`DROP TABLE ${q(table.name)}`);
    runner.all(`ALTER TABLE ${q(temp)} RENAME TO ${q(table.name)}`);
    touchTable(runner, table.id);
    const updated = reload(runner, table.name);
    syncTableObjects(runner, updated);
    const checked = [
      updated.name,
      ...schema.tables
        .filter(t => t.name !== updated.name && t.columns.some(c => c.type === 'relation' && c.table === updated.name))
        .map(t => t.name)
    ];
    for (const name of checked) {
      const violations = runner.all(`PRAGMA foreign_key_check(${q(name)})`);
      if (violations.length) {
        throw new DataError(
          `The change would leave ${violations.length} row${violations.length === 1 ? '' : 's'} in ${name} pointing at nothing; nothing was changed.`,
          'constraint'
        );
      }
    }
    return updated;
  });
};

export const updateColumn = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller,
  tableName: string,
  columnName: string,
  patch: unknown
): DataTable => {
  assertDdlAllowed(caller);
  const table = tableNamed(schema, tableName);
  const column = columnNamed(table, columnName);
  if (!isPlainObject(patch)) throw new DataError('The change is an object.');
  const merged = { ...toTableInput(table).columns.find(c => c.name === column.name)!, ...patch };
  for (const key of Object.keys(merged)) {
    if ((merged as Record<string, unknown>)[key] === null) delete (merged as Record<string, unknown>)[key];
  }
  if (merged.type !== 'enum') delete merged.values;
  if (merged.type !== 'relation') {
    delete merged.table;
    delete merged.onDelete;
  }
  if (!NUMERIC_TYPES.has(merged.type as DataColumnType)) delete merged.min;
  const draft = normaliseColumn(merged, schema, table.name);
  if (draft.name !== column.name && table.columns.some(c => c.name === draft.name)) {
    throw new DataError(`${table.name} already has a column "${draft.name}".`, 'conflict');
  }

  if (columnChangeNeedsRebuild(schema, table.name, column.name, patch)) {
    return rebuildTable(
      runner,
      schema,
      table,
      table.columns.map(c =>
        c.id === column.id
          ? { draft, id: c.id, from: c }
          : { draft: c, id: c.id, from: c }
      )
    );
  }

  return runner.transaction(() => {
    if (draft.name !== column.name) {
      dropTriggers(runner, table);
      runner.all(`DROP TABLE IF EXISTS ${q(ftsTableName(table))}`);
      runner.all(
        `ALTER TABLE ${q(table.name)} RENAME COLUMN ${q(column.name)} TO ${q(draft.name)}`
      );
    }
    updateColumnMeta(runner, schema, table, column.id, draft);
    touchTable(runner, table.id);
    const updated = reload(runner, table.name);
    syncTableObjects(runner, updated);
    return updated;
  });
};

export const dropColumn = (
  runner: SqlRunner,
  schema: DataSchema,
  caller: DataCaller,
  tableName: string,
  columnName: string
): DataTable => {
  assertDdlAllowed(caller);
  const table = tableNamed(schema, tableName);
  const column = columnNamed(table, columnName);
  if (table.columns.length === 1) {
    throw new DataError(`${table.name} needs at least one column; drop the table instead.`);
  }
  if (dropColumnNeedsRebuild(schema, table.name, column.name)) {
    return rebuildTable(
      runner,
      schema,
      table,
      table.columns
        .filter(c => c.id !== column.id)
        .map(c => ({ draft: c, id: c.id, from: c })),
      column
    );
  }

  return runner.transaction(() => {
    dropTriggers(runner, table);
    runner.all(`DROP TABLE IF EXISTS ${q(ftsTableName(table))}`);
    for (const index of tableObjects(runner, 'index', table.name)) {
      if (index.name.endsWith(`_${column.id}`) && (index.name.startsWith('ix_') || index.name.startsWith('ux_'))) {
        runner.all(`DROP INDEX IF EXISTS ${q(index.name)}`);
      }
    }
    runner.all(`ALTER TABLE ${q(table.name)} DROP COLUMN ${q(column.name)}`);
    if (table.displayColumn === column.name) setDisplayColumn(runner, table.id, null);
    runner.all('DELETE FROM _ganju_columns WHERE id = ?', [column.id]);
    touchTable(runner, table.id);
    const updated = reload(runner, table.name);
    syncTableObjects(runner, updated);
    return updated;
  });
};

// Export

// A table's rows as stored, every column included, from after `afterId`,
// one at a time: an export stops reading once it has a step's worth.
export const exportRows = (
  runner: SqlRunner,
  table: DataTable,
  afterId: number
): Iterable<SqlRow> =>
  runner.iterate(`SELECT * FROM ${q(table.name)} WHERE id > ? ORDER BY id`, [
    afterId
  ]);
