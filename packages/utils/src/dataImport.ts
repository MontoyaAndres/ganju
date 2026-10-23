// Reading a spreadsheet into a table: the column types guessed for a new
// table, the headers matched to an existing one's columns, and each cell
// checked the way the database will check it. The dashboard's import and
// `ganju data import` both use these, so a file lands the same way from
// either. Entry point `@ganju/utils/dataImport`.
import { toStored } from './dataCompiler';
import {
  DATA_HIDDEN_COLUMNS,
  DATA_SYSTEM_COLUMNS,
  identifierIssue
} from './dataIdentifiers';
import {
  DATA_MAX_COLUMNS,
  DATA_MAX_ENUM_VALUES,
  type DataColumn,
  type DataColumnInput,
  type DataColumnType,
  type DataTable
} from './dataTypes';

export { identifierIssue, isValidIdentifier } from './dataIdentifiers';

// A cell as a parser hands it over. Dates are expected as ISO strings: the
// caller converts its parser's own date objects first.
export type ImportCell = string | number | boolean | null | undefined;
export type ImportRow = ImportCell[];

// How many rows the type guess reads.
export const DATA_IMPORT_SAMPLE_ROWS = 200;
// Rows sent per request, the API's own limit.
export const DATA_IMPORT_BATCH = 500;

// Up to this many distinct values, each seen at least twice on average, a
// text column reads as a list of options.
const ENUM_MAX_DISTINCT = 12;
const LONG_TEXT_LENGTH = 200;

const TRUE_WORDS = new Set(['true', 'yes', 'y', 'si', 'sí', 'verdadero', '1']);
const FALSE_WORDS = new Set(['false', 'no', 'n', 'falso', '0']);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const URL = /^https?:\/\/\S+$/i;
// Digits with the usual separators, long enough not to be a quantity.
const PHONE = /^\+?[\d\s().-]{7,25}$/;
// A header that names a phone column: its numbers are phones even when the
// sheet stored them as plain numbers.
const PHONE_HEADER = /phone|tel|telefono|celular|movil|mobile|whatsapp/;
// Digits with "." or "," between them, nothing else.
const NUMBER_TEXT = /^-?\d+([.,]\d+)*$/;
// A code, not a quantity: "05001" loses its zero as a number.
const LEADING_ZERO = /^-?0\d/;

const isBlank = (cell: ImportCell) =>
  cell === null || cell === undefined || String(cell).trim() === '';

const text = (cell: ImportCell) => String(cell ?? '').trim();

// The character a file writes before a number's fraction: "1.234,50" in
// Colombia and most of Europe, "1,234.50" in the US.
export type DecimalMark = '.' | ',';

const otherMark = (mark: DecimalMark): DecimalMark => (mark === '.' ? ',' : '.');

// What one value says about the file's decimal mark on its own, or null when
// it could be either: "28.000" is 28 thousand or 28.
const markOf = (value: string): DecimalMark | null => {
  if (!NUMBER_TEXT.test(value)) return null;
  const dot = value.lastIndexOf('.');
  const comma = value.lastIndexOf(',');
  if (dot >= 0 && comma >= 0) return dot > comma ? '.' : ',';
  const mark: DecimalMark = dot >= 0 ? '.' : ',';
  const parts = value.replace(/^-/, '').split(mark);
  if (parts.length === 1) return null;
  // Used twice, it can only group thousands.
  if (parts.length > 2) return otherMark(mark);
  const [whole, fraction] = parts;
  if (fraction.length !== 3 || whole.length > 3 || /^0+$/.test(whole)) return mark;
  return null;
};

/**
 * The decimal mark a file's numbers use, from the values that can only be
 * read one way ("12,5", "1.234.567", "1,234.50"). Undefined when none of
 * them say, or they disagree evenly: each "28.000" is then flagged.
 */
export const detectDecimalMark = (
  rows: ImportRow[]
): DecimalMark | undefined => {
  let dot = 0;
  let comma = 0;
  for (const row of rows) {
    for (const cell of row) {
      if (typeof cell !== 'string') continue;
      const mark = markOf(cell.trim());
      if (mark === '.') dot++;
      else if (mark === ',') comma++;
    }
  }
  if (dot === comma) return undefined;
  return dot > comma ? '.' : ',';
};

export interface ParsedNumber {
  value: number;
  // Read with a guess: one separator before exactly three digits, and no
  // decimal mark to say which it is. Taken as thousands.
  ambiguous: boolean;
}

/**
 * A number as a sheet writes it, with its thousands separators:
 * "28.000" → 28000 and "1.234,50" → 1234.5 with a "," mark. A value is
 * thousands-separated when the same separator repeats, when both appear (the
 * last is the decimal), or when it has three digits after its only one and
 * the file's mark is the other character. Null when it isn't a number.
 */
export const parseNumber = (
  value: string,
  mark?: DecimalMark
): ParsedNumber | null => {
  const raw = value.trim();
  if (!NUMBER_TEXT.test(raw)) return null;
  const negative = raw.startsWith('-');
  const digits = negative ? raw.slice(1) : raw;
  const dot = digits.lastIndexOf('.');
  const comma = digits.lastIndexOf(',');
  let decimal: DecimalMark | null;
  let ambiguous = false;
  if (dot < 0 && comma < 0) {
    decimal = null;
  } else if (dot >= 0 && comma >= 0) {
    decimal = dot > comma ? '.' : ',';
  } else {
    const sep: DecimalMark = dot >= 0 ? '.' : ',';
    const own = markOf(digits);
    if (own !== null) {
      decimal = own === sep ? sep : null;
    } else if (mark) {
      decimal = mark === sep ? sep : null;
    } else {
      decimal = null;
      ambiguous = true;
    }
  }
  const [whole, fraction = '', ...rest] =
    decimal === null ? [digits] : digits.split(decimal);
  if (rest.length) return null;
  const groups = whole.split(/[.,]/);
  // Thousands come in threes after a first group of one to three digits.
  if (
    groups.length > 1 &&
    (groups[0].length > 3 ||
      groups.slice(1).some(g => g.length !== 3) ||
      new Set(whole.replace(/\d/g, '')).size > 1)
  ) {
    return null;
  }
  if (fraction && /[.,]/.test(fraction)) return null;
  const n = Number(`${negative ? '-' : ''}${groups.join('')}${fraction ? `.${fraction}` : ''}`);
  return Number.isFinite(n) ? { value: n, ambiguous } : null;
};

// Lowercase, no accents, nothing but letters and digits: how a header is
// compared with a column's name or label.
export const normaliseHeader = (header: string) =>
  header
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// A header as a column name the database accepts: "Precio (COP)" →
// "precio_cop". A name every table already has gets a prefix, so a sheet's
// own "id" column is kept as "source_id".
export const columnNameFromHeader = (header: string, index: number) => {
  let name = header
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 63);
  if (!name) name = `column_${index + 1}`;
  if (!/^[a-z]/.test(name)) name = `c_${name}`.slice(0, 63);
  if (
    (DATA_SYSTEM_COLUMNS as readonly string[]).includes(name) ||
    (DATA_HIDDEN_COLUMNS as readonly string[]).includes(name) ||
    identifierIssue(name, 'column') !== null
  ) {
    name = `source_${name}`.slice(0, 63);
  }
  return identifierIssue(name, 'column') === null ? name : `column_${index + 1}`;
};

// How many values in a sample may disagree with a column's type and still
// have it guessed: a typo in one cell shouldn't turn a price column into
// text. Those rows are flagged in the preview instead.
const tolerated = (count: number) =>
  count < 3 ? 0 : Math.max(1, Math.floor(count * 0.1));

export interface GuessOptions {
  // The file's decimal mark, from detectDecimalMark.
  decimalMark?: DecimalMark;
  // The column's header, which can say what its numbers are.
  header?: string;
}

// The type the values in one column read as, from the first sample rows.
export const guessColumnType = (
  values: ImportCell[],
  options: GuessOptions = {}
): {
  type: DataColumnType;
  values?: string[];
} => {
  const cells = values
    .slice(0, DATA_IMPORT_SAMPLE_ROWS)
    .filter(cell => !isBlank(cell));
  if (cells.length === 0) return { type: 'text' };
  const count = (test: (cell: ImportCell) => boolean) =>
    cells.filter(test).length;
  const mostly = (matches: number) =>
    matches > 0 && cells.length - matches <= tolerated(cells.length);

  if (mostly(count(cell => typeof cell === 'boolean'))) return { type: 'boolean' };
  if (
    options.header &&
    PHONE_HEADER.test(normaliseHeader(options.header)) &&
    mostly(
      count(cell => {
        const value = text(cell);
        return PHONE.test(value) && value.replace(/\D/g, '').length >= 7;
      })
    )
  ) {
    return { type: 'phone' };
  }
  // Codes with a leading zero stay text, so "05001" keeps its zero.
  if (count(cell => typeof cell === 'string' && LEADING_ZERO.test(cell.trim()))) {
    return { type: 'text' };
  }
  const numberOf = (cell: ImportCell) =>
    typeof cell === 'number'
      ? cell
      : parseNumber(text(cell), options.decimalMark)?.value;
  const integers = count(cell => {
    const n = numberOf(cell);
    return n !== undefined && Number.isSafeInteger(n);
  });
  const decimals = count(cell => {
    const n = numberOf(cell);
    return n !== undefined && Number.isFinite(n);
  });
  // 0/1 alone is still a number column: a quantity of 1 is common. A
  // column with any fractions is decimal, so none of them is refused.
  if (decimals > integers && mostly(decimals)) return { type: 'decimal' };
  if (mostly(integers)) return { type: 'integer' };
  if (
    mostly(
      count(cell => {
        const word = text(cell).toLowerCase();
        return TRUE_WORDS.has(word) || FALSE_WORDS.has(word);
      })
    )
  ) {
    return { type: 'boolean' };
  }
  if (mostly(count(cell => DATE.test(text(cell))))) return { type: 'date' };
  if (mostly(count(cell => DATETIME.test(text(cell))))) return { type: 'datetime' };
  if (mostly(count(cell => EMAIL.test(text(cell))))) return { type: 'email' };
  if (mostly(count(cell => URL.test(text(cell))))) return { type: 'url' };
  if (
    mostly(
      count(cell => PHONE.test(text(cell)) && text(cell).replace(/\D/g, '').length >= 7)
    )
  ) {
    return { type: 'phone' };
  }
  if (cells.some(cell => text(cell).length > LONG_TEXT_LENGTH)) {
    return { type: 'long_text' };
  }
  const distinct = new Map<string, string>();
  for (const cell of cells) {
    const value = text(cell);
    if (value.length > 100) {
      distinct.clear();
      break;
    }
    const key = value.toLowerCase();
    if (!distinct.has(key)) distinct.set(key, value);
  }
  if (
    distinct.size > 0 &&
    distinct.size <= ENUM_MAX_DISTINCT &&
    distinct.size <= DATA_MAX_ENUM_VALUES &&
    cells.length >= distinct.size * 2
  ) {
    return { type: 'enum', values: [...distinct.values()] };
  }
  return { type: 'text' };
};

// The columns of a new table made from a file: one per header, named from
// it, typed from its values.
export const guessColumns = (
  headers: string[],
  rows: ImportRow[],
  options: { decimalMark?: DecimalMark } = {}
): DataColumnInput[] => {
  const used = new Set<string>();
  return headers.slice(0, DATA_MAX_COLUMNS).map((header, index) => {
    let name = columnNameFromHeader(header, index);
    for (let n = 2; used.has(name); n++) {
      name = `${columnNameFromHeader(header, index).slice(0, 60)}_${n}`;
    }
    used.add(name);
    const guess = guessColumnType(
      rows.map(row => row[index]),
      { decimalMark: options.decimalMark, header }
    );
    const label = header.trim();
    return {
      name,
      type: guess.type,
      ...(label && label !== name ? { label: label.slice(0, 100) } : {}),
      ...(guess.values ? { values: guess.values } : {})
    };
  });
};

// Which column each header fills: matched by name or label, ignoring case,
// accents and punctuation. `null` for a header that matches nothing; the
// owner maps those by hand.
export const matchHeaders = (
  headers: string[],
  table: Pick<DataTable, 'columns'>
): (string | null)[] => {
  const taken = new Set<string>();
  return headers.map(header => {
    const key = normaliseHeader(header);
    if (!key) return null;
    const column = table.columns.find(
      c =>
        !taken.has(c.name) &&
        (normaliseHeader(c.name) === key ||
          (c.label !== null && normaliseHeader(c.label) === key))
    );
    if (!column) return null;
    taken.add(column.name);
    return column.name;
  });
};

// A relation's cells by the referenced table's display value: "Margherita" →
// 12. Keys ignore case, accents and surrounding spaces: a sheet says
// "hawaiana" for the "Hawaiána" row.
export type RelationLookup = Map<string, number>;

export const relationKey = (value: ImportCell) =>
  text(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

// A number read with a guess: "28.000" taken as `read` (28000) when it may
// have meant `alternative` (28). The page words it in the reader's language.
export interface NumberGuess {
  column: string;
  text: string;
  read: number;
  alternative: number;
}

// `warning` marks a value read with a guess, for the preview to show.
export type CellResult =
  | { ok: true; value: unknown; warning?: NumberGuess }
  | { ok: false; error: string };

export interface CellOptions {
  relation?: RelationLookup;
  timeZone?: string;
  decimalMark?: DecimalMark;
}

// One cell as the column will store it, or why it won't fit. The check is
// the database's own, so a row that passes here is refused only for what
// needs the stored rows (a duplicate in a unique column).
export const importCell = (
  table: Pick<DataTable, 'name'>,
  column: DataColumn,
  cell: ImportCell,
  options: CellOptions = {}
): CellResult => {
  if (isBlank(cell)) {
    return column.required
      ? { ok: false, error: `${column.name} is required.` }
      : { ok: true, value: null };
  }
  let value: unknown = typeof cell === 'string' ? cell.trim() : cell;
  let warning: NumberGuess | undefined;
  if (
    (column.type === 'integer' || column.type === 'decimal') &&
    typeof value === 'string'
  ) {
    const parsed = parseNumber(value, options.decimalMark);
    if (parsed) {
      if (parsed.ambiguous) {
        warning = {
          column: column.name,
          text: value,
          read: parsed.value,
          alternative: Number(value.replace(',', '.'))
        };
      }
      value = parsed.value;
    }
  } else if (column.type === 'relation') {
    const asId = typeof value === 'number' ? value : Number(text(cell));
    const found = options.relation?.get(relationKey(cell));
    if (found !== undefined) value = found;
    else if (Number.isSafeInteger(asId) && asId > 0) value = asId;
    else {
      return {
        ok: false,
        error: `${column.name}: "${text(cell)}" matches no row in ${column.table}.`
      };
    }
  } else if (column.type === 'boolean' && typeof value === 'string') {
    const word = value.toLowerCase();
    if (TRUE_WORDS.has(word)) value = true;
    else if (FALSE_WORDS.has(word)) value = false;
  } else if (column.type === 'json' && typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return { ok: false, error: `${column.name} is not valid JSON.` };
    }
  } else if (column.type === 'date' && typeof value === 'string') {
    // A spreadsheet's date with a midnight time.
    value = value.replace(/[T ]00:00(:00(\.0+)?)?Z?$/, '');
  }
  try {
    const stored = toStored(table as DataTable, column, value, options.timeZone);
    // The database refuses these too, but only once a whole batch is sent.
    if (
      column.min !== null &&
      column.min !== undefined &&
      typeof stored === 'number' &&
      stored < column.min
    ) {
      return {
        ok: false,
        error: `${table.name}.${column.name} can't go below ${column.min}.`
      };
    }
    if (column.type === 'boolean') return { ok: true, value: stored === 1 };
    if (column.type === 'json') return { ok: true, value };
    return warning
      ? { ok: true, value: stored, warning }
      : { ok: true, value: stored };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

export interface ImportedRow {
  // The row's place in `rows`.
  index: number;
  // The row's line in the file, 1-based, counting the header.
  line: number;
  values: Record<string, unknown>;
  errors: string[];
  // Values read with a guess; the row is still imported.
  warnings: NumberGuess[];
}

// Every row of the file as the values it will insert, with each problem
// found. `mapping[i]` is the column header i fills, or null to skip it.
// `lines[i]` is row i's line in the file, when blank rows were left out
// before; otherwise rows follow the header one per line.
export const importRows = (
  table: Pick<DataTable, 'name' | 'columns'>,
  mapping: (string | null)[],
  rows: ImportRow[],
  options: {
    relations?: Record<string, RelationLookup>;
    timeZone?: string;
    decimalMark?: DecimalMark;
    lines?: number[];
  } = {}
): ImportedRow[] => {
  const columns = new Map(table.columns.map(c => [c.name, c]));
  const mapped = new Set(mapping.filter((m): m is string => m !== null));
  const missing = table.columns.filter(
    c => c.required && c.default === undefined && !mapped.has(c.name)
  );
  // A unique column's values seen so far, with the line they came from: the
  // database refuses a file that repeats one, and can't say which row did.
  const seen = new Map<string, Map<string, number>>();
  return rows.map((row, index) => {
    const line = options.lines?.[index] ?? index + 2;
    const values: Record<string, unknown> = {};
    const errors = missing.map(c => `${c.name} is required.`);
    const warnings: NumberGuess[] = [];
    mapping.forEach((name, i) => {
      if (name === null) return;
      const column = columns.get(name);
      if (!column) return;
      const result = importCell(table, column, row[i], {
        relation: options.relations?.[name],
        timeZone: options.timeZone,
        decimalMark: options.decimalMark
      });
      if (!result.ok) {
        errors.push(result.error);
        return;
      }
      if (result.value !== null) values[name] = result.value;
      if (result.warning) warnings.push(result.warning);
      if (column.unique && result.value !== null) {
        const key = JSON.stringify(result.value);
        const lines = seen.get(name) ?? new Map<string, number>();
        seen.set(name, lines);
        const first = lines.get(key);
        if (first === undefined) lines.set(key, line);
        else {
          errors.push(
            `${column.name}: "${text(row[i])}" is already on line ${first}, and this column takes each value once.`
          );
        }
      }
    });
    return { index, line, values, errors, warnings };
  });
};

// A CSV line, quoted where it needs to be: for the file of refused rows.
export const csvLine = (cells: ImportCell[]) =>
  cells
    .map(cell => {
      const value = cell === null || cell === undefined ? '' : String(cell);
      return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    })
    .join(',');
