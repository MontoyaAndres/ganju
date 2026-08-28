import { access } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { build, type BuildOptions, type Plugin } from 'esbuild';
import * as constants from '@ganju/utils/cliConstants';

import { CliError } from './errors.js';
import { formatBytes } from './output.js';
import type { LoadedProject, ProjectTool } from './project.js';

/**
 * Turn a project into the single module the dispatcher runs.
 *
 * A deployed script is one ES module plus the SDK beside it, so bundling is not
 * an optimisation here — it is the step that makes more than one source file
 * possible at all. Minifying is the optimisation, and it is on by default
 * because the thing being made smaller is a Worker that cold-starts on every
 * call nobody has made recently.
 */

/**
 * Whatever the author imported the SDK as, the deployed script imports it as the
 * sibling module the publish pipeline attaches — so it is marked external and
 * rewritten to that specifier rather than bundled in.
 *
 * Bundling it would work and would be wrong twice: the module travels with every
 * upload regardless, so a copy inside the bundle is dead weight; and the SDK is
 * typed sugar over host bindings, so a version frozen into a customer's bundle
 * is a version that stops matching the broker it talks to.
 */
const externalSdk: Plugin = {
  name: 'ganju-sdk-external',
  setup(builder) {
    builder.onResolve({ filter: /^@ganju\/sdk$|^\.\/ganju-sdk\.js$/ }, () => ({
      path: constants.CUSTOM_CODE_SDK_SPECIFIER,
      external: true
    }));
  }
};

const toSpecifier = (path: string): string => {
  if (isAbsolute(path)) return path;
  const normalized = path.split(sep).join('/');
  return normalized.startsWith('./') || normalized.startsWith('../')
    ? normalized
    : `./${normalized}`;
};

/**
 * The router, written from the manifest rather than by hand.
 *
 * When every tool names an `entry`, the map from tool name to handler is
 * generated — which is what makes `lookup-order` vs `lookupOrder` impossible
 * instead of merely caught. The publish pipeline's health probe still checks it,
 * because a project using its own `main` router has nothing generated to trust.
 */
const generateRouter = (tools: ProjectTool[]): string => {
  const imports = tools.map(
    (tool, index) =>
      `import handler${index} from ${JSON.stringify(toSpecifier(tool.entry!))};`
  );
  const entries = tools.map(
    (tool, index) => `  ${JSON.stringify(tool.name)}: handler${index}`
  );
  // No `defineTool` here. It is an identity function that exists to type a
  // handler where it is written, so calling it on an already-written one adds an
  // import and types nothing.
  return [
    `import { createHandler } from ${JSON.stringify(constants.CUSTOM_CODE_SDK_SPECIFIER)};`,
    ...imports,
    '',
    'export default createHandler({',
    entries.join(',\n'),
    '});',
    ''
  ].join('\n');
};

const assertExists = async (root: string, path: string, label: string) => {
  const absolute = isAbsolute(path) ? path : join(root, path);
  try {
    await access(absolute);
  } catch {
    throw new CliError(`${label} does not exist: ${path}`, {
      hint: `Looked for ${relative(process.cwd(), absolute) || absolute}`
    });
  }
};

export interface BundleResult {
  code: string;
  bytes: number;
  /** What the same build weighs unminified, for the line `ganju build` prints. */
  rawBytes: number;
  entryDescription: string;
}

export const bundleProject = async (
  project: LoadedProject,
  tools: ProjectTool[],
  options: { minify?: boolean } = {}
): Promise<BundleResult> => {
  const minify = options.minify ?? true;
  const generated = tools.every(tool => tool.entry);

  const shared: BuildOptions = {
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    // The dispatched isolate is workerd with no `nodejs_compat`, so a package
    // resolving through its node build is a package that will fail at runtime
    // rather than here. Ask for the worker build first, and never the node one.
    conditions: ['workerd', 'worker', 'browser', 'import', 'module', 'default'],
    mainFields: ['module', 'main'],
    write: false,
    legalComments: 'none',
    logLevel: 'silent',
    plugins: [externalSdk],
    absWorkingDir: project.root
  };

  if (generated) {
    for (const tool of tools) {
      await assertExists(
        project.root,
        tool.entry!,
        `The entry for "${tool.name}"`
      );
    }
    shared.stdin = {
      contents: generateRouter(tools),
      resolveDir: project.root,
      sourcefile: 'ganju-router.js',
      loader: 'js'
    };
  } else {
    const main = project.file.main ?? 'src/index.ts';
    await assertExists(project.root, main, 'The entry named by "main"');
    shared.entryPoints = [isAbsolute(main) ? main : join(project.root, main)];
  }

  const [minified, raw] = await Promise.all([
    run({ ...shared, minify }),
    // The unminified size is only wanted to report the saving, so it is skipped
    // when nothing was minified — the two numbers would be the same one.
    minify ? run({ ...shared, minify: false }) : Promise.resolve(null)
  ]);

  const bytes = Buffer.byteLength(minified, 'utf8');
  if (bytes > constants.CUSTOM_CODE_MAX_BUNDLE_BYTES) {
    throw new CliError(
      `The bundle is ${formatBytes(bytes)}, over the ${formatBytes(
        constants.CUSTOM_CODE_MAX_BUNDLE_BYTES
      )} limit`,
      {
        hint: 'Drop a dependency, or fetch the data at call time instead of embedding it.'
      }
    );
  }

  return {
    code: minified,
    bytes,
    rawBytes: raw ? Buffer.byteLength(raw, 'utf8') : bytes,
    entryDescription: generated
      ? `${tools.length} ${tools.length === 1 ? 'entry' : 'entries'}, router generated`
      : (project.file.main ?? 'src/index.ts')
  };
};

const run = async (options: BuildOptions): Promise<string> => {
  let result;
  try {
    result = await build(options);
  } catch (error) {
    throw describeBuildFailure(error);
  }
  const output = result.outputFiles?.[0];
  if (!output) throw new CliError('esbuild produced no output');
  return output.text;
};

/**
 * esbuild's own diagnostics, kept as diagnostics.
 *
 * A build failure is the author's file and line, and re-wording it into "the
 * build failed" would delete the only useful part. The message is passed
 * through with its location and nothing else is added.
 */
const describeBuildFailure = (error: unknown): CliError => {
  const failure = error as {
    errors?: Array<{
      text?: string;
      location?: { file?: string; line?: number; column?: number };
    }>;
  };
  const issues = failure.errors ?? [];
  if (issues.length === 0) {
    return new CliError(
      `The bundle could not be built — ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const lines = issues.map(issue => {
    const where = issue.location
      ? `${issue.location.file}:${issue.location.line}:${issue.location.column} — `
      : '';
    return `${where}${issue.text ?? 'unknown error'}`;
  });
  return new CliError(lines[0], {
    hint: lines.length > 1 ? lines.slice(1).join('\n  ') : undefined
  });
};
