import { readFile } from 'node:fs/promises';

import type { DataTable, DataTableCopy } from '@ganju/utils/data';

import { commandContext, type CommandContext } from '../../context.js';
import { parseJson, parseJsonOrLines } from '../../data/json.js';
import { DataApi } from '../../data/routes.js';
import { CliError } from '../../errors.js';
import { color, note, step, success, warn } from '../../output.js';
import { ask, confirm } from '../../prompt.js';

export { parseJsonOrLines };

/** Every flag a `ganju data` command reads. */
export interface DataOptions {
  name?: string;
  yes?: boolean;
  confirm?: string;
  at?: string;
  bookmark?: string;
  format?: string;
  out?: string;
  schema?: string;
  where?: string[];
  sort?: string;
  limit?: string;
  search?: string;
  include?: string;
  cursor?: string;
  all?: boolean;
  input?: string;
  inputFile?: string;
  version?: string;
  json?: boolean;
  replace?: boolean;
  wait?: boolean;
  decimalMark?: string;
  map?: string[];
  sheet?: string;
  clear?: boolean;
}

export interface Database {
  id: string;
  name: string;
  status: string;
  error: string | null;
  sizeBytes: number | null;
  deletedAt: string | null;
  deleteAfter: string | null;
  createdAt: string;
  timeZone?: string | null;
  tables?: { name: string; label: string | null; columns: number }[];
  copy?: DataTableCopy | null;
  indexAdvice?: IndexAdvice[];
}

// An index the daily job suggests adding, or flags as unused.
export interface IndexAdvice {
  id: string;
  table: string;
  column: string;
  kind: 'add' | 'unused';
  queries: number;
  avgRowsRead: number;
  avgRowsReturned: number;
  rowsWritten: number;
}

export interface DataContext extends CommandContext {
  data: DataApi;
}

export const dataContext = async (): Promise<DataContext> => {
  const context = await commandContext();
  return {
    ...context,
    data: new DataApi(context.api, `${context.artifactPath}/data`)
  };
};

export const getDatabase = async (data: DataApi): Promise<Database | null> =>
  (await data.request<{ database: Database | null }>('getDatabase')).database;

/** The database, or a readable refusal when the project has none. */
export const requireDatabase = async (data: DataApi): Promise<Database> => {
  const database = await getDatabase(data);
  if (!database) {
    throw new CliError('This project has no database', {
      hint: 'Run `ganju data create` to make one.'
    });
  }
  return database;
};

export const listTables = async (data: DataApi): Promise<DataTable[]> =>
  (await data.request<{ tables: DataTable[] }>('listTables')).tables;

export const findTable = (tables: DataTable[], name: string): DataTable => {
  const table = tables.find(t => t.name === name);
  if (!table) {
    throw new CliError(`There is no table "${name}"`, {
      hint: tables.length
        ? `Tables: ${tables.map(t => t.name).join(', ')}`
        : 'Run `ganju data table create` to make one.'
    });
  }
  return table;
};

const interactive = () => !!process.stdin.isTTY && !!process.stderr.isTTY;

/**
 * The gate in front of every command that removes or rewrites data.
 *
 * In a terminal, a missing `--yes` is asked for, and a missing `--confirm`
 * means typing the name. Without one, both have to be on the command line:
 * a script that forgot them is refused, never left waiting on a prompt
 * nobody will answer.
 */
export const confirmDestructive = async (
  options: Pick<DataOptions, 'yes' | 'confirm'>,
  what: string,
  typed?: { name: string; flag: string }
): Promise<void> => {
  if (typed) {
    let given = options.confirm;
    if (given === undefined) {
      if (!interactive()) {
        throw new CliError(`Refusing to ${what} without --confirm`, {
          hint: `Add --yes --confirm ${typed.name} (${typed.flag}).`
        });
      }
      given = await ask(`Type ${color.bold(typed.name)} to ${what}`);
    }
    if (given !== typed.name) {
      throw new CliError(`"${given}" is not ${typed.flag}`, {
        hint: `It has to be typed exactly: ${typed.name}`
      });
    }
  }
  if (options.yes) return;
  if (!interactive()) {
    throw new CliError(`Refusing to ${what} without --yes`, {
      hint: 'Nothing was changed. Add --yes to go ahead.'
    });
  }
  if (!(await confirm(`${what[0].toUpperCase()}${what.slice(1)}?`))) {
    throw new CliError('Stopped — nothing was changed', { exitCode: 1 });
  }
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const describeCopy = (copy: DataTableCopy) => {
  const percent = copy.rows ? Math.floor((copy.copied / copy.rows) * 100) : 0;
  return `${copy.table}: ${copy.copied.toLocaleString('en')} of ${copy.rows.toLocaleString('en')} rows (${percent}%)`;
};

/**
 * Waits out a table copy running in the background (a type change or a
 * relation drop on a large table), printing how far it got.
 *
 * Until it ends, that table refuses schema changes and the writes that reach
 * it, so the next command would only be refused. `--no-wait` hands the
 * terminal back instead; `ganju data copy wait` picks it up again.
 */
export const waitForCopy = async (
  data: DataApi,
  copy: DataTableCopy | null | undefined,
  options: { wait?: boolean } = {}
): Promise<void> => {
  if (!copy) return;
  if (options.wait === false) {
    note(`${color.gray('›')} copying ${describeCopy(copy)} in the background`);
    note(color.gray('  ganju data copy wait   to follow it'));
    return;
  }
  const live = !!process.stderr.isTTY;
  let last = '';
  let current: DataTableCopy | null = copy;
  for (;;) {
    if (current?.status === 'failed') {
      if (live) process.stderr.write('\n');
      throw new CliError(
        `The copy of ${current.table} failed: ${current.error ?? 'no reason given'}`,
        {
          hint: 'The table is as it was. `ganju data copy dismiss` clears this, so the column can be changed again.'
        }
      );
    }
    if (!current) break;
    const line = `copying ${describeCopy(current)}`;
    if (live) process.stderr.write(`\r${color.gray('›')} ${line}\u001b[K`);
    else if (line !== last) step(line);
    last = line;
    await sleep(2000);
    current = (await getDatabase(data))?.copy ?? null;
  }
  if (live) process.stderr.write('\n');
  success('copy finished');
};

/** A value as one table cell. */
export const formatCell = (value: unknown, max = 60): string => {
  if (value === null || value === undefined) return color.gray('—');
  let text: string;
  if (typeof value === 'object' && !Array.isArray(value) && 'id' in value) {
    // A relation read with `include`: its display value, then the id.
    const { id, ...rest } = value as Record<string, unknown>;
    const label = Object.values(rest).find(v => typeof v === 'string');
    text = label ? `${label} (#${id})` : `#${id}`;
  } else if (typeof value === 'object' && !Array.isArray(value) && 'uri' in value) {
    // A file column: the item's title, or that it's gone.
    const file = value as { uri: string; title?: string; missing?: boolean };
    text = file.missing ? `${file.uri} (missing)` : (file.title ?? file.uri);
  } else if (typeof value === 'object') text = JSON.stringify(value);
  else text = String(value);
  text = text.replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/**
 * `--input '<json>'` or `--input-file <path>`. A `.jsonl` file (or any file
 * whose lines are each an object) is a list, one line per item.
 */
export const readInput = async (
  options: Pick<DataOptions, 'input' | 'inputFile'>,
  example: string
): Promise<unknown> => {
  if (options.input !== undefined) return parseJson(options.input, '--input');
  if (options.inputFile !== undefined) {
    const text = await readFile(options.inputFile, 'utf8').catch(() => {
      throw new CliError(`Cannot read ${options.inputFile}`);
    });
    return parseJsonOrLines(text, options.inputFile);
  }
  throw new CliError('Nothing to send', { hint: example });
};

export const parseRowId = (
  value: string | undefined,
  usage: string
): number => {
  const id = Number(value);
  if (!value || !Number.isSafeInteger(id) || id < 1) {
    throw new CliError(value ? `"${value}" is not a row id` : 'Which row?', {
      hint: usage
    });
  }
  return id;
};

export const parseVersion = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new CliError(`--version takes the row's version, a whole number`, {
      hint: `Got "${value}". \`ganju data get <table> <id>\` shows it.`
    });
  }
  return version;
};

/** How to undo a change that answered with a bookmark. */
export const noteUndo = (bookmark: string | null | undefined, what: string) => {
  if (!bookmark) return;
  note(
    color.gray(
      `  to undo ${what}: ganju data restore --bookmark ${bookmark} --yes`
    )
  );
  warn(
    'restoring puts the whole database back to that moment, not only this table'
  );
};
