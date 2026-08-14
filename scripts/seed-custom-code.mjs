// Seeds the `custom-code` tool_group + tool_definition rows.
//
// Catalog rows (tool_group, tool_definition, mcp_server_catalog) are seeded out
// of band rather than by a migration — see packages/db/README.md. This is that
// out-of-band step for Custom Tools Phase 1. Idempotent: safe to run repeatedly,
// and safe to run against a database that already has the rows.
//
//   node scripts/seed-custom-code.mjs           # dev  (.env)
//   node scripts/seed-custom-code.mjs --prod    # prod (.env.prod)
//
// Until this has run, POST …/artifact/custom-code/version fails with "The
// custom-code tool definition is not seeded on this deployment" — the API
// resolves the definition by key and will not invent one.
import fs from 'node:fs';
import postgres from 'postgres';
import { v7 as uuid } from 'uuid';

const KEY = 'custom-code';
const envFile = process.argv.includes('--prod') ? '../.env.prod' : '../.env';

const env = fs.readFileSync(new URL(envFile, import.meta.url), 'utf8');
const read = key => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();

const sql = postgres(read('DATABASE_URL'), { ssl: 'require', max: 1 });

const GROUP = {
  key: KEY,
  title: 'Custom code',
  description:
    'Write your own tools as a Cloudflare Worker and deploy them to this MCP server.',
  icon: null,
  // No OAuth provider: connections a script uses are requested per-tool through
  // the broker, not granted to the group.
  provider: null
};

// Column names are written out in snake_case: postgres.js inserts object keys
// verbatim, without Drizzle's camelCase mapping.
const DEFINITION = {
  key: KEY,
  title: 'Custom code',
  description:
    'Tools implemented by your own code. One script per artifact; names and schemas come from the published version.',
  required_scopes: null
};

try {
  const [group] = await sql`
    INSERT INTO tool_group ${sql({ id: uuid(), ...GROUP })}
    ON CONFLICT (key) DO UPDATE
      SET title = EXCLUDED.title, description = EXCLUDED.description
    RETURNING id, key
  `;

  const [definition] = await sql`
    INSERT INTO tool_definition ${sql({
      id: uuid(),
      ...DEFINITION,
      group_id: group.id
    })}
    ON CONFLICT (key) DO UPDATE
      SET title = EXCLUDED.title,
          description = EXCLUDED.description,
          group_id = EXCLUDED.group_id
    RETURNING id, key
  `;

  console.log(`  tool_group        ${group.key}  ${group.id}`);
  console.log(`  tool_definition   ${definition.key}  ${definition.id}`);
  console.log('\nSeeded. The custom-code card is now in the tools catalog.');
} finally {
  await sql.end();
}
