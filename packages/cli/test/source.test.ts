// What `ganju deploy` uploads as the project's readable source, and the
// warning before it replaces a version made in the dashboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { alwaysSkipped, collectSource, parseGitignore } from '../src/source.ts';
import { appLive } from '../src/guard.ts';

const project = async (files: Record<string, string | Buffer>) => {
  const root = await mkdtemp(join(tmpdir(), 'ganju-source-'));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
};

// Forces the walk that runs outside a git repository.
const noGit = async () => null;

test('installed packages, secrets, lockfiles and git never go', () => {
  for (const path of [
    'node_modules/x/index.js',
    'sub/node_modules/y.js',
    '.ganju/token',
    '.git/HEAD',
    '.env',
    '.env.local',
    'config/.env.production',
    'package-lock.json',
    'sub/yarn.lock',
    'pnpm-lock.yaml',
    'bun.lockb'
  ]) {
    assert.equal(alwaysSkipped(path), true, path);
  }
  for (const path of ['src/index.ts', 'package.json', 'env.ts', 'README.md']) {
    assert.equal(alwaysSkipped(path), false, path);
  }
});

test('.gitignore patterns: globs, anchors, folders and negation', () => {
  const match = parseGitignore(
    [
      '# build output',
      'dist/',
      '*.log',
      '!keep.log',
      '/secret.txt',
      'docs/**/*.pdf',
      'tmp?'
    ].join('\n')
  );
  assert.equal(match('dist', true), true);
  assert.equal(match('dist', false), null);
  assert.equal(match('a/b/error.log', false), true);
  assert.equal(match('keep.log', false), false);
  assert.equal(match('secret.txt', false), true);
  assert.equal(match('sub/secret.txt', false), null);
  assert.equal(match('docs/a/b/x.pdf', false), true);
  assert.equal(match('docs/x.pdf', false), true);
  assert.equal(match('tmp1', false), true);
  assert.equal(match('src/index.ts', false), null);
});

test('outside git: the walk honours nested .gitignore files', async () => {
  const root = await project({
    '.gitignore': 'dist/\n*.log\n',
    'ganju.json': '{}',
    'src/index.ts': 'export const a = 1;',
    'src/.gitignore': 'generated.ts\n',
    'src/generated.ts': 'x',
    'dist/index.js': 'built',
    'debug.log': 'log',
    'node_modules/pkg/index.js': 'dep',
    '.env': 'SECRET=1',
    'package-lock.json': '{}'
  });
  try {
    const source = await collectSource(root, noGit);
    assert.deepEqual(Object.keys(source.files).sort(), [
      '.gitignore',
      'ganju.json',
      'src/.gitignore',
      'src/index.ts'
    ]);
    assert.equal(source.tooBig, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('in a git repo: what git would commit, minus what never goes', async t => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
  } catch {
    t.skip('git is not installed');
    return;
  }
  const root = await project({
    '.gitignore': 'out/\n',
    'index.js': 'export default {};',
    'out/bundle.js': 'built',
    '.env': 'SECRET=1'
  });
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    const source = await collectSource(root);
    assert.deepEqual(Object.keys(source.files).sort(), [
      '.gitignore',
      'index.js'
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('binary and oversized files are left out one by one', async () => {
  const root = await project({
    'index.js': 'export default {};',
    'logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]),
    'big.json': 'x'.repeat(300 * 1024)
  });
  try {
    const source = await collectSource(root, noGit);
    assert.deepEqual(Object.keys(source.files), ['index.js']);
    assert.deepEqual(
      source.skipped.map(entry => `${entry.path}:${entry.reason}`).sort(),
      ['big.json:large', 'logo.png:binary']
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a project over the cap sends nothing rather than part of it', async () => {
  const files: Record<string, string> = {};
  // Nine files of 250 KB: each under the per-file cap, together over 2 MB.
  for (let i = 0; i < 9; i++) files[`data${i}.js`] = 'x'.repeat(250 * 1024);
  const root = await project(files);
  try {
    const source = await collectSource(root, noGit);
    assert.deepEqual(source.files, {});
    assert.equal(source.tooBig?.files, 9);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the guard warns only when the live version was made in the app', () => {
  const versions = [
    {
      id: 'v3',
      version: 3,
      sourceKind: 'editor',
      tools: [{ name: 'lookup' }, { name: 'refund' }]
    },
    { id: 'v2', version: 2, sourceKind: 'bundle', tools: [{ name: 'lookup' }] }
  ];
  assert.deepEqual(appLive({ activeVersionId: 'v3', versions }, ['lookup']), {
    version: 3,
    lost: ['refund']
  });
  assert.equal(appLive({ activeVersionId: 'v2', versions }, ['lookup']), null);
  assert.equal(appLive({ activeVersionId: null, versions: [] }, []), null);
});
