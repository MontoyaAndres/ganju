import { eq } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';
import { adviseIndexes } from '@ganju/utils/data';

// types
import type { EnvSource } from '@ganju/utils';
import type { Bindings } from '../types';

const { constants } = utils;

type ApiEnvSource = EnvSource & { env: Bindings };

// Applies the index rule to every database queried or written in the last 30
// days and stores what it suggests. Reads each one's schema once; nothing is
// changed in the database itself.
export const runDataIndexAdvice = async (
  source: ApiEnvSource,
  now: Date = new Date()
) => {
  const executor = db.create(source);
  const ids = await db.dataAdvice.databasesWithStats(
    executor,
    constants.DATA_INDEX_UNUSED_WINDOW_DAYS,
    now
  );
  for (const id of ids) {
    try {
      await adviseDatabase(source, executor, id, now);
    } catch (error) {
      console.error('data-index-advice-failed', id, error);
    }
  }
  await db.dataAdvice
    .pruneQueryStats(executor, now)
    .catch(error => console.error('data-query-stat-prune-failed', error));
};

export const adviseDatabase = async (
  source: ApiEnvSource,
  executor: ReturnType<typeof db.create>,
  databaseId: string,
  now: Date = new Date()
) => {
  const [row] = await executor
    .select()
    .from(db.schema.artifactDatabase)
    .where(eq(db.schema.artifactDatabase.id, databaseId))
    .limit(1);
  if (!row || row.status !== constants.ARTIFACT_DATABASE_STATUS_READY)
    return null;
  const stub = db.data.databaseStub(
    source.env.PROJECT_DATABASE,
    row.objectName
  );
  const schema = await db.data.callDataMetered(
    executor,
    row,
    'schemaRead',
    () => stub.schemaRead(),
    { retryRead: true, ganju: true }
  );
  const [week, month, monthCovered, recentlyIndexed] = await Promise.all([
    db.dataAdvice.queryStatSums(
      executor,
      databaseId,
      constants.DATA_INDEX_ADVICE_WINDOW_DAYS,
      now
    ),
    db.dataAdvice.queryStatSums(
      executor,
      databaseId,
      constants.DATA_INDEX_UNUSED_WINDOW_DAYS,
      now
    ),
    db.dataAdvice.statsCover(
      executor,
      databaseId,
      constants.DATA_INDEX_UNUSED_WINDOW_DAYS,
      now
    ),
    db.dataAdvice.recentlyIndexed(
      executor,
      databaseId,
      constants.DATA_INDEX_UNUSED_WINDOW_DAYS,
      now
    )
  ]);
  const candidates = adviseIndexes({
    schema,
    week,
    month,
    monthCovered,
    recentlyIndexed
  });
  return db.dataAdvice.saveIndexAdvice(
    executor,
    databaseId,
    candidates,
    schema
  );
};
