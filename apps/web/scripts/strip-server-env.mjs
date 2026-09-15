// Reduces .open-next/cloudflare/next-env.mjs to NEXT_PUBLIC_ variables.
//
// `opennextjs-cloudflare build` writes that file from every `.env*` it finds,
// and in a monorepo that includes the root `.env` — the one holding the API's
// secrets: CRYPTO_SECRET, JWT_SECRET, the database password, OAuth client
// secrets, the billing and Cloudflare API tokens. The worker imports the file,
// so without this step all of them ship inside the dashboard's bundle, which
// reads none of them.
//
// Nothing public is lost. The worker copies its wrangler `vars` into
// process.env before it looks at this file, and only fills keys still missing,
// so the NEXT_PUBLIC_ values kept here are a fallback, not the source.
//
// Runs after `opennextjs-cloudflare build` rather than inside `build`: OpenNext
// writes the file once `next build` has finished. `cf-build` is also the
// wrangler build command, so both deploys go through it.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// `new URL('.')` is the scripts directory and dirname() drops it, so this is
// apps/web.
const web = path.dirname(new URL('.', import.meta.url).pathname);
const target = path.join(web, '.open-next/cloudflare/next-env.mjs');

const PUBLIC = /^NEXT_PUBLIC_/;

// Failing is the point: if OpenNext renames or stops writing this file, a
// silent skip would put every secret back in the bundle without a trace.
let modes;
try {
  modes = await import(pathToFileURL(target).href);
} catch (error) {
  console.error(`  env  could not read ${target}: ${error.message}`);
  process.exit(1);
}

const kept = new Set();
const dropped = new Set();

const output = Object.entries(modes)
  .map(([mode, vars]) => {
    const visible = {};
    for (const [key, value] of Object.entries(vars)) {
      if (PUBLIC.test(key)) {
        visible[key] = value;
        kept.add(key);
      } else {
        dropped.add(key);
      }
    }
    return `export const ${mode} = ${JSON.stringify(visible)};\n`;
  })
  .join('');

await fs.writeFile(target, output);

console.log(
  `  env  kept ${kept.size}, dropped ${dropped.size}  → .open-next/cloudflare/next-env.mjs`
);
