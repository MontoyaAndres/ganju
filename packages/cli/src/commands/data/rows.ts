import type { DataDeleteImpact, DataTable } from '@ganju/utils/data';

import type { DataApi } from '../../data/routes.js';
import { parseWhere } from '../../data/where.js';
import { CliError, isApiError } from '../../errors.js';
import {
  color,
  formatWhen,
  json as printJson,
  note,
  say,
  step,
  success,
  table,
  warn
} from '../../output.js';
import {
  confirmDestructive,
  dataContext,
  findTable,
  formatCell,
  listTables,
  parseRowId,
  parseVersion,
  readInput,
  type DataOptions
} from './shared.js';

type Row = Record<string, unknown> & { id: number; version?: number };
interface RowPage {
  table: string;
  rows: Row[];
  total?: number;
  nextCursor?: string;
}

// The API's own limits: rows per insert, rows per all-or-nothing write.
const INSERT_BATCH = 500;
const ROWS_PER_WRITE = 5000;

const parseLimit = (value: string | undefined, fallback: number) => {
  if (value === undefined) return fallback;
  const limit = Number.parseInt(value, 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new CliError('--limit is 1 to 500', {
      hint: `Got "${value}". --all reads every page.`
    });
  }
  return limit;
};

const rowQuery = (options: DataOptions, limit: number, cursor?: string) => {
  const where = parseWhere(options.where);
  return {
    where: where ? JSON.stringify(where) : undefined,
    sort: options.sort,
    q: options.search,
    include: options.include,
    limit,
    cursor
  };
};

const tableOrRefuse = async (
  data: DataApi,
  name: string | undefined,
  usage: string
): Promise<DataTable> => {
  if (!name) throw new CliError('Which table?', { hint: usage });
  return findTable(await listTables(data), name);
};

const printRows = (schema: DataTable, rows: Row[]) => {
  const columns = ['id', ...schema.columns.map(c => c.name)];
  table([
    columns.map(c => color.gray(c.toUpperCase())),
    ...rows.map(row => columns.map(c => formatCell(row[c])))
  ]);
};

export const rows = async (
  name: string | undefined,
  options: DataOptions
): Promise<void> => {
  const usage =
    "ganju data rows <table> [--where 'status=open'] [--sort -created_at] [--limit 50] [--search pizza]";
  const { data } = await dataContext();
  const schema = await tableOrRefuse(data, name, usage);
  const limit = parseLimit(options.limit, options.all ? 500 : 20);

  if (options.all) {
    const all: Row[] = [];
    let cursor = options.cursor;
    let total: number | undefined;
    do {
      const page = await data.request<RowPage>('listRows', {
        params: { table: schema.name },
        query: rowQuery(options, limit, cursor)
      });
      all.push(...page.rows);
      total ??= page.total;
      cursor = page.nextCursor;
      if (cursor && !options.json)
        step(
          `read ${all.length.toLocaleString('en')}${total ? ` of ${total.toLocaleString('en')}` : ''}`
        );
    } while (cursor);
    if (options.json) {
      printJson(all);
      return;
    }
    if (!all.length) {
      note('No rows match');
      return;
    }
    printRows(schema, all);
    note(color.gray(`\n  ${all.length} row${all.length === 1 ? '' : 's'}`));
    return;
  }

  const page = await data.request<RowPage>('listRows', {
    params: { table: schema.name },
    query: rowQuery(options, limit, options.cursor)
  });
  if (options.json) {
    printJson(page);
    return;
  }
  if (!page.rows.length) {
    note('No rows match');
    return;
  }
  printRows(schema, page.rows);
  const shown =
    page.total !== undefined
      ? `${page.rows.length} of ${page.total}`
      : `${page.rows.length}`;
  note(color.gray(`\n  ${shown} row${page.total === 1 ? '' : 's'}`));
  if (page.nextCursor)
    note(color.gray(`  more: --cursor ${page.nextCursor}   (or --all)`));
};

const printRow = (row: Row) => {
  table(
    Object.entries(row).map(([key, value]) => [
      color.gray(key),
      formatCell(value, 200)
    ])
  );
};

export const get = async (
  name: string | undefined,
  id: string | undefined,
  options: DataOptions
): Promise<void> => {
  const usage = 'ganju data get <table> <id>';
  if (!name) throw new CliError('Which table?', { hint: usage });
  const rowId = parseRowId(id, usage);
  const { data } = await dataContext();
  const { row } = await data.request<{ row: Row }>('getRow', {
    params: { table: name, id: rowId },
    query: { include: options.include }
  });
  if (options.json) {
    printJson(row);
    return;
  }
  printRow(row);
};

const asRows = (input: unknown): Record<string, unknown>[] => {
  const list = Array.isArray(input) ? input : [input];
  for (const [index, row] of list.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new CliError(`Row ${index + 1} is not an object`, {
        hint: 'Each row is {"column": value, ...}.'
      });
    }
  }
  return list as Record<string, unknown>[];
};

const chunk = <T>(list: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

const insertOperations = (table: string, list: Record<string, unknown>[]) =>
  chunk(list, INSERT_BATCH).map(rows => ({ op: 'insert', table, rows }));

export const insert = async (
  name: string | undefined,
  options: DataOptions
): Promise<void> => {
  const usage =
    'ganju data insert <table> --input \'{"name":"Margherita"}\' | --input-file rows.jsonl';
  if (!name) throw new CliError('Which table?', { hint: usage });
  const list = asRows(await readInput(options, usage));
  if (!list.length) throw new CliError('No rows to insert', { hint: usage });
  const { data } = await dataContext();

  let ids: number[] = [];
  if (list.length === 1) {
    ({ ids } = await data.request<{ ids: number[] }>('createRows', {
      params: { table: name },
      json: { values: list[0] }
    }));
  } else if (list.length <= INSERT_BATCH) {
    ({ ids } = await data.request<{ ids: number[] }>('createRows', {
      params: { table: name },
      json: { rows: list }
    }));
  } else if (list.length <= ROWS_PER_WRITE) {
    // Still one transaction: every row goes in, or none does.
    const { results } = await data.request<{ results: { ids?: number[] }[] }>(
      'write',
      {
        json: {
          operations: insertOperations(name, list)
        }
      }
    );
    ids = results.flatMap(r => r.ids ?? []);
  } else {
    // Past one write's limit, each write of 5,000 commits on its own.
    // Stopping at the first refusal says exactly what is in.
    warn(
      `${list.length.toLocaleString('en')} rows is more than one write holds; inserting ${ROWS_PER_WRITE.toLocaleString('en')} at a time, each saved as it goes`
    );
    for (const [index, part] of chunk(list, ROWS_PER_WRITE).entries()) {
      try {
        const { results } = await data.request<{
          results: { ids?: number[] }[];
        }>('write', { json: { operations: insertOperations(name, part) } });
        ids.push(...results.flatMap(r => r.ids ?? []));
        step(
          `${ids.length.toLocaleString('en')} of ${list.length.toLocaleString('en')}`
        );
      } catch (error) {
        const from = index * ROWS_PER_WRITE + 1;
        note(
          color.gray(
            `  ${ids.length ? `rows 1–${ids.length} were inserted; ` : ''}rows ${from}–${from + part.length - 1} and after were not`
          )
        );
        throw error;
      }
    }
  }
  if (options.json) {
    printJson({ ids });
    return;
  }
  success(
    `inserted ${ids.length} row${ids.length === 1 ? '' : 's'} into ${color.bold(name)}`
  );
  if (ids.length <= 20)
    note(color.gray(`  id${ids.length === 1 ? '' : 's'} ${ids.join(', ')}`));
};

// A stale `--version`: say who changed the row, and show it as it is now.
const explainConflict = (error: unknown): never => {
  if (isApiError(error) && error.status === 409 && error.details?.current) {
    const current = error.details.current as Row;
    const by = error.details.updatedBy;
    warn(
      `the row changed since that version${typeof by === 'string' ? ` (by ${by})` : ''}; it is now version ${current.version}:`
    );
    printRow(current);
    throw new CliError('Nothing was changed', {
      hint: `Check the values above, then run it again with --version ${current.version}.`
    });
  }
  throw error;
};

export const update = async (
  name: string | undefined,
  id: string | undefined,
  options: DataOptions
): Promise<void> => {
  const usage =
    'ganju data update <table> <id> --input \'{"price":29000}\' [--version 3]';
  if (!name) throw new CliError('Which table?', { hint: usage });
  const rowId = parseRowId(id, usage);
  const set = await readInput(options, usage);
  if (!set || typeof set !== 'object' || Array.isArray(set)) {
    throw new CliError('--input is the values to set, as an object', {
      hint: usage
    });
  }
  const version = parseVersion(options.version);
  const { data } = await dataContext();
  const { row } = await data
    .request<{ row: Row }>('updateRow', {
      params: { table: name, id: rowId },
      json: { set, ...(version ? { version } : {}) }
    })
    .catch(explainConflict);
  if (options.json) {
    printJson(row);
    return;
  }
  success(`updated ${name} ${rowId}, now version ${row.version}`);
};

const printImpact = (impact: DataDeleteImpact) => {
  for (const effect of impact.effects) {
    // Past the preview's ceiling every count is a lower bound.
    const count = `${effect.rows}${impact.truncated ? '+' : ''} row${effect.rows === 1 ? '' : 's'}`;
    const what =
      effect.onDelete === 'cascade'
        ? color.red(`deletes ${count}`)
        : effect.onDelete === 'set_null'
          ? color.yellow(`clears ${effect.column} on ${count}`)
          : color.red(`${count} point here and refuse it`);
    note(`  ${effect.table}.${effect.column} (${effect.onDelete}): ${what}`);
  }
};

/** What a delete would do elsewhere, printed; refuses when a restrict blocks it. */
export const previewDelete = async (
  data: DataApi,
  table: string,
  ids?: number[]
) => {
  const impact = await data.request<DataDeleteImpact>('deletePreview', {
    params: { table },
    json: ids ? { ids } : {}
  });
  if (impact.effects.length) {
    note(
      `Deleting ${ids ? `${ids.length === 1 ? 'this row' : `these ${ids.length} rows`}` : `every row of ${table}`} reaches:`
    );
    printImpact(impact);
  }
  if (impact.blocked) {
    throw new CliError(
      `Rows elsewhere still point at ${ids?.length === 1 ? 'this row' : 'these rows'}, and their relation refuses the delete`,
      {
        hint: 'Delete or change those rows first (the restrict ones above).'
      }
    );
  }
  return impact;
};

export const remove = async (
  name: string | undefined,
  idArgs: string[],
  options: DataOptions
): Promise<void> => {
  const usage = 'ganju data delete <table> <id> [<id>...] [--yes]';
  if (!name) throw new CliError('Which table?', { hint: usage });
  if (!idArgs.length) throw new CliError('Which row?', { hint: usage });
  const ids = [...new Set(idArgs.map(id => parseRowId(id, usage)))];
  if (ids.length > 50) {
    throw new CliError('Up to 50 rows at a time', {
      hint: 'For more, use --where with `ganju data write`: {"operations":[{"op":"delete","table":"...","where":{...}}]}'
    });
  }
  const version = parseVersion(options.version);
  if (version && ids.length > 1)
    throw new CliError('--version goes with one row');
  const { data } = await dataContext();
  await previewDelete(data, name, ids);
  await confirmDestructive(
    options,
    `delete ${ids.length === 1 ? `${name} ${ids[0]}` : `${ids.length} rows from ${name}`}`
  );

  if (ids.length === 1) {
    await data
      .request('deleteRow', {
        params: { table: name, id: ids[0] },
        json: version ? { version } : {}
      })
      .catch(explainConflict);
  } else {
    // Together or not at all, so a refusal halfway leaves every row in place.
    await data.request('write', {
      json: { operations: ids.map(id => ({ op: 'delete', table: name, id })) }
    });
  }
  if (options.json) {
    printJson({ deleted: ids });
    return;
  }
  success(
    `deleted ${ids.length === 1 ? `${name} ${ids[0]}` : `${ids.length} rows from ${name}`}`
  );
};

interface HistoryEntry {
  op: string;
  actor: string;
  at: string;
  changes: Record<string, [unknown, unknown]>;
}

export const history = async (
  name: string | undefined,
  id: string | undefined,
  options: DataOptions
): Promise<void> => {
  const usage = 'ganju data history <table> <id>';
  if (!name) throw new CliError('Which table?', { hint: usage });
  const rowId = parseRowId(id, usage);
  const { data } = await dataContext();
  const result = await data.request<{
    entries: HistoryEntry[];
    nextCursor?: number;
  }>('rowHistory', {
    params: { table: name, id: rowId },
    query: {
      limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
      cursor: options.cursor
    }
  });
  if (options.json) {
    printJson(result);
    return;
  }
  if (!result.entries.length) {
    note(
      'No history for this row (kept 90 days, when the table keeps history)'
    );
    return;
  }
  table([
    [
      color.gray('WHEN'),
      color.gray('OP'),
      color.gray('BY'),
      color.gray('CHANGES')
    ],
    ...result.entries.map(entry => [
      formatWhen(entry.at),
      entry.op,
      entry.actor,
      Object.entries(entry.changes)
        .map(
          ([key, [before, after]]) =>
            `${key}: ${formatCell(before, 30)} → ${formatCell(after, 30)}`
        )
        .join('; ')
    ])
  ]);
  if (result.nextCursor)
    note(color.gray(`\n  older: --cursor ${result.nextCursor}`));
};

export const write = async (options: DataOptions): Promise<void> => {
  const usage =
    'ganju data write --input-file ops.json   ({"operations":[{"op":"insert","table":"orders","values":{...}}, ...]})';
  const input = await readInput(options, usage);
  const operations = Array.isArray(input)
    ? input
    : (input as { operations?: unknown } | null)?.operations;
  if (!Array.isArray(operations) || !operations.length) {
    throw new CliError('Nothing to write', { hint: usage });
  }
  const { data } = await dataContext();
  const result = await data.request<{ results: unknown[] }>('write', {
    json: { operations }
  });
  if (options.json) {
    printJson(result);
    return;
  }
  success(
    `applied ${operations.length} operation${operations.length === 1 ? '' : 's'}, all together`
  );
  say(JSON.stringify(result.results));
};
