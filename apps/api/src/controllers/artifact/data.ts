import { Context } from 'hono';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';
import { DataError } from '@ganju/utils/data';

import {
  callData,
  createDataUsageTally,
  createDatabase,
  dataCaller,
  dataLimitsFor,
  databaseStub,
  findArtifactDatabase,
  openArtifactDatabase,
  recordChange,
  recordDataUsage,
  restoreDeletedDatabase,
  softDeleteDatabase
} from '../../utils/dataDatabase';

// types
import type { Handler } from 'hono';
import type { OpenedDatabase, DataUsageTally } from '@ganju/db';
import type { DataCaller, ExportState } from '@ganju/utils/data';
import type { DataApiRouteId } from '@ganju/utils/dataApi';
import { AppEnv } from '../../types';

const { constants, Schema } = utils;

// The project's artifact, checked against the organization in the path.
const artifactOf = async (
  c: Context<AppEnv>,
  organizationId: string,
  projectId: string
) => {
  const [row] = await db
    .create(c)
    .select({ id: db.schema.artifact.id, slug: db.schema.artifact.slug })
    .from(db.schema.artifact)
    .innerJoin(
      db.schema.project,
      eq(db.schema.project.id, db.schema.artifact.projectId)
    )
    .where(
      and(
        eq(db.schema.artifact.projectId, projectId),
        eq(db.schema.project.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!row) throw new Error('Artifact not found for the project');
  return row;
};

const present = (row: typeof db.schema.artifactDatabase.$inferSelect) => ({
  id: row.id,
  name: row.name,
  status: row.status,
  error: row.error,
  sizeBytes: row.sizeBytes,
  sizeCheckedAt: row.sizeCheckedAt,
  lastReadAt: row.lastReadAt,
  lastWriteAt: row.lastWriteAt,
  deletedAt: row.deletedAt,
  deleteAfter: row.deleteAfter,
  createdAt: row.createdAt
});

// Who the change log and row history name: the person, or the personal access
// token they made for a pipeline.
const actorOf = (c: Context<AppEnv>) => {
  const token = c.get('apiToken');
  return token ? `cli:${token.id}` : `user:${c.get('user').id}`;
};

// Every schema here is one of utils.Schema's; typed by what it parses to.
interface Parser<T> {
  parseAsync(value: unknown): Promise<T>;
}

const pathOf = <T>(c: Context<AppEnv>, schema: Parser<T>) =>
  schema.parseAsync({ ...c.req.param(), userId: c.get('user').id });

const bodyOf = async <T>(c: Context<AppEnv>, schema: Parser<T>) =>
  schema.parseAsync(await c.req.json().catch(() => ({})));

const queryOf = <T>(c: Context<AppEnv>, schema: Parser<T>) =>
  schema.parseAsync(c.req.query());

// Drops the keys left undefined, so the object sees only what was sent.
const defined = (args: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));

interface DataRequest {
  opened: OpenedDatabase;
  caller: DataCaller;
  tally: DataUsageTally;
  dbInstance: ReturnType<typeof db.create>;
  artifactId: string;
}

// Opens the project's database for one request and adds what the request
// read and wrote to the org's meters once it is answered.
//
// `allowDeleted` also opens a database in its grace period, for the calls the
// object still serves then: "Download a copy" belongs in the banner that
// offers the restore.
const withDatabase = async <T>(
  c: Context<AppEnv>,
  options: { timeZone?: string; allowDeleted?: boolean },
  fn: (request: DataRequest) => Promise<T>
): Promise<T> => {
  const values = await pathOf(c, Schema.DATA_DATABASE_GET);
  const artifact = await artifactOf(c, values.organizationId, values.projectId);
  const dbInstance = db.create(c);
  let opened = await openArtifactDatabase(
    dbInstance,
    c.env.PROJECT_DATABASE,
    artifact.id
  );
  if (!opened && options.allowDeleted) {
    const row = await findArtifactDatabase(dbInstance, artifact.id);
    if (
      row?.status === constants.ARTIFACT_DATABASE_STATUS_DELETING &&
      row.deleteAfter &&
      row.deleteAfter > new Date()
    ) {
      const { plan, limits } = await db.plan.getEffectivePlan(
        dbInstance,
        row.organizationId
      );
      opened = {
        row,
        stub: databaseStub(c.env.PROJECT_DATABASE, row.objectName),
        plan,
        limits: dataLimitsFor(limits)
      };
    }
  }
  if (!opened) {
    throw new DataError("This project doesn't have a database.", 'not_found');
  }
  const tally = createDataUsageTally();
  const caller = dataCaller(opened, {
    actor: actorOf(c),
    timeZone: options.timeZone
  });
  try {
    return await fn({
      opened,
      caller,
      tally,
      dbInstance,
      artifactId: artifact.id
    });
  } finally {
    const usage = recordDataUsage(
      dbInstance,
      opened.row.organizationId,
      opened.row.id,
      tally
    ).catch(error => console.error('data-usage-record-failed', error));
    try {
      c.executionCtx.waitUntil(usage);
    } catch {
      await usage;
    }
  }
};

// A route that is one operation reads better without the "Operation 0
// (update orders):" a list of them needs, and a row that isn't there is a 404,
// not a guard that changed nothing.
const runOne = async (
  request: DataRequest,
  operation: Record<string, unknown>
) => {
  try {
    const { results } = await callData(
      'write',
      () =>
        request.opened.stub.write(request.caller, { operations: [operation] }),
      request.tally
    );
    return results[0] as Record<string, unknown>;
  } catch (error) {
    if (!(error instanceof DataError)) throw error;
    const message = error.message.replace(/^Operation 0 \([^)]*\): /, '');
    // Only the guard's own "Row 9 doesn't exist in menu" is a missing row; a
    // minimum that stopped the change ("can't go below 0") stays a 409.
    if (error.code === 'guard' && /\bRow \d+ doesn't exist in /.test(message)) {
      throw new DataError(
        `There is no row ${String(operation.id)} in ${String(operation.table)}.`,
        'not_found'
      );
    }
    const { operation: _index, ...details } = error.details ?? {};
    throw new DataError(
      message,
      error.code,
      Object.keys(details).length ? details : undefined
    );
  }
};

const readRow = async (
  request: DataRequest,
  table: string,
  id: number,
  include?: string[]
) => {
  const result = (await callData(
    'query',
    () =>
      request.opened.stub.query(
        request.caller,
        defined({ table, where: { id }, limit: 1, include })
      ),
    request.tally,
    { retryRead: true }
  )) as { rows: Record<string, unknown>[] };
  const row = result.rows[0];
  if (!row) {
    throw new DataError(`There is no row ${id} in ${table}.`, 'not_found');
  }
  return row;
};

// The project's database, with its size and tables when it is live, or
// `database: null` when it has none.
const getDatabase = async (c: Context<AppEnv>) => {
  const values = await utils.Schema.DATA_DATABASE_GET.parseAsync({
    projectId: c.req.param('projectId'),
    organizationId: c.req.param('organizationId'),
    userId: c.get('user').id
  });
  const artifact = await artifactOf(c, values.organizationId, values.projectId);
  const dbInstance = db.create(c);
  const row = await findArtifactDatabase(dbInstance, artifact.id);
  if (!row || row.status === constants.ARTIFACT_DATABASE_STATUS_DELETED) {
    return c.json({ database: null });
  }
  if (row.status !== constants.ARTIFACT_DATABASE_STATUS_READY) {
    return c.json({ database: present(row) });
  }
  const stub = databaseStub(c.env.PROJECT_DATABASE, row.objectName);
  let info;
  try {
    info = await callData('info', () => stub.info(), undefined, {
      retryRead: true
    });
  } catch (error) {
    if (!(error instanceof DataError && error.code === 'not_initialised')) {
      throw error;
    }
    // READY in Postgres, but the object was never set up (a create that
    // died between the two, or a row written against another environment's
    // objects). FAILED is what "Try again" picks up: create() reuses the row
    // and its object name and runs init().
    const [failed] = await dbInstance
      .update(db.schema.artifactDatabase)
      .set({
        status: constants.ARTIFACT_DATABASE_STATUS_FAILED,
        error: "The database's storage was never set up."
      })
      .where(
        and(
          eq(db.schema.artifactDatabase.id, row.id),
          eq(
            db.schema.artifactDatabase.status,
            constants.ARTIFACT_DATABASE_STATUS_READY
          )
        )
      )
      .returning();
    return c.json({ database: present(failed ?? row) });
  }
  const [updated] = await dbInstance
    .update(db.schema.artifactDatabase)
    .set({ sizeBytes: info.size, sizeCheckedAt: new Date() })
    .where(eq(db.schema.artifactDatabase.id, row.id))
    .returning();
  return c.json({ database: { ...present(updated), tables: info.tables } });
};

const create = async (c: Context<AppEnv>) => {
  const body = await c.req.json().catch(() => ({}));
  const values = await utils.Schema.DATA_DATABASE_CREATE.parseAsync({
    ...body,
    projectId: c.req.param('projectId'),
    organizationId: c.req.param('organizationId'),
    userId: c.get('user').id
  });
  const artifact = await artifactOf(c, values.organizationId, values.projectId);
  const row = await createDatabase(c, {
    artifactId: artifact.id,
    organizationId: values.organizationId,
    name: values.name ?? artifact.slug,
    userId: values.userId,
    replaceDeleted: values.replaceDeleted
  });
  return c.json({ database: present(row) }, 201);
};

// Deletes with the typed name, restorable for the grace period.
const remove = async (c: Context<AppEnv>) => {
  const body = await c.req.json().catch(() => ({}));
  const values = await utils.Schema.DATA_DATABASE_DELETE.parseAsync({
    ...body,
    projectId: c.req.param('projectId'),
    organizationId: c.req.param('organizationId'),
    userId: c.get('user').id
  });
  const artifact = await artifactOf(c, values.organizationId, values.projectId);
  const row = await findArtifactDatabase(db.create(c), artifact.id);
  if (!row || row.status !== constants.ARTIFACT_DATABASE_STATUS_READY) {
    throw new DataError("This project doesn't have a database.", 'not_found');
  }
  if (values.confirmName !== row.name) {
    throw new DataError(
      `Type the database's name, "${row.name}", to delete it.`,
      'invalid'
    );
  }
  const deleted = await softDeleteDatabase(c, row, actorOf(c));
  return c.json({ database: present(deleted) });
};

// Undoes a delete within the grace period.
const restore = async (c: Context<AppEnv>) => {
  const values = await utils.Schema.DATA_DATABASE_GET.parseAsync({
    projectId: c.req.param('projectId'),
    organizationId: c.req.param('organizationId'),
    userId: c.get('user').id
  });
  const artifact = await artifactOf(c, values.organizationId, values.projectId);
  const row = await findArtifactDatabase(db.create(c), artifact.id);
  if (!row) {
    throw new DataError("This project doesn't have a database.", 'not_found');
  }
  const restored = await restoreDeletedDatabase(c, row, actorOf(c));
  return c.json({ database: present(restored) });
};

// Point-in-time recovery. A bookmark is accepted only when this database's
// change log handed it out, so a client can't aim the object at anything
// else, and only from a change it undoes. A delete's or a purge's bookmark is
// taken after the object is marked deleted: restoring to it would bring the
// database back deleted while its row says READY.
const RESTORABLE_KINDS = [
  'checkpoint',
  'table.drop',
  'column.update',
  'column.drop',
  'restore'
];

const restorePoint = async (c: Context<AppEnv>) => {
  const body = await bodyOf(c, Schema.DATA_RESTORE_POINT_BODY);
  return withDatabase(c, {}, async request => {
    const { opened, caller, dbInstance } = request;
    let result;
    if ('bookmark' in body) {
      const [known] = await dbInstance
        .select({ id: db.schema.artifactDatabaseChange.id })
        .from(db.schema.artifactDatabaseChange)
        .where(
          and(
            eq(db.schema.artifactDatabaseChange.databaseId, opened.row.id),
            eq(db.schema.artifactDatabaseChange.bookmark, body.bookmark),
            inArray(db.schema.artifactDatabaseChange.kind, RESTORABLE_KINDS)
          )
        )
        .limit(1);
      if (!known) {
        throw new DataError(
          'That bookmark is not one to restore to: use the one a checkpoint, a dropped table or column, a type change, or a restore answered with.',
          'restore'
        );
      }
      if (caller.limits?.readOnly) {
        throw new DataError(
          "This organization's plan no longer includes Data, so the database is read-only.",
          'read_only'
        );
      }
      result = await callData(
        'restoreToBookmark',
        () => opened.stub.restoreToBookmark({ bookmark: body.bookmark }),
        request.tally
      );
    } else {
      const timestamp =
        typeof body.timestamp === 'number'
          ? body.timestamp
          : Date.parse(body.timestamp);
      result = await callData(
        'restoreTo',
        () => opened.stub.restoreTo(caller, { timestamp }),
        request.tally
      );
    }
    // Kept with the restore's undo bookmark, so "Undo restore" is a restore
    // to it.
    await recordChange(dbInstance, opened.row.id, {
      actor: caller.actor,
      kind: 'restore',
      detail:
        'bookmark' in body
          ? { bookmark: body.bookmark }
          : { at: body.timestamp },
      bookmark: result.undoBookmark
    });
    return c.json(result);
  });
};

// The database as it is right now, as a bookmark to restore to: the
// dashboard takes one before replacing a table's rows, so "Undo import" goes
// back to exactly that moment. A time can't: the browser's clock may be
// off, and point-in-time lookup is coarser than the writes around it.
const checkpoint = (c: Context<AppEnv>) =>
  withDatabase(c, {}, async request => {
    const { bookmark } = await callData(
      'currentBookmark',
      () => request.opened.stub.currentBookmark(),
      request.tally
    );
    await recordChange(request.dbInstance, request.opened.row.id, {
      actor: request.caller.actor,
      kind: 'checkpoint',
      bookmark
    });
    return c.json({ bookmark });
  });

// Tables

const listTables = (c: Context<AppEnv>) =>
  withDatabase(c, {}, async request => {
    const schema = await callData(
      'schemaRead',
      () => request.opened.stub.schemaRead(),
      request.tally,
      { retryRead: true }
    );
    return c.json({ tables: schema.tables });
  });

const createTable = async (c: Context<AppEnv>) => {
  const input = await bodyOf(c, Schema.DATA_TABLE_INPUT);
  return withDatabase(c, {}, async request => {
    const table = await callData(
      'createTable',
      () => request.opened.stub.createTable(request.caller, input),
      request.tally
    );
    await recordChange(request.dbInstance, request.opened.row.id, {
      actor: request.caller.actor,
      kind: 'table.create',
      target: table.name,
      detail: input
    });
    return c.json({ table }, 201);
  });
};

const updateTable = async (c: Context<AppEnv>) => {
  const { table: name } = await pathOf(c, Schema.DATA_TABLE_PARAMS);
  const patch = await bodyOf(c, Schema.DATA_TABLE_PATCH);
  return withDatabase(c, {}, async request => {
    const table = await callData(
      'updateTable',
      () => request.opened.stub.updateTable(request.caller, name, patch),
      request.tally
    );
    await recordChange(request.dbInstance, request.opened.row.id, {
      actor: request.caller.actor,
      kind: 'table.update',
      target: name,
      detail: patch
    });
    return c.json({ table });
  });
};

const dropTable = async (c: Context<AppEnv>) => {
  const { table: name } = await pathOf(c, Schema.DATA_TABLE_PARAMS);
  const { confirmName } = await bodyOf(c, Schema.DATA_TABLE_DROP_BODY);
  if (confirmName !== name) {
    throw new DataError(
      `Type the table's name, "${name}", to drop it.`,
      'invalid'
    );
  }
  return withDatabase(c, {}, async request => {
    const result = await callData(
      'dropTable',
      () => request.opened.stub.dropTable(request.caller, name),
      request.tally
    );
    await recordChange(request.dbInstance, request.opened.row.id, {
      actor: request.caller.actor,
      kind: 'table.drop',
      target: name,
      bookmark: result.bookmark
    });
    return c.json(result);
  });
};

const addColumn = async (c: Context<AppEnv>) => {
  const { table: name } = await pathOf(c, Schema.DATA_TABLE_PARAMS);
  const input = await bodyOf(c, Schema.DATA_COLUMN_INPUT);
  return withDatabase(c, {}, async request => {
    const table = await callData(
      'addColumn',
      () => request.opened.stub.addColumn(request.caller, name, input),
      request.tally
    );
    await recordChange(request.dbInstance, request.opened.row.id, {
      actor: request.caller.actor,
      kind: 'column.add',
      target: `${name}.${input.name}`,
      detail: input
    });
    return c.json({ table }, 201);
  });
};

const updateColumn = async (c: Context<AppEnv>) => {
  const { table: name, column } = await pathOf(c, Schema.DATA_COLUMN_PARAMS);
  const patch = await bodyOf(c, Schema.DATA_COLUMN_PATCH);
  return withDatabase(c, {}, async request => {
    const result = await callData(
      'updateColumn',
      () =>
        request.opened.stub.updateColumn(request.caller, name, column, patch),
      request.tally
    );
    await recordChange(request.dbInstance, request.opened.row.id, {
      actor: request.caller.actor,
      kind: 'column.update',
      target: `${name}.${column}`,
      detail: patch,
      bookmark: result.bookmark
    });
    return c.json(result);
  });
};

const dropColumn = async (c: Context<AppEnv>) => {
  const { table: name, column } = await pathOf(c, Schema.DATA_COLUMN_PARAMS);
  return withDatabase(c, {}, async request => {
    const result = await callData(
      'dropColumn',
      () => request.opened.stub.dropColumn(request.caller, name, column),
      request.tally
    );
    await recordChange(request.dbInstance, request.opened.row.id, {
      actor: request.caller.actor,
      kind: 'column.drop',
      target: `${name}.${column}`,
      bookmark: result.bookmark
    });
    return c.json(result);
  });
};

// Rows

const listRows = async (c: Context<AppEnv>) => {
  const { table } = await pathOf(c, Schema.DATA_TABLE_PARAMS);
  const query = await queryOf(c, Schema.DATA_ROW_LIST_QUERY);
  return withDatabase(c, { timeZone: query.timeZone }, async request => {
    const result = await callData(
      'query',
      () =>
        request.opened.stub.query(
          request.caller,
          defined({
            table,
            where: query.where,
            sort: query.sort,
            include: query.include,
            limit: query.limit,
            cursor: query.cursor,
            search: query.q
          })
        ),
      request.tally,
      { retryRead: true }
    );
    return c.json(result);
  });
};

const getRow = async (c: Context<AppEnv>) => {
  const { table, id } = await pathOf(c, Schema.DATA_ROW_PARAMS);
  const query = await queryOf(c, Schema.DATA_ROW_GET_QUERY);
  return withDatabase(c, { timeZone: query.timeZone }, async request =>
    c.json({ row: await readRow(request, table, id, query.include) })
  );
};

const createRows = async (c: Context<AppEnv>) => {
  const { table } = await pathOf(c, Schema.DATA_TABLE_PARAMS);
  const body = await bodyOf(c, Schema.DATA_ROW_CREATE_BODY);
  return withDatabase(c, {}, async request => {
    const result = await runOne(request, { op: 'insert', table, ...body });
    const ids = 'ids' in result ? result.ids : [result.id];
    return c.json({ ids }, 201);
  });
};

// Answers with the row as it now is, so the client holds its new version.
const updateRow = async (c: Context<AppEnv>) => {
  const { table, id } = await pathOf(c, Schema.DATA_ROW_PARAMS);
  const body = await bodyOf(c, Schema.DATA_ROW_UPDATE_BODY);
  return withDatabase(c, {}, async request => {
    await runOne(request, defined({ op: 'update', table, id, ...body }));
    return c.json({ row: await readRow(request, table, id) });
  });
};

const deleteRow = async (c: Context<AppEnv>) => {
  const { table, id } = await pathOf(c, Schema.DATA_ROW_PARAMS);
  const body = await bodyOf(c, Schema.DATA_ROW_DELETE_BODY);
  return withDatabase(c, {}, async request => {
    await runOne(request, defined({ op: 'delete', table, id, ...body }));
    return c.json({ deleted: id });
  });
};

const rowHistory = async (c: Context<AppEnv>) => {
  const { table, id } = await pathOf(c, Schema.DATA_ROW_PARAMS);
  const query = await queryOf(c, Schema.DATA_ROW_HISTORY_QUERY);
  return withDatabase(c, { timeZone: query.timeZone }, async request => {
    const result = await callData(
      'history',
      () =>
        request.opened.stub.history(
          request.caller,
          defined({ table, id, limit: query.limit, cursor: query.cursor }) as {
            table: string;
            id: number;
          }
        ),
      request.tally,
      { retryRead: true }
    );
    return c.json(result);
  });
};

const write = async (c: Context<AppEnv>) => {
  const body = await bodyOf(c, Schema.DATA_WRITE_BODY);
  return withDatabase(c, {}, async request => {
    const { results } = await callData(
      'write',
      () => request.opened.stub.write(request.caller, body),
      request.tally
    );
    return c.json({ results });
  });
};

// Export

// What a client sees of an export: no storage keys.
const presentExport = (state: ExportState) => ({
  id: state.id,
  format: state.format,
  status: state.status,
  startedAt: state.startedAt,
  finishedAt: state.finishedAt,
  error: state.error,
  files: state.files.map(file => ({
    table: file.table,
    rows: file.rows,
    bytes: file.bytes
  }))
});

const startExport = async (c: Context<AppEnv>) => {
  const body = await bodyOf(c, Schema.DATA_EXPORT_BODY);
  return withDatabase(c, { allowDeleted: true }, async request => {
    const result = await callData(
      'exportStart',
      () => request.opened.stub.exportStart(request.caller, body),
      request.tally
    );
    await recordChange(request.dbInstance, request.opened.row.id, {
      actor: request.caller.actor,
      kind: 'export',
      detail: { exportId: result.exportId, format: body.format ?? 'jsonl' }
    });
    return c.json(result, 201);
  });
};

const exportStatus = async (c: Context<AppEnv>) => {
  const query = await queryOf(c, Schema.DATA_EXPORT_QUERY);
  return withDatabase(c, { allowDeleted: true }, async request => {
    const state = await callData(
      'exportStatus',
      () => request.opened.stub.exportStatus(defined(query)),
      request.tally,
      { retryRead: true }
    );
    return c.json({ export: presentExport(state) });
  });
};

const exportFile = async (c: Context<AppEnv>) => {
  const query = await queryOf(c, Schema.DATA_EXPORT_FILE_QUERY);
  return withDatabase(c, { allowDeleted: true }, async request => {
    const state = await callData(
      'exportStatus',
      () => request.opened.stub.exportStatus({ exportId: query.exportId }),
      request.tally,
      { retryRead: true }
    );
    if (state.status !== 'done') {
      throw new DataError(
        state.status === 'failed'
          ? `This export failed: ${state.error ?? 'unknown error'}.`
          : 'This export is still running.',
        'conflict'
      );
    }
    const file = state.files.find(f => f.table === (query.table ?? null));
    // Only this project's exports, whatever the object recorded.
    if (!file || !file.key.startsWith(`data-exports/${request.artifactId}/`)) {
      throw new DataError(
        query.table
          ? `This export has no file for ${query.table}.`
          : 'This export has no schema file.',
        'not_found'
      );
    }
    const object = await c.env.STORAGE_BUCKET.get(file.key);
    if (!object) {
      throw new DataError('This export is no longer stored.', 'not_found');
    }
    const name = file.key.split('/').pop()!;
    const type = name.endsWith('.csv')
      ? 'text/csv'
      : name.endsWith('.json')
        ? 'application/json'
        : 'application/x-ndjson';
    return new Response(object.body as unknown as ReadableStream, {
      headers: {
        'content-type': `${type}; charset=utf-8`,
        'content-length': String(object.size),
        'content-disposition': `attachment; filename="${name}"`
      }
    });
  });
};

// The schema change log, newest first. Ids are time-ordered, so the last one
// of a page is the cursor for the next.
const listChanges = async (c: Context<AppEnv>) => {
  const query = await queryOf(c, Schema.DATA_CHANGE_LIST_QUERY);
  return withDatabase(c, {}, async request => {
    const table = db.schema.artifactDatabaseChange;
    const limit = query.limit ?? 50;
    const rows = await request.dbInstance
      .select()
      .from(table)
      .where(
        and(
          eq(table.databaseId, request.opened.row.id),
          query.cursor ? lt(table.id, query.cursor) : undefined
        )
      )
      .orderBy(desc(table.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    return c.json({
      changes: page.map(row => ({
        id: row.id,
        actor: row.actor,
        kind: row.kind,
        target: row.target,
        detail: row.detail,
        bookmark: row.bookmark,
        createdAt: row.createdAt
      })),
      ...(rows.length > limit ? { nextCursor: page[page.length - 1].id } : {})
    });
  });
};

// One handler per route of the Data API; apps/api registers them from
// DATA_API_ROUTES, so a route without a handler doesn't compile.
export const DataController = {
  getDatabase,
  create,
  remove,
  restore,
  restorePoint,
  checkpoint,
  listTables,
  createTable,
  updateTable,
  dropTable,
  addColumn,
  updateColumn,
  dropColumn,
  listRows,
  createRows,
  getRow,
  updateRow,
  deleteRow,
  rowHistory,
  write,
  startExport,
  exportStatus,
  exportFile,
  listChanges
} satisfies Record<DataApiRouteId, Handler<AppEnv>>;
