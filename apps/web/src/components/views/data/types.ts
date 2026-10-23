import type {
  DataAccess,
  DataColumn,
  DataColumnInput,
  DataColumnType,
  DataOnDelete,
  DataTable
} from '@ganju/utils/data';

export type {
  DataAccess,
  DataColumn,
  DataColumnInput,
  DataColumnType,
  DataOnDelete,
  DataTable
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

// `data` is set when `ok`; `error` (the API's message, or empty) when not.
export interface ApiResult<T> {
  ok: boolean;
  data: T;
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}
