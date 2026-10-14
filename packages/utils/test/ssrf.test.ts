// Screening hosts and URLs before fetching them for a user. Run with
// `npm test` (node --test; ssrf.ts imports nothing).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isBlockedHost, isBlockedUrl } from '../src/ssrf.ts';

test('isBlockedHost: loopback, private, link-local and CGNAT IPv4', () => {
  for (const host of [
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '100.64.0.1'
  ]) {
    assert.equal(isBlockedHost(host), true, host);
  }
  for (const host of ['8.8.8.8', '172.32.0.1', '100.128.0.1', '1.1.1.1']) {
    assert.equal(isBlockedHost(host), false, host);
  }
});

test('isBlockedHost: localhost names, with or without a trailing dot', () => {
  assert.equal(isBlockedHost('localhost'), true);
  assert.equal(isBlockedHost('LOCALHOST.'), true);
  assert.equal(isBlockedHost('api.localhost'), true);
  assert.equal(isBlockedHost(''), true);
});

test('isBlockedHost: IPv6 loopback, link-local, unique-local and mapped IPv4', () => {
  for (const host of [
    '[::1]',
    '::',
    'fe80::1',
    'febf::1',
    'fc00::1',
    'fd12:3456::1',
    '[::ffff:127.0.0.1]',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe'
  ]) {
    assert.equal(isBlockedHost(host), true, host);
  }
  assert.equal(isBlockedHost('2606:4700::1111'), false);
  assert.equal(isBlockedHost('::ffff:808:808'), false);
});

test('isBlockedHost: domains that merely start like an IPv6 prefix pass', () => {
  for (const host of ['fdic.gov', 'fcbarcelona.com', 'fe80.example.com']) {
    assert.equal(isBlockedHost(host), false, host);
  }
});

test('isBlockedUrl: scheme, parse failures and hosts as URL parsing sees them', () => {
  assert.equal(isBlockedUrl('https://example.com/docs'), false);
  assert.equal(isBlockedUrl('http://fdic.gov'), false);
  assert.equal(isBlockedUrl('ftp://example.com'), true);
  assert.equal(isBlockedUrl('file:///etc/passwd'), true);
  assert.equal(isBlockedUrl('not a url'), true);
  assert.equal(isBlockedUrl('http://localhost:8080/'), true);
  assert.equal(isBlockedUrl('http://[::ffff:127.0.0.1]/'), true);
  // Decimal and hex spellings are normalised to dotted IPv4 by URL parsing.
  assert.equal(isBlockedUrl('http://2130706433/'), true);
  assert.equal(isBlockedUrl('http://0x7f.0.0.1/'), true);
  assert.equal(isBlockedUrl('http://169.254.169.254/latest/meta-data'), true);
});
