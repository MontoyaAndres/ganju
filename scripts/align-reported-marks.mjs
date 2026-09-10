// Move every `reported_*` mark up to the usage that has already accrued, so the
// first real metering sweep bills nothing retroactively.
//
//   node scripts/align-reported-marks.mjs                    # dev,  report only
//   node scripts/align-reported-marks.mjs --confirm          # dev,  apply
//   node scripts/align-reported-marks.mjs --prod             # prod, report only
//   node scripts/align-reported-marks.mjs --prod --confirm   # prod, apply
//
// Run this in the SAME change window as setting POLAR_ACCESS_TOKEN, immediately
// before it. Not afterwards: the hourly sweep may fire in between.
//
// The problem it solves. `meterOrganization` reports `current − reported`, and
// with no provider configured the reporting half never runs, so every mark sits
// at 0 while the counters have been accruing for months. The first sweep after a
// token is set would read that difference as one period's overage and bill the
// whole accumulated history — on the customer's first invoice, for usage that
// predates them ever agreeing to pay for it.
//
// How it aligns. It runs the REAL `meterOrganization` against a client that
// records events instead of sending them. The marks therefore advance by exactly
// the arithmetic the cron uses — not by a copy of it that could drift — and
// nothing reaches the provider. What the stub recorded is what the first sweep
// would have billed, which is what the report prints.
//
// Without --confirm the whole pass runs inside a transaction that is rolled
// back, so the report is produced by the same code path that would do the work.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import esbuild from 'esbuild';
import postgres from 'postgres';

const args = process.argv.slice(2);
const unknown = args.filter(a => !['--prod', '--confirm'].includes(a));
if (unknown.length) {
  console.error(`Unknown argument(s): ${unknown.join(', ')}`);
  console.error(
    'Usage: node scripts/align-reported-marks.mjs [--prod] [--confirm]'
  );
  process.exit(1);
}
const isProd = args.includes('--prod');
const confirm = args.includes('--confirm');

const envFile = isProd ? '../.env.prod' : '../.env';
const env = fs.readFileSync(new URL(envFile, import.meta.url), 'utf8');
const read = key => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();

const DATABASE_URL = read('DATABASE_URL');
if (!DATABASE_URL) {
  console.error(`No DATABASE_URL in ${envFile}`);
  process.exit(1);
}

// Name the database from the URL rather than from the flag. Loading the wrong
// env file is the mistake worth catching, and the flag is what would be wrong.
const host = (() => {
  try {
    const { hostname, pathname } = new URL(DATABASE_URL);
    return `${hostname}${pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
})();

const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1, prepare: false });

// Bundle the real modules together with @ganju/db so drizzle sees one copy of
// every table object. Two module instances mean two sets of symbols, and the
// query builder silently stops recognising them.
const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ganju-align-'));
const outfile = path.join(bundleDir, 'metering.mjs');
const root = new URL('..', import.meta.url).pathname;
const entry = path.join(root, `.align-entry-${process.pid}.ts`);
const from = rel => JSON.stringify(path.join(root, rel));

fs.writeFileSync(
  entry,
  [
    `export { meterOrganization } from ${from('apps/api/src/utils/metering')};`,
    `export { db } from '@ganju/db';`,
    `export { utils } from '@ganju/utils';`
  ].join('\n')
);

try {
  await esbuild.build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    absWorkingDir: root,
    tsconfig: path.join(root, 'apps/api/tsconfig.json'),
    // postgres.js is CommonJS and reaches for node builtins with require(),
    // which an ESM bundle has no binding for. This gives it one.
    banner: {
      js: "import { createRequire as __cr } from 'node:module';\nconst require = __cr(import.meta.url);"
    },
    logLevel: 'error'
  });

  const { meterOrganization, db, utils } = await import(outfile);
  const { constants } = utils;
  const source = { env: { HYPERDRIVE: { connectionString: DATABASE_URL } } };
  const dbInstance = db.create(source);

  console.log(`\nEnvironment : ${isProd ? 'PRODUCTION' : 'development'}`);
  console.log(`Env file    : ${envFile.replace('../', '')}`);
  console.log(`Database    : ${host}`);
  console.log(
    `Mode        : ${confirm ? 'APPLY' : 'report only (rolled back)'}\n`
  );

  // The same population the sweep walks: entitled paid organizations. One with
  // no provider customer is measured but never reported, so its marks are not
  // the ones that would produce a surprise invoice — it is skipped here for the
  // same reason `meterOrganization` returns early on it.
  const orgs = await sql`
    select s.organization_id, o.name, s.plan, s.status
      from subscription s
      join organization o on o.id = s.organization_id
     where s.plan in ('PRO', 'ENTERPRISE')
       and s.status in ${sql(constants.SUBSCRIPTION_ENTITLED_STATUSES)}
       and s.billing_customer_id is not null
     order by o.name`;

  if (!orgs.length) {
    console.log('No entitled paid organizations with a billing account.\n');
    console.log(
      'Nothing to align. Any organization onboarded AFTER the token is set starts\n' +
        'from zero on both sides, which is the state this script exists to create.\n'
    );
  } else {
    // Records what it was handed instead of sending it. Answering as a success
    // is the point: `meterOrganization` advances a mark only when its event
    // landed, so a stub that "fails" would align nothing.
    const captured = [];
    const stub = {
      async ingestEvent(event) {
        captured.push(event);
        return { inserted: 1, duplicates: 0 };
      }
    };

    const run = async executor => {
      for (const org of orgs) {
        const before = captured.length;
        await meterOrganization(executor, stub, org.organization_id);
        const mine = captured.slice(before);
        const units = Object.fromEntries(
          mine.map(e => [e.name, e.metadata[constants.BILLING_METER_UNITS_KEY]])
        );
        console.log(`  ${org.name}  [${org.plan}]`);
        if (!mine.length) {
          console.log(
            '    nothing owed — marks already level with the counters'
          );
        } else {
          for (const [meter, value] of Object.entries(units)) {
            console.log(`    ${meter.padEnd(26)} ${value}`);
          }
        }
        console.log('');
      }
    };

    if (confirm) {
      await run(dbInstance);
      console.log(
        `Aligned ${orgs.length} organization(s). ${captured.length} charge(s) suppressed —\n` +
          'that is what the first sweep would otherwise have billed.\n'
      );
      console.log(
        'Set POLAR_ACCESS_TOKEN now, in this same window. A sweep that fires before\n' +
          'it is set does nothing; one that fires after starts from these marks.\n'
      );
    } else {
      // Roll back by throwing out of the transaction, so the numbers above come
      // from the same code path that would write them rather than a preview of
      // it. Nothing is persisted, including the period rollovers it may trigger.
      const ROLLBACK = Symbol('rollback');
      try {
        await dbInstance.transaction(async tx => {
          await run(tx);
          throw ROLLBACK;
        });
      } catch (error) {
        if (error !== ROLLBACK) throw error;
      }
      console.log(
        `${captured.length} charge(s) would be billed by the first sweep, across ` +
          `${orgs.length} organization(s).\n`
      );
      console.log(
        'Nothing was written. Re-run with --confirm to move the marks past them' +
          (isProd ? ' IN PRODUCTION' : '') +
          '.\n'
      );
    }
  }
} finally {
  fs.rmSync(bundleDir, { recursive: true, force: true });
  fs.rmSync(entry, { force: true });
  await sql.end();
}

// `db.create` opens a pool of its own that nothing here can close, so the event
// loop stays alive after the work is done and the process hangs instead of
// exiting. Exit explicitly, as the verify scripts do.
process.exit(0);
