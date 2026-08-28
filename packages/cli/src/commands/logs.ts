import { commandContext } from '../context.js';
import { CliError } from '../errors.js';
import {
  color,
  formatDuration,
  formatWhen,
  json as printJson,
  note,
  say
} from '../output.js';

interface LogEntry {
  id: string;
  toolName: string | null;
  latencyMs: number | null;
  errorMessage: string | null;
  logs: string[];
  createdAt: string;
}

/**
 * `ganju logs` — what your tools have actually been doing.
 *
 * The rows already existed: apps/mcp records one per call with the tool name,
 * the latency, any error and the `ctx.log` lines the isolate returned with its
 * result. Logs travel back with the result rather than being shipped line by
 * line, which is why they are here at all and why they arrive whole — a call is
 * one entry, never a stream of half of one.
 *
 * Which also means `--follow` is polling, and says so. There is nothing to tail:
 * a row appears when a call finishes.
 */
export const logs = async (flags: {
  tool?: string;
  limit?: number;
  follow?: boolean;
  json?: boolean;
}): Promise<void> => {
  const { api, artifactPath } = await commandContext();
  const limit = flags.limit ?? 20;

  const fetchPage = () =>
    api.request<{ entries: LogEntry[] }>(`${artifactPath}/custom-code/logs`, {
      query: { tool: flags.tool, limit }
    });

  const first = await fetchPage();

  if (flags.json) {
    if (flags.follow) {
      throw new CliError('--follow and --json cannot be combined', {
        hint: 'Poll `ganju logs --json` yourself if you need a stream of objects.'
      });
    }
    printJson(first.entries);
    return;
  }

  if (first.entries.length === 0) {
    note(
      flags.tool
        ? `No calls to ${flags.tool} recorded yet`
        : 'No custom-tool calls recorded yet'
    );
    if (!flags.follow) return;
  }

  // Newest first from the API, because that is the useful order for one page.
  // Printed oldest first, because that is the useful order for a log.
  for (const entry of [...first.entries].reverse()) print(entry);

  if (!flags.follow) return;

  note(color.gray(`\n— watching for new calls, ctrl-c to stop —`));

  const seen = new Set(first.entries.map(entry => entry.id));
  for (;;) {
    await sleep(POLL_INTERVAL_MS);
    const page = await fetchPage();
    const fresh = page.entries.filter(entry => !seen.has(entry.id));
    for (const entry of [...fresh].reverse()) {
      print(entry);
      seen.add(entry.id);
    }
    // The set is bounded by what the page can hold, so it cannot grow without
    // limit over a long watch.
    if (seen.size > limit * 4) {
      const keep = page.entries.map(entry => entry.id);
      seen.clear();
      for (const id of keep) seen.add(id);
    }
  }
};

const POLL_INTERVAL_MS = 3000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const print = (entry: LogEntry): void => {
  const when = color.gray(formatWhen(entry.createdAt));
  const took =
    typeof entry.latencyMs === 'number'
      ? color.gray(` ${formatDuration(entry.latencyMs)}`)
      : '';
  const name = entry.errorMessage
    ? color.red(entry.toolName ?? 'unknown')
    : color.cyan(entry.toolName ?? 'unknown');

  say(`${when}  ${name}${took}`);
  for (const line of entry.logs) say(`  ${color.gray('│')} ${line}`);
  if (entry.errorMessage) say(`  ${color.red('✗')} ${entry.errorMessage}`);
};
