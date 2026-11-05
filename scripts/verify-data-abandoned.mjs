// Verifies the abandoned-database flow against the dev database, driving the
// REAL daily job: an org on Free is warned at day 30, reminded at day 41 and
// listed in Ganju's digest at day 44, each email once even when the job runs
// twice, and going back to Pro clears it.
//
//   node scripts/verify-data-abandoned.mjs           # dev  (.env)
//   node scripts/verify-data-abandoned.mjs --prod    # prod (.env.prod)
//
// The org's plan_changed_at is set 45 days back and the job is run "at" days
// 29, 30, 41 and 44 after it. Mail and the database objects are stubs: nothing
// is sent and no object is touched. The job is scoped to a throwaway
// organization → project → artifact → database, removed at the end.
// Needs migration 0088 on the database.
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

const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ganju-verify-'));
const outfile = path.join(bundleDir, 'abandoned.mjs');
const root = new URL('..', import.meta.url).pathname;
const entry = path.join(root, `.verify-entry-${process.pid}.ts`);
const from = rel => JSON.stringify(path.join(root, rel));

fs.writeFileSync(
  entry,
  [
    `export { runAbandonedDatabases } from ${from('apps/api/src/utils/dataAbandoned')};`,
    `export { Plan } from ${from('apps/api/src/utils/plan')};`,
    `export { db } from '@ganju/db';`
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

const { runAbandonedDatabases, Plan, db } = await import(outfile);

const DAY = 86_400_000;
const ALERT = 'verify-alerts@example.com';
const sent = [];
const asked = [];
const source = {
  env: {
    HYPERDRIVE: { connectionString: DATABASE_URL },
    NEXT_PUBLIC_WEB_URL: 'https://web.example',
    NEXT_PUBLIC_DOMAIN: 'example.com',
    NEXT_PUBLIC_API_URL: 'https://development-api.example',
    ALERT_EMAIL: ALERT,
    SEND_EMAIL: { send: async message => void sent.push(message) },
    PROJECT_DATABASE: {
      idFromName: name => name,
      get: name => ({
        info: async () => {
          asked.push(name);
          return {
            ok: true,
            value: {
              size: 2_000_000,
              tables: [
                { name: 'qa_orders', label: null, columns: 4, rows: 1200 },
                { name: 'qa_menu', label: null, columns: 3, rows: 40 }
              ]
            },
            usage: { rowsRead: 2, rowsWritten: 0 }
          };
        }
      })
    }
  }
};
const dbInstance = db.create(source);

// scaffold

const [owner] =
  await sql`select id, email from "user" order by created_at asc limit 1`;
if (!owner) throw new Error('No user in this database to own the scaffold');

const orgId = uuid();
const projectId = uuid();
const artifactId = uuid();
const databaseId = uuid();
const stamp = Date.now();
const base = new Date(Date.now() - 45 * DAY);
const at = days => new Date(base.getTime() + days * DAY);

console.log(
  `\nScaffolding org ${orgId}, on Free since ${base.toISOString()}\n`
);

await sql`insert into organization ${sql({ id: orgId, name: 'verify-data-abandoned', owner_id: owner.id })}`;
await Plan.ensureSubscription(dbInstance, orgId);
await sql`update subscription set plan = 'FREE', status = 'active', plan_changed_at = ${base.toISOString()} where organization_id = ${orgId}`;
await sql`insert into project ${sql({ id: projectId, name: 'qa-abandoned', created_by_id: owner.id, organization_id: orgId })}`;
await sql`insert into artifact ${sql({ id: artifactId, slug: `qa-abandoned-${stamp}`, project_id: projectId })}`;
await sql`insert into artifact_database ${sql({
  id: databaseId,
  artifact_id: artifactId,
  object_name: `verify-abandoned-${stamp}`,
  organization_id: orgId,
  name: 'qa-abandoned',
  status: 'READY',
  size_bytes: 2_000_000,
  created_by_id: owner.id
})}`;

const marks = async () =>
  (
    await sql`select abandon_warned_at, abandon_reminded_at, delete_ready_at, delete_listed_at from artifact_database where id = ${databaseId}`
  )[0];
const run = async days => {
  const before = sent.length;
  const result = await runAbandonedDatabases(source, at(days), {
    organizationId: orgId
  });
  return { result, mail: sent.slice(before) };
};
const toOwner = mail => mail.filter(m => m.to === owner.email);
const toAlert = mail => mail.filter(m => m.to === ALERT);

try {
  console.log('day 29: nothing yet\n');
  {
    const { mail } = await run(29);
    const m = await marks();
    check('no email', mail.length === 0, `${mail.length} sent`);
    check(
      'no mark',
      !m.abandon_warned_at && !m.abandon_reminded_at && !m.delete_ready_at
    );
  }

  console.log('\nday 30: the warning\n');
  {
    const { mail } = await run(30);
    const m = await marks();
    const [email] = toOwner(mail);
    check(
      'one warning to the owner',
      toOwner(mail).length === 1,
      `${mail.length} sent`
    );
    check('abandon_warned_at set', Boolean(m.abandon_warned_at));
    check(
      'Spanish then English',
      /Hola[\s\S]*---[\s\S]*Hello/.test(email?.text ?? '')
    );
    check(
      'lists the database, project, size and tables',
      /qa-abandoned, proyecto qa-abandoned: 1\.9 MB, tablas: qa_orders \(~1\.200\), qa_menu/.test(
        email?.text ?? ''
      )
    );
    check(
      'says read-only',
      /solo lectura/.test(email?.text ?? '') &&
        /read-only/.test(email?.text ?? '')
    );
    check(
      'gives the deletion date (day 44)',
      (email?.text ?? '').includes(at(44).toISOString().slice(0, 10))
    );
    check(
      'links Upgrade and Download',
      (email?.text ?? '').includes(
        `https://web.example/organization/${orgId}/settings`
      ) &&
        (email?.text ?? '').includes(
          `https://web.example/organization/${orgId}/project/${projectId}/data`
        )
    );
    const again = await run(30);
    check(
      'run twice: no second warning',
      again.mail.length === 0,
      `${again.mail.length} sent`
    );
  }

  console.log('\nday 41: the reminder\n');
  {
    const early = await run(40);
    check('day 40: nothing', early.mail.length === 0);
    const { mail } = await run(41);
    const m = await marks();
    const [email] = toOwner(mail);
    check(
      'one reminder to the owner',
      toOwner(mail).length === 1,
      `${mail.length} sent`
    );
    check(
      'says 3 days left',
      /Quedan 3 días/.test(email?.text ?? '') &&
        /3 days left/.test(email?.text ?? '')
    );
    check('abandon_reminded_at set', Boolean(m.abandon_reminded_at));
    check('not listed yet', !m.delete_ready_at);
    const again = await run(41);
    check('run twice: no second reminder', again.mail.length === 0);
  }

  console.log("\nday 44: Ganju's digest\n");
  {
    const { mail, result } = await run(44);
    const m = await marks();
    const [digest] = toAlert(mail);
    check('delete_ready_at set', Boolean(m.delete_ready_at));
    check(
      'one digest to ALERT_EMAIL',
      toAlert(mail).length === 1 && toOwner(mail).length === 0,
      `${mail.length} sent`
    );
    check(
      'digest marks it new',
      (digest?.text ?? '').includes('[NEW] verify-data-abandoned')
    );
    const facts = [
      `owner ${owner.email}`,
      `artifact ${artifactId}`,
      '2 tables, ~1240 rows',
      // The job's own reads of the database aren't the owner's activity.
      'last read never',
      `node scripts/delete-data-database.mjs --artifact ${artifactId}`
    ];
    const missing = facts.filter(f => !(digest?.text ?? '').includes(f));
    check(
      'digest line has the facts and the command',
      missing.length === 0,
      missing.length ? `missing: ${missing.join(' | ')}` : ''
    );
    const [{ last_read_at: lastRead }] =
      await sql`select last_read_at from artifact_database where id = ${databaseId}`;
    check("the job's reads leave last_read_at alone", lastRead === null);
    check(
      'delete_listed_at set',
      Boolean(m.delete_listed_at),
      `${result.listed} listed`
    );
    const again = await run(45);
    check('run again: no digest (nothing new)', again.mail.length === 0);
  }

  console.log('\nupgrade: cleared from the flow\n');
  {
    await sql`update subscription set plan = 'PRO', status = 'active', plan_changed_at = now() where organization_id = ${orgId}`;
    const { mail, result } = await run(46);
    const m = await marks();
    check('no email', mail.length === 0);
    check(
      'all marks cleared',
      !m.abandon_warned_at &&
        !m.abandon_reminded_at &&
        !m.delete_ready_at &&
        !m.delete_listed_at,
      `${result.cleared} cleared`
    );
  }

  console.log(
    "\na warning that reaches nobody: retried, and in Ganju's digest\n"
  );
  {
    await sql`update subscription set plan = 'FREE', plan_changed_at = ${base.toISOString()} where organization_id = ${orgId}`;
    const real = source.env.SEND_EMAIL;
    // Mail to the owner fails; Ganju's own address still works.
    source.env.SEND_EMAIL = {
      send: async message => {
        if (message.to !== ALERT) {
          throw Object.assign(new Error('down'), { code: 'E_TEST' });
        }
        await real.send(message);
      }
    };
    const day30 = await run(30);
    check(
      'warning not marked when nothing went out',
      !(await marks()).abandon_warned_at && day30.mail.length === 0
    );
    const day32 = await run(32);
    check('day 32: not in the digest yet', toAlert(day32.mail).length === 0);
    const day33 = await run(33);
    const [digest] = toAlert(day33.mail);
    check(
      "day 33: digest lists it as [CAN'T NOTIFY], without the delete command",
      (digest?.text ?? '').includes(
        "[NEW] [CAN'T NOTIFY] verify-data-abandoned"
      ) &&
        (digest?.text ?? '').includes('the warning has reached nobody') &&
        !(digest?.text ?? '').includes('delete-data-database.mjs'),
      digest ? '' : 'no digest'
    );
    check('not ready to delete', !(await marks()).delete_ready_at);
    const day34 = await run(34);
    check('day 34: no second digest', toAlert(day34.mail).length === 0);
    source.env.SEND_EMAIL = real;
    const day35 = await run(35);
    const m = await marks();
    check(
      'mail back: warned on the next run',
      toOwner(day35.mail).length === 1 && Boolean(m.abandon_warned_at)
    );
    check('and taken off the digest list', !m.delete_listed_at);
  }
  check(
    'read each database from its object',
    asked.length > 0,
    `${asked.length} reads`
  );
} finally {
  console.log('\nCleaning up\n');
  await sql`delete from artifact_database where organization_id = ${orgId}`;
  await sql`delete from artifact where id = ${artifactId}`;
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
