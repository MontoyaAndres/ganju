import { and, eq } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';
import {
  DATA_SHEET_MAX_BYTES,
  DATA_SHEET_MAX_ROWS,
  DATA_SHEET_SYNC_ACTOR,
  DataError
} from '@ganju/utils/data';
import {
  importRows,
  isTabularMimeType,
  matchHeaders,
  readTabularFile,
  relationKey,
  type RelationLookup,
  type SheetJs
} from '@ganju/utils/dataImport';

import {
  assertFileUrisExist,
  callData,
  callDataMetered,
  createDataUsageTally,
  dataCaller,
  openArtifactDatabase,
  recordChange,
  recordDataUsage
} from './dataDatabase';

import type { DataSchema, DataTable, SheetSyncArgs } from '@ganju/utils/data';
import type { Bindings } from '../types';

// A table's sync from its sheet, one job per table on the index queue: the
// file's content changed (a Drive or OneDrive fetch, an upload, a replace),
// its source was set, or the owner pressed "Sync now".
export interface SheetSyncJob {
  kind: 'sheet-sync';
  artifactId: string;
  table: string;
  // The owner asked for it ("Sync now", a new source): counted as using the
  // database. A sync after the file changed on its own is Ganju's.
  manual?: boolean;
}

export const enqueueSheetSyncs = async (
  env: Bindings,
  artifactId: string,
  tables: string[],
  options: { manual?: boolean } = {}
): Promise<void> => {
  if (tables.length === 0 || !env.INDEX_QUEUE) return;
  await env.INDEX_QUEUE.sendBatch(
    tables.map(table => ({
      body: {
        kind: 'sheet-sync',
        artifactId,
        table,
        ...(options.manual ? { manual: true } : {})
      } satisfies SheetSyncJob
    }))
  );
};

// The tables synced from `uri`, each queued. Ganju reading for itself: billed,
// but it isn't the owner using the database.
export const queueSheetSyncsFor = async (
  env: Bindings,
  resource: { artifactId: string; uri: string; mimeType: string | null },
  options: { manual?: boolean } = {}
): Promise<string[]> => {
  if (!isTabularMimeType(resource.mimeType)) return [];
  const dbInstance = db.create({ env });
  const opened = await openArtifactDatabase(
    dbInstance,
    env.PROJECT_DATABASE,
    resource.artifactId
  );
  if (!opened) return [];
  const schema = await callDataMetered(
    dbInstance,
    opened.row,
    'schemaRead',
    () => opened.stub.schemaRead(),
    { retryRead: true, ganju: true }
  );
  const tables = schema.tables
    .filter(t => t.source?.uri === resource.uri)
    .map(t => t.name);
  await enqueueSheetSyncs(env, resource.artifactId, tables, options);
  return tables;
};

// The knowledge item a source names, for the dashboard and the API to check
// before saving it.
export const sheetSourceItem = async (
  executor: ReturnType<typeof db.create>,
  artifactId: string,
  uri: string
): Promise<{ title: string; mimeType: string }> => {
  const items = await db.data.knowledgeItemsByUri(executor, artifactId, [uri]);
  const item = items.get(uri);
  if (!item) {
    throw new DataError(
      `There is no file ${uri} in the project's knowledge.`,
      'not_found'
    );
  }
  if (!isTabularMimeType(item.mimeType)) {
    throw new DataError(
      `${item.title} is ${item.mimeType}; a table syncs from a spreadsheet or CSV.`
    );
  }
  return item;
};

// Relation cells name the related row by its display value, as an import
// reads them.
const relationLookups = async (
  table: DataTable,
  schema: DataSchema,
  mapping: (string | null)[],
  rows: unknown[][],
  lookup: (
    table: string,
    where: Record<string, unknown>
  ) => Promise<Record<string, unknown>[]>
): Promise<Record<string, RelationLookup>> => {
  const relations: Record<string, RelationLookup> = {};
  for (const [i, name] of mapping.entries()) {
    const column = table.columns.find(c => c.name === name);
    if (!column || column.type !== 'relation' || !column.table) continue;
    const related = schema.tables.find(t => t.name === column.table);
    const display = related?.displayColumn;
    if (!related || !display) continue;
    const values = [
      ...new Set(
        rows
          .map(r => r[i])
          .filter(
            (v): v is string =>
              typeof v === 'string' && v !== '' && !/^\d+$/.test(v)
          )
      )
    ];
    const found: RelationLookup = new Map();
    for (let start = 0; start < values.length; start += 50) {
      for (const row of await lookup(related.name, {
        [display]: { in: values.slice(start, start + 50) }
      })) {
        const key = relationKey(row[display] as string);
        if (key) found.set(key, Number(row.id));
      }
    }
    relations[column.name] = found;
  }
  return relations;
};

// Reads the table's source and hands its rows to the database, which applies
// them in one transaction. A file that can't be read or a line that doesn't
// fit changes nothing; the table keeps why. Anything else is thrown for the
// queue to try again.
export const runSheetSync = async (
  env: Bindings,
  job: SheetSyncJob
): Promise<void> => {
  const dbInstance = db.create({ env });
  const opened = await openArtifactDatabase(
    dbInstance,
    env.PROJECT_DATABASE,
    job.artifactId
  );
  if (!opened) return;
  const tally = createDataUsageTally();
  const caller = dataCaller(opened, { actor: DATA_SHEET_SYNC_ACTOR });
  const stub = opened.stub;
  try {
    const schema = await callData(
      'schemaRead',
      () => stub.schemaRead(),
      tally,
      {
        retryRead: true
      }
    );
    const table = schema.tables.find(t => t.name === job.table);
    const source = table?.source;
    if (!table || !source) return;
    let title = source.title ?? null;
    // When the file was stored: the database skips a sync of an older one.
    let version: string | null = null;
    let args: SheetSyncArgs;
    try {
      const [resource] = await dbInstance
        .select({
          title: db.schema.artifactResource.title,
          mimeType: db.schema.artifactResource.mimeType,
          fileKey: db.schema.artifactResource.fileKey,
          size: db.schema.artifactResource.size,
          content: db.schema.artifactResource.content,
          updatedAt: db.schema.artifactResource.updatedAt
        })
        .from(db.schema.artifactResource)
        .where(
          and(
            eq(db.schema.artifactResource.artifactId, job.artifactId),
            eq(db.schema.artifactResource.uri, source.uri)
          )
        )
        .limit(1);
      if (!resource) {
        throw new DataError(
          `${title ?? source.uri} is no longer in the project's knowledge; pick the file again, or stop syncing ${table.name}.`,
          'not_found'
        );
      }
      title = resource.title;
      if (!isTabularMimeType(resource.mimeType)) {
        throw new DataError(
          `${resource.title} is ${resource.mimeType ?? 'not a known type'}; a table syncs from a spreadsheet or CSV.`
        );
      }
      if (
        resource.size !== null &&
        Number(resource.size) > DATA_SHEET_MAX_BYTES
      ) {
        throw new DataError(
          `${resource.title} is over ${DATA_SHEET_MAX_BYTES / (1024 * 1024)} MB; a synced table reads files up to that size.`,
          'too_large'
        );
      }
      let bytes: ArrayBuffer;
      if (resource.fileKey) {
        const object = await env.STORAGE_BUCKET.get(resource.fileKey);
        // A missing object is storage failing, not the sheet: tried again.
        if (!object)
          throw new Error(
            `sheet sync: ${resource.fileKey} is missing from storage`
          );
        if (object.size > DATA_SHEET_MAX_BYTES) {
          throw new DataError(
            `${resource.title} is over ${DATA_SHEET_MAX_BYTES / (1024 * 1024)} MB; a synced table reads files up to that size.`,
            'too_large'
          );
        }
        version = object.uploaded.toISOString();
        bytes = await object.arrayBuffer();
      } else {
        version = resource.updatedAt ? resource.updatedAt.toISOString() : null;
        bytes = new TextEncoder().encode(resource.content ?? '')
          .buffer as ArrayBuffer;
      }
      const file = await readTabularFile({
        bytes,
        mimeType: resource.mimeType,
        uri: source.uri,
        sheet: source.sheet,
        // SheetJS loads only for a spreadsheet.
        loadSheetJs: async () => (await import('xlsx')) as unknown as SheetJs
      });
      if (file.rows.length > DATA_SHEET_MAX_ROWS) {
        throw new DataError(
          `The sheet has ${file.rows.length.toLocaleString('en-US')} rows; a synced table takes up to ${DATA_SHEET_MAX_ROWS.toLocaleString('en-US')}.`,
          'too_large'
        );
      }
      const mapping = matchHeaders(file.headers, table);
      if (!mapping.includes(source.key)) {
        throw new DataError(
          `The sheet has no column for ${table.name}'s key, ${source.key}.`
        );
      }
      const relations = await relationLookups(
        table,
        schema,
        mapping,
        file.rows,
        async (name, where) =>
          (
            (await callData(
              'query',
              () => stub.query(caller, { table: name, where, limit: 500 }),
              tally
            )) as { rows: Record<string, unknown>[] }
          ).rows
      );
      const imported = importRows(table, mapping, file.rows, {
        relations,
        timeZone: schema.timeZone ?? undefined,
        lines: file.lines
      });
      // A repeated value is left for the database, which names the key and
      // both lines in the reader's language; anything else is refused here.
      const refused = imported.find(
        row => row.errors.length > row.repeated.length
      );
      if (refused) {
        throw new DataError(`Line ${refused.line}: ${refused.errors[0]}`);
      }
      const rows = imported.map(row => row.values);
      await assertFileUrisExist(
        dbInstance,
        job.artifactId,
        async () => schema,
        [{ op: 'insert', table: table.name, rows }]
      );
      args = {
        table: table.name,
        columns: mapping.filter((m): m is string => m !== null),
        rows,
        lines: imported.map(row => row.line),
        title,
        version
      };
    } catch (error) {
      if (!(error instanceof DataError)) throw error;
      await callData(
        'recordSyncFailure',
        () =>
          stub.recordSyncFailure(caller, {
            table: table.name,
            error: error.message,
            title,
            version
          }),
        tally
      );
      await recordChange(dbInstance, opened.row.id, {
        actor: DATA_SHEET_SYNC_ACTOR,
        kind: 'table.sync',
        target: table.name,
        detail: { uri: source.uri, error: error.message }
      });
      console.warn(
        'data-sheet-sync-refused',
        job.artifactId,
        table.name,
        error.message
      );
      return;
    }
    try {
      const state = await callData(
        'syncRows',
        () => stub.syncRows(caller, args),
        tally
      );
      if (state.stale) {
        console.warn(
          'data-sheet-sync-stale',
          job.artifactId,
          table.name,
          version
        );
      } else if (state.inserted + state.updated + state.deleted > 0) {
        await recordChange(dbInstance, opened.row.id, {
          actor: DATA_SHEET_SYNC_ACTOR,
          kind: 'table.sync',
          target: table.name,
          detail: {
            uri: source.uri,
            inserted: state.inserted,
            updated: state.updated,
            deleted: state.deleted
          }
        });
      }
    } catch (error) {
      // The database kept why on the table.
      if (!(error instanceof DataError)) throw error;
      await recordChange(dbInstance, opened.row.id, {
        actor: DATA_SHEET_SYNC_ACTOR,
        kind: 'table.sync',
        target: table.name,
        detail: { uri: source.uri, error: error.message }
      });
      console.warn(
        'data-sheet-sync-refused',
        job.artifactId,
        table.name,
        error.message
      );
    }
  } finally {
    // Billed either way; only a sync the owner asked for is them using the
    // database, so a sheet that changes on its own never keeps one "in use".
    await recordDataUsage(
      dbInstance,
      opened.row.organizationId,
      opened.row.id,
      tally,
      new Date(),
      { activity: job.manual === true }
    ).catch(error => console.error('data-usage-record-failed', error));
  }
};

// After the queue gave up on a sync: the table says so, so the owner isn't
// left looking at an old "synced" line.
export const recordSheetSyncGaveUp = async (
  env: Bindings,
  job: SheetSyncJob
): Promise<void> => {
  try {
    const dbInstance = db.create({ env });
    const opened = await openArtifactDatabase(
      dbInstance,
      env.PROJECT_DATABASE,
      job.artifactId
    );
    if (!opened) return;
    await callDataMetered(
      dbInstance,
      opened.row,
      'recordSyncFailure',
      () =>
        opened.stub.recordSyncFailure(
          { actor: DATA_SHEET_SYNC_ACTOR },
          {
            table: job.table,
            error: new DataError(
              'The sheet could not be read; try "Sync now" again in a few minutes.'
            ).message
          }
        ),
      { ganju: true }
    );
  } catch (error) {
    console.error(
      'data-sheet-sync-give-up-failed',
      job.artifactId,
      job.table,
      error
    );
  }
};

export const isSheetSyncJob = (job: unknown): job is SheetSyncJob =>
  !!job &&
  typeof job === 'object' &&
  (job as { kind?: unknown }).kind === 'sheet-sync';

// A Drive or OneDrive file is fetched again before "Sync now" reads it.
export const sheetSourceProvider = (
  uri: string
): 'gdrive' | 'onedrive' | null =>
  uri.startsWith(utils.constants.GOOGLE_DRIVE_URI_PREFIX)
    ? 'gdrive'
    : uri.startsWith(utils.constants.ONE_DRIVE_URI_PREFIX)
      ? 'onedrive'
      : null;
