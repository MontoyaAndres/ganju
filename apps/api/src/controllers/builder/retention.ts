import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { db } from '@ganju/db';
import type { Database } from '@ganju/db';
import { utils } from '@ganju/utils';

import type { ContentBlock } from './llm';
import type { Bindings } from '../../types';

const { constants } = utils;

export const STRIPPED_TOOL_RESULT = `Removed after ${constants.RETENTION_DAYS.builderToolResults} days.`;

// Postgres-js reports affected rows on `.count`.
const countOf = (result: unknown) =>
  (result as { count?: number }).count ?? (result as unknown[]).length ?? 0;

/**
 * Blank the tool results (and the model's thinking, which can quote them) of
 * messages older than the window, since they can hold customers' data. The
 * owner's words, the assistant's replies and the cards stay. Every old
 * message is marked, so the conversation knows to start again from a
 * summary.
 */
export const stripOldToolResults = async (database: Database) =>
  countOf(
    await database.execute(sql`
      UPDATE builder_message m
      SET
        content = (
          SELECT coalesce(
            jsonb_agg(
              CASE
                WHEN b ->> 'type' = 'tool_result' THEN jsonb_build_object(
                  'type', 'tool_result',
                  'tool_use_id', b -> 'tool_use_id',
                  'content', ${STRIPPED_TOOL_RESULT}::text,
                  'is_error', coalesce(b -> 'is_error', 'false'::jsonb)
                )
                ELSE b
              END
              ORDER BY i
            ),
            '[]'::jsonb
          )
          FROM jsonb_array_elements(m.content::jsonb) WITH ORDINALITY AS e(b, i)
          WHERE b ->> 'type' NOT IN ('thinking', 'redacted_thinking')
        )::json,
        tool_results_stripped_at = now()
      WHERE m.id IN (
        SELECT id FROM builder_message
        WHERE tool_results_stripped_at IS NULL
          AND created_at < now() - ${`${constants.RETENTION_DAYS.builderToolResults} days`}::interval
        LIMIT ${constants.RETENTION_PURGE_BATCH}
      )
    `)
  );

/**
 * Delete conversations, their messages with them. Their change sets stay, so
 * what a change was for outlives the chat.
 */
export const deleteConversations = async (
  env: Bindings,
  database: Database,
  ids: string[]
) => {
  if (!ids.length) return 0;
  await database
    .delete(db.schema.builderConversation)
    .where(inArray(db.schema.builderConversation.id, ids));
  await Promise.allSettled(
    ids.map(id =>
      env.BUILDER_CONVERSATION.get(
        env.BUILDER_CONVERSATION.idFromName(id)
      ).forget()
    )
  );
  return ids.length;
};

// `updated_at` moves when a turn starts, so a chat reopened after a long
// pause isn't deleted while it answers.
export const deleteOldConversations = async (
  env: Bindings,
  database: Database
) => {
  const rows = (await database.execute(sql`
    SELECT id FROM builder_conversation
    WHERE greatest(last_message_at, updated_at) < now() - ${`${constants.RETENTION_DAYS.builderConversation} days`}::interval
    LIMIT ${constants.RETENTION_BUILDER_DELETE_BATCH}
  `)) as unknown as { id: string }[];
  return deleteConversations(
    env,
    database,
    rows.map(row => row.id)
  );
};

export interface SavedMessage {
  seq: number;
  turnId: string;
  role: string;
  content: unknown;
  createdAt: Date;
  toolResultsStrippedAt: Date | null;
}

const MAX_SUMMARY_LINE = 600;
const MAX_SUMMARY = 8_000;

const textsOf = (content: unknown) =>
  (content as ContentBlock[])
    .filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => (block.text as string).replace(/\s+/g, ' ').trim())
    .filter(Boolean);

const clip = (text: string) =>
  text.length > MAX_SUMMARY_LINE ? `${text.slice(0, MAX_SUMMARY_LINE)}…` : text;

/**
 * Where a conversation picks up once its old steps were stripped: the turns
 * up to the last stripped message become a summary built from what was said
 * and the change sets, with no model call; later messages follow as they
 * are. Null while nothing was stripped.
 */
export const summarizeStripped = async (
  database: Database,
  conversationId: string,
  rows: SavedMessage[]
) => {
  const stripped = rows.filter(row => row.toolResultsStrippedAt);
  if (!stripped.length) return null;
  const lastTurn = stripped[stripped.length - 1].turnId;
  let end = rows.length;
  while (end > 0 && rows[end - 1].turnId !== lastTurn) end -= 1;
  const older = rows.slice(0, end);
  const until = older[older.length - 1].createdAt;

  const changeSets = await database
    .select({
      status: db.schema.builderChangeSet.status,
      summary: db.schema.builderChangeSet.summary,
      createdAt: db.schema.builderChangeSet.createdAt
    })
    .from(db.schema.builderChangeSet)
    .where(
      and(
        eq(db.schema.builderChangeSet.conversationId, conversationId),
        lte(db.schema.builderChangeSet.createdAt, until)
      )
    )
    .orderBy(asc(db.schema.builderChangeSet.createdAt));

  const day = (date: Date) => date.toISOString().slice(0, 10);
  const said = older.flatMap(row =>
    textsOf(row.content).map(
      text => `${row.role === 'user' ? 'Owner' : 'You'}: ${clip(text)}`
    )
  );
  const sets = changeSets.map(
    set =>
      `- ${day(set.createdAt)}, ${set.status}: ${clip(set.summary ?? 'no summary')}`
  );
  const head = `[This conversation started on ${day(older[0].createdAt)}. Its steps before ${day(until)} were removed after ${constants.RETENTION_DAYS.builderToolResults} days; this is what was said, and the change sets. Check the project's current state before relying on it.]`;
  const tail = sets.length ? ['', 'Change sets:', ...sets] : [];
  // The latest of what was said is kept when it doesn't all fit.
  let budget = MAX_SUMMARY - head.length - tail.join('\n').length;
  const kept: string[] = [];
  for (const line of [...said].reverse()) {
    budget -= line.length + 1;
    if (budget < 0) break;
    kept.unshift(line);
  }
  const summary = [
    head,
    ...(kept.length < said.length ? ['(earlier messages left out)'] : []),
    ...kept,
    ...tail
  ].join('\n');

  await database
    .update(db.schema.builderConversation)
    .set({ summary })
    .where(
      and(
        eq(db.schema.builderConversation.id, conversationId),
        sql`${db.schema.builderConversation.summary} is distinct from ${summary}`
      )
    );
  return { summary, rest: rows.slice(end) };
};
