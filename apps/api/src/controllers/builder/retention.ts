import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { db } from '@ganju/db';
import type { Database } from '@ganju/db';
import { utils } from '@ganju/utils';

import type { ContentBlock } from './llm';
import type { Bindings } from '../../types';

const { constants } = utils;

export const STRIPPED_TOOL_RESULT = `Removed after ${constants.RETENTION_DAYS.builderToolResults} days.`;

/**
 * Blank what messages older than the window carry from tools, since it can
 * hold customers' data: tool results, the assistant's tool inputs (rows,
 * test data, code), and its thinking, which can quote them. The owner's
 * words, the assistant's replies and the cards stay. Every old message is
 * marked, so the conversation knows to start again from a summary.
 */
export const stripOldToolResults = (database: Database) =>
  database.execute(sql`
    UPDATE builder_message m
    SET
      content = (
        SELECT coalesce(
          jsonb_agg(
            CASE b ->> 'type'
              WHEN 'tool_result' THEN jsonb_build_object(
                'type', 'tool_result',
                'tool_use_id', b -> 'tool_use_id',
                'content', ${STRIPPED_TOOL_RESULT}::text,
                'is_error', coalesce(b -> 'is_error', 'false'::jsonb)
              )
              WHEN 'tool_use' THEN b || '{"input": {}}'::jsonb
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
  `);

/**
 * Delete the conversations `where` picks, their messages with them, in one
 * transaction so a turn can't start on one in between. Their change sets
 * keep only what each line was and the summary: one still proposed is
 * discarded, and the rows, code and undo state they carried go.
 */
export const deleteConversations = async (
  env: Bindings,
  database: Database,
  where: SQL
) => {
  const table = db.schema.builderChangeSet;
  const ids = await database.transaction(async tx => {
    const rows = (await tx.execute(sql`
      SELECT id FROM builder_conversation
      WHERE ${where}
      LIMIT ${constants.RETENTION_BUILDER_DELETE_BATCH}
      FOR UPDATE SKIP LOCKED
    `)) as unknown as { id: string }[];
    const found = rows.map(row => row.id);
    if (!found.length) return found;
    await tx
      .update(table)
      .set({
        status: sql`CASE WHEN ${table.status} = ${constants.BUILDER_CHANGE_SET_STATUS_PROPOSED} THEN ${constants.BUILDER_CHANGE_SET_STATUS_DISCARDED} ELSE ${table.status} END`,
        items: sql`(SELECT coalesce(jsonb_agg(item - 'payload' ORDER BY n), '[]'::jsonb) FROM jsonb_array_elements(${table.items}::jsonb) WITH ORDINALITY AS e(item, n))::json`,
        before: null
      })
      .where(inArray(table.conversationId, found));
    await tx
      .delete(db.schema.builderConversation)
      .where(inArray(db.schema.builderConversation.id, found));
    return found;
  });
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
export const deleteOldConversations = (env: Bindings, database: Database) =>
  deleteConversations(
    env,
    database,
    sql`greatest(last_message_at, updated_at) < now() - ${`${constants.RETENTION_DAYS.builderConversation} days`}::interval`
  );

export interface SavedMessage {
  seq: number;
  turnId: string;
  role: string;
  content: unknown;
  createdAt: Date;
  toolResultsStrippedAt: Date | null;
}

const MAX_SUMMARY_LINE = 600;
const MAX_SUMMARY_SAID = 6_000;
const MAX_SUMMARY_CHANGE_SETS = 3_000;

// The latest lines that fit in `budget` characters.
const latest = (lines: string[], budget: number) => {
  const kept: string[] = [];
  for (const line of [...lines].reverse()) {
    budget -= line.length + 1;
    if (budget < 0) break;
    kept.unshift(line);
  }
  return kept.length < lines.length
    ? [`(${lines.length - kept.length} earlier left out)`, ...kept]
    : kept;
};

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

  const minute = (date: Date) =>
    `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  const said = older.flatMap(row =>
    textsOf(row.content).map(
      text => `${row.role === 'user' ? 'Owner' : 'You'}: ${clip(text)}`
    )
  );
  const sets = changeSets.map(
    set =>
      `- ${minute(set.createdAt)}, ${set.status}: ${clip(set.summary ?? 'no summary')}`
  );
  const head = `[This conversation started ${minute(older[0].createdAt)}. Up to ${minute(until)}, what your tools returned, the inputs you gave them and your thinking were removed after ${constants.RETENTION_DAYS.builderToolResults} days. Below is what you and the owner said up to then, and the change sets; anything after follows as it was. Check the project's current state before relying on it.]`;
  const summary = [
    head,
    ...latest(said, MAX_SUMMARY_SAID),
    ...(sets.length
      ? ['', 'Change sets:', ...latest(sets, MAX_SUMMARY_CHANGE_SETS)]
      : [])
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
