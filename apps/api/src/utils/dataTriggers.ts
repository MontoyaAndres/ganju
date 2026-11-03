import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';
import { DataError } from '@ganju/utils/data';

// types
import type { DbExecutor } from '@ganju/db';
import type { EnvSource } from '@ganju/utils';
import type { Bindings } from '../types';

import { deliver } from './email';

type ApiEnvSource = EnvSource & { env: Bindings };

export interface ActiveFunctions {
  versionId: string;
  scriptName: string;
  allowedHosts: string[];
  timeoutMs: number;
  // Every function of the active version, exposed to the assistant or not.
  names: Set<string>;
}

// The project's published functions: what a trigger may run.
export const activeFunctions = async (
  executor: DbExecutor,
  artifactId: string
): Promise<ActiveFunctions | null> => {
  const [tool] = await executor
    .select({ config: db.schema.artifactTool.config })
    .from(db.schema.artifactTool)
    .where(
      and(
        eq(db.schema.artifactTool.artifactId, artifactId),
        eq(
          db.schema.artifactTool.toolKey,
          utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE
        )
      )
    )
    .limit(1);
  const config = utils.Schema.CUSTOM_CODE_CONFIG.safeParse(tool?.config ?? {});
  if (!tool || !config.success || !config.data.activeVersionId) return null;
  const [version] = await executor
    .select({
      id: db.schema.artifactToolVersion.id,
      tools: db.schema.artifactToolVersion.tools,
      scriptName: db.schema.artifactToolVersion.scriptName
    })
    .from(db.schema.artifactToolVersion)
    .where(eq(db.schema.artifactToolVersion.id, config.data.activeVersionId))
    .limit(1);
  if (!version) return null;
  const names = new Set(
    (Array.isArray(version.tools) ? version.tools : [])
      .map(raw => utils.Schema.CUSTOM_CODE_TOOL.safeParse(raw))
      .filter(result => result.success)
      .map(result => result.data!.name)
  );
  return {
    versionId: version.id,
    scriptName: version.scriptName ?? utils.customCodeScriptName(artifactId),
    allowedHosts: config.data.allowedHosts ?? [],
    timeoutMs: config.data.timeoutMs,
    names
  };
};

/**
 * What the object can't check: that a trigger's function is one this project
 * has published, and that its chat is on one of the project's channels.
 * `functions` is what `ganju deploy` is about to publish, when it is.
 */
export const checkTriggerTargets = async (
  executor: DbExecutor,
  artifactId: string,
  inputs: Record<string, unknown>[],
  functions?: Set<string>
): Promise<void> => {
  const wanted = inputs
    .map(input => input.function)
    .filter((name): name is string => typeof name === 'string');
  if (wanted.length > 0) {
    const names =
      functions ?? (await activeFunctions(executor, artifactId))?.names;
    const missing = [...new Set(wanted)].filter(name => !names?.has(name));
    if (missing.length > 0) {
      throw new DataError(
        `${missing.join(', ')} ${missing.length === 1 ? "isn't a function" : "aren't functions"} of this project; deploy ${missing.length === 1 ? 'it' : 'them'} first.`
      );
    }
  }
  const channels = inputs
    .map(
      input => (input.chat as { channelId?: unknown } | undefined)?.channelId
    )
    .filter((id): id is string => typeof id === 'string');
  if (channels.length > 0) {
    const found = await executor
      .select({
        id: db.schema.channel.id,
        platform: db.schema.channel.platform
      })
      .from(db.schema.channel)
      .where(
        and(
          eq(db.schema.channel.artifactId, artifactId),
          inArray(db.schema.channel.id, [...new Set(channels)])
        )
      );
    const missing = [...new Set(channels)].filter(
      id => !found.some(c => c.id === id)
    );
    if (missing.length > 0) {
      throw new DataError(
        `There is no channel ${missing[0]} in this project.`,
        'not_found'
      );
    }
    if (
      found.some(c => c.platform === utils.constants.CHANNEL_PLATFORM_WHATSAPP)
    ) {
      throw new DataError(
        "A chat message goes to a Telegram group or a Slack or Discord channel; on WhatsApp, message the row's customer instead."
      );
    }
  }
};

// The organization's admins, who own its projects.
export const organizationAdminEmails = async (
  executor: DbExecutor,
  organizationId: string
): Promise<string[]> => {
  const rows = await executor
    .select({ email: db.schema.user.email })
    .from(db.schema.organizationUser)
    .innerJoin(
      db.schema.user,
      eq(db.schema.user.id, db.schema.organizationUser.userId)
    )
    .where(
      and(
        eq(db.schema.organizationUser.organizationId, organizationId),
        eq(db.schema.organizationUser.role, utils.constants.USER_ROLE_ADMIN)
      )
    );
  return [...new Set(rows.map(row => row.email).filter(Boolean))];
};

// One plain email to each address; failures are logged by deliver. Returns
// the addresses it couldn't send to.
export const emailEach = async (
  source: ApiEnvSource,
  to: string[],
  email: { subject: string; text: string }
): Promise<string[]> => {
  const failed: string[] = [];
  for (const address of to) {
    if (!(await deliver(source, { to: address, ...email })))
      failed.push(address);
  }
  return failed;
};

const memberEmails = async (
  executor: DbExecutor,
  organizationId: string
): Promise<Set<string>> => {
  const rows = await executor
    .select({ email: db.schema.user.email })
    .from(db.schema.organizationUser)
    .innerJoin(
      db.schema.user,
      eq(db.schema.user.id, db.schema.organizationUser.userId)
    )
    .where(eq(db.schema.organizationUser.organizationId, organizationId));
  return new Set(rows.map(row => row.email.toLowerCase()));
};

const recipientsOf = (inputs: Record<string, unknown>[]) => {
  const addresses = inputs.flatMap(input => {
    const to = (input.email as { to?: unknown } | undefined)?.to;
    return Array.isArray(to) ? to : [to];
  });
  return [
    ...new Set(
      addresses
        .filter((to): to is string => typeof to === 'string')
        .map(to => to.toLowerCase())
    )
  ];
};

export interface EmailRecipients {
  // Members (no token) and confirmed addresses (their unsubscribe token).
  allowed: { address: string; token: string | null }[];
  // Not confirmed yet.
  pending: string[];
  // Confirmed once, then unsubscribed.
  stopped: string[];
}

/**
 * Who of `to` an email trigger may write to: the organization's members and
 * the addresses that confirmed and haven't unsubscribed.
 */
export const emailRecipients = async (
  executor: DbExecutor,
  organizationId: string,
  to: string[]
): Promise<EmailRecipients> => {
  const members = await memberEmails(executor, organizationId);
  const others = to.filter(address => !members.has(address.toLowerCase()));
  const rows =
    others.length === 0
      ? []
      : await executor
          .select({
            email: db.schema.dataEmailRecipient.email,
            token: db.schema.dataEmailRecipient.token,
            confirmedAt: db.schema.dataEmailRecipient.confirmedAt,
            unsubscribedAt: db.schema.dataEmailRecipient.unsubscribedAt
          })
          .from(db.schema.dataEmailRecipient)
          .where(
            and(
              eq(db.schema.dataEmailRecipient.organizationId, organizationId),
              inArray(
                db.schema.dataEmailRecipient.email,
                others.map(address => address.toLowerCase())
              )
            )
          );
  const byEmail = new Map(rows.map(row => [row.email, row]));
  const result: EmailRecipients = { allowed: [], pending: [], stopped: [] };
  for (const address of to) {
    if (members.has(address.toLowerCase())) {
      result.allowed.push({ address, token: null });
      continue;
    }
    const row = byEmail.get(address.toLowerCase());
    if (row?.unsubscribedAt) result.stopped.push(address);
    else if (row?.confirmedAt)
      result.allowed.push({ address, token: row.token });
    else result.pending.push(address);
  }
  return result;
};

// The page each link opens, under the API.
export const dataEmailLink = (
  source: ApiEnvSource,
  kind: 'confirm' | 'unsubscribe',
  token: string
) =>
  `${utils.getEnv(source, 'NEXT_PUBLIC_API_URL')}/data/email/${kind}/${token}`;

/**
 * One trigger email to each allowed address. A confirmed outsider's carries
 * an unsubscribe link and the one-click headers. Returns the addresses it
 * couldn't send to.
 */
export const emailRecipientsEach = async (
  source: ApiEnvSource,
  to: EmailRecipients['allowed'],
  email: { subject: string; text: string }
): Promise<string[]> => {
  const failed: string[] = [];
  for (const { address, token } of to) {
    const unsubscribe = token
      ? dataEmailLink(source, 'unsubscribe', token)
      : null;
    const sent = await deliver(source, {
      to: address,
      subject: email.subject,
      text: unsubscribe
        ? `${email.text}\n\n--\nStop these emails / Dejar de recibirlos: ${unsubscribe}`
        : email.text,
      ...(unsubscribe
        ? {
            headers: {
              'List-Unsubscribe': `<${unsubscribe}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
            }
          }
        : {})
    });
    if (!sent) failed.push(address);
  }
  return failed;
};

// New confirmation links an organization may send in 24 hours.
const CONFIRMATIONS_PER_DAY = 20;
const NAME_MAX = 60;

// One line, at most NAME_MAX long: a name can't add lines to the email.
const shorten = (raw: string) => {
  const value = raw.replace(/\s+/g, ' ').trim();
  return value.length > NAME_MAX ? `${value.slice(0, NAME_MAX - 1)}…` : value;
};

const confirmToken = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * After a trigger is saved: one confirmation link to each address its emails
 * would go to that isn't a member and has never been asked, up to
 * CONFIRMATIONS_PER_DAY for the organization. Returns the addresses still
 * waiting.
 */
export const requestEmailConfirmations = async (
  source: ApiEnvSource,
  executor: DbExecutor,
  target: { organizationId: string; projectName: string },
  inputs: Record<string, unknown>[]
): Promise<string[]> => {
  const wanted = recipientsOf(inputs);
  if (wanted.length === 0) return [];
  const { pending } = await emailRecipients(
    executor,
    target.organizationId,
    wanted
  );
  if (pending.length === 0) return [];
  const recipient = db.schema.dataEmailRecipient;
  await executor
    .insert(recipient)
    .values(
      pending.map(email => ({
        organizationId: target.organizationId,
        email,
        token: confirmToken()
      }))
    )
    .onConflictDoNothing();
  const [recent] = await executor
    .select({ n: sql<number>`count(*)::int` })
    .from(recipient)
    .where(
      and(
        eq(recipient.organizationId, target.organizationId),
        gt(recipient.requestedAt, new Date(Date.now() - 24 * 60 * 60_000))
      )
    );
  const room = CONFIRMATIONS_PER_DAY - (recent?.n ?? 0);
  if (room <= 0) return pending;
  const never = await executor
    .select({ id: recipient.id })
    .from(recipient)
    .where(
      and(
        eq(recipient.organizationId, target.organizationId),
        inArray(recipient.email, pending),
        isNull(recipient.requestedAt)
      )
    )
    .limit(room);
  if (never.length === 0) return pending;
  const due = await executor
    .update(recipient)
    .set({ requestedAt: new Date() })
    .where(
      and(
        inArray(
          recipient.id,
          never.map(row => row.id)
        ),
        isNull(recipient.requestedAt)
      )
    )
    .returning({ email: recipient.email, token: recipient.token });
  const [organization] = await executor
    .select({ name: db.schema.organization.name })
    .from(db.schema.organization)
    .where(eq(db.schema.organization.id, target.organizationId))
    .limit(1);
  const who = `"${shorten(target.projectName)}" (${shorten(organization?.name ?? '')})`;
  for (const { email, token } of due) {
    await deliver(source, {
      to: email,
      // Fixed: the names are the sender's to choose.
      subject: 'Confirm emails from a Ganju project',
      text: [
        `The project ${who} on Ganju wants to email you when its data changes.`,
        `To get those emails, confirm here: ${dataEmailLink(source, 'confirm', token)}`,
        "If you didn't expect this, ignore it: nothing more is sent.",
        '',
        `El proyecto ${who} en Ganju quiere enviarte correos cuando cambien sus datos.`,
        'Para recibirlos, confírmalo en el enlace de arriba. Si no lo esperabas, ignóralo: no se envía nada más.'
      ].join('\n')
    });
  }
  return pending;
};
