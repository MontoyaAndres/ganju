// Emits the SDK's public types as one flat declaration file, so the dashboard
// editor can offer real completion for `ctx` instead of `any`.
//
// Generated from the compiled declarations rather than hand-written beside them:
// a second copy of this surface would drift the first time a method was added,
// and the whole point of typing `ctx` is that it tells the truth about what the
// broker will answer. Doc comments survive the trip, so hovering `ctx.sendFile`
// in the browser shows the same paragraph as hovering it in an editor.
//
// The output is one ES module declaring exactly what `./ganju-sdk.js` exports —
// which is what the uploaded script imports, and what the editor resolves that
// import against.
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.dirname(new URL('..', import.meta.url).pathname);
const dist = path.join(root, 'sdk/dist');

const read = async file => fs.readFile(path.join(dist, file), 'utf8');

const strip = source =>
  source
    .split('\n')
    .filter(
      line =>
        // Relative imports have nothing to point at once the files are merged,
        // and re-exports of names already declared here are duplicates.
        !/^import\s/.test(line) &&
        !/^export\s+(type\s+)?\{[^}]*\}\s*(from\s+'[^']+')?;/.test(line) &&
        !line.startsWith('//# sourceMappingURL')
    )
    // Everything inside a .d.ts is already ambient; `declare` on top of that is
    // an error rather than a no-op.
    .map(line => line.replace(/^export declare /, 'export '))
    .join('\n')
    .trim();

const types = strip(await read('types.d.ts'));
const index = strip(await read('index.d.ts'));

const source = `// The @ganju/sdk surface, as the editor sees it. Generated — do not edit.
//
// Your script is deployed exactly as written, with this module beside it, so
// everything below is available at runtime with no build step and no install.

// The broker service binding, opaque to a tool author.
type Fetcher = unknown;

${types}

${index}
`;

await fs.mkdir(dist, { recursive: true });
await fs.writeFile(
  path.join(dist, 'editorTypes.js'),
  `export const SDK_EDITOR_TYPES = ${JSON.stringify(source)};\n`
);
await fs.writeFile(
  path.join(dist, 'editorTypes.d.ts'),
  'export declare const SDK_EDITOR_TYPES: string;\n'
);

console.log(
  `  ganju-sdk.d.ts  ${(source.length / 1024).toFixed(1)}KB  (editor completion for ctx)`
);
