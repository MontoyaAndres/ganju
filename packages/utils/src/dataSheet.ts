// Reading a spreadsheet or CSV from the project's knowledge into header and
// rows, for data-admin's import and a table's sheet sync alike. SheetJS is
// passed in, so each worker loads it only when a file needs it.
import { parseCsv } from './dataCsv';
import { DATA_SHEET_MAX_BYTES, DataError } from './dataTypes';
import type { ImportCell } from './dataImport';

export const DATA_SPREADSHEET_MIME =
  /spreadsheetml|ms-excel|opendocument\.spreadsheet/i;
export const DATA_CSV_MIME = /csv|text\/plain|tab-separated/i;

// Whether a knowledge item can be a table's source.
export const isTabularMimeType = (mimeType: string | null | undefined) =>
  !!mimeType &&
  (DATA_SPREADSHEET_MIME.test(mimeType) || DATA_CSV_MIME.test(mimeType));

// The parts of SheetJS used here, so this package doesn't depend on it.
export interface SheetJs {
  read(
    data: ArrayBuffer,
    options: Record<string, unknown>
  ): {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json<T>(sheet: unknown, options: Record<string, unknown>): T[];
    decode_range(ref: string): { s: { r: number } };
  };
}

export interface TabularFile {
  headers: string[];
  rows: ImportCell[][];
  // Each row's line in the file or sheet, counting the header.
  lines: number[];
}

const pad = (n: number) => String(n).padStart(2, '0');

// A spreadsheet's own date as the text the database reads, as the
// dashboard's import does: a date alone when it has no time, else a
// wall-clock time.
export const cellFromSheet = (cell: unknown): ImportCell => {
  if (cell instanceof Date) {
    const date = `${cell.getFullYear()}-${pad(cell.getMonth() + 1)}-${pad(cell.getDate())}`;
    if (!cell.getHours() && !cell.getMinutes() && !cell.getSeconds()) {
      return date;
    }
    return `${date}T${pad(cell.getHours())}:${pad(cell.getMinutes())}:${pad(cell.getSeconds())}`;
  }
  return typeof cell === 'string' ||
    typeof cell === 'number' ||
    typeof cell === 'boolean'
    ? cell
    : null;
};

// One sheet of an Excel or OpenDocument file: the first unless named.
// Blank lines are left out.
export const readSheet = (
  XLSX: SheetJs,
  bytes: ArrayBuffer,
  uri: string,
  sheetName?: string | null
): TabularFile => {
  // Only the sheet being read is parsed: a workbook unpacks to many times
  // its size, and a worker has 128 MiB.
  const book = XLSX.read(bytes, {
    cellDates: true,
    dense: true,
    sheets: sheetName ?? 0
  });
  const name = sheetName ?? book.SheetNames[0];
  const sheet = name ? book.Sheets[name] : undefined;
  if (!sheet) {
    throw new DataError(
      `${uri} has no sheet "${sheetName}". Sheets: ${book.SheetNames.join(', ')}.`,
      'not_found'
    );
  }
  const all = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true
  });
  // The sheet's range may start below row 1.
  const ref = (sheet as { '!ref'?: string })['!ref'];
  const firstLine = ref ? XLSX.utils.decode_range(ref).s.r + 1 : 1;
  const [header = [], ...body] = all;
  const rows: ImportCell[][] = [];
  const lines: number[] = [];
  body.forEach((row, i) => {
    const cells = row.map(cellFromSheet);
    if (cells.every(c => c === null || c === '')) return;
    rows.push(cells);
    lines.push(firstLine + 1 + i);
  });
  return {
    headers: header.map(h => (h === null ? '' : String(h))),
    rows,
    lines
  };
};

// A CSV's text, with each row's line as a sheet's would be.
export const readCsvText = (text: string): TabularFile => {
  const parsed = parseCsv(text);
  return {
    headers: parsed.headers,
    rows: parsed.rows,
    lines: parsed.lines
  };
};

// A stored file, read by its type: a spreadsheet through SheetJS (loaded
// only then), anything else as CSV text. Over DATA_SHEET_MAX_BYTES it isn't
// read at all.
export const readTabularFile = async (file: {
  bytes: ArrayBuffer;
  mimeType: string | null;
  uri: string;
  sheet?: string | null;
  loadSheetJs: () => Promise<SheetJs>;
}): Promise<TabularFile> => {
  if (file.bytes.byteLength > DATA_SHEET_MAX_BYTES) {
    throw new DataError(
      `${file.uri} is over ${DATA_SHEET_MAX_BYTES / (1024 * 1024)} MB.`,
      'too_large'
    );
  }
  if (file.mimeType && DATA_SPREADSHEET_MIME.test(file.mimeType)) {
    return readSheet(
      await file.loadSheetJs(),
      file.bytes,
      file.uri,
      file.sheet
    );
  }
  if (!file.mimeType || DATA_CSV_MIME.test(file.mimeType)) {
    return readCsvText(new TextDecoder().decode(file.bytes));
  }
  throw new DataError(
    `${file.uri} is ${file.mimeType}; a table reads CSV and Excel files.`
  );
};
