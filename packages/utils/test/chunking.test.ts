// The heading path recorded on each chunk, which search cites as a chunk's
// section. Run with `npm test` (node --test; chunking.ts imports its siblings,
// which resolveSourceImports.mjs lets Node find).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { headingSyntaxFor, prepareChunks } from '../src/chunking.ts';

const pathsOf = (
  content: string,
  options: { mimeType?: string; fileName?: string; targetChars?: number }
) =>
  prepareChunks('', null, content, { overlapChars: 5, ...options }).map(
    chunk => ({
      content: chunk.content,
      path: chunk.metadata?.headingPath ?? []
    })
  );

test('headingSyntaxFor trusts Markdown and HTML, never plain text', () => {
  assert.equal(headingSyntaxFor({ mimeType: 'text/markdown' }), 'markdown');
  assert.equal(headingSyntaxFor({ fileName: 'notes.MD' }), 'markdown');
  assert.equal(headingSyntaxFor({ mimeType: 'text/html' }), 'html');
  assert.equal(
    headingSyntaxFor({ isWebPage: true, mimeType: 'text/html' }),
    'markdown'
  );
  assert.equal(
    headingSyntaxFor({ mimeType: 'text/plain', fileName: 'a.txt' }),
    null
  );
});

test('a Markdown chunk sits under the headings above it, outermost first', () => {
  const md = [
    '# Handbook',
    'Intro line.',
    '## Returns',
    'Return within thirty days.',
    '### Gift orders',
    'Gift orders get store credit.',
    '## Shipping',
    'Ships in two days.'
  ].join('\n');
  const chunks = pathsOf(md, { mimeType: 'text/markdown', targetChars: 40 });

  const pathFor = (needle: string) =>
    chunks.find(c => c.content.includes(needle))?.path;
  assert.deepEqual(pathFor('store credit'), [
    'Handbook',
    'Returns',
    'Gift orders'
  ]);
  assert.deepEqual(pathFor('two days'), ['Handbook', 'Shipping']);
});

test('a # line inside a fenced block is not a heading', () => {
  const md = [
    '# Setup',
    '```sh',
    '# install the cli',
    'npm install',
    '```',
    'Then run it.'
  ].join('\n');
  const chunks = pathsOf(md, { mimeType: 'text/markdown', targetChars: 30 });
  for (const chunk of chunks) assert.deepEqual(chunk.path, ['Setup']);
});

test('plain text gets no heading path', () => {
  const chunks = pathsOf('# not a title\nJust text.', {
    mimeType: 'text/plain'
  });
  assert.deepEqual(
    chunks.map(c => c.path),
    [[]]
  );
});

test('an HTML heading split between two chunks still names the chunks after it', () => {
  const html =
    '<h1>Store help</h1> <p>Welcome to the store help pages.</p> ' +
    '<h2>Returns and gift orders for every customer</h2> ' +
    '<p>Gift orders can be returned within thirty days.</p>';
  const chunks = pathsOf(html, { mimeType: 'text/html', targetChars: 30 });

  // The heading is longer than a chunk, so no single chunk holds it whole.
  assert.ok(
    !chunks.some(c =>
      c.content.includes('<h2>Returns and gift orders for every customer</h2>')
    )
  );
  const section = ['Store help', 'Returns and gift orders for every customer'];
  assert.deepEqual(chunks[0].path, ['Store help']);
  assert.deepEqual(
    chunks.find(c => c.content.includes('thirty days'))?.path,
    section
  );
  assert.deepEqual(
    chunks.find(c => c.content.includes('customer</h2>'))?.path,
    section
  );
  // The chunk the heading starts in is still the section before it.
  assert.deepEqual(chunks.find(c => c.content.includes('<h2>Returns'))?.path, [
    'Store help'
  ]);
});

test('HTML heading text is stripped of tags and entities', () => {
  const chunks = pathsOf(
    '<h2 class="x">Q&amp;A <em>today</em></h2><p>Body.</p>',
    {
      mimeType: 'text/html'
    }
  );
  assert.deepEqual(chunks[0].path, ['Q&A today']);
});
