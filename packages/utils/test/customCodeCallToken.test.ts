// The call token the dispatcher signs per function run: it names the
// function for ctx.data, so the script can't claim to be another.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  mintCustomCodeCallToken,
  mintCustomCodeToken,
  verifyCustomCodeCallToken,
  verifyCustomCodeToken
} from '../src/customCodeToken.ts';

const SECRET = 'test-secret';
const CALL = {
  artifactId: 'artifact-1',
  versionId: 'version-1',
  tool: 'sales-report',
  ttlMs: 30_000
};

test('a call token names its function until it expires', async () => {
  const now = Date.now();
  const token = await mintCustomCodeCallToken(CALL, SECRET, now);
  const payload = await verifyCustomCodeCallToken(token, SECRET, now);
  assert.equal(payload?.tool, 'sales-report');
  assert.equal(payload?.versionId, 'version-1');
  assert.equal(
    await verifyCustomCodeCallToken(token, SECRET, now + 31_000),
    null
  );
  assert.equal(
    await verifyCustomCodeCallToken(token, 'other-secret', now),
    null
  );
});

test('a call token is not a tool token, nor the other way round', async () => {
  const call = await mintCustomCodeCallToken(CALL, SECRET);
  assert.equal(await verifyCustomCodeToken(call, SECRET), null);
  const tool = await mintCustomCodeToken(
    { artifactId: 'artifact-1', versionId: 'version-1' },
    SECRET
  );
  assert.equal(await verifyCustomCodeCallToken(tool, SECRET), null);
});

test('renaming the function in a call token breaks its signature', async () => {
  const token = await mintCustomCodeCallToken(CALL, SECRET);
  const [payload, signature] = token.split('.');
  const json = JSON.parse(Buffer.from(payload, 'base64url').toString());
  const forged = Buffer.from(
    JSON.stringify({ ...json, tool: 'place-order' })
  ).toString('base64url');
  assert.equal(
    await verifyCustomCodeCallToken(`${forged}.${signature}`, SECRET),
    null
  );
});

test('a run a trigger started carries the trigger and its depth', async () => {
  const token = await mintCustomCodeCallToken(
    { ...CALL, trigger: { id: 'trg_1', depth: 2 } },
    SECRET
  );
  const payload = await verifyCustomCodeCallToken(token, SECRET);
  assert.deepEqual(payload?.trigger, { id: 'trg_1', depth: 2 });
  const plain = await verifyCustomCodeCallToken(
    await mintCustomCodeCallToken(CALL, SECRET),
    SECRET
  );
  assert.equal(plain?.trigger, undefined);
});
