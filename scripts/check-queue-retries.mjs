/**
 * Check that `QUEUE_MAX_RETRIES` agrees with the API worker's queue consumers.
 *
 * The queue consumers mark a resource failed only on a job's last delivery,
 * and they work out which delivery is the last from `QUEUE_MAX_RETRIES` in
 * `packages/utils/src/constants.ts`. The queue itself retries as many times as
 * `max_retries` says in `apps/api/wrangler.toml`. Nothing ties the two
 * together, and when they drift apart nothing fails loudly either:
 *
 *   - wrangler retrying more than the constant: a resource is marked failed
 *     while retries are still coming, and a retry that then succeeds flips it
 *     back — the dashboard shows a source broken while it is being fixed;
 *   - wrangler retrying less: the last delivery never counts as final, so a
 *     job that keeps failing leaves its resource PENDING until it goes stale.
 *
 * So this reads every `[[...queues.consumers]]` block in the API worker's
 * wrangler config and checks each one sets `max_retries`, to the constant's
 * value.
 *
 * Usage:
 *   node scripts/check-queue-retries.mjs
 *
 * Exits non-zero on any mismatch or missing value.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONSTANTS = path.join(REPO, 'packages', 'utils', 'src', 'constants.ts');
const WRANGLER = path.join(REPO, 'apps', 'api', 'wrangler.toml');

const constantsSource = await readFile(CONSTANTS, 'utf8');
const declared = constantsSource.match(/^const QUEUE_MAX_RETRIES = (\d+);$/m);
if (!declared) {
  console.error(
    `error ${path.relative(REPO, CONSTANTS)}: no "const QUEUE_MAX_RETRIES = <n>;" found`
  );
  process.exit(1);
}
const expected = Number(declared[1]);

/**
 * Split the TOML into its table headers and the lines under each. Only the
 * consumer tables matter, and their values are flat `key = value` lines, so a
 * line scanner is enough — and keeps this runnable without a TOML parser.
 */
const wranglerSource = await readFile(WRANGLER, 'utf8');
const consumers = [];
let current = null;
wranglerSource.split('\n').forEach((raw, index) => {
  const line = raw.replace(/#.*$/, '').trim();
  const header = line.match(/^\[\[?([^\]]+)\]\]?$/);
  if (header) {
    current = header[1].trim().endsWith('queues.consumers')
      ? { table: header[1].trim(), line: index + 1, values: {} }
      : null;
    if (current) consumers.push(current);
    return;
  }
  const pair = current && line.match(/^(\w+)\s*=\s*(.+)$/);
  if (pair) current.values[pair[1]] = pair[2].replace(/^"|"$/g, '');
});

const errors = [];
for (const consumer of consumers) {
  const where = `${path.relative(REPO, WRANGLER)}:${consumer.line} [[${consumer.table}]] queue "${consumer.values.queue ?? '?'}"`;
  const retries = consumer.values.max_retries;
  if (retries === undefined) {
    errors.push(
      `${where} sets no max_retries (the default may not be ${expected})`
    );
  } else if (Number(retries) !== expected) {
    errors.push(
      `${where} has max_retries = ${retries}, but QUEUE_MAX_RETRIES is ${expected}`
    );
  }
}

if (consumers.length === 0) {
  errors.push(`${path.relative(REPO, WRANGLER)}: no queue consumers found`);
}

for (const error of errors) console.error(`error ${error}`);

console.log(
  `\n${consumers.length} queue consumers · QUEUE_MAX_RETRIES = ${expected} · ${errors.length} errors`
);

process.exit(errors.length ? 1 : 0);
