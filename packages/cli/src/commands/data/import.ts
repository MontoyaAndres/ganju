import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';

import type { DataTable } from '@ganju/utils/data';
import {
  DATA_IMPORT_BATCH,
  csvLine,
  detectDecimalMark,
  importRows,
  matchHeaders,
  relationKey,
  type DecimalMark,
  type ImportRow,
  type ImportedRow,
  type RelationLookup
} from '@ganju/utils/dataImport';

import { parseCsv } from '../../data/csv.js';
import { applyHeaderMap } from '../../data/headerMap.js';
import type { DataApi } from '../../data/routes.js';
import { CliError, isApiError } from '../../errors.js';
import {
  color,
  json as printJson,
  note,
  step,
  success,
  warn
} from '../../output.js';
import { previewDelete } from './rows.js';
import {
  confirmDestructive,
  dataContext,
  findTable,
  listTables,
  noteUndo,
  parseJsonOrLines,
  type DataOptions
} from './shared.js';

/**
 * `ganju data import <table> <file>` — a CSV or JSONL file into a table.
 *
 * The decisions are the dashboard's, made by the same code
 * (`@ganju/utils/dataImport`): headers matched to columns by name or label,
 * numbers with thousands separators, relations matched by the other table's
 * display value, each cell checked the way the database will check it. The
 * batching is the dashboard's too: 500 rows a request, and a batch refused
 * for one of its rows is split until that row is found, so one bad row costs
 * itself and not its 499 neighbours.
 */

// Refusals caused by a row in the batch, which splitting finds. Anything
// else, or no answer at all, stops the import: splitting would only repeat
// it, and a batch whose answer was lost may already be saved.
const ROW_LEVEL_CODES = new Set([
  'invalid',
  'constraint',
  'guard',
  'conflict',
  'too_large'
]);
// Up to this many rows, in the table and in the file, a replace is one write:
// the old rows go only if the new ones all land.
const ATOMIC_REPLACE_ROWS = 5000;
// Up to this many rows, a related table is read whole to match names.
const RELATION_READ_ALL = 2000;

// "Operation 2 (insert menu): Row 4: " in front of an error from one step.
const withoutStep = (error: string) =>
  error.replace(/^Operation \d+ \([^)]*\): (Row \d+: )?/, '');

interface ReadFile {
  headers: string[];
  rows: ImportRow[];
  lines: number[];
}

const cellOf = (value: unknown): ImportRow[number] => {
  if (value === null || value === undefined) return null;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return value;
  return JSON.stringify(value);
};

const readImportFile = async (path: string): Promise<ReadFile> => {
  const extension = extname(path).toLowerCase();
  if (extension === '.xlsx' || extension === '.xls') {
    throw new CliError(`${basename(path)} is a spreadsheet`, {
      hint: 'Save it as CSV first (File → Save as → CSV), or import it from the dashboard, which reads .xlsx.'
    });
  }
  const text = await readFile(path, 'utf8').catch(() => {
    throw new CliError(`Cannot read ${path}`);
  });
  if (
    extension === '.jsonl' ||
    extension === '.ndjson' ||
    extension === '.json'
  ) {
    const parsed = parseJsonOrLines(text, path);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const headers: string[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new CliError(`${basename(path)}: every line is an object`);
      }
      for (const key of Object.keys(item))
        if (!headers.includes(key)) headers.push(key);
    }
    return {
      headers,
      rows: list.map(item =>
        headers.map(h => cellOf((item as Record<string, unknown>)[h]))
      ),
      lines: list.map((_, i) => i + 1)
    };
  }
  const csv = parseCsv(text, extension === '.tsv' ? '\t' : undefined);
  return { headers: csv.headers, rows: csv.rows, lines: csv.lines };
};

/**
 * For each relation column the file fills, the referenced rows by their
 * display value. A small table is read whole, so the match ignores case and
 * accents; a large one is asked only for the file's own values, in the
 * spellings a sheet usually has.
 */
const relationLookups = async (
  data: DataApi,
  tables: DataTable[],
  target: DataTable,
  mapping: (string | null)[],
  rows: ImportRow[]
): Promise<Record<string, RelationLookup>> => {
  const lookups: Record<string, RelationLookup> = {};
  for (const column of target.columns) {
    if (column.type !== 'relation') continue;
    const index = mapping.indexOf(column.name);
    if (index === -1) continue;
    const lookup: RelationLookup = new Map();
    lookups[column.name] = lookup;
    const other = tables.find(t => t.name === column.table);
    const display = other?.displayColumn;
    if (!other || !display) continue;
    const wanted = new Map<string, string>();
    for (const row of rows) {
      const cell = row[index];
      if (cell === null || cell === undefined) continue;
      const text = String(cell).trim();
      if (!text || /^\d+$/.test(text)) continue;
      wanted.set(relationKey(text), text);
    }
    if (!wanted.size) continue;
    const remember = (found: Record<string, unknown>[]) => {
      for (const row of found) {
        const key = relationKey(String(row[display] ?? ''));
        if (!lookup.has(key)) lookup.set(key, row.id as number);
      }
    };
    type Page = {
      rows: Record<string, unknown>[];
      total?: number;
      nextCursor?: string;
    };
    const first = await data.request<Page>('listRows', {
      params: { table: other.name },
      query: { limit: 500 }
    });
    if ((first.total ?? Infinity) <= RELATION_READ_ALL) {
      remember(first.rows);
      let cursor = first.nextCursor;
      while (cursor) {
        const next = await data.request<Page>('listRows', {
          params: { table: other.name },
          query: { limit: 500, cursor }
        });
        remember(next.rows);
        cursor = next.nextCursor;
      }
      continue;
    }
    const spellings = [
      ...new Set(
        [...wanted.values()].flatMap(value => [
          value,
          value.toLowerCase(),
          value.toUpperCase(),
          value.toLowerCase().replace(/(^|\s)\p{L}/gu, c => c.toUpperCase())
        ])
      )
    ];
    for (let i = 0; i < spellings.length; i += 50) {
      const page = await data.request<Page>('listRows', {
        params: { table: other.name },
        query: {
          limit: 500,
          where: JSON.stringify({
            [display]: { in: spellings.slice(i, i + 50) }
          })
        }
      });
      remember(page.rows);
    }
  }
  return lookups;
};

interface Refused {
  line: number;
  cells: ImportRow;
  error: string;
}

const chunk = <T>(list: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

// Deletes every row, 5,000 at a time, for a replace too large to be one write.
const deleteAllRows = async (data: DataApi, name: string) => {
  for (;;) {
    const first = await data.request<{ rows: { id: number }[] }>('listRows', {
      params: { table: name },
      query: { limit: 1, sort: 'id' }
    });
    const id = first.rows[0]?.id;
    if (id === undefined) return;
    await data.request('write', {
      json: {
        operations: [
          {
            op: 'delete',
            table: name,
            where: { id: { gte: id, lt: id + ATOMIC_REPLACE_ROWS } }
          }
        ]
      }
    });
  }
};

export const importFile = async (
  name: string | undefined,
  file: string | undefined,
  options: DataOptions
) => {
  const usage =
    'ganju data import <table> <file.csv|.jsonl> [--replace --yes --confirm <table>]';
  if (!name || !file)
    throw new CliError(name ? 'Which file?' : 'Which table?', { hint: usage });
  let decimalMark: DecimalMark | undefined;
  if (options.decimalMark !== undefined) {
    if (options.decimalMark !== '.' && options.decimalMark !== ',') {
      throw new CliError('--decimal-mark is . or ,', {
        hint: `Got "${options.decimalMark}".`
      });
    }
    decimalMark = options.decimalMark;
  }

  const parsed = await readImportFile(file);
  if (!parsed.rows.length) throw new CliError(`${basename(file)} has no rows`);
  const { data } = await dataContext();
  const tables = await listTables(data);
  const target = findTable(tables, name);

  const mapping = applyHeaderMap(
    parsed.headers,
    matchHeaders(parsed.headers, target),
    target.columns.map(c => c.name),
    options.map
  );
  const skipped = parsed.headers.filter((_, i) => mapping[i] === null);
  if (mapping.every(m => m === null)) {
    throw new CliError(
      `No header in ${basename(file)} matches a column of ${name}`,
      {
        hint: `Headers: ${parsed.headers.join(', ')}\n  Columns: ${target.columns.map(c => c.name).join(', ')}\n  Rename the headers to the column names or labels, or map them: --map 'Header=column'.`
      }
    );
  }
  if (skipped.length) {
    warn(`not imported, no column by that name: ${skipped.join(', ')}`);
    note(color.gray("  --map 'Header=column' points one at a column"));
  }

  decimalMark ??= detectDecimalMark(parsed.rows);
  const relations = await relationLookups(
    data,
    tables,
    target,
    mapping,
    parsed.rows
  );
  const imported = importRows(target, mapping, parsed.rows, {
    relations,
    timeZone: timeZone(),
    decimalMark,
    lines: parsed.lines
  });

  const guesses = imported.flatMap(row => row.warnings);
  if (guesses.length && options.decimalMark === undefined) {
    const sample = guesses[0];
    warn(
      `${guesses.length} number${guesses.length === 1 ? '' : 's'} could be read two ways: "${sample.text}" in ${sample.column} was read as ${sample.read}, not ${sample.alternative}`
    );
    note(
      color.gray(
        `  pass --decimal-mark ${decimalMark === '.' ? ',' : '.'} if the file means ${sample.alternative}`
      )
    );
  }

  const refused: Refused[] = imported
    .filter(row => row.errors.length)
    .map(row => ({
      line: row.line,
      cells: parsed.rows[row.index],
      error: row.errors.join(' ')
    }));
  const ready = imported.filter(row => !row.errors.length);
  const refusedOf = (row: ImportedRow, error: string): Refused => ({
    line: row.line,
    cells: parsed.rows[row.index],
    error
  });

  let undo: string | undefined;
  let inserted = 0;
  let stopped: string | null = null;

  if (options.replace) {
    await previewDelete(data, name);
    await confirmDestructive(options, `replace every row of ${name}`, {
      name,
      flag: "the table's name"
    });
    const count = await data.request<{ total?: number }>('listRows', {
      params: { table: name },
      query: { limit: 1 }
    });
    // Taken before anything is deleted, so the undo exists before the rows go.
    ({ bookmark: undo } = await data.request<{ bookmark: string }>(
      'checkpoint'
    ));
    const existing = count.total ?? Infinity;
    if (
      existing <= ATOMIC_REPLACE_ROWS &&
      ready.length <= ATOMIC_REPLACE_ROWS
    ) {
      step(
        `replacing ${existing} row${existing === 1 ? '' : 's'} with ${ready.length}, in one write`
      );
      try {
        await data.request('write', {
          json: {
            operations: [
              ...(existing > 0
                ? [{ op: 'delete', table: name, where: { id: { gte: 1 } } }]
                : []),
              ...chunk(ready, DATA_IMPORT_BATCH).map(part => ({
                op: 'insert',
                table: name,
                rows: part.map(r => r.values)
              }))
            ]
          }
        });
        inserted = ready.length;
      } catch (error) {
        if (isApiError(error) && error.code) {
          throw new CliError(
            `Refused as a whole, so ${name} is unchanged: ${withoutStep(error.message)}`,
            {
              hint: 'Fix that row and import again; the dashboard can single out every row to blame.'
            }
          );
        }
        noteUndo(undo, 'it');
        throw new CliError(
          'The connection dropped during the write; it may or may not have landed',
          {
            hint: '`ganju data rows` shows which; the bookmark above undoes it either way.'
          }
        );
      }
      return report(
        name,
        file,
        inserted,
        refused,
        null,
        undo,
        parsed.headers,
        options
      );
    }
    step(
      `deleting ${Number.isFinite(existing) ? existing.toLocaleString('en') : 'the'} old rows`
    );
    await deleteAllRows(data, name);
  }

  // The batch whose answer was lost, if the import stopped on one.
  const handled = new Set<number>();
  let uncertain = new Set<number>();
  const insert = async (batch: ImportedRow[]): Promise<void> => {
    if (stopped) return;
    try {
      await data.request('createRows', {
        params: { table: name },
        json: { rows: batch.map(row => row.values) }
      });
      batch.forEach(row => handled.add(row.index));
      inserted += batch.length;
      return;
    } catch (error) {
      const code = isApiError(error) ? error.code : undefined;
      const message = error instanceof Error ? error.message : String(error);
      if (!code || !ROW_LEVEL_CODES.has(code)) {
        stopped = message;
        if (!isApiError(error))
          uncertain = new Set(batch.map(row => row.index));
        return;
      }
      if (batch.length === 1) {
        handled.add(batch[0].index);
        refused.push(refusedOf(batch[0], withoutStep(message)));
        return;
      }
      const middle = Math.ceil(batch.length / 2);
      await insert(batch.slice(0, middle));
      await insert(batch.slice(middle));
    }
  };
  for (const batch of chunk(ready, DATA_IMPORT_BATCH)) {
    if (stopped) break;
    await insert(batch);
    if (ready.length > DATA_IMPORT_BATCH && !options.json) {
      step(
        `${handled.size.toLocaleString('en')} of ${ready.length.toLocaleString('en')}`
      );
    }
  }
  if (stopped) {
    for (const row of ready) {
      if (handled.has(row.index)) continue;
      refused.push(
        refusedOf(
          row,
          uncertain.has(row.index)
            ? 'may have been saved: the answer was lost'
            : 'not sent: the import stopped'
        )
      );
    }
  }
  return report(
    name,
    file,
    inserted,
    refused,
    stopped,
    undo,
    parsed.headers,
    options
  );
};

const report = async (
  name: string,
  file: string,
  inserted: number,
  refused: Refused[],
  stopped: string | null,
  undo: string | undefined,
  headers: string[],
  options: DataOptions
) => {
  refused.sort((a, b) => a.line - b.line);
  let refusedPath: string | undefined;
  if (refused.length) {
    const stem = basename(file, extname(file));
    refusedPath = resolve(
      options.out ?? join(dirname(file), `${stem}.refused.csv`)
    );
    const lines = [
      csvLine([...headers, 'error']),
      ...refused.map(r => csvLine([...r.cells, r.error]))
    ];
    await writeFile(refusedPath, `${lines.join('\r\n')}\r\n`);
  }
  if (options.json) {
    printJson({
      table: name,
      inserted,
      refused: refused.map(r => ({ line: r.line, error: r.error })),
      refusedFile: refusedPath ?? null,
      stopped,
      undoBookmark: undo ?? null
    });
  } else {
    success(
      `imported ${inserted.toLocaleString('en')} row${inserted === 1 ? '' : 's'} into ${color.bold(name)}`
    );
    if (refused.length) {
      warn(`${refused.length} refused:`);
      for (const r of refused.slice(0, 10))
        note(`  line ${r.line}: ${r.error}`);
      if (refused.length > 10)
        note(color.gray(`  …and ${refused.length - 10} more`));
      note(
        color.gray(
          `  every refused row, with why, is in ${refusedPath} — fix it and import that file`
        )
      );
    }
    noteUndo(undo, 'the import');
  }
  if (stopped) {
    throw new CliError(`The import stopped: ${stopped}`, {
      hint: 'Rows after that point were not sent; they are in the refused file.'
    });
  }
  if (refused.length) process.exitCode = 1;
};
