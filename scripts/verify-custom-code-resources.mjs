// Verifies ctx.resources.create against the dev database, driving the REAL
// broker module rather than a re-implementation of its SQL.
//
//   node scripts/verify-custom-code-resources.mjs           # dev  (.env)
//   node scripts/verify-custom-code-resources.mjs --prod    # prod (.env.prod)
//
// The broker's createResource is TypeScript and imports @ganju/db, so this
// bundles it with esbuild first and imports the bundle. Everything else is a
// stub: an R2 bucket that records puts and deletes, and a Hono-shaped context
// carrying nothing but that bucket.
//
// Scaffolds its own throwaway organization → project → artifact rather than
// touching real data, exercises the write paths and every guard, and removes
// everything it created. The scaffold is PRO for the main run and flipped to
// FREE for the quota check, because FREE is the only plan with a raw-storage
// ceiling to hit.
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

// Bundle the real module together with @ganju/db and @ganju/utils, and take all
// three out of the same bundle. Importing the packages separately would hand
// drizzle two copies of every table object — different module instances mean
// different symbols, and the query builder silently stops recognising them.
const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ganju-verify-'));
const outfile = path.join(bundleDir, 'broker.mjs');
const root = new URL('..', import.meta.url).pathname;
// The entry has to sit INSIDE the repo: esbuild resolves `@ganju/*` through
// node_modules from the importing file, and a temp dir elsewhere on disk has no
// path back to the workspace.
const entry = path.join(root, `.verify-entry-${process.pid}.ts`);

fs.writeFileSync(
  entry,
  `export { createResource, deleteResource } from ${JSON.stringify(path.join(root, 'apps/tool-broker/src/utils/createResource'))};
` +
    `export { db } from '@ganju/db';
` +
    `export { utils } from '@ganju/utils';
`
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
  // postgres.js is CommonJS and reaches for node builtins with require(), which
  // an ESM bundle has no binding for. This gives it one.
  banner: {
    js: "import { createRequire as __cr } from 'node:module';\nconst require = __cr(import.meta.url);"
  },
  logLevel: 'error'
});

const { createResource, deleteResource, db, utils } = await import(outfile);

const dbInstance = db.create({
  env: { HYPERDRIVE: { connectionString: DATABASE_URL } }
});

// An R2 stand-in that records what it was asked to do.
const makeBucket = () => {
  const objects = new Map();
  const deleted = [];
  return {
    objects,
    deleted,
    async put(key, bytes) {
      objects.set(key, bytes);
      return { size: bytes.byteLength };
    },
    async get(key) {
      return objects.has(key) ? { body: objects.get(key) } : null;
    },
    async delete(key) {
      deleted.push(key);
      objects.delete(key);
    }
  };
};

let bucket = makeBucket();
const ctx = {
  env: {
    get STORAGE_BUCKET() {
      return bucket;
    }
  }
};

// request schema — no database needed, so it runs before anything is scaffolded

const S = utils.Schema.CUSTOM_CODE_BROKER_RESOURCE_CREATE;
const issueOf = result => result.error?.issues?.[0];

console.log('\nrequest schema\n');

check('text payload accepted', S.safeParse({ title: 'Q3', content: 'x' }).success);
check('bytes payload accepted', S.safeParse({ title: 'Q3', bytes: 'aGk=' }).success);

let r = S.safeParse({ title: 'Q3' });
check(
  'neither payload rejected',
  !r.success &&
    issueOf(r).message === utils.constants.CUSTOM_CODE_RESOURCE_PAYLOAD_MESSAGE,
  issueOf(r)?.message
);
r = S.safeParse({ title: 'Q3', content: 'x', bytes: 'aGk=' });
check('both payloads rejected', !r.success, issueOf(r)?.message);
check(
  'empty content still counts as content',
  S.safeParse({ title: 'Q3', content: '' }).success
);

const textCap = utils.constants.CUSTOM_CODE_MAX_RESOURCE_TEXT_BYTES;
check(
  'text exactly at the cap accepted',
  S.safeParse({ title: 'Big', content: 'a'.repeat(textCap) }).success
);
r = S.safeParse({ title: 'Big', content: 'a'.repeat(textCap + 1) });
check('text one byte over rejected', !r.success, issueOf(r)?.message);
check('  ...issue path names content', issueOf(r)?.path?.join('.') === 'content');

// The cap is on BYTES, so a string that fits by character count can still fail.
check(
  'emoji filling the cap accepted',
  S.safeParse({ title: 'Big', content: '😀'.repeat(textCap / 4) }).success
);
check(
  'emoji one character past the byte cap rejected',
  !S.safeParse({ title: 'Big', content: '😀'.repeat(textCap / 4 + 1) }).success,
  'characters would have fit; bytes do not'
);

const fileCap = utils.constants.CUSTOM_CODE_MAX_RESOURCE_FILE_BYTES;
r = S.safeParse({
  title: 'Big',
  bytes: 'A'.repeat(Math.ceil((fileCap * 4) / 3) + 8)
});
check('bytes over the cap rejected', !r.success, issueOf(r)?.message);
check('  ...issue path names bytes', issueOf(r)?.path?.join('.') === 'bytes');

check(
  'known mime accepted',
  S.safeParse({ title: 'Q3', content: 'x', mimeType: 'application/pdf' }).success
);
check(
  'unknown mime rejected',
  !S.safeParse({ title: 'Q3', content: 'x', mimeType: 'application/x-evil' })
    .success
);
check('empty title rejected', !S.safeParse({ title: '', content: 'x' }).success);

check(
  'create defaults index to false',
  S.safeParse({ title: 'Q3', content: 'x' }).data.index === false,
  'indexing is opt-in, never a side effect of writing a file'
);

const D = utils.Schema.CUSTOM_CODE_BROKER_RESOURCE_DELETE;
check('delete accepts a uri', D.safeParse({ uri: 'resource://q3' }).success);
check('delete rejects an empty uri', !D.safeParse({ uri: '' }).success);
check('delete rejects a missing uri', !D.safeParse({}).success);
check(
  'delete defaults children to false',
  D.safeParse({ uri: 'resource://q3' }).data.children === false,
  'a cascade has to be asked for'
);

const C = utils.Schema.CUSTOM_CODE_CONFIG;
check(
  'a tool config with no resourceAccess reads as own',
  C.safeParse({}).data.resourceAccess ===
    utils.constants.CUSTOM_CODE_RESOURCE_ACCESS_OWN,
  'the floor is what an unmodified tool gets'
);
check(
  'resourceAccess accepts all',
  C.safeParse({ resourceAccess: 'all' }).data.resourceAccess === 'all'
);
check(
  'resourceAccess rejects anything else',
  !C.safeParse({ resourceAccess: 'everything' }).success
);
check(
  'over-long title rejected',
  !S.safeParse({ title: 'a'.repeat(201), content: 'x' }).success
);

for (const message of [
  utils.constants.CUSTOM_CODE_RESOURCE_PAYLOAD_MESSAGE,
  utils.constants.CUSTOM_CODE_RESOURCE_TEXT_TOO_LARGE_MESSAGE,
  utils.constants.CUSTOM_CODE_RESOURCE_FILE_TOO_LARGE_MESSAGE
]) {
  const translated = utils.localizeZodIssue(
    { code: 'custom', message },
    utils.constants.LANGUAGE_ES
  );
  check(`"${message}" translates`, translated !== message, translated);
}

console.log('\nuri derivation and exposure\n');
check(
  'title becomes a resource:// slug',
  utils.resourceUriFromTitle('Q3 Report 2026!') === 'resource://q3-report-2026',
  utils.resourceUriFromTitle('Q3 Report 2026!')
);
check(
  'a script-created resource is addressable by list/read/sendFile',
  utils.isExposedResource({
    sourceType: utils.constants.RESOURCE_SOURCE_TYPE_CUSTOM_CODE,
    parentResourceId: null
  })
);

// scaffold

const [owner] = await sql`select id from "user" order by created_at asc limit 1`;
if (!owner) throw new Error('No user in this database to own the scaffold');

const orgId = uuid();
const projectId = uuid();
const artifactId = uuid();
const slug = `verify-resources-${Date.now()}`;

console.log(`\nScaffolding org ${orgId}\n`);

await sql`insert into organization ${sql({ id: orgId, name: 'verify-custom-code-resources', owner_id: owner.id })}`;
await sql`insert into subscription ${sql({ id: uuid(), organization_id: orgId, plan: 'PRO', status: 'active' })}`;
await sql`insert into project ${sql({ id: projectId, name: 'verify', created_by_id: owner.id, organization_id: orgId })}`;
await sql`insert into artifact ${sql({ id: artifactId, slug, project_id: projectId })}`;

const resourceRows = async uri =>
  sql`select * from artifact_resource where artifact_id = ${artifactId} and uri = ${uri}`;
// Insert a row the way the rest of the platform does — the counter moves with
// it. Without this the fixture would be quietly inconsistent, and the
// greatest(0, …) floors in the delete path would mask an off-by-one instead of
// letting the checks below catch one.
const insertRow = async values => {
  await sql`insert into artifact_resource ${sql(values)}`;
  await sql`update artifact set artifact_resource_count = artifact_resource_count + 1 where id = ${artifactId}`;
  return values.id;
};

const resourceCount = async () =>
  (await sql`select artifact_resource_count from artifact where id = ${artifactId}`)[0]
    .artifact_resource_count;

// Defaults match a tool that declared nothing: the safe floor, with a queue
// binding present. Individual checks override.
const OWN = 'own';
const ALL = 'all';

const run = (request, { access = OWN, canIndex = true } = {}) =>
  createResource(ctx, dbInstance, { artifactId, request, access, canIndex });

const remove = (uri, { children = false, access = OWN } = {}) =>
  deleteResource(ctx, dbInstance, { artifactId, uri, children, access });

try {
  console.log('text resources\n');

  let result = await run({ title: 'Q3 report', content: 'first draft' });
  check('text create succeeds', result.ok);
  check('  ...reports created', result.ok && result.resource.created === true);
  check(
    '  ...uri derived from the title',
    result.ok && result.resource.uri === 'resource://q3-report',
    result.ok ? result.resource.uri : result.error
  );

  let rows = await resourceRows('resource://q3-report');
  check('  ...one row written', rows.length === 1);
  check(
    '  ...carries the custom-code source type',
    rows[0]?.source_type === utils.constants.RESOURCE_SOURCE_TYPE_CUSTOM_CODE,
    rows[0]?.source_type
  );
  check(
    '  ...written COMPLETED, not PENDING',
    rows[0]?.status === utils.constants.STATUS_COMPLETED,
    `${rows[0]?.status} (nothing will index it, so PENDING would look stuck forever)`
  );
  check('  ...content stored inline', rows[0]?.content === 'first draft');
  check('  ...no file key', rows[0]?.file_key === null);
  check(
    '  ...size is the utf-8 byte length',
    Number(rows[0]?.size) === 11,
    String(rows[0]?.size)
  );
  check('  ...artifact count incremented', (await resourceCount()) === 1);

  // no chunks: this is the "not indexed" promise
  const chunks = await sql`select count(*)::int as n from artifact_resource_chunk where resource_id = ${rows[0].id}`;
  check('  ...no chunks written (not indexed)', chunks[0].n === 0);

  console.log('\nreplacing what a script created\n');

  result = await run({ title: 'Q3 report', content: 'second draft, longer' });
  check('same uri succeeds', result.ok);
  check('  ...reports replaced', result.ok && result.resource.created === false);
  rows = await resourceRows('resource://q3-report');
  check('  ...still one row', rows.length === 1, `${rows.length} row(s)`);
  check('  ...content updated', rows[0]?.content === 'second draft, longer');
  check('  ...size updated', Number(rows[0]?.size) === 20, String(rows[0]?.size));
  check(
    '  ...artifact count NOT incremented again',
    (await resourceCount()) === 1,
    String(await resourceCount())
  );

  console.log('\nbyte resources\n');

  const pdf = Buffer.from('%PDF-1.4 pretend bytes');
  result = await run({
    title: 'Invoice',
    bytes: pdf.toString('base64'),
    mimeType: 'application/pdf',
    fileName: 'invoice.pdf'
  });
  check('bytes create succeeds', result.ok, result.ok ? '' : result.error);
  rows = await resourceRows('resource://invoice');
  const firstKey = rows[0]?.file_key;
  check('  ...file key written', !!firstKey);
  check('  ...object landed in storage', bucket.objects.has(firstKey));
  check(
    '  ...stored bytes match',
    Buffer.from(bucket.objects.get(firstKey)).equals(pdf)
  );
  check(
    '  ...size is the decoded length',
    Number(rows[0]?.size) === pdf.byteLength,
    String(rows[0]?.size)
  );
  check('  ...no inline content', rows[0]?.content === null);
  check(
    '  ...key sits under the artifact prefix',
    firstKey.startsWith(`organizations/${orgId}/projects/${projectId}/resources/${artifactId}/`),
    firstKey
  );
  check(
    '  ...filename survives into the key',
    firstKey.includes('invoice'),
    firstKey
  );

  const pdf2 = Buffer.from('%PDF-1.4 replacement');
  result = await run({
    title: 'Invoice',
    bytes: pdf2.toString('base64'),
    mimeType: 'application/pdf',
    fileName: 'invoice.pdf'
  });
  rows = await resourceRows('resource://invoice');
  check('replacing a file resource succeeds', result.ok);
  check('  ...still one row', rows.length === 1);
  check('  ...points at a new object', rows[0]?.file_key !== firstKey);
  check(
    '  ...the superseded object was deleted',
    bucket.deleted.includes(firstKey),
    bucket.deleted.join(', ') || 'nothing deleted'
  );
  check(
    '  ...and only after the row moved off it',
    !bucket.objects.has(firstKey) && bucket.objects.has(rows[0].file_key)
  );

  console.log('\nprovenance — what a script may NOT replace\n');

  const uploadedId = uuid();
  await insertRow({
    id: uploadedId,
    title: 'Contract',
    uri: 'resource://contract',
    mime_type: 'application/pdf',
    source_type: utils.constants.RESOURCE_SOURCE_TYPE_FILE,
    content: 'the customer document',
    artifact_id: artifactId
  });

  result = await run({ title: 'Contract', content: 'overwritten by a tool' });
  check('an uploaded resource is refused', !result.ok);
  check('  ...with 409', !result.ok && result.status === 409, String(result.status));
  check(
    '  ...and the message names the fix',
    !result.ok &&
      result.error === utils.constants.CUSTOM_CODE_RESOURCE_NOT_OWNED_MESSAGE
  );
  rows = await resourceRows('resource://contract');
  check(
    '  ...the document is untouched',
    rows.length === 1 && rows[0].content === 'the customer document'
  );

  // A real crawl, in the shape the crawler actually produces: a seed carrying no
  // content, the page at that same url indexed beneath it — sharing the seed's
  // uri — and further pages on uris of their own.
  const seedId = uuid();
  await insertRow({
    id: seedId,
    title: 'acme.com',
    uri: 'https://acme.com',
    mime_type: 'text/plain',
    source_type: utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE,
    child_resource_count: 2,
    artifact_id: artifactId
  });
  const homeId = uuid();
  await insertRow({
    id: homeId,
    title: 'Home',
    uri: 'https://acme.com',
    mime_type: 'text/plain',
    source_type: utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE,
    parent_resource_id: seedId,
    content: 'crawled home',
    artifact_id: artifactId
  });
  const pageId = uuid();
  await insertRow({
    id: pageId,
    title: 'Pricing',
    uri: 'https://acme.com/pricing',
    mime_type: 'text/plain',
    source_type: utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE,
    parent_resource_id: seedId,
    content: 'crawled page',
    artifact_id: artifactId
  });

  result = await run({
    title: 'Home',
    uri: 'https://acme.com',
    content: 'overwritten'
  });
  check('a crawled uri is refused', !result.ok && result.status === 409);
  rows = await resourceRows('https://acme.com');
  check(
    '  ...both rows at that uri survive',
    rows.length === 2 &&
      rows.every(r => r.source_type === utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE),
    'the seed and its page share a uri; neither belongs to the script'
  );

  console.log('\nexplicit uris\n');

  result = await run({
    title: 'Daily numbers',
    uri: 'resource://daily/2026-08-20',
    content: '42'
  });
  check(
    'an explicit uri is used verbatim',
    result.ok && result.resource.uri === 'resource://daily/2026-08-20',
    result.ok ? result.resource.uri : result.error
  );

  console.log('\ndeleting\n');

  let deleteResult = await remove('resource://daily/2026-08-20');
  check('deleting a script-created resource succeeds', deleteResult.ok);
  check(
    '  ...reports deleted',
    deleteResult.ok && deleteResult.resource.deleted === true
  );
  check(
    '  ...the row is gone',
    (await resourceRows('resource://daily/2026-08-20')).length === 0
  );

  const countAfterDelete = await resourceCount();
  deleteResult = await remove('resource://daily/2026-08-20');
  check('deleting it again succeeds', deleteResult.ok);
  check(
    '  ...reports nothing was there',
    deleteResult.ok && deleteResult.resource.deleted === false,
    'idempotent — a cleanup that runs twice must not fail the second time'
  );
  check(
    '  ...and did NOT decrement the counter a second time',
    (await resourceCount()) === countAfterDelete,
    String(await resourceCount())
  );

  deleteResult = await remove('resource://never-existed');
  check(
    'deleting a uri that never existed succeeds',
    deleteResult.ok && deleteResult.resource.deleted === false
  );

  // the file path: the stored object has to go with the row
  const doomed = Buffer.from('%PDF-1.4 temporary');
  await run({
    title: 'Scratch',
    bytes: doomed.toString('base64'),
    mimeType: 'application/pdf'
  });
  const doomedKey = (await resourceRows('resource://scratch'))[0].file_key;
  check('a file resource was created to delete', bucket.objects.has(doomedKey));
  deleteResult = await remove('resource://scratch');
  check('deleting a file resource succeeds', deleteResult.ok);
  check(
    '  ...the stored object went with it',
    !bucket.objects.has(doomedKey) && bucket.deleted.includes(doomedKey)
  );

  console.log('\nprovenance — what a script may NOT delete\n');

  deleteResult = await remove('resource://contract');
  check('an uploaded resource is refused', !deleteResult.ok);
  check(
    '  ...with 409',
    !deleteResult.ok && deleteResult.status === 409,
    String(deleteResult.status)
  );
  check(
    '  ...and the message points at the dashboard, not at a different uri',
    !deleteResult.ok &&
      deleteResult.error ===
        utils.constants.CUSTOM_CODE_RESOURCE_NOT_DELETABLE_MESSAGE
  );
  check(
    '  ...the document survives',
    (await resourceRows('resource://contract')).length === 1
  );

  deleteResult = await remove('https://acme.com');
  check('a crawled uri is refused', !deleteResult.ok && deleteResult.status === 409);
  check(
    '  ...the crawl is intact',
    (await resourceRows('https://acme.com')).length === 2 &&
      (await resourceRows('https://acme.com/pricing')).length === 1
  );

  console.log('\nthe counter tracks reality\n');

  const [{ n: actual }] = await sql`select count(*)::int as n from artifact_resource where artifact_id = ${artifactId}`;
  const tracked = await resourceCount();
  check(
    'artifact_resource_count matches the rows that actually exist',
    tracked === actual,
    `counter ${tracked}, rows ${actual}`
  );

  console.log('\ndeclared resource access\n');

  // Everything above ran on the default. `all` is what an owner grants a tool
  // whose job is to prune what someone else put there.
  result = await run(
    { title: 'Contract', content: 'replaced by a tool' },
    { access: ALL }
  );
  check('with access all, an uploaded resource CAN be replaced', result.ok);
  rows = await resourceRows('resource://contract');
  check('  ...content replaced', rows[0]?.content === 'replaced by a tool');
  check(
    '  ...and the row now reads as tool-written',
    rows[0]?.source_type === utils.constants.RESOURCE_SOURCE_TYPE_CUSTOM_CODE,
    'a tool wrote its content, so the marker follows the content'
  );

  console.log('\ncascading delete\n');

  deleteResult = await remove('https://acme.com', { access: ALL });
  check(
    'a parent without children:true is refused',
    !deleteResult.ok && deleteResult.status === 409
  );
  check(
    '  ...naming the flag that means it',
    !deleteResult.ok &&
      deleteResult.error ===
        utils.constants.CUSTOM_CODE_RESOURCE_HAS_CHILDREN_MESSAGE,
    'the FK cascades either way, so this must be said out loud'
  );
  check(
    '  ...and nothing was removed',
    (await resourceRows('https://acme.com')).length === 2
  );

  deleteResult = await remove('https://acme.com', {
    children: true,
    access: OWN
  });
  check(
    'children:true does NOT bypass the access floor',
    !deleteResult.ok &&
      deleteResult.error ===
        utils.constants.CUSTOM_CODE_RESOURCE_NOT_DELETABLE_MESSAGE,
    'a script must not reach a crawled page by naming something above it'
  );

  // Give the crawled page chunks, so the embedded total has something to free.
  const embedding = `[${Array(utils.constants.EMBEDDING_DIMENSIONS).fill(0.01).join(',')}]`;
  const chunkText = 'crawled page chunk contents';
  await sql`insert into artifact_resource_chunk (id, resource_id, artifact_id, chunk_index, content, embedding)
            values (${uuid()}, ${pageId}, ${artifactId}, 0, ${chunkText}, ${embedding}::halfvec)`;
  const chunkBytes = Buffer.byteLength(chunkText);
  await sql`update artifact set artifact_resource_embedded_size = ${chunkBytes} where id = ${artifactId}`;

  const countBeforeCascade = await resourceCount();
  deleteResult = await remove('https://acme.com', {
    children: true,
    access: ALL
  });
  check('with access all and children:true, the crawl goes', deleteResult.ok);
  check(
    '  ...reporting the whole tree',
    deleteResult.ok && deleteResult.resource.count === 3,
    `${deleteResult.ok && deleteResult.resource.count} — seed, its page, and the page below it`
  );
  check(
    '  ...every row gone, including the one on its own uri',
    (await resourceRows('https://acme.com')).length === 0 &&
      (await resourceRows('https://acme.com/pricing')).length === 0
  );
  check(
    '  ...the counter dropped by three, not one',
    (await resourceCount()) === countBeforeCascade - 3,
    `${countBeforeCascade} → ${await resourceCount()}`
  );

  const [{ n: chunksLeft }] = await sql`select count(*)::int as n from artifact_resource_chunk where resource_id = ${pageId}`;
  check('  ...the page\'s chunks cascaded', chunksLeft === 0);
  const [{ e: embeddedAfter }] = await sql`select artifact_resource_embedded_size as e from artifact where id = ${artifactId}`;
  check(
    '  ...and the embedded total came down with them',
    Number(embeddedAfter) === 0,
    `${chunkBytes} → ${embeddedAfter}`
  );

  // A surviving parent has to lose a child from its count.
  const parentId = uuid();
  const childId = uuid();
  await insertRow({
    id: parentId,
    title: 'Folder',
    uri: 'resource://folder',
    mime_type: 'text/plain',
    source_type: utils.constants.RESOURCE_SOURCE_TYPE_GOOGLE_DRIVE_FOLDER,
    child_resource_count: 1,
    artifact_id: artifactId
  });
  await insertRow({
    id: childId,
    title: 'Folder file',
    uri: 'resource://folder/file',
    mime_type: 'text/plain',
    source_type: utils.constants.RESOURCE_SOURCE_TYPE_FILE,
    parent_resource_id: parentId,
    content: 'x',
    artifact_id: artifactId
  });

  deleteResult = await remove('resource://folder/file', { access: ALL });
  check('deleting a child of a surviving parent succeeds', deleteResult.ok);
  const [{ c: childCount }] = await sql`select child_resource_count as c from artifact_resource where id = ${parentId}`;
  check(
    "  ...the parent's child count came down",
    Number(childCount) === 0,
    `1 → ${childCount}`
  );
  check(
    '  ...and the parent itself survived',
    (await resourceRows('resource://folder')).length === 1
  );

  console.log('\nindexing\n');

  result = await run({ title: 'Searchable', content: 'find me' });
  check('by default a resource is not indexed', result.ok);
  check(
    '  ...nothing is queued',
    result.ok && result.indexResourceId === null
  );
  check(
    '  ...and it is written COMPLETED',
    (await resourceRows('resource://searchable'))[0].status ===
      utils.constants.STATUS_COMPLETED
  );

  result = await run({
    title: 'Searchable',
    content: 'find me',
    index: true
  });
  check('index:true succeeds', result.ok, result.ok ? '' : result.error);
  check('  ...reports indexed', result.ok && result.resource.indexed === true);
  rows = await resourceRows('resource://searchable');
  check(
    '  ...queues the row that was just written',
    result.ok && result.indexResourceId === rows[0].id
  );
  check(
    '  ...and the row reads PENDING until the job lands',
    rows[0].status === utils.constants.STATUS_PENDING,
    `${rows[0].status} — COMPLETED would claim a search hit that does not exist yet`
  );

  result = await run(
    { title: 'Searchable', content: 'find me', index: true },
    { canIndex: false }
  );
  check(
    'index:true on a deployment with no queue is refused',
    !result.ok && result.status === 400,
    'better a legible error than a resource that silently never indexes'
  );

  result = await run({
    title: 'Picture',
    bytes: Buffer.from('\x89PNG fake').toString('base64'),
    mimeType: 'image/png',
    index: true
  });
  check(
    'indexing a file no extractor can read is refused',
    !result.ok && result.status === 400,
    !result.ok ? result.error : ''
  );
  check(
    '  ...and the resource was not created',
    (await resourceRows('resource://picture')).length === 0
  );

  // Replacing an indexed resource with an unindexed one must take the chunks.
  const searchableId = (await resourceRows('resource://searchable'))[0].id;
  await sql`insert into artifact_resource_chunk (id, resource_id, artifact_id, chunk_index, content, embedding)
            values (${uuid()}, ${searchableId}, ${artifactId}, 0, ${chunkText}, ${embedding}::halfvec)`;
  await sql`update artifact set artifact_resource_embedded_size = ${chunkBytes} where id = ${artifactId}`;

  result = await run({ title: 'Searchable', content: 'no longer indexed' });
  check('replacing an indexed resource without index succeeds', result.ok);
  const [{ n: staleChunks }] = await sql`select count(*)::int as n from artifact_resource_chunk where resource_id = ${searchableId}`;
  check(
    '  ...the stale chunks were dropped',
    staleChunks === 0,
    'left behind they would keep answering searches with content the row no longer holds'
  );
  const [{ e: embeddedNow }] = await sql`select artifact_resource_embedded_size as e from artifact where id = ${artifactId}`;
  check(
    '  ...and the embedded total was credited back',
    Number(embeddedNow) === 0,
    `${chunkBytes} → ${embeddedNow}`
  );

  console.log('\nstorage quota\n');

  await sql`update subscription set plan = 'FREE' where organization_id = ${orgId}`;
  const freeCap = utils.constants.PLAN_LIMITS.FREE.maxRawStorageBytes;

  // Park the org just under its ceiling with a row the script does not own, so
  // the next write has to trip the quota rather than the provenance guard.
  const ballastId = uuid();
  await insertRow({
    id: ballastId,
    title: 'ballast',
    uri: 'resource://ballast',
    mime_type: 'text/plain',
    source_type: utils.constants.RESOURCE_SOURCE_TYPE_FILE,
    size: freeCap - 10,
    artifact_id: artifactId
  });

  let threw = null;
  try {
    await run({ title: 'Over budget', content: 'x'.repeat(100) });
  } catch (error) {
    threw = error;
  }
  check('a write past the Free ceiling throws', !!threw, threw?.message);
  check(
    '  ...as a plan-limit error (402, not 500)',
    threw && utils.isPlanLimitError(threw) && threw.status === 402,
    threw ? `status ${threw.status}` : ''
  );
  check(
    '  ...and nothing was written',
    (await resourceRows('resource://over-budget')).length === 0
  );

  // Deleting frees the quota, because raw storage is a live sum over `size`
  // rather than a counter something has to remember to decrement. Room is made
  // first, then filled by a script-created resource, so the only thing that
  // changes between the two attempts below is whether that resource exists.
  await sql`update artifact_resource set size = ${freeCap - 2000} where id = ${ballastId}`;
  const bulk = await run({ title: 'Bulk', content: 'y'.repeat(500) });
  check('a scratch resource fits under the ceiling', bulk.ok);

  threw = null;
  try {
    await run({ title: 'Needs room', content: 'z'.repeat(1800) });
  } catch (error) {
    threw = error;
  }
  check('with it present, the next write does not fit', !!threw);

  await remove('resource://bulk');
  threw = null;
  try {
    await run({ title: 'Needs room', content: 'z'.repeat(1800) });
  } catch (error) {
    threw = error;
  }
  check(
    'after deleting it, the identical write fits',
    !threw,
    threw ? threw.message : 'the freed bytes came back'
  );

  // Replacing spends only the delta. Shown by squeezing the headroom below the
  // size of the resource itself: rewriting it in place still fits, while a fresh
  // write of exactly the same bytes does not.
  await sql`update artifact_resource set size = 0 where id = ${ballastId}`;
  await run({ title: 'Q3 report', content: 'x'.repeat(1000) });
  const [{ t: otherBytes }] = await sql`
    select coalesce(sum(size), 0)::bigint as t
    from artifact_resource
    where artifact_id = ${artifactId} and id <> ${ballastId}`;
  await sql`update artifact_resource set size = ${freeCap - Number(otherBytes) - 300} where id = ${ballastId}`;

  result = await run({ title: 'Q3 report', content: 'w'.repeat(1000) });
  check(
    'a same-size replacement fits on 300 bytes of headroom',
    result.ok,
    result.ok ? 'the delta is what is charged, not the total' : result.error
  );

  threw = null;
  try {
    await run({ title: 'Brand new', content: 'w'.repeat(1000) });
  } catch (error) {
    threw = error;
  }
  check(
    '  ...while a NEW resource of those same bytes does not',
    !!threw,
    'which is what makes the line above a delta and not a free pass'
  );

  // Indexing spends a second, separate budget — the expensive one.
  await sql`update artifact_resource set size = 0 where id = ${ballastId}`;
  await sql`update artifact set artifact_resource_embedded_size = ${utils.constants.PLAN_LIMITS.FREE.maxEmbeddedBytes} where id = ${artifactId}`;

  result = await run({ title: 'Unindexed', content: 'plenty of room' });
  check(
    'at the embedded ceiling, an unindexed write still succeeds',
    result.ok,
    'raw storage and embedded content are separate budgets'
  );

  threw = null;
  try {
    await run({ title: 'Indexed', content: 'no room', index: true });
  } catch (error) {
    threw = error;
  }
  check('  ...but an indexed one is refused', !!threw, threw?.message);
  check(
    '  ...as a plan-limit error',
    threw && utils.isPlanLimitError(threw) && threw.status === 402,
    threw ? `feature ${threw.feature}` : ''
  );
  check(
    '  ...and nothing was written',
    (await resourceRows('resource://indexed')).length === 0
  );
} finally {
  console.log('\nCleaning up\n');
  await sql`delete from artifact_resource where artifact_id = ${artifactId}`;
  await sql`delete from artifact where id = ${artifactId}`;
  await sql`delete from project where id = ${projectId}`;
  await sql`delete from subscription where organization_id = ${orgId}`;
  await sql`delete from organization where id = ${orgId}`;
  const leftover = await sql`select count(*)::int as n from organization where id = ${orgId}`;
  check('scaffold removed', leftover[0].n === 0);

  fs.rmSync(bundleDir, { recursive: true, force: true });
  fs.rmSync(entry, { force: true });
  await sql.end();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
