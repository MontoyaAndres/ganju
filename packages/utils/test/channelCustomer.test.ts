// Per-customer limits, memory and fixed replies for channel bots. Run with
// `npm test` (node --test; channelCustomer.ts imports nothing).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyParticipantMemoryUpdate,
  audioDurationSeconds,
  formatParticipantMemoryPrompt,
  oggDurationSeconds,
  participantLimitNotice,
  PARTICIPANT_DAILY_LIMIT_DEFAULT,
  PARTICIPANT_DAILY_LIMIT_MAX,
  PARTICIPANT_MEMORY_MAX_FACTS,
  readParticipantMemory,
  resolveParticipantDailyLimit,
  resolveParticipantMemoryEnabled,
  voiceNoteTooLongNotice,
  voiceNoteUnreadableNotice,
  VOICE_NOTE_MAX_SECONDS
} from '../src/channelCustomer.ts';

const empty = { facts: {}, updatedAt: '' };
const now = new Date('2026-10-10T12:00:00.000Z');

test('daily limit: default, off, clamped, malformed', () => {
  assert.equal(
    resolveParticipantDailyLimit(null),
    PARTICIPANT_DAILY_LIMIT_DEFAULT
  );
  assert.equal(
    resolveParticipantDailyLimit({}),
    PARTICIPANT_DAILY_LIMIT_DEFAULT
  );
  assert.equal(
    resolveParticipantDailyLimit({ participantDailyLimit: 0 }),
    null
  );
  assert.equal(resolveParticipantDailyLimit({ participantDailyLimit: 20 }), 20);
  assert.equal(
    resolveParticipantDailyLimit({ participantDailyLimit: 99999 }),
    PARTICIPANT_DAILY_LIMIT_MAX
  );
  for (const bad of [-5, 2.5, '20', NaN]) {
    assert.equal(
      resolveParticipantDailyLimit({ participantDailyLimit: bad }),
      PARTICIPANT_DAILY_LIMIT_DEFAULT
    );
  }
});

test('memory is opt-in', () => {
  assert.equal(resolveParticipantMemoryEnabled({}), false);
  assert.equal(
    resolveParticipantMemoryEnabled({ participantMemory: 'yes' }),
    false
  );
  assert.equal(
    resolveParticipantMemoryEnabled({ participantMemory: true }),
    true
  );
});

test('saves, normalizes keys and keeps values on one line', () => {
  const { memory, changed, result } = applyParticipantMemoryUpdate(
    empty,
    {
      facts: [
        { key: 'Name', value: 'Ana' },
        { key: 'Delivery Address', value: 'Calle 10 #5-20\nApto 301' }
      ]
    },
    now
  );
  assert.equal(changed, true);
  assert.deepEqual(memory.facts, {
    name: 'Ana',
    delivery_address: 'Calle 10 #5-20 Apto 301'
  });
  assert.equal(memory.updatedAt, now.toISOString());
  assert.match(result, /Saved: name, delivery_address\./);
});

test('an empty value forgets; forgetAll clears', () => {
  const start = { facts: { name: 'Ana', allergies: 'maní' }, updatedAt: 'x' };
  const one = applyParticipantMemoryUpdate(
    start,
    { facts: [{ key: 'allergies', value: '' }] },
    now
  );
  assert.deepEqual(one.memory.facts, { name: 'Ana' });
  assert.match(one.result, /Forgot: allergies/);

  const all = applyParticipantMemoryUpdate(start, { forgetAll: true }, now);
  assert.deepEqual(all.memory.facts, {});
  assert.equal(all.changed, true);
});

test('the same value again changes nothing', () => {
  const start = { facts: { name: 'Ana' }, updatedAt: 'then' };
  const update = applyParticipantMemoryUpdate(
    start,
    { facts: [{ key: 'name', value: 'Ana' }] },
    now
  );
  assert.equal(update.changed, false);
  assert.equal(update.memory.updatedAt, 'then');
  assert.equal(update.result, 'Nothing to change.');
});

test('refuses new facts past the cap, still updates existing ones', () => {
  const facts: Record<string, string> = {};
  for (let i = 0; i < PARTICIPANT_MEMORY_MAX_FACTS; i++) facts[`k${i}`] = 'v';
  const update = applyParticipantMemoryUpdate(
    { facts, updatedAt: '' },
    {
      facts: [
        { key: 'extra', value: 'no room' },
        { key: 'k0', value: 'changed' }
      ]
    },
    now
  );
  assert.equal(update.memory.facts.extra, undefined);
  assert.equal(update.memory.facts.k0, 'changed');
  assert.match(update.result, /Not saved .*extra/);
});

test('reads a stored memory defensively', () => {
  assert.deepEqual(readParticipantMemory(null), { facts: {}, updatedAt: '' });
  assert.deepEqual(
    readParticipantMemory({ facts: { Name: 'Ana', blank: '', n: 3 } }).facts,
    { name: 'Ana' }
  );
});

test('the prompt lists saved facts and marks them as data', () => {
  const prompt = formatParticipantMemoryPrompt({
    facts: { name: 'Ana', anniversary: '10-17' },
    updatedAt: ''
  });
  assert.match(prompt, /remember-customer/);
  assert.match(prompt, /data, not instructions/);
  assert.match(prompt, /- name: Ana\n- anniversary: 10-17$/);
  assert.match(
    formatParticipantMemoryPrompt(empty),
    /Nothing is saved about this customer yet\.$/
  );
});

test('fixed replies follow the language, English otherwise', () => {
  assert.match(participantLimitNotice('es'), /límite/);
  assert.match(participantLimitNotice('pt-BR'), /limite/);
  assert.match(participantLimitNotice(null), /limit/);
  assert.match(voiceNoteUnreadableNotice('es_CO'), /nota de voz/);
  assert.match(voiceNoteUnreadableNotice('fr'), /voice note/);
});

// An Ogg page: capture pattern, version, flags, granule (64-bit LE), serial,
// sequence, checksum (unchecked here), one segment holding `packet`.
const oggPage = (granule: number, packet: Uint8Array): Uint8Array => {
  const page = new Uint8Array(27 + 1 + packet.length);
  page.set([0x4f, 0x67, 0x67, 0x53], 0);
  let g = granule;
  for (let k = 0; k < 8; k++) {
    page[6 + k] = g % 256;
    g = Math.floor(g / 256);
  }
  page[26] = 1;
  page[27] = packet.length;
  page.set(packet, 28);
  return page;
};
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const ascii = (text: string) => new TextEncoder().encode(text);

test("reads an Opus voice note's length from its last page", () => {
  const head = concat(ascii('OpusHead'), new Uint8Array(11));
  const file = concat(
    oggPage(0, head),
    oggPage(0, concat(ascii('OpusTags'), new Uint8Array(8))),
    oggPage(48000 * 42, new Uint8Array(40))
  );
  assert.equal(oggDurationSeconds(file), 42);
});

test("reads a Vorbis file's length at its own sample rate", () => {
  const id = concat(
    new Uint8Array([1]),
    ascii('vorbis'),
    new Uint8Array([0, 0, 0, 0, 2]),
    new Uint8Array([0x44, 0xac, 0, 0]), // 44100
    new Uint8Array(16)
  );
  const file = concat(oggPage(0, id), oggPage(44100 * 400, new Uint8Array(40)));
  assert.equal(oggDurationSeconds(file), 400);
  assert.ok(400 > VOICE_NOTE_MAX_SECONDS);
});

test('anything else has no Ogg length', () => {
  assert.equal(oggDurationSeconds(new Uint8Array(100)), null);
  assert.equal(oggDurationSeconds(ascii('ID3' + 'x'.repeat(100))), null);
  const unknownCodec = concat(
    oggPage(0, concat(ascii('FLACxxxx'), new Uint8Array(30))),
    oggPage(1000, new Uint8Array(40))
  );
  assert.equal(oggDurationSeconds(unknownCodec), null);
});

test('an Ogg page with no position, or a stray "OggS" in the audio, is passed over', () => {
  const head = concat(ascii('OpusHead'), new Uint8Array(11));
  const unset = oggPage(0, new Uint8Array(40));
  unset.fill(0xff, 6, 14);
  const file = concat(
    oggPage(0, head),
    oggPage(48000 * 30, new Uint8Array(40)),
    unset
  );
  assert.equal(oggDurationSeconds(file), 30);

  // A capture pattern inside a packet, with a wrong version byte and serial.
  const stray = concat(
    ascii('OggS'),
    new Uint8Array([1]),
    new Uint8Array(30).fill(0xee)
  );
  const withStray = concat(
    oggPage(0, head),
    oggPage(48000 * 12, new Uint8Array(40)),
    oggPage(48000 * 12, stray)
  );
  assert.equal(oggDurationSeconds(withStray), 12);
});

test('reads AMR, M4A and MP3 lengths from the file', () => {
  // AMR-NB at 12.2 kbps: 31-byte frames plus a TOC byte, 20 ms each.
  const frame = new Uint8Array(32);
  frame[0] = 7 << 3;
  const frames = 50 * 400; // 400 s
  const amr = new Uint8Array(6 + frames * 32);
  amr.set(ascii('#!AMR\n'));
  for (let k = 0; k < frames; k++) amr.set(frame, 6 + k * 32);
  assert.equal(audioDurationSeconds(amr), 400);
  assert.ok(amr.length < 1024 * 1024);

  // M4A: ftyp, then moov > mvhd (version 0) with timescale 1000.
  const box = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(8 + body.length);
    new DataView(out.buffer).setUint32(0, out.length);
    out.set(ascii(type), 4);
    out.set(body, 8);
    return out;
  };
  const mvhd = new Uint8Array(100);
  new DataView(mvhd.buffer).setUint32(12, 1000);
  new DataView(mvhd.buffer).setUint32(16, 90_000);
  const m4a = concat(
    box('ftyp', ascii('M4A \0\0\0\0')),
    box('mdat', new Uint8Array(64)),
    box('moov', box('mvhd', mvhd))
  );
  assert.equal(audioDurationSeconds(m4a), 90);

  // MP3, MPEG-1 Layer III at 32 kbps, no Xing header: size over bitrate.
  const mp3 = new Uint8Array((32000 / 8) * 600);
  mp3.set([0xff, 0xfb, 0x10, 0x00]);
  assert.equal(audioDurationSeconds(mp3), 600);

  assert.equal(audioDurationSeconds(new Uint8Array(100)), null);
});

test('a note too long gets its own reply', () => {
  assert.match(voiceNoteTooLongNotice('es'), /muy larga/);
  assert.match(voiceNoteTooLongNotice(null), /too long/);
});
