import { and, eq, notInArray, sql } from 'drizzle-orm';
import { utils } from '@ganju/utils';

import * as schema from './schema';
import type { DbExecutor } from './usage';

const { constants } = utils;

// A WhatsApp channel's message templates on Meta's Graph API: finding the
// business account (WABA) they belong to, listing them into the
// channel_whatsapp_template cache, and creating, editing and deleting them.
// Meta stays the source of truth; the cache is what sends and the dashboard
// read between syncs.

const GRAPH = `${constants.WHATSAPP_API_BASE}/${constants.WHATSAPP_API_VERSION}`;
// The permission templates need, besides whatsapp_business_messaging.
export const WHATSAPP_MANAGEMENT_SCOPE = 'whatsapp_business_management';
const MAX_PAGES = 20;

export interface WhatsappChannelCredentials {
  accessToken: string;
  phoneNumberId: string;
  verifyToken?: string;
  appSecret?: string;
  businessAccountId?: string;
}

export type WhatsappTemplateErrorReason =
  // No business account id stored, and Meta didn't give one.
  | 'no_account'
  // The stored id isn't a business account, or not the number's.
  | 'account'
  // The token can't manage templates, or can't see that account.
  | 'permission'
  // The token expired or was revoked.
  | 'token'
  // Anything else Meta refused, in its own words.
  | 'meta';

export class WhatsappTemplateError extends Error {
  readonly reason: WhatsappTemplateErrorReason;

  constructor(message: string, reason: WhatsappTemplateErrorReason) {
    super(message);
    this.name = 'WhatsappTemplateError';
    this.reason = reason;
  }
}

interface GraphError {
  code?: number;
  error_subcode?: number;
  message?: string;
  error_user_title?: string;
  error_user_msg?: string;
}

const graph = async (
  accessToken: string,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{
  ok: boolean;
  body: Record<string, unknown>;
  error?: GraphError;
}> => {
  const response = await fetch(`${GRAPH}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {})
  }).catch(() => null);
  if (!response) {
    return { ok: false, body: {}, error: { message: "Meta didn't answer." } };
  }
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return {
    ok: response.ok,
    body,
    ...(response.ok ? {} : { error: (body.error as GraphError) ?? {} })
  };
};

// Meta's error, as it wrote it.
const metaText = (error: GraphError | undefined) => {
  const user = [error?.error_user_title, error?.error_user_msg]
    .filter(Boolean)
    .join(': ');
  return (user || error?.message || 'Meta refused the request.').slice(0, 600);
};

const WRONG_ACCOUNT =
  "That ID isn't the WhatsApp Business account of this channel's number. Copy the WhatsApp Business Account ID from the app's WhatsApp → API Setup page (not the phone number ID or the app ID).";

// Meta's answer when the id is some other object (a phone number, an app):
// it has no message_templates or phone_numbers field.
const isWrongObject = (error: GraphError | undefined) =>
  error?.code === 100 &&
  error?.error_subcode !== 33 &&
  /nonexisting field|unknown path components|does not exist/i.test(
    error?.message ?? ''
  );

const toError = (error: GraphError | undefined): WhatsappTemplateError => {
  const code = error?.code;
  if (isWrongObject(error)) {
    return new WhatsappTemplateError(WRONG_ACCOUNT, 'account');
  }
  if (code === 190) {
    return new WhatsappTemplateError(
      "The channel's access token expired or was revoked. Paste a new one.",
      'token'
    );
  }
  // 10 and 200–299 are permission errors; 100/33 is an object the token
  // can't see, which for a business account means the same.
  if (
    code === 10 ||
    (code !== undefined && code >= 200 && code < 300) ||
    (code === 100 && error?.error_subcode === 33)
  ) {
    return new WhatsappTemplateError(metaText(error), 'permission');
  }
  return new WhatsappTemplateError(metaText(error), 'meta');
};

/**
 * The business account a token and number belong to. Meta's debug_token
 * lists, under the token's whatsapp_business_management scope, the accounts
 * it may manage; with several, the one that has the number wins. Null when
 * the token can't tell, which is also what a token without that permission
 * gets.
 */
export const detectBusinessAccount = async (
  accessToken: string,
  phoneNumberId: string
): Promise<{ businessAccountId: string | null; canManage: boolean | null }> => {
  const debug = await graph(
    accessToken,
    `/debug_token?input_token=${encodeURIComponent(accessToken)}`
  );
  const data = debug.body.data as
    | {
        scopes?: string[];
        granular_scopes?: { scope?: string; target_ids?: string[] }[];
      }
    | undefined;
  if (!debug.ok || !data) return { businessAccountId: null, canManage: null };
  const canManage = Array.isArray(data.scopes)
    ? data.scopes.includes(WHATSAPP_MANAGEMENT_SCOPE)
    : null;
  const ids =
    data.granular_scopes?.find(s => s.scope === WHATSAPP_MANAGEMENT_SCOPE)
      ?.target_ids ?? [];
  if (ids.length === 1) return { businessAccountId: ids[0], canManage };
  for (const id of ids.slice(0, 10)) {
    const numbers = await graph(
      accessToken,
      `/${encodeURIComponent(id)}/phone_numbers?fields=id&limit=100`
    );
    const list = (numbers.body.data as { id?: string }[] | undefined) ?? [];
    if (list.some(n => n.id === phoneNumberId)) {
      return { businessAccountId: id, canManage };
    }
  }
  return { businessAccountId: null, canManage };
};

/**
 * Checks an account id before it is stored: it has to be a business account
 * the token can see, with the channel's number in it. Throws the reason
 * when it isn't; a token that can't list numbers (permission, expired) is
 * thrown as such, so the caller decides whether to keep the id anyway.
 */
export const checkBusinessAccount = async (
  accessToken: string,
  phoneNumberId: string,
  businessAccountId: string
): Promise<void> => {
  const numbers = await graph(
    accessToken,
    `/${encodeURIComponent(businessAccountId)}/phone_numbers?fields=id&limit=100`
  );
  if (!numbers.ok) {
    // Meta says "object does not exist or you lack permission" (100/33) both
    // for a typo and for an account the token can't see.
    if (numbers.error?.code === 100 && numbers.error?.error_subcode === 33) {
      throw new WhatsappTemplateError(
        "Meta can't find a WhatsApp Business account with that ID that this token can see. Check the ID (the WhatsApp Business Account ID on the app's WhatsApp → API Setup page, not the phone number ID), or paste a token with whatsapp_business_management for that account.",
        'account'
      );
    }
    throw toError(numbers.error);
  }
  const list = (numbers.body.data as { id?: string }[] | undefined) ?? [];
  if (!list.some(n => n.id === phoneNumberId)) {
    throw new WhatsappTemplateError(
      "This WhatsApp Business account doesn't have the channel's phone number. Check that you copied the account the number is in.",
      'account'
    );
  }
};

const accountOf = (credentials: WhatsappChannelCredentials): string => {
  if (!credentials.businessAccountId) {
    throw new WhatsappTemplateError(
      "The channel doesn't know its WhatsApp Business account yet.",
      'no_account'
    );
  }
  return encodeURIComponent(credentials.businessAccountId);
};

/**
 * Subscribes the token's app to the business account's webhooks. Without
 * it Meta delivers real messages to the number but never posts them to the
 * Callback URL, while the dashboard's Test button still works. Safe to
 * repeat.
 */
export const subscribeAppToAccount = async (
  credentials: WhatsappChannelCredentials
): Promise<void> => {
  const result = await graph(
    credentials.accessToken,
    `/${accountOf(credentials)}/subscribed_apps`,
    { method: 'POST' }
  );
  if (!result.ok) throw toError(result.error);
};

interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  rejected_reason?: string;
  components?: unknown[];
}

const listTemplates = async (
  credentials: WhatsappChannelCredentials
): Promise<{ templates: MetaTemplate[]; complete: boolean }> => {
  const account = accountOf(credentials);
  const base = `/${account}/message_templates?fields=id,name,language,category,status,rejected_reason,components&limit=100`;
  const out: MetaTemplate[] = [];
  let path: string | null = base;
  for (let page = 0; path && page < MAX_PAGES; page++) {
    const result = await graph(credentials.accessToken, path);
    if (!result.ok) throw toError(result.error);
    out.push(...((result.body.data as MetaTemplate[] | undefined) ?? []));
    const paging = result.body.paging as
      | { next?: string; cursors?: { after?: string } }
      | undefined;
    const after = paging?.next ? paging.cursors?.after : undefined;
    path = after ? `${base}&after=${encodeURIComponent(after)}` : null;
  }
  // Past the last page read, more may exist: nothing is removed then.
  return { templates: out, complete: !path };
};

// "NONE" is Meta's way of saying there is no reason.
const reasonOf = (reason: unknown) =>
  typeof reason === 'string' && reason && reason !== 'NONE'
    ? reason.slice(0, 500)
    : null;

/** A template whose status changed, for whoever needs to hear about it. */
export interface WhatsappTemplateTransition {
  channelId: string;
  name: string;
  language: string;
  from: string | null;
  to: string;
  reason: string | null;
}

// The channel's last read of its templates from Meta, kept on its metadata:
// when, and whether Meta answered. Failed reads count, so a token that can't
// read them isn't sent to Meta again on every message.
export const TEMPLATES_READ_KEY = 'whatsappTemplatesRead';

export interface WhatsappTemplatesRead {
  at: string;
  ok: boolean;
}

export const lastTemplatesRead = (
  metadata: unknown
): WhatsappTemplatesRead | null => {
  const read = (metadata as Record<string, unknown> | null)?.[
    TEMPLATES_READ_KEY
  ] as WhatsappTemplatesRead | undefined;
  return read && typeof read.at === 'string' ? read : null;
};

const recordTemplatesRead = (
  executor: DbExecutor,
  channelId: string,
  ok: boolean
) =>
  executor
    .update(schema.channel)
    .set({
      metadata: sql`(coalesce(${schema.channel.metadata}::jsonb, '{}'::jsonb) || jsonb_build_object(${TEMPLATES_READ_KEY}::text, jsonb_build_object('at', ${new Date().toISOString()}::text, 'ok', ${ok}::boolean)))::json`
    })
    .where(eq(schema.channel.id, channelId))
    .catch(error =>
      console.error(
        'whatsapp-template-read-record-failed',
        channelId,
        error instanceof Error ? error.message : String(error)
      )
    );

/**
 * Reads every template of the channel's business account from Meta into
 * the cache: status, category and components are overwritten, and the ones
 * deleted in Meta are removed. Returns the status changes. The attempt is
 * recorded on the channel, whether Meta answered or not.
 */
export const syncWhatsappTemplates = async (
  executor: DbExecutor,
  channelId: string,
  credentials: WhatsappChannelCredentials
): Promise<WhatsappTemplateTransition[]> => {
  let listed: Awaited<ReturnType<typeof listTemplates>>;
  try {
    listed = await listTemplates(credentials);
  } catch (error) {
    await recordTemplatesRead(executor, channelId, false);
    throw error;
  }
  await recordTemplatesRead(executor, channelId, true);
  const { templates, complete } = listed;
  const table = schema.channelWhatsappTemplate;
  const existing = await executor
    .select({
      name: table.name,
      language: table.language,
      status: table.status
    })
    .from(table)
    .where(eq(table.channelId, channelId));
  const before = new Map(
    existing.map(row => [`${row.name}\u0000${row.language}`, row.status])
  );
  const now = new Date();
  const transitions: WhatsappTemplateTransition[] = [];
  for (const template of templates) {
    const values = {
      templateId: String(template.id),
      category: String(template.category ?? ''),
      status: String(template.status ?? ''),
      rejectedReason: reasonOf(template.rejected_reason),
      components: template.components ?? [],
      syncedAt: now
    };
    await executor
      .insert(table)
      .values({
        channelId,
        name: template.name,
        language: template.language,
        ...values
      })
      .onConflictDoUpdate({
        target: [table.channelId, table.name, table.language],
        set: values
      });
    const was = before.get(`${template.name}\u0000${template.language}`);
    if (was !== values.status) {
      transitions.push({
        channelId,
        name: template.name,
        language: template.language,
        from: was ?? null,
        to: values.status,
        reason: values.rejectedReason
      });
    }
  }
  const ids = templates.map(t => String(t.id));
  if (complete) {
    await executor
      .delete(table)
      .where(
        ids.length > 0
          ? and(
              eq(table.channelId, channelId),
              notInArray(table.templateId, ids)
            )
          : eq(table.channelId, channelId)
      );
  }
  return transitions;
};

/**
 * One template's status as Meta's webhook reported it. Null when the cache
 * doesn't have it, so the caller syncs the channel instead.
 */
export const applyWhatsappTemplateStatus = async (
  executor: DbExecutor,
  channelId: string,
  event: {
    templateId: string;
    status: string;
    reason?: string | null;
    category?: string | null;
  }
): Promise<WhatsappTemplateTransition | null> => {
  const table = schema.channelWhatsappTemplate;
  const [row] = await executor
    .select()
    .from(table)
    .where(
      and(
        eq(table.channelId, channelId),
        eq(table.templateId, event.templateId)
      )
    )
    .limit(1);
  if (!row) return null;
  if (event.status === 'DELETED') {
    await executor.delete(table).where(eq(table.id, row.id));
  } else {
    await executor
      .update(table)
      .set({
        status: event.status,
        rejectedReason: reasonOf(event.reason),
        ...(event.category ? { category: event.category } : {}),
        syncedAt: new Date()
      })
      .where(eq(table.id, row.id));
  }
  return {
    channelId,
    name: row.name,
    language: row.language,
    from: row.status,
    to: event.status,
    reason: reasonOf(event.reason)
  };
};

/** Sends a new template for Meta's review. It comes back PENDING, usually. */
export const createWhatsappTemplate = async (
  credentials: WhatsappChannelCredentials,
  template: {
    name: string;
    language: string;
    category: string;
    components: Record<string, unknown>[];
  }
): Promise<{ id: string; status: string; category: string }> => {
  const result = await graph(
    credentials.accessToken,
    `/${accountOf(credentials)}/message_templates`,
    { method: 'POST', body: template }
  );
  if (!result.ok) throw toError(result.error);
  return {
    id: String(result.body.id ?? ''),
    status: String(result.body.status ?? 'PENDING'),
    category: String(result.body.category ?? template.category)
  };
};

/** Meta limits how often an approved template can be edited; its error says so. */
export const editWhatsappTemplate = async (
  credentials: WhatsappChannelCredentials,
  templateId: string,
  template: { category: string; components: Record<string, unknown>[] }
): Promise<void> => {
  const result = await graph(
    credentials.accessToken,
    `/${encodeURIComponent(templateId)}`,
    { method: 'POST', body: template }
  );
  if (!result.ok) throw toError(result.error);
};

export const deleteWhatsappTemplate = async (
  credentials: WhatsappChannelCredentials,
  template: { name: string; templateId: string }
): Promise<void> => {
  const result = await graph(
    credentials.accessToken,
    `/${accountOf(credentials)}/message_templates?name=${encodeURIComponent(template.name)}&hsm_id=${encodeURIComponent(template.templateId)}`,
    { method: 'DELETE' }
  );
  if (!result.ok) throw toError(result.error);
};

// Approved templates are read again daily, so a pause or a disable is noticed
// even when the owner's Meta app doesn't send the status webhook.
const STALE_MS = 24 * 60 * 60 * 1000;

/**
 * The channels the hourly run syncs: those with templates still in Meta's
 * hands, and those whose list is a day old. Oldest first.
 */
export const channelsToResync = async (
  executor: DbExecutor,
  limit: number,
  now: Date = new Date()
): Promise<string[]> => {
  const table = schema.channelWhatsappTemplate;
  const waiting = sql.join(
    utils.WHATSAPP_TEMPLATE_STATUSES_WAITING.map(status => sql`${status}`),
    sql`, `
  );
  const rows = await executor
    .select({ channelId: table.channelId })
    .from(table)
    .innerJoin(schema.channel, eq(schema.channel.id, table.channelId))
    .where(eq(schema.channel.status, constants.STATUS_ACTIVE))
    .groupBy(table.channelId)
    .having(
      sql`bool_or(${table.status} in (${waiting})) or max(${table.syncedAt}) < ${new Date(now.getTime() - STALE_MS).toISOString()}`
    )
    .orderBy(sql`max(${table.syncedAt})`)
    .limit(limit);
  return rows.map(row => row.channelId);
};
