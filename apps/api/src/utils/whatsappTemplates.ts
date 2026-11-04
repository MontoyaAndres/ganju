import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

// types
import type {
  DbExecutor,
  WhatsappChannelCredentials,
  WhatsappTemplateTransition
} from '@ganju/db';
import type { EnvSource } from '@ganju/utils';
import type { DataTrigger } from '@ganju/utils/data';
import type { Bindings } from '../types';

import { emailEach, organizationAdminEmails } from './dataTriggers';

type ApiEnvSource = EnvSource & { env: Bindings };

// Channels re-synced per hourly run; the rest wait for the next one.
const SYNC_BATCH = 50;
// A template sent within this long counts as one the owner uses.
const RECENT_USE_MS = 30 * 24 * 60 * 60 * 1000;

type ChannelRow = typeof db.schema.channel.$inferSelect;

export const whatsappCredentials = (
  source: ApiEnvSource,
  channel: ChannelRow
): WhatsappChannelCredentials =>
  JSON.parse(
    utils.decryptString(
      channel.credentials,
      utils.getCredentialEncryptionKey(source)
    )
  ) as WhatsappChannelCredentials;

export const storeWhatsappCredentials = async (
  source: ApiEnvSource,
  executor: DbExecutor,
  channelId: string,
  credentials: WhatsappChannelCredentials
) => {
  await executor
    .update(db.schema.channel)
    .set({
      credentials: utils.encryptString(
        JSON.stringify(credentials),
        utils.getCredentialEncryptionKey(source)
      )
    })
    .where(eq(db.schema.channel.id, channelId));
};

// What uses a template: the triggers that send it, and the functions that
// sent it lately.
const templateUsers = async (
  source: ApiEnvSource,
  executor: DbExecutor,
  channel: ChannelRow,
  template: { name: string; language: string }
): Promise<{ triggers: string[]; functions: string[] }> => {
  const triggers: string[] = [];
  const database = await db.data
    .findArtifactDatabase(executor, channel.artifactId)
    .catch(() => null);
  if (
    database &&
    database.status === utils.constants.ARTIFACT_DATABASE_STATUS_READY &&
    source.env.PROJECT_DATABASE
  ) {
    const stub = db.data.databaseStub(
      source.env.PROJECT_DATABASE,
      database.objectName
    );
    const listed = (await db.data
      .callData('listTriggers', () =>
        stub.listTriggers({ actor: 'system:whatsapp-templates' })
      )
      .catch(() => null)) as { triggers: DataTrigger[] } | null;
    for (const trigger of listed?.triggers ?? []) {
      const action = trigger.action;
      if (
        action.type === 'customer' &&
        action.template?.name === template.name &&
        action.template.language === template.language
      ) {
        triggers.push(`${trigger.table} · ${trigger.name}`);
      }
    }
  }
  const metadata = db.schema.channelMessage.metadata;
  const sent = await executor
    .selectDistinct({ name: sql<string>`${metadata}->>'function'` })
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
        eq(db.schema.channelConversation.channelId, channel.id),
        sql`${metadata}->'template'->>'name' = ${template.name}`,
        sql`${metadata}->'template'->>'language' = ${template.language}`,
        sql`${metadata}->>'function' is not null`,
        gt(
          db.schema.channelMessage.createdAt,
          new Date(Date.now() - RECENT_USE_MS)
        )
      )
    )
    .limit(20);
  return { triggers, functions: sent.map(row => row.name).filter(Boolean) };
};

/**
 * Meta paused or disabled a template (for low quality, say): the owners of
 * an organization that uses it hear about it, since the triggers and
 * functions sending it now fail.
 */
export const notifyStoppedTemplates = async (
  source: ApiEnvSource,
  executor: DbExecutor,
  transitions: WhatsappTemplateTransition[]
) => {
  const stopped = transitions.filter(
    t =>
      utils.WHATSAPP_TEMPLATE_STATUSES_STOPPED.includes(t.to) && t.from !== t.to
  );
  for (const transition of stopped) {
    const [found] = await executor
      .select({
        channel: db.schema.channel,
        organizationId: db.schema.project.organizationId,
        projectName: db.schema.project.name
      })
      .from(db.schema.channel)
      .innerJoin(
        db.schema.artifact,
        eq(db.schema.artifact.id, db.schema.channel.artifactId)
      )
      .innerJoin(
        db.schema.project,
        eq(db.schema.project.id, db.schema.artifact.projectId)
      )
      .where(eq(db.schema.channel.id, transition.channelId))
      .limit(1);
    if (!found) continue;
    const users = await templateUsers(
      source,
      executor,
      found.channel,
      transition
    );
    if (users.triggers.length === 0 && users.functions.length === 0) continue;
    const to = await organizationAdminEmails(executor, found.organizationId);
    const status = transition.to.toLowerCase();
    const web = utils.getEnv(source, 'NEXT_PUBLIC_WEB_URL') ?? '';
    await emailEach(source, to, {
      subject: `Ganju: Meta ${status} the WhatsApp template ${transition.name}`,
      text: [
        `Meta ${status} the WhatsApp template ${transition.name} (${transition.language}) on the project ${found.projectName}${transition.reason ? `. Meta's reason: ${transition.reason}` : ''}.`,
        'Until it is approved again, messages that use it fail with this reason:',
        ...users.triggers.map(name => `- trigger ${name}`),
        ...users.functions.map(name => `- function ${name}`),
        '',
        `Meta pauses a template when customers block or report its messages, and disables one that stays paused. Check it in the WhatsApp channel's Message templates${web ? ` (${web})` : ''}, or make a new one with different wording.`
      ].join('\n')
    });
  }
};

/**
 * Hourly: channels with templates still in Meta's review, and once a day
 * every channel with templates, are synced. Owners whose Meta app doesn't
 * send the status webhook still hear about a paused template.
 */
export const runWhatsappTemplateSync = async (source: ApiEnvSource) => {
  const executor = db.create(source);
  const channelIds = await db.whatsappTemplates
    .channelsToResync(executor, SYNC_BATCH)
    .catch(error => {
      console.error('whatsapp-template-sync-list-failed', error);
      return [] as string[];
    });
  for (const channelId of channelIds) {
    try {
      const [channel] = await executor
        .select()
        .from(db.schema.channel)
        .where(eq(db.schema.channel.id, channelId))
        .limit(1);
      if (!channel) continue;
      const transitions = await db.whatsappTemplates.syncWhatsappTemplates(
        executor,
        channel.id,
        whatsappCredentials(source, channel)
      );
      await notifyStoppedTemplates(source, executor, transitions);
    } catch (error) {
      console.error(
        'whatsapp-template-sync-failed',
        channelId,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
};
