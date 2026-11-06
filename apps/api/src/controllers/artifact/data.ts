import { Context } from 'hono';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';
import {
  DataError,
  normaliseCustomerAction,
  renderCustomerMessage
} from '@ganju/utils/data';

import {
  callData,
  callDataMetered,
  createDataUsageTally,
  createDatabase,
  dataCaller,
  dataLimitsFor,
  databaseStub,
  findArtifactDatabase,
  openArtifactDatabase,
  recordChange,
  recordDataUsage,
  assertFileUrisExist,
  resolveFileValues,
  restoreDeletedDatabase,
  softDeleteDatabase
} from '../../utils/dataDatabase';
import {
  checkTriggerTargets,
  requestEmailConfirmations
} from '../../utils/dataTriggers';
import {
  enqueueSheetSyncs,
  sheetSourceItem,
  sheetSourceProvider
} from '../../utils/dataSheetSync';
import { enqueueGdriveFile, enqueueOnedriveFile } from '../../utils/queue';
import { consumeRateLimit, rateLimited } from '../../middleware/rateLimit';

// types
import type { Handler } from 'hono';
import type {
  ChannelSendResult,
  DbExecutor,
  IndexAdviceRow,
  OpenedDatabase,
  DataUsageTally
} from '@ganju/db';
import type {
  DataCaller,
  DataTriggerEventMessage,
  ExportState
} from '@ganju/utils/data';
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

// An index suggestion as the dashboard and the CLI show it.
const presentAdvice = (row: IndexAdviceRow) => ({
  id: row.id,
  table: row.tableName,
  column: row.columnName,
  kind: row.kind,
  status: row.status,
  queries: row.queries,
  avgRowsRead: row.avgRowsRead,
  avgRowsReturned: row.avgRowsReturned,
  rowsWritten: row.rowsWritten,
  updatedAt: row.updatedAt
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

// A file column takes the uri of a resource the project has.
const assertFileUris = (request: DataRequest, operations: unknown) =>
  assertFileUrisExist(
    request.dbInstance,
    request.artifactId,
    () =>
      callData('schemaRead', () => request.opened.stub.schemaRead(), request.tally, {
        retryRead: true
      }),
    operations
  );

// A route that is one operation reads better without the "Operation 0
// (update orders):" a list of them needs, and a row that isn't there is a 404,
// not a guard that changed nothing.
const runOne = async (
  request: DataRequest,
  operation: Record<string, unknown>
) => {
  await assertFileUris(request, [operation]);
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
  if (!result.rows[0]) {
    throw new DataError(`There is no row ${id} in ${table}.`, 'not_found');
  }
  // Resolved on the whole result: it says where the file values are.
  await resolveFileValues(request.dbInstance, request.artifactId, result, {
    withId: true
  });
  return result.rows[0];
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
    info = await callDataMetered(dbInstance, row, 'info', () => stub.info(), {
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
  const advice = await db.dataAdvice
    .listIndexAdvice(dbInstance, row.id)
    .catch(error => {
      console.error('data-index-advice-read-failed', error);
      return [];
    });
  return c.json({
    database: {
      ...present(updated),
      timeZone: info.timeZone,
      tables: info.tables,
      copy: info.copy,
      indexAdvice: advice.map(presentAdvice)
    }
  });
};

const updateDatabase = async (c: Context<AppEnv>) => {
  const body = await bodyOf(c, Schema.DATA_DATABASE_PATCH);
  return withDatabase(c, {}, async request => {
    const info = await callData(
      'setTimeZone',
      () => request.opened.stub.setTimeZone(request.caller, body),
      request.tally
    );
    await recordChange(request.dbInstance, request.opened.row.id, {
      actor: request.caller.actor,
      kind: 'database.update',
      detail: body
    });
    return c.json({
      database: {
        ...present(request.opened.row),
        timeZone: info.timeZone,
        tables: info.tables,
        copy: info.copy
      }
    });
  });
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
    // Outbox events older than this came back with the restore.
    const requestedAt = Date.now();
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
    // Events pending at the restored moment were sent then: dropped, not
    // sent twice. The object is restarting, so this waits for it.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await callData(
          'clearOutbox',
          () => opened.stub.clearOutbox({ before: requestedAt }),
          request.tally
        );
        break;
      } catch (error) {
        if (attempt === 4) console.error('data-clear-outbox-failed', error);
        else
          await new Promise(resolve =>
            setTimeout(resolve, 200 * (attempt + 1))
          );
      }
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

const dismissCopy = (c: Context<AppEnv>) =>
  withDatabase(c, {}, async request =>
    c.json(
      await callData(
        'dismissCopy',
        () => request.opened.stub.dismissCopy(request.caller),
        request.tally
      )
    )
  );

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

// A sheet source names a spreadsheet or CSV the project has; its title goes
// with it, for the message a refused write shows.
const withSourceTitle = async <T extends { source?: { uri: string } | null }>(
  request: DataRequest,
  input: T
): Promise<T> => {
  if (!input.source) return input;
  const item = await sheetSourceItem(request.dbInstance, request.artifactId, input.source.uri);
  return { ...input, source: { ...input.source, title: item.title } };
};

const createTable = async (c: Context<AppEnv>) => {
  const body = await bodyOf(c, Schema.DATA_TABLE_INPUT);
  return withDatabase(c, {}, async request => {
    const input = await withSourceTitle(request, body);
    const table = await callData(
      'createTable',
      () => request.opened.stub.createTable(request.caller, input),
      request.tally
    );
    // The first sync reads the file as it is stored now.
    if (table.source) await enqueueSheetSyncs(c.env, request.artifactId, [table.name], { manual: true });
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
  const body = await bodyOf(c, Schema.DATA_TABLE_PATCH);
  return withDatabase(c, {}, async request => {
    const patch = await withSourceTitle(request, body);
    const table = await callData(
      'updateTable',
      () => request.opened.stub.updateTable(request.caller, name, patch),
      request.tally
    );
    // A new source (or file, sheet or key) syncs right away; sync is reset
    // only then.
    if (table.source && patch.source && !table.sync) {
      await enqueueSheetSyncs(c.env, request.artifactId, [table.name], { manual: true });
    }
    await recordChange(request.dbInstance, request.opened.row.id, {
      actor: request.caller.actor,
      kind: 'table.update',
      target: name,
      detail: patch
    });
    return c.json({ table });
  });
};

// "Sync now": a Drive or OneDrive file is fetched again if it changed, then
// the table reads it; any other file is read as stored.
const syncTable = async (c: Context<AppEnv>) => {
  const { table: name } = await pathOf(c, Schema.DATA_TABLE_PARAMS);
  return withDatabase(c, {}, async request => {
    const schema = await callData(
      'schemaRead',
      () => request.opened.stub.schemaRead(),
      request.tally,
      { retryRead: true }
    );
    const table = schema.tables.find(t => t.name === name);
    if (!table) {
      throw new DataError(
        `Unknown table "${name}". Tables: ${schema.tables.map(t => t.name).join(', ') || '(none)'}.`,
        'not_found'
      );
    }
    if (!table.source) {
      throw new DataError(`${name} isn't synced from a sheet.`, 'conflict');
    }
    if (!(await consumeRateLimit(c, 'SHEET_SYNC_RATE_LIMITER', c.get('user').id))) {
      return rateLimited(
        c,
        'Five syncs a minute at most. Please wait a minute.',
        'rate_limited'
      );
    }
    const [resource] = await request.dbInstance
      .select({ id: db.schema.artifactResource.id })
      .from(db.schema.artifactResource)
      .where(
        and(
          eq(db.schema.artifactResource.artifactId, request.artifactId),
          eq(db.schema.artifactResource.uri, table.source.uri)
        )
      )
      .limit(1);
    const provider = resource ? sheetSourceProvider(table.source.uri) : null;
    if (resource && provider === 'gdrive') {
      await enqueueGdriveFile(c.env, resource.id, { onlyIfChanged: true, sheetSync: true });
    } else if (resource && provider === 'onedrive') {
      await enqueueOnedriveFile(c.env, resource.id, { onlyIfChanged: true, sheetSync: true });
    } else {
      // A missing file is the sync's to report, on the table.
      await enqueueSheetSyncs(c.env, request.artifactId, [table.name], { manual: true });
    }
    return c.json({ queued: true }, 202);
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

// "Add index" on a suggestion: marks the column filterable, which indexes it,
// and logs it as any column change. The suggestion is done with.
const applyIndexAdvice = async (c: Context<AppEnv>) => {
  const { adviceId } = await pathOf(c, Schema.DATA_INDEX_ADVICE_PARAMS);
  return withDatabase(c, {}, async request => {
    const advice = await db.dataAdvice.findIndexAdvice(
      request.dbInstance,
      request.opened.row.id,
      adviceId
    );
    if (!advice) {
      throw new DataError('There is no such index suggestion.', 'not_found');
    }
    if (advice.kind !== constants.DATA_INDEX_ADVICE_ADD) {
      throw new DataError(
        'An unused index is only flagged; remove it from the column if you want to, or dismiss the suggestion.'
      );
    }
    const patch = { filterable: true };
    const result = await callData(
      'updateColumn',
      () =>
        request.opened.stub.updateColumn(
          request.caller,
          advice.tableName,
          advice.columnName,
          patch
        ),
      request.tally
    );
    await recordChange(request.dbInstance, request.opened.row.id, {
      actor: request.caller.actor,
      kind: 'column.update',
      target: `${advice.tableName}.${advice.columnName}`,
      detail: { ...patch, indexAdvice: advice.id },
      bookmark: result.bookmark
    });
    await db.dataAdvice.removeIndexAdvice(request.dbInstance, advice.id);
    return c.json(result);
  });
};

const dismissIndexAdvice = async (c: Context<AppEnv>) => {
  const { adviceId } = await pathOf(c, Schema.DATA_INDEX_ADVICE_PARAMS);
  return withDatabase(c, {}, async request => {
    const advice = await db.dataAdvice.findIndexAdvice(
      request.dbInstance,
      request.opened.row.id,
      adviceId
    );
    if (!advice) {
      throw new DataError('There is no such index suggestion.', 'not_found');
    }
    await db.dataAdvice.dismissIndexAdvice(
      request.dbInstance,
      advice,
      request.caller.actor
    );
    return c.json({ dismissed: true });
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
    return c.json(
      await resolveFileValues(request.dbInstance, request.artifactId, result, {
        withId: true
      })
    );
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

const deletePreview = async (c: Context<AppEnv>) => {
  const { table } = await pathOf(c, Schema.DATA_TABLE_PARAMS);
  const body = await bodyOf(c, Schema.DATA_DELETE_PREVIEW_BODY);
  return withDatabase(c, {}, async request =>
    c.json(
      await callData(
        'deleteImpact',
        () =>
          request.opened.stub.deleteImpact(
            request.caller,
            body.ids ? { table, ids: body.ids } : { table }
          ),
        request.tally,
        { retryRead: true }
      )
    )
  );
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
    await assertFileUris(request, body.operations);
    const { results } = await callData(
      'write',
      () => request.opened.stub.write(request.caller, body),
      request.tally
    );
    return c.json({ results });
  });
};

// Named queries

const listQueries = (c: Context<AppEnv>) =>
  withDatabase(c, {}, async request =>
    c.json({
      queries: await callData(
        'listQueries',
        () => request.opened.stub.listQueries(request.caller),
        request.tally,
        { retryRead: true }
      )
    })
  );

const saveQuery = async (c: Context<AppEnv>) => {
  const input = await bodyOf(c, Schema.DATA_QUERY_INPUT);
  return withDatabase(c, {}, async request => {
    const query = await callData(
      'saveQuery',
      () => request.opened.stub.saveQuery(request.caller, input),
      request.tally
    );
    await recordChange(request.dbInstance, request.opened.row.id, {
      actor: request.caller.actor,
      kind: 'query.save',
      target: query.name,
      detail: input
    });
    return c.json({ query }, 201);
  });
};

const dropQuery = async (c: Context<AppEnv>) => {
  const { name } = await pathOf(c, Schema.DATA_QUERY_PATH_PARAMS);
  return withDatabase(c, {}, async request => {
    const result = await callData(
      'dropQuery',
      () => request.opened.stub.dropQuery(request.caller, name),
      request.tally
    );
    await recordChange(request.dbInstance, request.opened.row.id, {
      actor: request.caller.actor,
      kind: 'query.drop',
      target: name
    });
    return c.json(result);
  });
};

const runQuery = async (c: Context<AppEnv>) => {
  const { name } = await pathOf(c, Schema.DATA_QUERY_PATH_PARAMS);
  const body = await bodyOf(c, Schema.DATA_QUERY_RUN_BODY);
  return withDatabase(c, { timeZone: body.timeZone }, async request =>
    c.json(
      await callData(
        'runQuery',
        () =>
          request.opened.stub.runQuery(
            request.caller,
            defined({ name, params: body.params, limit: body.limit }) as {
              name: string;
            }
          ),
        request.tally,
        { retryRead: true }
      )
    )
  );
};

// Triggers

const listTriggers = (c: Context<AppEnv>) =>
  withDatabase(c, {}, async request =>
    c.json(
      await callData(
        'listTriggers',
        () => request.opened.stub.listTriggers(request.caller),
        request.tally,
        { retryRead: true }
      )
    )
  );

// Email triggers' addresses that still have to confirm; each gets a link.
// A failure here doesn't undo the save: the runs say who is waiting.
const confirmRecipients = async (
  c: Context<AppEnv>,
  request: {
    dbInstance: DbExecutor;
    artifactId: string;
    organizationId: string;
  },
  inputs: Record<string, unknown>[]
): Promise<string[]> => {
  try {
    const [project] = await request.dbInstance
      .select({ name: db.schema.project.name })
      .from(db.schema.artifact)
      .innerJoin(
        db.schema.project,
        eq(db.schema.project.id, db.schema.artifact.projectId)
      )
      .where(eq(db.schema.artifact.id, request.artifactId))
      .limit(1);
    return await requestEmailConfirmations(
      c,
      request.dbInstance,
      {
        organizationId: request.organizationId,
        projectName: project?.name ?? 'A project'
      },
      inputs
    );
  } catch (error) {
    console.error('data-email-confirm-failed', error);
    return [];
  }
};

// Answers with a new webhook's secret, the only time it is shown.
const saveTrigger = async (c: Context<AppEnv>) => {
  const input = await bodyOf(c, Schema.DATA_TRIGGER_INPUT);
  return withDatabase(c, {}, async request => {
    await checkTriggerTargets(request.dbInstance, request.artifactId, [input]);
    const saved = await callData(
      'saveTrigger',
      () => request.opened.stub.saveTrigger(request.caller, input),
      request.tally
    );
    await recordChange(request.dbInstance, request.opened.row.id, {
      actor: request.caller.actor,
      kind: 'trigger.save',
      target: saved.trigger.name,
      detail: input
    });
    const confirming = await confirmRecipients(
      c,
      {
        dbInstance: request.dbInstance,
        artifactId: request.artifactId,
        organizationId: request.opened.row.organizationId
      },
      [input]
    );
    return c.json(
      { ...saved, ...(confirming.length > 0 ? { confirming } : {}) },
      201
    );
  });
};

const updateTrigger = async (c: Context<AppEnv>) => {
  const { name } = await pathOf(c, Schema.DATA_TRIGGER_PATH_PARAMS);
  const { enabled } = await bodyOf(c, Schema.DATA_TRIGGER_PATCH);
  return withDatabase(c, {}, async request => {
    const trigger = await callData(
      'setTriggerEnabled',
      () =>
        request.opened.stub.setTriggerEnabled(request.caller, {
          name,
          enabled
        }),
      request.tally
    );
    await recordChange(request.dbInstance, request.opened.row.id, {
      actor: request.caller.actor,
      kind: 'trigger.update',
      target: name,
      detail: { enabled }
    });
    return c.json({ trigger });
  });
};

const dropTrigger = async (c: Context<AppEnv>) => {
  const { name } = await pathOf(c, Schema.DATA_TRIGGER_PATH_PARAMS);
  return withDatabase(c, {}, async request => {
    const result = await callData(
      'dropTrigger',
      () => request.opened.stub.dropTrigger(request.caller, name),
      request.tally
    );
    await recordChange(request.dbInstance, request.opened.row.id, {
      actor: request.caller.actor,
      kind: 'trigger.drop',
      target: name
    });
    return c.json(result);
  });
};

const deployTriggers = async (c: Context<AppEnv>) => {
  const { triggers } = await bodyOf(c, Schema.DATA_TRIGGER_DEPLOY_BODY);
  return withDatabase(c, {}, async request => {
    await checkTriggerTargets(request.dbInstance, request.artifactId, triggers);
    const result = await callData(
      'replaceManagedTriggers',
      () =>
        request.opened.stub.replaceManagedTriggers(request.caller, triggers),
      request.tally
    );
    await recordChange(request.dbInstance, request.opened.row.id, {
      actor: request.caller.actor,
      kind: 'trigger.deploy',
      detail: {
        triggers: result.triggers.map(t => t.name),
        removed: result.removed
      }
    });
    const confirming = await confirmRecipients(
      c,
      {
        dbInstance: request.dbInstance,
        artifactId: request.artifactId,
        organizationId: request.opened.row.organizationId
      },
      triggers
    );
    return c.json({
      ...result,
      ...(confirming.length > 0 ? { confirming } : {})
    });
  });
};

const triggerNamed = async (request: DataRequest, name: string) => {
  const { triggers } = await callData(
    'listTriggers',
    () => request.opened.stub.listTriggers(request.caller),
    request.tally,
    { retryRead: true }
  );
  const trigger = triggers.find(t => t.name === name);
  if (!trigger) {
    throw new DataError(`There is no trigger named ${name}.`, 'not_found');
  }
  return trigger;
};

const presentRun = (
  row: typeof db.schema.artifactDatabaseTriggerRun.$inferSelect
) => ({
  id: row.id,
  eventId: row.eventId,
  table: row.tableName,
  event: row.event,
  rowId: row.rowId,
  action: row.action,
  status: row.status,
  error: row.error,
  attempts: row.attempts,
  durationMs: row.durationMs,
  createdAt: row.createdAt,
  finishedAt: row.finishedAt
});

const listTriggerRuns = async (c: Context<AppEnv>) => {
  const { name } = await pathOf(c, Schema.DATA_TRIGGER_PATH_PARAMS);
  const query = await queryOf(c, Schema.DATA_TRIGGER_RUN_LIST_QUERY);
  return withDatabase(c, {}, async request => {
    const trigger = await triggerNamed(request, name);
    const table = db.schema.artifactDatabaseTriggerRun;
    const rows = await request.dbInstance
      .select()
      .from(table)
      .where(
        and(
          eq(table.databaseId, request.opened.row.id),
          eq(table.triggerId, trigger.id)
        )
      )
      .orderBy(desc(table.createdAt))
      .limit(query.limit ?? 50);
    return c.json({ runs: rows.map(presentRun) });
  });
};

// The same event again, with its id: a receiver that saw it can tell.
const retryTriggerRun = async (c: Context<AppEnv>) => {
  const { name, runId } = await pathOf(c, Schema.DATA_TRIGGER_RUN_PARAMS);
  return withDatabase(c, {}, async request => {
    const trigger = await triggerNamed(request, name);
    const table = db.schema.artifactDatabaseTriggerRun;
    const [row] = await request.dbInstance
      .select()
      .from(table)
      .where(
        and(
          eq(table.id, runId),
          eq(table.databaseId, request.opened.row.id),
          eq(table.triggerId, trigger.id)
        )
      )
      .limit(1);
    if (!row) throw new DataError('There is no such run.', 'not_found');
    if (row.status !== 'failed' && row.status !== 'skipped') {
      throw new DataError(
        'Only a failed or skipped run can be tried again.',
        'conflict'
      );
    }
    if (!row.message)
      throw new DataError('This run kept no event to send again.', 'conflict');
    // Marked first: the consumer may finish the run before send returns.
    const [updated] = await request.dbInstance
      .update(table)
      .set({ status: 'waiting', error: null, finishedAt: null })
      .where(eq(table.id, row.id))
      .returning();
    try {
      await c.env.DATA_TRIGGER_QUEUE.send({
        ...(row.message as DataTriggerEventMessage),
        retry: true
      });
    } catch (error) {
      await request.dbInstance
        .update(table)
        .set({
          status: row.status,
          error: row.error,
          finishedAt: row.finishedAt
        })
        .where(eq(table.id, row.id));
      throw error;
    }
    return c.json({ run: presentRun(updated) });
  });
};

// Test sends

// The bot's name as the channel list shows it: the WhatsApp business name or
// number, the Discord or Slack name, or the Telegram @username.
const botLabel = (channel: typeof db.schema.channel.$inferSelect) => {
  const meta = (channel.metadata ?? {}) as Record<
    string,
    { bot?: Record<string, unknown> } | undefined
  >;
  const bot = meta[channel.platform]?.bot ?? {};
  const pick = (...keys: string[]) =>
    keys.map(k => bot[k]).find(v => typeof v === 'string' && v) as
      | string
      | undefined;
  const username = pick('username');
  return (
    pick('verifiedName', 'displayPhoneNumber', 'globalName', 'teamName') ??
    (username ? `@${username}` : null)
  );
};

// The caller's own chats with the project's bots: the identities they linked
// with /link, read directly so a chat counts as soon as it is linked.
const testRecipients = async (request: DataRequest, userId: string) => {
  const rows = await request.dbInstance
    .select({
      participant: db.schema.channelParticipant,
      channel: db.schema.channel
    })
    .from(db.schema.externalIdentity)
    .innerJoin(
      db.schema.channel,
      and(
        eq(db.schema.channel.id, db.schema.externalIdentity.channelId),
        eq(db.schema.channel.platform, db.schema.externalIdentity.provider)
      )
    )
    .innerJoin(
      db.schema.channelParticipant,
      and(
        eq(db.schema.channelParticipant.channelId, db.schema.channel.id),
        eq(
          db.schema.channelParticipant.externalUserId,
          db.schema.externalIdentity.externalId
        )
      )
    )
    .where(
      and(
        eq(db.schema.channel.artifactId, request.artifactId),
        eq(db.schema.externalIdentity.userId, userId)
      )
    )
    .orderBy(desc(db.schema.channelParticipant.updatedAt));
  return rows.map(({ participant, channel }) => ({
    participantId: participant.id,
    channelId: channel.id,
    platform: channel.platform,
    name: participant.displayName,
    bot: botLabel(channel)
  }));
};

const listTestRecipients = async (c: Context<AppEnv>) =>
  withDatabase(c, {}, async request =>
    c.json({ recipients: await testRecipients(request, c.get('user').id) })
  );

// Sends the dialog's customer message to the owner's own chat, built from a
// sample row the way a real run builds it. Not a run: nothing is recorded
// with the trigger, and the daily limit per customer doesn't count it.
const testSend = async (c: Context<AppEnv>) => {
  const body = await bodyOf(c, Schema.DATA_TRIGGER_TEST_SEND_BODY);
  const userId = c.get('user').id;
  return withDatabase(c, {}, async request => {
    // Real runs are paused without Data, so a test of one is too.
    if (request.caller.limits?.readOnly) {
      throw new DataError(
        "This organization's plan no longer includes Data, so its triggers are paused and can't be tested. Upgrade to Pro to send a test.",
        'read_only'
      );
    }
    const schema = await callData(
      'schemaRead',
      () => request.opened.stub.schemaRead(),
      request.tally,
      { retryRead: true }
    );
    const action = normaliseCustomerAction(schema, body.table, body.customer);

    const recipients = await testRecipients(request, userId);
    if (recipients.length === 0) {
      throw new DataError(
        "You haven't linked a chat with this project's bots: write to the bot from your own phone and send /link.",
        'conflict'
      );
    }
    let recipient = recipients[0];
    if (body.participantId) {
      const picked = recipients.find(
        r => r.participantId === body.participantId
      );
      if (!picked) {
        throw new DataError(
          `${body.participantId} isn't one of your linked chats with this project's bots.`,
          'not_found'
        );
      }
      recipient = picked;
    } else if (recipients.length > 1) {
      throw new DataError(
        'Several of your chats are linked to this project\'s bots; pick one with "participantId".'
      );
    }

    // The row as a run's event carries it, so each {{field}} reads as it
    // will for the customer.
    const row = await callData(
      'eventRow',
      () =>
        request.opened.stub.eventRow(request.caller, {
          table: body.table,
          ...(body.rowId ? { id: body.rowId } : {})
        }),
      request.tally,
      { retryRead: true }
    );
    if (!row) {
      throw body.rowId
        ? new DataError(
            `There is no row ${body.rowId} in ${body.table}.`,
            'not_found'
          )
        : new DataError(
            `${body.table} has no rows yet; add one to build the test from.`,
            'not_found'
          );
    }

    const message = renderCustomerMessage(action, row);
    // Counted only once there is something to send, so a refused action
    // doesn't use up the owner's tests.
    if (!(await consumeRateLimit(c, 'TRIGGER_TEST_RATE_LIMITER', userId))) {
      return rateLimited(
        c,
        'Five test sends a minute at most. Please wait a minute.',
        'rate_limited'
      );
    }
    const key = utils.getEnv(c, 'CRYPTO_SECRET');
    if (!key) throw new Error('CRYPTO_SECRET is not configured.');
    let sent: ChannelSendResult;
    try {
      sent = await db.channels.sendToParticipant(request.dbInstance, {
        artifactId: request.artifactId,
        encryptionKey: key,
        participantId: recipient.participantId,
        text: message.text,
        template: message.template,
        ...(body.asTemplate ? { prefer: 'template' as const } : {}),
        source: {
          kind: db.channels.CHANNEL_MESSAGE_SOURCE_TRIGGER_TEST,
          name: body.table
        }
      });
    } catch (error) {
      // The channel's refusal, in words, as the answer. The platform itself
      // failing (502) is ours to retry, not the owner's to change.
      if (error instanceof db.channels.ChannelSendError) {
        throw new DataError(
          error.message,
          error.status === 404
            ? 'not_found'
            : error.status === 400
              ? 'invalid'
              : error.status === 502
                ? 'internal'
                : 'conflict'
        );
      }
      throw error;
    }
    return c.json({
      sent: sent.sent,
      text: sent.sent === 'text' ? message.text : null,
      template: sent.sent === 'template' ? message.template : null,
      rowId: row.id,
      recipient
    });
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
  updateDatabase,
  create,
  remove,
  restore,
  restorePoint,
  checkpoint,
  dismissCopy,
  listTables,
  createTable,
  updateTable,
  syncTable,
  dropTable,
  addColumn,
  updateColumn,
  dropColumn,
  applyIndexAdvice,
  dismissIndexAdvice,
  listRows,
  createRows,
  getRow,
  updateRow,
  deleteRow,
  deletePreview,
  rowHistory,
  write,
  listQueries,
  saveQuery,
  dropQuery,
  runQuery,
  listTriggers,
  saveTrigger,
  updateTrigger,
  dropTrigger,
  deployTriggers,
  listTestRecipients,
  testSend,
  listTriggerRuns,
  retryTriggerRun,
  startExport,
  exportStatus,
  exportFile,
  listChanges
} satisfies Record<DataApiRouteId, Handler<AppEnv>>;
