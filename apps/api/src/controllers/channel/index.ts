import { Context } from 'hono';
import { and, desc, eq, sql } from 'drizzle-orm';
import { v7 as uuid } from 'uuid';
import { db } from '@anju/db';
import { utils } from '@anju/utils';

import {
  handleTelegramWebhook,
  registerTelegramWebhook,
  getTelegramBotInfo
} from './telegram';
import { handleSlackWebhook, getSlackBotInfo } from './slack';

import type { TelegramBotInfo } from './telegram';
import type { SlackBotInfo } from './slack';
import { loadProxiedPrompts } from './proxiedPrompts';
import { registerTelegramBotCommands } from '../../utils';

import type { AppEnv } from '../../types';

const list = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.CHANNEL_GET.parseAsync({
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const dbInstance = db.create(c);

  const artifact = await dbInstance.query.artifact.findFirst({
    where: eq(db.schema.artifact.projectId, currentValues.projectId),
    with: { channels: true }
  });

  if (!artifact) throw new Error('Artifact not found for the project');

  return c.json(
    artifact.channels.map(
      ({ credentials: _c, webhookSecret: _w, ...rest }) => ({
        ...rest,
        hasCredentials: true
      })
    )
  );
};

const create = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues = await utils.Schema.CHANNEL_CREATE.parseAsync({
    ...body,
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const dbInstance = db.create(c);
  const encryptionKey = utils.getCredentialEncryptionKey(c);
  const encryptedCredentials = utils.encryptString(
    JSON.stringify(currentValues.credentials),
    encryptionKey
  );

  const rawSecret = uuid().replace(/-/g, '') + uuid().replace(/-/g, '');
  const hashedSecret = await utils.sha256Hex(rawSecret);
  const apiUrl = utils.getEnv(c, 'NEXT_PUBLIC_API_URL');

  if (!apiUrl) throw new Error('Missing env: NEXT_PUBLIC_API_URL');

  let platformMetadata: Record<string, unknown> | null = null;
  let telegramBotInfo: TelegramBotInfo | null = null;
  let slackBotInfo: SlackBotInfo | null = null;
  if (currentValues.platform === utils.constants.CHANNEL_PLATFORM_TELEGRAM) {
    telegramBotInfo = await getTelegramBotInfo(
      currentValues.credentials.botToken
    );
    platformMetadata = { telegram: { bot: telegramBotInfo } };
  } else if (
    currentValues.platform === utils.constants.CHANNEL_PLATFORM_SLACK
  ) {
    if (
      !currentValues.credentials.botToken ||
      !currentValues.credentials.signingSecret
    ) {
      throw new Error(
        'Slack channels require both a bot token and a signing secret.'
      );
    }
    // Verifies the bot token and gives us the bot identity for the card +
    // duplicate-connection detection. The signing secret can't be verified
    // until Slack signs the first webhook, so we store it as-is.
    slackBotInfo = await getSlackBotInfo(currentValues.credentials.botToken);
    platformMetadata = { slack: { bot: slackBotInfo } };
  }

  const result = await dbInstance.transaction(async tx => {
    const [project] = await tx
      .select()
      .from(db.schema.project)
      .where(
        and(
          eq(db.schema.project.id, currentValues.projectId),
          eq(db.schema.project.organizationId, currentValues.organizationId)
        )
      )
      .limit(1);

    if (!project) throw new Error('Project not found');

    const [artifactRow] = await tx
      .select()
      .from(db.schema.artifact)
      .where(eq(db.schema.artifact.projectId, currentValues.projectId))
      .limit(1);

    if (!artifactRow) throw new Error('Artifact not found for the project');

    if (telegramBotInfo) {
      const [conflict] = await tx
        .select({
          projectName: db.schema.project.name,
          organizationId: db.schema.project.organizationId,
          organizationName: db.schema.organization.name
        })
        .from(db.schema.channel)
        .innerJoin(
          db.schema.artifact,
          eq(db.schema.channel.artifactId, db.schema.artifact.id)
        )
        .innerJoin(
          db.schema.project,
          eq(db.schema.artifact.projectId, db.schema.project.id)
        )
        .innerJoin(
          db.schema.organization,
          eq(db.schema.project.organizationId, db.schema.organization.id)
        )
        .where(
          and(
            eq(
              db.schema.channel.platform,
              utils.constants.CHANNEL_PLATFORM_TELEGRAM
            ),
            sql`(${db.schema.channel.metadata}->'telegram'->'bot'->>'id')::bigint = ${telegramBotInfo.id}`
          )
        )
        .limit(1);

      if (conflict) {
        if (conflict.organizationId === currentValues.organizationId) {
          throw new Error(
            `Telegram bot @${telegramBotInfo.username} is already connected to project "${conflict.projectName}" in this organization. Remove it there first or use a different bot.`
          );
        }

        const [membership] = await tx
          .select({ organizationId: db.schema.organizationUser.organizationId })
          .from(db.schema.organizationUser)
          .where(
            and(
              eq(db.schema.organizationUser.userId, currentValues.userId),
              eq(
                db.schema.organizationUser.organizationId,
                conflict.organizationId
              )
            )
          )
          .limit(1);

        if (membership) {
          throw new Error(
            `Telegram bot @${telegramBotInfo.username} is already connected to project "${conflict.projectName}" in your organization "${conflict.organizationName}". Remove it there first or use a different bot.`
          );
        }

        throw new Error(
          `Telegram bot @${telegramBotInfo.username} is already connected to a project in another organization you don't have access to. Use a different bot.`
        );
      }
    }

    if (slackBotInfo) {
      const botLabel = slackBotInfo.username
        ? `@${slackBotInfo.username}`
        : 'this Slack app';
      const [conflict] = await tx
        .select({
          projectName: db.schema.project.name,
          organizationId: db.schema.project.organizationId,
          organizationName: db.schema.organization.name
        })
        .from(db.schema.channel)
        .innerJoin(
          db.schema.artifact,
          eq(db.schema.channel.artifactId, db.schema.artifact.id)
        )
        .innerJoin(
          db.schema.project,
          eq(db.schema.artifact.projectId, db.schema.project.id)
        )
        .innerJoin(
          db.schema.organization,
          eq(db.schema.project.organizationId, db.schema.organization.id)
        )
        .where(
          and(
            eq(
              db.schema.channel.platform,
              utils.constants.CHANNEL_PLATFORM_SLACK
            ),
            // Same bot user in the same workspace = the same Slack app.
            sql`${db.schema.channel.metadata}->'slack'->'bot'->>'teamId' = ${slackBotInfo.teamId}`,
            sql`${db.schema.channel.metadata}->'slack'->'bot'->>'userId' = ${slackBotInfo.userId}`
          )
        )
        .limit(1);

      if (conflict) {
        if (conflict.organizationId === currentValues.organizationId) {
          throw new Error(
            `Slack app ${botLabel} is already connected to project "${conflict.projectName}" in this organization. Remove it there first or use a different app.`
          );
        }

        const [membership] = await tx
          .select({ organizationId: db.schema.organizationUser.organizationId })
          .from(db.schema.organizationUser)
          .where(
            and(
              eq(db.schema.organizationUser.userId, currentValues.userId),
              eq(
                db.schema.organizationUser.organizationId,
                conflict.organizationId
              )
            )
          )
          .limit(1);

        if (membership) {
          throw new Error(
            `Slack app ${botLabel} is already connected to project "${conflict.projectName}" in your organization "${conflict.organizationName}". Remove it there first or use a different app.`
          );
        }

        throw new Error(
          `Slack app ${botLabel} is already connected to a project in another organization you don't have access to. Use a different app.`
        );
      }
    }

    if (currentValues.llmId) {
      const [llmRow] = await tx
        .select({ id: db.schema.organizationLlm.id })
        .from(db.schema.organizationLlm)
        .where(
          and(
            eq(db.schema.organizationLlm.id, currentValues.llmId),
            eq(
              db.schema.organizationLlm.organizationId,
              currentValues.organizationId
            )
          )
        )
        .limit(1);

      if (!llmRow) throw new Error('LLM not found for the organization');
    }

    const [channelRow] = await tx
      .insert(db.schema.channel)
      .values({
        platform: currentValues.platform,
        status: utils.constants.STATUS_ACTIVE,
        config: currentValues.config || null,
        metadata: platformMetadata,
        credentials: encryptedCredentials,
        webhookSecret: hashedSecret,
        artifactId: artifactRow.id,
        llmId: currentValues.llmId || null
      })
      .returning();

    await tx
      .update(db.schema.artifact)
      .set({
        channelCount: sql`(${db.schema.artifact.channelCount}::int + 1)::int`
      })
      .where(eq(db.schema.artifact.id, artifactRow.id));

    if (currentValues.platform === utils.constants.CHANNEL_PLATFORM_TELEGRAM) {
      const webhookUrl = `${apiUrl}/channel/${channelRow.id}/webhook/telegram`;
      await registerTelegramWebhook(
        currentValues.credentials.botToken,
        webhookUrl,
        rawSecret
      );

      const prompts = await tx
        .select({
          title: db.schema.artifactPrompt.title,
          description: db.schema.artifactPrompt.description
        })
        .from(db.schema.artifactPrompt)
        .where(eq(db.schema.artifactPrompt.artifactId, artifactRow.id));

      // Proxied (GitHub/Notion) prompts are slash commands too — same shape, so
      // they appear in the bot's command menu alongside artifact prompts.
      const proxiedPrompts = await loadProxiedPrompts(
        db.create(c),
        artifactRow.id
      );

      await registerTelegramBotCommands(currentValues.credentials.botToken, [
        ...prompts,
        ...proxiedPrompts.map(p => ({
          title: p.title,
          description: p.description
        }))
      ]);
    }

    return channelRow;
  });

  const { credentials: _c, webhookSecret: _w, ...safe } = result;
  return c.json(safe);
};

const update = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues = await utils.Schema.CHANNEL_UPDATE.parseAsync({
    ...body,
    channelId: c.req.param('channelId'),
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const dbInstance = db.create(c);
  const updates: Record<string, unknown> = {};

  if (currentValues.status) updates.status = currentValues.status;
  if (currentValues.config !== undefined) updates.config = currentValues.config;
  if (currentValues.credentials) {
    const encryptionKey = utils.getCredentialEncryptionKey(c);
    updates.credentials = utils.encryptString(
      JSON.stringify(currentValues.credentials),
      encryptionKey
    );
  }

  if (currentValues.llmId !== undefined) {
    if (currentValues.llmId === null) {
      updates.llmId = null;
    } else {
      const [llmRow] = await dbInstance
        .select({ id: db.schema.organizationLlm.id })
        .from(db.schema.organizationLlm)
        .where(
          and(
            eq(db.schema.organizationLlm.id, currentValues.llmId),
            eq(
              db.schema.organizationLlm.organizationId,
              currentValues.organizationId
            )
          )
        )
        .limit(1);

      if (!llmRow) throw new Error('LLM not found for the organization');
      updates.llmId = currentValues.llmId;
    }
  }

  const [updated] = await dbInstance
    .update(db.schema.channel)
    .set(updates)
    .where(eq(db.schema.channel.id, currentValues.channelId))
    .returning();

  if (!updated) throw new Error('Channel not found');

  const { credentials: _c, webhookSecret: _w, ...safe } = updated;
  return c.json(safe);
};

const remove = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.CHANNEL_REMOVE.parseAsync({
    channelId: c.req.param('channelId'),
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const dbInstance = db.create(c);

  await dbInstance.transaction(async tx => {
    const [channelRow] = await tx
      .select()
      .from(db.schema.channel)
      .where(eq(db.schema.channel.id, currentValues.channelId))
      .limit(1);

    if (!channelRow) throw new Error('Channel not found');

    await tx
      .delete(db.schema.channel)
      .where(eq(db.schema.channel.id, currentValues.channelId));

    await tx
      .update(db.schema.artifact)
      .set({
        channelCount: sql`(${db.schema.artifact.channelCount}::int - 1)::int`
      })
      .where(eq(db.schema.artifact.id, channelRow.artifactId));
  });

  return c.json(currentValues);
};

const listConversations = async (c: Context<AppEnv>) => {
  const currentValues =
    await utils.Schema.CHANNEL_LIST_CONVERSATIONS.parseAsync({
      channelId: c.req.param('channelId'),
      projectId: c.req.param('projectId'),
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId')
    });

  const dbInstance = db.create(c);
  const rows = await dbInstance
    .select()
    .from(db.schema.channelConversation)
    .where(eq(db.schema.channelConversation.channelId, currentValues.channelId))
    .orderBy(desc(db.schema.channelConversation.lastMessageAt));

  return c.json(rows);
};

const listMessages = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.CHANNEL_LIST_MESSAGES.parseAsync({
    channelId: c.req.param('channelId'),
    conversationId: c.req.param('conversationId'),
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const dbInstance = db.create(c);

  const messages = await dbInstance.query.channelMessage.findMany({
    where: eq(
      db.schema.channelMessage.conversationId,
      currentValues.conversationId
    ),
    orderBy: desc(db.schema.channelMessage.createdAt),
    with: {
      participant: {
        with: {
          linkedUser: {
            columns: { id: true, name: true, image: true }
          }
        }
      },
      usages: {
        with: {
          artifactTool: { with: { toolDefinition: true } },
          artifactResource: true,
          artifactPrompt: true
        }
      }
    }
  });

  return c.json(messages);
};

const webhook = async (c: Context<AppEnv>) => {
  const platform = c.req.param('platform');
  if (platform === utils.constants.CHANNEL_PLATFORM_TELEGRAM) {
    return handleTelegramWebhook(c);
  }
  if (platform === utils.constants.CHANNEL_PLATFORM_SLACK) {
    return handleSlackWebhook(c);
  }
  return c.json({ error: `Unsupported platform: ${platform}` }, 400);
};

export const ChannelController = {
  list,
  create,
  update,
  remove,
  listConversations,
  listMessages,
  webhook
};
