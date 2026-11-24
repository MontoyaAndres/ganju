import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { readAccount } from '../credentials.js';
import { CliError } from '../errors.js';
import { color, note, success, warn } from '../output.js';
import {
  PROJECT_FILE,
  apiUrlFor,
  findProject,
  writeProjectFile,
  type ProjectFile
} from '../project.js';
import { link } from './link.js';

const EXAMPLE_TOOL = 'lookup-order';
const exampleEntry = (ts: boolean) =>
  ts ? 'src/lookupOrder.ts' : 'src/lookupOrder.js';

/**
 * The handler a fresh project starts from.
 *
 * Written against `@ganju/sdk` rather than the deployed `./ganju-sdk.js`, since
 * that is the specifier an editor can resolve locally — the bundler rewrites it
 * to the sibling module at build time, so both names mean the same file.
 */
const handlerSource = `import { defineTool } from '@ganju/sdk';

/**
 * Find an order by its id.
 *
 * \`ctx\` is the host: \`ctx.connection\` for an OAuth token, \`ctx.secret\` for a
 * value you set with \`ganju secret set\`, \`ctx.resources\` for the artifact's
 * knowledge, and \`ctx.sendFile\` to mail or post a file without it passing
 * through here.
 */
export default defineTool(async (input, ctx) => {
  ctx.log(\`looking up \${input.orderId}\`);

  return { status: 'unknown' };
});
`;

const typedHandlerSource = handlerSource
  .replace(
    '/**\n * Find an order',
    `interface Input {
  orderId: string;
}

interface Output {
  status: string;
}

/**
 * Find an order`
  )
  .replace('defineTool(async', 'defineTool<Input, Output>(async');

const packageJson = (name: string) =>
  `${JSON.stringify(
    {
      name,
      private: true,
      type: 'module',
      scripts: { typecheck: 'tsc --noEmit' },
      devDependencies: { '@ganju/sdk': 'latest', typescript: '^7.0.2' }
    },
    null,
    2
  )}\n`;

// Bundler resolution because esbuild does the resolving; skipLibCheck because
// the SDK's types name Workers globals this project doesn't install.
const tsconfigJson = `${JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      lib: ['ES2022', 'WebWorker'],
      strict: true,
      noEmit: true,
      skipLibCheck: true
    },
    include: ['src']
  },
  null,
  2
)}\n`;

const envFile = 'src/env.d.ts';
const envSource =
  "// Gives tsc a file to check until the first tool's file is here.\n";

const projectFile = (
  name: string,
  options: { ts: boolean; empty: boolean }
): ProjectFile => ({
  artifact: name,
  // Scaffolded empty rather than omitted: the runtime refusal for an undeclared
  // provider names the field to add, and someone who has never seen it has
  // nowhere obvious to put it.
  connections: [],
  allowedHosts: [],
  tools: options.empty
    ? []
    : [
        {
          name: EXAMPLE_TOOL,
          title: 'Look up order',
          description:
            'Find an order by its id. Use when the customer gives an order number.',
          entry: exampleEntry(options.ts),
          input: {
            type: 'object',
            properties: {
              orderId: {
                type: 'string',
                description: 'The order number the customer gave.'
              }
            },
            required: ['orderId']
          },
          output: {
            type: 'object',
            properties: { status: { type: 'string' } }
          },
          // A lookup: said so, a confirming channel runs it without asking. The
          // example is the first thing `ganju build` lints, so it passes.
          annotations: { readOnlyHint: true }
        }
      ]
});

/** Writes a file unless one is there already; an existing file is someone's. */
const writeNew = async (path: string, contents: string, label: string) => {
  try {
    await writeFile(path, contents, { flag: 'wx' });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    note(color.yellow(`! kept the existing ${label}`));
    return false;
  }
};

/**
 * `ganju init` — write a project that deploys as-is.
 *
 * Scaffolding a working tool rather than an empty file, because the first thing
 * anyone does with a new project is run the next command, and a scaffold that
 * cannot be deployed makes that step fail for reasons that have nothing to do
 * with their code.
 */
export const init = async (
  target: string | undefined,
  flags: {
    ts?: boolean;
    empty?: boolean;
    organization?: string;
    project?: string;
  } = {}
): Promise<void> => {
  const root = target ? join(process.cwd(), target) : process.cwd();
  const ts = !!flags.ts;
  const empty = !!flags.empty;

  const existing = await findProject(root).catch(() => null);
  if (existing && dirname(existing.path) === root) {
    throw new CliError(`${existing.path} already exists`, {
      hint: 'Delete it first, or run `ganju init` somewhere else.'
    });
  }

  await mkdir(join(root, 'src'), { recursive: true });
  await writeProjectFile(
    join(root, PROJECT_FILE),
    projectFile(basename(root), { ts, empty })
  );
  const written = [PROJECT_FILE];
  if (!empty) {
    const entry = exampleEntry(ts);
    if (
      await writeNew(
        join(root, entry),
        ts ? typedHandlerSource : handlerSource,
        entry
      )
    ) {
      written.push(entry);
    }
  }
  if (ts) {
    if (
      await writeNew(
        join(root, 'package.json'),
        packageJson(basename(root)),
        'package.json'
      )
    ) {
      written.push('package.json');
    }
    if (
      await writeNew(join(root, 'tsconfig.json'), tsconfigJson, 'tsconfig.json')
    ) {
      written.push('tsconfig.json');
    }
    // tsc fails with TS18003 when `include` matches no file.
    if (empty && (await writeNew(join(root, envFile), envSource, envFile))) {
      written.push(envFile);
    }
  }
  success(`created ${written.join(', ')}`);
  warn(
    'allowedHosts is empty, which lets your functions call any public host. List the hosts they call in ganju.json.'
  );

  const signedIn =
    !!process.env.GANJU_API_TOKEN?.trim() ||
    !!(await readAccount(apiUrlFor(null)))?.accessToken;

  let linked = false;
  if (signedIn && (flags.organization || flags.project)) {
    await link(
      { organization: flags.organization, project: flags.project },
      root
    );
    linked = true;
  }

  const steps: Array<[string, string?]> = [];
  if (target) steps.push([`cd ${target}`]);
  if (ts) steps.push(['npm install', 'the SDK types and tsc']);
  if (!signedIn) steps.push(['ganju login']);
  if (!linked) steps.push(['ganju link', 'pick the project this deploys to']);
  if (empty) {
    steps.push([
      'add a tool to ganju.json and its file in src/',
      'build and deploy fail until there is one'
    ]);
  }
  steps.push(['ganju deploy']);

  note('');
  steps.forEach(([command, comment], index) => {
    note(
      `  ${color.gray(`${index + 1}.`)} ${command}` +
        (comment ? `  ${color.gray(`# ${comment}`)}` : '')
    );
  });
};
