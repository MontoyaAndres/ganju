// When a failed token refresh flags a credential for a reconnect. Run with
// `npm test` (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  OAuthReauthRequiredError,
  OAuthRefreshError,
  refreshFailureReauthReason
} from '../src/oauth.ts';

const NOW = Date.parse('2026-10-14T12:00:00Z');
const expiredFor = (ms: number) => new Date(NOW - ms);
const HOUR = 60 * 60 * 1000;

test('a reauth code flags the credential at once', () => {
  for (const code of ['invalid_grant', 'invalid_token', 'unauthorized_client']) {
    assert.equal(
      refreshFailureReauthReason(
        new OAuthReauthRequiredError(code),
        expiredFor(0),
        NOW
      ),
      code
    );
  }
});

test('another rejection flags it only after the token has been expired an hour', () => {
  const err = new OAuthRefreshError(400, 'invalid_request', '{}');
  assert.equal(refreshFailureReauthReason(err, expiredFor(HOUR - 1), NOW), null);
  assert.equal(
    refreshFailureReauthReason(err, expiredFor(HOUR), NOW),
    'refresh_rejected:invalid_request'
  );
  assert.equal(
    refreshFailureReauthReason(
      new OAuthRefreshError(403, undefined, 'Forbidden'),
      expiredFor(2 * HOUR),
      NOW
    ),
    'refresh_rejected'
  );
});

test('outages, rate limits, our own client errors and network errors never flag it', () => {
  const longExpired = expiredFor(48 * HOUR);
  for (const err of [
    new OAuthRefreshError(500, undefined, 'oops'),
    new OAuthRefreshError(503, undefined, ''),
    new OAuthRefreshError(429, undefined, ''),
    new OAuthRefreshError(401, 'invalid_client', '{}'),
    new TypeError('fetch failed')
  ]) {
    assert.equal(refreshFailureReauthReason(err, longExpired, NOW), null);
  }
  assert.equal(
    refreshFailureReauthReason(
      new OAuthRefreshError(400, 'invalid_request', '{}'),
      null,
      NOW
    ),
    null
  );
});
