// The shapes and limits shared by a project's database object (apps/data),
// the workers that call it, and the tests. Pure: nothing here touches SQLite.

export const DATA_COLUMN_TYPES = [
  'text',
  'long_text',
  'integer',
  'decimal',
  'boolean',
  'date',
  'datetime',
  'enum',
  'json',
  'email',
  'url',
  'phone',
  'relation',
  'file'
] as const;
export type DataColumnType = (typeof DATA_COLUMN_TYPES)[number];

// What the assistant may do with a table when the caller is restricted (a
// channel bot). Owners, the dashboard, the CLI and functions see every table.
export const DATA_ACCESS_LEVELS = ['none', 'read', 'add', 'full'] as const;
export type DataAccess = (typeof DATA_ACCESS_LEVELS)[number];
export const DATA_ACCESS_RANK: Record<DataAccess, number> = {
  none: 0,
  read: 1,
  add: 2,
  full: 3
};

export const DATA_ON_DELETE = ['restrict', 'cascade', 'set_null'] as const;
export type DataOnDelete = (typeof DATA_ON_DELETE)[number];

export type DataDefaultValue = string | number | boolean | null;

// A column as the owner defines it: the dashboard's form, `ganju.data.json`
// and the table-create body all use this shape.
export interface DataColumnInput {
  name: string;
  type: DataColumnType;
  label?: string | null;
  description?: string | null;
  required?: boolean;
  unique?: boolean;
  filterable?: boolean;
  searchable?: boolean;
  personal?: boolean;
  // enum
  values?: string[];
  // relation: the table it points at, and what deleting that row does
  table?: string;
  onDelete?: DataOnDelete;
  // integer / decimal: the lowest value the column may hold
  min?: number | null;
  default?: DataDefaultValue;
}

export interface DataTableInput {
  name: string;
  label?: string | null;
  description?: string | null;
  displayColumn?: string | null;
  access?: DataAccess;
  customerScoped?: boolean;
  history?: boolean;
  columns: DataColumnInput[];
}

// A column as the database object stores it: the input plus its stable id,
// which names its indexes and constraints so a rename never orphans them.
export interface DataColumn {
  id: number;
  name: string;
  type: DataColumnType;
  label: string | null;
  description: string | null;
  required: boolean;
  unique: boolean;
  filterable: boolean;
  searchable: boolean;
  personal: boolean;
  values: string[] | null;
  table: string | null;
  onDelete: DataOnDelete | null;
  min: number | null;
  default: DataDefaultValue | undefined;
  position: number;
}

export interface DataTable {
  id: number;
  name: string;
  label: string | null;
  description: string | null;
  displayColumn: string | null;
  access: DataAccess;
  customerScoped: boolean;
  history: boolean;
  position: number;
  columns: DataColumn[];
}

export interface DataSchema {
  tables: DataTable[];
}

// Who is calling and under which rules. `actor` is recorded on every row a
// call writes; the storage layer refuses a write without one.
export interface DataCaller {
  // user:<id> · cli:<tokenId> · mcp:<userId> · channel:<participantId> ·
  // function:<toolName> · trigger:<id> · system:<job>
  actor: string;
  // Apply each table's assistant access. Set for channel bots only.
  restricted?: boolean;
  // Customer-scoped tables: fill and filter `participant_id` with this.
  participantId?: string;
  // Datetimes come back in this zone, with the offset.
  timeZone?: string;
  limits?: DataCallerLimits;
}

export interface DataCallerLimits {
  // Writes that add data stop at this size (the plan's ceiling).
  maxBytes?: number | null;
  maxTables?: number | null;
  // The organization left the paid plan: reads and exports only.
  readOnly?: boolean;
}

export interface DataUsage {
  rowsRead: number;
  rowsWritten: number;
}

export const DATA_ERROR_CODES = [
  'invalid',
  'not_found',
  'forbidden',
  'conflict',
  'constraint',
  'guard',
  'too_large',
  'full',
  'read_only',
  'deleted',
  'not_initialised',
  'restore',
  'internal'
] as const;
export type DataErrorCode = (typeof DATA_ERROR_CODES)[number];

// The one error the database object returns. Its message is written for the
// person or model that made the call, never raw SQLite text.
export class DataError extends Error {
  readonly code: DataErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    message: string,
    code: DataErrorCode = 'invalid',
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DataError';
    this.code = code;
    this.details = details;
  }

  // What the API answers with; its error handler reads both.
  get status(): 400 | 403 | 404 | 409 | 500 {
    return DATA_ERROR_STATUS[this.code];
  }

  toBody(): Record<string, unknown> {
    return { code: this.code, ...(this.details ? { details: this.details } : {}) };
  }
}

const DATA_ERROR_STATUS: Record<DataErrorCode, 400 | 403 | 404 | 409 | 500> = {
  invalid: 400,
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  constraint: 409,
  guard: 409,
  too_large: 400,
  full: 409,
  read_only: 403,
  deleted: 409,
  not_initialised: 404,
  restore: 400,
  internal: 500
};

export const isDataError = (error: unknown): error is DataError =>
  error instanceof DataError;

// What every database object method returns. Errors travel as values, not
// throws: an RPC exception keeps only its message, and the caller needs the
// code and the rows read before it.
export type DataResult<T> =
  | { ok: true; value: T; usage: DataUsage }
  | {
      ok: false;
      error: {
        code: DataErrorCode;
        message: string;
        details?: Record<string, unknown>;
      };
      usage: DataUsage;
    };

// Limits. SQLite in a Durable Object allows 100 columns per table, 100 bound
// parameters per statement and 100 KB per statement; the rest are ours.
export const DATA_MAX_PARAMS = 100;
export const DATA_MAX_STATEMENT_BYTES = 90_000;
// 100 minus id, created_at, updated_at, version, created_by, updated_by and
// participant_id.
export const DATA_MAX_COLUMNS = 93;
export const DATA_MAX_TABLES = 50;
export const DATA_DEFAULT_PAGE = 20;
export const DATA_MAX_PAGE = 500;
export const DATA_MAX_RESULT_BYTES = 1024 * 1024;
// Past this many rows, an aggregate or a sort on an unindexed column needs a
// filter on an indexed one: the object serves one request at a time.
export const DATA_LARGE_TABLE_ROWS = 200_000;
export const DATA_MAX_WRITE_OPERATIONS = 50;
export const DATA_MAX_INSERT_ROWS = 500;
export const DATA_MAX_ROWS_PER_WRITE = 5_000;
export const DATA_MAX_VALUE_BYTES = 1_000_000;
export const DATA_MAX_DESCRIPTION = 300;
export const DATA_MAX_LABEL = 100;
export const DATA_MAX_ENUM_VALUES = 100;
export const DATA_MAX_IN_VALUES = 50;
export const DATA_MAX_SORT_KEYS = 3;
export const DATA_MAX_AGGREGATES = 5;
export const DATA_MAX_GROUP_BY = 3;
export const DATA_MAX_GROUPS = 100;
// A type change copies the table in one request up to this size.
export const DATA_REBUILD_MAX_ROWS = 100_000;
export const DATA_HISTORY_DAYS = 90;
