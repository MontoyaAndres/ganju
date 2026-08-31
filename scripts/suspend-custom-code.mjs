// Stop one artifact's custom tools, and put them back.
//
//   node scripts/suspend-custom-code.mjs <artifact-slug|artifact-id>
//   node scripts/suspend-custom-code.mjs <artifact> --confirm
//   node scripts/suspend-custom-code.mjs <artifact> --confirm --delete-scripts
//   node scripts/suspend-custom-code.mjs <artifact> --confirm --restore
//   …any of the above with --prod to act on production (.env.prod)
//
// Without --confirm it only reports: whose artifact this is, what plan they are
// on, how many custom tool calls the organization has made this period, which
// tools are exposed, and which scripts are deployed. Reading that before acting
// is the point — the same numbers decide whether this is abuse or a customer
// having a bad week.
//
// Two levels, because they undo differently:
//
//   default          `artifact_tool.enabled = false`. The tools stop being
//                    registered at boot, so nothing can call them. Reversible
//                    with --restore, and the code, versions and settings are all
//                    still there.
//   --delete-scripts also removes the deployed bundles from the dispatch
//                    namespace. Use when code is actively doing damage and you
//                    want it off the platform in the same minute. --restore
//                    cannot bring these back; the owner republishes, or an
//                    operator rolls the version forward, which re-uploads.
//
// What this does NOT do, deliberately: it does not stop the owner deploying
// again. Suspending an artifact answers "make it stop now"; keeping it stopped
// is a plan or an account decision, not a script.
import fs from 'node:fs';
import postgres from 'postgres';

const args = process.argv.slice(2);
const target = args.find(a => !a.startsWith('--'));
const has = flag => args.includes(flag);

const isProd = has('--prod');
const confirm = has('--confirm');
const restore = has('--restore');
const deleteScripts = has('--delete-scripts');

if (!target) {
  console.error(
    'Usage: node scripts/suspend-custom-code.mjs <artifact-slug|artifact-id> [--confirm] [--delete-scripts] [--restore] [--prod]'
  );
  process.exit(1);
}

const envFile = isProd ? '../.env.prod' : '../.env';
const env = fs.readFileSync(new URL(envFile, import.meta.url), 'utf8');
const read = key => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();

const sql = postgres(read('DATABASE_URL'), {
  ssl: 'require',
  max: 1,
  prepare: false
});

const CUSTOM_CODE_KEY = 'custom-code';

const [artifact] = await sql`
  select a.id, a.slug, p.id as project_id, p.name as project_name,
         o.id as organization_id, o.name as organization_name,
         s.plan, s.status, s.tool_call_count, s.message_period_start
  from artifact a
  join project p on p.id = a.project_id
  join organization o on o.id = p.organization_id
  left join subscription s on s.organization_id = o.id
  where a.slug = ${target} or a.id = ${target}
  limit 1`;

if (!artifact) {
  console.error(`No artifact matches "${target}".`);
  await sql.end();
  process.exit(1);
}

const [tool] = await sql`
  select id, enabled, config
  from artifact_tool
  where artifact_id = ${artifact.id} and tool_key = ${CUSTOM_CODE_KEY}
  limit 1`;

if (!tool) {
  console.error(
    `Artifact "${artifact.slug}" has no custom-code tool — nothing here to suspend.`
  );
  await sql.end();
  process.exit(1);
}

// Every script this tool owns, not only the live one: an abandoned draft and a
// superseded version are both still deployed until the sweep collects them, and
// a preview from a test run may be too.
const versions = await sql`
  select id, version, status, script_name
  from artifact_tool_version
  where artifact_tool_id = ${tool.id} and script_name is not null
  order by version desc`;

const activeVersionId = tool.config?.activeVersionId ?? null;
const activeVersion = versions.find(v => v.id === activeVersionId);

console.log(`\n  artifact       ${artifact.slug} (${artifact.id})`);
console.log(
  `  organization   ${artifact.organization_name} (${artifact.organization_id})`
);
console.log(`  project        ${artifact.project_name}`);
console.log(
  `  plan           ${artifact.plan ?? 'none'} / ${artifact.status ?? '—'}`
);
console.log(
  `  tool calls     ${(artifact.tool_call_count ?? 0).toLocaleString('en-US')} this period (since ${
    artifact.message_period_start
      ? new Date(artifact.message_period_start).toISOString().slice(0, 10)
      : 'never stamped'
  })`
);
console.log(
  `  custom tools   ${tool.enabled ? 'enabled' : 'ALREADY DISABLED'}`
);
console.log(
  `  live version   ${activeVersion ? `v${activeVersion.version} → ${activeVersion.script_name}` : 'none published'}`
);
console.log(`  scripts        ${versions.length} deployed name(s)`);
for (const v of versions) {
  console.log(
    `                 v${v.version} ${v.status.padEnd(9)} ${v.script_name}${
      v.id === activeVersionId ? '  ← live' : ''
    }`
  );
}

if (!confirm) {
  console.log(
    `\n  Dry run. Add --confirm to ${
      restore ? 'restore' : 'suspend'
    }${deleteScripts ? ', and --delete-scripts to remove the deployed bundles' : ''}.\n`
  );
  await sql.end();
  process.exit(0);
}

if (restore) {
  await sql`update artifact_tool set enabled = true where id = ${tool.id}`;
  console.log(
    `\n  Restored. The tools register again on the artifact's next MCP request.`
  );
  if (deleteScripts) {
    console.log(
      `  --delete-scripts is ignored on a restore: a deleted bundle comes back by publishing, not by a flag.`
    );
  }
  await sql.end();
  process.exit(0);
}

await sql`update artifact_tool set enabled = false where id = ${tool.id}`;
console.log(
  `\n  Suspended. The tools stop registering on the next MCP request.`
);

if (deleteScripts) {
  const accountId = read('CLOUDFLARE_ACCOUNT_ID');
  const apiToken = read('CUSTOM_CODE_CF_API_TOKEN');
  const namespace = read('CUSTOM_CODE_DISPATCH_NAMESPACE');

  if (!accountId || !apiToken || !namespace) {
    console.error(
      `  Could not delete scripts: ${envFile.replace('../', '')} is missing CLOUDFLARE_ACCOUNT_ID, CUSTOM_CODE_CF_API_TOKEN or CUSTOM_CODE_DISPATCH_NAMESPACE.`
    );
    await sql.end();
    process.exit(1);
  }

  for (const v of versions) {
    // ?force=true because a script with active bindings otherwise refuses to go,
    // and 404 is success — the sweep may already have collected it.
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/dispatch/namespaces/${namespace}/scripts/${v.script_name}?force=true`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${apiToken}` } }
    );
    console.log(
      `  ${res.ok || res.status === 404 ? 'removed ' : 'FAILED  '} ${v.script_name}${
        res.ok || res.status === 404 ? '' : ` (HTTP ${res.status})`
      }`
    );
  }
}

console.log(
  `\n  The owner can still publish again. If that has to stop too, the levers are the organization's plan and its credentials, not this script.\n`
);

await sql.end();
