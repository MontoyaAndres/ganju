import { and, desc, eq, gt, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@ganju/db';
import type { DbExecutor } from '@ganju/db';
import { utils } from '@ganju/utils';

import { deliver } from './email';

// types
import type { EnvSource } from '@ganju/utils';
import type { Bindings } from '../types';

const { constants } = utils;

type ApiEnvSource = EnvSource & { env: Bindings };

interface ErrorRow {
  id: string;
  service: string;
  name: string | null;
  message: string | null;
  status: number | null;
  path: string | null;
  referenceId: string | null;
  createdAt: Date;
}

interface ErrorGroup {
  signature: string;
  service: string;
  name: string;
  message: string;
  count: number;
  statuses: Set<number | null>;
  lastPath: string | null;
  lastReferenceId: string | null;
  lastSeenAt: Date;
}

/**
 * Collapse rows into one entry per distinct failure. Without this a single
 * broken endpoint hit 400 times produces 400 lines and the actual signal — that
 * something ELSE also started failing — is invisible.
 */
const groupErrors = (rows: ErrorRow[]): ErrorGroup[] => {
  const groups = new Map<string, ErrorGroup>();

  for (const row of rows) {
    const name = row.name || 'Error';
    const message = (row.message || '').slice(
      0,
      constants.ALERT_SIGNATURE_LENGTH
    );
    const signature = `${row.service}|${name}|${message}`;

    const existing = groups.get(signature);
    if (existing) {
      existing.count += 1;
      existing.statuses.add(row.status);
      // Rows arrive oldest-first, so the last write wins and holds the most
      // recent occurrence.
      existing.lastPath = row.path;
      existing.lastReferenceId = row.referenceId;
      existing.lastSeenAt = row.createdAt;
      continue;
    }

    groups.set(signature, {
      signature,
      service: row.service,
      name,
      message,
      count: 1,
      statuses: new Set([row.status]),
      lastPath: row.path,
      lastReferenceId: row.referenceId,
      lastSeenAt: row.createdAt
    });
  }

  return [...groups.values()].sort((a, b) => b.count - a.count);
};

const escape = (value: string): string => utils.escapeHtml(value);

const buildEmail = (
  groups: ErrorGroup[],
  total: number,
  truncated: boolean
): { subject: string; text: string; html: string } => {
  const spike = total >= constants.ALERT_SPIKE_THRESHOLD;
  const shown = groups.slice(0, constants.ALERT_MAX_GROUPS);

  const subject =
    `${spike ? '[Ganju] ⚠ Error spike: ' : '[Ganju] '}` +
    `${total} error${total === 1 ? '' : 's'} across ` +
    `${groups.length} issue${groups.length === 1 ? '' : 's'}`;

  const statusLabel = (group: ErrorGroup) =>
    [...group.statuses]
      .map(status => (status === null ? 'uncaught' : String(status)))
      .join(', ');

  const text = [
    `${total} server error${total === 1 ? '' : 's'} since the last alert, in ${groups.length} distinct issue${groups.length === 1 ? '' : 's'}.`,
    truncated
      ? `Only the first ${constants.ALERT_MAX_ROWS} rows were itemised; the count above is the itemised total.`
      : '',
    '',
    ...shown.map(
      group =>
        `${group.count}x  [${group.service} ${statusLabel(group)}] ${group.name}: ${group.message}\n` +
        `      last at ${group.lastSeenAt.toISOString()}` +
        (group.lastPath ? ` on ${group.lastPath}` : '') +
        (group.lastReferenceId ? ` (ref ${group.lastReferenceId})` : '')
    ),
    groups.length > shown.length
      ? `\n…and ${groups.length - shown.length} more distinct issue(s).`
      : '',
    '',
    'Look one up with:',
    "  SELECT * FROM error_log WHERE reference_id = '<ref>';"
  ]
    .filter(Boolean)
    .join('\n');

  const rows = shown
    .map(
      group => `<tr>
  <td style="padding:8px 10px;border-bottom:1px solid #ececf1;font-weight:600;white-space:nowrap;">${group.count}&times;</td>
  <td style="padding:8px 10px;border-bottom:1px solid #ececf1;">
    <div style="font-weight:600;">${escape(group.name)}</div>
    <div style="color:#4a4759;">${escape(group.message)}</div>
    <div style="color:#6b6878;font-size:12px;margin-top:4px;">
      ${escape(group.service)} · ${escape(statusLabel(group))}
      ${group.lastPath ? `· ${escape(group.lastPath)}` : ''}
      ${group.lastReferenceId ? `· ref ${escape(group.lastReferenceId)}` : ''}
    </div>
  </td>
</tr>`
    )
    .join('');

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d1b2e;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px;">
            <tr>
              <td>
                <h1 style="margin:0 0 8px;font-size:20px;">
                  ${spike ? '⚠ Error spike' : 'Error report'}
                </h1>
                <p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:#4a4759;">
                  <strong>${total}</strong> server error${total === 1 ? '' : 's'} since the last alert,
                  in <strong>${groups.length}</strong> distinct issue${groups.length === 1 ? '' : 's'}.
                  ${truncated ? `Only the first ${constants.ALERT_MAX_ROWS} rows were itemised.` : ''}
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;line-height:1.45;">
                  ${rows}
                </table>
                ${
                  groups.length > shown.length
                    ? `<p style="margin:16px 0 0;font-size:13px;color:#6b6878;">…and ${groups.length - shown.length} more distinct issue(s).</p>`
                    : ''
                }
                <p style="margin:24px 0 0;font-size:12px;color:#6b6878;">
                  Look one up with
                  <code>SELECT * FROM error_log WHERE reference_id = '&lt;ref&gt;';</code>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
};

const readWatermark = async (executor: DbExecutor): Promise<string | null> => {
  const [row] = await executor
    .select({ lastSeenId: db.schema.alertState.lastSeenId })
    .from(db.schema.alertState)
    .where(eq(db.schema.alertState.key, constants.ALERT_STATE_KEY_ERROR_LOG))
    .limit(1);

  return row?.lastSeenId ?? null;
};

const writeWatermark = async (
  executor: DbExecutor,
  lastSeenId: string,
  alerted: boolean
): Promise<void> => {
  const now = new Date();
  await executor
    .insert(db.schema.alertState)
    .values({
      key: constants.ALERT_STATE_KEY_ERROR_LOG,
      lastSeenId,
      lastAlertAt: alerted ? now : null
    })
    .onConflictDoUpdate({
      target: db.schema.alertState.key,
      set: {
        lastSeenId,
        ...(alerted ? { lastAlertAt: now } : {})
      }
    });
};

export interface AlertResult {
  scanned: number;
  groups: number;
  sent: boolean;
}

/**
 * Email a digest of new server-side failures.
 *
 * Deliberately narrow: only rows at or above ALERT_MIN_STATUS (plus rows with
 * no status, which are uncaught) are alertable. 4xx rows are expected client
 * errors — validation, not-found, quota — and including them would bury the
 * signal in noise until the alert gets muted, which is the usual way error
 * alerting dies.
 *
 * Two properties matter for correctness:
 *
 * - **Never re-sends.** The watermark advances to the newest row SEEN, not the
 *   newest row alerted on, so a quiet run still moves it forward.
 * - **Never recurses.** Every failure here goes to `console.error`, never
 *   through `dbUtils.handleError` — writing to error_log from the code that
 *   reads error_log would alert on its own failures forever.
 */
export const runErrorAlerts = async (
  source: ApiEnvSource
): Promise<AlertResult> => {
  const empty: AlertResult = { scanned: 0, groups: 0, sent: false };

  try {
    const dbInstance = db.create(source);
    const watermark = await readWatermark(dbInstance);

    // The high-water mark of everything that exists right now. Captured before
    // the digest is built so rows written mid-run belong to the NEXT sweep
    // instead of being skipped.
    const [newest] = await dbInstance
      .select({ id: sql<string | null>`max(${db.schema.errorLog.id})` })
      .from(db.schema.errorLog);

    const newestId = newest?.id ?? null;
    if (!newestId) return empty;

    // First ever run: adopt the current position rather than emailing the whole
    // history of the table.
    if (!watermark) {
      await writeWatermark(dbInstance, newestId, false);
      return empty;
    }
    if (newestId <= watermark) return empty;

    const alertable = or(
      gte(db.schema.errorLog.status, constants.ALERT_MIN_STATUS),
      isNull(db.schema.errorLog.status)
    );

    const rows = (await dbInstance
      .select({
        id: db.schema.errorLog.id,
        service: db.schema.errorLog.service,
        name: db.schema.errorLog.name,
        message: db.schema.errorLog.message,
        status: db.schema.errorLog.status,
        path: db.schema.errorLog.path,
        referenceId: db.schema.errorLog.referenceId,
        createdAt: db.schema.errorLog.createdAt
      })
      .from(db.schema.errorLog)
      .where(and(gt(db.schema.errorLog.id, watermark), alertable))
      .orderBy(db.schema.errorLog.id)
      .limit(constants.ALERT_MAX_ROWS)) as ErrorRow[];

    if (rows.length === 0) {
      // Only 4xx noise since last time — advance past it so it isn't rescanned.
      await writeWatermark(dbInstance, newestId, false);
      return empty;
    }

    const groups = groupErrors(rows);
    const truncated = rows.length === constants.ALERT_MAX_ROWS;
    const { subject, text, html } = buildEmail(groups, rows.length, truncated);

    const domain = utils.getEnv(source, 'NEXT_PUBLIC_DOMAIN')!;
    const to = utils.getEnv(source, 'ALERT_EMAIL') || `alerts@${domain}`;

    const sent = await deliver(source, { to, subject, text, html });
    if (!sent) {
      // Leave the watermark alone so the next run retries these rows rather
      // than losing them to a transient mail failure.
      console.error('error alert email failed to send; watermark not advanced');
      return { scanned: rows.length, groups: groups.length, sent: false };
    }

    await writeWatermark(dbInstance, newestId, true);
    return { scanned: rows.length, groups: groups.length, sent: true };
  } catch (error) {
    console.error('runErrorAlerts failed', error);
    return empty;
  }
};

/**
 * The most recent errors, newest first — for a future in-app view. Kept beside
 * the digest so both read the same filter.
 */
export const recentErrors = async (
  source: ApiEnvSource,
  limit = 50
): Promise<ErrorRow[]> => {
  const dbInstance = db.create(source);
  return dbInstance
    .select({
      id: db.schema.errorLog.id,
      service: db.schema.errorLog.service,
      name: db.schema.errorLog.name,
      message: db.schema.errorLog.message,
      status: db.schema.errorLog.status,
      path: db.schema.errorLog.path,
      referenceId: db.schema.errorLog.referenceId,
      createdAt: db.schema.errorLog.createdAt
    })
    .from(db.schema.errorLog)
    .where(
      or(
        gte(db.schema.errorLog.status, constants.ALERT_MIN_STATUS),
        isNull(db.schema.errorLog.status)
      )
    )
    .orderBy(desc(db.schema.errorLog.id))
    .limit(limit) as Promise<ErrorRow[]>;
};

// custom-tool usage

interface ToolCallFlag {
  organizationId: string;
  name: string;
  plan: string;
  used: number;
  sinceLastCheck: number;
  hardCap: number | null;
  reason: 'surge' | 'approaching' | 'at-cap';
}

const describeReason = (flag: ToolCallFlag): string => {
  if (flag.reason === 'at-cap') return 'at the monthly ceiling — calls refused';
  if (flag.reason === 'approaching')
    return `past ${Math.round(constants.ALERT_TOOL_CALL_CAP_FRACTION * 100)}% of the ceiling`;
  return 'unusual hourly rate';
};

const buildToolCallEmail = (
  flags: ToolCallFlag[]
): { subject: string; text: string; html: string } => {
  const worst = flags.some(f => f.reason === 'at-cap');
  const subject = `${worst ? '⚠ ' : ''}Custom tool usage — ${flags.length} organization${
    flags.length === 1 ? '' : 's'
  }`;

  const line = (f: ToolCallFlag) =>
    `${f.name} (${f.plan}) — ${f.used.toLocaleString('en-US')} calls this period, ` +
    `${f.sinceLastCheck.toLocaleString('en-US')} since the last check` +
    `${f.hardCap ? ` of ${f.hardCap.toLocaleString('en-US')}` : ''} — ${describeReason(f)}\n` +
    `  ${f.organizationId}`;

  const text = `${subject}\n\n${flags.map(line).join('\n\n')}\n`;

  const rows = flags
    .map(
      f => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #ece9f5;">
          <strong>${f.name}</strong>
          <span style="color:#6b6878;">· ${f.plan}</span><br />
          <span style="color:#4a4759;">
            ${f.used.toLocaleString('en-US')} calls this period ·
            ${f.sinceLastCheck.toLocaleString('en-US')} since the last check
            ${f.hardCap ? `· ceiling ${f.hardCap.toLocaleString('en-US')}` : ''}
          </span><br />
          <span style="color:#8a8798;font-size:12px;">${describeReason(f)} · ${f.organizationId}</span>
        </td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#faf9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#211f2e;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:28px;">
            <tr>
              <td>
                <h1 style="margin:0 0 8px;font-size:20px;">${worst ? '⚠ Custom tool usage' : 'Custom tool usage'}</h1>
                <p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:#4a4759;">
                  ${flags.length} organization${flags.length === 1 ? '' : 's'} worth a look.
                  Calls here are dispatches into a customer's own code — the compute we pay for.
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;line-height:1.45;">
                  ${rows}
                </table>
                <p style="margin:24px 0 0;font-size:12px;color:#6b6878;">
                  Start with
                  <code>node scripts/suspend-custom-code.mjs &lt;artifact-slug&gt;</code>,
                  which reports before it changes anything.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
};

/**
 * Email a digest of organizations whose custom-tool usage is worth looking at.
 *
 * The counter this reads bounds a month and refuses calls past the ceiling, so
 * nothing here is load-bearing for cost — it exists so that meeting the ceiling
 * is something we hear about rather than something a customer discovers.
 *
 * Three properties, all of which the error digest already established and none
 * of which are free:
 *
 * - **A snapshot per organization, not a global one.** The rate signal is calls
 *   since the last check, which needs per-org state; `alert_state` is keyed
 *   `tool_calls:<organizationId>` for exactly that.
 * - **A rollover is not a surge.** Counters reset to zero each period, so a
 *   snapshot above the current count means the period turned, and the delta is
 *   the whole count rather than a negative number.
 * - **Cooldown, or it gets muted.** An organization legitimately running hot
 *   would otherwise produce an email every hour until someone silenced the
 *   alert, which is how alerting dies.
 */
export const runToolCallAlerts = async (
  source: ApiEnvSource
): Promise<{ scanned: number; flagged: number; sent: boolean }> => {
  const empty = { scanned: 0, flagged: 0, sent: false };

  try {
    const dbInstance = db.create(source);

    const rows = await dbInstance
      .select({
        organizationId: db.schema.subscription.organizationId,
        name: db.schema.organization.name,
        plan: db.schema.subscription.plan,
        status: db.schema.subscription.status,
        used: db.schema.subscription.toolCallCount
      })
      .from(db.schema.subscription)
      .innerJoin(
        db.schema.organization,
        eq(db.schema.organization.id, db.schema.subscription.organizationId)
      )
      .where(gt(db.schema.subscription.toolCallCount, 0));

    if (rows.length === 0) return empty;

    const keys = rows.map(
      row => `${constants.ALERT_STATE_KEY_TOOL_CALLS}:${row.organizationId}`
    );
    const states = await dbInstance
      .select({
        key: db.schema.alertState.key,
        lastSeenId: db.schema.alertState.lastSeenId,
        lastAlertAt: db.schema.alertState.lastAlertAt
      })
      .from(db.schema.alertState)
      .where(inArray(db.schema.alertState.key, keys));

    const stateByKey = new Map(states.map(state => [state.key, state]));
    const now = Date.now();
    const cooldownMs = constants.ALERT_TOOL_CALL_COOLDOWN_HOURS * 60 * 60 * 1000;

    const flags: ToolCallFlag[] = [];
    const snapshots: { key: string; used: number; alerted: boolean }[] = [];

    for (const row of rows) {
      const key = `${constants.ALERT_STATE_KEY_TOOL_CALLS}:${row.organizationId}`;
      const state = stateByKey.get(key);
      const previous = Number(state?.lastSeenId ?? NaN);

      // A first sighting adopts the position instead of alerting on a total that
      // may have accumulated over a whole month before this ever ran. A count
      // BELOW the snapshot means the period rolled, so everything since is new.
      const first = !state || Number.isNaN(previous);
      const sinceLastCheck = first
        ? 0
        : row.used >= previous
          ? row.used - previous
          : row.used;

      const plan = db.plan.planFromSubscription({
        plan: row.plan,
        status: row.status
      } as typeof db.schema.subscription.$inferSelect);
      const hardCap = db.plan.limitsFor(plan).toolCallHardCap;

      const reason: ToolCallFlag['reason'] | null =
        hardCap != null && row.used >= hardCap
          ? 'at-cap'
          : hardCap != null &&
              row.used >= hardCap * constants.ALERT_TOOL_CALL_CAP_FRACTION
            ? 'approaching'
            : sinceLastCheck >= constants.ALERT_TOOL_CALL_SURGE
              ? 'surge'
              : null;

      const quiet =
        state?.lastAlertAt != null &&
        now - state.lastAlertAt.getTime() < cooldownMs;

      const alerting = reason !== null && !first && !quiet;
      if (alerting) {
        flags.push({
          organizationId: row.organizationId,
          name: row.name,
          plan,
          used: row.used,
          sinceLastCheck,
          hardCap,
          reason
        });
      }
      snapshots.push({ key, used: row.used, alerted: alerting });
    }

    // Written whether or not anything was sent: the snapshot is what makes the
    // NEXT run's delta mean anything, and skipping it during a cooldown would
    // turn one quiet hour into a false surge later.
    const writeSnapshots = async (alerted: boolean) => {
      const stamped = new Date();
      for (const snapshot of snapshots.filter(s => s.alerted === alerted)) {
        await dbInstance
          .insert(db.schema.alertState)
          .values({
            key: snapshot.key,
            lastSeenId: String(snapshot.used),
            lastAlertAt: alerted ? stamped : null
          })
          .onConflictDoUpdate({
            target: db.schema.alertState.key,
            set: {
              lastSeenId: String(snapshot.used),
              ...(alerted ? { lastAlertAt: stamped } : {})
            }
          });
      }
    };

    if (flags.length === 0) {
      await writeSnapshots(false);
      return { scanned: rows.length, flagged: 0, sent: false };
    }

    const shown = flags
      .sort((a, b) => b.used - a.used)
      .slice(0, constants.ALERT_TOOL_CALL_MAX_ROWS);
    const { subject, text, html } = buildToolCallEmail(shown);

    const domain = utils.getEnv(source, 'NEXT_PUBLIC_DOMAIN')!;
    const to = utils.getEnv(source, 'ALERT_EMAIL') || `alerts@${domain}`;

    const sent = await deliver(source, { to, subject, text, html });
    if (!sent) {
      // Leave the flagged organizations' snapshots alone so the next run sees
      // the same delta rather than losing it to a transient mail failure.
      console.error('tool call alert email failed to send; snapshots held');
      await writeSnapshots(false);
      return { scanned: rows.length, flagged: flags.length, sent: false };
    }

    await writeSnapshots(false);
    await writeSnapshots(true);
    return { scanned: rows.length, flagged: flags.length, sent: true };
  } catch (error) {
    console.error('runToolCallAlerts failed', error);
    return empty;
  }
};
