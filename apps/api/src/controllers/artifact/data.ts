import { Context } from 'hono';
import { and, eq } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';
import { DataError } from '@ganju/utils/data';

import {
  callData,
  createDatabase,
  databaseStub,
  findArtifactDatabase,
  restoreDeletedDatabase,
  softDeleteDatabase
} from '../../utils/dataDatabase';

// types
import { AppEnv } from '../../types';

const { constants } = utils;

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
  const info = await callData('info', () => stub.info(), undefined, {
    retryRead: true
  });
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
    userId: values.userId
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
  const deleted = await softDeleteDatabase(c, row, `user:${values.userId}`);
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
  const restored = await restoreDeletedDatabase(c, row, `user:${values.userId}`);
  return c.json({ database: present(restored) });
};

export const DataController = {
  getDatabase,
  create,
  remove,
  restore
};
