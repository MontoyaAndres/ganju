import { readFile } from 'node:fs/promises';

import type {
  DataColumnInput,
  DataTable,
  DataTableCopy,
  DataTableInput
} from '@ganju/utils/data';

import { CliError } from '../../errors.js';
import {
  color,
  json as printJson,
  note,
  say,
  success,
  table
} from '../../output.js';
import {
  confirmDestructive,
  dataContext,
  findTable,
  listTables,
  noteUndo,
  waitForCopy,
  type DataOptions
} from './shared.js';

type ColumnAnswer = {
  table: DataTable;
  bookmark?: string | null;
  copy?: DataTableCopy | null;
};

const describeColumn = (column: DataTable['columns'][number]) => {
  const traits = [
    column.required && 'required',
    column.unique && 'unique',
    column.filterable && 'filterable',
    column.searchable && 'searchable',
    column.personal && 'personal',
    column.min !== null && `min ${column.min}`,
    column.default !== undefined && `default ${JSON.stringify(column.default)}`
  ].filter(Boolean);
  const type =
    column.type === 'relation'
      ? `relation → ${column.table} (${column.onDelete})`
      : column.type === 'enum'
        ? `enum: ${column.values?.join(', ')}`
        : column.type;
  return [column.name, type, color.gray(traits.join(', '))];
};

export const tables = async (options: DataOptions): Promise<void> => {
  const { data } = await dataContext();
  const list = await listTables(data);
  if (options.json) {
    printJson(list);
    return;
  }
  if (!list.length) {
    note('No tables yet');
    note(color.gray('  ganju data table create <name> --schema <file>'));
    return;
  }
  for (const [index, t] of list.entries()) {
    if (index) say();
    say(
      `${color.bold(t.name)}${t.label ? color.gray(` ${t.label}`) : ''}${color.gray(
        `  display ${t.displayColumn ?? 'id'} · assistant ${t.access}${t.customerScoped ? ' · per customer' : ''}`
      )}`
    );
    if (t.source) {
      const last = t.sync
        ? t.sync.status === 'ok'
          ? `last synced ${t.sync.at}`
          : color.red(`last sync refused (${t.sync.at}): ${t.sync.error}`)
        : 'not synced yet';
      say(
        color.gray(
          `  synced from ${t.source.title ?? t.source.uri}${t.source.sheet ? `, sheet ${t.source.sheet}` : ''} by ${t.source.key} · rows read-only · `
        ) + (t.sync?.status === 'failed' ? last : color.gray(last))
      );
    }
    table(t.columns.map(c => ['  ' + c.name, ...describeColumn(c).slice(1)]));
  }
};

// Reads the table's sheet again now; the sync itself runs in the background.
const syncTable = async (name: string | undefined, options: DataOptions) => {
  if (!name)
    throw new CliError('Which table?', {
      hint: 'ganju data table sync <name>'
    });
  const { data } = await dataContext();
  const found = findTable(await listTables(data), name);
  if (!found.source) {
    throw new CliError(`${name} isn't synced from a sheet`, {
      hint: 'Give it a "source": { "uri", "key" } in ganju.data.json, or set one in its settings on the Data page.'
    });
  }
  const result = await data.request<{ queued: true }>('syncTable', {
    params: { table: name }
  });
  if (options.json) {
    printJson(result);
    return;
  }
  success(
    `queued a sync of ${color.bold(name)} from ${found.source.title ?? found.source.uri}`
  );
  note(color.gray('  `ganju data tables` shows how it went'));
};

/**
 * A table's definition from a file: the table itself, a `ganju.data.json`
 * (the table of that name is picked), or a bare list of columns.
 */
const tableFromFile = async (
  name: string,
  path: string
): Promise<DataTableInput> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new CliError(`Cannot read ${path} as JSON`, {
      hint: error instanceof Error ? error.message : undefined
    });
  }
  if (Array.isArray(parsed))
    return { name, columns: parsed as DataColumnInput[] };
  if (parsed && typeof parsed === 'object') {
    const object = parsed as Record<string, unknown>;
    if (Array.isArray(object.tables)) {
      const found = (object.tables as DataTableInput[]).find(
        t => t?.name === name
      );
      if (!found) {
        throw new CliError(`${path} has no table "${name}"`, {
          hint: `It has: ${(object.tables as DataTableInput[]).map(t => t?.name).join(', ') || 'none'}`
        });
      }
      return found;
    }
    if (Array.isArray(object.columns))
      return { ...(object as unknown as DataTableInput), name };
  }
  throw new CliError(`${path} is not a table definition`, {
    hint: 'It holds { "columns": [ ... ] }, a list of columns, or a ganju.data.json.'
  });
};

const createTable = async (name: string | undefined, options: DataOptions) => {
  if (!name || !options.schema) {
    throw new CliError(name ? 'Which columns?' : 'Which table?', {
      hint: 'ganju data table create <name> --schema <file>'
    });
  }
  const input = await tableFromFile(name, options.schema);
  const { data } = await dataContext();
  const created = await data.request<{ table: DataTable }>('createTable', {
    json: input
  });
  if (options.json) {
    printJson(created.table);
    return;
  }
  success(
    `created ${color.bold(created.table.name)} with ${created.table.columns.length} column${created.table.columns.length === 1 ? '' : 's'}`
  );
};

const removeTable = async (name: string | undefined, options: DataOptions) => {
  if (!name)
    throw new CliError('Which table?', {
      hint: 'ganju data table rm <name> --yes --confirm <name>'
    });
  const { data } = await dataContext();
  findTable(await listTables(data), name);
  note(`Dropping ${color.bold(name)} removes the table and all its rows.`);
  await confirmDestructive(options, `drop ${name}`, {
    name,
    flag: "the table's name"
  });
  const result = await data.request<{ dropped: string; bookmark: string }>(
    'dropTable',
    {
      params: { table: name },
      json: { confirmName: name }
    }
  );
  if (options.json) {
    printJson(result);
    return;
  }
  success(`dropped ${color.bold(name)}`);
  noteUndo(result.bookmark, 'the drop');
};

const renameTable = async (
  from: string | undefined,
  to: string | undefined,
  options: DataOptions
) => {
  if (!from || !to)
    throw new CliError('Rename which table, to what?', {
      hint: 'ganju data table rename <name> <new-name>'
    });
  const { data } = await dataContext();
  const result = await data.request<{ table: DataTable }>('updateTable', {
    params: { table: from },
    json: { name: to }
  });
  if (options.json) {
    printJson(result.table);
    return;
  }
  success(`renamed ${from} to ${color.bold(result.table.name)}`);
};

export const tableCommand = async (
  args: string[],
  options: DataOptions
): Promise<void> => {
  const [action, ...rest] = args;
  switch (action) {
    case 'create':
    case 'new':
      return createTable(rest[0], options);
    case 'rm':
    case 'remove':
    case 'drop':
      return removeTable(rest[0], options);
    case 'rename':
      return renameTable(rest[0], rest[1], options);
    case 'sync':
      return syncTable(rest[0], options);
    default:
      throw new CliError(
        action ? `Unknown action "table ${action}"` : 'Which table action?',
        {
          hint: 'ganju data table create|rm|rename|sync … — `ganju data` lists them'
        }
      );
  }
};

const objectInput = (raw: string | undefined): Record<string, unknown> => {
  if (raw === undefined) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CliError('--input is not valid JSON', { hint: `Got ${raw}` });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CliError('--input is an object here, e.g. {"min":0}');
  }
  return parsed as Record<string, unknown>;
};

const afterColumnChange = async (
  data: Awaited<ReturnType<typeof dataContext>>['data'],
  answer: ColumnAnswer,
  options: DataOptions,
  what: string
) => {
  await waitForCopy(data, answer.copy, { wait: options.wait });
  if (options.json) {
    printJson(answer);
    return;
  }
  success(what);
  noteUndo(answer.bookmark, 'it');
};

export const columnCommand = async (
  args: string[],
  options: DataOptions
): Promise<void> => {
  const [action, tableName, column, extra] = args;
  const usage =
    'ganju data column add <table> <name> <type> [--input \'{"required":true}\']\n  ganju data column rename <table> <name> <new-name>\n  ganju data column change <table> <name> --input \'{"type":"decimal"}\'\n  ganju data column rm <table> <name> --yes';
  if (!action || !tableName || !column) {
    throw new CliError(
      action
        ? `column ${action} needs a table and a column`
        : 'Which column action?',
      {
        hint: usage
      }
    );
  }
  const { data } = await dataContext();

  switch (action) {
    case 'add':
    case 'new': {
      const input = {
        name: column,
        ...(extra ? { type: extra } : {}),
        ...objectInput(options.input)
      };
      if (!input.type) {
        throw new CliError(`What type is ${column}?`, {
          hint: 'e.g. ganju data column add menu price integer — types: text, long_text, integer, decimal, boolean, date, datetime, enum, json, email, url, phone, relation, file'
        });
      }
      const answer = await data.request<{ table: DataTable }>('addColumn', {
        params: { table: tableName },
        json: input
      });
      if (options.json) {
        printJson(answer.table);
        return;
      }
      success(`added ${tableName}.${color.bold(column)}`);
      return;
    }
    case 'rename': {
      if (!extra) throw new CliError('Rename it to what?', { hint: usage });
      const answer = await data.request<ColumnAnswer>('updateColumn', {
        params: { table: tableName, column },
        json: { name: extra }
      });
      return afterColumnChange(
        data,
        answer,
        options,
        `renamed ${tableName}.${column} to ${color.bold(extra)}`
      );
    }
    case 'change':
    case 'set': {
      const patch = objectInput(options.input);
      if (!Object.keys(patch).length) {
        throw new CliError('What should change?', { hint: usage });
      }
      // A new type or target rewrites every value in the column.
      if ('type' in patch || 'table' in patch) {
        note(
          `Changing ${tableName}.${column}'s ${'type' in patch ? 'type' : 'target'} copies the table and converts every value.`
        );
        await confirmDestructive(options, `change ${tableName}.${column}`);
      }
      const answer = await data.request<ColumnAnswer>('updateColumn', {
        params: { table: tableName, column },
        json: patch
      });
      return afterColumnChange(
        data,
        answer,
        options,
        `changed ${tableName}.${color.bold(column)}`
      );
    }
    case 'rm':
    case 'remove':
    case 'drop': {
      findTable(await listTables(data), tableName);
      note(`Dropping ${tableName}.${column} removes its value from every row.`);
      await confirmDestructive(options, `drop ${tableName}.${column}`);
      const answer = await data.request<ColumnAnswer>('dropColumn', {
        params: { table: tableName, column }
      });
      return afterColumnChange(
        data,
        answer,
        options,
        `dropped ${tableName}.${color.bold(column)}`
      );
    }
    default:
      throw new CliError(`Unknown action "column ${action}"`, { hint: usage });
  }
};
