// The methods a project's database object answers over RPC. apps/data's
// ProjectDatabase implements it; apps/api, apps/mcp and apps/tool-broker call
// it through databaseStub. Every method resolves to a DataResult.
import type {
  DataCaller,
  DataDeleteImpact,
  DataFileLinkChange,
  DataFileLinks,
  DataFileLinksReplaced,
  DataResult,
  DataSchema,
  DataTable,
  DataTableCopy,
  DataTableSync
} from './dataTypes';
import type { SheetSyncArgs } from './dataEngine';
import type { DataQuery } from './dataQueries';
import type { DataTrigger, DataTriggerWithSecret, SavedTrigger } from './dataTriggers';

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
  // The zone set for the database, or null for UTC.
  timeZone: string | null;
  schemaVersion: number;
  size: number;
  // `rows` is about how many: the highest id, read from the index.
  tables: { name: string; label: string | null; columns: number; rows: number }[];
  // A column change copying a large table in the background: table changes,
  // and writes that would change its rows, wait while it runs.
  copy: DataTableCopy | null;
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
  setTimeZone(caller: DataCaller, args: { timeZone: string | null }): R<DatabaseInfo>;
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
  ): R<{ table: DataTable; bookmark: string | null; copy: DataTableCopy | null }>;
  dropColumn(
    caller: DataCaller,
    table: string,
    column: string
  ): R<{ table: DataTable; bookmark: string; copy: DataTableCopy | null }>;
  // Forgets a failed background copy once the owner has seen why.
  dismissCopy(caller: DataCaller): R<{ copy: null }>;
  describe(caller: DataCaller, args?: unknown): R<unknown>;
  query(caller: DataCaller, args: unknown): R<unknown>;
  // A row as a trigger event carries it (`id`, or the newest): for a test
  // send and for a run whose event was too large to carry its row.
  eventRow(
    caller: DataCaller,
    args: { table: string; id?: number }
  ): R<Record<string, unknown> | null>;
  write(
    caller: DataCaller,
    args: unknown
  ): R<{ ok: true; results: unknown[] }>;
  deleteImpact(
    caller: DataCaller,
    args: { table: string; ids?: number[] }
  ): R<DataDeleteImpact>;
  // The rows that link knowledge items, and moving or clearing those links.
  fileLinks(caller: DataCaller, args: { uris: string[] }): R<DataFileLinks>;
  replaceFileLinks(
    caller: DataCaller,
    args: { changes: DataFileLinkChange[] }
  ): R<DataFileLinksReplaced>;
  // A synced table's rows made what its sheet says, all or nothing; and why
  // a sync that never reached the rows was refused.
  syncRows(caller: DataCaller, args: SheetSyncArgs): R<DataTableSync>;
  recordSyncFailure(
    caller: DataCaller,
    args: { table: string; error: string; title?: string | null; version?: string | null }
  ): R<DataTableSync | null>;
  history(
    caller: DataCaller,
    args: { table: string; id: number; limit?: number; cursor?: number }
  ): R<unknown>;
  listQueries(caller: DataCaller): R<DataQuery[]>;
  saveQuery(caller: DataCaller, input: unknown): R<DataQuery>;
  dropQuery(caller: DataCaller, name: string): R<{ dropped: string }>;
  runQuery(
    caller: DataCaller,
    args: { name: string; params?: Record<string, unknown>; limit?: number }
  ): R<{ query: string; rows: Record<string, unknown>[]; truncated?: string }>;
  // Triggers. `pending` counts events waiting for the queue.
  listTriggers(caller: DataCaller): R<{ triggers: DataTrigger[]; pending: number }>;
  getTrigger(nameOrId: string): R<DataTriggerWithSecret>;
  saveTrigger(caller: DataCaller, input: unknown): R<SavedTrigger>;
  dropTrigger(caller: DataCaller, name: string): R<{ dropped: string }>;
  setTriggerEnabled(
    caller: DataCaller,
    args: { name: string; enabled: boolean; reason?: string | null }
  ): R<DataTrigger>;
  replaceManagedTriggers(
    caller: DataCaller,
    inputs: unknown
  ): R<{ triggers: DataTrigger[]; removed: string[]; secrets: Record<string, string> }>;
  clearOutbox(args: { before: number }): R<{ cleared: number }>;
  exportStart(
    caller: DataCaller,
    args?: { format?: ExportFormat }
  ): R<{ exportId: string; status: ExportState['status'] }>;
  exportStatus(args?: { exportId?: string }): R<ExportState>;
}
