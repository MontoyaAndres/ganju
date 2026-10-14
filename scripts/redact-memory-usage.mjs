// Redact the values in `remember-customer` calls logged before the runner
// started logging them redacted. Each save was recorded on
// channel_message_usage with the facts as the customer said them (an address,
// allergies), and those rows outlive both the conversation's memory and the
// owner's "Forget". After this they keep which facts were saved, not what
// they say — the same shape the runner writes now.
//
//   node scripts/redact-memory-usage.mjs            # report only
//   node scripts/redact-memory-usage.mjs --confirm  # write
//   …either with --prod to act on production (.env.prod)
//
// The conversation itself (channel_message) is left as it is. Safe to run
// again: a row already redacted is passed over. Needs `npm run build` in
// packages/utils first.
import fs from 'node:fs';
import postgres from 'postgres';
import { utils } from '@ganju/utils';

const args = process.argv.slice(2);
const isProd = args.includes('--prod');
const confirm = args.includes('--confirm');

const root = new URL('..', import.meta.url).pathname;
const envFile = root + (isProd ? '.env.prod' : '.env');
const env = fs.readFileSync(envFile, 'utf8');
const DATABASE_URL = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (!DATABASE_URL) throw new Error(`Missing DATABASE_URL in ${envFile}`);

const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1, prepare: false });
const TOOL = utils.PARTICIPANT_MEMORY_TOOL_NAME;

console.log(
  `${isProd ? 'PRODUCTION' : 'development'} — ${confirm ? 'writing' : 'report only (pass --confirm to write)'}\n`
);

let scanned = 0;
let redacted = 0;
let lastId = '';

try {
  for (;;) {
    // Keyset pagination, so a large table is read in bounded pages.
    const rows = await sql`
      select id, input
      from channel_message_usage
      where tool_name = ${TOOL} and id > ${lastId}
      order by id
      limit 500`;
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1].id;

    for (const row of rows) {
      scanned++;
      const next = utils.redactParticipantMemoryArgs(row.input);
      if (JSON.stringify(next) === JSON.stringify(row.input)) continue;
      redacted++;
      const keys = next.facts.map(fact => fact.key).filter(Boolean);
      console.log(
        `  redact ${row.id}  ${keys.join(', ') || '(no facts)'}${next.forgetAll ? '  forgetAll' : ''}`
      );
      if (confirm) {
        // sql.json, not a stringified value cast to jsonb: postgres.js
        // serializes a parameter it sees typed as jsonb a second time.
        await sql`
          update channel_message_usage
          set input = ${sql.json(next)}::json
          where id = ${row.id}`;
      }
    }
  }
} finally {
  await sql.end();
}

console.log(
  `\n  ${scanned} ${TOOL} call(s) scanned, ${redacted} ${confirm ? 'redacted' : 'to redact'}.`
);
if (!confirm && redacted > 0) console.log('  Pass --confirm to write.');
