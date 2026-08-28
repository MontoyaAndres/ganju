/**
 * Terminal output, with no dependency behind it.
 *
 * A CLI is installed before it is useful, so every dependency is something the
 * user waits for once and carries forever. Colour is eight escape codes and
 * spinners are a character array — neither is worth a package, and neither is
 * worth a package's transitive tree.
 */

// Respect the two conventions that exist for turning colour off, plus the
// obvious one: output that is being piped somewhere is being read by a program.
const useColor =
  process.stdout.isTTY &&
  !process.env.NO_COLOR &&
  process.env.TERM !== 'dumb' &&
  process.env.FORCE_COLOR !== '0';

const wrap = (code: string) => (value: string) =>
  useColor ? `\u001b[${code}m${value}\u001b[0m` : value;

export const color = {
  bold: wrap('1'),
  dim: wrap('2'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
  gray: wrap('90')
};

/** Ordinary output. Goes to stdout, so it can be piped. */
export const say = (message = '') => process.stdout.write(`${message}\n`);

/**
 * Progress, warnings and errors go to stderr so that `ganju logs > file` and
 * `ganju versions --json | jq` carry only the thing that was asked for.
 */
export const note = (message: string) => process.stderr.write(`${message}\n`);

export const step = (message: string) => note(`${color.gray('›')} ${message}`);

export const success = (message: string) =>
  note(`${color.green('✓')} ${message}`);

export const warn = (message: string) =>
  note(`${color.yellow('!')} ${message}`);

export const fail = (message: string) => note(`${color.red('✗')} ${message}`);

export const json = (value: unknown) => say(JSON.stringify(value, null, 2));

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export const formatDuration = (ms: number): string =>
  ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;

export const formatWhen = (value: string | Date): string => {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().replace('T', ' ').slice(0, 19);
};

/**
 * A table that lines up without measuring anything twice.
 *
 * Rows are printed as given — no truncation — because the columns here are
 * version numbers, tool names and timestamps, and a truncated tool name is a
 * name you cannot paste back into the next command.
 */
export const table = (rows: string[][]) => {
  if (rows.length === 0) return;
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, stripAnsi(cell).length);
    });
  }
  for (const row of rows) {
    const line = row
      .map((cell, index) =>
        index === row.length - 1
          ? cell
          : cell + ' '.repeat(widths[index] - stripAnsi(cell).length)
      )
      .join('  ');
    say(line.trimEnd());
  }
};

// Padding has to count printable characters, and a coloured cell carries escape
// codes that are not printed.
const stripAnsi = (value: string) => value.replace(/\u001b\[[0-9;]*m/g, '');
