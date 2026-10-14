// Paging lists and cutting large results. Run with `npm test` (node --test;
// pagination.ts imports nothing).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  capText,
  findNextCursor,
  InvalidCursorError,
  listResourcesPage,
  paginate
} from '../src/pagination.ts';

const LIMITS = { defaultLimit: 2, maxLimit: 3 };
const resources = ['c', 'a', 'e', 'b', 'd'].map(id => ({
  uri: `resource://${id}`,
  title: id.toUpperCase(),
  description: null,
  mimeType: 'text/plain'
}));

const page = (args: { cursor?: unknown; limit?: unknown }) =>
  JSON.parse(listResourcesPage(resources, args, LIMITS));

test('list-resources: first page by uri, with the total and a cursor', () => {
  const first = page({});
  assert.deepEqual(
    first.resources.map((r: { uri: string }) => r.uri),
    ['resource://a', 'resource://b']
  );
  assert.equal(first.total, 5);
  assert.equal(typeof first.nextCursor, 'string');
  assert.equal(first.resources[0].description, undefined);
});

test('list-resources: following cursors walks every item once', () => {
  const seen: string[] = [];
  let cursor: string | undefined;
  do {
    const next = page({ cursor });
    seen.push(...next.resources.map((r: { uri: string }) => r.uri));
    cursor = next.nextCursor;
  } while (cursor);
  assert.deepEqual(seen, resources.map(r => r.uri).sort());
});

test('list-resources: the last page has no cursor', () => {
  const all = page({ limit: 3 });
  const last = page({ cursor: all.nextCursor, limit: 3 });
  assert.equal(last.resources.length, 2);
  assert.equal(last.nextCursor, undefined);
});

test('list-resources: limit is clamped to the maximum and to at least one', () => {
  assert.equal(page({ limit: 50 }).resources.length, 3);
  assert.equal(page({ limit: 0 }).resources.length, 2);
  assert.equal(page({ limit: -4 }).resources.length, 1);
});

test('paging is keyed: an item added before the cursor does not repeat one', () => {
  const items = ['a', 'b', 'c', 'd'];
  const first = paginate(items, x => x, { limit: 2, ...LIMITS });
  const grown = ['0', ...items];
  const second = paginate(grown, x => x, {
    cursor: first.nextCursor,
    limit: 2,
    ...LIMITS
  });
  assert.deepEqual(second.page, ['c', 'd']);
});

test('a cursor that is not ours is refused', () => {
  assert.throws(
    () => paginate(['a'], x => x, { cursor: '%%%', ...LIMITS }),
    InvalidCursorError
  );
});

test('text within the budget is returned as is', () => {
  assert.equal(capText('hola', 10), 'hola');
});

test('text past the budget is cut with a note of how much was left out', () => {
  const cut = capText('x'.repeat(5000), 2048);
  assert.ok(cut.startsWith('x'.repeat(2048) + '\n\n[Truncated:'));
  assert.ok(cut.includes('first 2 KB of 5 KB'));
  assert.ok(cut.includes('asking for less'));
});

test('a character split by the cut is dropped, not shown broken', () => {
  const cut = capText('é'.repeat(10), 5);
  assert.ok(cut.startsWith('éé\n\n'));
  assert.ok(!cut.includes('�'));
});

test("the cut names the result's own next page", () => {
  const cut = capText(
    'y'.repeat(100),
    10,
    findNextCursor({ nextPageToken: 'abc' })
  );
  assert.ok(cut.includes('nextPageToken: abc'));
  assert.ok(cut.includes('call again with it'));
});

test('a next-page key is read at the top level only', () => {
  assert.equal(findNextCursor({ next_cursor: 'z' }), 'next_cursor: z');
  assert.equal(findNextCursor({ data: { nextCursor: 'deep' } }), undefined);
  assert.equal(findNextCursor([{ nextCursor: 'x' }]), undefined);
  assert.equal(findNextCursor({ nextCursor: '' }), undefined);
});
