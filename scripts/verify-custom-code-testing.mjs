// Verifies the Test panel's backing pieces and per-function enablement against
// the dev database, driving the REAL broker auth middleware rather than a
// re-implementation of its checks.
//
//   node scripts/verify-custom-code-testing.mjs           # dev  (.env)
//   node scripts/verify-custom-code-testing.mjs --prod    # prod (.env.prod)
//
// Two halves. The first is pure: preview-token minting and verification, and
// the schema validator the panel reports input and output violations from —
// neither needs a database and both run before anything is scaffolded. The
// second scaffolds an organization → project → artifact → custom-code tool with
// three versions and drives the broker's `verify` middleware against them,
// because "a preview token works for a version that is not active, and only for
// that tool" is the one claim here that is security-relevant.
//
// What it cannot cover: the deploy itself. Uploading to the dispatch namespace
// and calling the preview script needs Cloudflare credentials and both workers
// deployed — see the probe script for that shape.
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
const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1 });

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

// Bundle the middleware together with @ganju/db and @ganju/utils, and take all
// three out of the same bundle. Importing the packages separately would hand
// drizzle two copies of every table object — different module instances mean
// different symbols, and the query builder silently stops recognising them.
const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ganju-verify-'));
const outfile = path.join(bundleDir, 'auth.mjs');
const root = new URL('..', import.meta.url).pathname;
const entry = path.join(root, `.verify-entry-${process.pid}.ts`);

fs.writeFileSync(
  entry,
  `export { ToolAuthMiddleware } from ${JSON.stringify(path.join(root, 'apps/tool-broker/src/middleware/auth'))};\n` +
    `export { db } from '@ganju/db';\n` +
    `export { utils } from '@ganju/utils';\n`
);

await esbuild.build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  absWorkingDir: root,
  tsconfig: path.join(root, 'apps/tool-broker/tsconfig.json'),
  banner: {
    js: "import { createRequire as __cr } from 'node:module';\nconst require = __cr(import.meta.url);"
  },
  logLevel: 'error'
});

const { ToolAuthMiddleware, utils } = await import(outfile);

const SECRET = 'verify-secret-'.padEnd(48, 'x');

// tokens — no database needed, so this runs before anything is scaffolded

console.log('\npreview tokens\n');

const live = await utils.mintCustomCodeToken(
  { artifactId: 'a1', versionId: 'v1' },
  SECRET
);
let payload = await utils.verifyCustomCodeToken(live, SECRET);
check('a live token verifies', !!payload);
check('  ...and is not marked preview', payload?.preview === undefined);
check(
  '  ...and carries no expiry — the version check is its lifetime',
  payload?.exp === undefined
);

const preview = await utils.mintCustomCodeToken(
  { artifactId: 'a1', versionId: 'v1', preview: true, ttlMs: 60_000 },
  SECRET
);
payload = await utils.verifyCustomCodeToken(preview, SECRET);
check('a preview token verifies', !!payload);
check('  ...and is marked preview', payload?.preview === true);
check('  ...and carries an expiry', typeof payload?.exp === 'number');

const now = Date.now();
const shortLived = await utils.mintCustomCodeToken(
  { artifactId: 'a1', versionId: 'v1', preview: true, ttlMs: 1_000 },
  SECRET,
  now
);
// `exp` is in seconds, so the guarantee is a floor with a second of slack above
// it: valid for at least the TTL, certainly expired a second past it. Asserting
// anything tighter would be asserting where `now` happened to fall inside its
// own second, which is how this check flaked when it was first written.
check(
  'a preview token is valid for at least its TTL',
  !!(await utils.verifyCustomCodeToken(shortLived, SECRET, now + 500))
);
check(
  'a preview token is refused once the TTL is past',
  (await utils.verifyCustomCodeToken(shortLived, SECRET, now + 2_500)) === null
);
check(
  'a token signed with another secret is refused',
  (await utils.verifyCustomCodeToken(preview, `${SECRET}!`)) === null
);
// The preview flag is inside the signed payload, so flipping it means forging.
const [body] = preview.split('.');
const decoded = JSON.parse(Buffer.from(body, 'base64url').toString());
const forged = `${Buffer.from(JSON.stringify({ ...decoded, preview: true, exp: undefined })).toString('base64url')}.${preview.split('.')[1]}`;
check(
  'a payload edited to claim preview no longer verifies',
  (await utils.verifyCustomCodeToken(forged, SECRET)) === null
);

check(
  'the legacy preview name is the legacy live name plus a suffix',
  utils.customCodePreviewScriptName('abc') ===
    `${utils.customCodeScriptName('abc')}_preview`,
  utils.customCodePreviewScriptName('abc')
);

// The naming rule the whole redeploy fix rests on: a minted name is never the
// name of an earlier upload, and never exceeds what Cloudflare accepts.
const ARTIFACT = '0199c0de-1234-7890-abcd-ef0123456789';
const minted = Array.from({ length: 200 }, () =>
  utils.customCodeUploadName(ARTIFACT)
);

check(
  'every minted upload name is unique',
  new Set(minted).size === minted.length,
  `${new Set(minted).size} distinct of ${minted.length}`
);

check(
  'a minted name is the artifact name plus a hex suffix',
  minted.every(name =>
    new RegExp(`^${utils.customCodeScriptName(ARTIFACT)}_[0-9a-f]{12}$`).test(
      name
    )
  ),
  minted[0]
);

// 63 is the ceiling Cloudflare enforces on a Worker name, and `artifact_<uuid>`
// already spends 45 of it. A preview name spends eight more on `_preview`, so
// the two suffixes are deliberately different lengths — this is the check that
// keeps a future prefix change from silently producing a name that is refused.
const previewMinted = utils.customCodePreviewUploadName(ARTIFACT);

check(
  'a minted live name fits inside the 63-character ceiling',
  minted[0].length === 58 && minted[0].length <= 63,
  `${minted[0].length} chars`
);

check(
  'a minted preview name fits too, with a shorter suffix',
  previewMinted.length === 62 &&
    new RegExp(
      `^${utils.customCodePreviewScriptName(ARTIFACT)}_[0-9a-f]{8}$`
    ).test(previewMinted),
  `${previewMinted.length} chars — ${previewMinted}`
);

console.log('\nschema validation — what the panel reports\n');

const SCHEMA = {
  type: 'object',
  properties: {
    orderId: { type: 'string', minLength: 3 },
    count: { type: 'number', minimum: 1 }
  },
  required: ['orderId']
};

check(
  'a valid input has no violations',
  utils.validateAgainstJsonSchema(SCHEMA, { orderId: 'abc' }).length === 0
);
let violations = utils.validateAgainstJsonSchema(SCHEMA, {});
check('a missing required field is a violation', violations.length === 1);
check(
  '  ...named by path, so the panel can point at the field',
  violations[0]?.path === 'orderId',
  violations[0]?.path
);
check(
  'a wrong type is a violation',
  utils.validateAgainstJsonSchema(SCHEMA, { orderId: 123 }).length === 1
);
check(
  'a constraint below the minimum is a violation',
  utils.validateAgainstJsonSchema(SCHEMA, { orderId: 'abc', count: 0 })
    .length === 1
);
check(
  'an extra key is allowed — the schema does not forbid it',
  utils.validateAgainstJsonSchema(SCHEMA, { orderId: 'abc', extra: 1 })
    .length === 0
);
check(
  'an empty schema accepts anything',
  utils.validateAgainstJsonSchema(
    { type: 'object', properties: {} },
    { whatever: true }
  ).length === 0
);

console.log('\nallowedTools — the config the boot loop filters on\n');

const CONFIG = utils.Schema.CUSTOM_CODE_CONFIG;
check(
  'absent allowedTools parses',
  CONFIG.safeParse({}).success && CONFIG.parse({}).allowedTools === undefined
);
check('a list parses', CONFIG.safeParse({ allowedTools: ['a', 'b'] }).success);
check(
  'an empty list parses — it means all of them',
  CONFIG.safeParse({ allowedTools: [] }).success
);
check(
  'a list past the tool cap is refused',
  !CONFIG.safeParse({
    allowedTools: Array.from(
      { length: utils.constants.CUSTOM_CODE_MAX_TOOLS + 1 },
      (_, i) => `t${i}`
    )
  }).success
);

// The rule apps/mcp applies, restated here so a change to either side shows up
// as a failure rather than as tools quietly appearing or vanishing.
const exposed = (allowedTools, names) => {
  const allow =
    allowedTools && allowedTools.length > 0 ? new Set(allowedTools) : null;
  return names.filter(name => !allow || allow.has(name));
};

check(
  'absent means every tool is exposed',
  exposed(undefined, ['a', 'b']).join() === 'a,b'
);
check(
  'empty means every tool is exposed',
  exposed([], ['a', 'b']).join() === 'a,b'
);
check(
  'a subset exposes only the subset',
  exposed(['a'], ['a', 'b']).join() === 'a'
);
check(
  'a name the manifest no longer declares is simply never matched',
  exposed(['a', 'gone'], ['a', 'b']).join() === 'a'
);

// scaffold

const [owner] =
  await sql`select id from "user" order by created_at asc limit 1`;
if (!owner) throw new Error('No user in this database to own the scaffold');

const orgId = uuid();
const projectId = uuid();
const artifactId = uuid();
const otherArtifactId = uuid();
const toolId = uuid();
const otherToolId = uuid();
const activeVersionId = uuid();
const draftVersionId = uuid();
const foreignVersionId = uuid();
const stamp = Date.now();

console.log(`\nScaffolding org ${orgId}\n`);

await sql`insert into organization ${sql({ id: orgId, name: 'verify-custom-code-testing', owner_id: owner.id })}`;
await sql`insert into subscription ${sql({ id: uuid(), organization_id: orgId, plan: 'PRO', status: 'active' })}`;
await sql`insert into project ${sql({ id: projectId, name: 'verify', created_by_id: owner.id, organization_id: orgId })}`;
await sql`insert into artifact ${sql({ id: artifactId, slug: `verify-testing-${stamp}`, project_id: projectId })}`;
await sql`insert into artifact ${sql({ id: otherArtifactId, slug: `verify-testing-other-${stamp}`, project_id: projectId })}`;

const manifest = JSON.stringify([
  { name: 'lookup-order', inputSchema: { type: 'object', properties: {} } }
]);

await sql`insert into artifact_tool ${sql({
  id: toolId,
  artifact_id: artifactId,
  tool_key: 'custom-code',
  config: JSON.stringify({ activeVersionId })
})}`;
await sql`insert into artifact_tool ${sql({
  id: otherToolId,
  artifact_id: otherArtifactId,
  tool_key: 'custom-code',
  config: JSON.stringify({ activeVersionId: null })
})}`;
for (const [id, artifactToolId, version, status] of [
  [activeVersionId, toolId, 1, 'published'],
  [draftVersionId, toolId, 2, 'draft'],
  [foreignVersionId, otherToolId, 1, 'draft']
]) {
  await sql`insert into artifact_tool_version ${sql({
    id,
    artifact_tool_id: artifactToolId,
    version,
    status,
    tools: manifest
  })}`;
}

// A Hono-shaped context carrying only what the middleware reads.
const contextFor = token => {
  let status = 200;
  let body = null;
  const store = new Map();
  return {
    result: () => ({ status, body, tool: store.get('tool') }),
    ctx: {
      env: {
        CUSTOM_CODE_TOKEN_SECRET: SECRET,
        HYPERDRIVE: { connectionString: DATABASE_URL }
      },
      req: {
        header: name =>
          name === 'Authorization' ? `Bearer ${token}` : undefined
      },
      json: (value, code = 200) => {
        status = code;
        body = value;
        return value;
      },
      set: (key, value) => store.set(key, value),
      get: key => store.get(key)
    }
  };
};

const authorize = async token => {
  const { ctx, result } = contextFor(token);
  let reached = false;
  await ToolAuthMiddleware.verify(ctx, async () => {
    reached = true;
  });
  return { reached, ...result() };
};

try {
  console.log('\nbroker auth\n');

  const liveActive = await utils.mintCustomCodeToken(
    { artifactId, versionId: activeVersionId },
    SECRET
  );
  let out = await authorize(liveActive);
  check('a live token for the active version is accepted', out.reached);

  const liveStale = await utils.mintCustomCodeToken(
    { artifactId, versionId: draftVersionId },
    SECRET
  );
  out = await authorize(liveStale);
  check(
    'a live token for a version that is not active is refused',
    !out.reached && out.status === 401
  );

  const previewDraft = await utils.mintCustomCodeToken(
    { artifactId, versionId: draftVersionId, preview: true, ttlMs: 60_000 },
    SECRET
  );
  out = await authorize(previewDraft);
  check(
    'a preview token for a draft of this tool is accepted',
    out.reached,
    out.body ? JSON.stringify(out.body) : ''
  );
  check(
    '  ...and names the version it was minted for',
    out.tool?.versionId === draftVersionId
  );

  const previewForeign = await utils.mintCustomCodeToken(
    { artifactId, versionId: foreignVersionId, preview: true, ttlMs: 60_000 },
    SECRET
  );
  out = await authorize(previewForeign);
  check(
    "a preview token naming another tool's version is refused",
    !out.reached && out.status === 401
  );

  const previewUnknown = await utils.mintCustomCodeToken(
    { artifactId, versionId: uuid(), preview: true, ttlMs: 60_000 },
    SECRET
  );
  out = await authorize(previewUnknown);
  check(
    'a preview token naming a version that does not exist is refused',
    !out.reached && out.status === 401
  );

  const previewExpired = await utils.mintCustomCodeToken(
    { artifactId, versionId: draftVersionId, preview: true, ttlMs: 1_000 },
    SECRET,
    Date.now() - 60_000
  );
  out = await authorize(previewExpired);
  check(
    'an expired preview token is refused',
    !out.reached && out.status === 401
  );

  out = await authorize('not-a-token');
  check('a malformed token is refused', !out.reached && out.status === 401);

  // Every rejection has to look the same from inside the isolate: a script that
  // guesses must not be able to tell which check it failed.
  const bodies = await Promise.all(
    [liveStale, previewForeign, previewExpired, 'not-a-token'].map(async t =>
      JSON.stringify((await authorize(t)).body)
    )
  );
  check(
    'every rejection is the same opaque 401',
    new Set(bodies).size === 1,
    bodies[0]
  );
} finally {
  console.log('\nCleaning up\n');
  await sql`delete from artifact_tool_version where artifact_tool_id in (${toolId}, ${otherToolId})`;
  await sql`delete from artifact_tool where id in (${toolId}, ${otherToolId})`;
  await sql`delete from artifact where id in (${artifactId}, ${otherArtifactId})`;
  await sql`delete from project where id = ${projectId}`;
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
