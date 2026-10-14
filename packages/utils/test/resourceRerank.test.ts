// Reading the Workers AI reranker's answer into one score per document. Run with
// `npm test` (node --test; resourceRerank.ts imports its siblings, which
// resolveSourceImports.mjs lets Node find).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createResourceReranker } from '../src/resourceRerank.ts';
import type { RerankAiBinding } from '../src/resourceRerank.ts';

const withResponse = (response: unknown) => {
  const calls: Array<{ model: string; input: unknown }> = [];
  const AI: RerankAiBinding = {
    run: async (model, input) => {
      calls.push({ model, input });
      return response;
    }
  };
  return { rerank: createResourceReranker({ env: { AI } }, true)!, calls };
};

test('no AI binding means no reranker', () => {
  assert.equal(createResourceReranker({ env: {} }, true), undefined);
  assert.equal(createResourceReranker({}, true), undefined);
});

test('off unless asked for: the default leaves the fused order', () => {
  const AI: RerankAiBinding = { run: async () => ({ response: [] }) };
  assert.equal(createResourceReranker({ env: { AI } }), undefined);
  assert.equal(createResourceReranker({ env: { AI } }, false), undefined);
  assert.equal(
    typeof createResourceReranker({ env: { AI } }, true),
    'function'
  );
});

test('scores come back in input order, whatever order the model ranked them', async () => {
  const { rerank, calls } = withResponse({
    response: [
      { id: 2, score: 0.9 },
      { id: 0, score: 0.4 },
      { id: 1, score: 0.1 }
    ]
  });
  assert.deepEqual(await rerank('q', ['a', 'b', 'c']), [0.4, 0.1, 0.9]);
  assert.deepEqual(calls[0].input, {
    query: 'q',
    contexts: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
    top_k: 3
  });
});

test('a response that leaves a document out is no ranking at all', async () => {
  const { rerank } = withResponse({
    response: [
      { id: 0, score: 0.4 },
      { id: 2, score: 0.9 }
    ]
  });
  assert.equal(await rerank('q', ['a', 'b', 'c']), null);
});

test('malformed and out-of-range entries are ignored, not trusted', async () => {
  const { rerank } = withResponse({
    response: [
      { id: 0, score: 0.4 },
      { id: 1, score: 'high' },
      { id: 5, score: 0.9 },
      { id: -1, score: 0.9 },
      { score: 0.2 }
    ]
  });
  assert.equal(await rerank('q', ['a', 'b']), null);
});

test('an empty or missing response is null', async () => {
  assert.equal(await withResponse({}).rerank('q', ['a']), null);
  assert.equal(await withResponse(null).rerank('q', ['a']), null);
});
