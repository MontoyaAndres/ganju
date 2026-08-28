import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { CliError } from '../errors.js';
import { color, note, success } from '../output.js';
import {
  PROJECT_FILE,
  findProject,
  writeProjectFile,
  type ProjectFile
} from '../project.js';

const EXAMPLE_TOOL = 'lookup-order';
const EXAMPLE_ENTRY = 'src/lookupOrder.js';

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

const projectFile = (name: string): ProjectFile => ({
  artifact: name,
  // Scaffolded empty rather than omitted: the runtime refusal for an undeclared
  // provider names the field to add, and someone who has never seen it has
  // nowhere obvious to put it.
  connections: [],
  allowedHosts: [],
  tools: [
    {
      name: EXAMPLE_TOOL,
      title: 'Look up order',
      description:
        'Find an order by its id. Use when the customer gives an order number.',
      entry: EXAMPLE_ENTRY,
      input: {
        type: 'object',
        properties: { orderId: { type: 'string' } },
        required: ['orderId']
      },
      output: {
        type: 'object',
        properties: { status: { type: 'string' } }
      }
    }
  ]
});

/**
 * `ganju init` — write a project that deploys as-is.
 *
 * Scaffolding a working tool rather than an empty file, because the first thing
 * anyone does with a new project is run the next command, and a scaffold that
 * cannot be deployed makes that step fail for reasons that have nothing to do
 * with their code.
 */
export const init = async (target?: string): Promise<void> => {
  const root = target ? join(process.cwd(), target) : process.cwd();

  const existing = await findProject(root).catch(() => null);
  if (existing && dirname(existing.path) === root) {
    throw new CliError(`${existing.path} already exists`, {
      hint: 'Delete it first, or run `ganju init` somewhere else.'
    });
  }

  await mkdir(join(root, 'src'), { recursive: true });
  await writeProjectFile(join(root, PROJECT_FILE), projectFile(basename(root)));
  await writeFile(join(root, EXAMPLE_ENTRY), handlerSource, {
    flag: 'wx'
  }).catch((error: NodeJS.ErrnoException) => {
    // An existing handler is someone's code. Leaving it alone and saying so
    // beats overwriting it and mentioning that afterwards.
    if (error.code !== 'EEXIST') throw error;
    note(color.yellow(`! kept the existing ${EXAMPLE_ENTRY}`));
  });

  success(`created ${PROJECT_FILE} and ${EXAMPLE_ENTRY}`);
  note('');
  note(`  ${color.gray('1.')} ganju login`);
  note(
    `  ${color.gray('2.')} ganju link          ${color.gray('# pick the project this deploys to')}`
  );
  note(`  ${color.gray('3.')} ganju deploy`);
};
