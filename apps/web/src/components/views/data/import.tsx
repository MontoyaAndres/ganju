import { useEffect, useMemo, useRef, useState } from 'react';
import { UI } from '@ganju/ui';
import {
  DATA_IMPORT_BATCH,
  csvLine,
  columnNameFromHeader,
  detectDecimalMark,
  guessColumnType,
  guessColumns,
  identifierIssue,
  importRows,
  matchHeaders,
  parseNumber,
  relationKey,
  type DecimalMark,
  type ImportCell,
  type ImportRow,
  type ImportedRow,
  type NumberGuess,
  type RelationLookup
} from '@ganju/utils/dataImport';
import { DATA_MAX_ROWS_PER_WRITE } from '@ganju/utils/data';

import Checkbox from '@mui/material/Checkbox';
import LinearProgress from '@mui/material/LinearProgress';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import { UploadFileOutlined } from '@mui/icons-material';

import { DialogContent, FooterActions } from './styles';
import { ImpactList, RelationField, useDeleteImpact } from './row-panel';
import {
  ColumnFields,
  draftFromColumn,
  inputFromDraft,
  type ColumnDraft
} from './column-fields';
import {
  browserTimeZone,
  columnTitle,
  dataRequest,
  isRelationValue,
  saveBlob,
  tableTitle
} from './api';
import { i18n } from '../../../lib';

import type {
  DataColumn,
  DataRow,
  DataTable,
  RelationValue,
  RowPage
} from './types';

const PREVIEW_ROWS = 20;
// Up to this many rows, a related table is read whole to match names.
const RELATION_READ_ALL = 2000;
// Refusals caused by a row in the batch: splitting the batch finds it. Any
// other answer, or none (a dropped connection, a 5xx), stops the import;
// splitting would only repeat it, and a batch whose answer was lost may
// already be saved.
const ROW_LEVEL_CODES = new Set(['invalid', 'constraint', 'guard', 'conflict', 'too_large']);
// Up to this many rows, both in the table and in the file, "Replace all
// rows" is one write: the old rows go only if the new ones all land.
const ATOMIC_REPLACE_ROWS = DATA_MAX_ROWS_PER_WRITE;

// An error from one step of a write, without the engine's "Operation 2
// (insert menu): Row 4: " in front.
const withoutStep = (error: string) =>
  error.replace(/^Operation \d+ \([^)]*\): (Row \d+: )?/, '');

const chunk = <T,>(list: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

const pad = (n: number) => String(n).padStart(2, '0');

// A spreadsheet's own date as the text the database reads: a date alone when
// it has no time, else a wall-clock time in the reader's zone.
const cellFromSheet = (cell: unknown): ImportCell => {
  if (cell instanceof Date) {
    const date = `${cell.getFullYear()}-${pad(cell.getMonth() + 1)}-${pad(cell.getDate())}`;
    if (!cell.getHours() && !cell.getMinutes() && !cell.getSeconds()) return date;
    return `${date}T${pad(cell.getHours())}:${pad(cell.getMinutes())}:${pad(cell.getSeconds())}`;
  }
  if (
    typeof cell === 'string' ||
    typeof cell === 'number' ||
    typeof cell === 'boolean'
  ) {
    return cell;
  }
  return null;
};

// A column as the database will hold it, for checking rows before the table
// exists.
const asColumn = (draft: ColumnDraft, index: number): DataColumn => {
  const input = inputFromDraft(draft);
  return {
    id: index + 1,
    name: input.name,
    type: input.type,
    label: input.label ?? null,
    description: input.description ?? null,
    required: !!input.required,
    unique: !!input.unique,
    filterable: !!input.filterable,
    searchable: !!input.searchable,
    personal: false,
    values: input.values ?? null,
    table: input.table ?? null,
    onDelete: input.onDelete ?? null,
    min: input.min ?? null,
    default: input.default,
    position: index
  };
};

const formatValue = (value: unknown, yes: string, no: string) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? yes : no;
  if (isRelationValue(value)) return `#${value.id}`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

interface Refused {
  index: number;
  line: number;
  cells: ImportRow;
  error: string;
}

// When a replace is refused as a whole, the rows behind it are found with
// writes that can't commit; this many at most, in this many requests.
const MAX_SINGLED_OUT = 20;
const MAX_DRY_RUNS = 60;
// Values with no match listed for the owner to pick a row for; past this,
// fixing the file is quicker.
const UNMATCHED_SHOWN = 30;

interface ImportDialogProps {
  base: string;
  tables: DataTable[];
  // The table to import into; null makes a new table from the file.
  table: DataTable | null;
  onClose: () => void;
  onDone: (table: string) => void;
}

export const ImportDialog = ({
  base,
  tables,
  table,
  onClose,
  onDone
}: ImportDialogProps) => {
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.DATA);
  const c = i18n.useT(i18n.copy.COMMON);
  const timeZone = browserTimeZone();
  const fileInput = useRef<HTMLInputElement>(null);
  // The parsed workbook, kept to switch sheets without reading the file again.
  const workbook = useRef<{
    sheets: Record<string, unknown>;
    // The sheet's rows, blank ones included, and the line its first is on.
    toRows: (sheet: unknown) => { data: unknown[][]; firstLine: number };
  } | null>(null);

  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheet, setSheet] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  // Each row's line in the file: blank rows are left out of `rows`.
  const [lines, setLines] = useState<number[]>([]);
  const [markChoice, setMarkChoice] = useState<'auto' | DecimalMark>('auto');
  const [tableName, setTableName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [drafts, setDrafts] = useState<(ColumnDraft & { include: boolean })[]>([]);
  const [mapping, setMapping] = useState<(string | null)[]>([]);
  const [mode, setMode] = useState<'add' | 'replace'>('add');
  const [replaceConfirm, setReplaceConfirm] = useState('');
  const [relations, setRelations] = useState<Record<string, RelationLookup>>({});
  const [relationsLoading, setRelationsLoading] = useState(false);
  // The row the owner picked for a file value that matched none, by
  // relation column and the value's key.
  const [manualMatches, setManualMatches] = useState<
    Record<string, Record<string, RelationValue>>
  >({});
  // The display value of each related row found, for the preview.
  const [relationLabels, setRelationLabels] = useState<
    Record<string, Map<number, unknown>>
  >({});
  const [phase, setPhase] = useState<'setup' | 'uploading' | 'done'>('setup');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [inserted, setInserted] = useState(0);
  const [refused, setRefused] = useState<Refused[]>([]);
  // A refused replace: the download is the whole file with its problems
  // marked, since the fixed file has to be imported whole again.
  const [wholeFile, setWholeFile] = useState(false);
  const [singlingOut, setSinglingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The checkpoint taken just before a replace: restoring to it undoes the
  // import, and nothing written before it.
  const [undoBookmark, setUndoBookmark] = useState<string | null>(null);
  const [undone, setUndone] = useState(false);
  const [undoConfirm, setUndoConfirm] = useState(false);
  const [undoing, setUndoing] = useState(false);

  const isNew = table === null;
  const detectedMark = useMemo(() => detectDecimalMark(rows), [rows]);
  const decimalMark = markChoice === 'auto' ? detectedMark : markChoice;
  // The file writes numbers with separators, so their reading can be chosen.
  const hasSeparatedNumbers = useMemo(
    () =>
      rows.some(row =>
        row.some(
          cell =>
            typeof cell === 'string' &&
            /[.,]/.test(cell) &&
            parseNumber(cell) !== null
        )
      ),
    [rows]
  );
  // Rows the replace deletes are pointed at from these tables.
  const replaceImpact = useDeleteImpact(
    base,
    tables,
    table ?? { name: '', columns: [] } as unknown as DataTable,
    table && mode === 'replace' ? 'all' : []
  );

  // A table name nobody uses yet, from a file or sheet name.
  const freeTableName = (source: string) => {
    const guess = columnNameFromHeader(source, 0);
    let free = guess;
    for (let n = 2; tables.some(other => other.name === free); n++) {
      free = `${guess.slice(0, 60)}_${n}`;
    }
    return identifierIssue(free, 'table') ? '' : free;
  };

  const loadSheet = (
    name: string,
    names: string[] = sheetNames,
    stem: string = fileName.replace(/\.[^.]+$/, '')
  ) => {
    if (!workbook.current) return;
    // Until the owner types a name: the file's, or the sheet's when the
    // workbook has several.
    if (isNew && !nameTouched) {
      setTableName(freeTableName(names.length > 1 ? name : stem));
    }
    const { data, firstLine } = workbook.current.toRows(
      workbook.current.sheets[name]
    );
    const filled = (row: unknown[] | undefined) =>
      !!row?.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
    // The first row with anything in it holds the headers.
    const headIndex = Math.max(0, data.findIndex(row => filled(row)));
    const head = data[headIndex] ?? [];
    const nextHeaders = head.map((cell, i) =>
      cell === null || cell === undefined || String(cell).trim() === ''
        ? `column_${i + 1}`
        : String(cell).trim()
    );
    const nextRows: ImportRow[] = [];
    const nextLines: number[] = [];
    data.slice(headIndex + 1).forEach((row, i) => {
      const cells = nextHeaders.map((_, c) => cellFromSheet(row?.[c]));
      if (!filled(cells)) return;
      nextRows.push(cells);
      nextLines.push(firstLine + headIndex + 1 + i);
    });
    setSheet(name);
    setHeaders(nextHeaders);
    setRows(nextRows);
    setLines(nextLines);
    setRelations({});
    setManualMatches({});
    if (isNew) {
      setDrafts(
        // Text from a sheet is what people search by (names, notes).
        guessColumns(nextHeaders, nextRows, {
          decimalMark:
            markChoice === 'auto' ? detectDecimalMark(nextRows) : markChoice
        }).map(input => ({
          ...draftFromColumn(input),
          searchable: input.type === 'text' || input.type === 'long_text',
          include: true
        }))
      );
    } else {
      setMapping(matchHeaders(nextHeaders, table));
    }
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    setError(null);
    try {
      const XLSX = await import('xlsx');
      const isText = /\.(csv|tsv|txt)$/i.test(file.name);
      const book = isText
        ? XLSX.read(await file.text(), { type: 'string', raw: true, dense: true })
        : XLSX.read(await file.arrayBuffer(), { cellDates: true, dense: true });
      workbook.current = {
        sheets: book.Sheets,
        toRows: sheetData => {
          const ref = (sheetData as { '!ref'?: string })['!ref'];
          return {
            data: XLSX.utils.sheet_to_json<unknown[]>(sheetData as never, {
              header: 1,
              raw: true,
              defval: null,
              blankrows: true
            }),
            // The sheet's range may start below row 1.
            firstLine: ref ? XLSX.utils.decode_range(ref).s.r + 1 : 1
          };
        }
      };
      setFileName(file.name);
      setSheetNames(book.SheetNames);
      if (book.SheetNames[0]) {
        loadSheet(
          book.SheetNames[0],
          book.SheetNames,
          file.name.replace(/\.[^.]+$/, '')
        );
      }
    } catch {
      setError(t('importParseFailed'));
    } finally {
      setParsing(false);
    }
  };

  // The table the rows are checked against: the one imported into, or the
  // one the file will create.
  const target = useMemo<Pick<DataTable, 'name' | 'columns'> | null>(() => {
    if (table) return table;
    if (!drafts.length) return null;
    return {
      name: tableName || 'new_table',
      columns: drafts
        .filter(d => d.include && d.name.trim())
        .map((d, i) => asColumn(d, i))
    };
  }, [table, drafts, tableName]);

  const columnMapping = useMemo<(string | null)[]>(
    () =>
      isNew
        ? drafts.map(d => (d.include && d.name.trim() ? d.name.trim() : null))
        : mapping,
    [isNew, drafts, mapping]
  );

  // Relations are matched by the referenced table's display column, read
  // from the database for the values the file uses.
  const relationColumns = useMemo(
    () =>
      (target?.columns ?? []).filter(
        column =>
          column.type === 'relation' && columnMapping.includes(column.name)
      ),
    [target, columnMapping]
  );
  // Which header feeds which relation: remapping one reads its values again.
  const relationSignature = relationColumns
    .map(
      column =>
        `${column.name}:${column.table}:${columnMapping.indexOf(column.name)}`
    )
    .join(',');

  useEffect(() => {
    if (!relationColumns.length || !rows.length) {
      setRelations({});
      setRelationLabels({});
      setRelationsLoading(false);
      return;
    }
    let cancelled = false;
    setRelationsLoading(true);
    (async () => {
      const lookups: Record<string, RelationLookup> = {};
      const names: Record<string, Map<number, unknown>> = {};
      for (const column of relationColumns) {
        const other = tables.find(x => x.name === column.table);
        const display = other?.displayColumn;
        const lookup: RelationLookup = new Map();
        const labels = new Map<number, unknown>();
        lookups[column.name] = lookup;
        names[column.name] = labels;
        if (!other || !display) continue;
        const index = columnMapping.indexOf(column.name);
        const wanted = new Map<string, string>();
        for (const row of rows) {
          const cell = row[index];
          if (cell === null || cell === undefined) continue;
          const text = String(cell).trim();
          if (!text || /^\d+$/.test(text)) continue;
          wanted.set(relationKey(text), text);
        }
        if (!wanted.size) continue;
        const path = `/table/${encodeURIComponent(other.name)}/row`;
        const remember = (found: DataRow[]) => {
          for (const row of found) {
            const key = relationKey(String(row[display] ?? ''));
            if (!lookup.has(key)) lookup.set(key, row.id);
            labels.set(row.id, row[display]);
          }
        };
        // A small table is read whole, so the match ignores case and
        // accents; a large one is asked for the file's own values, in the
        // spellings a sheet usually has.
        const first = await dataRequest<RowPage>(base, path, {
          query: { limit: 500 }
        });
        if (!first.ok) continue;
        if ((first.data.total ?? Infinity) <= RELATION_READ_ALL) {
          remember(first.data.rows);
          let cursor = first.data.nextCursor;
          while (cursor && !cancelled) {
            const next = await dataRequest<RowPage>(base, path, {
              query: { limit: 500, cursor }
            });
            if (!next.ok) break;
            remember(next.data.rows);
            cursor = next.data.nextCursor;
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
        for (let i = 0; i < spellings.length && !cancelled; i += 50) {
          const result = await dataRequest<RowPage>(base, path, {
            query: {
              limit: 500,
              where: JSON.stringify({ [display]: { in: spellings.slice(i, i + 50) } })
            }
          });
          if (!result.ok) break;
          remember(result.data.rows);
        }
      }
      if (!cancelled) {
        setRelations(lookups);
        setRelationLabels(names);
        setRelationsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [relationSignature, rows]);

  // A new reading of "28.000" can turn a number column integer or decimal.
  useEffect(() => {
    if (!isNew) return;
    setDrafts(prev =>
      prev.map((draft, i) => {
        if (draft.type !== 'integer' && draft.type !== 'decimal') return draft;
        const guess = guessColumnType(
          rows.map(row => row[i]),
          { decimalMark, header: headers[i] }
        );
        return guess.type === 'integer' || guess.type === 'decimal'
          ? { ...draft, type: guess.type }
          : draft;
      })
    );
  }, [decimalMark]);

  // The lookups found in the database, with the owner's own picks on top.
  const matchedRelations = useMemo(() => {
    const out: Record<string, RelationLookup> = {};
    for (const [name, lookup] of Object.entries(relations)) {
      out[name] = new Map(lookup);
    }
    for (const [name, picks] of Object.entries(manualMatches)) {
      const lookup = (out[name] ??= new Map());
      for (const [key, value] of Object.entries(picks)) lookup.set(key, value.id);
    }
    return out;
  }, [relations, manualMatches]);

  const relationLabel = (name: string, id: number): unknown => {
    const picked = Object.values(manualMatches[name] ?? {}).find(v => v.id === id);
    if (picked) return picked.label ?? `#${id}`;
    return relationLabels[name]?.get(id);
  };

  // File values that match no row of the related table, each listed once
  // with how many rows use it, for the owner to point at the right row.
  const unmatched = useMemo(() => {
    if (relationsLoading) return [];
    return relationColumns.flatMap(column => {
      const index = columnMapping.indexOf(column.name);
      const found = relations[column.name];
      const values = new Map<string, { text: string; count: number }>();
      for (const row of rows) {
        const text = String(row[index] ?? '').trim();
        // Bare numbers are taken as row ids.
        if (!text || /^\d+$/.test(text)) continue;
        const key = relationKey(text);
        if (found?.has(key)) continue;
        const entry = values.get(key);
        if (entry) entry.count++;
        else values.set(key, { text, count: 1 });
      }
      return [...values].map(([key, value]) => ({ column, key, ...value }));
    });
  }, [relationColumns, columnMapping, rows, relations, relationsLoading]);

  const imported = useMemo<ImportedRow[]>(
    () =>
      target
        ? importRows(target, columnMapping, rows, {
            relations: matchedRelations,
            timeZone,
            decimalMark,
            lines
          })
        : [],
    [target, columnMapping, rows, matchedRelations, decimalMark, lines]
  );
  const ready = imported.filter(row => row.errors.length === 0);
  const problems = imported.length - ready.length;
  const guessed = imported.filter(row => row.warnings.length > 0).length;
  // No thousands separator: "28.000" is the very thing in doubt.
  const guessText = (guess: NumberGuess) =>
    t('importNumberGuess', {
      column: guess.column,
      text: guess.text,
      read: t.n(guess.read, { useGrouping: false }),
      alternative: t.n(guess.alternative, { useGrouping: false })
    });
  const previewColumns = (target?.columns ?? []).filter(column =>
    columnMapping.includes(column.name)
  );

  const tableNameIssue =
    !isNew || !tableName
      ? null
      : identifierIssue(tableName, 'table')
        ? t('identifierInvalid')
        : tables.some(other => other.name === tableName)
          ? t('tableNameTaken', { name: tableName })
          : null;
  const canImport =
    phase === 'setup' &&
    !relationsLoading &&
    !(mode === 'replace' && (replaceImpact.loading || replaceImpact.blocked)) &&
    rows.length > 0 &&
    previewColumns.length > 0 &&
    ready.length > 0 &&
    (!isNew || (!!tableName && !tableNameIssue)) &&
    (isNew || mode === 'add' || replaceConfirm === table?.name);

  // Deletes every row, 5,000 at a time, for a replace too large to be one
  // write. Answers the error that stopped it, or null.
  const deleteAllRows = async (name: string) => {
    const path = `/table/${encodeURIComponent(name)}/row`;
    for (;;) {
      const first = await dataRequest<RowPage>(base, path, {
        query: { limit: 1, sort: 'id' }
      });
      if (!first.ok) return first.error || t('importFailed');
      const id = first.data.rows[0]?.id;
      if (id === undefined) return null;
      const result = await dataRequest(base, '/write', {
        method: 'POST',
        body: {
          operations: [
            {
              op: 'delete',
              table: name,
              where: { id: { gte: id, lt: id + DATA_MAX_ROWS_PER_WRITE } }
            }
          ]
        }
      });
      if (!result.ok) return result.error || t('importFailed');
    }
  };

  const refusedOf = (row: ImportedRow, error: string): Refused => ({
    index: row.index,
    line: row.line,
    cells: rows[row.index],
    error
  });

  const finish = (
    name: string,
    added: number,
    out: Refused[],
    stopped: string | null
  ) => {
    out.sort((a, b) => a.line - b.line);
    setInserted(added);
    setRefused(out);
    setError(stopped);
    setPhase('done');
    onDone(name);
  };

  // Every old row out and the file's rows in, as one write.
  const replaceOperations = (
    name: string,
    existing: number,
    batch: ImportedRow[]
  ) => [
    ...(existing > 0
      ? [{ op: 'delete', table: name, where: { id: { gte: 1 } } }]
      : []),
    ...chunk(batch, DATA_IMPORT_BATCH).map(part => ({
      op: 'insert',
      table: name,
      rows: part.map(row => row.values)
    }))
  ];

  // A refusal at the replace's first step, deleting the old rows (rows
  // elsewhere still point at them): no row of the file is to blame.
  const failedDeleting = (
    result: { details?: Record<string, unknown> },
    existing: number
  ) => existing > 0 && result.details?.operation === 0;

  // The old rows only matter to the new ones through a unique column (a
  // file value an old row already holds) or a relation to the table itself
  // (a file row pointing at an old one). Without either, a test write skips
  // the delete, so it doesn't delete and re-insert the whole table each time.
  const oldRowsMatter = !!table?.columns.some(
    column =>
      column.unique ||
      (column.type === 'relation' && column.table === table.name)
  );

  // The replace with only `batch`, followed by a step that matches no row
  // but expects one: the write always rolls back. 'ok' when the refusal is
  // that last step's, so everything before it would have been taken;
  // 'delete' when it is the delete's, which no half of the file changes.
  const dryRun = async (
    name: string,
    existing: number,
    batch: ImportedRow[]
  ): Promise<'ok' | 'stop' | 'delete' | { error: string }> => {
    const deleting = oldRowsMatter ? existing : 0;
    const operations = [
      ...replaceOperations(name, deleting, batch),
      { op: 'delete', table: name, where: { id: { lt: 0 } }, expect: 1 }
    ];
    const result = await dataRequest(base, '/write', {
      method: 'POST',
      body: { operations }
    });
    if (result.ok) return 'stop';
    if (failedDeleting(result, deleting)) return 'delete';
    if (
      result.code === 'guard' &&
      result.details?.operation === operations.length - 1
    ) {
      return 'ok';
    }
    if (!result.code || !ROW_LEVEL_CODES.has(result.code)) return 'stop';
    return { error: withoutStep(result.error) };
  };

  // The rows a refused replace stumbles on, halving the file until each is
  // alone. Two rows that only fail together are not found. Null when the
  // delete step started failing meanwhile: then no row can be blamed.
  const singleOut = async (
    name: string,
    existing: number,
    list: ImportedRow[]
  ): Promise<Refused[] | null> => {
    const found: Refused[] = [];
    let requests = 0;
    let deleteFailed = false;
    const search = async (part: ImportedRow[]): Promise<void> => {
      if (
        deleteFailed ||
        found.length >= MAX_SINGLED_OUT ||
        requests >= MAX_DRY_RUNS
      ) {
        return;
      }
      requests++;
      const answer = await dryRun(name, existing, part);
      if (answer === 'delete') {
        deleteFailed = true;
        return;
      }
      if (answer === 'ok' || answer === 'stop') return;
      if (part.length === 1) {
        found.push(refusedOf(part[0], answer.error));
        return;
      }
      const middle = Math.ceil(part.length / 2);
      await search(part.slice(0, middle));
      await search(part.slice(middle));
    };
    const middle = Math.ceil(list.length / 2);
    await search(list.slice(0, middle));
    await search(list.slice(middle));
    return deleteFailed ? null : found;
  };

  const handleImport = async () => {
    if (!canImport || !target) return;
    setWholeFile(false);
    setUndone(false);
    setError(null);
    setPhase('uploading');
    let name = table?.name ?? tableName;
    const out: Refused[] = imported
      .filter(row => row.errors.length > 0)
      .map(row => refusedOf(row, row.errors.join(' ')));
    setProgress({ done: 0, total: ready.length });

    if (isNew) {
      const included = drafts.filter(d => d.include && d.name.trim());
      const created = await dataRequest<{ table: DataTable }>(base, '/table', {
        method: 'POST',
        body: {
          name: tableName,
          columns: included.map(inputFromDraft),
          // Relations to the new table show its first text column ("Margherita")
          // rather than an id.
          displayColumn:
            included.find(d => d.type === 'text')?.name.trim() ?? null
        }
      });
      if (!created.ok) {
        setError(created.error || t('toastCreateTableFailed'));
        setPhase('setup');
        return;
      }
      name = created.data.table.name;
    } else if (mode === 'replace') {
      const count = await dataRequest<RowPage>(
        base,
        `/table/${encodeURIComponent(name)}/row`,
        { query: { limit: 1 } }
      );
      if (!count.ok) {
        setError(count.error || t('importFailed'));
        setPhase('setup');
        return;
      }
      // Taken by the database before anything is deleted, so the undo the
      // warning promises exists before the rows go.
      const checkpoint = await dataRequest<{ bookmark: string }>(
        base,
        '/checkpoint',
        { method: 'POST' }
      );
      if (!checkpoint.ok) {
        setError(
          t('importCheckpointFailed', {
            error: checkpoint.error || t('importFailed')
          })
        );
        setPhase('setup');
        return;
      }
      const before = checkpoint.data.bookmark;
      const existing = count.data.total ?? Infinity;
      if (
        existing <= ATOMIC_REPLACE_ROWS &&
        ready.length <= ATOMIC_REPLACE_ROWS
      ) {
        const result = await dataRequest(base, '/write', {
          method: 'POST',
          body: { operations: replaceOperations(name, existing, ready) }
        });
        if (result.ok) {
          setProgress({ done: ready.length, total: ready.length });
          setUndoBookmark(before);
          finish(name, ready.length, out, null);
          return;
        }
        if (result.code) {
          // Refused as a whole: the old rows are all still there.
          let blocking: Refused[] | null = [];
          if (
            ROW_LEVEL_CODES.has(result.code) &&
            !failedDeleting(result, existing)
          ) {
            setSinglingOut(true);
            blocking = await singleOut(name, existing, ready);
            setSinglingOut(false);
          }
          if (blocking?.length) {
            setWholeFile(true);
            finish(
              name,
              0,
              [...out, ...blocking],
              t.plural('importReplaceRefused', blocking.length)
            );
            return;
          }
          setError(
            t('importReplaceUnchanged', {
              error: withoutStep(result.error) || t('importFailed')
            })
          );
          setPhase('setup');
          return;
        }
        // No answer: it may have landed. Undo covers either case.
        setUndoBookmark(before);
        finish(
          name,
          0,
          [...out, ...ready.map(row => refusedOf(row, t('importMaybeSaved')))],
          t('importStopped', { error: t('importConnectionLost') })
        );
        return;
      }
      setUndoBookmark(before);
      const failed = await deleteAllRows(name);
      if (failed) {
        finish(
          name,
          0,
          [...out, ...ready.map(row => refusedOf(row, t('importNotSent')))],
          t('importStopped', { error: failed })
        );
        return;
      }
    }

    let done = 0;
    let added = 0;
    let stopped: string | null = null;
    // The batch whose answer was lost, if the import stopped on one.
    let uncertain = new Set<number>();
    const handled = new Set<number>();

    const insert = async (batch: ImportedRow[]): Promise<void> => {
      if (stopped) return;
      const result = await dataRequest<{ ids: number[] }>(
        base,
        `/table/${encodeURIComponent(name)}/row`,
        { method: 'POST', body: { rows: batch.map(row => row.values) } }
      );
      if (result.ok) {
        batch.forEach(row => handled.add(row.index));
        added += batch.length;
        done += batch.length;
        setProgress({ done, total: ready.length });
        return;
      }
      if (!result.code || !ROW_LEVEL_CODES.has(result.code)) {
        stopped = result.error || t('importConnectionLost');
        if (!result.code) uncertain = new Set(batch.map(row => row.index));
        return;
      }
      if (batch.length === 1) {
        handled.add(batch[0].index);
        out.push(refusedOf(batch[0], result.error || t('importFailed')));
        done += 1;
        setProgress({ done, total: ready.length });
        return;
      }
      const middle = Math.ceil(batch.length / 2);
      await insert(batch.slice(0, middle));
      await insert(batch.slice(middle));
    };

    for (const batch of chunk(ready, DATA_IMPORT_BATCH)) {
      if (stopped) break;
      await insert(batch);
    }

    if (stopped) {
      for (const row of ready) {
        if (handled.has(row.index)) continue;
        out.push(
          refusedOf(
            row,
            uncertain.has(row.index) ? t('importMaybeSaved') : t('importNotSent')
          )
        );
      }
    }
    finish(name, added, out, stopped ? t('importStopped', { error: stopped }) : null);
  };

  const handleUndoImport = async () => {
    if (!undoBookmark || undoing) return;
    setUndoing(true);
    const result = await dataRequest(base, '/restore-point', {
      method: 'POST',
      body: { bookmark: undoBookmark }
    });
    setUndoing(false);
    setUndoConfirm(false);
    if (!result.ok) {
      snackbar.error(result.error || t('toastRestoreFailed'));
      return;
    }
    setUndoBookmark(null);
    setUndone(true);
    snackbar.success(t('importUndone'));
    onDone(table?.name ?? tableName);
  };

  const downloadRefused = () => {
    const errorOf = new Map(refused.map(row => [row.index, row.error]));
    const lines = [
      csvLine([...headers, t('importErrorColumn')]),
      ...(wholeFile
        ? rows.map((cells, index) => csvLine([...cells, errorOf.get(index) ?? '']))
        : refused.map(row => csvLine([...row.cells, row.error])))
    ];
    saveBlob(
      new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }),
      `${(table?.name ?? tableName) || 'import'}-${wholeFile ? 'marked' : 'refused'}.csv`
    );
  };

  const title = isNew
    ? t('importNewTitle')
    : t('importTitle', { table: tableTitle(table) });

  return (
    <>
    <UI.Modal
      open
      title={title}
      closeLabel={c('close')}
      width={880}
      maxHeight="90vh"
      closeOnBackdrop={false}
      onClose={() => phase !== 'uploading' && onClose()}
      footer={
        phase === 'done' ? (
          <FooterActions>
          <UI.Button variant="contained" size="small" onClick={onClose}>
            {c('close')}
          </UI.Button>
          </FooterActions>
        ) : (
          <FooterActions>
            <UI.Button
              size="small"
              disabled={phase === 'uploading'}
              onClick={onClose}
            >
              {c('cancel')}
            </UI.Button>
            <UI.Button
              variant="contained"
              size="small"
              disabled={!canImport}
              onClick={handleImport}
            >
              {phase === 'uploading'
                ? t('importing')
                : t.plural('importAction', ready.length)}
            </UI.Button>
          </FooterActions>
        )
      }
    >
      <DialogContent>
        {phase === 'setup' && (
          <>
            {!isNew && (
              <RadioGroup
                className="import-mode"
                value={mode}
                onChange={e => setMode(e.target.value as 'add' | 'replace')}
              >
                <FormControlLabel
                  value="add"
                  control={<Radio size="small" />}
                  label={t('importModeAdd')}
                />
                <FormControlLabel
                  value="replace"
                  control={<Radio size="small" />}
                  label={t('importModeReplace')}
                />
              </RadioGroup>
            )}
            {!isNew && mode === 'replace' && table && (
              <div className="dialog-warning-box">
                {replaceImpact.effects.length > 0 && (
                  <>
                    <p>{t('importReplaceRelations')}</p>
                    <ImpactList impact={replaceImpact} />
                  </>
                )}
                {replaceImpact.loading && !replaceImpact.effects.length && (
                  <ImpactList impact={replaceImpact} />
                )}
                <p>
                  {t('importReplaceWarning')} <code>{table.name}</code>
                </p>
                <UI.Input
                  size="small"
                  value={replaceConfirm}
                  placeholder={table.name}
                  autoComplete="off"
                  onChange={e => setReplaceConfirm(e.target.value)}
                />
              </div>
            )}

            <div className="import-file">
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xls"
                hidden
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = '';
                }}
              />
              <UI.Button
                size="small"
                variant="outlined"
                disabled={parsing}
                onClick={() => fileInput.current?.click()}
              >
                <UploadFileOutlined />
                <span className="button-text">
                  {parsing
                    ? t('importReading')
                    : fileName
                      ? t('importOtherFile')
                      : t('importChooseFile')}
                </span>
              </UI.Button>
              {fileName ? (
                <span className="import-file-name">
                  {fileName} · {t.plural('importRowCount', rows.length)}
                </span>
              ) : (
                <span className="dialog-muted">{t('importFileHelp')}</span>
              )}
              {sheetNames.length > 1 && (
                <UI.Select
                  size="small"
                  label={t('importSheet')}
                  value={sheet}
                  onChange={e => loadSheet(e.target.value)}
                  options={sheetNames.map(name => ({ label: name, value: name }))}
                />
              )}
            </div>

            {isNew && drafts.length > 0 && (
              <>
                <UI.Input
                  size="small"
                  label={t('tableName')}
                  value={tableName}
                  error={!!tableNameIssue}
                  helperText={tableNameIssue || t('tableNameHelp')}
                  onChange={e => {
                    setTableName(e.target.value);
                    setNameTouched(true);
                  }}
                />
                <h4 className="dialog-subtitle">{t('importColumnsTitle')}</h4>
                <p className="dialog-muted">{t('importColumnsHelp')}</p>
                <div className="dialog-columns">
                  {drafts.map((draft, index) => (
                    <div key={index} className="dialog-column">
                      <div className="import-header">
                        <Checkbox
                          size="small"
                          checked={draft.include}
                          onChange={e =>
                            setDrafts(prev =>
                              prev.map((d, i) =>
                                i === index ? { ...d, include: e.target.checked } : d
                              )
                            )
                          }
                        />
                        <span>{headers[index]}</span>
                      </div>
                      {draft.include && (
                        <ColumnFields
                          compact
                          draft={draft}
                          tables={tables}
                          onChange={next =>
                            setDrafts(prev =>
                              prev.map((d, i) =>
                                i === index ? { ...next, include: d.include } : d
                              )
                            )
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {!isNew && table && headers.length > 0 && (
              <>
                <h4 className="dialog-subtitle">{t('importMappingTitle')}</h4>
                <p className="dialog-muted">{t('importMappingHelp')}</p>
                <div className="import-mapping">
                  {headers.map((header, index) => (
                    <div key={index} className="import-mapping-row">
                      <span className="import-mapping-header">{header}</span>
                      <span aria-hidden="true">→</span>
                      <UI.Select
                        size="small"
                        value={mapping[index] ?? ''}
                        onChange={e =>
                          setMapping(prev =>
                            prev.map((m, i) =>
                              i === index
                                ? e.target.value || null
                                : m === e.target.value
                                  ? null
                                  : m
                            )
                          )
                        }
                        options={[
                          { label: t('importSkip'), value: '' },
                          ...table.columns.map(column => ({
                            label: columnTitle(column),
                            value: column.name
                          }))
                        ]}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            {unmatched.length > 0 && (
              <div className="import-unmatched">
                <h4 className="dialog-subtitle">{t('importUnmatchedTitle')}</h4>
                <p className="dialog-muted">{t('importUnmatchedHelp')}</p>
                {unmatched.slice(0, UNMATCHED_SHOWN).map(item => (
                  <RelationField
                    key={`${item.column.name}:${item.key}`}
                    base={base}
                    column={item.column}
                    target={tables.find(other => other.name === item.column.table)}
                    value={manualMatches[item.column.name]?.[item.key] ?? null}
                    disabled={phase !== 'setup'}
                    label={t.plural('importUnmatchedValue', item.count, {
                      value: item.text,
                      column: columnTitle(item.column)
                    })}
                    onChange={next =>
                      setManualMatches(prev => {
                        const picks = { ...(prev[item.column.name] ?? {}) };
                        if (next) picks[item.key] = next;
                        else delete picks[item.key];
                        return { ...prev, [item.column.name]: picks };
                      })
                    }
                  />
                ))}
                {unmatched.length > UNMATCHED_SHOWN && (
                  <p className="dialog-muted">
                    {t('importUnmatchedMore', {
                      count: t.n(unmatched.length - UNMATCHED_SHOWN)
                    })}
                  </p>
                )}
              </div>
            )}

            {hasSeparatedNumbers && (
              <UI.Select
                size="small"
                label={t('importDecimalMark')}
                helperText={t('importDecimalHelp')}
                value={markChoice}
                onChange={e =>
                  setMarkChoice(e.target.value as 'auto' | DecimalMark)
                }
                options={[
                  {
                    label: detectedMark
                      ? t('importDecimalDetected', {
                          example: detectedMark === ',' ? '1.234,5' : '1,234.5'
                        })
                      : t('importDecimalUnknown'),
                    value: 'auto'
                  },
                  { label: t('importDecimalComma'), value: ',' },
                  { label: t('importDecimalDot'), value: '.' }
                ]}
              />
            )}

            {imported.length > 0 && previewColumns.length > 0 && (
              <>
                <h4 className="dialog-subtitle">{t('importPreviewTitle')}</h4>
                <p className={problems ? 'dialog-warning' : 'dialog-muted'}>
                  {t.plural('importReady', ready.length)}
                  {problems > 0 && ` ${t.plural('importProblems', problems)}`}
                  {guessed > 0 && ` ${t.plural('importGuessed', guessed)}`}
                </p>
                {relationsLoading && (
                  <p className="dialog-muted">{t('importMatching')}</p>
                )}
                <div className="import-preview">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('importLine')}</th>
                        {previewColumns.map(column => (
                          <th key={column.name}>{columnTitle(column)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {imported.slice(0, PREVIEW_ROWS).map(row => (
                        <tr
                          key={row.index}
                          className={row.errors.length ? 'has-error' : ''}
                          title={
                            [...row.errors, ...row.warnings.map(guessText)].join('\n') ||
                            undefined
                          }
                        >
                          <td>{row.line}</td>
                          {previewColumns.map(column => {
                            const bad = row.errors.some(
                              e =>
                                e.startsWith(`${column.name} `) ||
                                e.startsWith(`${column.name}:`) ||
                                e.includes(`.${column.name} `)
                            );
                            const unsure = row.warnings.some(
                              w => w.column === column.name
                            );
                            return (
                              <td
                                key={column.name}
                                className={bad ? 'bad' : unsure ? 'unsure' : ''}
                              >
                                {bad
                                  ? String(rows[row.index][columnMapping.indexOf(column.name)] ?? '')
                                  : column.type === 'relation' &&
                                      typeof row.values[column.name] === 'number' &&
                                      relationLabel(
                                        column.name,
                                        row.values[column.name] as number
                                      ) !== undefined
                                    ? String(
                                        relationLabel(
                                          column.name,
                                          row.values[column.name] as number
                                        )
                                      )
                                    : formatValue(row.values[column.name], t('yes'), t('no'))}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {imported
                  .slice(0, PREVIEW_ROWS)
                  .some(row => row.errors.length || row.warnings.length) && (
                  <ul className="dialog-list import-errors">
                    {imported
                      .slice(0, PREVIEW_ROWS)
                      .filter(row => row.errors.length || row.warnings.length)
                      .map(row => (
                        <li
                          key={row.index}
                          className={row.errors.length ? '' : 'import-guess'}
                        >
                          {t('importLineError', {
                            line: row.line,
                            error: [...row.errors, ...row.warnings.map(guessText)].join(' ')
                          })}
                        </li>
                      ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}

        {phase === 'uploading' && (
          <div className="import-progress">
            <p>
              {singlingOut
                ? t('importSinglingOut')
                : t('importProgress', {
                    done: t.n(progress.done),
                    total: t.n(progress.total)
                  })}
            </p>
            <LinearProgress
              variant={
                progress.total && !singlingOut ? 'determinate' : 'indeterminate'
              }
              value={progress.total ? (progress.done / progress.total) * 100 : 0}
            />
          </div>
        )}

        {phase === 'done' && (
          <div className="import-done">
            <p>
              {undone
                ? t('importUndoneText')
                : t.plural('importInserted', inserted)}
            </p>
            {refused.length > 0 && !undone && (
              <>
                {!wholeFile && (
                  <p className="dialog-warning">
                    {t.plural('importRefused', refused.length)}
                  </p>
                )}
                <ul className="dialog-list import-errors">
                  {refused.slice(0, 10).map(row => (
                    <li key={`${row.line}:${row.error}`}>
                      {t('importLineError', { line: row.line, error: row.error })}
                    </li>
                  ))}
                </ul>
                <UI.Button size="small" variant="outlined" onClick={downloadRefused}>
                  <span className="button-text">
                    {wholeFile
                      ? t('importDownloadMarked')
                      : t('importDownloadRefused')}
                  </span>
                </UI.Button>
              </>
            )}
            {undoBookmark && (
              <div className="dialog-notice">
                <span>{t('importUndoHelp')}</span>
                <UI.Button
                  size="small"
                  disabled={undoing}
                  onClick={() => setUndoConfirm(true)}
                >
                  <span className="button-text">{t('importUndo')}</span>
                </UI.Button>
              </div>
            )}
          </div>
        )}

        {error && <p className="dialog-danger">{error}</p>}
      </DialogContent>
    </UI.Modal>
    <UI.Alert
      open={undoConfirm}
      title={t('undoConfirmTitle')}
      description={t('undoConfirmText')}
      confirmText={t('importUndo')}
      cancelText={c('cancel')}
      loadingText={t('restoring')}
      loading={undoing}
      onConfirm={handleUndoImport}
      onCancel={() => setUndoConfirm(false)}
    />
    </>
  );
};
