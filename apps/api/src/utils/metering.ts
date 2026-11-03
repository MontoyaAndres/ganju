import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@ganju/db';
import type { DataNamespaceLike, DbExecutor } from '@ganju/db';
import { utils } from '@ganju/utils';
import type { PlanLimits } from '@ganju/utils';

import { createPolar } from './polar';
import { checkMessageCap, sumEmbeddedStorage } from './plan';
import type { PolarClient } from './polar';

import type { EnvSource } from '@ganju/utils';
import type { Bindings } from '../types';

const { constants } = utils;

type ApiEnvSource = EnvSource & { env: Bindings };

const limitsFor = (plan: string): PlanLimits =>
  (constants.PLAN_LIMITS as Record<string, PlanLimits>)[plan] ??
  constants.PLAN_LIMITS.FREE;

/**
 * Report a single overage meter event, and say whether it landed.
 *
 * A failure is logged and contained rather than thrown. One meter can be absent
 * while the others exist — that is the ordinary state of a rate between shipping
 * the code that reports it and creating the meter behind it. If that escaped
 * here it would take the whole run for this organization with it, BEFORE the
 * marks are written: the events that did land would go unrecorded, and the next
 * hourly run would report the same usage again. A missing meter must cost us a
 * rate, never a customer a second invoice for the same messages.
 *
 * `externalId` makes the retry safe on the other side too. It is stable for a
 * given increment, so a run that reported an event and then failed to advance
 * its mark re-sends the same id, and Polar counts it as a duplicate instead of
 * billing it twice. A non-zero `duplicates` is that path working, not an error.
 */
const reportMeter = async (
  polar: PolarClient,
  eventName: string,
  organizationId: string,
  externalId: string,
  delta: number
): Promise<boolean> => {
  if (delta <= 0) return false;
  try {
    const { duplicates } = await polar.ingestEvent({
      name: eventName,
      external_customer_id: organizationId,
      external_id: externalId,
      metadata: { [constants.BILLING_METER_UNITS_KEY]: delta }
    });
    if (duplicates > 0) {
      console.log(
        `[metering] ${eventName} for ${organizationId} was already ingested (${externalId}) — mark advancing without a second charge`
      );
    }
    return true;
  } catch (error) {
    console.error(
      `[metering] ${eventName} rejected for ${organizationId}:`,
      error instanceof Error ? error.message : error
    );
    return false;
  }
};

// The statuses whose databases still hold data: live ones, and deleted ones
// in their grace period, which keep everything until the purge.
const STORED_DATABASE_STATUSES = [
  constants.ARTIFACT_DATABASE_STATUS_READY,
  constants.ARTIFACT_DATABASE_STATUS_DELETING
];

// Read each of the org's databases' size from its object, store it on the row
// and return the total. A database that doesn't answer counts at its last
// reading, so one slow object can't make the peak drop.
const measureDataStorage = async (
  executor: DbExecutor,
  namespace: DataNamespaceLike,
  organizationId: string
): Promise<number> => {
  const table = db.schema.artifactDatabase;
  const rows = await executor
    .select({
      id: table.id,
      objectName: table.objectName,
      sizeBytes: table.sizeBytes
    })
    .from(table)
    .where(
      and(
        eq(table.organizationId, organizationId),
        inArray(table.status, STORED_DATABASE_STATUSES)
      )
    );
  const sizes = await Promise.all(
    rows.map(async row => {
      try {
        const stub = db.data.databaseStub(namespace, row.objectName);
        const { bytes } = await db.data.callData(
          'size',
          () => stub.size(),
          undefined,
          { retryRead: true }
        );
        await executor
          .update(table)
          .set({ sizeBytes: bytes, sizeCheckedAt: new Date() })
          .where(eq(table.id, row.id));
        return bytes;
      } catch (error) {
        console.error(
          `[metering] size of database ${row.id} unavailable:`,
          error instanceof Error ? error.message : error
        );
        return row.sizeBytes;
      }
    })
  );
  return sizes.reduce((total, bytes) => total + bytes, 0);
};

/**
 * Bring this org's period and its storage high-water up to date, and hand back
 * the row.
 *
 * Measuring is separate from reporting because the two have different audiences.
 * Reporting is for the provider and only concerns an org it bills; measuring is
 * for us, and has to cover every paid org — including an Enterprise one invoiced
 * by bank transfer, which has no provider customer and never will. Folding the
 * two together is what left those orgs with no storage figure at all.
 *
 * Storage is the reason this has to run hourly rather than at period close. It
 * is a level, not a counter: read it on the 1st and an org that held 50GB for
 * three weeks and deleted it looks like it held nothing.
 */
const measureOrganization = async (
  executor: DbExecutor,
  organizationId: string,
  dataNamespace?: DataNamespaceLike
): Promise<typeof db.schema.subscription.$inferSelect | undefined> => {
  // Roll the period over first if due — this snapshots the closing period, then
  // zeroes the counters, so a fresh month re-bills stored content and resets the
  // message overage.
  await checkMessageCap(executor, organizationId);

  const [sub] = await executor
    .select()
    .from(db.schema.subscription)
    .where(eq(db.schema.subscription.organizationId, organizationId))
    .limit(1);

  if (!sub) return undefined;

  const embeddedMb = Math.ceil(
    (await sumEmbeddedStorage(executor, organizationId)) / constants.MB
  );
  // Without the binding (a script run) the data peak stays as it was.
  const dataMb = dataNamespace
    ? Math.ceil(
        (await measureDataStorage(executor, dataNamespace, organizationId)) /
          constants.MB
      )
    : 0;
  const peaks = {
    peakEmbeddedMb: Math.max(sub.peakEmbeddedMb, embeddedMb),
    peakDataMb: Math.max(sub.peakDataMb, dataMb)
  };
  if (
    peaks.peakEmbeddedMb > sub.peakEmbeddedMb ||
    peaks.peakDataMb > sub.peakDataMb
  ) {
    await executor
      .update(db.schema.subscription)
      .set(peaks)
      .where(eq(db.schema.subscription.id, sub.id));
    return { ...sub, ...peaks };
  }

  return sub;
};

// Push this org's current-period overage to the billing provider. Reports only
// the increment since the last run (tracked on the subscription row) so meter
// events never double-count, and stores the new high-water mark.
//
// Measuring happens either way; only the reporting half needs a provider. A null
// client or an org with no provider customer measures and stops there.
//
// Exported for one organization at a time, which is the only way to exercise the
// delta arithmetic without a sweep that would roll the period and move the
// reported marks of every other organization in the database. The cron
// entrypoint is still `runOverageMetering` below. `dataNamespace` is what reads
// the databases' storage; scripts leave it out.
export const meterOrganization = async (
  executor: DbExecutor,
  polar: PolarClient | null,
  organizationId: string,
  dataNamespace?: DataNamespaceLike
): Promise<void> => {
  const sub = await measureOrganization(
    executor,
    organizationId,
    dataNamespace
  );

  if (!polar || !sub?.billingCustomerId) return;

  const limits = limitsFor(sub.plan);

  // Messages: monotonic per-period counters, so the overage only grows.
  //
  // Each turn is billed exactly once, by whose key ran it. Shared turns draw
  // from the same included pool as everything else, but only up to the shared
  // sub-allowance — so they consume at most that much of the pool no matter how
  // many there are, and the remainder of the pool stays available to own-key
  // traffic. Beyond their sub-allowance, shared turns bill at the shared rate
  // instead of the platform-fee rate, and never at both.
  const sharedUsed = sub.sharedMessageCount;
  const ownKeyUsed = Math.max(0, sub.messageCount - sharedUsed);

  const sharedOverage = Math.max(0, sharedUsed - limits.includedSharedMessages);
  const sharedDelta = sharedOverage - sub.reportedSharedMessageOverage;

  const ownKeyIncluded = Math.max(
    0,
    limits.includedMessages -
      Math.min(sharedUsed, limits.includedSharedMessages)
  );
  const messageOverage = Math.max(0, ownKeyUsed - ownKeyIncluded);
  const messageDelta = messageOverage - sub.reportedMessageOverage;

  // Custom-tool invocations: a monotonic per-period counter, like messages, and
  // reported as a raw count of calls above the allowance. Native and proxied
  // tools are not in this number — apps/mcp counts only dispatches into the
  // org's own code, because that is the only tool call that runs on compute we
  // buy rather than on one screened fetch.
  const toolCallOverage = Math.max(
    0,
    sub.toolCallCount - limits.includedToolCalls
  );
  const toolCallDelta = toolCallOverage - sub.reportedToolCallOverage;

  // Project data: all of it, at $0 for now. Storage is the period's peak, so
  // like the counts it only grows within a period.
  const dataStorageMb = sub.peakDataMb;
  const dataStorageDelta = dataStorageMb - sub.reportedDataStorageMb;
  const rowsWritten = sub.dataRowsWrittenCount;
  const rowsWrittenDelta = rowsWritten - sub.reportedDataRowsWritten;
  const rowsRead = sub.dataRowsReadCount;
  const rowsReadDelta = rowsRead - sub.reportedDataRowsRead;
  const triggerRuns = sub.dataTriggerRunCount;
  const triggerRunDelta = triggerRuns - sub.reportedDataTriggerRuns;

  // Embedded storage: a live level. We bill the high-water mark of the overage
  // within the period (decreases aren't credited), in whole MB. The peak the
  // measure pass just recorded is what this is taken from, so a spike between
  // two hourly runs still bills even if storage has since dropped back.
  const includedMb = Math.ceil(limits.includedEmbeddedBytes / constants.MB);
  const embeddedOverageMb = Math.max(0, sub.peakEmbeddedMb - includedMb);
  const embeddedDelta = embeddedOverageMb - sub.reportedEmbeddedOverageMb;

  // The event id for one reported increment. The new mark is in it, so a
  // genuinely new increment is a new id while a retry of the same one repeats
  // exactly — which is what lets Polar deduplicate the retry.
  const period = sub.currentPeriodStart ?? sub.messagePeriodStart;
  const eventId = (meterName: string, mark: number): string =>
    `${sub.id}:${meterName}:${period ? period.getTime() : 0}:${mark}`;

  // Each meter reports on its own, so one that is missing or rejecting can't
  // take the others down with it. A request per meter an hour per paid org buys
  // that isolation: the ingest endpoint takes a batch, but reports no per-event
  // status, so batching would make the whole run all-or-nothing. What comes
  // back is whether the event landed — which is what the marks below are
  // written from.
  const messageReported = await reportMeter(
    polar,
    constants.BILLING_METER_MESSAGES,
    organizationId,
    eventId(constants.BILLING_METER_MESSAGES, messageOverage),
    messageDelta
  );
  const sharedReported = await reportMeter(
    polar,
    constants.BILLING_METER_SHARED_MESSAGES,
    organizationId,
    eventId(constants.BILLING_METER_SHARED_MESSAGES, sharedOverage),
    sharedDelta
  );
  const embeddedReported = await reportMeter(
    polar,
    constants.BILLING_METER_EMBEDDED,
    organizationId,
    eventId(constants.BILLING_METER_EMBEDDED, embeddedOverageMb),
    embeddedDelta
  );
  const toolCallReported = await reportMeter(
    polar,
    constants.BILLING_METER_TOOL_CALLS,
    organizationId,
    eventId(constants.BILLING_METER_TOOL_CALLS, toolCallOverage),
    toolCallDelta
  );
  const dataStorageReported = await reportMeter(
    polar,
    constants.BILLING_METER_DATA_STORAGE,
    organizationId,
    eventId(constants.BILLING_METER_DATA_STORAGE, dataStorageMb),
    dataStorageDelta
  );
  const rowsWrittenReported = await reportMeter(
    polar,
    constants.BILLING_METER_DATA_ROWS_WRITTEN,
    organizationId,
    eventId(constants.BILLING_METER_DATA_ROWS_WRITTEN, rowsWritten),
    rowsWrittenDelta
  );
  const rowsReadReported = await reportMeter(
    polar,
    constants.BILLING_METER_DATA_ROWS_READ,
    organizationId,
    eventId(constants.BILLING_METER_DATA_ROWS_READ, rowsRead),
    rowsReadDelta
  );
  const triggerRunsReported = await reportMeter(
    polar,
    constants.BILLING_METER_DATA_TRIGGER_RUNS,
    organizationId,
    eventId(constants.BILLING_METER_DATA_TRIGGER_RUNS, triggerRuns),
    triggerRunDelta
  );

  // Advance only the marks whose meter event actually went through. A mark that
  // moves without its event loses that usage for good — nothing re-derives it,
  // because the mark IS the memory of what was billed. A mark that stays put
  // costs nothing but a retry on the next run.
  if (
    messageReported ||
    sharedReported ||
    embeddedReported ||
    toolCallReported ||
    dataStorageReported ||
    rowsWrittenReported ||
    rowsReadReported ||
    triggerRunsReported
  ) {
    await executor
      .update(db.schema.subscription)
      .set({
        reportedMessageOverage: messageReported
          ? messageOverage
          : sub.reportedMessageOverage,
        reportedSharedMessageOverage: sharedReported
          ? sharedOverage
          : sub.reportedSharedMessageOverage,
        reportedEmbeddedOverageMb: embeddedReported
          ? embeddedOverageMb
          : sub.reportedEmbeddedOverageMb,
        reportedToolCallOverage: toolCallReported
          ? toolCallOverage
          : sub.reportedToolCallOverage,
        reportedDataStorageMb: dataStorageReported
          ? dataStorageMb
          : sub.reportedDataStorageMb,
        reportedDataRowsWritten: rowsWrittenReported
          ? rowsWritten
          : sub.reportedDataRowsWritten,
        reportedDataRowsRead: rowsReadReported
          ? rowsRead
          : sub.reportedDataRowsRead,
        reportedDataTriggerRuns: triggerRunsReported
          ? triggerRuns
          : sub.reportedDataTriggerRuns
      })
      .where(eq(db.schema.subscription.id, sub.id));
  }
};

// Cron entrypoint: measure every paid, entitled org, and report the ones the
// provider bills. Per-org failures are isolated so one bad org can't stall the
// rest of the run.
//
// **This no longer returns early when billing is unconfigured.** Measuring is
// how a period becomes reconstructable — the storage high-water and the snapshot
// the rollover writes from it — and that has to keep working with no provider at
// all, which is the state production runs in today and the state an Enterprise
// org invoiced by bank transfer stays in permanently. Only the reporting half
// needs a client.
export const runOverageMetering = async (
  source: ApiEnvSource
): Promise<void> => {
  const polar = createPolar(source);

  const dbInstance = db.create(source);

  // The sweep runs under `ctx.waitUntil`, so an unhandled throw here is an
  // unhandled rejection in the cron invocation rather than a logged failure —
  // and a transient database blip on this one query would take the whole run
  // with it. Retention and the alert digest contain their errors the same way.
  let subs: { organizationId: string }[];
  try {
    subs = await dbInstance
      .select({ organizationId: db.schema.subscription.organizationId })
      .from(db.schema.subscription)
      // No filter on the provider customer id. It used to be here because a row
      // without one had nothing to report against — but such a row still has a
      // period to measure, and skipping it is precisely how an Enterprise org
      // ended up with no storage figure to invoice from.
      .where(
        and(
          inArray(db.schema.subscription.plan, [
            constants.PLAN_PRO,
            constants.PLAN_ENTERPRISE
          ]),
          inArray(
            db.schema.subscription.status,
            constants.SUBSCRIPTION_ENTITLED_STATUSES as unknown as string[]
          )
        )
      );
  } catch (error) {
    console.error('[metering] failed to list measurable organizations:', error);
    return;
  }

  for (const { organizationId } of subs) {
    try {
      await meterOrganization(
        dbInstance,
        polar,
        organizationId,
        source.env.PROJECT_DATABASE
      );
    } catch (error) {
      // Log and continue — never let one org abort the whole sweep.
      console.error(
        `[metering] failed for org ${organizationId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }
};
