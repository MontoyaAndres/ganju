// Compares our project data meters with what Cloudflare's Durable Objects
// analytics counted for the same databases. Read only: Postgres selects and
// Cloudflare GraphQL reads, nothing is written anywhere.
//
//   node scripts/reconcile-data-usage.mjs                       # dev  (.env)
//   node scripts/reconcile-data-usage.mjs --prod                # prod (.env.prod)
//   node scripts/reconcile-data-usage.mjs --org <organization-id>
//   node scripts/reconcile-data-usage.mjs --from 2026-10-10T20:32:27Z [--to <ISO>]
//   node scripts/reconcile-data-usage.mjs --tolerance 5         # percent, default 1
//   node scripts/reconcile-data-usage.mjs --token-env NAME      # token from $NAME
//
// Matching: Cloudflare reports each object's `name`, the string we pass to
// idFromName, which is artifact_database.object_name. So every Cloudflare
// object maps to its database row, and through it to the organization.
//
// Per organization, the window is the period its counters belong to: the
// current one (message_period_start to now) by default, or with --from the
// period that contains it (closed ones from usage_period). Our counters are
// per period, not per hour, so a window that doesn't line up with a period is
// shown but not judged. Rows read and written are compared (requests are shown);
// Cloudflare has no per-object storage, so storage is compared for the whole
// namespace only (our latest size_bytes vs its latest storedBytes), in the
// totals section, which runs over the current month (or --from/--to) and is
// skipped with --org.
//
// Exits 1 when a compared value is off by more than the tolerance.
//
// The token needs "Account Analytics: Read" for GraphQL and "Workers Scripts:
// Read" to find the namespace (or pass --namespace <id>). It is read from
// --token-env NAME, then CF_ANALYTICS_TOKEN, then CUSTOM_CODE_CF_API_TOKEN, in
// the environment or the env file.
import fs from 'node:fs';
import postgres from 'postgres';

const args = process.argv.slice(2);
const has = flag => args.includes(flag);
const value = flag => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};

const isProd = has('--prod');
const orgFilter = value('--org');
const fromArg = value('--from');
const toArg = value('--to');
const tolerance = Number(value('--tolerance') ?? 1);
const tokenEnv = value('--token-env');
const namespaceArg = value('--namespace');

const parseDate = (raw, flag) => {
  if (raw === undefined) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    console.error(
      `${flag} "${raw}" isn't a date; use ISO, e.g. 2026-11-01T00:00:00Z.`
    );
    process.exit(1);
  }
  return date;
};
const from = parseDate(fromArg, '--from');
const to = parseDate(toArg, '--to');
if (!Number.isFinite(tolerance) || tolerance < 0) {
  console.error('--tolerance takes a percentage, e.g. 1 or 2.5.');
  process.exit(1);
}
if (toArg && !fromArg) {
  console.error('--to needs --from.');
  process.exit(1);
}

const envFile = isProd ? '../.env.prod' : '../.env';
const env = fs.readFileSync(new URL(envFile, import.meta.url), 'utf8');
const read = key => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();
const fromEnv = key => process.env[key]?.trim() || read(key);

const accountId = read('CLOUDFLARE_ACCOUNT_ID');
const tokenSource =
  tokenEnv ??
  (fromEnv('CF_ANALYTICS_TOKEN')
    ? 'CF_ANALYTICS_TOKEN'
    : 'CUSTOM_CODE_CF_API_TOKEN');
const token = fromEnv(tokenSource);
if (!accountId || !token) {
  console.error(
    `Missing ${!accountId ? 'CLOUDFLARE_ACCOUNT_ID' : tokenSource} (${envFile.slice(3)} or environment).`
  );
  process.exit(1);
}

const script = isProd ? 'ganju-data-production' : 'ganju-data-development';
const CLASS = 'ProjectDatabase';
const HOUR = 3_600_000;
// Cloudflare caps one query at 32 days; we ask for 31 at a time.
const MAX_WINDOW = 31 * 24 * HOUR;

const authHint = `The token (${tokenSource}) was refused. It needs "Account Analytics: Read" on this account; pass another with --token-env NAME or CF_ANALYTICS_TOKEN.`;

const cf = async (path, init) => {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    }
  });
  const body = await res.json().catch(() => ({}));
  return { res, body };
};

const findNamespace = async () => {
  if (namespaceArg) return namespaceArg;
  const { res, body } = await cf(
    `/accounts/${accountId}/workers/durable_objects/namespaces?per_page=1000`
  );
  if (!res.ok || !body.success) {
    console.error(
      `Couldn't list Durable Object namespaces (HTTP ${res.status}). The token needs "Workers Scripts: Read", or pass --namespace <id>.`
    );
    process.exit(1);
  }
  const ns = body.result.find(n => n.script === script && n.class === CLASS);
  if (!ns) {
    console.error(`No ${CLASS} namespace for ${script} on this account.`);
    process.exit(1);
  }
  return ns.id;
};

const graphql = async (query, variables) => {
  const { res, body } = await cf('/graphql', {
    method: 'POST',
    body: JSON.stringify({ query, variables })
  });
  if (res.status === 401 || res.status === 403) {
    console.error(authHint);
    process.exit(1);
  }
  if (body.errors?.length) {
    const text = body.errors.map(e => e.message).join('; ');
    if (/auth|permission|access/i.test(text)) console.error(authHint);
    else console.error(`Cloudflare GraphQL error: ${text}`);
    process.exit(1);
  }
  return body.data.viewer.accounts[0];
};

const iso = date => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

const QUERY = `query($account: String!, $ns: String!, $from: Time!, $to: Time!) {
  viewer { accounts(filter: { accountTag: $account }) {
    rows: durableObjectsPeriodicGroups(limit: 10000, filter: {
      namespaceId: $ns, datetime_geq: $from, datetime_lt: $to
    }) { dimensions { name objectId } sum { rowsRead rowsWritten } }
    calls: durableObjectsInvocationsAdaptiveGroups(limit: 10000, filter: {
      namespaceId: $ns, datetime_geq: $from, datetime_lt: $to
    }) { dimensions { name objectId type } sum { requests } }
    storage: durableObjectsSqlStorageGroups(limit: 10000, filter: {
      namespaceId: $ns, datetime_geq: $from, datetime_lt: $to
    }, orderBy: [datetimeHour_DESC]) { dimensions { datetimeHour } max { storedBytes } }
  } }
}`;

// Cloudflare's figures for one window, per object name.
const cache = new Map();
const cloudflare = async (ns, start, end) => {
  const key = `${start.getTime()}-${end.getTime()}`;
  if (cache.has(key)) return cache.get(key);
  const objects = new Map();
  const object = (name, objectId) => {
    const k = name || objectId;
    if (!objects.has(k)) {
      objects.set(k, {
        name,
        objectId,
        rowsRead: 0,
        rowsWritten: 0,
        requests: 0,
        alarms: 0
      });
    }
    return objects.get(k);
  };
  let maxStored = 0;
  let latest = null;
  for (let s = start.getTime(); s < end.getTime(); s += MAX_WINDOW) {
    const e = Math.min(s + MAX_WINDOW, end.getTime());
    const data = await graphql(QUERY, {
      account: accountId,
      ns,
      from: iso(new Date(s)),
      to: iso(new Date(e))
    });
    for (const g of data.rows) {
      const o = object(g.dimensions.name, g.dimensions.objectId);
      o.rowsRead += g.sum.rowsRead;
      o.rowsWritten += g.sum.rowsWritten;
    }
    for (const g of data.calls) {
      const o = object(g.dimensions.name, g.dimensions.objectId);
      if (g.dimensions.type === 'alarm') o.alarms += g.sum.requests;
      else o.requests += g.sum.requests;
    }
    for (const g of data.storage) {
      maxStored = Math.max(maxStored, g.max.storedBytes);
      if (!latest || g.dimensions.datetimeHour > latest.hour) {
        latest = { hour: g.dimensions.datetimeHour, bytes: g.max.storedBytes };
      }
    }
  }
  const result = { objects, maxStored, latest };
  cache.set(key, result);
  return result;
};

// Our timestamps are UTC without a zone; read them as UTC, not local time.
const sql = postgres(read('DATABASE_URL'), {
  ssl: 'require',
  max: 1,
  prepare: false
});

const databases = await sql`
  select id, object_name, organization_id, artifact_id, name, status,
         size_bytes::bigint as size_bytes,
         size_checked_at at time zone 'UTC' as size_checked_at
  from artifact_database
  ${orgFilter ? sql`where organization_id = ${orgFilter}` : sql``}
  order by organization_id, created_at`;

const subs = await sql`
  select s.organization_id, o.name as org_name, s.plan,
         s.message_period_start at time zone 'UTC' as message_period_start,
         s.data_rows_read_count::bigint as rows_read,
         s.data_rows_written_count::bigint as rows_written,
         s.data_request_count::bigint as requests,
         s.peak_data_mb::bigint as peak_mb
  from subscription s
  join organization o on o.id = s.organization_id
  where ${orgFilter ? sql`s.organization_id = ${orgFilter}` : sql`s.data_request_count > 0 or s.organization_id in (select organization_id from artifact_database)`}
  order by o.name`;

const closed = await sql`
  select organization_id, plan,
         period_start at time zone 'UTC' as period_start,
         period_end at time zone 'UTC' as period_end,
         data_rows_read_count::bigint as rows_read,
         data_rows_written_count::bigint as rows_written,
         data_request_count::bigint as requests,
         peak_data_mb::bigint as peak_mb
  from usage_period
  where organization_id in ${sql(subs.length ? subs.map(s => s.organization_id) : [''])}
  order by period_start`;

await sql.end();

if (orgFilter && subs.length === 0) {
  console.error(`No subscription row for organization "${orgFilter}".`);
  process.exit(1);
}

const ns = await findNamespace();
const now = new Date();
const n = v => Number(v ?? 0);
const fmt = v => n(v).toLocaleString('en-US');
const mb = bytes => `${(n(bytes) / 1024 / 1024).toFixed(2)} MB`;
const pct = (ours, theirs) => {
  if (ours === theirs) return 0;
  if (theirs === 0) return 100;
  return ((ours - theirs) / theirs) * 100;
};
let failures = 0;
const line = (label, ours, theirs, judged = true) => {
  const d = pct(ours, theirs);
  const off = Math.abs(d) > tolerance;
  if (off && judged) failures++;
  const mark = !judged ? '  --  ' : off ? '  OFF ' : '  ok  ';
  console.log(
    `${mark}${label.padEnd(14)} ours ${fmt(ours).padStart(14)}   cloudflare ${fmt(theirs).padStart(14)}   ${(d >= 0 ? '+' : '') + d.toFixed(2)}%`
  );
};

console.log(`\n  environment   ${isProd ? 'PRODUCTION' : 'development'}`);
console.log(`  namespace     ${ns} (${script} / ${CLASS})`);
console.log(`  tolerance     ${tolerance}%`);

const byName = new Map(databases.map(d => [d.object_name, d]));

// The period an org's counters cover for this run.
const periodFor = sub => {
  const current = sub.message_period_start && {
    start: new Date(sub.message_period_start),
    end: now,
    current: true,
    ...sub
  };
  if (!from) return current;
  const past = closed
    .filter(p => p.organization_id === sub.organization_id)
    .map(p => ({
      ...p,
      start: new Date(p.period_start),
      end: new Date(p.period_end)
    }))
    .find(p => p.start <= from && from < p.end);
  if (past) return past;
  return current && current.start <= from ? current : null;
};

for (const sub of subs) {
  const period = periodFor(sub);
  console.log(`\n  ${sub.org_name} (${sub.organization_id}) — ${sub.plan}`);
  if (!period) {
    console.log('      no counters cover that window');
    continue;
  }
  const start = from ?? period.start;
  const end = to ?? period.end;
  // Our counters are per period: only a window matching it is judged.
  const aligned =
    Math.abs(start - period.start) <= HOUR &&
    Math.abs(end - period.end) <= HOUR;
  console.log(
    `      period ${iso(period.start)} → ${period.current ? 'now' : iso(period.end)}${period.current ? ' (current)' : ' (closed)'}`
  );
  if (!aligned) {
    console.log(
      `      window ${iso(start)} → ${iso(end)} isn't that period, so nothing below is judged`
    );
  }
  if (end - start > 90 * 24 * HOUR || now - start > 90 * 24 * HOUR) {
    console.log(
      '      Cloudflare keeps 90 days; the start of this window is gone'
    );
  }

  const data = await cloudflare(ns, start, end);
  const own = databases.filter(d => d.organization_id === sub.organization_id);
  const totals = { rowsRead: 0, rowsWritten: 0, requests: 0, alarms: 0 };
  console.log(
    `      ${'database'.padEnd(38)} ${'status'.padEnd(9)} ${'rows read'.padStart(12)} ${'written'.padStart(10)} ${'calls'.padStart(7)} ${'alarms'.padStart(7)} ${'size (ours)'.padStart(12)}`
  );
  for (const d of own) {
    const o = data.objects.get(d.object_name) ?? {};
    totals.rowsRead += o.rowsRead ?? 0;
    totals.rowsWritten += o.rowsWritten ?? 0;
    totals.requests += o.requests ?? 0;
    totals.alarms += o.alarms ?? 0;
    console.log(
      `      ${d.name.slice(0, 38).padEnd(38)} ${d.status.padEnd(9)} ${fmt(o.rowsRead).padStart(12)} ${fmt(o.rowsWritten).padStart(10)} ${fmt(o.requests).padStart(7)} ${fmt(o.alarms).padStart(7)} ${mb(d.size_bytes).padStart(12)}`
    );
  }
  if (own.length === 0) console.log('      (no databases)');
  line('rows read', n(period.rows_read), totals.rowsRead, aligned);
  line('rows written', n(period.rows_written), totals.rowsWritten, aligned);
  // Shown, not judged: Cloudflare can serve several RPC calls on one stub as
  // one invocation, so its count runs below ours.
  line('requests', n(period.requests), totals.requests, false);
  const latestBytes = own
    .filter(d => ['READY', 'DELETING'].includes(d.status))
    .reduce((t, d) => t + n(d.size_bytes), 0);
  console.log(
    `      storage   ours latest ${mb(latestBytes)}, peak ${fmt(period.peak_mb)} MB; Cloudflare has no per-object storage`
  );
}

if (!orgFilter) {
  const start =
    from ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = to ?? now;
  const data = await cloudflare(ns, start, end);
  const matched = { rowsRead: 0, rowsWritten: 0, requests: 0, objects: 0 };
  const unmatched = [];
  for (const o of data.objects.values()) {
    if (byName.has(o.name)) {
      matched.rowsRead += o.rowsRead;
      matched.rowsWritten += o.rowsWritten;
      matched.requests += o.requests;
      matched.objects++;
    } else unmatched.push(o);
  }
  console.log(`\n  namespace totals ${iso(start)} → ${iso(end)}`);
  console.log(
    `      ${matched.objects} active objects match a database row: ${fmt(matched.rowsRead)} rows read, ${fmt(matched.rowsWritten)} written, ${fmt(matched.requests)} calls`
  );
  if (unmatched.length) {
    console.log(
      `      ${unmatched.length} active objects have no database row (rows removed, e.g. test scaffolds):`
    );
    for (const o of unmatched) {
      console.log(
        `        ${(o.name || o.objectId).slice(0, 64).padEnd(64)} ${fmt(o.rowsRead).padStart(10)} read ${fmt(o.rowsWritten).padStart(8)} written ${fmt(o.requests).padStart(6)} calls`
      );
    }
  }
  const stored = databases.filter(d =>
    ['READY', 'DELETING'].includes(d.status)
  );
  const ours = stored.reduce((t, d) => t + n(d.size_bytes), 0);
  const oldest = stored
    .map(d => d.size_checked_at)
    .filter(Boolean)
    .sort((a, b) => a - b)[0];
  if (data.latest) {
    console.log(
      `      storage: Cloudflare latest ${mb(data.latest.bytes)} at ${data.latest.hour}, max ${mb(data.maxStored)} in the window`
    );
    console.log(
      `      storage: ours ${mb(ours)} over ${stored.length} stored databases${oldest ? `, oldest reading ${iso(new Date(oldest))}` : ''}`
    );
    line('storage bytes', ours, data.latest.bytes);
  } else {
    console.log('      storage: Cloudflare has no reading in this window');
  }
}

console.log(`
  Notes
  - Both sides read the same cursor rowsRead/rowsWritten, so rows should match
    closely. Cloudflare also counts what our meters never see: the migration
    step on object start, and calls made before every call was metered.
    Periods that started before that deploy won't match.
  - Alarm work is reported with the next call, so a little lag is expected;
    Cloudflare's own data also trails real time by a few minutes.
  - "calls" are Cloudflare's RPC invocations (alarms shown apart); ours count
    every call, and Cloudflare can serve several as one, so they're not judged.
  - Storage is per namespace only: it includes objects with no row, and our
    size_bytes is as fresh as the last hourly reading.
`);

if (failures) {
  console.log(`  ${failures} value(s) off by more than ${tolerance}%.\n`);
  process.exit(1);
}
console.log('  All compared values within tolerance.\n');
