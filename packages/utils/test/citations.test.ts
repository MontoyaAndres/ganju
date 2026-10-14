// Which sources an answer cites, for the footer under a channel reply. Run with
// `npm test` (node --test; citations.ts imports nothing but a type).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { citedPages, citesUrl, selectCitedSources } from '../src/citations.ts';
import type { Source } from '../src/sources.ts';

const pages = (answer: string) => [...citedPages(answer)];

test('citedPages reads single pages and ranges in English and Spanish', () => {
  assert.deepEqual(pages('See p. 125.'), [125]);
  assert.deepEqual(pages('pp. 12–14'), [12, 13, 14]);
  assert.deepEqual(pages('on page 7 and pages 9-10'), [7, 9, 10]);
  assert.deepEqual(pages('ver págs. 4-5'), [4, 5]);
  assert.deepEqual(pages('en las páginas 3 a 5'), [3, 4, 5]);
  assert.deepEqual(pages('pages 2 to 3'), [2, 3]);
  assert.deepEqual(pages('(P. 9)'), [9]);
});

test('citedPages ignores look-alikes that are not page references', () => {
  assert.deepEqual(pages('a p2p network'), []);
  assert.deepEqual(pages('pp 2026 budget'), []);
  assert.deepEqual(pages('an mp3 file'), []);
  assert.deepEqual(pages('p 12'), []);
  assert.deepEqual(pages('page 12b'), []);
  assert.deepEqual(pages('top. 3'), []);
});

test('citedPages keeps only the start of a backwards or huge range', () => {
  assert.deepEqual(pages('pp. 9-3'), [9]);
  assert.deepEqual(pages('pages 1-500'), [1]);
  assert.deepEqual(pages('page 3 and 4'), [3]);
});

test('citesUrl matches the exact page, not a prefix of a deeper one', () => {
  const url = 'https://acme.com/docs';
  assert.equal(citesUrl('Read https://acme.com/docs.', url), true);
  assert.equal(citesUrl('[docs](https://acme.com/docs/)', url), true);
  assert.equal(citesUrl('See https://acme.com/docs#setup', url), true);
  assert.equal(citesUrl('See https://acme.com/docs/api', url), false);
  assert.equal(citesUrl('See https://acme.com/docs-v2', url), false);
  assert.equal(
    citesUrl('https://acme.com/docs/api and https://acme.com/docs', url),
    true
  );
  assert.equal(citesUrl('anything', '///'), false);
});

const source = (over: Partial<Source>): Source => ({
  resourceId: 'r1',
  uri: 'file://handbook.pdf',
  title: 'Northwind Handbook',
  sourceType: 'FILE',
  mimeType: 'application/pdf',
  fileName: 'handbook.pdf',
  score: 0.5,
  ...over
});

test('selectCitedSources keeps the cited resource and its cited page', () => {
  const p3 = source({ pageNumber: 3, chunkIndex: 1 });
  const p8 = source({ pageNumber: 8, chunkIndex: 2 });
  const other = source({
    resourceId: 'r2',
    uri: 'https://acme.com/returns',
    title: 'Returns policy',
    sourceType: 'WEBSITE',
    fileName: null
  });
  const read = source({
    resourceId: 'r3',
    title: 'Read whole',
    score: undefined
  });

  assert.deepEqual(
    selectCitedSources(
      [p3, p8, other, read],
      'Per the Northwind Handbook (p. 8), gifts can be returned.'
    ),
    [p8, read]
  );
});

test('selectCitedSources falls back to the best-ranked hit of a cited resource', () => {
  const first = source({ pageNumber: 3 });
  const second = source({ pageNumber: 8 });
  assert.deepEqual(
    selectCitedSources([first, second], 'From handbook.pdf: yes.'),
    [first]
  );
});

test('selectCitedSources matches a title without its site suffix or a URL', () => {
  const page = source({
    resourceId: 'r2',
    uri: 'https://developer.mozilla.org/etag',
    title: 'ETag header - HTTP | MDN',
    sourceType: 'WEBSITE',
    fileName: null
  });
  assert.deepEqual(selectCitedSources([page], 'The ETag header is ...'), [
    page
  ]);
  assert.deepEqual(
    selectCitedSources([page], 'See https://developer.mozilla.org/etag'),
    [page]
  );
});

test('selectCitedSources drops every search hit when the answer names none', () => {
  const hit = source({});
  const read = source({
    resourceId: 'r3',
    title: 'Read whole',
    score: undefined
  });
  assert.deepEqual(selectCitedSources([hit, read], 'Hello! How can I help?'), [
    read
  ]);
  assert.deepEqual(selectCitedSources([read], 'Hi'), [read]);
});
