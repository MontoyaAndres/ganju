// Lets a test import a source file that imports its siblings. The CLI's
// sources import each other as `./errors.js`, which tsc and esbuild map to
// `errors.ts` and Node does not; this tries the `.ts` file first. Loaded with
// `node --import` by `npm test`.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && specifier.endsWith('.js')) {
      try {
        return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
      } catch {
        // Not a source file: resolve it as written.
      }
    }
    return nextResolve(specifier, context);
  }
});
