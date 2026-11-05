// Deletes a project database whose organization stayed on Free past its
// notices, by hand. Only one on the ready-to-delete list (Ganju's daily digest)
// and still on Free is accepted; the API checks both again.
//
//   node scripts/delete-data-database.mjs --artifact <artifact-id>          # dev  (.env)
//   node scripts/delete-data-database.mjs --artifact <artifact-id> --prod   # prod (.env.prod)
//
// It asks for the database's name, like the dashboard does, then:
//   1. exports the database to R2 (kept 90 days, then removed by the hourly cron);
//   2. empties the object (deleteAll);
//   3. marks the row deleted with the export's place in R2;
//   4. emails the owner and admins that it was deleted and a copy is kept.
import fs from 'node:fs';
import readline from 'node:readline/promises';
import postgres from 'postgres';

const args = process.argv.slice(2);
const has = flag => args.includes(flag);
const value = flag => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const isProd = has('--prod');
const artifact = value('--artifact');
if (!artifact) {
  console.error(
    'Usage: node scripts/delete-data-database.mjs --artifact <artifact-id> [--prod]'
  );
  process.exit(1);
}

const envFile = isProd ? '../.env.prod' : '../.env';
const env = fs.readFileSync(new URL(envFile, import.meta.url), 'utf8');
const read = key => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();

const API = read('NEXT_PUBLIC_API_URL');
const SECRET = read('MCP_INTERNAL_SECRET');
if (!API || !SECRET) {
  console.error(
    `NEXT_PUBLIC_API_URL and MCP_INTERNAL_SECRET must be in ${envFile}.`
  );
  process.exit(1);
}

const sql = postgres(read('DATABASE_URL'), {
  ssl: 'require',
  max: 1,
  prepare: false
});
const done = async code => {
  await sql.end();
  process.exit(code);
};

// An artifact id, or the object name a database keeps after its artifact is gone.
const [row] = await sql`
  select d.id, d.name, d.status, d.organization_id, d.size_bytes,
         d.delete_ready_at, d.abandon_warned_at, d.abandon_reminded_at,
         o.name as organization_name, s.plan, s.status as subscription_status
  from artifact_database d
  join organization o on o.id = d.organization_id
  left join subscription s on s.organization_id = d.organization_id
  where d.artifact_id = ${artifact} or d.object_name = ${artifact}
  limit 1`;

if (!row) {
  console.error(`No database for artifact ${artifact}.`);
  await done(1);
}
const entitled = ['active', 'trialing'].includes(row.subscription_status);
const onFree = !row.plan || row.plan === 'FREE' || !entitled;
const refuse = [
  row.status !== 'READY' && `its status is ${row.status}`,
  !row.delete_ready_at && "it isn't on the ready-to-delete list",
  !onFree && `the organization is on ${row.plan}`
].filter(Boolean);
if (refuse.length) {
  console.error(`Refused: ${refuse.join('; ')}.`);
  await done(1);
}

console.log(`\n  ${isProd ? 'PRODUCTION' : 'development'}`);
console.log(`  database   ${row.name} (${row.id})`);
console.log(`  org        ${row.organization_name} (${row.organization_id})`);
console.log(
  `  size       ${(Number(row.size_bytes) / 1_048_576).toFixed(1)} MB`
);
console.log(
  `  warned     ${row.abandon_warned_at?.toISOString?.() ?? row.abandon_warned_at}`
);
console.log(
  `  reminded   ${row.abandon_reminded_at?.toISOString?.() ?? row.abandon_reminded_at}`
);
console.log(
  `  listed     ${row.delete_ready_at?.toISOString?.() ?? row.delete_ready_at}\n`
);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
const typed = (
  await rl.question(`Type the database's name (${row.name}) to delete it: `)
).trim();
rl.close();
if (typed !== row.name) {
  console.error("The name doesn't match; nothing was deleted.");
  await done(1);
}

const call = async (method, path, body) => {
  const response = await fetch(
    `${API}/internal/data/database/${row.id}/abandoned${path}`,
    {
      method,
      headers: {
        'content-type': 'application/json',
        'x-ganju-internal-secret': SECRET
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    }
  );
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `${method} ${path}: ${response.status} ${json.error ?? ''}`.trim()
    );
  }
  return json;
};

try {
  const { exportId } = await call('POST', '/export');
  console.log(`Exporting (${exportId})…`);
  let state;
  for (let i = 0; i < 600; i++) {
    ({ export: state } = await call('GET', `/export/${exportId}`));
    if (state.status !== 'running') break;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (state?.status !== 'done') {
    throw new Error(
      `The export ${state?.status ?? 'timed out'}${state?.error ? `: ${state.error}` : ''}; nothing was deleted.`
    );
  }
  const rows = state.files.reduce((sum, f) => sum + (f.rows ?? 0), 0);
  console.log(`Exported ${state.files.length} files, ${rows} rows.`);
  const result = await call('POST', '/delete', { exportId, name: row.name });
  console.log(`Deleted. Copy kept at ${result.exportKey} for 90 days.`);
  console.log(`Owners emailed: ${result.notified} of ${result.recipients}.`);
  await done(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await done(1);
}
