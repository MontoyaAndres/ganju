// What one install counts toward the plan's tool limit. Run with `npm test`
// (node --test; toolCount.ts imports nothing).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { countInstallTools } from '../src/toolCount.ts';

const github = (allowedTools?: unknown) => ({
  toolKey: 'mcp-proxy',
  config: { prefix: 'github', allowedTools },
  metadata: {
    discovery: {
      tools: [
        { name: 'search_repositories' },
        { name: 'list_issues' },
        { name: 'create_issue' }
      ]
    }
  }
});

test('a native or http-endpoint install is one tool', () => {
  assert.equal(
    countInstallTools({
      toolKey: 'gmail-send-email',
      config: null,
      metadata: null
    }),
    1
  );
  assert.equal(
    countInstallTools({ toolKey: 'http-endpoint', config: {}, metadata: null }),
    1
  );
  assert.equal(
    countInstallTools({ toolKey: 'custom-code', config: {}, metadata: null }),
    1
  );
});

test('an MCP server with no allow-list counts every discovered tool', () => {
  assert.equal(countInstallTools(github()), 3);
  assert.equal(countInstallTools(github([])), 3);
});

test('an MCP server counts only the allowed tools it discovered', () => {
  assert.equal(countInstallTools(github(['list_issues'])), 1);
  // A name the server no longer lists registers nothing, so it isn't counted.
  assert.equal(countInstallTools(github(['list_issues', 'gone'])), 1);
});

test('an MCP server with no stored discovery counts nothing', () => {
  assert.equal(
    countInstallTools({
      toolKey: 'mcp-proxy',
      config: { allowedTools: ['a'] },
      metadata: null
    }),
    0
  );
  assert.equal(
    countInstallTools({
      toolKey: 'mcp-proxy',
      config: null,
      metadata: { discovery: {} }
    }),
    0
  );
});

test('a custom-code script counts its published functions the allow-list keeps', () => {
  const script = (allowedTools?: string[]) => ({
    toolKey: 'custom-code',
    config: { activeVersionId: 'v1', allowedTools },
    metadata: null
  });
  assert.equal(countInstallTools(script(), ['a', 'b', 'c']), 3);
  assert.equal(countInstallTools(script([]), ['a', 'b', 'c']), 3);
  assert.equal(countInstallTools(script(['b', 'gone']), ['a', 'b', 'c']), 1);
  assert.equal(countInstallTools(script(), []), 0);
  // Without its functions, the row is one.
  assert.equal(countInstallTools(script()), 1);
});
