// Drives a dead OAuth credential through the DEPLOYED development MCP worker:
// the refresh the token endpoint refuses has to flag the credential, so the
// Tools page shows it as expired instead of "Connected" while every call
// fails.
//
//   node scripts/probe-credential-reauth.mjs
//
// It needs .env: DATABASE_URL, JWT_SECRET (which signs the session cookie),
// MCP_INTERNAL_SECRET. Development only — it writes credentials the real
// token endpoints will refuse.
//
// Scaffolds a throwaway user + organization + project + artifact with a
// Gmail and an Outlook credential whose access token expired two hours ago
// and whose refresh token is made up (stored unencrypted, which the workers
// read as is), and a Google Calendar credential still in date as the control.
// Google and Microsoft answer a made-up refresh token with a 400; which code
// they send is printed. Removes everything it created.
//
// Not driven here: a 4xx without a reauth code inside the hour (the real
// endpoints don't send one on demand) — utils' oauthRefresh tests cover it.
import fs from 'node:fs';
import crypto from 'node:crypto';
import postgres from 'postgres';
import { v7 as uuid } from 'uuid';

const root = new URL('..', import.meta.url).pathname;
const env = fs.readFileSync(root + '.env', 'utf8');
const read = key => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();

const DATABASE_URL = read('DATABASE_URL');
const JWT_SECRET = read('JWT_SECRET');
const MCP_SECRET = read('MCP_INTERNAL_SECRET');
for (const [k, v] of Object.entries({
  DATABASE_URL,
  JWT_SECRET,
  MCP_INTERNAL_SECRET: MCP_SECRET
})) {
  if (!v) throw new Error(`Missing ${k} in .env`);
}

const API = 'https://development-api.vocesqueabrazan.com';
const MCP_ORIGIN = 'https://development-mcp.vocesqueabrazan.com';

const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1, prepare: false });

let pass = 0;
let fail = 0;
const failures = [];
const check = (label, ok, extra = '') => {
  if (ok) pass++;
  else {
    fail++;
    failures.push(label);
  }
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ` — ${extra}` : ''}`
  );
};
const section = title => console.log(`\n${title}\n`);

const signCookie = value => {
  const sig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(value)
    .digest('base64');
  return encodeURIComponent(`${value}.${sig}`);
};

const stamp = Date.now().toString(36);
const userId = uuid();
const orgId = uuid();
const projectId = uuid();
const artifactId = uuid();
const slug = `probe-reauth-${stamp}`;
const sessionToken = crypto.randomBytes(32).toString('base64url');
const signed = signCookie(sessionToken);
const cookie = `__Secure-better-auth.session_token=${signed}; better-auth.session_token=${signed}`;

const api = async (path, init = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      cookie,
      origin: API,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers || {})
    }
  });
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body };
};

let rpcId = 0;
const rpc = async (method, params) => {
  const res = await fetch(`${MCP_ORIGIN}/${slug}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'x-ganju-internal-secret': MCP_SECRET
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++rpcId,
      method,
      ...(params ? { params } : {})
    })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MCP ${res.status}: ${text.slice(0, 300)}`);
  const line = text.split('\n').find(l => l.startsWith('data:'));
  const payload = JSON.parse(line ? line.slice(5).trim() : text);
  if (payload.error)
    throw new Error(`MCP error: ${JSON.stringify(payload.error)}`);
  return payload.result;
};
const callTool = (name, args = {}) =>
  rpc('tools/call', { name, arguments: args });
const textOf = result =>
  (result?.content || []).map(b => b.text || '').join('\n');

const base = `/organization/${orgId}/project/${projectId}/artifact`;
const HOUR = 60 * 60 * 1000;

const credential = (provider, expiresAt) => ({
  id: uuid(),
  provider,
  access_token: `probe-access-${stamp}`,
  refresh_token: `probe-refresh-${stamp}-not-a-real-token`,
  expires_at: expiresAt,
  scopes: null,
  metadata: null,
  artifact_id: artifactId
});
const metadataOf = async id => {
  const [row] =
    await sql`select metadata from artifact_credential where id = ${id}`;
  const m = row?.metadata;
  return typeof m === 'string' ? JSON.parse(m) : m;
};

console.log(`\ndevelopment — scaffolding ${slug} (artifact ${artifactId})\n`);

try {
  await sql`insert into "user" ${sql({ id: userId, name: 'probe reauth', email: `probe-reauth-${stamp}@example.invalid`, email_verified: true })}`;
  await sql`insert into session ${sql({ id: uuid(), user_id: userId, token: sessionToken, expires_at: new Date(Date.now() + HOUR) })}`;
  await sql`insert into organization ${sql({ id: orgId, name: 'probe-credential-reauth', owner_id: userId })}`;
  await sql`insert into organization_user ${sql({ organization_id: orgId, user_id: userId, role: 'ADMIN' })}`;
  await sql`insert into subscription ${sql({
    id: uuid(),
    organization_id: orgId,
    plan: 'PRO',
    status: 'active',
    message_period_start: new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
    )
  })}`;
  await sql`insert into project ${sql({ id: projectId, name: 'probe reauth', created_by_id: userId, organization_id: orgId })}`;
  await sql`insert into project_user ${sql({ user_id: userId, project_id: projectId, role: 'ADMIN' })}`;
  await sql`insert into artifact ${sql({ id: artifactId, slug, project_id: projectId })}`;

  const expired = new Date(Date.now() - 2 * HOUR);
  const gmail = credential('google-gmail', expired);
  const outlook = credential('microsoft-outlook', expired);
  const calendar = credential(
    'google-calendar',
    new Date(Date.now() + 2 * HOUR)
  );
  for (const row of [gmail, outlook, calendar]) {
    await sql`insert into artifact_credential ${sql(row)}`;
  }

  section('tools on the throwaway artifact');
  for (const toolKey of [
    'gmail-list-labels',
    'outlook-list-folders',
    'calendar-list-calendars'
  ]) {
    const res = await api(`${base}/tool`, {
      method: 'POST',
      body: JSON.stringify({ toolKey })
    });
    check(
      `${toolKey} installed`,
      res.status >= 200 && res.status < 300,
      `${res.status}${res.status >= 300 ? ` ${JSON.stringify(res.body).slice(0, 160)}` : ''}`
    );
  }

  section('before: the Tools page reads both dead credentials as connected');
  let list = await api(`${base}/credential`);
  const rows = () => (Array.isArray(list.body) ? list.body : list.body?.data);
  const needsReauth = id =>
    rows()?.find(c => c.id === id)?.metadata?.needsReauth === true;
  check(
    'credential list loads',
    list.status === 200 && Array.isArray(rows()),
    `${list.status}`
  );
  check('Gmail not flagged yet', !needsReauth(gmail.id));
  check('Outlook not flagged yet', !needsReauth(outlook.id));

  section('a tool call on the MCP server refreshes each dead credential');
  await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'probe-credential-reauth', version: '1' }
  });
  for (const [label, cred, tool] of [
    ['Gmail', gmail, 'gmail-list-labels'],
    ['Outlook', outlook, 'outlook-list-folders']
  ]) {
    const text = textOf(await callTool(tool));
    check(
      `${label}: the call says to re-authorize`,
      /needs to be re-authorized/.test(text),
      text.slice(0, 140).replace(/\s+/g, ' ')
    );
    const meta = await metadataOf(cred.id);
    check(
      `${label}: credential flagged in the database`,
      meta?.needsReauth === true,
      `reauthReason=${meta?.reauthReason ?? '—'}`
    );
  }

  section('the control: a credential still in date is left alone');
  const calendarText = textOf(
    await callTool('calendar-list-calendars')
  );
  check(
    'Calendar call does not ask to re-authorize',
    !/needs to be re-authorized/.test(calendarText),
    calendarText.slice(0, 140).replace(/\s+/g, ' ')
  );
  check(
    'Calendar credential not flagged',
    (await metadataOf(calendar.id))?.needsReauth !== true
  );

  section('after: the Tools page reads them as expired');
  list = await api(`${base}/credential`);
  check('Gmail flagged in the credential list', needsReauth(gmail.id));
  check('Outlook flagged in the credential list', needsReauth(outlook.id));
  check(
    'Calendar not flagged in the credential list',
    !needsReauth(calendar.id)
  );

  section('a flagged credential is not refreshed again');
  const before = await metadataOf(gmail.id);
  const again = textOf(await callTool('gmail-list-labels'));
  const afterMeta = await metadataOf(gmail.id);
  check(
    'second Gmail call still says to re-authorize',
    /needs to be re-authorized/.test(again)
  );
  check(
    '  ...and the flag is not rewritten',
    before?.reauthAt === afterMeta?.reauthAt,
    `${before?.reauthAt} → ${afterMeta?.reauthAt}`
  );
} catch (error) {
  fail++;
  failures.push(`threw: ${error.message}`);
  console.error('\n  THREW', error);
} finally {
  section('cleanup');
  const steps = [
    sql`delete from mcp_request where session_id in (select id from mcp_session where artifact_id = ${artifactId})`,
    sql`delete from mcp_session where artifact_id = ${artifactId}`,
    sql`delete from artifact_execution where artifact_id = ${artifactId}`,
    sql`delete from artifact_tool where artifact_id = ${artifactId}`,
    sql`delete from artifact_credential where artifact_id = ${artifactId}`,
    sql`delete from artifact where id = ${artifactId}`,
    sql`delete from project_user where project_id = ${projectId}`,
    sql`delete from project where id = ${projectId}`,
    sql`delete from usage_period where organization_id = ${orgId}`,
    sql`delete from subscription where organization_id = ${orgId}`,
    sql`delete from organization_user where organization_id = ${orgId}`,
    sql`delete from organization where id = ${orgId}`,
    sql`delete from session where user_id = ${userId}`,
    sql`delete from "user" where id = ${userId}`
  ];
  for (const step of steps) {
    try {
      await step;
    } catch (error) {
      console.log(`  could not delete: ${error.message}`);
    }
  }
  const leftovers = [];
  for (const [label, query] of [
    ['user', sql`select count(*)::int as n from "user" where id = ${userId}`],
    [
      'organization',
      sql`select count(*)::int as n from organization where id = ${orgId}`
    ],
    [
      'artifact',
      sql`select count(*)::int as n from artifact where id = ${artifactId}`
    ]
  ]) {
    const [{ n }] = await query;
    if (n) leftovers.push(`${label}: ${n}`);
  }
  if (leftovers.length) {
    fail++;
    failures.push('cleanup left rows behind');
    console.log(`  LEFT OVER — remove by hand: ${leftovers.join(', ')}`);
  } else {
    console.log('  everything the probe created is gone');
  }
  await sql.end().catch(() => {});
  console.log(
    `\n${pass} passed, ${fail} failed${failures.length ? `:\n  - ${failures.join('\n  - ')}` : ''}\n`
  );
  process.exit(fail ? 1 : 0);
}
