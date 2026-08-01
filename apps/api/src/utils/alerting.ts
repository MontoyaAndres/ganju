import { and, desc, eq, gt, gte, isNull, or, sql } from 'drizzle-orm';
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
    const to = utils.getEnv(source, 'ALERT_EMAIL') || `hello@${domain}`;

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
