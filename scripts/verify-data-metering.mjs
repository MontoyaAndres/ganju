// Verifies the project data meters against the dev database, driving the REAL
// meterOrganization: the hourly storage reading that keeps peak_data_mb, and
// the four data meters reported in full (storage, rows written, rows read,
// trigger runs).
//
//   node scripts/verify-data-metering.mjs           # dev  (.env)
//   node scripts/verify-data-metering.mjs --prod    # prod (.env.prod)
//
// Polar and the database objects are stubs: nothing is billed and no object is
// touched. The scaffold is a throwaway organization → project → artifact with
// a few database rows, removed at the end.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import esbuild from 'esbuild';
import postgres from 'postgres';
import { v7 as uuid } from 'uuid';

const isProd = process.argv.includes('--prod');
const envFile = isProd ? '../.env.prod' : '../.env';
const env = fs.readFileSync(new URL(envFile, import.meta.url), 'utf8');
const read = key => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();

const DATABASE_URL = read('DATABASE_URL');
const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1, prepare: false });

let pass = 0;
let fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) {
    pass++;
    console.log(`  ok   ${label}${extra ? ` — ${extra}` : ''}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${extra ? ` — ${extra}` : ''}`);
  }
};

// One bundle for everything, so drizzle sees a single copy of each table.
const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ganju-verify-'));
const outfile = path.join(bundleDir, 'metering.mjs');
const root = new URL('..', import.meta.url).pathname;
const entry = path.join(root, `.verify-entry-${process.pid}.ts`);
const from = rel => JSON.stringify(path.join(root, rel));

fs.writeFileSync(
  entry,
  [
    `export { meterOrganization } from ${from('apps/api/src/utils/metering')};`,
    `export { Plan } from ${from('apps/api/src/utils/plan')};`,
    `export { db } from '@ganju/db';`,
    `export { utils } from '@ganju/utils';`
  ].join('\n')
);

await esbuild.build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  absWorkingDir: root,
  tsconfig: path.join(root, 'apps/api/tsconfig.json'),
  banner: {
    js: "import { createRequire as __cr } from 'node:module';\nconst require = __cr(import.meta.url);"
  },
  logLevel: 'error'
});

const { meterOrganization, Plan, db, utils } = await import(outfile);
const { constants } = utils;
const MB = constants.MB;

const source = {
  env: { HYPERDRIVE: { connectionString: DATABASE_URL } }
};
const dbInstance = db.create(source);

const makePolar = () => {
  const events = [];
  return {
    events,
    async ingestEvent(event) {
      const duplicate = events.some(e => e.external_id === event.external_id);
      if (!duplicate) events.push(event);
      return { inserted: duplicate ? 0 : 1, duplicates: duplicate ? 1 : 0 };
    }
  };
};

const totalFor = (polar, eventName) =>
  polar.events
    .filter(e => e.name === eventName)
    .reduce(
      (n, e) => n + Number(e.metadata[constants.BILLING_METER_UNITS_KEY]),
      0
    );

// Objects by name: a size in bytes, or null for one that doesn't answer.
const makeNamespace = sizes => {
  const asked = [];
  return {
    asked,
    sizes,
    idFromName: name => name,
    get: name => ({
      size: async () => {
        asked.push(name);
        if (sizes[name] === null) throw new Error('object unavailable');
        return {
          ok: true,
          value: { bytes: sizes[name] },
          usage: { rowsRead: 0, rowsWritten: 0 }
        };
      }
    })
  };
};

// scaffold

const [owner] =
  await sql`select id from "user" order by created_at asc limit 1`;
if (!owner) throw new Error('No user in this database to own the scaffold');

const orgId = uuid();
const projectId = uuid();
const artifactId = uuid();
const otherArtifactId = uuid();
const customerId = uuid();
const stamp = Date.now();
const objects = {
  live: `verify-data-live-${stamp}`,
  grace: `verify-data-grace-${stamp}`,
  purged: `verify-data-purged-${stamp}`,
  silent: `verify-data-silent-${stamp}`
};

console.log(`\nScaffolding org ${orgId}\n`);

await sql`insert into organization ${sql({ id: orgId, name: 'verify-data-metering', owner_id: owner.id })}`;
await Plan.ensureSubscription(dbInstance, orgId);
await sql`update subscription set plan = 'PRO', status = 'active', billing_customer_id = ${customerId} where organization_id = ${orgId}`;
await sql`insert into project ${sql({ id: projectId, name: 'verify', created_by_id: owner.id, organization_id: orgId })}`;
await sql`insert into artifact ${sql({ id: artifactId, slug: `verify-data-${stamp}`, project_id: projectId })}`;
await sql`insert into artifact ${sql({ id: otherArtifactId, slug: `verify-data-b-${stamp}`, project_id: projectId })}`;

const database = (objectName, status, extra = {}) => ({
  id: uuid(),
  artifact_id: null,
  object_name: objectName,
  organization_id: orgId,
  name: objectName,
  status,
  created_by_id: owner.id,
  // Every row names the same columns: a multi-row insert takes them from
  // the first one.
  size_bytes: 0,
  ...extra
});
// A live database, one in its grace period, one already purged, and a live
// one whose object doesn't answer (last read at 1 MB).
await sql`insert into artifact_database ${sql([
  database(objects.live, 'READY', { artifact_id: artifactId }),
  database(objects.grace, 'DELETING'),
  database(objects.purged, 'DELETED'),
  database(objects.silent, 'READY', {
    artifact_id: otherArtifactId,
    size_bytes: 1 * MB
  })
])}`;

const subRow = async () =>
  (await sql`select * from subscription where organization_id = ${orgId}`)[0];
const sizeOf = async objectName =>
  Number(
    (
      await sql`select size_bytes from artifact_database where object_name = ${objectName}`
    )[0].size_bytes
  );

try {
  console.log('storage\n');

  const namespace = makeNamespace({
    [objects.live]: 3 * MB + 1,
    [objects.grace]: 2 * MB,
    [objects.purged]: 9 * MB,
    [objects.silent]: null
  });
  const polar = makePolar();
  await meterOrganization(dbInstance, polar, orgId, namespace);

  check(
    'reads the live database and the one in its grace period',
    namespace.asked.includes(objects.live) &&
      namespace.asked.includes(objects.grace),
    namespace.asked.length + ' asked'
  );
  check(
    'leaves a purged database alone',
    !namespace.asked.includes(objects.purged)
  );
  check(
    'stores each reading on its row',
    (await sizeOf(objects.live)) === 3 * MB + 1 &&
      (await sizeOf(objects.grace)) === 2 * MB
  );
  check(
    "keeps the last reading of a database that doesn't answer",
    (await sizeOf(objects.silent)) === 1 * MB
  );
  // 3 MB + 1 byte + 2 MB + 1 MB, rounded up to whole MB.
  check(
    'peak_data_mb is the total in whole MB, rounded up',
    Number((await subRow()).peak_data_mb) === 7,
    String((await subRow()).peak_data_mb)
  );
  check(
    'reports the peak to the storage meter',
    totalFor(polar, constants.BILLING_METER_DATA_STORAGE) === 7
  );

  // Storage drops: the peak stays, and nothing more is reported.
  namespace.sizes[objects.live] = 0;
  await meterOrganization(dbInstance, polar, orgId, namespace);
  check('a drop keeps the peak', Number((await subRow()).peak_data_mb) === 7);
  check(
    'and reports nothing new',
    totalFor(polar, constants.BILLING_METER_DATA_STORAGE) === 7
  );

  // Storage grows past the peak: only the increase is reported.
  namespace.sizes[objects.live] = 10 * MB;
  await meterOrganization(dbInstance, polar, orgId, namespace);
  check(
    'growth past the peak raises it',
    Number((await subRow()).peak_data_mb) === 13
  );
  check(
    'and reports only the increase',
    totalFor(polar, constants.BILLING_METER_DATA_STORAGE) === 13,
    String(totalFor(polar, constants.BILLING_METER_DATA_STORAGE))
  );

  // Without the binding (a script), the peak is left as it was.
  await meterOrganization(dbInstance, polar, orgId);
  check(
    'a run without the binding leaves the peak',
    Number((await subRow()).peak_data_mb) === 13
  );

  console.log('\nrows and trigger runs\n');

  await sql`update subscription set data_rows_written_count = 1200, data_rows_read_count = 50000, data_trigger_run_count = 7 where organization_id = ${orgId}`;
  await meterOrganization(dbInstance, polar, orgId, namespace);
  check(
    'reports every row written',
    totalFor(polar, constants.BILLING_METER_DATA_ROWS_WRITTEN) === 1200
  );
  check(
    'reports every row read',
    totalFor(polar, constants.BILLING_METER_DATA_ROWS_READ) === 50000
  );
  check(
    'reports every trigger run',
    totalFor(polar, constants.BILLING_METER_DATA_TRIGGER_RUNS) === 7
  );
  let sub = await subRow();
  check(
    'advances the marks',
    Number(sub.reported_data_rows_written) === 1200 &&
      Number(sub.reported_data_rows_read) === 50000 &&
      Number(sub.reported_data_storage_mb) === 13 &&
      Number(sub.reported_data_trigger_runs) === 7
  );

  await sql`update subscription set data_rows_written_count = 1500 where organization_id = ${orgId}`;
  await meterOrganization(dbInstance, polar, orgId, namespace);
  check(
    'a later run reports only the new rows',
    totalFor(polar, constants.BILLING_METER_DATA_ROWS_WRITTEN) === 1500 &&
      polar.events.filter(
        e => e.name === constants.BILLING_METER_DATA_ROWS_WRITTEN
      ).length === 2
  );

  console.log('\nperiod rollover\n');

  // A period that started before the stored boundary: the next run closes it.
  await sql`update subscription set message_period_start = ${new Date('2020-01-01T00:00:00Z')} where organization_id = ${orgId}`;
  // A fresh stub: this period starts on the same day the scaffold's did, so
  // its event ids would repeat the last period's.
  await meterOrganization(dbInstance, makePolar(), orgId, namespace);
  const [closed] =
    await sql`select * from usage_period where organization_id = ${orgId} order by period_start desc limit 1`;
  check(
    'the closed period keeps the data marks',
    !!closed &&
      Number(closed.peak_data_mb) === 13 &&
      Number(closed.reported_data_storage_mb) === 13 &&
      Number(closed.reported_data_rows_written) === 1500 &&
      Number(closed.reported_data_rows_read) === 50000
  );
  sub = await subRow();
  // The new period measures again at once: 10 + 2 + 1 MB.
  check(
    'the new period starts from a fresh reading',
    Number(sub.peak_data_mb) === 13 &&
      Number(sub.data_rows_written_count) === 0 &&
      Number(sub.reported_data_rows_written) === 0,
    `peak ${sub.peak_data_mb}`
  );
} finally {
  console.log('\nCleaning up\n');
  await sql`delete from artifact_database where organization_id = ${orgId}`;
  await sql`delete from artifact where id in (${artifactId}, ${otherArtifactId})`;
  await sql`delete from project where id = ${projectId}`;
  await sql`delete from usage_period where organization_id = ${orgId}`;
  await sql`delete from subscription where organization_id = ${orgId}`;
  await sql`delete from organization where id = ${orgId}`;
  const leftover =
    await sql`select count(*)::int as n from organization where id = ${orgId}`;
  check('scaffold removed', leftover[0].n === 0);

  fs.rmSync(bundleDir, { recursive: true, force: true });
  fs.rmSync(entry, { force: true });
  await sql.end();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
