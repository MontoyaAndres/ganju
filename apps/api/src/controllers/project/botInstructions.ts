import { and, eq } from 'drizzle-orm';
import { db } from '@ganju/db';
import type { Database } from '@ganju/db';

/** Sets them and returns the ones they replaced, for Undo. */
export const setBotInstructions = async (
  database: Database,
  scope: { projectId: string; organizationId: string },
  text: string | null
): Promise<string | null> => {
  const where = and(
    eq(db.schema.project.id, scope.projectId),
    eq(db.schema.project.organizationId, scope.organizationId)
  );
  const [previous] = await database
    .select({ botInstructions: db.schema.project.botInstructions })
    .from(db.schema.project)
    .where(where)
    .limit(1);
  if (!previous) throw new Error('Project not found');
  await database
    .update(db.schema.project)
    .set({ botInstructions: text?.trim() || null })
    .where(where);
  return previous.botInstructions;
};
