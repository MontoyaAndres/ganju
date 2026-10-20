import { DurableObject } from 'cloudflare:workers';
import {
  DataError,
  addColumn,
  columnChangeNeedsRebuild,
  createTable,
  describe,
  dropColumn,
  dropColumnNeedsRebuild,
  dropTable,
  exportRows,
  getMeta,
  hasInternalTables,
  loadSchema,
  migrateInternal,
  pruneHistory,
  query,
  rowHistory,
  setMeta,
  toTableInput,
  updateColumn,
  updateTable,
  write,
  INTERNAL_SCHEMA_VERSION
} from '@ganju/utils/data';
import type {
  DatabaseInfo,
  DataCaller,
  DataResult,
  DataSchema,
  DataUsage,
  ExportFormat,
  ExportState,
  ProjectDatabaseRpc,
  SqlRow,
  SqlRunner,
  SqlValue
} from '@ganju/utils/data';

import type { Env } from './types';

// History pruning runs once a day per database, a batch at a time.
const PRUNE_INTERVAL_MS = 86_400_000;
const PRUNE_BATCH = 5_000;
// A table's first export step reads about this much, so a small table is one
// plain object. R2 parts other than the last must be at least 5 MiB and all
// the same size, so a larger table is cut at exactly EXPORT_PART_BYTES: each
// later step reads what tops up the bytes carried over to one part, and only
// the overflow past it (under a row) waits in R2 for the next step.
const EXPORT_STEP_BYTES = 1024 * 1024;
const EXPORT_PART_BYTES = 5 * 1024 * 1024;
const EXPORT_PREFIX = 'data-exports';
// Rows read and written by the alarm (exports, history pruning), billed to
// the next call, which is the only thing that reports usage.
const UNREPORTED_USAGE_KEY = 'unreported_usage';
// Point-in-time recovery keeps 30 days.
const RESTORE_WINDOW_MS = 30 * 86_400_000;

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const validTimeZone = (zone: unknown): string | undefined => {
  if (typeof zone !== 'string' || !zone) return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return undefined;
  }
};

const concatBytes = (
  a: Uint8Array<ArrayBuffer>,
  b: Uint8Array<ArrayBuffer>
): Uint8Array<ArrayBuffer> => {
  if (a.byteLength === 0) return b;
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a);
  out.set(b, a.byteLength);
  return out;
};

const csvCell = (value: SqlValue): string => {
  if (value === null) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

interface CallOptions {
  // init is the only call a database that was never created may take.
  init?: boolean;
  // undelete, export and the purge still run on a database marked deleted.
  allowDeleted?: boolean;
  // A table copy needs foreign keys off, set before anything is written.
  foreignKeysOff?: boolean;
}

// One project's database. Only our Workers can reach it (through the
// `PROJECT_DATABASE` binding); every method returns a DataResult with the
// rows the call read and wrote, never a raw SQLite error.
export class ProjectDatabase
  extends DurableObject<Env>
  implements ProjectDatabaseRpc
{
  private schemaCache: DataSchema | null = null;
  // Whether the database was created and whether it is marked deleted, read
  // once per object start; the calls that change either clear it.
  private lifecycle: { initialized: boolean; deleted: boolean } | null = null;
  // Usage the alarm left to report: undefined until read once after a start.
  private unreported: DataUsage | null | undefined = undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Our own tables move forward the first time a database is used after a
    // deploy. A database that was never created has nothing to migrate, and
    // creating tables in it here would make it hold data nobody knows about.
    ctx.blockConcurrencyWhile(async () => {
      const runner = this.runner({ rowsRead: 0, rowsWritten: 0 });
      if (hasInternalTables(runner)) migrateInternal(runner);
    });
  }

  private runner(usage: DataUsage): SqlRunner {
    const sql = this.ctx.storage.sql;
    return {
      all: (statement: string, params: readonly SqlValue[] = []) => {
        const cursor = sql.exec(statement, ...params);
        const rows = cursor.toArray() as SqlRow[];
        usage.rowsRead += cursor.rowsRead;
        usage.rowsWritten += cursor.rowsWritten;
        return rows;
      },
      // Counted when the caller stops, early or not: what was read so far.
      iterate: function* (statement: string, params: readonly SqlValue[] = []) {
        const cursor = sql.exec(statement, ...params);
        try {
          for (const row of cursor) yield row as SqlRow;
        } finally {
          usage.rowsRead += cursor.rowsRead;
          usage.rowsWritten += cursor.rowsWritten;
        }
      },
      transaction: <T>(fn: () => T): T => this.ctx.storage.transactionSync(fn),
      databaseSize: () => sql.databaseSize
    };
  }

  private schema(runner: SqlRunner): DataSchema {
    if (!this.schemaCache) this.schemaCache = loadSchema(runner);
    return this.schemaCache;
  }

  private async call<T>(
    options: CallOptions,
    fn: (runner: SqlRunner) => T | Promise<T>
  ): Promise<DataResult<T>> {
    const usage: DataUsage = { rowsRead: 0, rowsWritten: 0 };
    const runner = this.runner(usage);
    try {
      // `PRAGMA foreign_keys = OFF` lasts until the object restarts and only
      // takes effect before the request's first write, so every request sets
      // it first thing, ON unless it is the one copying a table.
      runner.all(`PRAGMA foreign_keys = ${options.foreignKeysOff ? 'OFF' : 'ON'}`);
      if (!options.init) {
        const lifecycle = this.readLifecycle(runner);
        if (!lifecycle.initialized) {
          throw new DataError(
            "This project doesn't have a database yet.",
            'not_initialised'
          );
        }
        if (!options.allowDeleted && lifecycle.deleted) {
          throw new DataError(
            'This database is deleted. It can be restored until its grace period ends.',
            'deleted'
          );
        }
        this.reportAlarmUsage(runner, usage);
      }
      const value = await fn(runner);
      return { ok: true, value, usage };
    } catch (error) {
      if (error instanceof DataError) {
        return {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {})
          },
          usage
        };
      }
      console.error('project-database-error', errorText(error));
      return {
        ok: false,
        error: { code: 'internal', message: 'The database failed unexpectedly; try again.' },
        usage
      };
    }
  }

  // Adds what the alarm read and wrote since the last call to this call's
  // usage, once.
  private reportAlarmUsage(runner: SqlRunner, usage: DataUsage) {
    if (this.unreported === undefined) {
      const raw = getMeta(runner, UNREPORTED_USAGE_KEY);
      this.unreported = raw ? (JSON.parse(raw) as DataUsage) : null;
    }
    if (!this.unreported) return;
    usage.rowsRead += this.unreported.rowsRead;
    usage.rowsWritten += this.unreported.rowsWritten;
    setMeta(runner, UNREPORTED_USAGE_KEY, null);
    this.unreported = null;
  }

  private keepAlarmUsage(runner: SqlRunner, usage: DataUsage) {
    if (usage.rowsRead === 0 && usage.rowsWritten === 0) return;
    const raw = getMeta(runner, UNREPORTED_USAGE_KEY);
    const before = raw ? (JSON.parse(raw) as DataUsage) : { rowsRead: 0, rowsWritten: 0 };
    const total = {
      rowsRead: before.rowsRead + usage.rowsRead,
      rowsWritten: before.rowsWritten + usage.rowsWritten
    };
    setMeta(runner, UNREPORTED_USAGE_KEY, JSON.stringify(total));
    this.unreported = total;
  }

  private readLifecycle(runner: SqlRunner) {
    if (!this.lifecycle) {
      const exists = hasInternalTables(runner);
      this.lifecycle = {
        initialized: exists && Boolean(getMeta(runner, 'initialized_at')),
        deleted: exists && Boolean(getMeta(runner, 'deleted_at'))
      };
    }
    return this.lifecycle;
  }

  private caller(caller: DataCaller): DataCaller {
    return { ...caller, timeZone: validTimeZone(caller?.timeZone) };
  }

  private recordFirstWrite(runner: SqlRunner) {
    if (!getMeta(runner, 'first_write_at')) {
      setMeta(runner, 'first_write_at', new Date().toISOString());
    }
  }

  // Changes to the tables themselves invalidate the cached schema, even when
  // they fail halfway: the transaction rolled back, but re-reading is cheap.
  private ddl<T>(runner: SqlRunner, fn: () => T): T {
    try {
      const result = fn();
      this.recordFirstWrite(runner);
      return result;
    } finally {
      this.schemaCache = null;
    }
  }

  private async bookmark(): Promise<string> {
    return this.ctx.storage.getCurrentBookmark();
  }

  // Lifecycle

  // Idempotent: a second "Create database" finishes the first rather than
  // making two. The artifact id is the object's name; storing it guards
  // against a binding addressing the wrong object.
  async init(args: { artifactId: string; name: string }) {
    return this.call({ init: true }, async runner => {
      migrateInternal(runner);
      const existing = getMeta(runner, 'artifact_id');
      if (existing && existing !== args.artifactId) {
        throw new DataError('This database belongs to another project.', 'conflict');
      }
      if (getMeta(runner, 'deleted_at')) {
        throw new DataError(
          'This database is deleted. Restore it instead of creating it again.',
          'deleted'
        );
      }
      if (!existing) setMeta(runner, 'artifact_id', args.artifactId);
      setMeta(runner, 'name', args.name);
      if (!getMeta(runner, 'initialized_at')) {
        setMeta(runner, 'initialized_at', new Date().toISOString());
      }
      this.lifecycle = null;
      await this.scheduleAlarm(Date.now() + PRUNE_INTERVAL_MS);
      return this.readInfo(runner);
    });
  }

  private readInfo(runner: SqlRunner): DatabaseInfo {
    const schema = this.schema(runner);
    return {
      artifactId: getMeta(runner, 'artifact_id'),
      name: getMeta(runner, 'name'),
      initializedAt: getMeta(runner, 'initialized_at'),
      deletedAt: getMeta(runner, 'deleted_at'),
      firstWriteAt: getMeta(runner, 'first_write_at'),
      schemaVersion: INTERNAL_SCHEMA_VERSION,
      size: runner.databaseSize(),
      tables: schema.tables.map(t => ({
        name: t.name,
        label: t.label,
        columns: t.columns.length
      }))
    };
  }

  async info() {
    return this.call({ allowDeleted: true }, runner => this.readInfo(runner));
  }

  async rename(args: { name: string }) {
    return this.call({}, runner => {
      setMeta(runner, 'name', args.name);
      return this.readInfo(runner);
    });
  }

  async size() {
    return this.call({ allowDeleted: true }, runner => ({
      bytes: runner.databaseSize()
    }));
  }

  // The soft delete: every call but undelete, export and info is refused
  // from here on. The bookmark is what restores the data after the purge's
  // deleteAll(), since time-based lookup finds no history then.
  async markDeleted(caller: DataCaller) {
    return this.call({ allowDeleted: true }, async runner => {
      if (!getMeta(runner, 'deleted_at')) {
        setMeta(runner, 'deleted_at', new Date().toISOString());
        setMeta(runner, 'deleted_by', caller.actor);
      }
      this.lifecycle = null;
      return { deletedAt: getMeta(runner, 'deleted_at'), bookmark: await this.bookmark() };
    });
  }

  async undelete(caller: DataCaller) {
    return this.call({ allowDeleted: true }, runner => {
      setMeta(runner, 'deleted_at', null);
      setMeta(runner, 'deleted_by', null);
      setMeta(runner, 'undeleted_by', caller.actor);
      this.lifecycle = null;
      return this.readInfo(runner);
    });
  }

  // Frees the storage once the grace period is over. Only a database marked
  // deleted can be purged.
  async purge() {
    return this.call({ allowDeleted: true }, async runner => {
      if (!getMeta(runner, 'deleted_at')) {
        throw new DataError('Only a deleted database can be purged.', 'conflict');
      }
      const bookmark = await this.bookmark();
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      this.schemaCache = null;
      this.lifecycle = null;
      this.unreported = null;
      return { purged: true as const, bookmark };
    });
  }

  // Point-in-time recovery

  async currentBookmark() {
    return this.call({ allowDeleted: true }, async () => ({
      bookmark: await this.bookmark()
    }));
  }

  // Replaces everything with the database as it was at `timestamp`. The
  // object restarts to do it, so the reply carries the bookmark that undoes
  // the restore; calls in flight during the restart fail.
  async restoreTo(caller: DataCaller, args: { timestamp: number }) {
    return this.call({}, async runner => {
      if (caller.limits?.readOnly) {
        throw new DataError(
          "This organization's plan no longer includes Data, so the database is read-only.",
          'read_only'
        );
      }
      const at = Number(args.timestamp);
      const now = Date.now();
      if (!Number.isFinite(at) || at > now || at < now - RESTORE_WINDOW_MS) {
        throw new DataError('A restore point is a time within the last 30 days.', 'restore');
      }
      const firstWrite = getMeta(runner, 'first_write_at');
      let bookmark: string;
      try {
        bookmark = await this.ctx.storage.getBookmarkForTime(at);
      } catch (error) {
        const text = errorText(error);
        throw new DataError(
          /no history/i.test(text)
            ? 'This database has no history yet; restore points start about a minute after its first change.'
            : /before this database existed/i.test(text)
              ? `That time is before this database had any data${firstWrite ? ` (its first change was ${firstWrite})` : ''}.`
              : `That restore point isn't available: ${text}`,
          'restore'
        );
      }
      return this.restore(bookmark);
    });
  }

  // Undoes a restore, or brings back a purged database from the bookmark
  // its row kept, so it runs whatever state the object is in.
  async restoreToBookmark(args: { bookmark: string }) {
    return this.call({ init: true }, async () => {
      if (typeof args.bookmark !== 'string' || !args.bookmark) {
        throw new DataError('A restore needs a bookmark.', 'restore');
      }
      return this.restore(args.bookmark);
    });
  }

  private async restore(bookmark: string) {
    const undo = await this.ctx.storage.onNextSessionRestoreBookmark(bookmark);
    this.schemaCache = null;
    this.lifecycle = null;
    this.unreported = undefined;
    // abort() ends this call too, so it waits until the reply has left.
    setTimeout(() => this.ctx.abort('restore'), 50);
    return { bookmark, undoBookmark: undo };
  }

  // Schema

  async schemaRead() {
    return this.call({}, runner => this.schema(runner));
  }

  async createTable(caller: DataCaller, input: unknown) {
    return this.call({}, runner =>
      this.ddl(runner, () =>
        createTable(runner, this.schema(runner), this.caller(caller), input)
      )
    );
  }

  async updateTable(caller: DataCaller, table: string, patch: unknown) {
    return this.call({}, runner =>
      this.ddl(runner, () =>
        updateTable(runner, this.schema(runner), this.caller(caller), table, patch)
      )
    );
  }

  // Returns the bookmark from just before, so "undo" is one restore.
  async dropTable(caller: DataCaller, table: string) {
    return this.call({}, async runner => {
      const bookmark = await this.bookmark();
      const result = this.ddl(runner, () =>
        dropTable(runner, this.schema(runner), this.caller(caller), table)
      );
      return { ...result, bookmark };
    });
  }

  async addColumn(caller: DataCaller, table: string, input: unknown) {
    return this.call({}, runner =>
      this.ddl(runner, () =>
        addColumn(runner, this.schema(runner), this.caller(caller), table, input)
      )
    );
  }

  async updateColumn(
    caller: DataCaller,
    table: string,
    column: string,
    patch: unknown
  ) {
    const copies = this.peekSchema(schema =>
      columnChangeNeedsRebuild(schema, table, column, patch)
    );
    return this.call({ foreignKeysOff: copies }, async runner => {
      const bookmark = copies ? await this.bookmark() : null;
      const result = this.ddl(runner, () =>
        updateColumn(runner, this.schema(runner), this.caller(caller), table, column, patch)
      );
      return { table: result, bookmark };
    });
  }

  async dropColumn(caller: DataCaller, table: string, column: string) {
    const copies = this.peekSchema(schema =>
      dropColumnNeedsRebuild(schema, table, column)
    );
    return this.call({ foreignKeysOff: copies }, async runner => {
      const bookmark = await this.bookmark();
      const result = this.ddl(runner, () =>
        dropColumn(runner, this.schema(runner), this.caller(caller), table, column)
      );
      return { table: result, bookmark };
    });
  }

  // Reads the schema before a call decides how it starts (a table copy has
  // to switch foreign keys off before anything else). Reads only.
  private peekSchema(fn: (schema: DataSchema) => boolean): boolean {
    try {
      const runner = this.runner({ rowsRead: 0, rowsWritten: 0 });
      if (!hasInternalTables(runner)) return false;
      return fn(this.schema(runner));
    } catch {
      return false;
    }
  }

  // Rows

  async describe(caller: DataCaller, args: unknown = {}) {
    return this.call({}, runner =>
      describe(runner, this.schema(runner), this.caller(caller), args)
    );
  }

  async query(caller: DataCaller, args: unknown) {
    return this.call({}, runner =>
      query(runner, this.schema(runner), this.caller(caller), args)
    );
  }

  async write(caller: DataCaller, args: unknown) {
    return this.call({}, runner => {
      const result = write(runner, this.schema(runner), this.caller(caller), args);
      this.recordFirstWrite(runner);
      return result;
    });
  }

  async history(
    caller: DataCaller,
    args: { table: string; id: number; limit?: number; cursor?: number }
  ) {
    return this.call({}, runner =>
      rowHistory(runner, this.schema(runner), this.caller(caller), args)
    );
  }

  // Export

  // Starts writing a copy to R2: schema.json, then one file per table. The
  // object's alarm writes it a step at a time, so other calls are served in
  // between; exportStatus says when it is done and where the files are.
  async exportStart(caller: DataCaller, args: { format?: ExportFormat } = {}) {
    return this.call({ allowDeleted: true }, async runner => {
      const format = args.format ?? 'jsonl';
      if (format !== 'jsonl' && format !== 'csv') {
        throw new DataError('"format" is jsonl or csv.');
      }
      const current = this.readExport(runner);
      if (current?.status === 'running') {
        throw new DataError('An export is already running.', 'conflict', {
          exportId: current.id
        });
      }
      const schema = loadSchema(runner);
      const id = crypto.randomUUID();
      const artifactId = getMeta(runner, 'artifact_id') ?? 'unknown';
      const prefix = `${EXPORT_PREFIX}/${artifactId}/${id}`;
      const schemaKey = `${prefix}/schema.json`;
      const body = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          format,
          tables: schema.tables.map(toTableInput)
        },
        null,
        2
      );
      await this.env.STORAGE_BUCKET.put(schemaKey, body, {
        httpMetadata: { contentType: 'application/json' }
      });
      const state: ExportState = {
        id,
        format,
        status: 'running',
        startedAt: new Date().toISOString(),
        finishedAt: null,
        actor: caller.actor,
        tables: schema.tables.map(t => t.name),
        tableIndex: 0,
        afterId: 0,
        upload: null,
        files: [{ table: null, key: schemaKey, rows: 0, bytes: body.length }],
        error: null
      };
      setMeta(runner, 'export', JSON.stringify(state));
      await this.scheduleAlarm(Date.now());
      return { exportId: id, status: state.status };
    });
  }

  async exportStatus(args: { exportId?: string } = {}) {
    return this.call({ allowDeleted: true }, runner => {
      const state = this.readExport(runner);
      if (!state || (args.exportId && state.id !== args.exportId)) {
        throw new DataError('No such export.', 'not_found');
      }
      return state;
    });
  }

  private readExport(runner: SqlRunner): ExportState | null {
    const raw = getMeta(runner, 'export');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ExportState;
    } catch {
      return null;
    }
  }

  private exportKey(runner: SqlRunner, state: ExportState, table: string) {
    const artifactId = getMeta(runner, 'artifact_id') ?? 'unknown';
    return `${EXPORT_PREFIX}/${artifactId}/${state.id}/${table}.${state.format}`;
  }

  // Writes one step of the running export: EXPORT_STEP_BYTES of rows, or one
  // part's worth once the table is being uploaded in parts.
  // Returns true while there is more.
  private async exportStep(runner: SqlRunner): Promise<boolean> {
    const state = this.readExport(runner);
    if (!state || state.status !== 'running') return false;
    const save = () => setMeta(runner, 'export', JSON.stringify(state));
    try {
      const schema = loadSchema(runner);
      const name = state.tables[state.tableIndex];
      if (name === undefined) {
        state.status = 'done';
        state.finishedAt = new Date().toISOString();
        save();
        return false;
      }
      const table = schema.tables.find(t => t.name === name);
      if (!table) {
        // Dropped while exporting: skip it.
        state.tableIndex++;
        state.afterId = 0;
        save();
        return true;
      }
      const columns = [
        'id',
        ...table.columns.map(c => c.name),
        'created_at',
        'updated_at',
        'version',
        'created_by',
        'updated_by',
        'participant_id'
      ];
      const encoder = new TextEncoder();
      const bucket = this.env.STORAGE_BUCKET;
      let carried: Uint8Array<ArrayBuffer> = new Uint8Array(0);
      if (state.upload?.carryKey) {
        const object = await bucket.get(state.upload.carryKey);
        if (!object) throw new Error('the export lost the bytes kept between steps');
        carried = new Uint8Array(await object.arrayBuffer());
      }
      const budget = state.upload
        ? Math.max(EXPORT_STEP_BYTES, EXPORT_PART_BYTES - carried.byteLength)
        : EXPORT_STEP_BYTES;
      const lines: string[] = [];
      let bytes = 0;
      let rows = 0;
      let ended = true;
      if (state.format === 'csv' && state.afterId === 0 && !state.upload) {
        const header = columns.map(csvCell).join(',');
        lines.push(header);
        bytes += encoder.encode(header).byteLength + 1;
      }
      for (const row of exportRows(runner, table, state.afterId)) {
        if (bytes >= budget) {
          ended = false;
          break;
        }
        const line =
          state.format === 'csv'
            ? columns.map(c => csvCell(row[c] ?? null)).join(',')
            : JSON.stringify(Object.fromEntries(columns.map(c => [c, row[c] ?? null])));
        lines.push(line);
        bytes += encoder.encode(line).byteLength + 1;
        rows++;
        state.afterId = Number(row.id);
      }
      const chunk = encoder.encode(lines.length ? `${lines.join('\n')}\n` : '');
      const key = this.exportKey(runner, state, table.name);
      if (!state.upload && ended) {
        await bucket.put(key, chunk);
        state.files.push({ table: table.name, key, rows, bytes: chunk.byteLength });
      } else {
        const upload = state.upload
          ? bucket.resumeMultipartUpload(key, state.upload.uploadId)
          : await bucket.createMultipartUpload(key);
        if (!state.upload) {
          state.upload = {
            key,
            uploadId: upload.uploadId,
            parts: [],
            rows: 0,
            bytes: 0,
            carryKey: null
          };
        }
        const current = state.upload;
        current.rows += rows;
        current.bytes += chunk.byteLength;
        let pending = concatBytes(carried, chunk);
        while (pending.byteLength >= EXPORT_PART_BYTES) {
          const part = await upload.uploadPart(
            current.parts.length + 1,
            pending.slice(0, EXPORT_PART_BYTES)
          );
          current.parts.push({ partNumber: part.partNumber, etag: part.etag });
          pending = pending.slice(EXPORT_PART_BYTES);
        }
        const carryKey = `${key}.carry`;
        if (ended) {
          if (current.parts.length === 0) {
            // Smaller than one part after all: a plain object.
            await upload.abort();
            await bucket.put(key, pending);
          } else {
            if (pending.byteLength > 0) {
              const part = await upload.uploadPart(current.parts.length + 1, pending);
              current.parts.push({ partNumber: part.partNumber, etag: part.etag });
            }
            await upload.complete(current.parts);
          }
          if (current.carryKey) await bucket.delete(current.carryKey);
          state.files.push({ table: table.name, key, rows: current.rows, bytes: current.bytes });
          state.upload = null;
        } else if (pending.byteLength > 0) {
          await bucket.put(carryKey, pending);
          current.carryKey = carryKey;
        } else if (current.carryKey) {
          await bucket.delete(current.carryKey);
          current.carryKey = null;
        }
      }
      if (ended) {
        state.tableIndex++;
        state.afterId = 0;
      }
      save();
      return true;
    } catch (error) {
      state.status = 'failed';
      state.error = errorText(error);
      state.finishedAt = new Date().toISOString();
      save();
      console.error('project-database-export-failed', state.id, state.error);
      return false;
    }
  }

  // Alarm: export steps first, then the daily history prune.

  private async scheduleAlarm(at: number) {
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > at) await this.ctx.storage.setAlarm(at);
  }

  async alarm() {
    const usage: DataUsage = { rowsRead: 0, rowsWritten: 0 };
    const runner = this.runner(usage);
    if (!hasInternalTables(runner) || !getMeta(runner, 'initialized_at')) return;
    runner.all('PRAGMA foreign_keys = ON');
    try {
      await this.alarmStep(runner);
    } finally {
      this.keepAlarmUsage(runner, usage);
    }
  }

  private async alarmStep(runner: SqlRunner) {
    if (await this.exportStep(runner)) {
      await this.ctx.storage.setAlarm(Date.now());
      return;
    }
    if (getMeta(runner, 'deleted_at')) return;
    const lastPrune = Number(getMeta(runner, 'history_pruned_at') ?? 0);
    if (Date.now() - lastPrune >= PRUNE_INTERVAL_MS - 60_000) {
      const pruned = pruneHistory(runner, new Date(), PRUNE_BATCH);
      if (pruned === PRUNE_BATCH) {
        await this.ctx.storage.setAlarm(Date.now() + 1_000);
        return;
      }
      setMeta(runner, 'history_pruned_at', String(Date.now()));
    }
    await this.ctx.storage.setAlarm(Date.now() + PRUNE_INTERVAL_MS);
  }
}
