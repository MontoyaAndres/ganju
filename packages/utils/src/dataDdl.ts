// The SQL a project's database runs to build and change its tables. Pure
// string building: every name in here passed identifierIssue or is one of
// ours, and every owner-supplied value is a literal escaped by sqlLiteral.
import { quoteIdentifier as q } from './dataIdentifiers';
import type {
  DataColumn,
  DataColumnType,
  DataDefaultValue,
  DataTable
} from './dataTypes';

export const DATA_NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')";

export const TEXT_LIKE_TYPES: ReadonlySet<DataColumnType> = new Set([
  'text',
  'long_text',
  'email',
  'url',
  'phone',
  'file'
]);
export const NUMERIC_TYPES: ReadonlySet<DataColumnType> = new Set([
  'integer',
  'decimal'
]);
// Columns full-text search can cover.
export const SEARCHABLE_TYPES: ReadonlySet<DataColumnType> = new Set([
  'text',
  'long_text',
  'email',
  'url',
  'phone',
  'enum'
]);
// Columns a unique index makes sense on.
export const UNIQUE_TYPES: ReadonlySet<DataColumnType> = new Set([
  'text',
  'email',
  'url',
  'phone',
  'integer',
  'decimal',
  'date',
  'datetime',
  'enum',
  'relation'
]);

// Literal for a value the owner typed (a default, an enum value). Strings are
// single-quoted with quotes doubled; nothing else reaches SQL unescaped.
export const sqlLiteral = (value: DataDefaultValue): string => {
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('not a finite number');
    return String(value);
  }
  return `'${String(value).replace(/'/g, "''")}'`;
};

// Names derived from stable ids, so renaming a table or column never leaves
// an index or constraint behind under the old name.
export const indexName = (table: Pick<DataTable, 'id'>, column: DataColumn) =>
  `ix_${table.id}_${column.id}`;
export const uniqueIndexName = (
  table: Pick<DataTable, 'id'>,
  column: DataColumn
) => `ux_${table.id}_${column.id}`;
export const participantIndexName = (table: Pick<DataTable, 'id'>) =>
  `ix_${table.id}_participant`;
export const ftsTableName = (table: Pick<DataTable, 'name'>) =>
  `${table.name}__fts`;
export const triggerPrefix = (table: Pick<DataTable, 'id'>) =>
  `tr_${table.id}_`;
export const checkConstraintName = (column: Pick<DataColumn, 'id'>) =>
  `chk_${column.id}`;
export const minConstraintName = (column: Pick<DataColumn, 'id'>) =>
  `min_${column.id}`;

// The default as SQLite stores it: booleans as 0/1, JSON as its text.
export const storedDefault = (
  column: Pick<DataColumn, 'type'>,
  value: DataDefaultValue
): DataDefaultValue => {
  if (value === null) return null;
  if (column.type === 'boolean') return value ? 1 : 0;
  if (column.type === 'json') return JSON.stringify(value);
  return value;
};

const typeCheck = (column: DataColumn): { affinity: string; check: string } => {
  const c = q(column.name);
  switch (column.type) {
    case 'integer':
    case 'relation':
      return { affinity: 'INTEGER', check: `typeof(${c}) = 'integer'` };
    case 'decimal':
      return {
        affinity: 'REAL',
        check: `typeof(${c}) IN ('real', 'integer')`
      };
    case 'boolean':
      return { affinity: 'INTEGER', check: `${c} IN (0, 1)` };
    case 'date':
      return {
        affinity: 'TEXT',
        check: `typeof(${c}) = 'text' AND date(${c}) = ${c}`
      };
    case 'datetime':
      return {
        affinity: 'TEXT',
        check: `typeof(${c}) = 'text' AND strftime('%Y-%m-%dT%H:%M:%SZ', ${c}) = ${c}`
      };
    case 'enum':
      return {
        affinity: 'TEXT',
        check: `${c} IN (${(column.values ?? []).map(sqlLiteral).join(', ')})`
      };
    case 'json':
      return { affinity: 'TEXT', check: `json_valid(${c})` };
    default:
      return { affinity: 'TEXT', check: `typeof(${c}) = 'text'` };
  }
};

const ON_DELETE_SQL = {
  restrict: 'RESTRICT',
  cascade: 'CASCADE',
  set_null: 'SET NULL'
} as const;

export const columnDefinitionSql = (column: DataColumn): string => {
  const c = q(column.name);
  const { affinity, check } = typeCheck(column);
  const parts = [
    c,
    affinity,
    `CONSTRAINT ${q(checkConstraintName(column))} CHECK (${c} IS NULL OR (${check}))`
  ];
  if (column.min !== null && NUMERIC_TYPES.has(column.type)) {
    parts.push(
      `CONSTRAINT ${q(minConstraintName(column))} CHECK (${c} IS NULL OR ${c} >= ${sqlLiteral(column.min)})`
    );
  }
  if (column.type === 'relation' && column.table) {
    parts.push(
      `REFERENCES ${q(column.table)}(id) ON DELETE ${ON_DELETE_SQL[column.onDelete ?? 'restrict']}`
    );
  }
  if (column.required) parts.push('NOT NULL');
  if (column.default !== undefined && column.default !== null) {
    parts.push(`DEFAULT ${sqlLiteral(storedDefault(column, column.default))}`);
  }
  return parts.join(' ');
};

// Every table has the same system columns around the owner's. The hidden
// participant_id is always there, so turning customer scoping on is an index,
// not a table change.
export const createTableSql = (
  name: string,
  columns: readonly DataColumn[]
): string =>
  [
    `CREATE TABLE ${q(name)} (`,
    [
      'id INTEGER PRIMARY KEY',
      ...columns.map(columnDefinitionSql),
      `created_at TEXT NOT NULL DEFAULT (${DATA_NOW_SQL})`,
      `updated_at TEXT NOT NULL DEFAULT (${DATA_NOW_SQL})`,
      'version INTEGER NOT NULL DEFAULT 1',
      'created_by TEXT',
      'updated_by TEXT',
      'participant_id TEXT'
    ].join(',\n  '),
    ')'
  ].join('\n');

export interface NamedStatement {
  name: string;
  sql: string;
}

// The indexes a table should have: every relation and file column (SQLite
// doesn't index the child side of a foreign key), every unique column (as a
// unique index, so the column can still be dropped with ALTER TABLE) and
// every filterable one.
export const desiredIndexes = (table: DataTable): NamedStatement[] => {
  const out: NamedStatement[] = [];
  for (const column of table.columns) {
    if (column.unique) {
      const name = uniqueIndexName(table, column);
      out.push({
        name,
        sql: `CREATE UNIQUE INDEX ${q(name)} ON ${q(table.name)}(${q(column.name)})`
      });
    } else if (
      column.type === 'relation' ||
      column.type === 'file' ||
      column.filterable
    ) {
      const name = indexName(table, column);
      out.push({
        name,
        sql: `CREATE INDEX ${q(name)} ON ${q(table.name)}(${q(column.name)})`
      });
    }
  }
  if (table.customerScoped) {
    const name = participantIndexName(table);
    out.push({
      name,
      sql: `CREATE INDEX ${q(name)} ON ${q(table.name)}(participant_id)`
    });
  }
  return out;
};

// Whether a filter or sort on this column is served by an index.
export const isIndexedColumn = (column: DataColumn): boolean =>
  column.unique ||
  column.filterable ||
  column.type === 'relation' ||
  column.type === 'file';

export const searchableColumns = (table: DataTable): DataColumn[] =>
  table.columns.filter(
    column => column.searchable && SEARCHABLE_TYPES.has(column.type)
  );

// The search table: an external-content FTS5 table over the searchable
// columns, accent-insensitive ("jalapeno" finds "jalapeño"). Null when the
// table has nothing searchable.
export const ftsCreateSql = (table: DataTable): string | null => {
  const columns = searchableColumns(table);
  if (columns.length === 0) return null;
  return `CREATE VIRTUAL TABLE ${q(ftsTableName(table))} USING fts5(${columns
    .map(c => q(c.name))
    .join(
      ', '
    )}, content=${sqlLiteral(table.name)}, content_rowid='id', tokenize='unicode61 remove_diacritics 2')`;
};

const ftsTriggers = (table: DataTable): NamedStatement[] => {
  const columns = searchableColumns(table);
  if (columns.length === 0) return [];
  const fts = q(ftsTableName(table));
  const t = q(table.name);
  const list = columns.map(c => q(c.name)).join(', ');
  const newValues = columns.map(c => `new.${q(c.name)}`).join(', ');
  const oldValues = columns.map(c => `old.${q(c.name)}`).join(', ');
  const prefix = triggerPrefix(table);
  return [
    {
      name: `${prefix}fts_ai`,
      sql: `CREATE TRIGGER ${q(`${prefix}fts_ai`)} AFTER INSERT ON ${t} BEGIN INSERT INTO ${fts}(rowid, ${list}) VALUES (new.id, ${newValues}); END`
    },
    {
      name: `${prefix}fts_ad`,
      sql: `CREATE TRIGGER ${q(`${prefix}fts_ad`)} AFTER DELETE ON ${t} BEGIN INSERT INTO ${fts}(${fts}, rowid, ${list}) VALUES ('delete', old.id, ${oldValues}); END`
    },
    {
      // Only when a searchable column changes, so a stock decrement doesn't
      // rewrite the search index.
      name: `${prefix}fts_au`,
      sql: `CREATE TRIGGER ${q(`${prefix}fts_au`)} AFTER UPDATE OF ${list} ON ${t} BEGIN INSERT INTO ${fts}(${fts}, rowid, ${list}) VALUES ('delete', old.id, ${oldValues}); INSERT INTO ${fts}(rowid, ${list}) VALUES (new.id, ${newValues}); END`
    }
  ];
};

// json_object takes at most 127 arguments, so wide tables are built in
// pieces and merged. json_patch drops keys whose value is null, which is what
// leaves only the changed columns.
const changedColumnsJson = (
  columns: readonly DataColumn[],
  value: (column: string) => string
): string => {
  let out = "'{}'";
  for (let i = 0; i < columns.length; i += 50) {
    const pairs = columns
      .slice(i, i + 50)
      .map(c => `${sqlLiteral(c.name)}, ${value(q(c.name))}`)
      .join(', ');
    out = `json_patch(${out}, json_object(${pairs}))`;
  }
  return out;
};

// Row history: who changed which columns, old → new. Triggers rather than
// code, so cascades and SET NULL are recorded too. The actor comes from
// _ganju_context, which every write sets first.
const historyTriggers = (table: DataTable): NamedStatement[] => {
  if (!table.history) return [];
  const t = q(table.name);
  const prefix = triggerPrefix(table);
  const columns = table.columns;
  const log = (op: string, rowId: string, changes: string) =>
    `INSERT INTO _ganju_row_log (table_id, row_id, op, actor, at, changes) VALUES (${table.id}, ${rowId}, '${op}', (SELECT actor FROM _ganju_context WHERE id = 1), ${DATA_NOW_SQL}, ${changes})`;
  const changed = columns.length
    ? columns.map(c => `old.${q(c.name)} IS NOT new.${q(c.name)}`).join(' OR ')
    : '0';
  return [
    {
      name: `${prefix}log_ai`,
      sql: `CREATE TRIGGER ${q(`${prefix}log_ai`)} AFTER INSERT ON ${t} BEGIN ${log(
        'insert',
        'new.id',
        changedColumnsJson(
          columns,
          c => `CASE WHEN new.${c} IS NOT NULL THEN json_array(NULL, new.${c}) END`
        )
      )}; END`
    },
    {
      name: `${prefix}log_au`,
      sql: `CREATE TRIGGER ${q(`${prefix}log_au`)} AFTER UPDATE ON ${t} WHEN ${changed} BEGIN ${log(
        'update',
        'new.id',
        changedColumnsJson(
          columns,
          c =>
            `CASE WHEN old.${c} IS NOT new.${c} THEN json_array(old.${c}, new.${c}) END`
        )
      )}; END`
    },
    {
      name: `${prefix}log_ad`,
      sql: `CREATE TRIGGER ${q(`${prefix}log_ad`)} AFTER DELETE ON ${t} BEGIN ${log(
        'delete',
        'old.id',
        changedColumnsJson(
          columns,
          c => `CASE WHEN old.${c} IS NOT NULL THEN json_array(old.${c}, NULL) END`
        )
      )}; END`
    }
  ];
};

export const desiredTriggers = (table: DataTable): NamedStatement[] => [
  ...ftsTriggers(table),
  ...historyTriggers(table)
];

// Type changes

// SQL that turns `src` (the old column's value) into what `to` stores, or
// NULL when it can't. The rows where it yields NULL from a non-null value
// are the ones a type change lists and refuses on.
export const conversionSql = (
  fromType: DataColumnType,
  to: DataColumn,
  src: string
): string => {
  if (fromType === to.type) return src;
  switch (to.type) {
    case 'text':
    case 'long_text':
    case 'email':
    case 'url':
    case 'phone':
    case 'file':
      return fromType === 'boolean'
        ? `CASE ${src} WHEN 1 THEN 'true' WHEN 0 THEN 'false' END`
        : `CAST(${src} AS TEXT)`;
    case 'integer':
    case 'relation':
      return `CASE WHEN typeof(${src}) = 'integer' THEN ${src} WHEN typeof(${src}) = 'real' AND ${src} = CAST(${src} AS INTEGER) THEN CAST(${src} AS INTEGER) WHEN typeof(${src}) = 'text' AND trim(${src}) <> '' AND CAST(CAST(trim(${src}) AS INTEGER) AS TEXT) = ltrim(trim(${src}), '+') THEN CAST(trim(${src}) AS INTEGER) END`;
    case 'decimal':
      return `CASE WHEN typeof(${src}) IN ('integer', 'real') THEN ${src} WHEN typeof(${src}) = 'text' AND trim(${src}) <> '' AND trim(${src}) NOT GLOB '*[^0-9.eE+-]*' AND trim(${src}) GLOB '*[0-9]*' THEN CAST(trim(${src}) AS REAL) END`;
    case 'boolean':
      return `CASE WHEN typeof(${src}) IN ('integer', 'real') AND ${src} IN (0, 1) THEN CAST(${src} AS INTEGER) WHEN typeof(${src}) = 'text' AND lower(trim(${src})) IN ('true', '1', 'yes', 'si', 'sí') THEN 1 WHEN typeof(${src}) = 'text' AND lower(trim(${src})) IN ('false', '0', 'no') THEN 0 END`;
    case 'date':
      return `CASE WHEN typeof(${src}) = 'text' THEN date(${src}) END`;
    case 'datetime':
      return `CASE WHEN typeof(${src}) = 'text' THEN strftime('%Y-%m-%dT%H:%M:%SZ', ${src}) END`;
    case 'enum':
      return `CASE lower(trim(CAST(${src} AS TEXT))) ${(to.values ?? [])
        .map(v => `WHEN ${sqlLiteral(v.toLowerCase())} THEN ${sqlLiteral(v)}`)
        .join(' ')} END`;
    case 'json':
      return fromType === 'boolean'
        ? `CASE ${src} WHEN 1 THEN 'true' WHEN 0 THEN 'false' END`
        : `CASE WHEN typeof(${src}) = 'text' AND json_valid(${src}) THEN ${src} ELSE json_quote(${src}) END`;
  }
};

// The condition that marks a row whose value can't be kept after the change:
// it doesn't convert, or breaks one of the new column's rules.
export const invalidAfterConversionSql = (
  to: DataColumn,
  src: string,
  converted: string
): string => {
  const parts = [`(${src} IS NOT NULL AND (${converted}) IS NULL)`];
  if (to.required) parts.push(`(${converted}) IS NULL`);
  if (to.min !== null && NUMERIC_TYPES.has(to.type)) {
    parts.push(`(${converted}) < ${sqlLiteral(to.min)}`);
  }
  if (to.type === 'enum') {
    parts.push(
      `((${converted}) IS NOT NULL AND (${converted}) NOT IN (${(to.values ?? []).map(sqlLiteral).join(', ')}))`
    );
  }
  if (to.type === 'email') {
    parts.push(`(${converted}) NOT LIKE '%_@_%._%'`);
  }
  if (to.type === 'url') {
    parts.push(
      `NOT ((${converted}) LIKE 'http://%' OR (${converted}) LIKE 'https://%')`
    );
  }
  if (to.type === 'relation' && to.table) {
    parts.push(
      `((${converted}) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${q(to.table)} WHERE id = (${converted})))`
    );
  }
  return parts.join(' OR ');
};
