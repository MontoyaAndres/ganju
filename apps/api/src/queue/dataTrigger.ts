import type {
  ExecutionContext,
  Message,
  MessageBatch
} from '@cloudflare/workers-types';
import { and, desc, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';
import {
  DataError,
  renderCustomerMessage,
  renderTriggerText,
  scheduleEmail
} from '@ganju/utils/data';

import { invokeCustomCodeScript } from '../utils/customCodeDeploy';
import {
  activeFunctions,
  emailEach,
  emailRecipients,
  emailRecipientsEach,
  organizationAdminEmails
} from '../utils/dataTriggers';

// types
import type { DbExecutor } from '@ganju/db';
import type {
  DataTriggerEventMessage,
  DataTriggerWithSecret
} from '@ganju/utils/data';
import type { Bindings } from '../types';

// One trigger event from a database's outbox. `retry` marks one the owner
// sent again from the dashboard.
export type DataTriggerJob = DataTriggerEventMessage & { retry?: true };

// The consumer's max_retries: 4 deliveries in all.
const MAX_RETRIES = 3;
// Ganju turns a trigger off after this many failed runs in a row.
const FAILURES_TO_DISABLE = 20;
const WEBHOOK_TIMEOUT_MS = 10_000;
// An event past its trigger's rate waits this long and is looked at again.
const RATE_WAIT_SECONDS = 20;
const ACTOR = 'system:triggers';

const run = db.schema.artifactDatabaseTriggerRun;

// A failure no retry fixes: recorded and not sent again.
class FinalError extends Error {}
// Nothing to do yet: recorded as skipped, which never counts as a failure.
class SkipRun extends Error {}

const errorText = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 1000);

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join(
    ''
  );

/**
 * `x-ganju-signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`,
 * keyed with the trigger's secret. The receiver recomputes it over the raw
 * body and refuses an old `t`.
 */
export const signWebhook = async (
  secret: string,
  timestamp: number,
  body: string
) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${body}`)
  );
  return `t=${timestamp},v1=${hex(mac)}`;
};

// The row a message is built from: the one after the change, or the deleted
// one. An event whose row was too large to carry reads it back.
const rowFor = async (
  executor: DbExecutor,
  database: { id: string; organizationId: string },
  stub: ReturnType<typeof db.data.databaseStub>,
  job: DataTriggerJob
): Promise<Record<string, unknown> | null> => {
  if (job.row || job.previous) return job.row ?? job.previous;
  if (!job.truncated) return null;
  // Read back as the event would have carried it.
  return db.data.callDataMetered(
    executor,
    database,
    'eventRow',
    () => stub.eventRow({ actor: ACTOR }, { table: job.table, id: job.rowId }),
    { retryRead: true }
  );
};

// What a schedule's event adds for an action or webhook: its run date and
// its saved query's rows.
const scheduleFields = (job: DataTriggerJob) =>
  job.event === 'schedule'
    ? {
        ...(job.date ? { date: job.date } : {}),
        ...(job.query
          ? {
              query: job.query,
              rows: job.rows ?? [],
              rowCount: job.rowCount ?? 0,
              ...(job.rowsTruncated ? { rowsTruncated: true } : {}),
              ...(job.rowCountMore ? { rowCountMore: true } : {})
            }
          : {})
      }
    : {};

const runAction = async (
  env: Bindings,
  executor: DbExecutor,
  context: {
    databaseId: string;
    organizationId: string;
    stub: ReturnType<typeof db.data.databaseStub>;
    trigger: DataTriggerWithSecret;
  },
  job: DataTriggerJob
): Promise<string | undefined> => {
  const { trigger, stub } = context;
  const database = {
    id: context.databaseId,
    organizationId: context.organizationId
  };
  const action = trigger.action;
  const source = { env };
  switch (action.type) {
    case 'function': {
      const functions = await activeFunctions(executor, job.artifactId);
      if (!functions?.names.has(action.function)) {
        throw new FinalError(
          `${action.function} isn't a published function of this project.`
        );
      }
      const budget = await db.plan.checkToolCallBudget(
        executor,
        context.organizationId
      );
      if (!budget.allowed) {
        throw new FinalError(
          "The organization reached this month's custom tool call limit."
        );
      }
      const result = await invokeCustomCodeScript(source, {
        artifactId: job.artifactId,
        versionId: functions.versionId,
        scriptName: functions.scriptName,
        toolName: action.function,
        args: {
          event: job.event,
          table: job.table,
          row: job.row,
          previous: job.previous,
          actor: job.actor,
          eventId: job.eventId,
          triggerId: job.triggerId,
          ...(job.dueAt ? { dueAt: job.dueAt } : {}),
          ...(job.truncated ? { rowId: job.rowId, truncated: true } : {}),
          ...scheduleFields(job)
        },
        allowedHosts: functions.allowedHosts,
        timeoutMs: functions.timeoutMs,
        trigger: { id: trigger.id, depth: job.depth }
      });
      // A run counts as a custom tool call, as when the assistant calls it.
      await db.plan
        .incrementToolCallUsage(executor, context.organizationId, 1)
        .catch(() => undefined);
      if (result.error) throw new Error(`${action.function}: ${result.error}`);
      return;
    }
    case 'webhook': {
      if (utils.isBlockedUrl(action.url)) {
        throw new FinalError('The webhook URL points at a private address.');
      }
      if (!trigger.secret)
        throw new FinalError('This webhook has no signing secret.');
      const body = JSON.stringify({
        eventId: job.eventId,
        triggerId: job.triggerId,
        trigger: job.triggerName,
        table: job.table,
        event: job.event,
        rowId: job.rowId,
        row: job.row,
        previous: job.previous,
        actor: job.actor,
        at: job.at,
        ...(job.dueAt ? { dueAt: job.dueAt } : {}),
        ...(job.truncated ? { truncated: true } : {}),
        ...scheduleFields(job)
      });
      const timestamp = Math.floor(Date.now() / 1000);
      let response: Response;
      try {
        response = await fetch(action.url, {
          method: 'POST',
          // A redirect could lead anywhere, past the screen: it fails instead.
          redirect: 'manual',
          signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
          headers: {
            'content-type': 'application/json',
            'user-agent': 'Ganju-Webhooks/1',
            'x-ganju-event-id': job.eventId,
            'x-ganju-event': job.table
              ? `${job.table}.${job.event}`
              : job.event,
            'x-ganju-trigger': job.triggerName,
            'x-ganju-signature': await signWebhook(
              trigger.secret,
              timestamp,
              body
            )
          },
          body
        });
      } catch (error) {
        throw new Error(`The webhook didn't answer: ${errorText(error)}`);
      }
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`The webhook answered ${response.status}.`);
      }
      return;
    }
    case 'chat': {
      const row = await rowFor(executor, database, stub, job);
      await sendOrExplain(() =>
        db.channels.postToChat(executor, {
          artifactId: job.artifactId,
          encryptionKey: encryptionKey(env),
          channelId: action.channelId,
          chatId: action.chatId,
          text: renderTriggerText(action.text, row),
          source: { kind: 'trigger', name: trigger.name }
        })
      );
      return;
    }
    case 'email': {
      // Only to the organization's members and addresses that confirmed.
      const { allowed, pending, stopped } = await emailRecipients(
        executor,
        context.organizationId,
        action.to
      );
      const notes = [
        pending.length > 0
          ? `${pending.join(', ')} ${pending.length === 1 ? "hasn't" : "haven't"} confirmed yet.`
          : '',
        stopped.length > 0 ? `${stopped.join(', ')} unsubscribed.` : ''
      ].filter(Boolean);
      if (allowed.length === 0) {
        throw new SkipRun(`Not sent: ${notes.join(' ')}`);
      }
      const row =
        job.event === 'schedule'
          ? null
          : await rowFor(executor, database, stub, job);
      const failed = await emailRecipientsEach(
        source,
        allowed,
        job.event === 'schedule'
          ? scheduleEmail(action, { ...job, date: job.date ?? '' })
          : {
              subject: renderTriggerText(action.subject, row).slice(0, 200),
              text: renderTriggerText(action.text, row)
            }
      );
      if (failed.length === allowed.length) {
        throw new Error(`The email couldn't be sent to ${failed.join(', ')}.`);
      }
      // Sent to some: a retry would mail those again.
      if (failed.length > 0) {
        throw new FinalError(
          [
            `The email couldn't be sent to ${failed.join(', ')}; the others got it.`,
            ...notes
          ].join(' ')
        );
      }
      // Sent to everyone it may write to: ok, with who was left out.
      return notes.length > 0 ? `Sent. ${notes.join(' ')}` : undefined;
    }
    case 'customer': {
      const row = await rowFor(executor, database, stub, job);
      // The event keeps the customer even when it left out a large row.
      const participantId = row?.participant_id ?? job.participantId;
      if (typeof participantId !== 'string' || !participantId) {
        throw new FinalError(
          "This row has no customer: it wasn't written by a channel bot."
        );
      }
      // A large row deleted before this run leaves nothing to fill in.
      if (!row) {
        throw new FinalError(
          'The row was too large to travel with the event and is no longer in the table, so there is nothing to build the message from.'
        );
      }
      const message = renderCustomerMessage(action, row);
      await sendOrExplain(() =>
        db.channels.sendToParticipant(executor, {
          artifactId: job.artifactId,
          encryptionKey: encryptionKey(env),
          participantId,
          text: message.text,
          template: message.template,
          source: { kind: 'trigger', name: trigger.name }
        })
      );
      return;
    }
  }
};

const encryptionKey = (env: Bindings) => {
  const key = utils.getEnv({ env }, 'CRYPTO_SECRET');
  if (!key) throw new Error('CRYPTO_SECRET is not configured.');
  return key;
};

// A channel's refusal (no such customer, outside the window, the daily
// limit) won't change on a retry; the platform failing might.
const sendOrExplain = async (send: () => Promise<unknown>) => {
  try {
    await send();
  } catch (error) {
    if (error instanceof db.channels.ChannelSendError && error.status !== 502) {
      throw new FinalError(error.message);
    }
    throw error;
  }
};

const finish = (
  executor: DbExecutor,
  id: string,
  status: string,
  error: string | null,
  startedAt?: number
) =>
  executor
    .update(run)
    .set({
      status,
      error,
      finishedAt: new Date(),
      ...(startedAt ? { durationMs: Date.now() - startedAt } : {})
    })
    .where(eq(run.id, id));

// Counts a run toward the org's meter, once per event. Past the plan's cap
// triggers pause; the owners and ALERT_EMAIL hear about it when it is reached.
const countRun = async (
  env: Bindings,
  executor: DbExecutor,
  organizationId: string,
  cap: number | null
) => {
  const [sub] = await executor
    .select()
    .from(db.schema.subscription)
    .where(eq(db.schema.subscription.organizationId, organizationId))
    .limit(1);
  if (!sub) return;
  await db.plan.rollUsagePeriodIfDue(executor, sub);
  const [updated] = await executor
    .update(db.schema.subscription)
    .set({
      dataTriggerRunCount: sql`${db.schema.subscription.dataTriggerRunCount} + 1`
    })
    .where(eq(db.schema.subscription.id, sub.id))
    .returning({ count: db.schema.subscription.dataTriggerRunCount });
  if (cap !== null && updated?.count === cap) {
    const to = await organizationAdminEmails(executor, organizationId);
    const alert = utils.getEnv({ env }, 'ALERT_EMAIL');
    await emailEach({ env }, [...to, ...(alert ? [alert] : [])], {
      subject: 'Ganju: database triggers paused for this month',
      text: `This organization's database triggers ran ${cap.toLocaleString('en-US')} times this month, the plan's limit, so they are paused until the next billing period. Triggers set to run a lot of times in a chain are the usual cause; check the Triggers tab of each table in your projects' Data page.\n\nOrganization: ${organizationId}`
    });
  }
};

// After a run's last delivery failed: a trigger whose last 20 runs all
// failed is turned off, and the owners are told.
const disableIfFailing = async (
  env: Bindings,
  executor: DbExecutor,
  context: {
    databaseId: string;
    organizationId: string;
    stub: ReturnType<typeof db.data.databaseStub>;
  },
  job: DataTriggerJob
) => {
  const recent = await executor
    .select({ status: run.status })
    .from(run)
    .where(
      and(
        eq(run.databaseId, context.databaseId),
        eq(run.triggerId, job.triggerId),
        inArray(run.status, ['ok', 'failed'])
      )
    )
    .orderBy(desc(run.createdAt))
    .limit(FAILURES_TO_DISABLE);
  if (
    recent.length < FAILURES_TO_DISABLE ||
    recent.some(r => r.status !== 'failed')
  )
    return;
  const reason = `Turned off by Ganju after ${FAILURES_TO_DISABLE} failed runs in a row.`;
  await db.data.callDataMetered(
    executor,
    { id: context.databaseId, organizationId: context.organizationId },
    'setTriggerEnabled',
    () =>
      context.stub.setTriggerEnabled(
        { actor: ACTOR },
        { name: job.triggerId, enabled: false, reason }
      )
  );
  const to = await organizationAdminEmails(executor, context.organizationId);
  const web = utils.getEnv({ env }, 'NEXT_PUBLIC_WEB_URL') ?? '';
  await emailEach({ env }, to, {
    subject: `Ganju: the trigger ${job.triggerName} was turned off`,
    text: job.table
      ? `The trigger ${job.triggerName} on the table ${job.table} failed ${FAILURES_TO_DISABLE} times in a row, so Ganju turned it off. Its runs and their errors are in the table's Triggers tab on the project's Data page${web ? ` (${web})` : ''}. Turn it back on there once the cause is fixed.`
      : `The schedule ${job.triggerName} failed ${FAILURES_TO_DISABLE} times in a row, so Ganju turned it off. Its runs and their errors are under Schedules on the project's Data page${web ? ` (${web})` : ''}. Turn it back on there once the cause is fixed.`
  });
};

// The scan turned a time trigger off for the database's daily cap: the
// admins hear about it as they do after failures in a row.
const tellTurnedOff = async (
  env: Bindings,
  executor: DbExecutor,
  organizationId: string,
  job: DataTriggerJob
) => {
  const to = await organizationAdminEmails(executor, organizationId);
  const web = utils.getEnv({ env }, 'NEXT_PUBLIC_WEB_URL') ?? '';
  await emailEach({ env }, to, {
    subject: `Ganju: the trigger ${job.triggerName} was turned off`,
    text: `The time trigger ${job.triggerName} on the table ${job.table} was turned off: ${(job.error ?? '').replace(/^Not run: /, '')} It's in the table's Triggers tab on the project's Data page${web ? ` (${web})` : ''}.`
  });
};

// A time trigger keeps coming due while its runs are paused, so each check
// would add another skipped run: it is turned off instead, saying why, and
// turned back on by the owner (counting from then).
const pauseTimeTrigger = async (
  executor: DbExecutor,
  context: {
    databaseId: string;
    organizationId: string;
    stub: ReturnType<typeof db.data.databaseStub>;
  },
  job: DataTriggerJob,
  reason: string
) => {
  if (job.event !== 'time') return;
  const database = {
    id: context.databaseId,
    organizationId: context.organizationId
  };
  const trigger = await db.data
    .callDataMetered(executor, database, 'getTrigger', () =>
      context.stub.getTrigger(job.triggerId)
    )
    .catch(() => null);
  if (!trigger?.enabled) return;
  await db.data.callDataMetered(executor, database, 'setTriggerEnabled', () =>
    context.stub.setTriggerEnabled(
      { actor: ACTOR },
      { name: job.triggerId, enabled: false, reason }
    )
  );
};

const processEvent = async (
  env: Bindings,
  job: DataTriggerJob,
  attempts: number
): Promise<'done' | 'failed'> => {
  const executor = db.create({ env });
  const database = await db.data.findArtifactDatabase(executor, job.artifactId);
  if (
    !database ||
    database.status !== utils.constants.ARTIFACT_DATABASE_STATUS_READY
  ) {
    return 'done';
  }
  const stub = db.data.databaseStub(env.PROJECT_DATABASE, database.objectName);
  const context = {
    databaseId: database.id,
    organizationId: database.organizationId,
    stub
  };

  await executor
    .insert(run)
    .values({
      databaseId: database.id,
      triggerId: job.triggerId,
      triggerName: job.triggerName,
      eventId: job.eventId,
      tableName: job.table,
      event: job.event,
      rowId: job.rowId,
      status: 'running',
      message: job
    })
    .onConflictDoNothing({ target: run.eventId });
  const [current] = await executor
    .select()
    .from(run)
    .where(eq(run.eventId, job.eventId))
    .limit(1);
  if (!current) return 'done';
  // Delivered again after it ran (at least once, or an event a restore
  // brought back): nothing to do. The queue's own retries come with
  // attempts > 1, and the dashboard's with `retry`.
  if (
    current.status === 'ok' ||
    (!job.retry &&
      (current.status === 'skipped' || (current.attempts > 0 && attempts <= 1)))
  )
    return 'done';

  if (job.error) {
    await finish(executor, current.id, 'failed', job.error);
    if (job.turnedOff) {
      await tellTurnedOff(env, executor, database.organizationId, job);
    } else {
      await disableIfFailing(env, executor, context, job);
    }
    return 'done';
  }

  const { limits } = await db.plan.getEffectivePlan(
    executor,
    database.organizationId
  );
  if (!limits.canUseData) {
    await finish(
      executor,
      current.id,
      'skipped',
      "Paused: the organization's plan no longer includes Data."
    );
    await pauseTimeTrigger(
      executor,
      context,
      job,
      "The organization's plan no longer includes Data."
    );
    return 'done';
  }
  const cap = limits.triggerRunHardCap;
  if (cap !== null && cap !== undefined) {
    const [sub] = await executor
      .select({ count: db.schema.subscription.dataTriggerRunCount })
      .from(db.schema.subscription)
      .where(eq(db.schema.subscription.organizationId, database.organizationId))
      .limit(1);
    if ((sub?.count ?? 0) >= cap) {
      await finish(
        executor,
        current.id,
        'skipped',
        "Paused: this month's trigger runs reached the plan's limit."
      );
      await pauseTimeTrigger(
        executor,
        context,
        job,
        "This month's trigger runs reached the plan's limit."
      );
      return 'done';
    }
  }

  let trigger: DataTriggerWithSecret;
  try {
    trigger = await db.data.callDataMetered(
      executor,
      database,
      'getTrigger',
      () => stub.getTrigger(job.triggerId),
      { retryRead: true }
    );
  } catch (error) {
    if (error instanceof DataError && error.code === 'not_found') {
      await finish(executor, current.id, 'skipped', 'The trigger was deleted.');
      return 'done';
    }
    throw error;
  }
  if (!trigger.enabled) {
    await finish(executor, current.id, 'skipped', 'The trigger is off.');
    return 'done';
  }

  // Past its rate, an event waits in the queue rather than being dropped.
  // Runs count by when they started, not when their event arrived: a backlog
  // that waited still goes out at the rate.
  const [recent] = await executor
    .select({ n: sql<number>`count(*)::int` })
    .from(run)
    .where(
      and(
        eq(run.databaseId, database.id),
        eq(run.triggerId, trigger.id),
        ne(run.id, current.id),
        gt(run.startedAt, new Date(Date.now() - 60_000))
      )
    );
  if ((recent?.n ?? 0) >= trigger.rateLimit && current.attempts === 0) {
    await executor
      .update(run)
      .set({ status: 'waiting' })
      .where(eq(run.id, current.id));
    await env.DATA_TRIGGER_QUEUE.send(job, { delaySeconds: RATE_WAIT_SECONDS });
    return 'done';
  }

  // Email goes out from Ganju's own domain: a daily cap per organization.
  const emailCap = limits.dailyTriggerEmailCap;
  if (
    trigger.action.type === 'email' &&
    current.attempts === 0 &&
    emailCap !== null &&
    emailCap !== undefined
  ) {
    const [sent] = await executor
      .select({ n: sql<number>`count(*)::int` })
      .from(run)
      .innerJoin(
        db.schema.artifactDatabase,
        eq(db.schema.artifactDatabase.id, run.databaseId)
      )
      .where(
        and(
          eq(
            db.schema.artifactDatabase.organizationId,
            database.organizationId
          ),
          eq(run.action, 'email'),
          ne(run.id, current.id),
          gt(run.startedAt, new Date(Date.now() - 24 * 60 * 60_000))
        )
      );
    if ((sent?.n ?? 0) >= emailCap) {
      await finish(
        executor,
        current.id,
        'skipped',
        `Not sent: the organization reached its ${emailCap} email trigger runs for the last 24 hours.`
      );
      return 'done';
    }
  }

  if (current.attempts === 0) {
    await countRun(env, executor, database.organizationId, cap ?? null).catch(
      error => console.error('data-trigger-count-failed', errorText(error))
    );
  }
  await executor
    .update(run)
    .set({
      status: 'running',
      attempts: sql`${run.attempts} + 1`,
      startedAt: sql`coalesce(${run.startedAt}, now())`,
      action: trigger.action.type
    })
    .where(eq(run.id, current.id));

  const startedAt = Date.now();
  let note: string | undefined;
  try {
    note = await runAction(
      env,
      executor,
      {
        databaseId: database.id,
        organizationId: database.organizationId,
        stub,
        trigger
      },
      job
    );
  } catch (error) {
    if (error instanceof SkipRun) {
      await finish(
        executor,
        current.id,
        'skipped',
        errorText(error),
        startedAt
      );
      return 'done';
    }
    const final = error instanceof FinalError || attempts > MAX_RETRIES;
    await finish(executor, current.id, 'failed', errorText(error), startedAt);
    if (!final) throw error;
    await disableIfFailing(env, executor, context, job).catch(e =>
      console.error('data-trigger-disable-failed', errorText(e))
    );
    return 'failed';
  }
  await finish(executor, current.id, 'ok', note ?? null, startedAt);
  return 'done';
};

/**
 * Runs trigger events: each one's action, retried up to three times with the
 * run kept in artifact_database_trigger_run. A run that keeps failing stays
 * failed, where the dashboard shows it with "Retry".
 */
export const handleDataTriggerBatch = async (
  batch: MessageBatch<DataTriggerJob>,
  env: Bindings,
  _ctx: ExecutionContext
): Promise<void> => {
  for (const message of batch.messages as readonly Message<DataTriggerJob>[]) {
    try {
      await processEvent(env, message.body, message.attempts);
      message.ack();
    } catch (error) {
      console.error(
        'data-trigger-failed',
        message.body.eventId,
        errorText(error)
      );
      message.retry({
        delaySeconds: Math.min(300, 10 * 2 ** message.attempts)
      });
    }
  }
};
