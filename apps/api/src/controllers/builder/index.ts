import { Context } from 'hono';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';
import type { Database } from '@ganju/db';

import { assertBuilderAllowed, creditsUsedUp } from './access';
import {
  ConfirmationError,
  UndoStoppedError,
  applyChangeSet,
  changeSetNotes,
  undoChangeSet
} from './changeSets';
import { creditsOf } from './llm';
import { BuilderTryController } from './tryIt';
import { RateLimitMiddleware } from '../../middleware/rateLimit';
import { Plan } from '../../utils';

import type { AppEnv } from '../../types';

const {
  BUILDER_CONVERSATION_STATUS_IDLE: IDLE,
  BUILDER_CONVERSATION_STATUS_RUNNING: RUNNING
} = utils.constants;

// A turn that has been "running" this long died without saying so; it no
// longer blocks the next one.
const STALE_TURN_MINUTES = 20;

const scopeOf = (c: Context<AppEnv>) => ({
  projectId: c.req.param('projectId'),
  userId: c.get('user').id,
  organizationId: c.req.param('organizationId')
});

// The middleware checks the caller administers the project, not that the
// project is in the organization the URL names: that organization's plan,
// credits and key are what the assistant uses.
const allowed = async (c: Context<AppEnv>, organizationId: string) => {
  const database = db.create(c);
  const projectId = c.req.param('projectId');
  if (projectId) {
    const [project] = await database
      .select({ id: db.schema.project.id })
      .from(db.schema.project)
      .where(
        and(
          eq(db.schema.project.id, projectId),
          eq(db.schema.project.organizationId, organizationId)
        )
      )
      .limit(1);
    if (!project) throw new Error('Project not found');
  }
  await assertBuilderAllowed(c.env, database, organizationId);
  return database;
};

const loadConversation = async (
  database: Database,
  scope: { projectId: string; organizationId: string },
  conversationId: string
) => {
  const [row] = await database
    .select()
    .from(db.schema.builderConversation)
    .where(
      and(
        eq(db.schema.builderConversation.id, conversationId),
        eq(db.schema.builderConversation.projectId, scope.projectId),
        eq(db.schema.builderConversation.organizationId, scope.organizationId)
      )
    )
    .limit(1);
  if (!row) throw new Error('Conversation not found');
  return row;
};

const stubFor = (c: Context<AppEnv>, conversationId: string) =>
  c.env.BUILDER_CONVERSATION.get(
    c.env.BUILDER_CONVERSATION.idFromName(conversationId)
  );

const createConversation = async (c: Context<AppEnv>) => {
  const scope = await utils.Schema.BUILDER_SCOPE.parseAsync(scopeOf(c));
  const database = await allowed(c, scope.organizationId);
  // A chat whose first message would be refused is left empty in the list.
  const credits = await Plan.checkBuilderCredits(
    database,
    scope.organizationId
  );
  if (!credits.llmId && !credits.allowed) throw creditsUsedUp(credits);
  const [artifact] = await database
    .select({ id: db.schema.artifact.id })
    .from(db.schema.artifact)
    .where(eq(db.schema.artifact.projectId, scope.projectId))
    .limit(1);
  if (!artifact) throw new Error('Artifact not found for the project');
  const [row] = await database
    .insert(db.schema.builderConversation)
    .values({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      artifactId: artifact.id,
      userId: scope.userId
    })
    .returning();
  return c.json(row);
};

// Whether this project's assistant is open to the caller: 404 when the
// organization isn't allowed, 402 on a plan without it.
const access = async (c: Context<AppEnv>) => {
  const scope = await utils.Schema.BUILDER_SCOPE.parseAsync(scopeOf(c));
  await allowed(c, scope.organizationId);
  return c.json({ open: true });
};

const listConversations = async (c: Context<AppEnv>) => {
  const scope = await utils.Schema.BUILDER_SCOPE.parseAsync(scopeOf(c));
  const database = await allowed(c, scope.organizationId);
  const rows = await database
    .select({
      id: db.schema.builderConversation.id,
      title: db.schema.builderConversation.title,
      status: db.schema.builderConversation.status,
      lastMessageAt: db.schema.builderConversation.lastMessageAt
    })
    .from(db.schema.builderConversation)
    .where(
      and(
        eq(db.schema.builderConversation.projectId, scope.projectId),
        eq(db.schema.builderConversation.organizationId, scope.organizationId)
      )
    )
    .orderBy(desc(db.schema.builderConversation.lastMessageAt))
    .limit(50);
  const [credits, anthropic, [admin]] = await Promise.all([
    Plan.checkBuilderCredits(database, scope.organizationId),
    database
      .select({
        id: db.schema.organizationLlm.id,
        name: db.schema.organizationLlm.name
      })
      .from(db.schema.organizationLlm)
      .where(
        and(
          eq(db.schema.organizationLlm.organizationId, scope.organizationId),
          eq(
            db.schema.organizationLlm.provider,
            utils.constants.LLM_PROVIDER_ANTHROPIC
          )
        )
      )
      .orderBy(asc(db.schema.organizationLlm.createdAt)),
    database
      .select({ role: db.schema.organizationUser.role })
      .from(db.schema.organizationUser)
      .where(
        and(
          eq(db.schema.organizationUser.organizationId, scope.organizationId),
          eq(db.schema.organizationUser.userId, scope.userId),
          eq(db.schema.organizationUser.role, utils.constants.USER_ROLE_ADMIN)
        )
      )
      .limit(1)
  ]);
  const llmId = anthropic.some(row => row.id === credits.llmId)
    ? credits.llmId
    : null;
  return c.json({
    conversations: rows,
    credits: {
      used: Math.round(credits.used * 10) / 10,
      included: credits.included,
      cap: credits.cap,
      allowed: credits.allowed,
      ownKeyUsed: Math.round(credits.ownKeyUsed * 10) / 10
    },
    key: { llmId, options: anthropic, canManage: !!admin }
  });
};

const getConversation = async (c: Context<AppEnv>) => {
  const values = await utils.Schema.BUILDER_CONVERSATION.parseAsync({
    ...scopeOf(c),
    conversationId: c.req.param('conversationId')
  });
  const database = await allowed(c, values.organizationId);
  const conversation = await loadConversation(
    database,
    values,
    values.conversationId
  );
  const [messages, changeSets] = await Promise.all([
    database
      .select()
      .from(db.schema.builderMessage)
      .where(eq(db.schema.builderMessage.conversationId, conversation.id))
      .orderBy(asc(db.schema.builderMessage.seq)),
    database
      .select()
      .from(db.schema.builderChangeSet)
      .where(eq(db.schema.builderChangeSet.conversationId, conversation.id))
      .orderBy(asc(db.schema.builderChangeSet.createdAt))
  ]);
  return c.json({
    conversation,
    credits: creditsOf(
      messages.reduce((sum, m) => sum + (m.ownKey ? 0 : m.costMicros), 0)
    ),
    messages: messages.map(({ costMicros, ...message }) => ({
      ...message,
      credits: message.ownKey ? 0 : creditsOf(costMicros)
    })),
    changeSets
  });
};

/**
 * Save the owner's message and start the assistant's answer. Returns at once
 * with the turn's id; progress is read from the stream route, and the saved
 * conversation once it is done.
 */
const sendMessage = async (c: Context<AppEnv>) => {
  const body = await c.req.json().catch(() => ({}));
  const values = await utils.Schema.BUILDER_SEND_MESSAGE.parseAsync({
    ...scopeOf(c),
    conversationId: c.req.param('conversationId'),
    text: body?.text
  });
  const database = await allowed(c, values.organizationId);

  if (
    !(await RateLimitMiddleware.consumeRateLimit(
      c,
      'BUILDER_RATE_LIMITER',
      values.userId
    ))
  ) {
    return RateLimitMiddleware.rateLimited(c);
  }

  const credits = await Plan.checkBuilderCredits(
    database,
    values.organizationId
  );
  if (!credits.llmId && !credits.allowed) throw creditsUsedUp(credits);

  const conversation = await loadConversation(
    database,
    values,
    values.conversationId
  );
  const table = db.schema.builderConversation;
  const stale = sql`now() - make_interval(mins => ${STALE_TURN_MINUTES})`;

  // One answer at a time per project: two would build over each other.
  const [claimed] = await database
    .update(table)
    .set({
      status: RUNNING,
      ...(conversation.title ? {} : { title: values.text.slice(0, 80) })
    })
    .where(
      and(
        eq(table.id, conversation.id),
        sql`(${table.status} = ${IDLE} or ${table.updatedAt} < ${stale})`,
        sql`not exists (select 1 from ${table} other where other.artifact_id = ${conversation.artifactId} and other.id <> ${conversation.id} and other.status = ${RUNNING} and other.updated_at >= ${stale})`
      )
    )
    .returning();
  if (!claimed) {
    throw new Error(
      'The assistant is already answering in this project. Wait for it to finish.'
    );
  }

  try {
    const notes = await changeSetNotes(
      { env: c.env, db: database },
      conversation.id,
      conversation.lastMessageAt
    );
    const turnId = crypto.randomUUID();
    await database.insert(db.schema.builderMessage).values({
      conversationId: conversation.id,
      turnId,
      seq: sql`(select coalesce(max(${db.schema.builderMessage.seq}), -1) + 1 from ${db.schema.builderMessage} where ${db.schema.builderMessage.conversationId} = ${conversation.id})`,
      role: 'user',
      content: [
        ...(notes.length ? [{ type: 'text', text: notes.join('\n') }] : []),
        { type: 'text', text: values.text }
      ]
    });

    await stubFor(c, conversation.id).start({
      turnId,
      conversationId: conversation.id,
      organizationId: values.organizationId,
      projectId: values.projectId,
      artifactId: conversation.artifactId,
      userId: values.userId
    });

    return c.json({ turnId });
  } catch (error) {
    await database
      .update(table)
      .set({ status: IDLE })
      .where(eq(table.id, conversation.id));
    throw error;
  }
};

const streamTurn = async (c: Context<AppEnv>) => {
  const values = await utils.Schema.BUILDER_STREAM.parseAsync({
    ...scopeOf(c),
    conversationId: c.req.param('conversationId'),
    turnId: c.req.query('turn'),
    after: c.req.query('after')
  });
  const database = await allowed(c, values.organizationId);
  await loadConversation(database, values, values.conversationId);
  const url = `https://builder/stream?turn=${values.turnId}&after=${values.after}`;
  return stubFor(c, values.conversationId).fetch(
    new Request(url, { signal: c.req.raw.signal })
  );
};

const changeSetRoute =
  (run: 'apply' | 'undo') => async (c: Context<AppEnv>) => {
    const values = await utils.Schema.BUILDER_CHANGE_SET.parseAsync({
      ...scopeOf(c),
      changeSetId: c.req.param('changeSetId')
    });
    const database = await allowed(c, values.organizationId);
    const caller = { env: c.env, db: database };
    try {
      if (run === 'undo') {
        return c.json(await undoChangeSet(caller, values, values.changeSetId));
      }
      const body = await utils.Schema.BUILDER_CHANGE_SET_APPLY.parseAsync(
        await c.req.json().catch(() => ({}))
      );
      return c.json(
        await applyChangeSet(caller, values, values.changeSetId, body.confirm)
      );
    } catch (error) {
      if (error instanceof ConfirmationError) {
        return c.json({ error: error.message, needsConfirmation: true }, 400);
      }
      if (error instanceof UndoStoppedError) {
        return c.json({ error: error.message }, 409);
      }
      throw error;
    }
  };

/**
 * The organization's assistant billing: an Anthropic connection to run on
 * instead of credits, and the extra credits a period may use.
 */
const updateSettings = async (c: Context<AppEnv>) => {
  const body = await c.req.json().catch(() => ({}));
  const values = await utils.Schema.BUILDER_SETTINGS.parseAsync({
    organizationId: c.req.param('organizationId'),
    llmId: body?.llmId,
    creditCap: body?.creditCap
  });
  const database = await allowed(c, values.organizationId);
  if (values.llmId) {
    const [row] = await database
      .select({ id: db.schema.organizationLlm.id })
      .from(db.schema.organizationLlm)
      .where(
        and(
          eq(db.schema.organizationLlm.id, values.llmId),
          eq(db.schema.organizationLlm.organizationId, values.organizationId),
          eq(
            db.schema.organizationLlm.provider,
            utils.constants.LLM_PROVIDER_ANTHROPIC
          )
        )
      )
      .limit(1);
    if (!row) {
      throw new Error('Anthropic model not found in this organization');
    }
  }
  await Plan.ensureSubscription(database, values.organizationId);
  await database
    .update(db.schema.subscription)
    .set({
      ...(values.llmId !== undefined ? { builderLlmId: values.llmId } : {}),
      ...(values.creditCap !== undefined
        ? { builderCreditCap: values.creditCap }
        : {})
    })
    .where(eq(db.schema.subscription.organizationId, values.organizationId));
  const credits = await Plan.checkBuilderCredits(
    database,
    values.organizationId
  );
  return c.json({ llmId: credits.llmId, creditCap: credits.cap });
};

export const BuilderController = {
  updateSettings,
  access,
  createConversation,
  listConversations,
  getConversation,
  sendMessage,
  streamTurn,
  applyChangeSet: changeSetRoute('apply'),
  undoChangeSet: changeSetRoute('undo'),
  tryHistory: BuilderTryController.history,
  trySend: BuilderTryController.send
};
