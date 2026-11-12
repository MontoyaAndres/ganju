import { and, eq, inArray } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';
import {
  DataError,
  normaliseEmailAction,
  normaliseTrigger,
  renderTriggerText,
  scheduleParams,
  scheduleRowsText,
  localDate,
  DATA_SCHEDULE_MAX_ROWS
} from '@ganju/utils/data';

import {
  callData,
  createDataUsageTally,
  dataCaller,
  dataLimitsFor,
  databaseStub,
  findArtifactDatabase,
  openArtifactDatabase,
  recordChange,
  recordDataUsage,
  assertFileUrisExist
} from '../../utils/dataDatabase';
import {
  checkTriggerTargets,
  emailEach,
  requestEmailConfirmations
} from '../../utils/dataTriggers';
import { enqueueSheetSyncs, sheetSourceItem } from '../../utils/dataSheetSync';

// types
import type {
  Database,
  DbExecutor,
  OpenedDatabase,
  DataUsageTally
} from '@ganju/db';
import type { DataCaller } from '@ganju/utils/data';
import type { Bindings } from '../../types';

const { constants, Schema } = utils;

type Parsed<S extends { parseAsync: (...args: never[]) => Promise<unknown> }> =
  Awaited<ReturnType<S['parseAsync']>>;

export type TableInput = Parsed<typeof Schema.DATA_TABLE_INPUT>;
export type TablePatch = Parsed<typeof Schema.DATA_TABLE_PATCH>;
export type ColumnInput = Parsed<typeof Schema.DATA_COLUMN_INPUT>;
export type ColumnPatch = Parsed<typeof Schema.DATA_COLUMN_PATCH>;
export type WriteBody = Parsed<typeof Schema.DATA_WRITE_BODY>;
export type QueryInput = Parsed<typeof Schema.DATA_QUERY_INPUT>;
export type TriggerInput = Parsed<typeof Schema.DATA_TRIGGER_INPUT>;
export type RestoreBody = Parsed<typeof Schema.DATA_RESTORE_POINT_BODY>;

// What the routes and the builder share.
export interface DataSource {
  env: Bindings;
  db: Database;
  waitUntil?: (promise: Promise<unknown>) => void;
}

export interface DataRequest {
  env: Bindings;
  opened: OpenedDatabase;
  caller: DataCaller;
  tally: DataUsageTally;
  dbInstance: Database;
  artifactId: string;
}

/**
 * Opens the project's database for one call and adds what it read and wrote
 * to the org's meters once it is done.
 *
 * `allowDeleted` also opens a database in its grace period, for the calls the
 * object still serves then: "Download a copy" belongs in the banner that
 * offers the restore.
 */
export const withDataRequest = async <T>(
  source: DataSource,
  target: { artifactId: string; actor: string },
  options: { timeZone?: string; allowDeleted?: boolean },
  fn: (request: DataRequest) => Promise<T>
): Promise<T> => {
  const dbInstance = source.db;
  let opened = await openArtifactDatabase(
    dbInstance,
    source.env.PROJECT_DATABASE,
    target.artifactId
  );
  if (!opened && options.allowDeleted) {
    const row = await findArtifactDatabase(dbInstance, target.artifactId);
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
        stub: databaseStub(source.env.PROJECT_DATABASE, row.objectName),
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
    actor: target.actor,
    timeZone: options.timeZone
  });
  try {
    return await fn({
      env: source.env,
      opened,
      caller,
      tally,
      dbInstance,
      artifactId: target.artifactId
    });
  } finally {
    const usage = recordDataUsage(
      dbInstance,
      opened.row.organizationId,
      opened.row.id,
      tally
    ).catch(error => console.error('data-usage-record-failed', error));
    try {
      if (!source.waitUntil) throw new Error('no waitUntil');
      source.waitUntil(usage);
    } catch {
      await usage;
    }
  }
};

const change = (
  request: DataRequest,
  entry: Omit<Parameters<typeof recordChange>[2], 'actor'>
) =>
  recordChange(request.dbInstance, request.opened.row.id, {
    actor: request.caller.actor,
    ...entry
  });

// A file column takes the uri of a resource the project has.
export const assertFileUris = (request: DataRequest, operations: unknown) =>
  assertFileUrisExist(
    request.dbInstance,
    request.artifactId,
    () =>
      callData(
        'schemaRead',
        () => request.opened.stub.schemaRead(),
        request.tally,
        {
          retryRead: true
        }
      ),
    operations
  );

export const readSchema = (request: DataRequest) =>
  callData(
    'schemaRead',
    () => request.opened.stub.schemaRead(),
    request.tally,
    {
      retryRead: true
    }
  );

// A sheet source names a spreadsheet or CSV the project has; its title goes
// with it, for the message a refused write shows.
const withSourceTitle = async <T extends { source?: { uri: string } | null }>(
  request: DataRequest,
  input: T
): Promise<T> => {
  if (!input.source) return input;
  const item = await sheetSourceItem(
    request.dbInstance,
    request.artifactId,
    input.source.uri
  );
  return { ...input, source: { ...input.source, title: item.title } };
};

// Tables

export const createTable = async (request: DataRequest, body: TableInput) => {
  const input = await withSourceTitle(request, body);
  const table = await callData(
    'createTable',
    () => request.opened.stub.createTable(request.caller, input),
    request.tally
  );
  // The first sync reads the file as it is stored now.
  if (table.source)
    await enqueueSheetSyncs(request.env, request.artifactId, [table.name], {
      manual: true
    });
  await change(request, {
    kind: 'table.create',
    target: table.name,
    detail: input
  });
  return table;
};

export const updateTable = async (
  request: DataRequest,
  name: string,
  body: TablePatch
) => {
  const patch = await withSourceTitle(request, body);
  const table = await callData(
    'updateTable',
    () => request.opened.stub.updateTable(request.caller, name, patch),
    request.tally
  );
  // A new source (or file, sheet or key) syncs right away; sync is reset
  // only then.
  if (table.source && patch.source && !table.sync) {
    await enqueueSheetSyncs(request.env, request.artifactId, [table.name], {
      manual: true
    });
  }
  await change(request, { kind: 'table.update', target: name, detail: patch });
  return table;
};

export const dropTable = async (request: DataRequest, name: string) => {
  const result = await callData(
    'dropTable',
    () => request.opened.stub.dropTable(request.caller, name),
    request.tally
  );
  await change(request, {
    kind: 'table.drop',
    target: name,
    bookmark: result.bookmark
  });
  return result;
};

export const addColumn = async (
  request: DataRequest,
  name: string,
  input: ColumnInput
) => {
  const table = await callData(
    'addColumn',
    () => request.opened.stub.addColumn(request.caller, name, input),
    request.tally
  );
  await change(request, {
    kind: 'column.add',
    target: `${name}.${input.name}`,
    detail: input
  });
  return table;
};

export const updateColumn = async (
  request: DataRequest,
  name: string,
  column: string,
  patch: ColumnPatch
) => {
  const result = await callData(
    'updateColumn',
    () => request.opened.stub.updateColumn(request.caller, name, column, patch),
    request.tally
  );
  await change(request, {
    kind: 'column.update',
    target: `${name}.${column}`,
    detail: patch,
    bookmark: result.bookmark
  });
  return result;
};

export const dropColumn = async (
  request: DataRequest,
  name: string,
  column: string
) => {
  const result = await callData(
    'dropColumn',
    () => request.opened.stub.dropColumn(request.caller, name, column),
    request.tally
  );
  await change(request, {
    kind: 'column.drop',
    target: `${name}.${column}`,
    bookmark: result.bookmark
  });
  return result;
};

// Rows

export const write = async (request: DataRequest, body: WriteBody) => {
  await assertFileUris(request, body.operations);
  const { results } = await callData(
    'write',
    () => request.opened.stub.write(request.caller, body),
    request.tally
  );
  return results as Record<string, unknown>[];
};

// Named queries

export const listQueries = (request: DataRequest) =>
  callData(
    'listQueries',
    () => request.opened.stub.listQueries(request.caller),
    request.tally,
    {
      retryRead: true
    }
  );

export const saveQuery = async (request: DataRequest, input: QueryInput) => {
  const query = await callData(
    'saveQuery',
    () => request.opened.stub.saveQuery(request.caller, input),
    request.tally
  );
  await change(request, {
    kind: 'query.save',
    target: query.name,
    detail: input
  });
  return query;
};

export const dropQuery = async (request: DataRequest, name: string) => {
  const result = await callData(
    'dropQuery',
    () => request.opened.stub.dropQuery(request.caller, name),
    request.tally
  );
  await change(request, { kind: 'query.drop', target: name });
  return result;
};

// Triggers

export const listTriggers = (request: DataRequest) =>
  callData(
    'listTriggers',
    () => request.opened.stub.listTriggers(request.caller),
    request.tally,
    {
      retryRead: true
    }
  );

// Email triggers' addresses that still have to confirm; each gets a link.
// A failure here doesn't undo the save: the runs say who is waiting.
export const confirmRecipients = async (
  source: { env: Bindings },
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
      source,
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
export const saveTrigger = async (
  request: DataRequest,
  input: TriggerInput
) => {
  await checkTriggerTargets(request.dbInstance, request.artifactId, [input]);
  const saved = await callData(
    'saveTrigger',
    () => request.opened.stub.saveTrigger(request.caller, input),
    request.tally
  );
  await change(request, {
    kind: 'trigger.save',
    target: saved.trigger.name,
    detail: input
  });
  const confirming = await confirmRecipients(
    request,
    {
      dbInstance: request.dbInstance,
      artifactId: request.artifactId,
      organizationId: request.opened.row.organizationId
    },
    [input]
  );
  return { ...saved, ...(confirming.length > 0 ? { confirming } : {}) };
};

export const setTriggerEnabled = async (
  request: DataRequest,
  name: string,
  enabled: boolean
) => {
  const trigger = await callData(
    'setTriggerEnabled',
    () =>
      request.opened.stub.setTriggerEnabled(request.caller, { name, enabled }),
    request.tally
  );
  await change(request, {
    kind: 'trigger.update',
    target: name,
    detail: { enabled }
  });
  return trigger;
};

export const dropTrigger = async (request: DataRequest, name: string) => {
  const result = await callData(
    'dropTrigger',
    () => request.opened.stub.dropTrigger(request.caller, name),
    request.tally
  );
  await change(request, { kind: 'trigger.drop', target: name });
  return result;
};

/**
 * Sends an email action as a run would write it for one row (the newest by
 * default) to the caller's own address only, whatever its "to" says. Not a
 * run: nothing is recorded with the trigger.
 */
export const testSendEmail = async (
  request: DataRequest,
  body: { table: string; email: unknown; rowId?: number },
  to: string
) => {
  // Real runs are paused without Data, so a test of one is too.
  if (request.caller.limits?.readOnly) {
    throw new DataError(
      "This organization's plan no longer includes Data, so its triggers are paused and can't be tested. Upgrade to Pro to send a test.",
      'read_only'
    );
  }
  const schema = await readSchema(request);
  const action = normaliseEmailAction(schema, body.table, body.email);
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
  const subject = `[Test] ${renderTriggerText(action.subject, row)}`.slice(
    0,
    200
  );
  const text = renderTriggerText(action.text, row);
  const failed = await emailEach(request, [to], { subject, text });
  if (failed.length > 0) {
    throw new DataError(
      "The test email couldn't be sent. Try again in a minute.",
      'internal'
    );
  }
  return { sent: 'email' as const, to, subject, text, rowId: row.id };
};

/**
 * A schedule's email as tonight's run would send it, now, to `to`: its saved
 * query run for today, the rows listed after the text.
 */
export const testSendScheduleEmail = async (
  request: DataRequest,
  body: {
    query?: string | null;
    params?: Record<string, unknown> | null;
    email: unknown;
    // The query as staged, not saved yet: run without saving it.
    draft?: { name: string } & Record<string, unknown>;
  },
  to: string
) => {
  if (request.caller.limits?.readOnly) {
    throw new DataError(
      "This organization's plan no longer includes Data, so its triggers are paused and can't be tested. Upgrade to Pro to send a test.",
      'read_only'
    );
  }
  const schema = await readSchema(request);
  const trigger = normaliseTrigger(schema, {
    on: 'schedule',
    every: 'day',
    at: '00:00',
    query: body.draft?.name ?? body.query ?? null,
    params: body.params ?? null,
    email: body.email
  });
  if (trigger.action.type !== 'email') {
    throw new DataError('"email" is { "to", "subject", "text" }.');
  }
  const now = new Date();
  const timeZone = schema.timeZone ?? undefined;
  let rows: Record<string, unknown>[] = [];
  const query = trigger.query;
  if (query) {
    const params = scheduleParams(trigger.params, now, timeZone);
    const draft = body.draft;
    const result = await callData(
      'runQuery',
      () =>
        draft
          ? request.opened.stub.runDraftQuery(request.caller, {
              query: draft,
              params,
              limit: DATA_SCHEDULE_MAX_ROWS
            })
          : request.opened.stub.runQuery(request.caller, {
              name: query,
              params,
              limit: DATA_SCHEDULE_MAX_ROWS
            }),
      request.tally,
      { retryRead: true }
    );
    rows = result.rows as Record<string, unknown>[];
  }
  const fields = { date: localDate(now, timeZone), count: rows.length };
  const subject =
    `[Test] ${renderTriggerText(trigger.action.subject, fields)}`.slice(0, 200);
  const text =
    renderTriggerText(trigger.action.text, fields) +
    (rows.length ? `\n\n${scheduleRowsText(rows, rows.length)}` : '');
  const failed = await emailEach(request, [to], { subject, text });
  if (failed.length > 0) {
    throw new DataError(
      "The test email couldn't be sent. Try again in a minute.",
      'internal'
    );
  }
  return { sent: 'email' as const, to, subject, text, rows: rows.length };
};

// Point-in-time recovery

// The database as it is right now, as a bookmark to restore to.
export const checkpoint = async (request: DataRequest) => {
  const { bookmark } = await callData(
    'currentBookmark',
    () => request.opened.stub.currentBookmark(),
    request.tally
  );
  await change(request, { kind: 'checkpoint', bookmark });
  return bookmark;
};

// A bookmark is accepted only when this database's change log handed it
// out, so a client can't aim the object at anything else, and only from a
// change it undoes. A delete's or a purge's bookmark is taken after the
// object is marked deleted: restoring to it would bring the database back
// deleted while its row says READY.
const RESTORABLE_KINDS = [
  'checkpoint',
  'table.drop',
  'column.update',
  'column.drop',
  'restore'
];

export const restorePoint = async (request: DataRequest, body: RestoreBody) => {
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
        await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  // Kept with the restore's undo bookmark, so "Undo restore" is a restore
  // to it.
  await change(request, {
    kind: 'restore',
    detail:
      'bookmark' in body ? { bookmark: body.bookmark } : { at: body.timestamp },
    bookmark: result.undoBookmark
  });
  return result;
};
