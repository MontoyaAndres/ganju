// Run the instruction-like-text check over documents indexed before it existed.
// Indexing now records what it finds on `artifact_resource.metadata`, but a
// document indexed earlier is only checked when it is indexed again — and a
// website page whose text never changes is never re-embedded.
//
//   node scripts/backfill-instruction-warnings.mjs            # report only
//   node scripts/backfill-instruction-warnings.mjs --confirm  # write
//   …either with --prod to act on production (.env.prod)
//
// Reads each resource's indexed chunks (its inline content when it has none),
// the same text indexing scans, and sets or clears the warning the same way:
// merged into the metadata in SQL, so a sync running at the same time keeps its
// own keys. Needs `npm run build` in packages/utils first.
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
const KEY = utils.INSTRUCTION_WARNING_METADATA_KEY;

console.log(
  `${isProd ? 'PRODUCTION' : 'development'} — ${confirm ? 'writing' : 'report only (pass --confirm to write)'}\n`
);

let scanned = 0;
let flagged = 0;
let cleared = 0;
let lastId = '';

try {
  for (;;) {
    // Keyset pagination, so a large table is read in bounded pages.
    const rows = await sql`
      select r.id, r.title, r.uri, r.content,
             (r.metadata::jsonb -> ${KEY}::text) is not null as was_flagged,
             (select string_agg(c.content, E'\n' order by c.chunk_index)
              from artifact_resource_chunk c
              where c.resource_id = r.id) as chunk_text
      from artifact_resource r
      where r.id > ${lastId}
        and (r.content is not null
             or exists (select 1 from artifact_resource_chunk c where c.resource_id = r.id))
      order by r.id
      limit 100`;
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1].id;

    for (const row of rows) {
      scanned++;
      const text = row.chunk_text ?? row.content ?? '';
      const passages = utils.findInstructionLikeText(text);

      if (passages.length > 0) {
        flagged++;
        console.log(`  flag  ${row.title} (${row.uri})`);
        for (const p of passages) console.log(`          “${p}”`);
        if (confirm) {
          // sql.json, not a stringified value cast to jsonb: postgres.js
          // serializes a parameter it sees typed as jsonb a second time, and
          // the warning lands as a JSON string the page can't read.
          const warning = { passages, checkedAt: new Date().toISOString() };
          await sql`
            update artifact_resource
            set metadata = ((coalesce(metadata::jsonb, '{}'::jsonb) - ${KEY}::text)
                            || jsonb_build_object(${KEY}::text, ${sql.json(warning)}))::json
            where id = ${row.id}`;
        }
      } else if (row.was_flagged) {
        cleared++;
        console.log(`  clear ${row.title} (${row.uri})`);
        if (confirm) {
          await sql`
            update artifact_resource
            set metadata = (metadata::jsonb - ${KEY}::text)::json
            where id = ${row.id}`;
        }
      }
    }
  }
} finally {
  await sql.end();
}

console.log(
  `\n${scanned} resources scanned, ${flagged} flagged, ${cleared} cleared${confirm ? '' : ' (nothing written)'}.`
);
