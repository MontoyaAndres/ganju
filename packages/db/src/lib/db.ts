import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import * as schema from './schema';
import { getDBConnectionString } from '../utils';

export interface DbEnvSource {
  env: { HYPERDRIVE: { connectionString: string } };
}

export const create = (source: DbEnvSource) => {
  const connectionString = getDBConnectionString(source.env);
  const client = postgres(connectionString, {
    prepare: true,
    channel_binding: 'prefer',
    // Hyperdrive never answers a query pipelined behind another on the same
    // connection, so keep postgres 3's ten connections and never pipeline.
    max: 10,
    max_pipeline: 1
  });
  return drizzle(client, { schema });
};

export type Database = ReturnType<typeof create>;
