import { Context } from 'hono';
import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';
import { DataError } from '@ganju/utils/data';

import { deliver } from '../../utils/email';
import { ownerAndAdminEmails } from '../../utils/dataAbandoned';
import { recordChange } from '../../utils/dataDatabase';

// types
import type { ExportState } from '@ganju/utils/data';
import type { AppEnv } from '../../types';

const { constants } = utils;
const ACTOR = 'system:abandoned';
const DAY_MS = 86_400_000;

// Only scripts/delete-data-database.mjs calls these, with the internal secret.
const authorized = (c: Context<AppEnv>) => {
  const provided = c.req.header(constants.MCP_INTERNAL_HEADER);
  const expected = utils.getEnv(c, 'MCP_INTERNAL_SECRET');
  return Boolean(
    expected && provided && utils.timingSafeEqual(provided, expected)
  );
};

// The database, if it may be deleted: listed as ready and its org still on
// Free. Anything else is refused, whatever the script was told.
const deletable = async (c: Context<AppEnv>) => {
  const executor = db.create(c);
  const id = c.req.param('databaseId') ?? '';
  const table = db.schema.artifactDatabase;
  const [row] = await executor
    .select()
    .from(table)
    .where(
      and(
        eq(table.id, id),
        eq(table.status, constants.ARTIFACT_DATABASE_STATUS_READY),
        isNotNull(table.deleteReadyAt)
      )
    )
    .limit(1);
  if (!row) {
    throw new DataError(
      'This database is not on the ready-to-delete list.',
      'conflict'
    );
  }
  const { limits } = await db.plan.getEffectivePlan(
    executor,
    row.organizationId
  );
  if (limits.canUseData) {
    throw new DataError(
      'The organization is back on a paid plan; nothing to delete.',
      'conflict'
    );
  }
  return { executor, row };
};

const failure = (c: Context<AppEnv>, error: unknown) => {
  if (error instanceof DataError) {
    return c.json({ error: error.message, code: error.code }, error.status);
  }
  throw error;
};

const stubOf = (c: Context<AppEnv>, objectName: string) =>
  db.data.databaseStub(c.env.PROJECT_DATABASE, objectName);

// Starts the copy kept before deleting.
const startExport = async (c: Context<AppEnv>) => {
  if (!authorized(c)) return c.json({ error: 'unauthorized' }, 401);
  try {
    const { executor, row } = await deletable(c);
    const started = await db.data.callDataMetered(
      executor,
      row,
      'exportStart',
      () =>
        stubOf(c, row.objectName).exportStart(
          { actor: ACTOR },
          { format: 'jsonl' }
        ),
      { ganju: true }
    );
    return c.json(started);
  } catch (error) {
    return failure(c, error);
  }
};

const exportStatus = async (c: Context<AppEnv>) => {
  if (!authorized(c)) return c.json({ error: 'unauthorized' }, 401);
  try {
    const { executor, row } = await deletable(c);
    const state = await db.data.callDataMetered(
      executor,
      row,
      'exportStatus',
      () =>
        stubOf(c, row.objectName).exportStatus({
          exportId: c.req.param('exportId')
        }),
      { ganju: true }
    );
    return c.json({ export: state });
  } catch (error) {
    return failure(c, error);
  }
};

// The folder in R2 an export's files are in.
const exportPrefix = (state: ExportState) => {
  const schemaKey =
    state.files.find(f => f.table === null)?.key ?? state.files[0]?.key;
  return schemaKey ? schemaKey.slice(0, schemaKey.lastIndexOf('/') + 1) : null;
};

// Empties the object once its copy is done, marks the row deleted with the
// copy's place in R2, and tells the owners.
const remove = async (c: Context<AppEnv>) => {
  if (!authorized(c)) return c.json({ error: 'unauthorized' }, 401);
  try {
    const { executor, row } = await deletable(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      exportId?: string;
      name?: string;
    };
    if (body.name !== row.name) {
      throw new DataError("The name doesn't match the database's.", 'invalid');
    }
    const stub = stubOf(c, row.objectName);
    const state = await db.data.callDataMetered(
      executor,
      row,
      'exportStatus',
      () => stub.exportStatus({ exportId: body.exportId }),
      { ganju: true }
    );
    const prefix = state.status === 'done' ? exportPrefix(state) : null;
    if (!prefix) {
      throw new DataError(
        'The copy is not finished; wait for it before deleting.',
        'conflict'
      );
    }
    const table = db.schema.artifactDatabase;
    const [claimed] = await executor
      .update(table)
      .set({ status: constants.ARTIFACT_DATABASE_STATUS_PURGING })
      .where(
        and(
          eq(table.id, row.id),
          eq(table.status, constants.ARTIFACT_DATABASE_STATUS_READY)
        )
      )
      .returning({ id: table.id });
    if (!claimed)
      throw new DataError(
        'Something else is changing this database.',
        'conflict'
      );
    let bookmark: string | null = null;
    try {
      await db.data.callData('markDeleted', () =>
        stub.markDeleted({ actor: ACTOR })
      );
      ({ bookmark } = await db.data.callData('purge', () => stub.purge()));
    } catch (error) {
      await executor
        .update(table)
        .set({ status: constants.ARTIFACT_DATABASE_STATUS_READY })
        .where(eq(table.id, row.id));
      throw error;
    }
    const now = new Date();
    await executor
      .update(table)
      .set({
        status: constants.ARTIFACT_DATABASE_STATUS_DELETED,
        deletedAt: now,
        deletedBy: ACTOR,
        purgedAt: now,
        sizeBytes: 0,
        sizeCheckedAt: now,
        deleteBookmark: bookmark,
        exportKey: prefix
      })
      .where(eq(table.id, row.id));
    await recordChange(executor, row.id, {
      actor: ACTOR,
      kind: 'purge',
      detail: { abandoned: true, exportKey: prefix, files: state.files.length },
      bookmark
    });
    const to = await ownerAndAdminEmails(executor, row.organizationId);
    const keepUntil = new Date(
      now.getTime() + constants.DATA_ABANDON_EXPORT_KEEP_DAYS * DAY_MS
    )
      .toISOString()
      .slice(0, 10);
    const text = [
      `Hola,`,
      ``,
      `Ganju eliminó la base de datos ${row.name}: su organización siguió en el plan Free después de los avisos. Guardamos una copia hasta el ${keepUntil}; si la necesitas, escríbenos a soporte.`,
      ``,
      `---`,
      ``,
      `Hello,`,
      ``,
      `Ganju deleted the database ${row.name}: its organization stayed on the Free plan after the notices. We keep a copy until ${keepUntil}; if you need it, write to support.`
    ].join('\n');
    let notified = 0;
    for (const address of to) {
      if (
        await deliver(c, {
          to: address,
          subject: `Ganju: eliminamos la base de datos ${row.name} / We deleted the database ${row.name}`,
          text
        })
      ) {
        notified++;
      }
    }
    return c.json({
      deleted: true,
      exportKey: prefix,
      notified,
      recipients: to.length
    });
  } catch (error) {
    return failure(c, error);
  }
};

export const DataAbandonedController = { startExport, exportStatus, remove };

// Removes the copies taken before a deletion once they are 90 days old. Hourly
// on the cron; the change log keeps where each one was.
export const runAbandonedExportExpiry = async (
  source: { env: AppEnv['Bindings'] },
  now: Date = new Date()
) => {
  const executor = db.create(source);
  const table = db.schema.artifactDatabase;
  const due = await executor
    .select({ id: table.id, exportKey: table.exportKey })
    .from(table)
    .where(
      and(
        eq(table.status, constants.ARTIFACT_DATABASE_STATUS_DELETED),
        eq(table.deletedBy, ACTOR),
        isNotNull(table.exportKey),
        lt(
          table.purgedAt,
          new Date(
            now.getTime() - constants.DATA_ABANDON_EXPORT_KEEP_DAYS * DAY_MS
          )
        )
      )
    )
    .limit(20);
  for (const row of due) {
    try {
      const prefix = row.exportKey!;
      let cursor: string | undefined;
      do {
        const listed = await source.env.STORAGE_BUCKET.list({ prefix, cursor });
        if (listed.objects.length) {
          await source.env.STORAGE_BUCKET.delete(
            listed.objects.map(o => o.key)
          );
        }
        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);
      await executor
        .update(table)
        .set({ exportKey: null })
        .where(eq(table.id, row.id));
      await recordChange(executor, row.id, {
        actor: ACTOR,
        kind: 'export.expire',
        detail: { exportKey: prefix }
      });
    } catch (error) {
      console.error('data-abandoned-export-expiry-failed', row.id, error);
    }
  }
};
