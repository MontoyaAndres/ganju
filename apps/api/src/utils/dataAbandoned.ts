import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

// types
import type { DbExecutor } from '@ganju/db';
import type { EnvSource } from '@ganju/utils';
import type { Bindings } from '../types';
import { deliver } from './email';

const { constants } = utils;

type ApiEnvSource = EnvSource & { env: Bindings };

const DAY_MS = 86_400_000;
// The owner always gets at least this long between the warning and the
// deletion, and the reminder comes this long before it.
const MIN_NOTICE_MS = 14 * DAY_MS;
const REMINDER_BEFORE_MS = 3 * DAY_MS;
// A notice still not delivered this long after it was due goes in Ganju's
// digest, so a database never waits silently.
const STUCK_AFTER_MS = 3 * DAY_MS;

// A database of an org on Free, with what the flow needs to know about it.
interface Candidate {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  ownerEmail: string | null;
  artifactId: string | null;
  objectName: string;
  projectId: string | null;
  projectName: string | null;
  sizeBytes: number;
  lastReadAt: Date | null;
  lastWriteAt: Date | null;
  abandonWarnedAt: Date | null;
  abandonRemindedAt: Date | null;
  deleteReadyAt: Date | null;
  deleteListedAt: Date | null;
  freeSince: Date;
}

// When the database is listed for deletion: 44 days on Free, and never less
// than 14 days after the warning went out (a database found late still gets
// the full notice).
export const deletionDate = (freeSince: Date, warnedAt: Date | null): Date =>
  new Date(
    Math.max(
      freeSince.getTime() + constants.DATA_ABANDON_DELETE_DAYS * DAY_MS,
      (warnedAt?.getTime() ?? 0) + MIN_NOTICE_MS
    )
  );

const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;
const day = (date: Date) => date.toISOString().slice(0, 10);
const when = (date: Date | null) => (date ? date.toISOString() : 'never');

// The org's owner and its admins, once each.
export const ownerAndAdminEmails = async (
  executor: DbExecutor,
  organizationId: string
): Promise<string[]> => {
  const [owner] = await executor
    .select({ email: db.schema.user.email })
    .from(db.schema.organization)
    .innerJoin(
      db.schema.user,
      eq(db.schema.user.id, db.schema.organization.ownerId)
    )
    .where(eq(db.schema.organization.id, organizationId))
    .limit(1);
  const admins = await executor
    .select({ email: db.schema.user.email })
    .from(db.schema.organizationUser)
    .innerJoin(
      db.schema.user,
      eq(db.schema.user.id, db.schema.organizationUser.userId)
    )
    .where(
      and(
        eq(db.schema.organizationUser.organizationId, organizationId),
        eq(db.schema.organizationUser.role, constants.USER_ROLE_ADMIN)
      )
    );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of [owner?.email, ...admins.map(a => a.email)]) {
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    out.push(email);
  }
  return out;
};

// Every live database with its org's plan. Paid orgs come back too, so their
// marks can be cleared.
const loadDatabases = async (executor: DbExecutor, organizationId?: string) => {
  const table = db.schema.artifactDatabase;
  return executor
    .select({
      database: table,
      subscription: db.schema.subscription,
      organizationName: db.schema.organization.name,
      ownerEmail: db.schema.user.email,
      projectId: db.schema.project.id,
      projectName: db.schema.project.name
    })
    .from(table)
    .innerJoin(
      db.schema.organization,
      eq(db.schema.organization.id, table.organizationId)
    )
    .leftJoin(
      db.schema.user,
      eq(db.schema.user.id, db.schema.organization.ownerId)
    )
    .leftJoin(
      db.schema.subscription,
      eq(db.schema.subscription.organizationId, table.organizationId)
    )
    .leftJoin(db.schema.artifact, eq(db.schema.artifact.id, table.artifactId))
    .leftJoin(
      db.schema.project,
      eq(db.schema.project.id, db.schema.artifact.projectId)
    )
    .where(
      and(
        eq(table.status, constants.ARTIFACT_DATABASE_STATUS_READY),
        organizationId ? eq(table.organizationId, organizationId) : undefined
      )
    );
};

const CLEARED = {
  abandonWarnedAt: null,
  abandonRemindedAt: null,
  deleteReadyAt: null,
  deleteListedAt: null
};

// Sets a mark on the rows that don't have it yet and returns the ones it set,
// so two runs at once never both send.
const claim = async (
  executor: DbExecutor,
  ids: string[],
  mark: 'abandonWarnedAt' | 'abandonRemindedAt' | 'deleteListedAt',
  now: Date
): Promise<string[]> => {
  if (ids.length === 0) return [];
  const table = db.schema.artifactDatabase;
  const rows = await executor
    .update(table)
    .set({ [mark]: now })
    .where(and(inArray(table.id, ids), isNull(table[mark])))
    .returning({ id: table.id });
  return rows.map(r => r.id);
};

// A send that reached nobody gives the mark back, for the next run to retry.
const unclaim = async (
  executor: DbExecutor,
  ids: string[],
  mark: 'abandonWarnedAt' | 'abandonRemindedAt' | 'deleteListedAt'
) => {
  if (ids.length === 0) return;
  const table = db.schema.artifactDatabase;
  await executor
    .update(table)
    .set({ [mark]: null })
    .where(inArray(table.id, ids));
};

// A notice that finally went out takes the database off the digest's
// "couldn't notify" list; it comes back as new once it is ready to delete.
const releaseStuck = async (executor: DbExecutor, databases: Candidate[]) => {
  const ids = databases
    .filter(d => d.deleteListedAt && !d.deleteReadyAt)
    .map(d => d.id);
  if (ids.length === 0) return;
  const table = db.schema.artifactDatabase;
  await executor
    .update(table)
    .set({ deleteListedAt: null })
    .where(and(inArray(table.id, ids), isNull(table.deleteReadyAt)));
  for (const d of databases) if (ids.includes(d.id)) d.deleteListedAt = null;
};

// Why a database is in the digest without being ready: a notice that was due
// and reached nobody (no owner or admin email, or mail failing).
export const stuckReason = (d: Candidate, now: Date): string | null => {
  const warnDue =
    d.freeSince.getTime() + constants.DATA_ABANDON_WARN_DAYS * DAY_MS;
  if (!d.abandonWarnedAt) {
    return now.getTime() >= warnDue + STUCK_AFTER_MS
      ? 'the warning has reached nobody since it was due'
      : null;
  }
  if (!d.abandonRemindedAt && !d.deleteReadyAt) {
    const remindDue =
      deletionDate(d.freeSince, d.abandonWarnedAt).getTime() -
      REMINDER_BEFORE_MS;
    return now.getTime() >= remindDue + STUCK_AFTER_MS
      ? 'the reminder has reached nobody since it was due'
      : null;
  }
  return null;
};

// Each database's tables with about how many rows, read from its object.
const describeTables = async (
  source: ApiEnvSource,
  executor: DbExecutor,
  c: Candidate
): Promise<{ name: string; rows: number }[] | null> => {
  try {
    const stub = db.data.databaseStub(
      source.env.PROJECT_DATABASE,
      c.objectName
    );
    const info = await db.data.callDataMetered(
      executor,
      { id: c.id, organizationId: c.organizationId },
      'info',
      () => stub.info(),
      { retryRead: true, ganju: true }
    );
    return info.tables.map(t => ({ name: t.name, rows: t.rows ?? 0 }));
  } catch (error) {
    console.error('data-abandoned-info-failed', c.id, error);
    return null;
  }
};

const tableLine = (
  tables: { name: string; rows: number }[] | null,
  lang: 'es' | 'en'
) => {
  if (!tables)
    return lang === 'es'
      ? 'tablas: no se pudieron leer'
      : 'tables: unavailable';
  if (tables.length === 0) return lang === 'es' ? 'sin tablas' : 'no tables';
  const list = tables
    .map(
      t =>
        `${t.name} (~${t.rows.toLocaleString(lang === 'es' ? 'es-CO' : 'en-US')})`
    )
    .join(', ');
  return lang === 'es' ? `tablas: ${list}` : `tables: ${list}`;
};

// The owner emails: Spanish, then English, in one message (no stored
// language to pick one).
export const ownerEmail = (
  kind: 'warning' | 'reminder',
  input: {
    organizationName: string;
    webUrl: string;
    organizationId: string;
    freeSince: Date;
    deleteOn: Date;
    databases: (Candidate & {
      tables: { name: string; rows: number }[] | null;
    })[];
  }
): { subject: string; text: string } => {
  const billing = `${input.webUrl}/organization/${input.organizationId}/settings`;
  const lines = (lang: 'es' | 'en') =>
    input.databases.map(d => {
      const download = d.projectId
        ? `${input.webUrl}/organization/${input.organizationId}/project/${d.projectId}/data`
        : billing;
      const project =
        d.projectName ??
        (lang === 'es' ? '(proyecto eliminado)' : '(project removed)');
      return lang === 'es'
        ? `- ${d.name}, proyecto ${project}: ${mb(d.sizeBytes)}, ${tableLine(d.tables, 'es')}\n  Descargar una copia: ${download}`
        : `- ${d.name}, project ${project}: ${mb(d.sizeBytes)}, ${tableLine(d.tables, 'en')}\n  Download a copy: ${download}`;
    });
  const date = day(input.deleteOn);
  const since = day(input.freeSince);
  const es =
    kind === 'warning'
      ? [
          `Hola,`,
          ``,
          `La organización ${input.organizationName} está en el plan Free desde el ${since}. Free no incluye Datos, así que estas bases de datos son de solo lectura desde entonces:`,
          ``,
          ...lines('es'),
          ``,
          `Si nada cambia, Ganju las eliminará a partir del ${date}.`,
          ``,
          `Dos opciones:`,
          `- Pasar a Pro, y todo sigue como está: ${billing}`,
          `- Descargar una copia (enlaces de arriba), para tener los datos aunque se eliminen.`
        ]
      : [
          `Hola,`,
          ``,
          `Quedan 3 días: a partir del ${date} Ganju eliminará estas bases de datos de ${input.organizationName}, que está en el plan Free desde el ${since}:`,
          ``,
          ...lines('es'),
          ``,
          `Para conservarlas, pasa a Pro: ${billing}`,
          `O descarga una copia con los enlaces de arriba.`
        ];
  const en =
    kind === 'warning'
      ? [
          `Hello,`,
          ``,
          `The organization ${input.organizationName} has been on the Free plan since ${since}. Free doesn't include Data, so these databases have been read-only since then:`,
          ``,
          ...lines('en'),
          ``,
          `If nothing changes, Ganju will delete them from ${date}.`,
          ``,
          `Two ways out:`,
          `- Upgrade to Pro, and everything stays as it is: ${billing}`,
          `- Download a copy (links above), to keep the data even once they are deleted.`
        ]
      : [
          `Hello,`,
          ``,
          `3 days left: from ${date} Ganju will delete these databases of ${input.organizationName}, which has been on the Free plan since ${since}:`,
          ``,
          ...lines('en'),
          ``,
          `To keep them, upgrade to Pro: ${billing}`,
          `Or download a copy with the links above.`
        ];
  const subject =
    kind === 'warning'
      ? `Ganju: tus bases de datos se eliminarán el ${date} / Your databases will be deleted on ${date}`
      : `Ganju: quedan 3 días para tus bases de datos / 3 days left for your databases`;
  return { subject, text: [...es, '', '---', '', ...en].join('\n') };
};

const sendToAll = async (
  source: ApiEnvSource,
  to: string[],
  email: { subject: string; text: string }
) => {
  let sent = 0;
  for (const address of to) {
    if (await deliver(source, { to: address, ...email })) sent++;
  }
  return sent;
};

export interface AbandonedRunResult {
  cleared: number;
  warned: number;
  reminded: number;
  listed: number;
  digestSent: boolean;
}

// The daily abandoned-database flow: warn at day 30 on Free, remind 3 days
// before the deletion date, list for Ganju from then, and clear everything
// for an org back on a paid plan. Every send is marked on the row first, so a
// second run, or two at once, never emails twice.
export const runAbandonedDatabases = async (
  source: ApiEnvSource,
  now: Date = new Date(),
  // Only this org's databases: for the verify script.
  options: { organizationId?: string } = {}
): Promise<AbandonedRunResult> => {
  const executor = db.create(source);
  const table = db.schema.artifactDatabase;
  const webUrl = utils.getEnv(source, 'NEXT_PUBLIC_WEB_URL') ?? '';
  const result: AbandonedRunResult = {
    cleared: 0,
    warned: 0,
    reminded: 0,
    listed: 0,
    digestSent: false
  };
  const rows = await loadDatabases(executor, options.organizationId);

  const free: Candidate[] = [];
  const toClear: string[] = [];
  for (const row of rows) {
    const d = row.database;
    const marked =
      d.abandonWarnedAt ||
      d.abandonRemindedAt ||
      d.deleteReadyAt ||
      d.deleteListedAt;
    const plan = db.plan.planFromSubscription(row.subscription);
    const freeSince = row.subscription?.planChangedAt ?? null;
    if (db.plan.limitsFor(plan).canUseData) {
      if (marked) toClear.push(d.id);
      continue;
    }
    // On Free with no record of when: nothing to count from, so never warned.
    if (!freeSince) continue;
    // Marks from an earlier spell on Free don't count for this one.
    const stale = [
      d.abandonWarnedAt,
      d.abandonRemindedAt,
      d.deleteReadyAt,
      d.deleteListedAt
    ].some(m => m && m < freeSince);
    if (stale) {
      toClear.push(d.id);
      Object.assign(d, CLEARED);
    }
    free.push({
      id: d.id,
      name: d.name,
      organizationId: d.organizationId,
      organizationName: row.organizationName,
      ownerEmail: row.ownerEmail,
      artifactId: d.artifactId,
      objectName: d.objectName,
      projectId: row.projectId,
      projectName: row.projectName,
      sizeBytes: d.sizeBytes,
      lastReadAt: d.lastReadAt,
      lastWriteAt: d.lastWriteAt,
      abandonWarnedAt: d.abandonWarnedAt,
      abandonRemindedAt: d.abandonRemindedAt,
      deleteReadyAt: d.deleteReadyAt,
      deleteListedAt: d.deleteListedAt,
      freeSince
    });
  }
  if (toClear.length) {
    await executor.update(table).set(CLEARED).where(inArray(table.id, toClear));
    result.cleared = toClear.length;
  }

  const byOrg = new Map<string, Candidate[]>();
  for (const c of free)
    byOrg.set(c.organizationId, [...(byOrg.get(c.organizationId) ?? []), c]);

  for (const [organizationId, databases] of byOrg) {
    try {
      const freeSince = databases[0].freeSince;
      const days = (now.getTime() - freeSince.getTime()) / DAY_MS;

      // Day 30: the warning.
      const toWarn = databases.filter(d => !d.abandonWarnedAt);
      if (toWarn.length && days >= constants.DATA_ABANDON_WARN_DAYS) {
        const claimed = await claim(
          executor,
          toWarn.map(d => d.id),
          'abandonWarnedAt',
          now
        );
        if (claimed.length) {
          const listed = toWarn.filter(d => claimed.includes(d.id));
          const withTables = await Promise.all(
            listed.map(async d => ({
              ...d,
              tables: await describeTables(source, executor, d)
            }))
          );
          const to = await ownerAndAdminEmails(executor, organizationId);
          const email = ownerEmail('warning', {
            organizationName: databases[0].organizationName,
            webUrl,
            organizationId,
            freeSince,
            deleteOn: deletionDate(freeSince, now),
            databases: withTables
          });
          if ((await sendToAll(source, to, email)) === 0) {
            await unclaim(executor, claimed, 'abandonWarnedAt');
          } else {
            result.warned += claimed.length;
            for (const d of listed) d.abandonWarnedAt = now;
            await releaseStuck(executor, listed);
          }
        }
      }

      // 3 days before the deletion date: the reminder.
      const toRemind = databases.filter(
        d =>
          d.abandonWarnedAt &&
          !d.abandonRemindedAt &&
          now.getTime() >=
            deletionDate(freeSince, d.abandonWarnedAt).getTime() -
              REMINDER_BEFORE_MS
      );
      if (toRemind.length) {
        const claimed = await claim(
          executor,
          toRemind.map(d => d.id),
          'abandonRemindedAt',
          now
        );
        if (claimed.length) {
          const listed = toRemind.filter(d => claimed.includes(d.id));
          const withTables = await Promise.all(
            listed.map(async d => ({
              ...d,
              tables: await describeTables(source, executor, d)
            }))
          );
          const to = await ownerAndAdminEmails(executor, organizationId);
          const latestWarning = Math.max(
            ...listed.map(d => d.abandonWarnedAt!.getTime())
          );
          const email = ownerEmail('reminder', {
            organizationName: databases[0].organizationName,
            webUrl,
            organizationId,
            freeSince,
            deleteOn: deletionDate(freeSince, new Date(latestWarning)),
            databases: withTables
          });
          if ((await sendToAll(source, to, email)) === 0) {
            await unclaim(executor, claimed, 'abandonRemindedAt');
          } else {
            result.reminded += claimed.length;
            for (const d of listed) d.abandonRemindedAt = now;
            await releaseStuck(executor, listed);
          }
        }
      }

      // The deletion date, warned and reminded: ready for Ganju to delete.
      const ready = databases.filter(
        d =>
          d.abandonWarnedAt &&
          d.abandonRemindedAt &&
          !d.deleteReadyAt &&
          now.getTime() >= deletionDate(freeSince, d.abandonWarnedAt).getTime()
      );
      if (ready.length) {
        await executor
          .update(table)
          .set({ deleteReadyAt: now })
          .where(
            and(
              inArray(
                table.id,
                ready.map(d => d.id)
              ),
              isNull(table.deleteReadyAt)
            )
          );
        for (const d of ready) d.deleteReadyAt = now;
      }
    } catch (error) {
      console.error('data-abandoned-org-failed', organizationId, error);
    }
  }

  // Ganju's digest: every database ready to delete, and every one whose
  // notice reaches nobody, sent when one is new.
  const listedNow = free.filter(d => d.deleteReadyAt || stuckReason(d, now));
  const fresh = listedNow.filter(d => !d.deleteListedAt);
  if (fresh.length) {
    const claimed = await claim(
      executor,
      fresh.map(d => d.id),
      'deleteListedAt',
      now
    );
    if (claimed.length) {
      const withTables = await Promise.all(
        listedNow.map(async d => ({
          ...d,
          tables: await describeTables(source, executor, d)
        }))
      );
      const email = digestEmail({
        databases: withTables,
        fresh: new Set(claimed),
        isProd: isProduction(source),
        now
      });
      const domain = utils.getEnv(source, 'NEXT_PUBLIC_DOMAIN')!;
      const to = utils.getEnv(source, 'ALERT_EMAIL') || `alerts@${domain}`;
      if (await deliver(source, { to, ...email })) {
        result.listed = claimed.length;
        result.digestSent = true;
      } else {
        await unclaim(executor, claimed, 'deleteListedAt');
      }
    }
  }
  return result;
};

const isProduction = (source: ApiEnvSource) =>
  !(utils.getEnv(source, 'NEXT_PUBLIC_API_URL') ?? '').includes('development');

export const digestEmail = (input: {
  databases: (Candidate & {
    tables: { name: string; rows: number }[] | null;
  })[];
  fresh: Set<string>;
  isProd: boolean;
  now: Date;
}): { subject: string; text: string } => {
  const ready = input.databases.filter(d => d.deleteReadyAt);
  const stuck = input.databases.filter(d => !d.deleteReadyAt);
  const lines = input.databases.map(d => {
    const rows = d.tables?.reduce((sum, t) => sum + t.rows, 0);
    const reason = d.deleteReadyAt ? null : stuckReason(d, input.now);
    return [
      `${input.fresh.has(d.id) ? '[NEW] ' : ''}${reason ? "[CAN'T NOTIFY] " : ''}${d.organizationName} (${d.organizationId}), owner ${d.ownerEmail ?? 'unknown'}`,
      `  project ${d.projectName ?? '(removed)'}, database ${d.name}, artifact ${d.artifactId ?? d.objectName}`,
      `  ${mb(d.sizeBytes)}, ${d.tables ? `${d.tables.length} tables, ~${rows} rows` : 'tables unavailable'}`,
      `  Free since ${when(d.freeSince)}; warned ${when(d.abandonWarnedAt)}; reminded ${when(d.abandonRemindedAt)}`,
      `  last read ${when(d.lastReadAt)}; last write ${when(d.lastWriteAt)}`,
      reason
        ? `  not deletable yet: ${reason} (no owner or admin email, or mail failing); it is retried daily`
        : `  node scripts/delete-data-database.mjs --artifact ${d.artifactId ?? d.objectName}${input.isProd ? ' --prod' : ''}`
    ].join('\n');
  });
  return {
    subject: `Ganju: ${input.fresh.size} new in the data deletion list (${ready.length} ready to delete${stuck.length ? `, ${stuck.length} can't be notified` : ''})`,
    text: [
      `Databases of organizations on Free past their deletion date, whose owners were warned and reminded, and [CAN'T NOTIFY] ones whose notice reaches nobody. New ones are marked [NEW]; the rest stay listed until deleted or notified.`,
      ``,
      ...lines
    ].join('\n\n')
  };
};
