// What ganju.json sends: function manifests and the triggers to deploy.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildManifest, readTriggers } from '../src/project.ts';
import type { LoadedProject } from '../src/project.ts';

const project = (file: Record<string, unknown>): LoadedProject => ({
  root: '/p',
  path: '/p/ganju.json',
  file
});

test('a function for triggers only keeps expose: false in its manifest', () => {
  const { tools } = buildManifest([
    { name: 'notify-kitchen', expose: false },
    { name: 'place-order' }
  ]);
  assert.equal(tools[0].expose, false);
  assert.equal('expose' in tools[1], false);
});

test('triggers: left out means leave them alone; a list is deployed as is', () => {
  assert.equal(readTriggers(project({})), null);
  const triggers = [
    { table: 'orders', on: 'insert', function: 'notify-kitchen' }
  ];
  assert.deepEqual(readTriggers(project({ triggers })), triggers);
  assert.deepEqual(readTriggers(project({ triggers: [] })), []);
  assert.throws(
    () => readTriggers(project({ triggers: { table: 'orders' } })),
    /list of triggers/
  );
});
