import { and, desc, eq } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';
import { DataError } from '@ganju/utils/data';

import * as dataActions from '../artifact/dataActions';
import {
  createDatabase,
  findArtifactDatabase,
  restoreDeletedDatabase,
  softDeleteDatabase
} from '../../utils/dataDatabase';

import type { DataTable, DataTrigger } from '@ganju/utils/data';
import type { DataRequest } from '../artifact/dataActions';
import type { BuilderToolContext } from './tools';
import type { ItemCaller, ItemHandler, ItemScope, StagedItem } from './items';

const { Schema, constants } = utils;

const MAX_STAGED_ROWS = 200;

const actorOf = (userId: string) => `user:${userId}`;

const withData = <T>(
  caller: ItemCaller,
  scope: { artifactId: string; userId: string },
  fn: (request: DataRequest) => Promise<T>
) =>
  dataActions.withDataRequest(
    caller,
    { artifactId: scope.artifactId, actor: actorOf(scope.userId) },
    {},
    fn
  );

const tableIn = (tables: DataTable[], name: string) => {
  const table = tables.find(t => t.name === name);
  if (!table) {
    throw new DataError(
      `There is no table named ${name}. Tables: ${tables.map(t => t.name).join(', ') || '(none)'}.`,
      'not_found'
    );
  }
  return table;
};

// The last time `ganju data schema push` ran against this database, if ever.
export const lastSchemaPush = async (
  caller: ItemCaller,
  artifactId: string,
  known?: { id: string } | null
): Promise<Date | null> => {
  const row = known ?? (await findArtifactDatabase(caller.db, artifactId));
  if (!row) return null;
  const [push] = await caller.db
    .select({ at: db.schema.artifactDatabaseChange.createdAt })
    .from(db.schema.artifactDatabaseChange)
    .where(
      and(
        eq(db.schema.artifactDatabaseChange.databaseId, row.id),
        eq(
          db.schema.artifactDatabaseChange.kind,
          constants.DATA_CHANGE_SCHEMA_PUSH
        )
      )
    )
    .orderBy(desc(db.schema.artifactDatabaseChange.createdAt))
    .limit(1);
  return push?.at ?? null;
};

// The trigger as saving it takes it, to put back on Undo.
const triggerInput = (trigger: DataTrigger) => {
  const { type, ...action } = trigger.action;
  const value =
    type === 'function'
      ? (action as { function: string }).function
      : type === 'webhook'
        ? (action as { url: string }).url
        : action;
  return {
    name: trigger.name,
    description: trigger.description,
    on: trigger.on,
    ...(trigger.on === 'schedule'
      ? {
          every: trigger.every,
          at: trigger.at,
          days: trigger.every === 'week' ? trigger.days : null,
          query: trigger.query,
          params: trigger.params,
          skipEmpty: trigger.skipEmpty
        }
      : { table: trigger.table, after: trigger.after, when: trigger.when }),
    enabled: trigger.enabled,
    rateLimit: trigger.rateLimit,
    [type]: value
  } as dataActions.TriggerInput;
};

const findTrigger = async (request: DataRequest, name: string) => {
  const { triggers } = (await dataActions.listTriggers(request)) as {
    triggers: DataTrigger[];
  };
  return triggers.find(t => t.name === name) ?? null;
};

const assertNotFromCode = (trigger: DataTrigger | null) => {
  if (trigger?.managed === 'cli') {
    throw new DataError(
      `The trigger ${trigger.name} comes from the developer's ganju.json and is replaced on their next deploy. Tell the owner to ask their developer to change it.`,
      'conflict'
    );
  }
};

const findQuery = async (request: DataRequest, name: string) => {
  const listed = (await dataActions.listQueries(request)) as
    { name: string }[] | { queries: { name: string }[] };
  const queries = Array.isArray(listed) ? listed : listed.queries;
  return (queries.find(q => q.name === name) ?? null) as
    (dataActions.QueryInput & Record<string, unknown>) | null;
};

const queryInput = (
  query: Record<string, unknown>
): dataActions.QueryInput => ({
  name: String(query.name),
  description: (query.description as string | null | undefined) ?? null,
  sql: String(query.sql),
  ...(query.params
    ? { params: query.params as dataActions.QueryInput['params'] }
    : {}),
  ...(query.assistant !== undefined
    ? { assistant: Boolean(query.assistant) }
    : {})
});

// What a patch changes, as it is now: Undo sends this back. A null puts a
// setting back to its default.
const previousValues = (
  current: Record<string, unknown>,
  patch: Record<string, unknown>
) =>
  Object.fromEntries(
    Object.keys(patch).map(key => [
      key,
      current[key] === undefined ? null : current[key]
    ])
  );

type Input = Record<string, any>;

/**
 * Stages one Data change. Checked now against the database as it is (and the
 * changes already staged), so the model hears about a mistake before the
 * owner sees a card.
 */
export const stageData = async (
  ctx: BuilderToolContext,
  action: string,
  input: Input
): Promise<string> => {
  const scope = { artifactId: ctx.artifactId, userId: ctx.userId };
  const caller = { env: ctx.env, db: ctx.db };
  const label = typeof input.label === 'string' ? input.label.trim() : '';
  if (!label)
    throw new Error(
      `${action} needs label: the line the owner reads on the card`
    );

  const staged = (op: string) =>
    ctx.staged.filter(item => item.area === 'data' && item.op === op);
  const stagedTables = new Set(
    staged('create_table').map(item =>
      String((item.payload.table as Input).name)
    )
  );
  const push = (item: Omit<StagedItem, 'area' | 'label'>) => {
    ctx.staged.push({ area: 'data', label, ...item });
    const notes = [
      item.deletes
        ? `It deletes: the owner must type "${item.deletes}" to apply.`
        : '',
      item.undo === 'restore'
        ? 'Undo would restore the whole database to just before it, losing anything saved since.'
        : '',
      item.managedByCode
        ? "A developer pushes this database's tables from code: their next push will undo this. Tell the owner."
        : ''
    ].filter(Boolean);
    return [`Staged #${ctx.staged.length}: ${label}.`, ...notes].join(' ');
  };

  const row = await findArtifactDatabase(ctx.db, ctx.artifactId);
  const ready = row?.status === constants.ARTIFACT_DATABASE_STATUS_READY;
  const willExist = ready || staged('create_database').length > 0;

  if (action === 'create_database') {
    if (ready) return 'The project already has a database; nothing to stage.';
    if (willExist) return 'Creating the database is already staged.';
    return push({
      op: action,
      payload: { name: input.name ?? null },
      undo: 'reverse'
    });
  }
  if (!willExist) {
    throw new Error(
      'The project has no database yet: stage create_database first.'
    );
  }

  if (action === 'delete_database') {
    if (!ready || !row)
      throw new Error('The project has no database to delete.');
    return push({
      op: action,
      payload: {},
      deletes: row.name,
      undo: 'reverse'
    });
  }

  // Before the database exists there is nothing to check against but what
  // is staged.
  const schema = ready
    ? await withData(caller, scope, request => dataActions.readSchema(request))
    : { tables: [] as DataTable[] };
  const fromCode = ready
    ? Boolean(await lastSchemaPush(caller, ctx.artifactId, row))
    : false;
  const tableNamed = (name: unknown) => {
    const text = String(name ?? '');
    if (stagedTables.has(text)) return null;
    return tableIn(schema.tables, text);
  };

  switch (action) {
    case 'create_table': {
      const table = await Schema.DATA_TABLE_INPUT.parseAsync(input.table);
      if (
        schema.tables.some(t => t.name === table.name) ||
        stagedTables.has(table.name)
      ) {
        throw new Error(`A table named ${table.name} already exists.`);
      }
      return push({
        op: action,
        payload: { table },
        undo: 'reverse',
        managedByCode: fromCode
      });
    }
    case 'change_table': {
      tableNamed(input.table);
      const patch = await Schema.DATA_TABLE_PATCH.parseAsync(input.patch ?? {});
      if (!Object.keys(patch).length)
        throw new Error('change_table needs patch');
      return push({
        op: action,
        payload: { table: input.table, patch },
        undo: 'reverse',
        managedByCode: fromCode
      });
    }
    case 'drop_table': {
      tableNamed(input.table);
      return push({
        op: action,
        payload: { table: input.table },
        deletes: String(input.table),
        undo: 'restore',
        managedByCode: fromCode
      });
    }
    case 'add_column': {
      tableNamed(input.table);
      const column = await Schema.DATA_COLUMN_INPUT.parseAsync(input.column);
      return push({
        op: action,
        payload: { table: input.table, column },
        undo: 'reverse',
        managedByCode: fromCode
      });
    }
    case 'change_column': {
      const table = tableNamed(input.table);
      if (table && !table.columns.some(c => c.name === input.column)) {
        throw new Error(`${input.table} has no column ${input.column}.`);
      }
      const patch = await Schema.DATA_COLUMN_PATCH.parseAsync(
        input.patch ?? {}
      );
      if (!Object.keys(patch).length)
        throw new Error('change_column needs patch');
      // A type change rewrites the column: only a restore brings it back.
      const retypes = patch.type !== undefined;
      return push({
        op: action,
        payload: { table: input.table, column: input.column, patch },
        undo: retypes ? 'restore' : 'reverse',
        managedByCode: fromCode
      });
    }
    case 'drop_column': {
      const table = tableNamed(input.table);
      if (table && !table.columns.some(c => c.name === input.column)) {
        throw new Error(`${input.table} has no column ${input.column}.`);
      }
      return push({
        op: action,
        payload: { table: input.table, column: input.column },
        deletes: `${input.table}.${input.column}`,
        undo: 'restore',
        managedByCode: fromCode
      });
    }
    case 'add_rows': {
      tableNamed(input.table);
      const rows = Array.isArray(input.rows) ? input.rows : [];
      if (!rows.length || rows.length > MAX_STAGED_ROWS) {
        throw new Error(
          `add_rows takes 1 to ${MAX_STAGED_ROWS} rows; for a spreadsheet, make a table synced from it.`
        );
      }
      await Schema.DATA_WRITE_BODY.parseAsync({
        operations: [{ op: 'insert', table: input.table, rows }]
      });
      return push({
        op: action,
        payload: { table: input.table, rows },
        undo: 'reverse'
      });
    }
    case 'change_rows': {
      tableNamed(input.table);
      const updates = Array.isArray(input.updates) ? input.updates : [];
      if (!updates.length || updates.length > MAX_STAGED_ROWS) {
        throw new Error(
          `change_rows takes 1 to ${MAX_STAGED_ROWS} updates: [{ id, set }].`
        );
      }
      await Schema.DATA_WRITE_BODY.parseAsync({
        operations: updates.map((u: Input) => ({
          op: 'update',
          table: input.table,
          id: u.id,
          set: u.set
        }))
      });
      return push({
        op: action,
        payload: { table: input.table, updates },
        undo: 'reverse'
      });
    }
    case 'delete_rows': {
      tableNamed(input.table);
      const ids = Array.isArray(input.ids) ? input.ids.map(Number) : [];
      if (
        !ids.length ||
        ids.length > MAX_STAGED_ROWS ||
        ids.some(id => !Number.isInteger(id) || id < 1)
      ) {
        throw new Error(`delete_rows takes 1 to ${MAX_STAGED_ROWS} row ids.`);
      }
      return push({
        op: action,
        payload: { table: input.table, ids },
        deletes: String(input.table),
        undo: 'restore'
      });
    }
    case 'save_query': {
      const query = await Schema.DATA_QUERY_INPUT.parseAsync(input.query);
      return push({ op: action, payload: { query }, undo: 'reverse' });
    }
    case 'drop_query': {
      const name = String(input.name ?? '');
      const found = ready
        ? await withData(caller, scope, request => findQuery(request, name))
        : null;
      if (!found) throw new Error(`There is no saved query named ${name}.`);
      return push({
        op: action,
        payload: { name },
        deletes: name,
        undo: 'reverse'
      });
    }
    case 'save_trigger': {
      const trigger = await Schema.DATA_TRIGGER_INPUT.parseAsync(input.trigger);
      if (!trigger.name) throw new Error('save_trigger needs trigger.name');
      const existing = ready
        ? await withData(caller, scope, request =>
            findTrigger(request, trigger.name!)
          )
        : null;
      assertNotFromCode(existing);
      return push({
        op: action,
        payload: { trigger },
        undo: 'reverse',
        ...(existing?.action.type === 'webhook'
          ? { lost: 'secret' as const }
          : {})
      });
    }
    case 'turn_trigger': {
      if (typeof input.enabled !== 'boolean') {
        throw new Error('turn_trigger needs enabled: true or false');
      }
      const name = String(input.name ?? '');
      const existing = ready
        ? await withData(caller, scope, request => findTrigger(request, name))
        : null;
      if (!existing) throw new Error(`There is no trigger named ${name}.`);
      assertNotFromCode(existing);
      return push({
        op: action,
        payload: { name, enabled: input.enabled },
        undo: 'reverse'
      });
    }
    case 'drop_trigger': {
      const name = String(input.name ?? '');
      const existing = ready
        ? await withData(caller, scope, request => findTrigger(request, name))
        : null;
      if (!existing) throw new Error(`There is no trigger named ${name}.`);
      assertNotFromCode(existing);
      return push({
        op: action,
        payload: { name },
        deletes: name,
        undo: 'reverse',
        ...(existing.action.type === 'webhook'
          ? { lost: 'secret' as const }
          : {})
      });
    }
  }
  throw new Error(`Unknown data action ${action}`);
};

/**
 * An email trigger's message, sent now to the owner's own address from a row
 * of the table (the newest by default), whatever its "to" says.
 */
// A saved query this conversation staged or proposed and the owner hasn't
// applied yet, newest first: a schedule's test runs it as it will be.
const draftQuery = async (ctx: BuilderToolContext, name: unknown) => {
  const named = (item: StagedItem) =>
    item.area === 'data' &&
    item.op === 'save_query' &&
    (item.payload.query as { name?: string } | undefined)?.name === name;
  const staged = [...ctx.staged].reverse().find(named);
  if (staged) return staged.payload.query as { name: string };
  const [proposed] = await ctx.db
    .select({ items: db.schema.builderChangeSet.items })
    .from(db.schema.builderChangeSet)
    .where(
      and(
        eq(db.schema.builderChangeSet.conversationId, ctx.conversationId),
        eq(
          db.schema.builderChangeSet.status,
          constants.BUILDER_CHANGE_SET_STATUS_PROPOSED
        )
      )
    )
    .orderBy(desc(db.schema.builderChangeSet.createdAt))
    .limit(1);
  const item = ((proposed?.items ?? []) as StagedItem[]).find(named);
  return (item?.payload.query as { name: string } | undefined) ?? null;
};

export const testEmail = async (ctx: BuilderToolContext, input: Input) => {
  const [owner] = await ctx.db
    .select({ email: db.schema.user.email })
    .from(db.schema.user)
    .where(eq(db.schema.user.id, ctx.userId))
    .limit(1);
  if (!owner?.email) throw new Error("The owner's account has no email.");
  // The same budget as the Data page's test sends.
  const limiter = ctx.env.TRIGGER_TEST_RATE_LIMITER;
  if (limiter) {
    const { success } = await limiter.limit({
      key: `TRIGGER_TEST_RATE_LIMITER:${ctx.userId}`
    });
    if (!success) {
      throw new Error(
        'Five test sends a minute at most: wait a minute before the next one.'
      );
    }
  }
  const draft =
    input.schedule && typeof input.schedule === 'object'
      ? await draftQuery(ctx, input.schedule.query)
      : null;
  return withData<unknown>(
    { env: ctx.env, db: ctx.db },
    { artifactId: ctx.artifactId, userId: ctx.userId },
    request =>
      input.schedule && typeof input.schedule === 'object'
        ? dataActions.testSendScheduleEmail(
            request,
            {
              query: input.schedule.query ?? null,
              params: input.schedule.params ?? null,
              email: input.email,
              ...(draft ? { draft } : {})
            },
            owner.email
          )
        : dataActions.testSendEmail(
            request,
            {
              table: String(input.table ?? ''),
              email: input.email,
              ...(input.rowId ? { rowId: Number(input.rowId) } : {})
            },
            owner.email
          )
  );
};

// Apply and undo

type Payload = Record<string, any>;

const handlers: Record<string, ItemHandler> = {
  create_database: {
    apply: async (caller, scope, item) => {
      const existing = await findArtifactDatabase(caller.db, scope.artifactId);
      if (existing?.status === constants.ARTIFACT_DATABASE_STATUS_READY) {
        return { created: false };
      }
      const [artifact] = await caller.db
        .select({ slug: db.schema.artifact.slug })
        .from(db.schema.artifact)
        .where(eq(db.schema.artifact.id, scope.artifactId))
        .limit(1);
      await createDatabase(caller, {
        artifactId: scope.artifactId,
        organizationId: scope.organizationId,
        name: (item.payload.name as string | null) ?? artifact?.slug ?? 'data',
        userId: scope.userId
      });
      return { created: true };
    },
    undo: async (caller, scope, _item, before) => {
      if (!(before as { created: boolean }).created) return;
      const row = await findArtifactDatabase(caller.db, scope.artifactId);
      if (row?.status !== constants.ARTIFACT_DATABASE_STATUS_READY) return;
      await softDeleteDatabase(caller, row, actorOf(scope.userId));
    }
  },
  delete_database: {
    apply: async (caller, scope) => {
      const row = await findArtifactDatabase(caller.db, scope.artifactId);
      if (row?.status !== constants.ARTIFACT_DATABASE_STATUS_READY) {
        throw new Error('The project has no database to delete.');
      }
      await softDeleteDatabase(caller, row, actorOf(scope.userId));
      return {};
    },
    // Restorable for the grace period, like the Data page's delete.
    undo: async (caller, scope) => {
      const row = await findArtifactDatabase(caller.db, scope.artifactId);
      if (!row) throw new Error('The database is gone for good.');
      await restoreDeletedDatabase(caller, row, actorOf(scope.userId));
    }
  },
  create_table: {
    apply: async (caller, scope, item) => {
      const table = item.payload.table as dataActions.TableInput;
      await withData(caller, scope, request =>
        dataActions.createTable(request, table)
      );
      return { name: table.name };
    },
    undo: async (caller, scope, _item, before) => {
      await withData(caller, scope, request =>
        dataActions.dropTable(request, (before as { name: string }).name)
      );
    }
  },
  change_table: {
    apply: async (caller, scope, item) => {
      const { table, patch } = item.payload as Payload;
      return withData(caller, scope, async request => {
        const current = tableIn(
          (await dataActions.readSchema(request)).tables,
          table
        );
        const previous = previousValues(
          current as unknown as Record<string, unknown>,
          patch
        );
        const updated = await dataActions.updateTable(request, table, patch);
        return { name: updated.name, previous };
      });
    },
    undo: async (caller, scope, _item, before) => {
      const { name, previous } = before as { name: string; previous: Payload };
      await withData(caller, scope, request =>
        dataActions.updateTable(request, name, previous)
      );
    }
  },
  drop_table: {
    apply: async (caller, scope, item) => {
      const result = await withData(caller, scope, request =>
        dataActions.dropTable(request, String(item.payload.table))
      );
      return { bookmark: result.bookmark };
    },
    undo: (caller, scope, _item, before) => restore(caller, scope, before)
  },
  add_column: {
    apply: async (caller, scope, item) => {
      const { table, column } = item.payload as Payload;
      await withData(caller, scope, request =>
        dataActions.addColumn(request, table, column)
      );
      return { table, column: column.name };
    },
    undo: async (caller, scope, _item, before) => {
      const { table, column } = before as { table: string; column: string };
      await withData(caller, scope, request =>
        dataActions.dropColumn(request, table, column)
      );
    }
  },
  change_column: {
    apply: async (caller, scope, item) => {
      const { table, column, patch } = item.payload as Payload;
      return withData(caller, scope, async request => {
        const current = tableIn(
          (await dataActions.readSchema(request)).tables,
          table
        ).columns.find(c => c.name === column);
        if (!current) throw new Error(`${table} has no column ${column}.`);
        const previous = previousValues(
          current as unknown as Record<string, unknown>,
          patch
        );
        const result = await dataActions.updateColumn(
          request,
          table,
          column,
          patch
        );
        return {
          table,
          column: patch.name ?? column,
          previous,
          bookmark: (result as { bookmark?: string | null }).bookmark ?? null
        };
      });
    },
    undo: async (caller, scope, item, before) => {
      const { table, column, previous, bookmark } = before as {
        table: string;
        column: string;
        previous: Payload;
        bookmark: string | null;
      };
      // Only a type change loses what it rewrote; any other rebuild is put
      // back by the old settings, keeping what was saved since.
      if (item.undo === 'restore') return restore(caller, scope, { bookmark });
      await withData(caller, scope, request =>
        dataActions.updateColumn(request, table, column, previous)
      );
    }
  },
  drop_column: {
    apply: async (caller, scope, item) => {
      const { table, column } = item.payload as Payload;
      const result = await withData(caller, scope, request =>
        dataActions.dropColumn(request, table, column)
      );
      return { bookmark: (result as { bookmark: string }).bookmark };
    },
    undo: (caller, scope, _item, before) => restore(caller, scope, before)
  },
  add_rows: {
    apply: async (caller, scope, item) => {
      const { table, rows } = item.payload as Payload;
      const results = await withData(caller, scope, request =>
        dataActions.write(request, {
          operations: [{ op: 'insert', table, rows }]
        })
      );
      const result = results[0] as { id?: number; ids?: number[] };
      return { table, ids: result.ids ?? (result.id ? [result.id] : []) };
    },
    undo: async (caller, scope, _item, before) => {
      const { table, ids } = before as { table: string; ids: number[] };
      if (!ids.length) return;
      await withData(caller, scope, async request => {
        // Rows someone already deleted stay deleted.
        const present = await existingIds(request, table, ids);
        if (!present.length) return;
        await dataActions.write(request, {
          operations: present.map(id => ({ op: 'delete' as const, table, id }))
        });
      });
    }
  },
  change_rows: {
    apply: async (caller, scope, item) => {
      const { table, updates } = item.payload as {
        table: string;
        updates: { id: number; set: Payload }[];
      };
      return withData(caller, scope, async request => {
        const rows = await rowsById(
          request,
          table,
          updates.map(u => u.id)
        );
        const previous = updates.map(update => {
          const row = rows.get(update.id);
          if (!row)
            throw new Error(`There is no row ${update.id} in ${table}.`);
          return { id: update.id, set: previousValues(row, update.set) };
        });
        await dataActions.write(request, {
          operations: updates.map(u => ({
            op: 'update' as const,
            table,
            id: u.id,
            set: u.set
          }))
        });
        return { table, previous };
      });
    },
    undo: async (caller, scope, _item, before) => {
      const { table, previous } = before as {
        table: string;
        previous: { id: number; set: Payload }[];
      };
      await withData(caller, scope, async request => {
        const present = new Set(
          await existingIds(
            request,
            table,
            previous.map(p => p.id)
          )
        );
        const operations = previous
          .filter(p => present.has(p.id))
          .map(p => ({ op: 'update' as const, table, id: p.id, set: p.set }));
        if (operations.length) await dataActions.write(request, { operations });
      });
    }
  },
  delete_rows: {
    apply: async (caller, scope, item) => {
      const { table, ids } = item.payload as { table: string; ids: number[] };
      return withData(caller, scope, async request => {
        const bookmark = await dataActions.checkpoint(request);
        await dataActions.write(request, {
          operations: ids.map(id => ({ op: 'delete' as const, table, id }))
        });
        return { bookmark };
      });
    },
    undo: (caller, scope, _item, before) => restore(caller, scope, before)
  },
  save_query: {
    apply: async (caller, scope, item) => {
      const query = item.payload.query as dataActions.QueryInput;
      return withData(caller, scope, async request => {
        const existing = await findQuery(request, query.name);
        await dataActions.saveQuery(request, query);
        return {
          name: query.name,
          previous: existing ? queryInput(existing) : null
        };
      });
    },
    undo: async (caller, scope, _item, before) => {
      const { name, previous } = before as {
        name: string;
        previous: dataActions.QueryInput | null;
      };
      await withData(caller, scope, async request => {
        if (previous) await dataActions.saveQuery(request, previous);
        else await dataActions.dropQuery(request, name);
      });
    }
  },
  drop_query: {
    apply: async (caller, scope, item) => {
      const name = String(item.payload.name);
      return withData(caller, scope, async request => {
        const existing = await findQuery(request, name);
        if (!existing)
          throw new Error(`There is no saved query named ${name}.`);
        await dataActions.dropQuery(request, name);
        return { previous: queryInput(existing) };
      });
    },
    undo: async (caller, scope, _item, before) => {
      const { previous } = before as { previous: dataActions.QueryInput };
      await withData(caller, scope, request =>
        dataActions.saveQuery(request, previous)
      );
    }
  },
  save_trigger: {
    apply: async (caller, scope, item) => {
      const trigger = item.payload.trigger as dataActions.TriggerInput;
      return withData(caller, scope, async request => {
        const existing = await findTrigger(request, trigger.name!);
        assertNotFromCode(existing);
        await dataActions.saveTrigger(request, { ...trigger, replace: true });
        return {
          name: trigger.name,
          previous: existing ? triggerInput(existing) : null
        };
      });
    },
    undo: async (caller, scope, _item, before) => {
      const { name, previous } = before as {
        name: string;
        previous: dataActions.TriggerInput | null;
      };
      await withData(caller, scope, async request => {
        if (previous)
          await dataActions.saveTrigger(request, {
            ...previous,
            replace: true
          });
        else await dataActions.dropTrigger(request, name);
      });
    }
  },
  turn_trigger: {
    apply: async (caller, scope, item) => {
      const { name, enabled } = item.payload as {
        name: string;
        enabled: boolean;
      };
      return withData(caller, scope, async request => {
        const existing = await findTrigger(request, name);
        if (!existing) throw new Error(`There is no trigger named ${name}.`);
        assertNotFromCode(existing);
        await dataActions.setTriggerEnabled(request, name, enabled);
        return { name, enabled: existing.enabled };
      });
    },
    undo: async (caller, scope, _item, before) => {
      const { name, enabled } = before as { name: string; enabled: boolean };
      await withData(caller, scope, request =>
        dataActions.setTriggerEnabled(request, name, enabled)
      );
    }
  },
  drop_trigger: {
    apply: async (caller, scope, item) => {
      const name = String(item.payload.name);
      return withData(caller, scope, async request => {
        const existing = await findTrigger(request, name);
        if (!existing) throw new Error(`There is no trigger named ${name}.`);
        assertNotFromCode(existing);
        await dataActions.dropTrigger(request, name);
        return { previous: triggerInput(existing) };
      });
    },
    undo: async (caller, scope, _item, before) => {
      const { previous } = before as { previous: dataActions.TriggerInput };
      await withData(caller, scope, request =>
        dataActions.saveTrigger(request, { ...previous, replace: false })
      );
    }
  }
};

const rowsById = async (request: DataRequest, table: string, ids: number[]) => {
  const result = (await db.data.callData(
    'query',
    () =>
      request.opened.stub.query(request.caller, {
        table,
        where: { id: { in: ids } },
        limit: ids.length
      }),
    request.tally,
    { retryRead: true }
  )) as { rows: Payload[] };
  return new Map(result.rows.map(row => [Number(row.id), row]));
};

const existingIds = async (
  request: DataRequest,
  table: string,
  ids: number[]
) => {
  const found = await rowsById(request, table, ids);
  return ids.filter(id => found.has(id));
};

const restore = async (
  caller: ItemCaller,
  scope: ItemScope,
  before: unknown
) => {
  const { bookmark } = before as { bookmark?: string | null };
  if (!bookmark) throw new Error('There is no restore point for this change.');
  await withData(caller, scope, request =>
    dataActions.restorePoint(request, { bookmark })
  );
};

export const dataHandler = (op: string): ItemHandler => {
  const handler = handlers[op];
  if (!handler) throw new Error(`Unknown change data ${op}`);
  return handler;
};
