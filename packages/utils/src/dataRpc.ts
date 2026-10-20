// The methods a project's database object answers over RPC. apps/data's
// ProjectDatabase implements it; apps/api, apps/mcp and apps/tool-broker call
// it through databaseStub. Every method resolves to a DataResult.
import type {
  DataCaller,
  DataResult,
  DataSchema,
  DataTable
} from './dataTypes';

export type ExportFormat = 'jsonl' | 'csv';

export interface ExportFile {
  // null for schema.json
  table: string | null;
  key: string;
  rows: number;
  bytes: number;
}

export interface ExportState {
  id: string;
  format: ExportFormat;
  status: 'running' | 'done' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  actor: string;
  tables: string[];
  tableIndex: number;
  afterId: number;
  upload: {
    key: string;
    uploadId: string;
    parts: { partNumber: number; etag: string }[];
    rows: number;
    bytes: number;
    // Bytes read but not yet uploaded, kept in R2 between steps: every part
    // but the last must be exactly the same size.
    carryKey: string | null;
  } | null;
  files: ExportFile[];
  error: string | null;
}

export interface DatabaseInfo {
  artifactId: string | null;
  name: string | null;
  initializedAt: string | null;
  deletedAt: string | null;
  firstWriteAt: string | null;
  schemaVersion: number;
  size: number;
  tables: { name: string; label: string | null; columns: number }[];
}

export interface RestoreResult {
  bookmark: string;
  undoBookmark: string;
}

type R<T> = Promise<DataResult<T>>;

export interface ProjectDatabaseRpc {
  init(args: { artifactId: string; name: string }): R<DatabaseInfo>;
  info(): R<DatabaseInfo>;
  rename(args: { name: string }): R<DatabaseInfo>;
  size(): R<{ bytes: number }>;
  markDeleted(
    caller: DataCaller
  ): R<{ deletedAt: string | null; bookmark: string }>;
  undelete(caller: DataCaller): R<DatabaseInfo>;
  purge(): R<{ purged: true; bookmark: string }>;
  currentBookmark(): R<{ bookmark: string }>;
  restoreTo(caller: DataCaller, args: { timestamp: number }): R<RestoreResult>;
  restoreToBookmark(args: { bookmark: string }): R<RestoreResult>;
  schemaRead(): R<DataSchema>;
  createTable(caller: DataCaller, input: unknown): R<DataTable>;
  updateTable(caller: DataCaller, table: string, patch: unknown): R<DataTable>;
  dropTable(
    caller: DataCaller,
    table: string
  ): R<{ dropped: string; bookmark: string }>;
  addColumn(caller: DataCaller, table: string, input: unknown): R<DataTable>;
  updateColumn(
    caller: DataCaller,
    table: string,
    column: string,
    patch: unknown
  ): R<{ table: DataTable; bookmark: string | null }>;
  dropColumn(
    caller: DataCaller,
    table: string,
    column: string
  ): R<{ table: DataTable; bookmark: string }>;
  describe(caller: DataCaller, args?: unknown): R<unknown>;
  query(caller: DataCaller, args: unknown): R<unknown>;
  write(
    caller: DataCaller,
    args: unknown
  ): R<{ ok: true; results: unknown[] }>;
  history(
    caller: DataCaller,
    args: { table: string; id: number; limit?: number; cursor?: number }
  ): R<unknown>;
  exportStart(
    caller: DataCaller,
    args?: { format?: ExportFormat }
  ): R<{ exportId: string; status: ExportState['status'] }>;
  exportStatus(args?: { exportId?: string }): R<ExportState>;
}
