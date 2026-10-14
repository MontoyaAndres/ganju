// What a failed queue job does next. Run with `npm test` (node --test;
// queueFailure.ts imports nothing).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PermanentJobError,
  isPermanentJobError,
  planQueueFailure
} from '../src/queueFailure.ts';

const MAX_RETRIES = 3;

test('permanent failures are reported once, final, and acknowledged', () => {
  for (const attempts of [1, 2, 4, undefined]) {
    assert.deepEqual(planQueueFailure('permanent', attempts, MAX_RETRIES), {
      report: true,
      final: true,
      action: 'ack',
      backoff: null
    });
  }
});

test('ordinary failures retry, and only the last delivery is final', () => {
  for (const attempts of [1, 2, 3]) {
    const plan = planQueueFailure('other', attempts, MAX_RETRIES);
    assert.equal(plan.final, false, `attempt ${attempts}`);
    assert.equal(plan.report, true);
    assert.equal(plan.action, 'retry');
    assert.equal(plan.backoff, null);
  }
  assert.equal(planQueueFailure('other', 4, MAX_RETRIES).final, true);
  assert.equal(planQueueFailure('other', 7, MAX_RETRIES).final, true);
});

test('an unknown attempt count counts as the first delivery', () => {
  assert.equal(planQueueFailure('other', undefined, MAX_RETRIES).final, false);
  assert.equal(planQueueFailure('other', undefined, 0).final, true);
});

test('transient failures retry quietly until the last delivery', () => {
  assert.deepEqual(planQueueFailure('transient', 1, MAX_RETRIES), {
    report: false,
    final: false,
    action: 'retry',
    backoff: 'transient'
  });
  assert.deepEqual(planQueueFailure('transient', 4, MAX_RETRIES), {
    report: true,
    final: true,
    action: 'retry',
    backoff: 'transient'
  });
});

test('rate limits retry with their own backoff and are reported', () => {
  const plan = planQueueFailure('rateLimit', 2, MAX_RETRIES);
  assert.equal(plan.backoff, 'rateLimit');
  assert.equal(plan.report, true);
  assert.equal(plan.final, false);
});

test('isPermanentJobError reads the flag, not the class', () => {
  assert.equal(isPermanentJobError(new PermanentJobError('reconnect')), true);
  assert.equal(
    isPermanentJobError(Object.assign(new Error('x'), { permanent: true })),
    true
  );
  assert.equal(isPermanentJobError(new Error('x')), false);
  assert.equal(isPermanentJobError(null), false);
  assert.equal(isPermanentJobError('permanent'), false);
});
