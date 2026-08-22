import { constants } from './constants';

/**
 * A dashboard-authored script is a set of files, not one file.
 *
 * The deploy path already uploads more than one module — the SDK travels beside
 * every script as `ganju-sdk.js` — so the runtime has never been the thing
 * holding this to a single file. What was single was the storage: one R2 object
 * holding one module's text.
 *
 * So the object becomes an envelope. `sourceKind: 'editor'` bytes are JSON of
 * this shape; `'bundle'` bytes stay exactly what the CLI compiled, because a
 * bundle IS one module and wrapping it would mean the stored bytes are no longer
 * the thing that runs. `decodeProject` tells the two apart by reading the marker,
 * which is why there is a marker rather than a bare `{ files }` — arbitrary
 * minified JS never parses as JSON, but a bundle that happens to be a JSON
 * module would, and guessing is not a thing to do with someone's deploy.
 */
export const CUSTOM_CODE_PROJECT_MARKER = 'ganjuProject';

export interface CustomCodeProject {
  [CUSTOM_CODE_PROJECT_MARKER]: 1;
  files: Record<string, string>;
}

export const encodeProject = (files: Record<string, string>): string =>
  JSON.stringify({ [CUSTOM_CODE_PROJECT_MARKER]: 1, files });

/**
 * Read stored bytes back as a set of files, or `null` when they are a single
 * module — the CLI's bundle, and every editor version written before folders
 * existed.
 */
export const decodeProject = (text: string): Record<string, string> | null => {
  if (!text.trimStart().startsWith('{')) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const envelope = parsed as Partial<CustomCodeProject>;
  if (envelope[CUSTOM_CODE_PROJECT_MARKER] !== 1) return null;
  if (!envelope.files || typeof envelope.files !== 'object') return null;
  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(envelope.files)) {
    if (typeof content === 'string') files[path] = content;
  }
  return files;
};

/**
 * Check a set of files before anything is stored or deployed.
 *
 * Paths are the module names the Workers upload API receives, and a script's
 * imports resolve against them — so a path that escapes the root, collides with
 * the SDK's own module, or arrives twice under different spellings is a deploy
 * that fails in the runtime rather than here. Messages carry a word `matchStatus`
 * recognises, so these land as 400s rather than opaque 500s.
 */
export const validateProjectFiles = (files: Record<string, string>): void => {
  const paths = Object.keys(files);

  if (paths.length === 0) {
    throw new Error('At least one file is required');
  }
  if (paths.length > constants.CUSTOM_CODE_MAX_FILES) {
    throw new Error(
      `The project exceeds the ${constants.CUSTOM_CODE_MAX_FILES}-file limit`
    );
  }
  if (!files[constants.CUSTOM_CODE_MAIN_MODULE]) {
    throw new Error(
      `A file named ${constants.CUSTOM_CODE_MAIN_MODULE} is required — it is the module the dispatcher calls`
    );
  }

  const seen = new Set<string>();
  for (const path of paths) {
    if (path.length > constants.CUSTOM_CODE_MAX_FILE_PATH) {
      throw new Error(`The path "${path}" exceeds 100 characters`);
    }
    if (!/^[a-zA-Z0-9._-]+(\/[a-zA-Z0-9._-]+)*$/.test(path)) {
      throw new Error(
        `Invalid file path "${path}" — letters, digits, dot, dash, underscore and / only, with no leading or trailing slash`
      );
    }
    if (path.split('/').some(segment => segment === '.' || segment === '..')) {
      throw new Error(`Invalid file path "${path}" — . and .. are not allowed`);
    }
    if (!path.endsWith('.js')) {
      throw new Error(
        `Invalid file path "${path}" — every file must end in .js, since it is deployed as a module exactly as written`
      );
    }
    if (path === constants.CUSTOM_CODE_SDK_MODULE) {
      throw new Error(
        `Invalid file path "${path}" — that name belongs to the SDK, which is attached to every deploy`
      );
    }
    // Case-insensitively, because two files differing only in case are one file
    // on the machine of whoever downloads them next.
    const lower = path.toLowerCase();
    if (seen.has(lower)) {
      throw new Error(`Invalid file path "${path}" — it is already in use`);
    }
    seen.add(lower);
  }
};
