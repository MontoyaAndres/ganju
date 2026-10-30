import type { DataColumnInput, DataTableInput } from '@ganju/utils/data';

/**
 * What `ganju data schema push` would do to turn the database's schema into
 * the one in `ganju.data.json`, as an ordered list of API calls.
 *
 * Tables and columns are matched by name. A rename therefore reads as a drop
 * and an add, which is the safe reading: a drop needs `--yes`, so a rename
 * typed into the file can't quietly empty a column. `ganju data column rename`
 * is how a rename keeps its rows.
 *
 * Pure, so every case is a unit test rather than a run against a database.
 */

export type SchemaStep =
  | { kind: 'createTable'; table: string; input: DataTableInput }
  | { kind: 'addColumn'; table: string; column: string; input: DataColumnInput }
  | {
      kind: 'updateColumn';
      table: string;
      column: string;
      patch: Partial<Record<keyof DataColumnInput, unknown>>;
      // The table is copied to apply it: a type, a requirement, the enum's
      // values, a minimum, a default or what a relation points at.
      copies: boolean;
    }
  | {
      kind: 'updateTable';
      table: string;
      patch: Partial<Record<keyof Omit<DataTableInput, 'columns'>, unknown>>;
    }
  | { kind: 'dropColumn'; table: string; column: string }
  | { kind: 'dropTable'; table: string };

export interface SchemaPlan {
  steps: SchemaStep[];
  // The steps that lose data or rewrite a column: drops, and type changes.
  // `push` applies them only with `--yes`.
  destructive: SchemaStep[];
}

const NUMERIC = new Set(['integer', 'decimal']);
// The column keys whose change copies the table, as the database decides it.
const COPY_KEYS = [
  'type',
  'required',
  'values',
  'min',
  'default',
  'table',
  'onDelete'
] as const;
const COLUMN_KEYS = [
  'type',
  'label',
  'description',
  'required',
  'unique',
  'filterable',
  'searchable',
  'personal',
  'values',
  'table',
  'onDelete',
  'min',
  'default'
] as const;
const TABLE_KEYS = [
  'label',
  'description',
  'displayColumn',
  'access',
  'customerScoped',
  'history'
] as const;

/**
 * A column with every default spelled out, so a file that leaves a key out and
 * a database that stores its default compare equal. `default` stays undefined
 * when there is none: no default and a default of null are not the same.
 */
export const normaliseColumn = (column: DataColumnInput) => ({
  type: column.type,
  label: column.label || null,
  description: column.description || null,
  required: !!column.required,
  unique: !!column.unique,
  filterable: !!column.filterable,
  searchable: !!column.searchable,
  personal: !!column.personal,
  values: column.type === 'enum' ? (column.values ?? null) : null,
  table: column.type === 'relation' ? (column.table ?? null) : null,
  onDelete: column.type === 'relation' ? (column.onDelete ?? 'restrict') : null,
  min: NUMERIC.has(column.type) ? (column.min ?? null) : null,
  default: column.default
});

/**
 * A table's settings with their defaults. A display column left out is the
 * first text column, as on create; "id" and null both mean the id.
 */
export const normaliseTable = (table: DataTableInput) => ({
  label: table.label || null,
  description: table.description || null,
  displayColumn:
    table.displayColumn === 'id'
      ? null
      : table.displayColumn === undefined
        ? (table.columns.find(c => c.type === 'text')?.name ?? null)
        : table.displayColumn,
  access: table.access ?? 'read',
  customerScoped: !!table.customerScoped,
  history: table.history ?? true
});

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The file's own mistakes, found before anything is sent: a table or column
 * listed twice, a relation to a table the file doesn't have. Everything else
 * (types, names, limits) the API checks, and says so per field.
 */
export const checkSchemaFile = (value: unknown): DataTableInput[] => {
  const problems: string[] = [];
  const tables =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as { tables?: unknown }).tables
      : undefined;
  if (!Array.isArray(tables)) {
    throw new SchemaFileError(['the file is { "tables": [ ... ] }']);
  }
  const names = new Set<string>();
  for (const [index, table] of tables.entries()) {
    if (typeof table !== 'object' || table === null || Array.isArray(table)) {
      problems.push(`tables[${index}] is not an object`);
      continue;
    }
    const { name, columns } = table as { name?: unknown; columns?: unknown };
    if (typeof name !== 'string' || !name) {
      problems.push(`tables[${index}] has no "name"`);
      continue;
    }
    if (names.has(name)) problems.push(`table "${name}" is listed twice`);
    names.add(name);
    if (!Array.isArray(columns) || columns.length === 0) {
      problems.push(`${name}: "columns" lists at least one column`);
      continue;
    }
    const seen = new Set<string>();
    for (const [i, column] of columns.entries()) {
      const columnName = (column as { name?: unknown } | null)?.name;
      if (typeof columnName !== 'string' || !columnName) {
        problems.push(`${name}.columns[${i}] has no "name"`);
        continue;
      }
      if (seen.has(columnName)) {
        problems.push(`${name}.${columnName} is listed twice`);
      }
      seen.add(columnName);
    }
  }
  for (const table of tables as DataTableInput[]) {
    if (!Array.isArray(table?.columns)) continue;
    for (const column of table.columns) {
      if (
        column?.type === 'relation' &&
        typeof column.table === 'string' &&
        !names.has(column.table)
      ) {
        problems.push(
          `${table.name}.${column.name} points at "${column.table}", which the file doesn't have`
        );
      }
    }
  }
  if (problems.length) throw new SchemaFileError(problems);
  return tables as DataTableInput[];
};

export class SchemaFileError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(problems[0]);
    this.name = 'SchemaFileError';
    this.problems = problems;
  }
}

const relationTargets = (table: DataTableInput) =>
  table.columns
    .filter(c => c.type === 'relation' && c.table && c.table !== table.name)
    .map(c => c.table as string);

/**
 * New tables in an order where every relation's target exists first.
 *
 * Tables that point at each other (orders ⇄ customers) can't both go first.
 * The cycle is broken by creating one of them without the relation columns
 * that point into the cycle, and adding those columns once every table in it
 * exists. The table broken is the first by name whose other columns still make
 * a table, so the same file always gives the same plan.
 */
const orderCreates = (
  created: DataTableInput[],
  existing: Set<string>
): {
  creates: DataTableInput[];
  deferred: { table: string; input: DataColumnInput }[];
} => {
  const pending = new Map(created.map(t => [t.name, t]));
  const ready = new Set(existing);
  const creates: DataTableInput[] = [];
  const deferred: { table: string; input: DataColumnInput }[] = [];

  while (pending.size) {
    const next = [...pending.values()]
      .filter(t => relationTargets(t).every(target => ready.has(target)))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (next.length) {
      // Kept in the file's order among the tables that are ready together.
      for (const table of created) {
        if (!next.includes(table)) continue;
        creates.push(table);
        ready.add(table.name);
        pending.delete(table.name);
      }
      continue;
    }
    const stuck = [...pending.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    const breakable = stuck.find(t =>
      t.columns.some(
        c =>
          !(
            c.type === 'relation' &&
            c.table &&
            pending.has(c.table) &&
            c.table !== t.name
          )
      )
    );
    if (!breakable) {
      throw new SchemaFileError([
        `${stuck.map(t => t.name).join(', ')} point at each other and have no other columns, so none of them can be created first`
      ]);
    }
    const later = breakable.columns.filter(
      c =>
        c.type === 'relation' &&
        c.table &&
        pending.has(c.table) &&
        c.table !== breakable.name
    );
    const kept = breakable.columns.filter(c => !later.includes(c));
    const display = breakable.displayColumn;
    const input: DataTableInput = { ...breakable, columns: kept };
    // A display column that isn't there yet is set once it is.
    if (display && later.some(c => c.name === display)) {
      input.displayColumn = null;
    }
    creates.push(input);
    ready.add(breakable.name);
    pending.delete(breakable.name);
    for (const column of later)
      deferred.push({ table: breakable.name, input: column });
  }
  return { creates, deferred };
};

/**
 * Tables to drop in an order the API accepts. It refuses to drop a table
 * while another table points at it, even one the same push drops next, so a
 * table that points at another dropped table goes before it.
 *
 * Tables that point at each other can't either go first. The cycle is broken
 * by dropping the relation columns that point at one of them, which frees it:
 * the first by name whose pointing tables all keep another column, so the
 * same file always gives the same plan.
 */
const orderDrops = (dropped: DataTableInput[]): SchemaStep[] => {
  const pending = new Map(
    dropped.map(t => [t.name, { ...t, columns: [...t.columns] }])
  );
  const out: SchemaStep[] = [];
  const pointsAt = (from: DataTableInput, target: string) =>
    from.columns.filter(
      c => c.type === 'relation' && c.table === target && from.name !== target
    );
  while (pending.size) {
    const pointedAt = new Set(
      [...pending.values()]
        .flatMap(t => relationTargets(t))
        .filter(n => pending.has(n))
    );
    let batch = [...pending.keys()].filter(n => !pointedAt.has(n)).sort();
    if (!batch.length) {
      // The API won't drop a table's last column, so a table can only be
      // freed when every table pointing at it keeps another column.
      const freeable = (target: string) =>
        [...pending.values()].every(table => {
          const dropping = pointsAt(table, target);
          return (
            dropping.length === 0 || table.columns.length > dropping.length
          );
        });
      const freed = [...pending.keys()].sort().find(freeable);
      if (!freed) {
        throw new SchemaFileError([
          `${[...pending.keys()].sort().join(', ')} point at each other through their only columns, so none of them can be dropped first. Add a column to one of them, or drop them in the dashboard one relation at a time.`
        ]);
      }
      for (const table of [...pending.values()].sort((a, b) =>
        a.name.localeCompare(b.name)
      )) {
        for (const column of pointsAt(table, freed)) {
          out.push({
            kind: 'dropColumn',
            table: table.name,
            column: column.name
          });
          table.columns = table.columns.filter(c => c !== column);
        }
      }
      batch = [freed];
    }
    for (const name of batch) {
      out.push({ kind: 'dropTable', table: name });
      pending.delete(name);
    }
  }
  return out;
};

export const diffSchema = (
  current: DataTableInput[],
  desired: DataTableInput[]
): SchemaPlan => {
  const currentByName = new Map(current.map(t => [t.name, t]));
  const desiredByName = new Map(desired.map(t => [t.name, t]));

  const created = desired.filter(t => !currentByName.has(t.name));
  const { creates, deferred } = orderCreates(
    created,
    new Set(currentByName.keys())
  );

  const steps: SchemaStep[] = creates.map(input => ({
    kind: 'createTable',
    table: input.name,
    input
  }));

  const additions: SchemaStep[] = [];
  const columnChanges: SchemaStep[] = [];
  const typeChanges: SchemaStep[] = [];
  const tableChanges: SchemaStep[] = [];
  const columnDrops: SchemaStep[] = [];

  for (const { table, input } of deferred) {
    additions.push({ kind: 'addColumn', table, column: input.name, input });
  }
  // A deferred display column is set once its column exists.
  for (const input of creates) {
    const original = desiredByName.get(input.name)!;
    if (
      original.displayColumn &&
      input.displayColumn === null &&
      original.displayColumn !== 'id'
    ) {
      tableChanges.push({
        kind: 'updateTable',
        table: input.name,
        patch: { displayColumn: original.displayColumn }
      });
    }
  }

  for (const wanted of desired) {
    const now = currentByName.get(wanted.name);
    if (!now) continue;
    const nowColumns = new Map(now.columns.map(c => [c.name, c]));
    const wantedNames = new Set(wanted.columns.map(c => c.name));

    for (const column of wanted.columns) {
      const before = nowColumns.get(column.name);
      if (!before) {
        additions.push({
          kind: 'addColumn',
          table: wanted.name,
          column: column.name,
          input: column
        });
        continue;
      }
      const a = normaliseColumn(before);
      const b = normaliseColumn(column);
      const patch: Record<string, unknown> = {};
      for (const key of COLUMN_KEYS) {
        if (same(a[key], b[key])) continue;
        // null puts a setting back to its default, and removes a default.
        patch[key] = b[key] ?? null;
      }
      // A relation that changes target keeps saying what a delete does.
      if ('table' in patch && b.onDelete && !('onDelete' in patch)) {
        patch.onDelete = b.onDelete;
      }
      // A new type is sent with what that type needs, and without what it
      // can't hold, so the API reads one consistent column.
      if ('type' in patch) {
        if (b.values) patch.values = b.values;
        if (b.table) {
          patch.table = b.table;
          patch.onDelete = b.onDelete;
        }
      }
      if (!Object.keys(patch).length) continue;
      const step: SchemaStep = {
        kind: 'updateColumn',
        table: wanted.name,
        column: column.name,
        patch,
        copies: COPY_KEYS.some(key => key in patch)
      };
      if ('type' in patch || ('table' in patch && a.table !== null)) {
        typeChanges.push(step);
      } else {
        columnChanges.push(step);
      }
    }

    for (const column of now.columns) {
      if (!wantedNames.has(column.name)) {
        columnDrops.push({
          kind: 'dropColumn',
          table: wanted.name,
          column: column.name
        });
      }
    }

    const a = normaliseTable(now);
    const b = normaliseTable(wanted);
    const patch: Record<string, unknown> = {};
    for (const key of TABLE_KEYS) {
      if (!same(a[key], b[key])) patch[key] = b[key];
    }
    if (Object.keys(patch).length) {
      tableChanges.push({ kind: 'updateTable', table: wanted.name, patch });
    }
  }

  const tableDrops = orderDrops(
    current.filter(t => !desiredByName.has(t.name))
  );

  // Additive first, so a push stopped at a destructive step has still done
  // everything that was safe; type changes before drops, since a drop is the
  // one step that can't be retried with a fixed value.
  steps.push(
    ...additions,
    ...columnChanges,
    ...tableChanges,
    ...typeChanges,
    ...columnDrops,
    ...tableDrops
  );
  return {
    steps,
    destructive: [...typeChanges, ...columnDrops, ...tableDrops]
  };
};

const describeValue = (value: unknown) =>
  value === null || value === undefined ? 'none' : JSON.stringify(value);

/** One line per step, for `diff` and for what `push` refuses. */
export const describeStep = (step: SchemaStep): string => {
  switch (step.kind) {
    case 'createTable':
      return `create table ${step.table} (${step.input.columns.map(c => c.name).join(', ')})`;
    case 'addColumn':
      return `add column ${step.table}.${step.column} ${step.input.type}${
        step.input.type === 'relation' && step.input.table
          ? ` → ${step.input.table}`
          : ''
      }`;
    case 'updateColumn':
      return `change ${step.table}.${step.column}: ${Object.entries(step.patch)
        .map(([key, value]) => `${key} ${describeValue(value)}`)
        .join(', ')}${step.copies ? ' (copies the table)' : ''}`;
    case 'updateTable':
      return `change table ${step.table}: ${Object.entries(step.patch)
        .map(([key, value]) => `${key} ${describeValue(value)}`)
        .join(', ')}`;
    case 'dropColumn':
      return `drop column ${step.table}.${step.column}`;
    case 'dropTable':
      return `drop table ${step.table}`;
  }
};
