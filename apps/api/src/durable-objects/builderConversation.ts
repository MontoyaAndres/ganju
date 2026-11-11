import { DurableObject } from 'cloudflare:workers';
import Anthropic from '@anthropic-ai/sdk';
import { and, asc, eq, sql } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';
import type { Database } from '@ganju/db';

import { BUILDER_SYSTEM_PROMPT } from '../controllers/builder/prompt';
import {
  creditsUsedUp,
  resolveBuilderKey
} from '../controllers/builder/access';
import { creditsOf, step } from '../controllers/builder/llm';
import { Plan } from '../utils';
import { BUILDER_TOOLS, runBuilderTool } from '../controllers/builder/tools';
import { summarizeStripped } from '../controllers/builder/retention';

import type {
  BuilderMessageParam,
  ContentBlock,
  StepUsage
} from '../controllers/builder/llm';
import type { BuilderCard, StagedItem } from '../controllers/builder/tools';
import type { Bindings } from '../types';

export interface BuilderTurn {
  turnId: string;
  conversationId: string;
  organizationId: string;
  projectId: string;
  artifactId: string;
  userId: string;
}

export type BuilderEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; action: string | null }
  | { type: 'card'; card: BuilderCard }
  | { type: 'usage'; credits: number }
  | { type: 'error'; message: string }
  | { type: 'done'; stoppedBy: string; credits: number };

const MAX_MODEL_CALLS = 25;
const encoder = new TextEncoder();

// The API wants roles to alternate; a card that ended a turn leaves tool
// results followed by the owner's next message, both 'user'.
const alternate = (messages: BuilderMessageParam[]) => {
  const out: BuilderMessageParam[] = [];
  for (const message of messages) {
    const last = out[out.length - 1];
    if (last && last.role === message.role) {
      last.content = [...last.content, ...message.content];
    } else {
      out.push({ role: message.role, content: [...message.content] });
    }
  }
  return out;
};

// A turn cut off between a tool call and its result (the object restarted)
// would be refused by the API; the calls are answered as interrupted.
const closeOpenToolCalls = (messages: BuilderMessageParam[]) => {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return [];
  const open = last.content.filter(block => block.type === 'tool_use');
  return open.map(block => ({
    type: 'tool_result',
    tool_use_id: block.id,
    content:
      'Interrupted before it finished. Check its effect before retrying.',
    is_error: true
  }));
};

/**
 * One per builder conversation. The route saves the owner's message and asks
 * this object to answer it; the answer runs from an alarm, so it outlives the
 * request and a closed laptop, and every step is saved to Postgres as it
 * happens. Browsers stream progress from `fetch` and can reconnect.
 */
export class BuilderConversationDO extends DurableObject<Bindings> {
  private events: { id: number; event: BuilderEvent }[] = [];
  private turnId: string | null = null;
  private listeners = new Set<WritableStreamDefaultWriter<Uint8Array>>();
  private running = false;

  async start(turn: BuilderTurn): Promise<void> {
    await this.ctx.storage.put('turn', turn);
    this.turnId = turn.turnId;
    this.events = [];
    await this.ctx.storage.setAlarm(Date.now());
  }

  // The conversation was deleted: nothing it staged or streamed is kept.
  async forget(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.events = [];
    this.turnId = null;
  }

  async alarm(): Promise<void> {
    const turn = await this.ctx.storage.get<BuilderTurn>('turn');
    if (!turn || this.running) return;
    this.running = true;
    if (this.turnId !== turn.turnId) {
      this.turnId = turn.turnId;
      this.events = [];
    }
    try {
      await this.runTurn(turn);
    } finally {
      this.running = false;
      await this.ctx.storage.delete('turn');
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const turnId = url.searchParams.get('turn');
    const after = Number(url.searchParams.get('after') ?? -1);
    const { readable, writable } = new TransformStream<
      Uint8Array,
      Uint8Array
    >();
    const writer = writable.getWriter();

    const live = turnId !== null && turnId === this.turnId;
    const backlog = live ? this.events.filter(entry => entry.id > after) : [];
    const finished =
      !live || backlog.some(entry => entry.event.type === 'done');

    for (const entry of backlog) void writer.write(this.frame(entry));
    if (finished) {
      if (!live) {
        // Not this object's current turn, or it restarted since: the saved
        // conversation is the record.
        void writer.write(
          this.frame({
            id: 0,
            event: { type: 'done', stoppedBy: 'unknown', credits: 0 }
          })
        );
      }
      void writer.close();
    } else {
      this.listeners.add(writer);
      request.signal.addEventListener('abort', () => {
        this.listeners.delete(writer);
        void writer.close().catch(() => undefined);
      });
    }

    return new Response(readable, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache'
      }
    });
  }

  private frame(entry: { id: number; event: BuilderEvent }) {
    return encoder.encode(
      `id: ${entry.id}\ndata: ${JSON.stringify(entry.event)}\n\n`
    );
  }

  private emit(event: BuilderEvent) {
    const entry = { id: this.events.length, event };
    this.events.push(entry);
    const bytes = this.frame(entry);
    for (const writer of this.listeners) {
      writer.write(bytes).catch(() => this.listeners.delete(writer));
      if (event.type === 'done') {
        void writer.close().catch(() => undefined);
      }
    }
    if (event.type === 'done') this.listeners.clear();
  }

  private async loadMessages(database: Database, conversationId: string) {
    const rows = await database
      .select({
        seq: db.schema.builderMessage.seq,
        turnId: db.schema.builderMessage.turnId,
        role: db.schema.builderMessage.role,
        content: db.schema.builderMessage.content,
        createdAt: db.schema.builderMessage.createdAt,
        toolResultsStrippedAt: db.schema.builderMessage.toolResultsStrippedAt
      })
      .from(db.schema.builderMessage)
      .where(eq(db.schema.builderMessage.conversationId, conversationId))
      .orderBy(asc(db.schema.builderMessage.seq));
    return rows;
  }

  private async save(
    database: Database,
    turn: BuilderTurn,
    message: BuilderMessageParam,
    extra: { usage?: StepUsage; ownKey?: boolean; cards?: BuilderCard[] } = {}
  ) {
    // The next seq is taken in the insert itself, so two writers can't share
    // one; the unique index refuses the loser.
    await database.insert(db.schema.builderMessage).values({
      conversationId: turn.conversationId,
      turnId: turn.turnId,
      seq: sql`(select coalesce(max(${db.schema.builderMessage.seq}), -1) + 1 from ${db.schema.builderMessage} where ${db.schema.builderMessage.conversationId} = ${turn.conversationId})`,
      role: message.role,
      content: message.content,
      ...(extra.usage ?? {}),
      ownKey: extra.ownKey ?? false,
      cards: extra.cards?.length ? extra.cards : null
    });
  }

  private async runTurn(turn: BuilderTurn) {
    const database = db.create({ env: this.env });
    let costMicros = 0;
    let stoppedBy = 'answered';
    let ownKey = false;

    try {
      const key = await resolveBuilderKey(
        this.env,
        database,
        turn.organizationId
      );
      ownKey = key.ownKey;
      const staged = (await this.ctx.storage.get<StagedItem[]>('staged')) ?? [];

      const rows = await this.loadMessages(database, turn.conversationId);
      const resumed = await summarizeStripped(
        database,
        turn.conversationId,
        rows
      );
      let messages = alternate([
        ...(resumed
          ? [
              {
                role: 'user' as const,
                content: [{ type: 'text', text: resumed.summary }]
              }
            ]
          : []),
        ...(resumed?.rest ?? rows).map(row => ({
          role: row.role as 'user' | 'assistant',
          content: row.content as ContentBlock[]
        }))
      ]);
      const interrupted = closeOpenToolCalls(messages);
      if (interrupted.length) {
        const answer = { role: 'user' as const, content: interrupted };
        await this.save(database, turn, answer);
        messages = alternate([...messages, answer]);
      }

      for (let call = 0; ; call += 1) {
        if (call === MAX_MODEL_CALLS) {
          stoppedBy = 'step-cap';
          break;
        }
        if (!ownKey && call > 0) {
          const credits = await Plan.checkBuilderCredits(
            database,
            turn.organizationId
          );
          if (!credits.allowed) throw creditsUsedUp(credits);
        }
        const result = await step({
          apiKey: key.apiKey,
          baseUrl: key.baseUrl,
          system: BUILDER_SYSTEM_PROMPT,
          tools: BUILDER_TOOLS,
          messages,
          effort: 'high',
          onText: text => this.emit({ type: 'text', text })
        });
        costMicros += result.usage.costMicros;
        await Plan.incrementBuilderUsage(
          database,
          turn.organizationId,
          result.usage.costMicros,
          ownKey
        ).catch(error =>
          console.error('[builder] could not count usage', error)
        );
        const reply = { role: 'assistant' as const, content: result.content };
        await this.save(database, turn, reply, {
          usage: result.usage,
          ownKey
        });
        messages = [...messages, reply];
        this.emit({
          type: 'usage',
          credits: ownKey ? 0 : creditsOf(costMicros)
        });

        if (result.stopReason === 'refusal') {
          stoppedBy = 'refusal';
          break;
        }
        const calls = result.content.filter(block => block.type === 'tool_use');
        if (result.stopReason !== 'tool_use' || !calls.length) break;

        const cards: BuilderCard[] = [];
        const context = {
          env: this.env,
          db: database,
          organizationId: turn.organizationId,
          projectId: turn.projectId,
          artifactId: turn.artifactId,
          userId: turn.userId,
          conversationId: turn.conversationId,
          staged,
          onCard: (card: BuilderCard) => {
            cards.push(card);
            this.emit({ type: 'card', card });
          }
        };
        const outcomes = await Promise.all(
          calls.map(block => {
            const input = (block.input ?? {}) as { action?: string };
            this.emit({
              type: 'tool',
              name: String(block.name),
              action: input.action ?? null
            });
            return runBuilderTool(context, String(block.name), block.input);
          })
        );
        await this.ctx.storage.put('staged', staged);

        const results = {
          role: 'user' as const,
          content: calls.map((block, index) => ({
            type: 'tool_result',
            tool_use_id: block.id,
            content: outcomes[index].content,
            is_error: outcomes[index].isError
          }))
        };
        await this.save(database, turn, results, { cards });
        messages = [...messages, results];

        if (outcomes.some(outcome => outcome.endsTurn)) {
          stoppedBy = 'card';
          break;
        }
      }
    } catch (error) {
      if (error instanceof utils.PlanLimitError) {
        stoppedBy = 'credits';
        this.emit({ type: 'error', message: error.message });
      } else if (
        ownKey &&
        error instanceof Anthropic.APIError &&
        // Refused, no access to the model, or the key's own rate limit.
        [401, 402, 403, 404, 429].includes(error.status ?? 0)
      ) {
        stoppedBy = 'own-key';
        console.warn('[builder] own key failed', error.status);
        this.emit({
          type: 'error',
          message:
            "Your organization's Anthropic key couldn't be used (refused, rate-limited or without access to the model). An admin can fix it in Settings → Models, or switch the assistant back to Ganju credits."
        });
      } else {
        stoppedBy = 'error';
        console.error('[builder] turn failed', turn.conversationId, error);
        this.emit({
          type: 'error',
          message: 'Something went wrong while answering. Try again.'
        });
      }
    } finally {
      await database
        .update(db.schema.builderConversation)
        .set({
          status: utils.constants.BUILDER_CONVERSATION_STATUS_IDLE,
          lastMessageAt: new Date()
        })
        .where(
          and(
            eq(db.schema.builderConversation.id, turn.conversationId),
            eq(
              db.schema.builderConversation.status,
              utils.constants.BUILDER_CONVERSATION_STATUS_RUNNING
            )
          )
        )
        .catch(error => console.error('[builder] could not mark idle', error));
      this.emit({
        type: 'done',
        stoppedBy,
        credits: ownKey ? 0 : creditsOf(costMicros)
      });
    }
  }
}
