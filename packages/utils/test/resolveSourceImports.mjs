// Lets a test import a module that imports its siblings. Source files import
// each other without an extension ("./constants"), which the bundler and tsc
// resolve and Node does not; this tries the `.ts` file first. Loaded with
// `node --import` by `npm test`.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // Not a sibling source file: resolve it as written.
      }
    }
    return nextResolve(specifier, context);
  }
});
