// Which tools a confirming session asks about, how a proxied server's own
// hints are kept from deciding that, and where a user's approval stands. Run with `npm test` (node --test; Node
// strips the types itself, and toolConfirmation.ts imports nothing).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isSensitiveProxiedTool,
  isSensitiveTool,
  keepProxiedToolMarks,
  proxiedToolAnnotations,
  proxiedToolTrust,
  toolApprovalStatus,
  toolApprovalUrl
} from '../src/toolConfirmation.ts';

test('a tool is sensitive unless it says it only reads or can be undone', () => {
  assert.equal(isSensitiveTool(undefined), true);
  assert.equal(isSensitiveTool({}), true);
  assert.equal(isSensitiveTool({ readOnlyHint: false }), true);
  assert.equal(isSensitiveTool({ readOnlyHint: true }), false);
  assert.equal(isSensitiveTool({ destructiveHint: false }), false);
});

const trust = (trustHints: boolean, readOnly = false) => ({
  trustHints,
  readOnly
});

test("a proxied server's read-only claim is dropped unless trusted", () => {
  const claimed = {
    title: 'Delete repository',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true
  };
  const untrusted = proxiedToolAnnotations(claimed, trust(false));
  assert.deepEqual(untrusted, {
    title: 'Delete repository',
    openWorldHint: true
  });
  assert.equal(isSensitiveTool(untrusted), true);
  assert.equal(isSensitiveProxiedTool(claimed, trust(false)), true);
  // The stored discovery isn't touched.
  assert.equal(claimed.readOnlyHint, true);

  const trusted = proxiedToolAnnotations(claimed, trust(true));
  assert.deepEqual(trusted, claimed);
  assert.equal(isSensitiveProxiedTool(claimed, trust(true)), false);
  // Trusted, a server's own "this changes things" still counts.
  assert.equal(
    isSensitiveProxiedTool({ destructiveHint: true }, trust(true)),
    true
  );
});

test("the owner's read-only mark wins, trusted or not", () => {
  const deleting = { title: 'Search', destructiveHint: true };
  for (const trustHints of [false, true]) {
    const marked = proxiedToolAnnotations(deleting, trust(trustHints, true));
    assert.deepEqual(marked, { title: 'Search', readOnlyHint: true });
    assert.equal(
      isSensitiveProxiedTool(deleting, trust(trustHints, true)),
      false
    );
  }
  assert.deepEqual(proxiedToolAnnotations(undefined, trust(false, true)), {
    readOnlyHint: true
  });
});

test('a proxied tool with only hints is left with no annotations', () => {
  assert.equal(
    proxiedToolAnnotations({ readOnlyHint: true }, trust(false)),
    undefined
  );
  assert.equal(proxiedToolAnnotations(undefined, trust(false)), undefined);
  assert.equal(proxiedToolAnnotations(null, trust(true)), undefined);
  assert.equal(isSensitiveProxiedTool(undefined, trust(true)), true);
});

test('trust is read from the install config, per remote tool', () => {
  assert.deepEqual(proxiedToolTrust(null, 'search'), trust(false));
  assert.deepEqual(proxiedToolTrust({}, 'search'), trust(false));
  assert.deepEqual(
    proxiedToolTrust(
      { trustAnnotations: true, readOnlyTools: ['search', 'list'] },
      'search'
    ),
    trust(true, true)
  );
  assert.deepEqual(
    proxiedToolTrust({ readOnlyTools: ['search'] }, 'delete'),
    trust(false)
  );
  // Only a real true trusts, and only an array marks.
  assert.deepEqual(
    proxiedToolTrust(
      { trustAnnotations: 'yes', readOnlyTools: 'search' },
      'search'
    ),
    trust(false)
  );
});

test('a save that leaves out the trust marks keeps the stored ones', () => {
  const stored = {
    allowedTools: ['a'],
    trustAnnotations: true,
    readOnlyTools: ['a']
  };
  assert.deepEqual(keepProxiedToolMarks(stored, { allowedTools: ['b'] }), {
    allowedTools: ['b'],
    trustAnnotations: true,
    readOnlyTools: ['a']
  });
  // Sent, even as off or empty, they decide.
  assert.deepEqual(
    keepProxiedToolMarks(stored, {
      allowedTools: ['b'],
      trustAnnotations: false,
      readOnlyTools: []
    }),
    { allowedTools: ['b'], trustAnnotations: false, readOnlyTools: [] }
  );
  assert.deepEqual(keepProxiedToolMarks(null, { allowedTools: [] }), {
    allowedTools: []
  });
  assert.equal(keepProxiedToolMarks(stored, undefined), undefined);
});

test('an approval is pending until answered, and spent or refused for good', () => {
  const now = Date.parse('2026-10-14T12:00:00Z');
  const open = {
    expiresAt: new Date(now + 60_000),
    approvedAt: null,
    deniedAt: null,
    usedAt: null
  };
  const at = new Date(now - 1_000);
  assert.equal(toolApprovalStatus(open, now), 'pending');
  assert.equal(
    toolApprovalStatus({ ...open, approvedAt: at }, now),
    'approved'
  );
  assert.equal(toolApprovalStatus({ ...open, deniedAt: at }, now), 'denied');
  assert.equal(
    toolApprovalStatus({ ...open, approvedAt: at, usedAt: at }, now),
    'used'
  );

  // Past its time, an open or approved-but-unused one can no longer run; an
  // answer already given stays the answer.
  const later = now + 120_000;
  assert.equal(toolApprovalStatus(open, later), 'expired');
  assert.equal(
    toolApprovalStatus({ ...open, approvedAt: at }, later),
    'expired'
  );
  assert.equal(toolApprovalStatus({ ...open, deniedAt: at }, later), 'denied');
  assert.equal(
    toolApprovalStatus({ ...open, approvedAt: at, usedAt: at }, later),
    'used'
  );
  // The boundary itself is closed.
  assert.equal(toolApprovalStatus(open, now + 60_000), 'expired');
});

test('the approval link points at the dashboard page for that id', () => {
  assert.equal(
    toolApprovalUrl('https://app.ganju.ai/', '/tool-approval', 'abc'),
    'https://app.ganju.ai/tool-approval/abc'
  );
  assert.equal(
    toolApprovalUrl('https://app.ganju.ai', '/tool-approval', 'a/b?c'),
    'https://app.ganju.ai/tool-approval/a%2Fb%3Fc'
  );
});
