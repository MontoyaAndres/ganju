// Drives the Functions tab in a REAL BROWSER, against a locally running
// apps/web + apps/api and the development database.
//
//   npm run dev -w api        # localhost:8080, DISPATCH proxied to the account
//   npm run dev -w web        # localhost:3000
//   node scripts/probe-tools-browser.mjs
//
// Every other check on this feature drives the API, the modules or the deployed
// stack — none of them loads Monaco, so everything that only exists in a browser
// was unverified: whether the editor resolves `./ganju-sdk.js` well enough to
// complete `ctx`, whether the marker pass fires, whether the generated handler
// stub is what the modal claims to write, and whether Deploy from the editor
// reaches the dispatch namespace.
//
// It needs .env: DATABASE_URL, JWT_SECRET (which signs the session cookie),
// CLOUDFLARE_ACCOUNT_ID, CUSTOM_CODE_CF_API_TOKEN.
//
// Scaffolds a throwaway user + PRO organization + project + artifact and removes
// everything it created, including any script left in the dispatch namespace.
import fs from 'node:fs';
import crypto from 'node:crypto';
import postgres from 'postgres';
import { v7 as uuid } from 'uuid';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url).pathname;
const env = fs.readFileSync(root + '.env', 'utf8');
const read = key => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();

const DATABASE_URL = read('DATABASE_URL');
const JWT_SECRET = read('JWT_SECRET');
const ACCOUNT_ID = read('CLOUDFLARE_ACCOUNT_ID');
const CF_TOKEN = read('CUSTOM_CODE_CF_API_TOKEN');
const WEB = process.env.PROBE_WEB_URL || 'http://localhost:3000';
const NAMESPACE = 'ganju-tools-development';

for (const [k, v] of Object.entries({
  DATABASE_URL,
  JWT_SECRET,
  CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
  CUSTOM_CODE_CF_API_TOKEN: CF_TOKEN
})) {
  if (!v) throw new Error(`Missing ${k} in .env`);
}

const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1 });

let pass = 0,
  fail = 0;
const failures = [];
const check = (label, ok, extra = '') => {
  if (ok) {
    pass++;
    console.log(`  ok   ${label}${extra ? ` — ${extra}` : ''}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  FAIL ${label}${extra ? ` — ${extra}` : ''}`);
  }
};
const section = title => console.log(`\n${title}\n`);

// better-call signs a cookie as `${value}.${base64(hmac-sha256(value))}`.
const signCookie = value =>
  encodeURIComponent(
    `${value}.${crypto.createHmac('sha256', JWT_SECRET).update(value).digest('base64')}`
  );

const cf = (path, init) =>
  fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${CF_TOKEN}`, ...(init?.headers ?? {}) }
  });

const userId = uuid(),
  orgId = uuid(),
  projectId = uuid(),
  artifactId = uuid();
const sessionToken = crypto.randomBytes(32).toString('hex');
const slug = `browser-probe-${Date.now().toString(36)}`;
const MAIN = 'file:///index.js';

let browser;
let deployed = false;

const artifactScripts = async () => {
  const res = await cf(
    `/workers/dispatch/namespaces/${NAMESPACE}/scripts?per_page=100`,
    { method: 'GET' }
  );
  const body = await res.json().catch(() => null);
  return (body?.result ?? [])
    .map(e => e.script_name || e.id)
    .filter(name => name && name.startsWith(`artifact_${artifactId}`));
};

try {
  await sql`insert into "user" ${sql({ id: userId, name: 'browser probe', email: `probe-browser-${Date.now()}@example.invalid`, email_verified: true })}`;
  await sql`insert into session ${sql({ id: uuid(), user_id: userId, token: sessionToken, expires_at: new Date(Date.now() + 7200000) })}`;
  await sql`insert into organization ${sql({ id: orgId, name: 'browser-probe', owner_id: userId })}`;
  await sql`insert into organization_user ${sql({ organization_id: orgId, user_id: userId, role: 'ADMIN' })}`;
  await sql`insert into subscription ${sql({ id: uuid(), organization_id: orgId, plan: 'PRO', status: 'active' })}`;
  await sql`insert into project ${sql({ id: projectId, name: 'probe', created_by_id: userId, organization_id: orgId })}`;
  await sql`insert into project_user ${sql({ project_id: projectId, user_id: userId, role: 'ADMIN' })}`;
  await sql`insert into artifact ${sql({ id: artifactId, slug, project_id: projectId })}`;

  browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1500, height: 950 }
  });
  await ctx.addCookies([
    {
      name: 'better-auth.session_token',
      value: signCookie(sessionToken),
      domain: 'localhost',
      path: '/'
    }
  ]);
  const page = await ctx.newPage();
  const monacoReqs = [];
  page.on('request', r => {
    if (r.url().includes('/monaco/')) monacoReqs.push(r.url());
  });

  const sourceOf = () =>
    page.evaluate(
      u =>
        window.monaco.editor
          .getModels()
          .find(m => m.uri.toString() === u)
          .getValue(),
      MAIN
    );
  const setSource = src =>
    page.evaluate(
      ([u, v]) =>
        window.monaco.editor
          .getModels()
          .find(m => m.uri.toString() === u)
          .setValue(v),
      [MAIN, src]
    );
  const completionsAfter = needle =>
    page.evaluate(
      async ([u, n]) => {
        const model = window.monaco.editor
          .getModels()
          .find(m => m.uri.toString() === u);
        const idx = model.getValue().indexOf(n) + n.length;
        const getWorker =
          await window.monaco.languages.typescript.getJavaScriptWorker();
        const client = await getWorker(model.uri);
        const info = await client.getCompletionsAtPosition(
          model.uri.toString(),
          idx
        );
        return (info?.entries ?? []).map(e => e.name);
      },
      [MAIN, needle]
    );

  // --- 1. the page, the plan, and the tabs -------------------------------
  section('the page, the plan, and the tabs');

  await page.goto(`${WEB}/organization/${orgId}/project/${projectId}/tools`, {
    waitUntil: 'networkidle',
    timeout: 90000
  });
  await page.waitForTimeout(3000);
  const bodyText = await page.locator('body').innerText();

  check('the page renders for a signed session', bodyText.includes('Tools'));
  const order = ['Functions', 'HTTP Endpoints', 'Catalog'].map(t =>
    bodyText.indexOf(t)
  );
  check(
    'tabs in the fixed order Functions · HTTP Endpoints · Catalog',
    order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])),
    order.join(',')
  );
  check(
    'a paid plan lands on Functions',
    bodyText.includes('No functions yet')
  );
  check(
    'the editor is absent before the first function',
    !bodyText.includes('⌘S saves a draft')
  );
  check(
    'Monaco is not fetched by the empty state',
    monacoReqs.length === 0,
    `${monacoReqs.length} requests`
  );

  // --- 2. the first function ---------------------------------------------
  section('the modal writes the manifest entry and the handler stub');

  await page
    .getByRole('button', { name: 'New function', exact: true })
    .last()
    .click();
  await page.waitForTimeout(3500);
  check(
    'Monaco loads from this origin, not a CDN',
    monacoReqs.some(
      u => u.startsWith(WEB) && u.endsWith('/monaco/vs/loader.js')
    )
  );

  await page.getByPlaceholder('lookup-order').fill('lookup-order');
  await page.getByPlaceholder('Look up order').fill('Look up order');
  await page
    .getByPlaceholder(
      'Find an order by its id. Use when the customer gives an order number.'
    )
    .fill('Find an order by its id.');
  await page.evaluate(() => {
    const m = window.monaco.editor
      .getModels()
      .find(x => x.getLanguageId() === 'json');
    m.setValue(
      JSON.stringify(
        {
          type: 'object',
          properties: { orderId: { type: 'string' } },
          required: ['orderId']
        },
        null,
        2
      )
    );
  });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Add function', exact: true }).click();
  await page.waitForTimeout(4000);

  const base = await sourceOf();
  check(
    'the handler is named above the map, not inlined',
    /const lookupOrder = async \(input, ctx\) =>/.test(base)
  );
  check(
    'the map names it, keyed by the tool name',
    base.includes("'lookup-order': defineTool(lookupOrder)")
  );
  check(
    'the @type line carries the input type from the declared schema',
    base.includes('ToolHandler<{ orderId: string }>')
  );
  check(
    'the SDK is imported as the sibling module',
    base.includes("from './ganju-sdk.js'")
  );
  const shell = await page.locator('body').innerText();
  check(
    'the explorer lists index.js as the entry and ganju-sdk.js as attached',
    shell.includes('index.js') &&
      shell.includes('ganju-sdk.js') &&
      shell.includes('attached')
  );
  check('the editor notice names ganju deploy', shell.includes('ganju deploy'));

  // --- 3. completion, from the SDK's real declarations --------------------
  section('completion, from the SDK’s real declarations');

  await setSource(
    base.replace("ctx.log('lookup-order called');", "ctx.\n  ctx.log('x');")
  );
  await page.waitForTimeout(2500);
  const ctxNames = await completionsAfter('  ctx.');
  const wantCtx = ['connection', 'log', 'resources', 'secret', 'sendFile'];
  check(
    'ctx completes every member the SDK declares',
    wantCtx.every(n => ctxNames.includes(n)),
    ctxNames.join(',')
  );
  check(
    'and nothing it does not',
    ctxNames.length === wantCtx.length,
    `${ctxNames.length} entries`
  );

  await setSource(
    base.replace(
      "ctx.log('lookup-order called');",
      "ctx.resources.\n  ctx.log('x');"
    )
  );
  await page.waitForTimeout(2000);
  const resNames = await completionsAfter('  ctx.resources.');
  check(
    'ctx.resources completes all five',
    ['search', 'read', 'list', 'create', 'delete'].every(n =>
      resNames.includes(n)
    ),
    resNames.join(',')
  );

  await setSource(
    base.replace("ctx.log('lookup-order called');", "input.\n  ctx.log('x');")
  );
  await page.waitForTimeout(2000);
  const inputNames = await completionsAfter('  input.');
  check(
    'input completes the property the schema declared',
    inputNames.includes('orderId')
  );
  check('and only that one', inputNames.length === 1, inputNames.join(','));

  // --- 4. the marker pass -------------------------------------------------
  section('the marker pass');

  const bad = base
    .replace(
      "import { createHandler, defineTool } from './ganju-sdk.js';",
      "import { createHandler, defineTool } from './ganju-sdk.js';\nimport dayjs from 'dayjs';"
    )
    .replace(
      "ctx.log('lookup-order called');",
      "require('fs');\n  process.env;\n  eval('1');\n  localStorage.getItem('k');\n  ctx.log('x');"
    );
  await setSource(bad);
  await page.waitForTimeout(2500);
  const markers = await page.evaluate(() =>
    window.monaco.editor
      .getModelMarkers({ owner: 'ganju-runtime' })
      .map(m => m.message)
  );
  check(
    'one marker per forbidden construct',
    markers.length === 5,
    `${markers.length}`
  );
  check(
    'require is refused with its reason',
    markers.some(m => /require\(\) is not available/.test(m))
  );
  check(
    'process is refused with its reason',
    markers.some(m => /process is not available/.test(m))
  );
  check(
    'runtime eval is refused',
    markers.some(m => /Evaluating code at runtime/.test(m))
  );
  check(
    'browser globals are refused',
    markers.some(m => /There is no browser here/.test(m))
  );
  check(
    'a bare import is refused, and names the way around it',
    markers.some(m => /ganju-sdk\.js can be imported/.test(m))
  );

  await setSource(base);
  await page.waitForTimeout(1500);
  const after = await page.evaluate(
    () =>
      window.monaco.editor.getModelMarkers({ owner: 'ganju-runtime' }).length
  );
  check('reverting the source clears every marker', after === 0, `${after}`);

  // --- 5. the explorer's protected entry ----------------------------------
  section('the explorer’s protected entry');

  await page
    .locator('.tools-explorer-tree .tools-explorer-name', {
      hasText: /^index\.js$/
    })
    .first()
    .click({ button: 'right' });
  await page.waitForTimeout(1200);
  const menuState = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).filter(b =>
      /^(Rename|Delete)\b/.test(b.textContent.trim())
    );
    return btns.map(b => ({
      label: b.textContent.trim().replace(/\u2026$/, ''),
      disabled: b.disabled
    }));
  });
  check(
    'Rename is disabled on index.js',
    menuState.some(b => b.label === 'Rename' && b.disabled),
    JSON.stringify(menuState)
  );
  check(
    'Delete is disabled on index.js',
    menuState.some(b => b.label === 'Delete' && b.disabled)
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // --- 6. deploy, end to end ----------------------------------------------
  section('deploy, from the editor to the dispatch namespace');

  await page
    .getByRole('button', { name: 'Deploy', exact: true })
    .first()
    .click();
  await page.waitForSelector('text=/v\\d+ deployed/', { timeout: 180000 });
  deployed = true;
  await page.waitForTimeout(2500);

  const [tool] =
    await sql`select id, config from artifact_tool where artifact_id = ${artifactId} and tool_key = 'custom-code'`;
  check('a custom-code install exists', !!tool);
  const versions =
    await sql`select id, version, status, script_name, source_kind, tools from artifact_tool_version where artifact_tool_id = ${tool?.id ?? null}`;
  const published = versions.filter(v => v.status === 'published');
  check(
    'exactly one published version',
    published.length === 1,
    `${versions.length} versions`
  );
  check(
    'activeVersionId points at it',
    tool?.config?.activeVersionId === published[0]?.id
  );
  check(
    'the version carries a minted script_name',
    /^artifact_[0-9a-f-]+_[0-9a-f]{12}$/.test(published[0]?.script_name ?? ''),
    published[0]?.script_name
  );
  check(
    'the source is stored as editor-authored',
    published[0]?.source_kind === 'editor',
    published[0]?.source_kind
  );
  check(
    'the manifest holds the declared tool',
    published[0]?.tools?.[0]?.name === 'lookup-order'
  );

  const live = await artifactScripts();
  check(
    'the script is in the dispatch namespace',
    live.includes(published[0]?.script_name),
    live.join(',')
  );

  // --- 7. the settings dialog ---------------------------------------------
  section('the settings dialog');

  await page
    .getByRole('button', { name: 'Settings', exact: true })
    .first()
    .click();
  await page.waitForTimeout(2500);
  const dialog = await page.locator('[role="dialog"]').innerText();
  check(
    'capabilities and secrets are both present',
    dialog.includes('Secrets') &&
      dialog.includes('Allowed hosts') &&
      dialog.includes('Resource access')
  );
  check('secrets carry their own add control', dialog.includes('Add secret'));
  check(
    'the capabilities half saves behind one button',
    /\bSave\b/.test(dialog)
  );
  check(
    'a provider can be declared before it is connected',
    dialog.includes('Declaring a provider you have not connected is allowed')
  );

  await page.getByLabel('Allowed hosts').fill('api.acme.com');
  await page.getByLabel('Timeout (ms)').fill('12000');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(3500);

  const [saved] =
    await sql`select config from artifact_tool where id = ${tool.id}`;
  check(
    'allowedHosts reached the row',
    JSON.stringify(saved?.config?.allowedHosts ?? []) ===
      JSON.stringify(['api.acme.com']),
    JSON.stringify(saved?.config?.allowedHosts)
  );
  check(
    'timeoutMs reached the row',
    saved?.config?.timeoutMs === 12000,
    String(saved?.config?.timeoutMs)
  );
  check(
    'the config edit preserved activeVersionId',
    saved?.config?.activeVersionId === published[0]?.id
  );
} catch (error) {
  fail++;
  failures.push(`threw: ${error.message}`);
  console.error('\n  THREW', error);
} finally {
  section('cleanup');
  if (browser) await browser.close();
  if (deployed) {
    for (const name of await artifactScripts()) {
      const del = await cf(
        `/workers/dispatch/namespaces/${NAMESPACE}/scripts/${name}?force=true`,
        { method: 'DELETE' }
      );
      console.log(`  removed ${name} (HTTP ${del.status})`);
    }
  }
  await sql`delete from organization where id = ${orgId}`;
  await sql`delete from "user" where id = ${userId}`;
  const [orphan] =
    await sql`select count(*)::int as n from artifact where id = ${artifactId}`;
  console.log(`  rows removed (artifact rows left: ${orphan.n})`);
  await sql.end();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) console.log('failures:\n  - ' + failures.join('\n  - '));
  process.exit(fail ? 1 : 0);
}
