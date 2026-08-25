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
 * Why one path is not a legal file in a script — the rule that refused it, and
 * what it needs to say so.
 *
 * A code rather than a sentence, because there are two readers. The upload path
 * throws it as English, which is what `error_log` has always held; the
 * dashboard's file explorer renders it in whatever language the person is
 * reading, at the keystroke. Returning prose would have forced the explorer to
 * either show English or keep a second copy of these rules — and a second copy
 * is how the two surfaces come to disagree about what a legal name is.
 */
export type ProjectPathIssue =
  | { code: 'required' }
  | { code: 'tooLong'; path: string; max: number }
  | { code: 'charset'; path: string }
  | { code: 'dots'; path: string }
  | { code: 'extension'; path: string }
  | { code: 'reserved'; path: string }
  | { code: 'taken'; path: string };

/**
 * Check ONE path against every rule a stored file has to satisfy.
 *
 * Split out of the set-level check below so the dashboard's file explorer can
 * apply the identical rules as someone types a name, rather than letting them
 * finish, click deploy, and read the same sentence back as a 400. There is one
 * definition of what a legal path is, and both surfaces call it.
 *
 * `taken` is the paths already in the project, compared case-insensitively —
 * pass the file being renamed's own path in it and the rename reports a
 * collision with itself, so callers exclude it.
 */
export const projectPathIssue = (
  path: string,
  taken: Iterable<string> = []
): ProjectPathIssue | null => {
  if (!path) return { code: 'required' };
  if (path.length > constants.CUSTOM_CODE_MAX_FILE_PATH) {
    return {
      code: 'tooLong',
      path,
      max: constants.CUSTOM_CODE_MAX_FILE_PATH
    };
  }
  if (!/^[a-zA-Z0-9._-]+(\/[a-zA-Z0-9._-]+)*$/.test(path)) {
    return { code: 'charset', path };
  }
  if (path.split('/').some(segment => segment === '.' || segment === '..')) {
    return { code: 'dots', path };
  }
  if (!path.endsWith('.js')) {
    return { code: 'extension', path };
  }
  if (path === constants.CUSTOM_CODE_SDK_MODULE) {
    return { code: 'reserved', path };
  }
  // Case-insensitively, because two files differing only in case are one file
  // on the machine of whoever downloads them next.
  const lower = path.toLowerCase();
  for (const other of taken) {
    if (other.toLowerCase() === lower) {
      return { code: 'taken', path };
    }
  }
  return null;
};

/**
 * The same check, rendered in English — what the upload path throws and what
 * lands in `error_log`. Messages carry a word `matchStatus` recognises, so they
 * land as 400s rather than opaque 500s.
 */
export const validateProjectPath = (
  path: string,
  taken: Iterable<string> = []
): string | null => {
  const issue = projectPathIssue(path, taken);
  if (!issue) return null;

  switch (issue.code) {
    case 'required':
      return 'A name is required';
    case 'tooLong':
      return `The path "${issue.path}" exceeds ${issue.max} characters`;
    case 'charset':
      return `Invalid file path "${issue.path}" — letters, digits, dot, dash, underscore and / only, with no leading or trailing slash`;
    case 'dots':
      return `Invalid file path "${issue.path}" — . and .. are not allowed`;
    case 'extension':
      return `Invalid file path "${issue.path}" — every file must end in .js, since it is deployed as a module exactly as written`;
    case 'reserved':
      return `Invalid file path "${issue.path}" — that name belongs to the SDK, which is attached to every deploy`;
    case 'taken':
      return `Invalid file path "${issue.path}" — it is already in use`;
  }
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
    const problem = validateProjectPath(path, seen);
    if (problem) throw new Error(problem);
    seen.add(path.toLowerCase());
  }
};
