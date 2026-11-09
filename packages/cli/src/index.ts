import { parseArgs } from 'node:util';

import { CliError, isCliError } from './errors.js';
import { color, fail, note, say } from './output.js';
import { build } from './commands/build.js';
import { channel } from './commands/channel.js';
import { data, dataUsage } from './commands/data/index.js';
import { deploy } from './commands/deploy.js';
import { init } from './commands/init.js';
import { link, showLink } from './commands/link.js';
import { login, logout, whoami } from './commands/login.js';
import { logs } from './commands/logs.js';
import { secret } from './commands/secret.js';
import { test } from './commands/test.js';
import { token } from './commands/token.js';
import { rollback, versions } from './commands/versions.js';

/**
 * The whole CLI, dispatched by hand.
 *
 * `node:util`'s `parseArgs` covers the flags, so an argument parser would be a
 * dependency bought for a switch statement — and a CLI is a thing people install
 * before it is useful to them, so every dependency is weight they carry to find
 * out whether they wanted it.
 */

/**
 * Every flag any command takes, in one parser shared by all of them. A flag
 * meaningless to a command (`ganju build --follow`) is accepted and ignored;
 * one that no command defines is an error.
 */
const FLAGS = {
  help: { type: 'boolean', short: 'h' },
  draft: { type: 'boolean' },
  force: { type: 'boolean' },
  // parseArgs has no negation of its own, so the off switch is its own
  // option. Spelled the way people type it.
  'no-minify': { type: 'boolean' },
  strict: { type: 'boolean' },
  json: { type: 'boolean' },
  follow: { type: 'boolean' },
  input: { type: 'string' },
  'input-file': { type: 'string' },
  version: { type: 'string' },
  tool: { type: 'string' },
  limit: { type: 'string' },
  organization: { type: 'string' },
  project: { type: 'string' },
  expires: { type: 'string' },
  status: { type: 'boolean' },
  // ganju data
  name: { type: 'string' },
  yes: { type: 'boolean', short: 'y' },
  confirm: { type: 'string' },
  at: { type: 'string' },
  bookmark: { type: 'string' },
  format: { type: 'string' },
  out: { type: 'string' },
  schema: { type: 'string' },
  // Repeatable: every condition has to hold.
  where: { type: 'string', multiple: true },
  sort: { type: 'string' },
  search: { type: 'string' },
  include: { type: 'string' },
  cursor: { type: 'string' },
  all: { type: 'boolean' },
  replace: { type: 'boolean' },
  'no-wait': { type: 'boolean' },
  'decimal-mark': { type: 'string' },
  map: { type: 'string', multiple: true },
  sheet: { type: 'string' },
  clear: { type: 'boolean' }
} as const;

declare const __GANJU_CLI_VERSION__: string;
const VERSION =
  typeof __GANJU_CLI_VERSION__ === 'string' ? __GANJU_CLI_VERSION__ : 'dev';

const usage = () => {
  say(`${color.bold('ganju')} — write, deploy and debug custom tools, and manage project data

${color.bold('Getting started')}
  ganju init [dir]              scaffold a project that deploys as-is
  ganju login                   sign in on this machine
  ganju link                    point ganju.json at an organization and project
                                (creates it if there is none)

${color.bold('Working on tools')}
  ganju build                   compile and minify, and report the size
  ganju deploy                  build, upload and publish
  ganju test <tool>             run one tool without publishing it
  ganju logs                    what your tools have been doing

${color.bold('Managing what is live')}
  ganju versions                every version, and which one is live
  ganju rollback <version>      put a previously live version back
  ganju secret set|list|rm      the values ctx.secret() reads
  ganju token                   credentials for CI, scoped to this project

${color.bold('Channels')}
  ganju channel templates       WhatsApp message templates and Meta's status

${color.bold('Project data')}
  ganju data                    the project's database: tables, rows, import,
                                export, schema as code (ganju data help)

${color.bold('Other')}
  ganju whoami                  who this machine is signed in as
  ganju logout                  forget the stored token

${color.bold('Flags')}
  -h, --help                    this message, from any command
  --draft                      deploy: save the version without publishing it
  --force                       deploy: replace a live version made in the app
  --no-minify                   build/deploy: keep the bundle readable
  --strict                      build: fail when the tool linter has warnings
  --input '<json>'              test: the arguments to call the tool with
  --input-file <path>           test: the same, from a file
  --version <n|latest|active>   test: run an existing version instead of this code
  --tool <name>                 logs: only this tool
  --limit <n>                   logs: how many entries (default 20)
  --follow                      logs: keep polling for new calls
  --organization / --project    link: skip the prompts
  --expires <days|never>        token create: when it stops working
  --json                        machine-readable output where it makes sense

  data:
  -y, --yes                     go ahead with a drop, delete or rewrite
  --confirm <name>              the database's or table's name, for drops
  --name <name>                 create: the database's name
  --at <ISO time>               restore: a point in time, with its offset
  --bookmark <bookmark>         restore: a bookmark a drop or checkpoint gave
  --format jsonl|csv            export: the file format (default jsonl)
  --out <path>                  export: the folder; import: the refused-rows file
  --schema <file>               table create / schema: the schema file
  --where <condition>           rows: a filter, repeatable (ganju data help)
  --sort <columns>              rows: e.g. -created_at,name
  --search <text>               rows: full-text search
  --include <relations>         rows/get: relation columns to expand
  --limit <n> / --cursor <c>    rows: page size (max 500) and the next page
  --all                         rows: every page
  --input / --input-file        insert/update/write: the values, as JSON or JSONL
  --version <n>                 update/delete: the row version you read
  --replace                     import: replace every row; create: replace a
                                deleted database
  --no-wait                     column change/rm: don't wait for a table copy
  --decimal-mark . | ,          import: how the file writes decimals
  --map 'Header=column'         import: a header to a column, repeatable
  --sheet <name>                import: which sheet of a spreadsheet (the first
                                if left out)

${color.bold('Environment')}
  GANJU_API_URL                 which deployment to talk to
  GANJU_API_TOKEN               a token for a machine with no browser
                                (ganju token create mints a durable one)
  GANJU_SECRET_VALUE            secret set: the value, kept out of shell history`);
};

/**
 * `--sort -price` the way people type it. parseArgs reads a value that starts
 * with a dash as a flag the value was forgotten for, and refuses it; a value
 * like `-price` or `-5` that names no flag of ours is plainly the value, so
 * it is joined onto its flag before parsing.
 */
const joinDashValues = (args: string[]): string[] => {
  const takesValue = new Set(
    Object.entries(FLAGS)
      .filter(([, option]) => option.type === 'string')
      .map(([name]) => `--${name}`)
  );
  const shorts = new Set(
    Object.values(FLAGS).flatMap(option =>
      'short' in option ? [`-${option.short}`] : []
    )
  );
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (
      takesValue.has(arg) &&
      next !== undefined &&
      next.startsWith('-') &&
      !next.startsWith('--') &&
      !shorts.has(next)
    ) {
      out.push(`${arg}=${next}`);
      i++;
      continue;
    }
    out.push(arg);
  }
  return out;
};

const main = async (argv: string[]): Promise<void> => {
  const [command, ...rest] = argv;

  if (
    !command ||
    command === 'help' ||
    command === '--help' ||
    command === '-h'
  ) {
    usage();
    return;
  }
  if (command === '--version' || command === '-v' || command === 'version') {
    say(VERSION);
    return;
  }

  // Strict, so a flag nobody defined is an error rather than ignored: ignored,
  // `ganju init --help` scaffolded a project in the current directory and
  // `ganju deploy --dry-run` published. Positionals stay open, because they
  // differ per command and each command checks its own.
  let parsed;
  try {
    parsed = parseArgs({
      args: joinDashValues(rest),
      allowPositionals: true,
      strict: true,
      options: FLAGS
    });
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error), {
      hint: 'Run `ganju help` to see the flags each command takes.'
    });
  }
  const { values, positionals } = parsed;

  if (values.help) {
    if (command === 'data') dataUsage();
    else usage();
    return;
  }

  const flag = <T>(name: string): T | undefined =>
    values[name as keyof typeof values] as T | undefined;
  const limit = flag<string>('limit');
  const minify = !flag<boolean>('no-minify');

  switch (command) {
    case 'init':
      return init(positionals[0]);
    case 'login':
      return login();
    case 'logout':
      return logout();
    case 'whoami':
      return whoami();
    case 'link':
      return flag<boolean>('status')
        ? showLink()
        : link({
            organization: flag('organization'),
            project: flag('project')
          });
    case 'build':
      return build({ minify, strict: flag<boolean>('strict') });
    case 'deploy':
      return deploy({
        draft: flag<boolean>('draft'),
        force: flag<boolean>('force'),
        minify
      });
    case 'test':
      return test(positionals[0], {
        input: flag('input'),
        inputFile: flag('input-file'),
        version: flag('version'),
        json: flag('json')
      });
    case 'logs':
      return logs({
        tool: flag('tool'),
        limit: limit ? Number.parseInt(limit, 10) : undefined,
        follow: flag('follow'),
        json: flag('json')
      });
    case 'versions':
      return versions({ json: flag('json') });
    case 'rollback':
      return rollback(positionals[0]);
    case 'secret':
      return secret(positionals);
    case 'token':
      return token(positionals, {
        expires: flag('expires'),
        json: flag('json')
      });
    case 'channel':
      return channel(positionals, { json: flag('json') });
    case 'data':
      return data(positionals, {
        name: flag('name'),
        yes: flag('yes'),
        confirm: flag('confirm'),
        at: flag('at'),
        bookmark: flag('bookmark'),
        format: flag('format'),
        out: flag('out'),
        schema: flag('schema'),
        where: flag('where'),
        sort: flag('sort'),
        limit,
        search: flag('search'),
        include: flag('include'),
        cursor: flag('cursor'),
        all: flag('all'),
        input: flag('input'),
        inputFile: flag('input-file'),
        version: flag('version'),
        json: flag('json'),
        replace: flag('replace'),
        wait: !flag<boolean>('no-wait'),
        decimalMark: flag('decimal-mark'),
        map: flag('map'),
        sheet: flag('sheet'),
        clear: flag('clear')
      });
    default:
      fail(`Unknown command "${command}"`);
      note('Run `ganju help` to see what there is.');
      process.exitCode = 1;
  }
};

main(process.argv.slice(2)).catch((error: unknown) => {
  if (isCliError(error)) {
    fail(error.message);
    if (error.hint) note(`  ${color.gray(error.hint)}`);
    process.exitCode = error.exitCode;
    return;
  }
  // Not a CliError means not something the user did — keep the stack, it is the
  // only thing that will locate the bug.
  fail(error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) note(color.gray(error.stack));
  process.exitCode = 1;
});
