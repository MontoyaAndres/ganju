import { parseArgs } from 'node:util';

import { isCliError } from './errors.js';
import { color, fail, note, say } from './output.js';
import { build } from './commands/build.js';
import { deploy } from './commands/deploy.js';
import { init } from './commands/init.js';
import { link, showLink } from './commands/link.js';
import { login, logout, whoami } from './commands/login.js';
import { logs } from './commands/logs.js';
import { secret } from './commands/secret.js';
import { test } from './commands/test.js';
import { rollback, versions } from './commands/versions.js';

/**
 * The whole CLI, dispatched by hand.
 *
 * `node:util`'s `parseArgs` covers the flags, so an argument parser would be a
 * dependency bought for a switch statement — and a CLI is a thing people install
 * before it is useful to them, so every dependency is weight they carry to find
 * out whether they wanted it.
 */

declare const __GANJU_CLI_VERSION__: string;
const VERSION =
  typeof __GANJU_CLI_VERSION__ === 'string' ? __GANJU_CLI_VERSION__ : 'dev';

const usage = () => {
  say(`${color.bold('ganju')} — write, deploy and debug custom tools

${color.bold('Getting started')}
  ganju init [dir]              scaffold a project that deploys as-is
  ganju login                   sign in on this machine
  ganju link                    point ganju.json at an organization and project

${color.bold('Working on tools')}
  ganju build                   compile and minify, and report the size
  ganju deploy                  build, upload and publish
  ganju test <tool>             run one tool without publishing it
  ganju logs                    what your tools have been doing

${color.bold('Managing what is live')}
  ganju versions                every version, and which one is live
  ganju rollback <version>      put a previously live version back
  ganju secret set|list|rm      the values ctx.secret() reads

${color.bold('Other')}
  ganju whoami                  who this machine is signed in as
  ganju logout                  forget the stored token

${color.bold('Flags')}
  --draft                       deploy: save the version without publishing it
  --no-minify                   build/deploy: keep the bundle readable
  --input '<json>'              test: the arguments to call the tool with
  --input-file <path>           test: the same, from a file
  --version <n|latest|active>   test: run an existing version instead of this code
  --tool <name>                 logs: only this tool
  --limit <n>                   logs: how many entries (default 20)
  --follow                      logs: keep polling for new calls
  --organization / --project    link: skip the prompts
  --json                        machine-readable output where it makes sense

${color.bold('Environment')}
  GANJU_API_URL                 which deployment to talk to
  GANJU_API_TOKEN               a token for a machine with no browser
  GANJU_SECRET_VALUE            secret set: the value, kept out of shell history`);
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

  // `strict: false` because the positionals differ per command and a shared
  // parser that knew every one of them would be a second place to keep the
  // command list.
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    strict: false,
    options: {
      draft: { type: 'boolean' },
      // parseArgs has no negation of its own, so the off switch is its own
      // option. Spelled the way people type it.
      'no-minify': { type: 'boolean' },
      json: { type: 'boolean' },
      follow: { type: 'boolean' },
      input: { type: 'string' },
      'input-file': { type: 'string' },
      version: { type: 'string' },
      tool: { type: 'string' },
      limit: { type: 'string' },
      organization: { type: 'string' },
      project: { type: 'string' },
      status: { type: 'boolean' }
    }
  });

  const flag = <T>(name: string): T | undefined =>
    values[name] as T | undefined;
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
      return build({ minify });
    case 'deploy':
      return deploy({ draft: flag<boolean>('draft'), minify });
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
