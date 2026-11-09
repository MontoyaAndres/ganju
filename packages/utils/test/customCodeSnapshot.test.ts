// The server's check on the readable source the CLI uploads beside a bundle.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateSnapshotFiles } from '../src/customCodeProject.ts';

test('a project of the author’s own files is accepted, whatever their type', () => {
  validateSnapshotFiles({
    'ganju.json': '{}',
    'src/index.ts': 'export default {};',
    'README.md': '# shop',
    '.gitignore': 'dist/'
  });
});

test('paths that leave the project or hide characters are refused', () => {
  for (const path of [
    '../escape.js',
    'a/../../b.js',
    '/abs.js',
    'a//b.js',
    './a.js',
    'a\\b.js',
    'bad\u0000.js',
    'x'.repeat(301)
  ]) {
    assert.throws(
      () => validateSnapshotFiles({ [path]: '' }),
      /Invalid file path/,
      path
    );
  }
});

test('two spellings of one name are refused', () => {
  assert.throws(
    () => validateSnapshotFiles({ 'Index.ts': '', 'index.ts': '' }),
    /same name/
  );
});

test('empty, too many, a file too big, or too big in total are refused', () => {
  assert.throws(() => validateSnapshotFiles({}), /required/);

  const many: Record<string, string> = {};
  for (let i = 0; i < 501; i++) many[`f${i}.js`] = '';
  assert.throws(() => validateSnapshotFiles(many), /file limit/);

  assert.throws(
    () => validateSnapshotFiles({ 'big.js': 'x'.repeat(256 * 1024 + 1) }),
    /exceeds/
  );

  const total: Record<string, string> = {};
  for (let i = 0; i < 9; i++) total[`f${i}.js`] = 'x'.repeat(250 * 1024);
  assert.throws(() => validateSnapshotFiles(total), /2MB limit/);
});
