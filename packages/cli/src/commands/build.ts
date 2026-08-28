import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { bundleProject } from '../bundle.js';
import { color, formatBytes, note, step, success } from '../output.js';
import { loadProject, readTools } from '../project.js';

export const OUTPUT_DIR = '.ganju';
export const OUTPUT_FILE = 'bundle.js';

/**
 * `ganju build` — compile and minify the project, and write it where it can be
 * looked at.
 *
 * `deploy` bundles for itself rather than reading this file, so that what gets
 * published is always the current source and never a stale artifact someone
 * built before their last edit. What this command is for is the two things
 * looking at the bundle answers: how big it is, and whether it compiles — the
 * second being worth its own command in CI, where failing on a build is much
 * cheaper than failing on a deploy.
 */
export const build = async (flags: { minify?: boolean }): Promise<void> => {
  const project = await loadProject();
  const tools = readTools(project);
  const minify = flags.minify ?? true;

  step(`bundling ${tools.length} ${tools.length === 1 ? 'tool' : 'tools'}`);

  const result = await bundleProject(project, tools, { minify });

  const directory = join(project.root, OUTPUT_DIR);
  const path = join(directory, OUTPUT_FILE);
  await mkdir(directory, { recursive: true });
  await writeFile(path, result.code);

  const saving =
    minify && result.rawBytes > result.bytes
      ? ` ${color.gray(`(from ${formatBytes(result.rawBytes)})`)}`
      : '';

  success(
    `${formatBytes(result.bytes)}${saving} → ${relative(process.cwd(), path) || path}`
  );
  note(color.gray(`  entry: ${result.entryDescription}`));
  note(
    color.gray(
      '  the SDK is not bundled — it is attached beside your script on deploy'
    )
  );
};
