// Verifies `outputSchema` on http-endpoint tools, driving the REAL executor.
//
//   node scripts/verify-http-endpoint-output.mjs
//
// No database: everything here is the request/response path. The executor is
// TypeScript and imports @ganju/utils, so this bundles it with esbuild first and
// stubs `fetch` to answer whatever each case needs.
//
// What it cannot cover: registration. Whether the MCP SDK accepts the compiled
// schema, and whether the guard in the boot loop fires, needs a running server —
// the guard's condition is restated at the bottom so a change to either side
// shows up here rather than as a protocol failure in front of a customer.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import esbuild from 'esbuild';

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
const outfile = path.join(bundleDir, 'endpoint.mjs');
const root = new URL('..', import.meta.url).pathname;
const entry = path.join(root, `.verify-entry-${process.pid}.ts`);

fs.writeFileSync(
  entry,
  `export { executeHttpEndpoint } from ${JSON.stringify(path.join(root, 'apps/mcp/src/tools/httpEndpoint'))};\n` +
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
  tsconfig: path.join(root, 'apps/mcp/tsconfig.json'),
  logLevel: 'error'
});

const { executeHttpEndpoint, utils } = await import(outfile);

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: { status: { type: 'string' } }
};

// A config through the real schema, so defaults and transforms are the ones a
// stored row would have.
const configFor = extra =>
  utils.Schema.HTTP_ENDPOINT_CONFIG.parse({
    name: 'lookup-order',
    method: 'GET',
    url: 'https://api.example.com/orders',
    ...extra
  });

const respondWith = (
  body,
  { status = 200, contentType = 'application/json' } = {}
) => {
  globalThis.fetch = async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': contentType }
    });
};

try {
  console.log('\nstructured output\n');

  respondWith({ status: 'shipped' });
  let result = await executeHttpEndpoint(
    configFor({ outputSchema: OUTPUT_SCHEMA }),
    {},
    null
  );
  check(
    'a JSON object comes back as structuredContent',
    !!result.structuredContent
  );
  check(
    '  ...carrying the response',
    result.structuredContent?.status === 'shipped',
    JSON.stringify(result.structuredContent)
  );
  check(
    '  ...and as text too, for a client that reads neither',
    !!result.content[0].text
  );

  respondWith({ status: 'shipped' });
  result = await executeHttpEndpoint(configFor({}), {}, null);
  check(
    'an endpoint that declares nothing gets no structuredContent',
    result.structuredContent === undefined
  );

  respondWith([{ status: 'shipped' }]);
  result = await executeHttpEndpoint(
    configFor({ outputSchema: OUTPUT_SCHEMA }),
    {},
    null
  );
  check(
    'an array is not structuredContent — MCP defines it as an object',
    result.structuredContent === undefined
  );

  respondWith('plain text', { contentType: 'text/plain' });
  result = await executeHttpEndpoint(
    configFor({ outputSchema: OUTPUT_SCHEMA }),
    {},
    null
  );
  check(
    'a text response yields no structuredContent',
    result.structuredContent === undefined
  );

  respondWith({ data: { status: 'shipped' } });
  result = await executeHttpEndpoint(
    configFor({
      outputSchema: OUTPUT_SCHEMA,
      response: { jsonPath: 'data' }
    }),
    {},
    null
  );
  check(
    'jsonPath applies before the structure is taken',
    result.structuredContent?.status === 'shipped',
    JSON.stringify(result.structuredContent)
  );

  console.log('\nfailures are marked as failures\n');

  respondWith({ error: 'nope' }, { status: 500 });
  result = await executeHttpEndpoint(
    configFor({ outputSchema: OUTPUT_SCHEMA }),
    {},
    null
  );
  check('an HTTP failure is isError', result.isError === true);
  check(
    '  ...and says what happened',
    result.content[0].text.startsWith('Error: HTTP 500')
  );

  respondWith({ other: 1 });
  result = await executeHttpEndpoint(
    configFor({
      outputSchema: OUTPUT_SCHEMA,
      response: { jsonPath: 'missing' }
    }),
    {},
    null
  );
  check('a jsonPath that finds nothing is isError', result.isError === true);

  result = await executeHttpEndpoint(
    configFor({
      auth: {
        kind: 'bearer',
        credentialId: '00000000-0000-4000-8000-000000000000'
      }
    }),
    {},
    null
  );
  check('a missing credential is isError', result.isError === true);

  result = await executeHttpEndpoint(
    configFor({ url: 'http://127.0.0.1/admin' }),
    {},
    null
  );
  check('a blocked host is isError', result.isError === true);

  respondWith({ status: 'shipped' });
  result = await executeHttpEndpoint(configFor({}), {}, null);
  check('a success is not isError', result.isError === undefined);

  console.log('\nthe guard the boot loop applies\n');

  // Restated from apps/mcp: a tool that declares an outputSchema must return
  // structuredContent or be marked isError, or the MCP SDK refuses to serialize
  // its own result.
  const trips = r => !!OUTPUT_SCHEMA && !r.structuredContent && !r.isError;

  respondWith({ status: 'shipped' });
  check(
    'an object response does not trip it',
    !trips(
      await executeHttpEndpoint(
        configFor({ outputSchema: OUTPUT_SCHEMA }),
        {},
        null
      )
    )
  );
  respondWith('plain text', { contentType: 'text/plain' });
  check(
    'a text response trips it — reported as a tool error, not a protocol one',
    trips(
      await executeHttpEndpoint(
        configFor({ outputSchema: OUTPUT_SCHEMA }),
        {},
        null
      )
    )
  );
  respondWith({ error: 'nope' }, { status: 500 });
  check(
    'an HTTP failure does not trip it — isError already explains itself',
    !trips(
      await executeHttpEndpoint(
        configFor({ outputSchema: OUTPUT_SCHEMA }),
        {},
        null
      )
    )
  );

  console.log('\nthe stored shape\n');

  const S = utils.Schema.HTTP_ENDPOINT_CONFIG;
  check(
    'outputSchema is optional',
    S.safeParse({ name: 'a', method: 'GET', url: 'https://x.test' }).success
  );
  check(
    'a valid one parses',
    S.safeParse({
      name: 'a',
      method: 'GET',
      url: 'https://x.test',
      outputSchema: OUTPUT_SCHEMA
    }).success
  );
  // The read shape stays permissive on principle; the rule lives on the write
  // path, exactly where the reserved-name rule does.
  check(
    'the read shape accepts a non-object one',
    S.safeParse({
      name: 'a',
      method: 'GET',
      url: 'https://x.test',
      outputSchema: { type: 'string' }
    }).success
  );
  const W = utils.Schema.HTTP_ENDPOINT_CONFIG_WRITE;
  let r = W.safeParse({
    name: 'a',
    method: 'GET',
    url: 'https://x.test',
    outputSchema: { type: 'string' }
  });
  check('the write path refuses a non-object one', !r.success);
  check(
    '  ...with a message that maps to a 400 and translates',
    r.error?.issues[0]?.message ===
      utils.constants.OUTPUT_SCHEMA_NOT_OBJECT_MESSAGE,
    r.error?.issues[0]?.message
  );
  check(
    '  ...pointing at the field',
    r.error?.issues[0]?.path.join('.') === 'outputSchema.type',
    r.error?.issues[0]?.path.join('.')
  );
  check(
    'the write path accepts an object one',
    W.safeParse({
      name: 'a',
      method: 'GET',
      url: 'https://x.test',
      outputSchema: OUTPUT_SCHEMA
    }).success
  );
  check(
    'the same rule applies to a custom-code manifest',
    !utils.Schema.CUSTOM_CODE_MANIFEST.safeParse({
      tools: [{ name: 'a', outputSchema: { type: 'string' } }]
    }).success
  );
  check(
    'the message translates in es',
    utils.localizeZodIssue(
      { message: utils.constants.OUTPUT_SCHEMA_NOT_OBJECT_MESSAGE },
      utils.constants.LANGUAGE_ES
    ).message !== utils.constants.OUTPUT_SCHEMA_NOT_OBJECT_MESSAGE
  );
  check(
    'a stored row without one still parses — every endpoint predates this',
    S.parse({ name: 'a', method: 'GET', url: 'https://x.test' })
      .outputSchema === undefined
  );
} finally {
  fs.rmSync(bundleDir, { recursive: true, force: true });
  fs.rmSync(entry, { force: true });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
