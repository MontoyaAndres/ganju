import { and, eq } from 'drizzle-orm';
import { db } from '@ganju/db';

// A channel of this project, or a 404. The project routes check the caller's
// access to the project; this checks the channel is in it.
export const loadProjectChannel = async (
  dbInstance: ReturnType<typeof db.create>,
  projectId: string,
  channelId: string
) => {
  const [row] = await dbInstance
    .select({ channel: db.schema.channel })
    .from(db.schema.channel)
    .innerJoin(
      db.schema.artifact,
      eq(db.schema.artifact.id, db.schema.channel.artifactId)
    )
    .where(
      and(
        eq(db.schema.channel.id, channelId),
        eq(db.schema.artifact.projectId, projectId)
      )
    )
    .limit(1);
  return row?.channel ?? null;
};
