// Verifies the time-zone cache helpers and the resolution precedence.
// Pure logic only — no vendor calls, no credentials decrypted. The two vendor
// readers are exercised against a stubbed fetch so the parsing and the
// degrade-to-null contract are covered without leaving the machine.
import { utils } from '../packages/utils/dist/index.js';

let pass = 0,
  fail = 0;
const ok = (name, cond, got) =>
  cond
    ? (pass++, console.log('  ok   ' + name))
    : (fail++,
      console.log('  FAIL ' + name + '   got: ' + JSON.stringify(got)));

console.log('\nisValidTimeZone');
ok('accepts a real IANA zone', utils.isValidTimeZone('America/Bogota'));
ok('accepts UTC', utils.isValidTimeZone('UTC'));
ok('trims', utils.isValidTimeZone('  Europe/Madrid  '));
ok('rejects nonsense', !utils.isValidTimeZone('Mars/Olympus'));
ok('rejects empty', !utils.isValidTimeZone('   '));
ok('rejects non-string', !utils.isValidTimeZone(42));
ok(
  'rejects null/undefined',
  !utils.isValidTimeZone(null) && !utils.isValidTimeZone(undefined)
);

console.log('\nreadCredentialTimeZone');
ok(
  'reads a stored zone',
  utils.readCredentialTimeZone({ timeZone: 'Europe/Madrid' }) ===
    'Europe/Madrid'
);
ok(
  'trims on read',
  utils.readCredentialTimeZone({ timeZone: ' Asia/Tokyo ' }) === 'Asia/Tokyo'
);
ok('null on missing', utils.readCredentialTimeZone({}) === null);
ok('null on absent metadata', utils.readCredentialTimeZone(null) === null);
ok(
  'null on an invalid stored value — never hands a poisoned zone downstream',
  utils.readCredentialTimeZone({ timeZone: 'Nowhere/Fake' }) === null
);

console.log('\nwriteCredentialTimeZone');
const withReauth = {
  needsReauth: true,
  reauthReason: 'invalid_grant',
  label: 'x'
};
const merged = utils.writeCredentialTimeZone(withReauth, 'America/Bogota');
ok(
  'preserves needsReauth — the whole reason this merges',
  merged.needsReauth === true,
  merged
);
ok(
  'preserves other keys',
  merged.reauthReason === 'invalid_grant' && merged.label === 'x',
  merged
);
ok('writes the zone', merged.timeZone === 'America/Bogota', merged);
ok('stamps the check', typeof merged.timeZoneCheckedAt === 'string', merged);
const cleared = utils.writeCredentialTimeZone(
  { timeZone: 'Europe/Madrid' },
  null
);
ok(
  'a null zone removes the stale value',
  cleared.timeZone === undefined,
  cleared
);
ok(
  'a null zone still stamps — asks once a day, not every call',
  typeof cleared.timeZoneCheckedAt === 'string',
  cleared
);
const invalidWrite = utils.writeCredentialTimeZone({}, 'Not/AZone');
ok(
  'an invalid zone is not stored',
  invalidWrite.timeZone === undefined,
  invalidWrite
);
ok(
  'writes from null metadata',
  utils.writeCredentialTimeZone(null, 'UTC').timeZone === 'UTC'
);

console.log('\ncredentialTimeZoneIsStale');
const now = Date.now();
const fresh = {
  timeZone: 'UTC',
  timeZoneCheckedAt: new Date(now - 1000).toISOString()
};
const old = {
  timeZone: 'UTC',
  timeZoneCheckedAt: new Date(now - 25 * 3600 * 1000).toISOString()
};
ok('fresh is not stale', !utils.credentialTimeZoneIsStale(fresh, now));
ok('past the TTL is stale', utils.credentialTimeZoneIsStale(old, now));
ok('nothing cached is stale', utils.credentialTimeZoneIsStale({}, now));
ok(
  'no stamp is stale, not fresh-forever',
  utils.credentialTimeZoneIsStale({ timeZone: 'UTC' }, now)
);
ok(
  'unparseable stamp is stale',
  utils.credentialTimeZoneIsStale(
    { timeZone: 'UTC', timeZoneCheckedAt: 'soon' },
    now
  )
);
ok(
  'exactly at the TTL is stale',
  utils.credentialTimeZoneIsStale(
    {
      timeZone: 'UTC',
      timeZoneCheckedAt: new Date(now - 24 * 3600 * 1000).toISOString()
    },
    now
  )
);

console.log('\nvendor readers (stubbed fetch — no network)');
const realFetch = globalThis.fetch;
const stub = impl => {
  globalThis.fetch = impl;
};

stub(async url => {
  ok(
    'google reads the primary calendar, not calendarList',
    String(url).endsWith('/calendars/primary'),
    String(url)
  );
  return { ok: true, json: async () => ({ timeZone: 'America/Bogota' }) };
});
ok(
  'google returns the zone',
  (await utils.fetchGoogleCalendarTimeZone('t')) === 'America/Bogota'
);

stub(async () => ({ ok: false, json: async () => ({}) }));
ok(
  'google null on non-200',
  (await utils.fetchGoogleCalendarTimeZone('t')) === null
);

stub(async () => {
  throw new Error('network down');
});
ok(
  'google null on throw — never fails the caller',
  (await utils.fetchGoogleCalendarTimeZone('t')) === null
);

stub(async () => ({ ok: true, json: async () => ({ timeZone: 'Bad/Zone' }) }));
ok(
  'google null on an unusable zone',
  (await utils.fetchGoogleCalendarTimeZone('t')) === null
);

stub(async (url, init) => {
  ok('calcom hits /v2/me', String(url).endsWith('/v2/me'), String(url));
  ok(
    'calcom sends the version header',
    !!init?.headers?.['cal-api-version'],
    init?.headers
  );
  return {
    ok: true,
    json: async () => ({ data: { timeZone: 'Europe/Madrid' } })
  };
});
ok(
  'calcom reads data.timeZone',
  (await utils.fetchCalcomTimeZone('k')) === 'Europe/Madrid'
);

stub(async () => ({ ok: true, json: async () => ({ data: {} }) }));
ok(
  'calcom null when the profile has no zone',
  (await utils.fetchCalcomTimeZone('k')) === null
);

stub(async () => ({ ok: false, json: async () => ({}) }));
ok('calcom null on 401', (await utils.fetchCalcomTimeZone('k')) === null);

globalThis.fetch = realFetch;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
