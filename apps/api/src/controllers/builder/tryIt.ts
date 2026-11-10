import { Context } from 'hono';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';
import type { Database } from '@ganju/db';

import { assertBuilderAllowed, creditsUsedUp } from './access';
import { runChannelTurn } from '../channel/runner';
import { RateLimitMiddleware } from '../../middleware/rateLimit';
import { Plan } from '../../utils';

import type { AppEnv } from '../../types';

const TEST = utils.constants.CHANNEL_PLATFORM_TEST;

const scopeOf = (c: Context<AppEnv>) => ({
  projectId: c.req.param('projectId'),
  userId: c.get('user').id,
  organizationId: c.req.param('organizationId')
});

const artifactOf = async (
  database: Database,
  scope: { projectId: string; organizationId: string }
) => {
  const [row] = await database
    .select({ id: db.schema.artifact.id })
    .from(db.schema.artifact)
    .innerJoin(
      db.schema.project,
      eq(db.schema.project.id, db.schema.artifact.projectId)
    )
    .where(
      and(
        eq(db.schema.artifact.projectId, scope.projectId),
        eq(db.schema.project.organizationId, scope.organizationId)
      )
    )
    .limit(1);
  if (!row) throw new Error('Project not found');
  return row.id;
};

/**
 * The project's hidden test channel, made on first use. It answers like the
 * project's first connected channel (its model and settings) or, with none,
 * on the shared model; the owner is never held to the per-customer limit.
 */
const testChannel = async (
  c: Context<AppEnv>,
  database: Database,
  artifactId: string
) => {
  const channels = await database
    .select({
      id: db.schema.channel.id,
      platform: db.schema.channel.platform,
      status: db.schema.channel.status,
      llmId: db.schema.channel.llmId,
      config: db.schema.channel.config
    })
    .from(db.schema.channel)
    .where(eq(db.schema.channel.artifactId, artifactId))
    .orderBy(asc(db.schema.channel.createdAt));
  const real = channels.filter(channel => channel.platform !== TEST);
  const like =
    real.find(channel => channel.status === utils.constants.STATUS_ACTIVE) ??
    real[0];
  const settings = {
    llmId: like?.llmId ?? null,
    config: {
      ...((like?.config as Record<string, unknown> | null) ?? {}),
      participantDailyLimit: utils.PARTICIPANT_DAILY_LIMIT_OFF
    }
  };

  const existing = channels.find(channel => channel.platform === TEST);
  if (existing) {
    const changed =
      existing.llmId !== settings.llmId ||
      JSON.stringify(existing.config) !== JSON.stringify(settings.config);
    if (changed) {
      await database
        .update(db.schema.channel)
        .set(settings)
        .where(eq(db.schema.channel.id, existing.id));
    }
    return { id: existing.id, llmId: settings.llmId };
  }
  await database.insert(db.schema.channel).values({
    platform: TEST,
    status: utils.constants.STATUS_ACTIVE,
    credentials: utils.encryptString('{}', utils.getCredentialEncryptionKey(c)),
    webhookSecret: crypto.randomUUID(),
    artifactId,
    ...settings
  });
  // Two first messages at once can each make one; both then use the oldest.
  return {
    id: (await oldestTestChannel(database, artifactId)) as string,
    llmId: settings.llmId
  };
};

const oldestTestChannel = async (database: Database, artifactId: string) => {
  const [row] = await database
    .select({ id: db.schema.channel.id })
    .from(db.schema.channel)
    .where(
      and(
        eq(db.schema.channel.artifactId, artifactId),
        eq(db.schema.channel.platform, TEST)
      )
    )
    .orderBy(asc(db.schema.channel.createdAt), asc(db.schema.channel.id))
    .limit(1);
  return row?.id ?? null;
};

const conversationKey = (userId: string, session: string) =>
  `${userId}:${session}`;

const history = async (c: Context<AppEnv>) => {
  const values = await utils.Schema.BUILDER_TRY.parseAsync({
    ...scopeOf(c),
    session: c.req.query('session')
  });
  const database = db.create(c);
  await assertBuilderAllowed(c.env, database, values.organizationId);
  const artifactId = await artifactOf(database, values);
  const channelId = await oldestTestChannel(database, artifactId);
  if (!channelId) return c.json({ messages: [] });

  const rows = await database
    .select({
      id: db.schema.channelMessage.id,
      role: db.schema.channelMessage.role,
      content: db.schema.channelMessage.content,
      createdAt: db.schema.channelMessage.createdAt
    })
    .from(db.schema.channelMessage)
    .innerJoin(
      db.schema.channelConversation,
      eq(
        db.schema.channelConversation.id,
        db.schema.channelMessage.conversationId
      )
    )
    .where(
      and(
        eq(db.schema.channelConversation.channelId, channelId),
        eq(
          db.schema.channelConversation.externalConversationId,
          conversationKey(values.userId, values.session)
        ),
        inArray(db.schema.channelMessage.role, [
          utils.constants.ROLE_MESSAGE_USER,
          utils.constants.ROLE_MESSAGE_ASSISTANT
        ])
      )
    )
    .orderBy(asc(db.schema.channelMessage.createdAt));
  return c.json({ messages: rows });
};

const send = async (c: Context<AppEnv>) => {
  const body = await c.req.json().catch(() => ({}));
  const values = await utils.Schema.BUILDER_TRY_MESSAGE.parseAsync({
    ...scopeOf(c),
    session: body?.session,
    text: body?.text
  });
  const database = db.create(c);
  await assertBuilderAllowed(c.env, database, values.organizationId);
  if (
    !(await RateLimitMiddleware.consumeRateLimit(
      c,
      'BUILDER_RATE_LIMITER',
      `try:${values.userId}`
    ))
  ) {
    return RateLimitMiddleware.rateLimited(c);
  }

  const artifactId = await artifactOf(database, values);
  const channel = await testChannel(c, database, artifactId);
  // On the shared model the test chat spends credits; on the bot's own model
  // it costs us nothing.
  if (!channel.llmId) {
    const credits = await Plan.checkBuilderCredits(
      database,
      values.organizationId
    );
    if (!credits.allowed) throw creditsUsedUp(credits);
  }
  const user = c.get('user');
  const locale = c.req.header('accept-language')?.split(',')[0] ?? null;

  let result: Awaited<ReturnType<typeof runChannelTurn>>;
  try {
    result = await runChannelTurn(c, {
      channelId: channel.id,
      countAsMessage: false,
      externalConversationId: conversationKey(values.userId, values.session),
      conversationScope: utils.constants.CHANNEL_CONVERSATION_SCOPE_PRIVATE,
      externalParticipantId: `owner:${values.userId}`,
      participantDisplayName: user.name ?? null,
      userMessages: [{ text: values.text }],
      locale
    });
  } catch (error) {
    // Usually the bot's own model refusing (a wrong key, a model that no
    // longer exists); the dashboard says so in the owner's words.
    console.error('[builder] test chat turn failed', error);
    return c.json({ error: 'The bot could not answer', botFailed: true }, 502);
  }

  if (result.usage?.onSharedKey) {
    const price = utils.constants.SHARED_MODEL_PRICE;
    await Plan.incrementBuilderUsage(
      database,
      values.organizationId,
      result.usage.tokensIn * price.input +
        result.usage.tokensOut * price.output,
      false
    ).catch(error =>
      console.error('[builder] could not count test chat usage', error)
    );
  }

  // The runner's own "unavailable" line answers a customer when the
  // organization is out of messages; the owner is told why instead.
  const capped = !result.assistantMessageId && !result.silent;
  return c.json({
    capped,
    text: capped ? '' : result.assistantText,
    sourcesFooter: result.sourcesFooter,
    files: result.attachments.map(attachment =>
      attachment.kind === 'artifact'
        ? attachment.resource.title
        : attachment.uri
    ),
    buttons:
      result.confirmation === 'asked'
        ? utils.confirmationButtonLabels(locale)
        : null
  });
};

export const BuilderTryController = { history, send };
