import type {
  DataAccess,
  DataColumn,
  DataColumnInput,
  DataColumnType,
  DataOnDelete,
  DataTable,
  DataTableCopy,
  DataQuery,
  DataQueryParam,
  DataQueryParamType,
  DataTrigger,
  DataTriggerAction,
  DataTriggerActionType,
  DataTriggerCondition,
  DataTriggerEvent,
  DataTriggerTest
} from '@ganju/utils/data';

export type {
  DataAccess,
  DataColumn,
  DataColumnInput,
  DataColumnType,
  DataOnDelete,
  DataTable,
  DataTableCopy,
  DataQuery,
  DataQueryParam,
  DataQueryParamType,
  DataTrigger,
  DataTriggerAction,
  DataTriggerActionType,
  DataTriggerCondition,
  DataTriggerEvent,
  DataTriggerTest
};

export interface Database {
  id: string;
  name: string;
  status: 'CREATING' | 'READY' | 'FAILED' | 'DELETING' | 'PURGING' | 'DELETED';
  error: string | null;
  sizeBytes: number | null;
  sizeCheckedAt: string | null;
  deletedAt: string | null;
  deleteAfter: string | null;
  createdAt: string;
  timeZone?: string | null;
  copy?: DataTableCopy | null;
  indexAdvice?: IndexAdvice[];
}

// An index the daily job suggests adding (`add`), or flags as unused.
export interface IndexAdvice {
  id: string;
  table: string;
  column: string;
  kind: 'add' | 'unused';
  status: 'open' | 'dismissed';
  queries: number;
  avgRowsRead: number;
  avgRowsReturned: number;
  rowsWritten: number;
}

// A relation comes back as the referenced row's id and its display value.
export interface RelationValue {
  id: number;
  label: unknown;
}

export type DataRow = Record<string, unknown> & {
  id: number;
  version?: number;
  created_at: string;
  updated_at: string;
};

export interface RowPage {
  rows: DataRow[];
  total?: number;
  nextCursor?: string;
}

export interface ExportState {
  id: string;
  format: 'jsonl' | 'csv';
  status: 'running' | 'done' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  files: { table: string | null; rows: number; bytes: number }[];
}

// One time a trigger ran (or tried to) for one event, newest first.
export interface DataTriggerRun {
  id: string;
  eventId: string;
  table: string;
  event: DataTriggerEvent;
  rowId: number | null;
  action: string;
  status: 'running' | 'waiting' | 'ok' | 'failed' | 'skipped';
  error: string | null;
  attempts: number;
  durationMs: number | null;
  createdAt: string;
  finishedAt: string | null;
}

// `data` is set when `ok`; `error` (the API's message, or empty) when not.
export interface ApiResult<T> {
  ok: boolean;
  data: T;
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}
