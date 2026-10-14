// Trust the read-only labels of MCP servers installed before owners could
// choose. A proxied tool's own readOnlyHint is ignored unless its install says
// to trust it, so an install saved before that switch existed has every tool
// counted as sensitive: after one call reads outside content, each later
// proxied call — plain reads included — waits for the user's approval. This
// turns trust on for those installs, which is how they behaved before.
//
//   node scripts/backfill-mcp-proxy-trust.mjs                        # report only
//   node scripts/backfill-mcp-proxy-trust.mjs --confirm              # write
//   node scripts/backfill-mcp-proxy-trust.mjs --before 2026-10-14T18:00:00Z
//   …any of them with --prod to act on production (.env.prod)
//
// Only installs whose config has no trustAnnotations at all are touched: the
// dialog writes it on every save, so its presence — true or false — means an
// owner already chose. --before limits it to installs created before a time
// (the deploy). Safe to run again: an install it set is passed over.
import fs from 'node:fs';
import postgres from 'postgres';
import { utils } from '@ganju/utils';

const args = process.argv.slice(2);
const isProd = args.includes('--prod');
const confirm = args.includes('--confirm');
const beforeArg = args[args.indexOf('--before') + 1];
const before = args.includes('--before') ? new Date(beforeArg) : null;
if (before && Number.isNaN(before.getTime())) {
  throw new Error(`--before needs an ISO date, got ${beforeArg}`);
}

const root = new URL('..', import.meta.url).pathname;
const envFile = root + (isProd ? '.env.prod' : '.env');
const env = fs.readFileSync(envFile, 'utf8');
const DATABASE_URL = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (!DATABASE_URL) throw new Error(`Missing DATABASE_URL in ${envFile}`);

const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1, prepare: false });
const KEY = utils.constants.TOOL_DEFINITION_KEY_MCP_PROXY;

console.log(
  `${isProd ? 'PRODUCTION' : 'development'} — ${confirm ? 'writing' : 'report only (pass --confirm to write)'}${before ? ` — created before ${before.toISOString()}` : ''}\n`
);

let scanned = 0;
let trusted = 0;

try {
  const rows = await sql`
    select t.id, t.config, t.created_at, a.slug, p.name as project
    from artifact_tool t
    join artifact a on a.id = t.artifact_id
    join project p on p.id = a.project_id
    where t.tool_key = ${KEY}
      ${before ? sql`and t.created_at < ${before}` : sql``}
    order by t.created_at`;

  for (const row of rows) {
    scanned++;
    const config = row.config ?? {};
    if (Object.hasOwn(config, 'trustAnnotations')) continue;
    trusted++;
    console.log(
      `  trust ${row.id}  ${config.prefix ?? config.curatedServerId ?? '?'}  (${row.project} / ${row.slug})`
    );
    if (confirm) {
      // Re-checked in the update: an owner who saves the dialog meanwhile
      // writes trustAnnotations, and their choice stands.
      // sql.json, not a stringified value cast: postgres.js would serialize a
      // parameter it sees typed as json a second time.
      await sql`
        update artifact_tool
        set config = ${sql.json({ ...config, trustAnnotations: true })}::json
        where id = ${row.id} and config->>'trustAnnotations' is null`;
    }
  }
} finally {
  await sql.end();
}

console.log(
  `\n  ${scanned} MCP server install(s) scanned, ${trusted} ${confirm ? 'set to trust their labels' : 'to trust'}.`
);
if (!confirm && trusted > 0) console.log('  Pass --confirm to write.');
