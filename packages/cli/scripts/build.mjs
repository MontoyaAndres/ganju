// Bundle the CLI into one self-contained module, then make it executable.
//
// `@ganju/utils` is published, so this could declare a dependency on it instead.
// It bundles for two reasons that survive that: a globally installed CLI should
// not drag zod, dayjs and a cipher suite onto someone's machine to read eight
// constants, and three packages released in lockstep should not be able to
// half-resolve against each other on a user's disk.
//
// `esbuild` stays external because it is a real runtime dependency with
// platform-specific binaries: bundling its JS would leave the native binary it
// shells out to unresolvable.
//
// What gets carried in is only `@ganju/utils/cliConstants` — eight values in a
// module that imports nothing. Importing the main constants module instead would
// inline the whole object literal here, since a bundler cannot tree-shake one.
import { build } from 'esbuild';
import { chmod, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../dist/index.js', import.meta.url));

const result = await build({
  entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))],
  outfile: out,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  // Node builtins resolve at runtime; esbuild ships its own binary.
  external: ['esbuild'],
  // tsc has no way to emit a shebang and a shebang in the source is a syntax
  // error to every editor that reads it, so it is prepended here instead.
  banner: { js: '#!/usr/bin/env node' },
  legalComments: 'none',
  logLevel: 'info',
  metafile: true
});

await chmod(out, 0o755);

const bytes = Buffer.byteLength(await readFile(out, 'utf8'), 'utf8');
const carried = Object.keys(result.metafile.inputs).filter(
  input => !/(^|\/)src\//.test(input)
);

console.log(`  dist/index.js  ${(bytes / 1024).toFixed(1)}KB`);
console.log(
  `  carried in:    ${carried.length ? carried.join(', ') : 'nothing beyond src/'}`
);

// A workspace specifier reaching the registry is an install that cannot resolve.
// `@ganju/utils` is a devDependency here precisely so this check stays true.
const manifest = JSON.parse(
  await readFile(
    fileURLToPath(new URL('../package.json', import.meta.url)),
    'utf8'
  )
);
const unpublishable = Object.entries(manifest.dependencies ?? {}).filter(
  ([name, range]) =>
    range === '*' ||
    range.startsWith('workspace:') ||
    name.startsWith('@ganju/')
);
if (unpublishable.length > 0) {
  console.error(
    `\n  dependencies that cannot resolve off this machine: ${unpublishable
      .map(([name, range]) => `${name}@${range}`)
      .join(', ')}`
  );
  process.exit(1);
}
