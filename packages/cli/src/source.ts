import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import * as constants from '@ganju/utils/cliConstants';

/**
 * The readable source `ganju deploy` uploads beside the bundle, so the
 * dashboard (and the assistant) can see the author's real files instead of
 * minified code. It is only shown, never deployed.
 *
 * Which files: what git would commit (tracked, plus untracked files that
 * aren't ignored). Outside a git repository, the project's .gitignore files
 * are read here instead. Some things never go, whatever the ignore rules say:
 * installed packages, secrets, lockfiles and binary files.
 */

export interface SourceSnapshot {
  files: Record<string, string>;
  bytes: number;
  /** Files left out one by one, and why. */
  skipped: { path: string; reason: 'large' | 'binary' | 'name' }[];
  /** Set when the project is over the cap, in which case `files` is empty. */
  tooBig: { files: number; bytes: number } | null;
}

const NEVER_DIRS = new Set(['node_modules', '.ganju', '.git']);
const LOCKFILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'bun.lock'
]);

/** Whether a path is always left out, whatever the ignore rules say. */
export const alwaysSkipped = (path: string): boolean => {
  const segments = path.split('/');
  const name = segments[segments.length - 1];
  return (
    segments.some(segment => NEVER_DIRS.has(segment)) ||
    name.startsWith('.env') ||
    LOCKFILES.has(name)
  );
};

/**
 * One .gitignore file as a matcher for paths relative to the folder holding
 * it. Covers what projects actually write: globs, `**`, a leading or inner `/`
 * to anchor, a trailing `/` for folders, and `!` to bring a path back.
 */
export const parseGitignore = (
  text: string
): ((path: string, isDir: boolean) => boolean | null) => {
  const rules = text
    .split(/\r?\n/)
    .map(line => line.replace(/(?<!\\)\s+$/, ''))
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const negate = line.startsWith('!');
      let pattern = negate ? line.slice(1) : line;
      if (pattern.startsWith('\\')) pattern = pattern.slice(1);
      const dirOnly = pattern.endsWith('/');
      if (dirOnly) pattern = pattern.slice(0, -1);
      const anchored = pattern.includes('/');
      if (pattern.startsWith('/')) pattern = pattern.slice(1);
      return { negate, dirOnly, regex: globToRegex(pattern, anchored) };
    });

  // The last rule that matches decides; null when none does.
  return (path, isDir) => {
    let ignored: boolean | null = null;
    for (const rule of rules) {
      if (rule.dirOnly && !isDir) continue;
      if (rule.regex.test(path)) ignored = !rule.negate;
    }
    return ignored;
  };
};

const globToRegex = (pattern: string, anchored: boolean): RegExp => {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        // `**/` matches any number of folders, a trailing `**` everything.
        if (pattern[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if (char === '?') {
      out += '[^/]';
    } else if (char === '[') {
      const end = pattern.indexOf(']', i + 1);
      if (end === -1) {
        out += '\\[';
      } else {
        out += `[${pattern
          .slice(i + 1, end)
          .replace(/^!/, '^')
          .replace(/\\/g, '\\\\')}]`;
        i = end;
      }
    } else if (char === '\\' && i + 1 < pattern.length) {
      out += escapeRegex(pattern[++i]);
    } else {
      out += escapeRegex(char);
    }
  }
  // An unanchored pattern matches a name at any depth.
  return new RegExp(`^${anchored ? '' : '(?:.*/)?'}${out}$`);
};

const escapeRegex = (char: string) => char.replace(/[.+^${}()|[\]\\]/g, '\\$&');

const run = promisify(execFile);

/** What git would commit under `root`, or null when git can't say. */
const listWithGit = async (root: string): Promise<string[] | null> => {
  try {
    const { stdout } = await run(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { cwd: root, maxBuffer: 64 * 1024 * 1024 }
    );
    return [...new Set(stdout.split('\0').filter(Boolean))];
  } catch {
    return null;
  }
};

/** Walk `root`, honouring every .gitignore met on the way down. */
const listByWalking = async (root: string): Promise<string[]> => {
  const found: string[] = [];
  type Matcher = {
    base: string;
    match: ReturnType<typeof parseGitignore>;
  };

  const ignored = (matchers: Matcher[], path: string, isDir: boolean) => {
    let result = false;
    for (const { base, match } of matchers) {
      const relative = base ? path.slice(base.length + 1) : path;
      const verdict = match(relative, isDir);
      if (verdict !== null) result = verdict;
    }
    return result;
  };

  const walk = async (dir: string, parents: Matcher[]): Promise<void> => {
    const absolute = dir ? join(root, dir) : root;
    const matchers = [...parents];
    const gitignore = await readFile(
      join(absolute, '.gitignore'),
      'utf8'
    ).catch(() => null);
    if (gitignore !== null) {
      matchers.push({ base: dir, match: parseGitignore(gitignore) });
    }
    const entries = await readdir(absolute, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (NEVER_DIRS.has(entry.name) || ignored(matchers, path, true)) {
          continue;
        }
        await walk(path, matchers);
      } else if (entry.isFile() && !ignored(matchers, path, false)) {
        found.push(path);
      }
    }
  };

  await walk('', []);
  return found;
};

const looksBinary = (bytes: Buffer): boolean =>
  bytes.subarray(0, 8000).includes(0);

// The same shape the server accepts: relative, `/`-separated, nothing hidden.
const storablePath = (path: string): boolean =>
  path.length <= constants.CUSTOM_CODE_MAX_SNAPSHOT_PATH &&
  // eslint-disable-next-line no-control-regex
  !/[\u0000-\u001f\u007f\\]/.test(path) &&
  !path
    .split('/')
    .some(segment => segment === '' || segment === '.' || segment === '..');

export const collectSource = async (
  root: string,
  list: (root: string) => Promise<string[] | null> = listWithGit
): Promise<SourceSnapshot> => {
  const paths = ((await list(root)) ?? (await listByWalking(root)))
    .filter(path => !alwaysSkipped(path))
    .sort();

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const files: Record<string, string> = {};
  const skipped: SourceSnapshot['skipped'] = [];
  let bytes = 0;

  for (const path of paths) {
    if (!storablePath(path)) {
      skipped.push({ path, reason: 'name' });
      continue;
    }
    const absolute = join(root, path);
    // Tracked files deleted from disk, and symlinks to folders, are skipped.
    const info = await stat(absolute).catch(() => null);
    if (!info?.isFile()) continue;
    if (info.size > constants.CUSTOM_CODE_MAX_SNAPSHOT_FILE_BYTES) {
      skipped.push({ path, reason: 'large' });
      continue;
    }
    const content = await readFile(absolute);
    let text: string;
    try {
      if (looksBinary(content)) throw new Error('binary');
      text = decoder.decode(content);
    } catch {
      skipped.push({ path, reason: 'binary' });
      continue;
    }
    files[path] = text;
    bytes += content.byteLength;
  }

  const count = Object.keys(files).length;
  if (
    bytes > constants.CUSTOM_CODE_MAX_SNAPSHOT_BYTES ||
    count > constants.CUSTOM_CODE_MAX_SNAPSHOT_FILES
  ) {
    return { files: {}, bytes: 0, skipped, tooBig: { files: count, bytes } };
  }
  return { files, bytes, skipped, tooBig: null };
};

/** The envelope the API stores, the same one the dashboard editor uses. */
export const encodeSnapshot = (files: Record<string, string>): string =>
  JSON.stringify({ ganjuProject: 1, files });
