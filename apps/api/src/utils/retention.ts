import { sql } from 'drizzle-orm';
import { db } from '@ganju/db';
import type { DbExecutor } from '@ganju/db';
import { utils } from '@ganju/utils';

// types
import type { EnvSource } from '@ganju/utils';
import type { Bindings } from '../types';

const { constants } = utils;

type ApiEnvSource = EnvSource & { env: Bindings };

/**
 * Delete a bounded slice of rows older than `days` from an append-only table.
 *
 * Postgres has no `DELETE ... LIMIT`, so the batch is chosen by a subquery.
 * Bounding it matters: the cron runs hourly, and a first pass over a table that
 * has been accumulating since launch would otherwise be one enormous
 * transaction against a Hyperdrive-pooled connection.
 */
const purgeOlderThan = async (
  executor: DbExecutor,
  table: string,
  column: string,
  days: number
): Promise<number> => {
  const result = await executor.execute(sql`
    DELETE FROM ${sql.identifier(table)}
    WHERE id IN (
      SELECT id FROM ${sql.identifier(table)}
      WHERE ${sql.identifier(column)} < now() - ${`${days} days`}::interval
      LIMIT ${constants.RETENTION_PURGE_BATCH}
    )
  `);

  // postgres-js returns the affected rows on `.count`; fall back to length.
  return (
    (result as unknown as { count?: number }).count ??
    (result as unknown as unknown[]).length ??
    0
  );
};

export interface RetentionResult {
  mcpRequest: number;
  errorLog: number;
  channelMessage: number;
  artifactExecution: number;
  session: number;
}

/**
 * Enforce the retention windows published in the privacy policy.
 *
 * These numbers are load-bearing: apps/website/src/md/privacy.md states them to
 * users, so changing `RETENTION_DAYS` means changing the policy too.
 *
 * `mcpRequest` is the one that matters most — it holds the arguments and
 * results of every tool call, which can contain mail bodies, calendar entries,
 * and drive documents pulled from a connected account.
 *
 * Denormalized counters (`channel.messageCount`, `artifact.*UsageCount`) are
 * deliberately left alone: they're lifetime tallies, not a count of surviving
 * rows, and billing reads `subscription.messageCount`, which is per-period and
 * independent of these tables.
 */
export const runRetentionPurge = async (
  source: ApiEnvSource
): Promise<RetentionResult> => {
  const dbInstance = db.create(source);
  const { RETENTION_DAYS } = constants;

  const result: RetentionResult = {
    mcpRequest: 0,
    errorLog: 0,
    channelMessage: 0,
    artifactExecution: 0,
    session: 0
  };

  const tasks: [keyof RetentionResult, string, string, number][] = [
    ['mcpRequest', 'mcp_request', 'created_at', RETENTION_DAYS.mcpRequest],
    ['errorLog', 'error_log', 'created_at', RETENTION_DAYS.errorLog],
    [
      'channelMessage',
      'channel_message',
      'created_at',
      RETENTION_DAYS.channelMessage
    ],
    [
      'artifactExecution',
      'artifact_execution',
      'created_at',
      RETENTION_DAYS.artifactExecution
    ],
    // Expired sessions carry an IP and user agent and are useless once they've
    // lapsed — measured from `expires_at`, not creation.
    [
      'session',
      'session',
      'expires_at',
      constants.RETENTION_EXPIRED_SESSION_DAYS
    ]
  ];

  for (const [key, table, column, days] of tasks) {
    try {
      result[key] = await purgeOlderThan(dbInstance, table, column, days);
    } catch (error) {
      // One failing table must not stop the others — a purge that silently
      // stops running is how unbounded retention comes back.
      console.error(`retention purge failed for ${table}`, error);
    }
  }

  return result;
};
