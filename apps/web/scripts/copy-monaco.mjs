// Copies Monaco's runtime into public/monaco/vs, so the editor is served from
// this origin instead of a CDN.
//
// @monaco-editor/react loads Monaco through its own AMD loader at a configurable
// path. The default is jsdelivr, which would put the editor on someone else's
// uptime, leak a request on every visit to the Functions tab, and need a CSP
// hole for scripts and workers. Copying the files is the whole fix.
//
// Not bundled, deliberately: Monaco's ESM entry pulls in global CSS, which the
// pages router refuses to import from node_modules, and its language services
// run in web workers that every bundler wires up differently. The loader avoids
// both — it fetches what it needs, from here, at runtime.
//
// The output is generated, gitignored, and rebuilt by `build` and `dev`. Two
// call sites rather than a `pre*` hook per command: `opennextjs-cloudflare
// build` runs the app's own `build` script, so `cf-build` and both deploys pick
// this up through it, and only `next dev` needs the second mention.
import fs from 'node:fs/promises';
import path from 'node:path';

// `new URL('.')` is the scripts directory and dirname() drops it, so this is
// apps/web.
const web = path.dirname(new URL('.', import.meta.url).pathname);
const source = path.join(web, '../../node_modules/monaco-editor/min/vs');
const target = path.join(web, 'public/monaco/vs');

// Workers for languages this editor never opens, and translations it never asks
// for. Nothing references them unless the corresponding language is used, and
// together they are most of the weight.
//
// `json.worker` is NOT among them, and that is the whole point of this comment:
// the JSON language service is what validates the schema and sample-input
// fields, and without its worker they fall back to plain highlighting with no
// diagnostics — a failure that looks like nothing at all, since the editor still
// renders.
const SKIP = /^(css|html)\.worker-|^nls\.messages\.(?!loader)[a-z-]+\.js$/;

let copied = 0;
let bytes = 0;

const walk = async (from, to) => {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    if (SKIP.test(entry.name)) continue;
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await walk(src, dst);
      continue;
    }
    await fs.copyFile(src, dst);
    bytes += (await fs.stat(dst)).size;
    copied += 1;
  }
};

await fs.rm(target, { recursive: true, force: true });
await walk(source, target);

console.log(
  `  monaco  ${copied} files  ${(bytes / 1024 / 1024).toFixed(1)}MB  → public/monaco/vs`
);
