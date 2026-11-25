import { and, eq, isNull, lt, notInArray, or } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

import type { DbExecutor } from '@ganju/db';
import type { EmailSource } from './email';
import { deliver } from './email';
import { ownerAndAdminEmails } from './dataAbandoned';

const NOTICE_INTERVAL_MS = 24 * 60 * 60 * 1000;

const noticeEmail = (input: {
  organizationName: string;
  billingUrl: string;
}): { subject: string; text: string } => {
  const es = [
    'Hola,',
    '',
    `La organización ${input.organizationName} no tiene un plan, así que sus bots no están respondiendo y su servidor MCP no atiende a nadie. Hoy alguien le escribió a uno de sus bots y no recibió respuesta.`,
    '',
    `Todo lo que construiste sigue ahí. Para volver a encenderlo, empieza Pro: ${input.billingUrl}`
  ];
  const en = [
    'Hello,',
    '',
    `The organization ${input.organizationName} has no plan, so its bots aren't answering and its MCP server serves nobody. Someone wrote to one of its bots today and got no reply.`,
    '',
    `Everything you built is still there. To turn it back on, start Pro: ${input.billingUrl}`
  ];
  return {
    subject: 'Ganju: tus bots están apagados / Your bots are off',
    text: [...es, '', '---', '', ...en].join('\n')
  };
};

/**
 * Tell the owner and admins that a message went unanswered because the
 * organization has no plan. At most once a day: the claim on the row is what
 * keeps two turns from sending it twice.
 */
export const sendNoPlanNotice = async (
  source: EmailSource,
  executor: DbExecutor,
  organizationId: string,
  now: Date = new Date()
): Promise<void> => {
  const table = db.schema.subscription;
  const [claimed] = await executor
    .update(table)
    .set({ noPlanNoticeAt: now })
    .where(
      and(
        eq(table.organizationId, organizationId),
        or(
          isNull(table.noPlanNoticeAt),
          lt(table.noPlanNoticeAt, new Date(now.getTime() - NOTICE_INTERVAL_MS))
        )
      )
    )
    .returning({ id: table.id });
  if (!claimed) return;

  const webUrl = utils.getEnv(source, 'NEXT_PUBLIC_WEB_URL') || '';
  const email = noticeEmail({
    organizationName: await organizationName(executor, organizationId),
    billingUrl: `${webUrl}/organization/${organizationId}/settings`
  });
  for (const to of await ownerAndAdminEmails(executor, organizationId)) {
    await deliver(source, { to, ...email });
  }
};

const organizationName = async (
  executor: DbExecutor,
  organizationId: string
): Promise<string> => {
  const [organization] = await executor
    .select({ name: db.schema.organization.name })
    .from(db.schema.organization)
    .where(eq(db.schema.organization.id, organizationId))
    .limit(1);
  return organization?.name ?? '';
};

/**
 * A trial that ended without turning into Pro (canceled, or the first charge
 * failed): what stopped and how to start again. Before the Free plan is
 * retired the organization goes back to Free's limits instead of stopping.
 */
export const sendTrialEndedEmail = async (
  source: EmailSource,
  executor: DbExecutor,
  organizationId: string,
  chargeFailed = false
): Promise<void> => {
  const name = await organizationName(executor, organizationId);
  const webUrl = utils.getEnv(source, 'NEXT_PUBLIC_WEB_URL') || '';
  const billingUrl = `${webUrl}/organization/${organizationId}/settings`;
  const stopped = await db.plan.organizationHasNoPlan(executor, organizationId);
  const es = [
    'Hola,',
    '',
    chargeFailed
      ? `La prueba de Pro de ${name} terminó, pero no pudimos cobrar el primer mes. Mientras tanto siguen los límites de la prueba. Revisa tu tarjeta en Facturación (Gestionar la facturación).`
      : stopped
        ? `La prueba de Pro de ${name} terminó sin pasar a Pro. Sus bots, su servidor MCP y el Asistente están apagados.`
        : `La prueba de Pro de ${name} terminó sin pasar a Pro, así que la organización volvió a sus límites anteriores.`,
    '',
    chargeFailed
      ? `Facturación: ${billingUrl}`
      : `Todo lo que construiste sigue ahí. Para seguir con Pro: ${billingUrl}`
  ];
  const en = [
    'Hello,',
    '',
    chargeFailed
      ? `The Pro trial of ${name} ended, but we couldn't charge the first month. Until then the trial's limits stay. Check your card in Billing (Manage billing).`
      : stopped
        ? `The Pro trial of ${name} ended without turning into Pro. Its bots, MCP server and Assistant are off.`
        : `The Pro trial of ${name} ended without turning into Pro, so the organization is back on its previous limits.`,
    '',
    chargeFailed
      ? `Billing: ${billingUrl}`
      : `Everything you built is still there. To keep going with Pro: ${billingUrl}`
  ];
  const email = {
    subject: chargeFailed
      ? "Ganju: no pudimos cobrar tu primer mes de Pro / We couldn't charge your first month of Pro"
      : 'Ganju: tu prueba de Pro terminó / Your Pro trial ended',
    text: [...es, '', '---', '', ...en].join('\n')
  };
  for (const to of await ownerAndAdminEmails(executor, organizationId)) {
    await deliver(source, { to, ...email });
  }
};

// Organizations told per daily run, so a large backlog spreads over days.
const FREE_PLAN_NOTICE_BATCH = 1000;

const day = (date: Date, locale: string) =>
  date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });

/**
 * Once the Free plan has a lock date: tell the owner and admins of every
 * organization still on Free, once each, that it stops on that date and how
 * to keep it running. Daily; each organization is marked when it's told.
 */
export const runFreePlanNotices = async (
  source: EmailSource,
  now: Date = new Date()
): Promise<number> => {
  const lock = utils.constants.FREE_PLAN_LOCK_DATE;
  if (lock == null) return 0;
  const lockDate = new Date(lock);
  if (now.getTime() >= lockDate.getTime()) return 0;
  // Without billing (self-hosted) there is nothing to start.
  if (!utils.getEnv(source, 'POLAR_ACCESS_TOKEN')) return 0;

  const executor = db.create(source);
  const table = db.schema.subscription;
  const rows = await executor
    .select({ organizationId: table.organizationId })
    .from(table)
    .where(
      and(
        isNull(table.freePlanNoticeAt),
        // Only organizations that were on Free before the launch.
        lt(table.createdAt, new Date(utils.constants.FREE_PLAN_LAUNCH_DATE)),
        or(
          eq(table.plan, utils.constants.PLAN_FREE),
          notInArray(table.status, [
            ...utils.constants.SUBSCRIPTION_ENTITLED_STATUSES
          ])
        )
      )
    )
    .limit(FREE_PLAN_NOTICE_BATCH);

  const webUrl = utils.getEnv(source, 'NEXT_PUBLIC_WEB_URL') || '';
  let told = 0;
  for (const { organizationId } of rows) {
    // Marked first: a send that fails isn't retried, rather than sent twice.
    const [claimed] = await executor
      .update(table)
      .set({ freePlanNoticeAt: now })
      .where(
        and(
          eq(table.organizationId, organizationId),
          isNull(table.freePlanNoticeAt)
        )
      )
      .returning({ id: table.id });
    if (!claimed) continue;

    const name = await organizationName(executor, organizationId);
    const billingUrl = `${webUrl}/organization/${organizationId}/settings`;
    const es = [
      'Hola,',
      '',
      `Ganju cambia el plan Free por una prueba gratis de Pro de ${utils.constants.TRIAL_DAYS} días. ${name} está en el plan Free.`,
      '',
      `A partir del ${day(lockDate, 'es-CO')}, una organización sin plan se puede seguir construyendo, pero sus bots no responden y su servidor MCP y el Asistente se apagan. Nada de lo que construiste se borra.`,
      '',
      `Para que siga funcionando, empieza tu prueba gratis (o Pro, si ya la usaste): ${billingUrl}`,
      '',
      'Si prefieres alojar Ganju por tu cuenta, sigue siendo gratis (Apache-2.0).'
    ];
    const en = [
      'Hello,',
      '',
      `Ganju is replacing the Free plan with a ${utils.constants.TRIAL_DAYS}-day free trial of Pro. ${name} is on the Free plan.`,
      '',
      `From ${day(lockDate, 'en-US')}, an organization without a plan can still be built, but its bots don't answer and its MCP server and Assistant turn off. Nothing you built is deleted.`,
      '',
      `To keep it running, start your free trial (or Pro, if you already had one): ${billingUrl}`,
      '',
      'If you would rather host Ganju yourself, that stays free (Apache-2.0).'
    ];
    const email = {
      subject: `Ganju: el plan Free termina el ${day(lockDate, 'es-CO')} / The Free plan ends on ${day(lockDate, 'en-US')}`,
      text: [...es, '', '---', '', ...en].join('\n')
    };
    for (const to of await ownerAndAdminEmails(executor, organizationId)) {
      await deliver(source, { to, ...email });
    }
    told++;
  }
  return told;
};
