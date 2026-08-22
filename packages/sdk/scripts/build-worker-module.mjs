// Emits the SDK as one self-contained ES module, plus a JS constant holding its
// source, so the publish pipeline can ship it beside every uploaded script.
//
// Why a sibling module and not a bundler: dashboard-authored tools are deployed
// exactly as typed. `import { createHandler } from './ganju-sdk.js'` resolves
// against this file inside the isolate, so there is no build step between the
// editor and the running Worker — which is also what lets the stored source be
// read back and edited again. A CLI bundle that inlined the SDK simply never
// imports it, and carrying one extra module on every deploy costs less than a
// branch that has to know which kind it is holding.
//
// The constant is JSON-encoded rather than written into a template literal:
// the SDK contains backticks and `${`, and escaping those by hand is a bug
// waiting to happen.
import esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.dirname(new URL('..', import.meta.url).pathname);
const pkg = path.join(root, 'sdk');

const result = await esbuild.build({
  entryPoints: [path.join(pkg, 'src/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'esnext',
  // The Workers runtime, with no nodejs_compat. Anything that needs a Node
  // built-in has no business in a user script's dependency tree.
  conditions: ['worker', 'import'],
  write: false,
  legalComments: 'none'
});

const source = result.outputFiles[0].text;

await fs.mkdir(path.join(pkg, 'dist'), { recursive: true });
await fs.writeFile(
  path.join(pkg, 'dist/workerModule.js'),
  `export const SDK_WORKER_MODULE = ${JSON.stringify(source)};\n`
);
await fs.writeFile(
  path.join(pkg, 'dist/workerModule.d.ts'),
  'export declare const SDK_WORKER_MODULE: string;\n'
);

console.log(
  `  ganju-sdk.js  ${(source.length / 1024).toFixed(1)}KB  (shipped beside every deployed script)`
);
