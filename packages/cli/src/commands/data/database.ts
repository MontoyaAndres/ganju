import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { CliError, isApiError } from '../../errors.js';
import {
  color,
  formatBytes,
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
  getDatabase,
  noteUndo,
  requireDatabase,
  waitForCopy,
  type DataOptions,
  type Database
} from './shared.js';

const printDatabase = (database: Database) => {
  const rows: string[][] = [
    [color.gray('name'), database.name],
    [color.gray('status'), database.status],
    [
      color.gray('size'),
      database.sizeBytes === null
        ? color.gray('—')
        : formatBytes(database.sizeBytes)
    ],
    [color.gray('created'), formatWhen(database.createdAt)]
  ];
  if (database.status === 'READY') {
    rows.push([
      color.gray('time zone'),
      database.timeZone ?? color.gray('UTC')
    ]);
  }
  if (database.deleteAfter) {
    rows.push([
      color.gray('deleted'),
      `${formatWhen(database.deletedAt ?? '')}, gone for good ${formatWhen(database.deleteAfter)}`
    ]);
  }
  if (database.error)
    rows.push([color.gray('error'), color.red(database.error)]);
  table(rows);
};

/**
 * `ganju data time-zone [<zone> | --clear]`: the zone datetimes come back in
 * for the assistant, functions and anyone who sends none.
 */
export const timeZone = async (
  zone: string | undefined,
  options: DataOptions
): Promise<void> => {
  const { data } = await dataContext();
  if (zone === undefined && !options.clear) {
    const database = await requireDatabase(data);
    say(database.timeZone ?? 'UTC');
    return;
  }
  const { database } = await data.request<{ database: Database }>(
    'updateDatabase',
    { json: { timeZone: options.clear ? null : zone } }
  );
  success(`Datetimes come back in ${database.timeZone ?? 'UTC'}`);
};

export const create = async (options: DataOptions): Promise<void> => {
  const { data } = await dataContext();
  if (options.replace) {
    await confirmDestructive(
      options,
      'give up restoring the deleted database and start a new one'
    );
  }
  const { database } = await data.request<{ database: Database }>('create', {
    json: {
      ...(options.name ? { name: options.name } : {}),
      ...(options.replace ? { replaceDeleted: true } : {})
    }
  });
  if (options.json) {
    printJson(database);
    return;
  }
  success(
    `database ${color.bold(database.name)} is ${database.status.toLowerCase()}`
  );
  note(
    color.gray(
      '  next: ganju data table create <name> --schema <file>, or ganju data schema push'
    )
  );
};

export const info = async (options: DataOptions): Promise<void> => {
  const { data } = await dataContext();
  const database = await getDatabase(data);
  if (options.json) {
    printJson(database);
    return;
  }
  if (!database) {
    note('This project has no database');
    note(color.gray('  ganju data create'));
    return;
  }
  printDatabase(database);
  if (database.tables?.length) {
    say();
    table([
      [color.gray('TABLE'), color.gray('COLUMNS'), color.gray('LABEL')],
      ...database.tables.map(t => [t.name, String(t.columns), t.label ?? ''])
    ]);
  } else if (database.status === 'READY') {
    note(color.gray('\n  no tables yet'));
  }
  if (database.indexAdvice?.length) {
    say();
    say(color.bold('Index suggestions'));
    for (const advice of database.indexAdvice) {
      const n = (value: number) => value.toLocaleString('en');
      say(
        advice.kind === 'unused'
          ? `  ${advice.table}.${advice.column}: indexed, but no query used it in 30 days (${n(advice.rowsWritten)} rows written)`
          : `  ${advice.table}.${advice.column}: ${n(advice.queries)} queries this week, each reading ~${n(advice.avgRowsRead)} rows to return ${n(advice.avgRowsReturned)}`
      );
      note(
        color.gray(
          advice.kind === 'unused'
            ? `    ganju data index dismiss ${advice.id}`
            : `    ganju data index add ${advice.id}   (or dismiss)`
        )
      );
    }
  }
  if (database.copy) {
    say();
    const copy = database.copy;
    if (copy.status === 'failed') {
      warn(`copying ${copy.table} failed: ${copy.error ?? 'no reason given'}`);
      note(color.gray('  ganju data copy dismiss'));
    } else {
      note(
        `${color.gray('›')} copying ${copy.table}: ${copy.copied.toLocaleString('en')} of ${copy.rows.toLocaleString('en')} rows`
      );
      note(color.gray('  ganju data copy wait'));
    }
  }
  if (database.deleteAfter) {
    note(
      color.gray(
        `\n  ganju data restore   brings it back, until ${formatWhen(database.deleteAfter)}`
      )
    );
  }
};

/**
 * `ganju data index add|dismiss <id>`: act on a suggestion `ganju data info`
 * lists. Adding marks the column filterable, which indexes it; a dismissed one
 * comes back if its numbers double.
 */
export const indexAdvice = async (
  action: string | undefined,
  id: string | undefined
): Promise<void> => {
  if ((action !== 'add' && action !== 'dismiss') || !id) {
    throw new CliError('Usage: ganju data index add|dismiss <suggestion id>', {
      hint: '`ganju data info` lists the open suggestions with their ids.'
    });
  }
  const { data } = await dataContext();
  if (action === 'add') {
    await data.request('applyIndexAdvice', { params: { adviceId: id } });
    success('Index added; the column is now filterable');
    return;
  }
  await data.request('dismissIndexAdvice', { params: { adviceId: id } });
  success('Dismissed; it comes back if the numbers double');
};

export const drop = async (options: DataOptions): Promise<void> => {
  const { data } = await dataContext();
  const database = await requireDatabase(data);
  if (database.status !== 'READY') {
    throw new CliError(
      `The database is ${database.status.toLowerCase()}, not ready`,
      {
        hint: database.deleteAfter
          ? 'It is already deleted; `ganju data restore` brings it back.'
          : undefined
      }
    );
  }
  note(
    `Deleting ${color.bold(database.name)} removes every table and every row, and the tools that use them stop working.`
  );
  await confirmDestructive(options, 'delete the database', {
    name: database.name,
    flag: "the database's name"
  });
  const { database: deleted } = await data.request<{ database: Database }>(
    'remove',
    {
      json: { confirmName: database.name }
    }
  );
  if (options.json) {
    printJson(deleted);
    return;
  }
  success(`deleted ${color.bold(deleted.name)}`);
  if (deleted.deleteAfter) {
    note(
      color.gray(
        `  ganju data restore   brings it back, until ${formatWhen(deleted.deleteAfter)}`
      )
    );
  }
};

const ISO_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

export const restore = async (options: DataOptions): Promise<void> => {
  const { data } = await dataContext();

  if (options.at !== undefined && options.bookmark !== undefined) {
    throw new CliError(
      '--at and --bookmark both say where to restore to; pass one'
    );
  }

  // A delete undone: nothing is replaced, so nothing to confirm.
  if (options.at === undefined && options.bookmark === undefined) {
    const { database } = await data.request<{ database: Database }>('restore');
    if (options.json) {
      printJson(database);
      return;
    }
    success(`restored ${color.bold(database.name)}`);
    return;
  }

  let target: Record<string, unknown>;
  let what: string;
  if (options.at !== undefined) {
    // An offset is required, so "10:00" can't mean the API's zone instead of
    // the reader's.
    if (!ISO_TIME.test(options.at) || Number.isNaN(Date.parse(options.at))) {
      throw new CliError(`--at takes an ISO time with its offset`, {
        hint: `e.g. --at 2026-10-30T09:15:00-05:00, or ...Z for UTC. Got "${options.at}".`
      });
    }
    target = { timestamp: new Date(options.at).toISOString() };
    what = `restore the database to ${formatWhen(options.at)} UTC`;
  } else {
    target = { bookmark: options.bookmark };
    what = 'restore the database to that bookmark';
  }
  note('Everything written after that moment is replaced, in every table.');
  await confirmDestructive(options, what);

  const result = await data.request<{ bookmark: string; undoBookmark: string }>(
    'restorePoint',
    { json: target }
  );
  if (options.json) {
    printJson(result);
    return;
  }
  success('restored');
  noteUndo(result.undoBookmark, 'this restore');
};

export const checkpoint = async (options: DataOptions): Promise<void> => {
  const { data } = await dataContext();
  const result = await data.request<{ bookmark: string }>('checkpoint');
  if (options.json) {
    printJson(result);
    return;
  }
  // Alone on stdout, so `B=$(ganju data checkpoint)` works.
  say(result.bookmark);
  note(
    color.gray(
      '  ganju data restore --bookmark <it> --yes   puts the database back to now'
    )
  );
};

interface ExportState {
  id: string;
  format: 'jsonl' | 'csv';
  status: 'running' | 'done' | 'failed';
  error: string | null;
  files: { table: string | null; rows: number; bytes: number }[];
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const exportData = async (options: DataOptions): Promise<void> => {
  const format = options.format ?? 'jsonl';
  if (format !== 'jsonl' && format !== 'csv') {
    throw new CliError(`--format is jsonl or csv`, {
      hint: `Got "${format}".`
    });
  }
  const { data } = await dataContext();
  const database = await requireDatabase(data);

  let exportId: string;
  try {
    ({ exportId } = await data.request<{ exportId: string }>('startExport', {
      json: { format }
    }));
  } catch (error) {
    // One export at a time: follow the one already running rather than fail.
    const running =
      isApiError(error) && error.code === 'conflict'
        ? error.details?.exportId
        : undefined;
    if (typeof running !== 'string') throw error;
    warn('an export was already running; downloading that one');
    exportId = running;
  }

  let state: ExportState;
  for (;;) {
    ({ export: state } = await data.request<{ export: ExportState }>(
      'exportStatus',
      {
        query: { exportId }
      }
    ));
    if (state.status !== 'running') break;
    const rows = state.files.reduce((n, f) => n + f.rows, 0);
    step(`exporting… ${rows.toLocaleString('en')} rows so far`);
    await sleep(2000);
  }
  if (state.status === 'failed') {
    throw new CliError(
      `The export failed: ${state.error ?? 'no reason given'}`
    );
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const dir = resolve(options.out ?? `${database.name}-export-${stamp}`);
  await mkdir(dir, { recursive: true });
  for (const file of state.files) {
    const name =
      file.table === null ? 'schema.json' : `${file.table}.${state.format}`;
    const body = await data.request<string>('exportFile', {
      query: { exportId, ...(file.table === null ? {} : { table: file.table }) }
    });
    await writeFile(join(dir, name), body ?? '');
    if (!options.json) {
      note(
        `  ${name}  ${color.gray(file.table === null ? formatBytes(file.bytes) : `${file.rows.toLocaleString('en')} row${file.rows === 1 ? '' : 's'}, ${formatBytes(file.bytes)}`)}`
      );
    }
  }
  if (options.json) {
    printJson({ exportId, dir, files: state.files });
    return;
  }
  success(`exported to ${dir}`);
};

interface Change {
  id: string;
  kind: string;
  actor: string;
  detail: Record<string, unknown> | null;
  bookmark?: string | null;
  createdAt: string;
}

export const changes = async (options: DataOptions): Promise<void> => {
  const { data } = await dataContext();
  const limit = options.limit ? Number.parseInt(options.limit, 10) : 20;
  const result = await data.request<{ changes: Change[]; nextCursor?: string }>(
    'listChanges',
    {
      query: { limit, cursor: options.cursor }
    }
  );
  if (options.json) {
    printJson(result);
    return;
  }
  if (!result.changes.length) {
    note('No schema changes yet');
    return;
  }
  table([
    [
      color.gray('WHEN'),
      color.gray('KIND'),
      color.gray('BY'),
      color.gray('DETAIL')
    ],
    ...result.changes.map(change => [
      formatWhen(change.createdAt),
      change.kind,
      change.actor,
      change.detail ? JSON.stringify(change.detail) : ''
    ])
  ]);
  if (result.nextCursor)
    note(color.gray(`\n  older: --cursor ${result.nextCursor}`));
};

export const copy = async (
  action: string | undefined,
  options: DataOptions
): Promise<void> => {
  const { data } = await dataContext();
  const database = await requireDatabase(data);
  const current = database.copy ?? null;
  switch (action) {
    case undefined:
    case 'status':
      if (options.json) {
        printJson(current);
        return;
      }
      if (!current) {
        note('No table is being copied');
        return;
      }
      say(
        `${current.table}.${current.column} (${current.kind}): ${current.copied} of ${current.rows} rows, ${current.status}`
      );
      if (current.error) say(color.red(current.error));
      return;
    case 'wait':
      if (!current) {
        note('No table is being copied');
        return;
      }
      return waitForCopy(data, current);
    case 'dismiss':
      if (!current) {
        note('No table is being copied');
        return;
      }
      if (current.status !== 'failed') {
        throw new CliError(`The copy of ${current.table} is still running`, {
          hint: 'Only a failed copy can be dismissed; `ganju data copy wait` follows this one.'
        });
      }
      await data.request('dismissCopy');
      success(`dismissed the failed copy of ${current.table}`);
      return;
    default:
      throw new CliError(`Unknown action "copy ${action}"`, {
        hint: 'ganju data copy [status|wait|dismiss]'
      });
  }
};
