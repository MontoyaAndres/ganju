// Measures search-resources against a golden set: queries whose right answer is
// known, run through a real MCP server, scored by where the right uri lands.
//
//   node scripts/eval-resource-search.mjs scripts/resource-search-golden.example.json
//   node scripts/eval-resource-search.mjs golden.json --out after.json --baseline before.json
//   node scripts/eval-resource-search.mjs golden.json --prod
//
// The golden file names the artifact slug and the cases:
//
//   { "slug": "acme-support",
//     "cases": [
//       { "query": "ORD-48213", "expect": "https://acme.com/orders", "kind": "exact" },
//       { "query": "can I return a gift?", "expect": ["file://refunds.pdf"], "kind": "semantic" } ] }
//
// `expect` is one uri or several (any of them counts). `kind` splits the report,
// because the two kinds fail differently: an exact token (order id, SKU, error
// code) should land in the top 3, and a paraphrase must not get worse than it
// was before the change being measured.
//
// --out writes the per-case ranks; --baseline compares against an earlier --out
// and lists every case that moved, so "semantic queries did not get worse" is
// a list you can read rather than an average that can hide one bad regression.
//
// Talks to the server with MCP_INTERNAL_SECRET from .env (.env.prod with
// --prod), at NEXT_PUBLIC_MCP_URL unless EVAL_MCP_URL overrides it. Read-only:
// search-resources writes nothing but its own usage row.
import fs from 'node:fs';

const args = process.argv.slice(2);
const flag = name => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const flagValues = new Set(['--out', '--baseline'].map(flag));
const goldenPath = args.find(a => !a.startsWith('--') && !flagValues.has(a));
if (!goldenPath) {
  console.error(
    'usage: node scripts/eval-resource-search.mjs <golden.json> [--prod] [--out file] [--baseline file]'
  );
  process.exit(1);
}

const isProd = args.includes('--prod');
const env = fs.readFileSync(
  new URL(isProd ? '../.env.prod' : '../.env', import.meta.url),
  'utf8'
);
// Trailing ` # …` comments carry a variable's alternative value in this .env.
const read = key =>
  env
    .match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]
    ?.replace(/\s+#.*$/, '')
    .trim();

const MCP_URL = (
  process.env.EVAL_MCP_URL ??
  read('NEXT_PUBLIC_MCP_URL') ??
  ''
).replace(/\/+$/, '');
const MCP_SECRET = read('MCP_INTERNAL_SECRET');
if (!MCP_URL || !MCP_SECRET) {
  console.error('Missing NEXT_PUBLIC_MCP_URL / MCP_INTERNAL_SECRET');
  process.exit(1);
}

const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
const LIMIT = 10;

let rpcId = 0;
const searchResources = async query => {
  const res = await fetch(`${MCP_URL}/${golden.slug}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'x-ganju-internal-secret': MCP_SECRET
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++rpcId,
      method: 'tools/call',
      params: { name: 'search-resources', arguments: { query, limit: LIMIT } }
    })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MCP ${res.status}: ${text.slice(0, 300)}`);
  const line = text.split('\n').find(l => l.startsWith('data:'));
  const payload = JSON.parse(line ? line.slice(5).trim() : text);
  if (payload.error)
    throw new Error(`MCP error: ${JSON.stringify(payload.error)}`);
  const body = payload.result?.content?.[0]?.text ?? '';
  try {
    const parsed = JSON.parse(body);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // "No matching resource chunks found." and friends
    return [];
  }
};

const results = [];
for (const testCase of golden.cases) {
  const expected = new Set([testCase.expect].flat());
  const matches = await searchResources(testCase.query);
  const index = matches.findIndex(m => expected.has(m.uri));
  results.push({
    query: testCase.query,
    kind: testCase.kind ?? 'semantic',
    rank: index === -1 ? null : index + 1,
    top: matches.slice(0, 3).map(m => m.uri)
  });
}

const summarize = rows => {
  const n = rows.length || 1;
  const hit = k => rows.filter(r => r.rank !== null && r.rank <= k).length;
  const mrr = rows.reduce((s, r) => s + (r.rank ? 1 / r.rank : 0), 0) / n;
  return `n=${rows.length}  hit@1=${hit(1)}/${rows.length}  hit@3=${hit(3)}/${rows.length}  MRR=${mrr.toFixed(3)}`;
};

console.log(`\n${golden.slug} @ ${MCP_URL}\n`);
for (const r of results) {
  const mark = r.rank === null ? 'MISS' : `#${r.rank}`.padEnd(4);
  console.log(`  ${mark} [${r.kind}] ${r.query}`);
  if (r.rank === null || r.rank > 3)
    console.log(`         top 3: ${r.top.join(', ') || '(none)'}`);
}
console.log('');
for (const kind of [...new Set(results.map(r => r.kind))]) {
  console.log(
    `  ${kind.padEnd(9)} ${summarize(results.filter(r => r.kind === kind))}`
  );
}
console.log(`  ${'all'.padEnd(9)} ${summarize(results)}`);

const exactOutsideTop3 = results.filter(
  r => r.kind === 'exact' && (r.rank === null || r.rank > 3)
);

let regressions = [];
const baselinePath = flag('--baseline');
if (baselinePath) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const before = new Map(baseline.results.map(r => [r.query, r.rank]));
  const worse = (a, b) => (a ?? Infinity) > (b ?? Infinity);
  console.log(`\n  vs ${baselinePath}`);
  for (const r of results) {
    if (!before.has(r.query)) continue;
    const was = before.get(r.query);
    if (was === r.rank) continue;
    const arrow = `${was ?? 'miss'} → ${r.rank ?? 'miss'}`;
    console.log(
      `  ${worse(r.rank, was) ? 'WORSE ' : 'better'} [${r.kind}] ${arrow}  ${r.query}`
    );
    if (worse(r.rank, was) && r.kind !== 'exact') regressions.push(r);
  }
}

const outPath = flag('--out');
if (outPath) {
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      { slug: golden.slug, at: new Date().toISOString(), results },
      null,
      2
    )
  );
  console.log(`\n  wrote ${outPath}`);
}

// Fails on the two conditions that define done: an exact token outside the top
// 3, or a semantic case that ranks worse than the baseline did.
const failed = exactOutsideTop3.length > 0 || regressions.length > 0;
console.log(
  `\n  ${failed ? 'FAIL' : 'PASS'} — ${exactOutsideTop3.length} exact outside top 3, ${regressions.length} semantic regressions\n`
);
process.exit(failed ? 1 : 0);
