import { Context } from 'hono';
import { and, desc, eq, sql } from 'drizzle-orm';
import { v7 as uuid } from 'uuid';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

import {
  handleTelegramWebhook,
  registerTelegramWebhook,
  getTelegramBotInfo
} from './telegram';
import { handleSlackWebhook, getSlackBotInfo } from './slack';
import {
  handleDiscordInteraction,
  handleDiscordIngest,
  getDiscordBotInfo,
  startGateway,
  stopGateway
} from './discord';
import {
  handleWhatsappWebhook,
  handleWhatsappVerification,
  getWhatsappBotInfo
} from './whatsapp';

import type { TelegramBotInfo } from './telegram';
import type { SlackBotInfo } from './slack';
import type { DiscordBotInfo } from './discord';
import type { WhatsappBotInfo } from './whatsapp';
import { loadCommandPrompts } from './proxiedPrompts';
import { assertNoChannelConflict } from './conflicts';
import {
  registerTelegramBotCommands,
  registerDiscordCommands,
  Plan
} from '../../utils';

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
  let discordBotInfo: DiscordBotInfo | null = null;
  let whatsappBotInfo: WhatsappBotInfo | null = null;
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
  } else if (
    currentValues.platform === utils.constants.CHANNEL_PLATFORM_DISCORD
  ) {
    if (
      !currentValues.credentials.botToken ||
      !currentValues.credentials.applicationId ||
      !currentValues.credentials.publicKey
    ) {
      throw new Error(
        'Discord channels require a bot token, an application id, and the application public key.'
      );
    }
    // Verifies the bot token and gives us the bot identity for the card +
    // duplicate-connection detection. The public key is verified later when
    // Discord signs the first interaction, so we store it as-is.
    discordBotInfo = await getDiscordBotInfo(
      currentValues.credentials.botToken
    );
    discordBotInfo.applicationId = currentValues.credentials.applicationId;
    platformMetadata = { discord: { bot: discordBotInfo } };
  } else if (
    currentValues.platform === utils.constants.CHANNEL_PLATFORM_WHATSAPP
  ) {
    if (
      !currentValues.credentials.accessToken ||
      !currentValues.credentials.phoneNumberId ||
      !currentValues.credentials.verifyToken ||
      !currentValues.credentials.appSecret
    ) {
      throw new Error(
        'WhatsApp channels require an access token, a phone number id, a webhook verify token, and the app secret.'
      );
    }
    // Verifies the access token can act for the number and gives us the bot
    // identity for the card + duplicate-connection detection. The verify token
    // and app secret can't be checked until Meta calls the webhook, so they're
    // stored as-is.
    whatsappBotInfo = await getWhatsappBotInfo(
      currentValues.credentials.accessToken,
      currentValues.credentials.phoneNumberId
    );
    platformMetadata = { whatsapp: { bot: whatsappBotInfo } };
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

    // Free plan caps the number of connected channels per artifact.
    Plan.assertChannelQuota(
      await Plan.getEffectivePlan(tx, currentValues.organizationId),
      artifactRow.channelCount
    );

    if (telegramBotInfo) {
      await assertNoChannelConflict(tx, {
        platform: utils.constants.CHANNEL_PLATFORM_TELEGRAM,
        match: [
          sql`(${db.schema.channel.metadata}->'telegram'->'bot'->>'id')::bigint = ${telegramBotInfo.id}`
        ],
        subject: `Telegram bot @${telegramBotInfo.username}`,
        noun: 'bot',
        userId: currentValues.userId,
        organizationId: currentValues.organizationId
      });
    }

    if (slackBotInfo) {
      await assertNoChannelConflict(tx, {
        platform: utils.constants.CHANNEL_PLATFORM_SLACK,
        // Same bot user in the same workspace = the same Slack app.
        match: [
          sql`${db.schema.channel.metadata}->'slack'->'bot'->>'teamId' = ${slackBotInfo.teamId}`,
          sql`${db.schema.channel.metadata}->'slack'->'bot'->>'userId' = ${slackBotInfo.userId}`
        ],
        subject: slackBotInfo.username
          ? `Slack app @${slackBotInfo.username}`
          : 'this Slack app',
        noun: 'app',
        userId: currentValues.userId,
        organizationId: currentValues.organizationId
      });
    }

    if (discordBotInfo) {
      await assertNoChannelConflict(tx, {
        platform: utils.constants.CHANNEL_PLATFORM_DISCORD,
        // Same bot user = the same Discord application.
        match: [
          sql`${db.schema.channel.metadata}->'discord'->'bot'->>'id' = ${discordBotInfo.id}`
        ],
        subject: discordBotInfo.username
          ? `Discord bot @${discordBotInfo.username}`
          : 'this Discord bot',
        noun: 'bot',
        userId: currentValues.userId,
        organizationId: currentValues.organizationId
      });
    }

    if (whatsappBotInfo) {
      await assertNoChannelConflict(tx, {
        platform: utils.constants.CHANNEL_PLATFORM_WHATSAPP,
        // Same Cloud API phone-number id = the same WhatsApp sender.
        match: [
          sql`${db.schema.channel.metadata}->'whatsapp'->'bot'->>'phoneNumberId' = ${whatsappBotInfo.phoneNumberId}`
        ],
        subject: whatsappBotInfo.displayPhoneNumber
          ? `WhatsApp number ${whatsappBotInfo.displayPhoneNumber}`
          : 'this WhatsApp number',
        noun: 'number',
        userId: currentValues.userId,
        organizationId: currentValues.organizationId
      });
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

      await registerTelegramBotCommands(
        currentValues.credentials.botToken,
        await loadCommandPrompts(db.create(c), artifactRow.id)
      );
    }

    if (currentValues.platform === utils.constants.CHANNEL_PLATFORM_DISCORD) {
      await registerDiscordCommands(
        currentValues.credentials.botToken,
        currentValues.credentials.applicationId,
        await loadCommandPrompts(db.create(c), artifactRow.id)
      );
    }

    return channelRow;
  });

  // Open the persistent Gateway connection AFTER the channel row is committed —
  // the DiscordGatewayDO reads the row (over its own connection) on start().
  if (currentValues.platform === utils.constants.CHANNEL_PLATFORM_DISCORD) {
    await startGateway(c, result.id);
  }

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

  // Keep the Discord Gateway connection in sync: an active channel (re)connects
  // — also picking up rotated credentials — while a disabled one disconnects.
  if (updated.platform === utils.constants.CHANNEL_PLATFORM_DISCORD) {
    if (updated.status === utils.constants.STATUS_ACTIVE) {
      await startGateway(c, updated.id);
    } else {
      await stopGateway(c, updated.id);
    }
  }

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

  const removedPlatform = await dbInstance.transaction(async tx => {
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

    return channelRow.platform;
  });

  // Tear down the persistent Gateway connection for a removed Discord channel.
  if (removedPlatform === utils.constants.CHANNEL_PLATFORM_DISCORD) {
    await stopGateway(c, currentValues.channelId);
  }

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
  if (platform === utils.constants.CHANNEL_PLATFORM_DISCORD) {
    return handleDiscordInteraction(c);
  }
  if (platform === utils.constants.CHANNEL_PLATFORM_WHATSAPP) {
    return handleWhatsappWebhook(c);
  }
  return c.json({ error: `Unsupported platform: ${platform}` }, 400);
};

// GET on the same Request URL. Only WhatsApp uses it — Meta performs a
// hub.challenge handshake when the tenant saves the Callback URL in their app
// dashboard. The other platforms verify their URL over POST, so a GET there is
// just unsupported.
const webhookVerify = async (c: Context<AppEnv>) => {
  const platform = c.req.param('platform');
  if (platform === utils.constants.CHANNEL_PLATFORM_WHATSAPP) {
    return handleWhatsappVerification(c);
  }
  return c.json({ error: `Unsupported platform: ${platform}` }, 400);
};

// Internal: the DiscordGatewayDO posts Gateway messages here (via the API
// service binding) to run a turn in normal request context. Guarded by the
// internal secret inside the handler.
const discordIngest = async (c: Context<AppEnv>) => handleDiscordIngest(c);

export const ChannelController = {
  list,
  create,
  update,
  remove,
  listConversations,
  listMessages,
  webhook,
  webhookVerify,
  discordIngest
};
