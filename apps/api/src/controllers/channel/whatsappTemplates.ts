import { Context } from 'hono';
import { and, asc, eq } from 'drizzle-orm';
import { db, utils as dbUtils } from '@ganju/db';
import { utils } from '@ganju/utils';

import { getWhatsappBotInfo } from './whatsapp';
import { loadProjectChannel } from './projectChannel';
import {
  notifyStoppedTemplates,
  storeWhatsappCredentials,
  whatsappCredentials
} from '../../utils/whatsappTemplates';

import type { WhatsappChannelCredentials } from '@ganju/db';
import type { WhatsappTemplateDraft } from '@ganju/utils';
import type { AppEnv } from '../../types';

// A WhatsApp channel's message templates, from its settings: list, sync
// with Meta, create, edit and delete, and the business account and token
// they need. Meta answers every change; its errors are shown as it words
// them.

type TemplateRow = typeof db.schema.channelWhatsappTemplate.$inferSelect;

// Why templates can't be read right now: no business account known, a
// token without whatsapp_business_management, an expired token, or another
// refusal from Meta.
type Access = 'ok' | 'no_account' | 'account' | 'permission' | 'token' | 'meta';

const templateView = (row: TemplateRow) => {
  const content = utils.whatsappTemplateContent(row.components);
  return {
    id: row.id,
    templateId: row.templateId,
    name: row.name,
    language: row.language,
    category: row.category,
    status: row.status,
    rejectedReason: row.rejectedReason,
    ...content,
    labels: Array.isArray(row.variableLabels)
      ? (row.variableLabels as unknown[]).map(l => String(l ?? ''))
      : [],
    variableCount: utils.whatsappTemplateVariableCount(content.body),
    // Ganju fills body variables only.
    sendable: utils.whatsappTemplateSendable(row.components),
    syncedAt: row.syncedAt
  };
};

// The project's WhatsApp channel named in the path, or null.
const loadChannel = async (c: Context<AppEnv>) => {
  const params = await utils.Schema.CHANNEL_WHATSAPP_PARAMS.parseAsync({
    channelId: c.req.param('channelId'),
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });
  const executor = db.create(c);
  const channel = await loadProjectChannel(
    executor,
    params.projectId,
    params.channelId
  );
  if (
    !channel ||
    channel.platform !== utils.constants.CHANNEL_PLATFORM_WHATSAPP
  ) {
    return null;
  }
  return { executor, channel, credentials: whatsappCredentials(c, channel) };
};

type Loaded = NonNullable<Awaited<ReturnType<typeof loadChannel>>>;

const notFound = (c: Context<AppEnv>) =>
  c.json({ error: 'WhatsApp channel not found' }, 404);

const metaError = (c: Context<AppEnv>, error: unknown) => {
  if (error instanceof db.whatsappTemplates.WhatsappTemplateError) {
    return c.json(
      { error: error.message, reason: error.reason },
      error.reason === 'meta' ? 400 : 409
    );
  }
  throw error;
};

const cached = async (loaded: Loaded) => {
  const table = db.schema.channelWhatsappTemplate;
  const rows = await loaded.executor
    .select()
    .from(table)
    .where(eq(table.channelId, loaded.channel.id))
    .orderBy(asc(table.name), asc(table.language));
  return rows;
};

const state = async (
  loaded: Loaded,
  access: Access | null,
  error: string | null
) => {
  const rows = await cached(loaded);
  return {
    businessAccountId: loaded.credentials.businessAccountId ?? null,
    // null: not checked by this request.
    access,
    error,
    templates: rows.map(templateView),
    syncedAt: rows.reduce<Date | null>(
      (latest, row) =>
        !latest || row.syncedAt > latest ? row.syncedAt : latest,
      null
    )
  };
};

/**
 * Subscribes the channel's app to its business account, so Meta posts the
 * number's messages to Ganju. A failure is logged, not thrown: the channel
 * still works for what doesn't need it, and the docs say how to do it by
 * hand.
 */
export const subscribeWhatsappApp = async (
  c: Context<AppEnv>,
  channelId: string,
  credentials: WhatsappChannelCredentials
): Promise<void> => {
  await db.whatsappTemplates.subscribeAppToAccount(credentials).catch(error =>
    dbUtils.handleError(c, error, {
      service: utils.constants.SERVICE_NAME_API,
      metadata: {
        source: 'whatsapp-subscribe-app',
        channelId,
        businessAccountId: credentials.businessAccountId
      }
    })
  );
};

// Fills in the business account from the token when the channel doesn't
// have it. Returns whether the token can manage templates, when Meta says.
const ensureAccount = async (
  c: Context<AppEnv>,
  loaded: Loaded
): Promise<boolean | null> => {
  if (loaded.credentials.businessAccountId) return null;
  const found = await db.whatsappTemplates.detectBusinessAccount(
    loaded.credentials.accessToken,
    loaded.credentials.phoneNumberId
  );
  if (found.businessAccountId) {
    loaded.credentials.businessAccountId = found.businessAccountId;
    await storeWhatsappCredentials(
      c,
      loaded.executor,
      loaded.channel.id,
      loaded.credentials
    );
  }
  return found.canManage;
};

/** The cached templates; the dashboard's trigger form and the CLI read these. */
const list = async (c: Context<AppEnv>) => {
  const loaded = await loadChannel(c);
  if (!loaded) return notFound(c);
  return c.json(await state(loaded, null, null));
};

/**
 * Reads the templates from Meta: what opening the page and "Refresh" do.
 * The reading call is also the permission check, so a token without
 * whatsapp_business_management gets `access: "permission"`, not an error.
 */
const sync = async (c: Context<AppEnv>) => {
  const loaded = await loadChannel(c);
  if (!loaded) return notFound(c);
  const canManage = await ensureAccount(c, loaded);
  if (!loaded.credentials.businessAccountId) {
    return c.json(
      await state(
        loaded,
        canManage === false ? 'permission' : 'no_account',
        null
      )
    );
  }
  try {
    const transitions = await db.whatsappTemplates.syncWhatsappTemplates(
      loaded.executor,
      loaded.channel.id,
      loaded.credentials
    );
    c.executionCtx.waitUntil(
      notifyStoppedTemplates(c, db.create(c), transitions).catch(error =>
        console.error('whatsapp-template-notify-failed', error)
      )
    );
    return c.json(await state(loaded, 'ok', null));
  } catch (error) {
    if (error instanceof db.whatsappTemplates.WhatsappTemplateError) {
      return c.json(await state(loaded, error.reason, error.message));
    }
    throw error;
  }
};

const checked = (draft: WhatsappTemplateDraft) => {
  const issues = utils.checkWhatsappTemplate(draft);
  return issues.length > 0
    ? issues.map(utils.whatsappTemplateIssueText).join(' ')
    : null;
};

const labelsOf = (labels: string[] | undefined, body: string) =>
  Array.from({ length: utils.whatsappTemplateVariableCount(body) }, (_, i) =>
    (labels?.[i] ?? '').trim()
  );

/** Sends a new template for Meta's review; it is stored as Meta answers. */
const create = async (c: Context<AppEnv>) => {
  const loaded = await loadChannel(c);
  if (!loaded) return notFound(c);
  const input = await utils.Schema.CHANNEL_WHATSAPP_TEMPLATE_CREATE.parseAsync(
    await c.req.json()
  );
  const problem = checked(input);
  if (problem) return c.json({ error: problem }, 400);
  await ensureAccount(c, loaded);
  const components = utils.whatsappTemplateComponents(input);
  try {
    const made = await db.whatsappTemplates.createWhatsappTemplate(
      loaded.credentials,
      {
        name: input.name,
        language: input.language,
        category: input.category,
        components
      }
    );
    const table = db.schema.channelWhatsappTemplate;
    const values = {
      templateId: made.id,
      category: made.category,
      status: made.status,
      rejectedReason: null,
      components,
      variableLabels: labelsOf(input.labels, input.body),
      syncedAt: new Date()
    };
    const [row] = await loaded.executor
      .insert(table)
      .values({
        channelId: loaded.channel.id,
        name: input.name,
        language: input.language,
        ...values
      })
      .onConflictDoUpdate({
        target: [table.channelId, table.name, table.language],
        set: values
      })
      .returning();
    return c.json(templateView(row));
  } catch (error) {
    return metaError(c, error);
  }
};

const loadTemplate = async (c: Context<AppEnv>, loaded: Loaded) => {
  const { templateId } =
    await utils.Schema.CHANNEL_WHATSAPP_TEMPLATE_PARAMS.parseAsync({
      channelId: c.req.param('channelId'),
      templateId: c.req.param('templateId'),
      projectId: c.req.param('projectId'),
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId')
    });
  const table = db.schema.channelWhatsappTemplate;
  const [row] = await loaded.executor
    .select()
    .from(table)
    .where(
      and(eq(table.id, templateId), eq(table.channelId, loaded.channel.id))
    )
    .limit(1);
  return row ?? null;
};

/**
 * Changes a template's text. Meta reviews it again, and limits how often an
 * approved one can be edited; its error is shown as is.
 */
const update = async (c: Context<AppEnv>) => {
  const loaded = await loadChannel(c);
  if (!loaded) return notFound(c);
  const row = await loadTemplate(c, loaded);
  if (!row) return c.json({ error: 'Template not found' }, 404);
  const input = await utils.Schema.CHANNEL_WHATSAPP_TEMPLATE_CONTENT.parseAsync(
    await c.req.json()
  );
  const problem = checked({ ...input, name: row.name, language: row.language });
  if (problem) return c.json({ error: problem }, 400);
  const components = utils.whatsappTemplateComponents({
    ...input,
    name: row.name,
    language: row.language
  });
  try {
    await db.whatsappTemplates.editWhatsappTemplate(
      loaded.credentials,
      row.templateId,
      { category: input.category, components }
    );
  } catch (error) {
    return metaError(c, error);
  }
  const [updated] = await loaded.executor
    .update(db.schema.channelWhatsappTemplate)
    .set({
      category: input.category,
      components,
      variableLabels: labelsOf(input.labels, input.body),
      // An edit goes back to Meta's review.
      status: 'PENDING',
      rejectedReason: null,
      syncedAt: new Date()
    })
    .where(eq(db.schema.channelWhatsappTemplate.id, row.id))
    .returning();
  return c.json(templateView(updated));
};

/** Deletes this template, in this language, in Meta. */
const remove = async (c: Context<AppEnv>) => {
  const loaded = await loadChannel(c);
  if (!loaded) return notFound(c);
  const row = await loadTemplate(c, loaded);
  if (!row) return c.json({ error: 'Template not found' }, 404);
  try {
    await db.whatsappTemplates.deleteWhatsappTemplate(loaded.credentials, row);
  } catch (error) {
    return metaError(c, error);
  }
  await loaded.executor
    .delete(db.schema.channelWhatsappTemplate)
    .where(eq(db.schema.channelWhatsappTemplate.id, row.id));
  return c.json({ id: row.id });
};

/**
 * A new access token (one with whatsapp_business_management), the business
 * account's id, or both. The token is checked against the channel's number
 * and stored; like the rest of the credentials, it is never shown again.
 */
const updateAccount = async (c: Context<AppEnv>) => {
  const loaded = await loadChannel(c);
  if (!loaded) return notFound(c);
  const input = await utils.Schema.CHANNEL_WHATSAPP_ACCOUNT.parseAsync(
    await c.req.json()
  );
  const next: WhatsappChannelCredentials = { ...loaded.credentials };
  if (input.accessToken) {
    try {
      await getWhatsappBotInfo(input.accessToken, next.phoneNumberId);
    } catch {
      return c.json(
        {
          error:
            "Meta didn't accept this token for the channel's phone number. Check that it belongs to the same app and number."
        },
        400
      );
    }
    next.accessToken = input.accessToken;
  }
  if (input.businessAccountId) {
    // Checked before it is stored, so a wrong id is refused here instead of
    // breaking the templates page. A token that can't list the account's
    // numbers can't confirm it either: kept, and the sync says why.
    try {
      await db.whatsappTemplates.checkBusinessAccount(
        next.accessToken,
        next.phoneNumberId,
        input.businessAccountId
      );
    } catch (error) {
      if (
        !(error instanceof db.whatsappTemplates.WhatsappTemplateError) ||
        error.reason !== 'permission'
      ) {
        return metaError(c, error);
      }
    }
    next.businessAccountId = input.businessAccountId;
  }
  if (!next.businessAccountId) {
    const found = await db.whatsappTemplates.detectBusinessAccount(
      next.accessToken,
      next.phoneNumberId
    );
    if (found.businessAccountId) {
      next.businessAccountId = found.businessAccountId;
    }
  }
  await storeWhatsappCredentials(c, loaded.executor, loaded.channel.id, next);
  // A new token can be another app's, and a new account id another account.
  if (next.businessAccountId) {
    await subscribeWhatsappApp(c, loaded.channel.id, next);
  }
  return sync(c);
};

export const WhatsappTemplateController = {
  list,
  sync,
  create,
  update,
  remove,
  updateAccount
};
