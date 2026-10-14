// How much of the previous chunk a chunk repeats. Run with `npm test`
// (node --test; chunkOverlap.ts imports nothing).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { overlapTail } from '../src/chunkOverlap.ts';

test('overlapTail: the last `overlap` characters of the previous chunk', () => {
  assert.equal(overlapTail('abcdefgh', 3), 'fgh');
  assert.equal(overlapTail('abc', 10), 'abc');
});

test('overlapTail: zero borrows nothing, not the whole previous chunk', () => {
  assert.equal(overlapTail('abcdefgh', 0), '');
});

test('overlapTail: a negative overlap borrows nothing either', () => {
  assert.equal(overlapTail('abcdefgh', -2), '');
});

test('overlapTail: an empty previous chunk has nothing to lend', () => {
  assert.equal(overlapTail('', 5), '');
});
