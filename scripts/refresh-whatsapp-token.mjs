// Swap the access token on a WhatsApp channel, keeping everything else.
//
//   node scripts/refresh-whatsapp-token.mjs                       # list channels and whether their token still works
//   node scripts/refresh-whatsapp-token.mjs <channel-id|project-id>   # prompts for the new token
//   WHATSAPP_TOKEN=EAA… node scripts/refresh-whatsapp-token.mjs <channel>
//   …any of the above with --prod to act on production (.env.prod)
//
// For testing with the temporary token Meta's API Setup page hands out, which
// dies after about an hour. Paste a fresh one here instead of re-creating the
// channel.
//
// The dashboard can't do this alone: updating a channel replaces its whole
// credentials object, and the API never returns the current one, so it would
// mean re-entering the phone number id and app secret every hour. This decrypts
// the stored credentials, replaces `accessToken` only, and encrypts them again
// with the same CRYPTO_SECRET the API uses. The bot decrypts per message, so the
// next message uses the new token.
//
// The new token is tried against the channel's phone number before it is saved;
// one that Meta rejects is not written. It is read from WHATSAPP_TOKEN or a
// prompt, never an argument, so it stays out of shell history.
//
// For anything longer than a test, use a System User token from Meta Business
// Settings: it doesn't expire.
import fs from 'node:fs';
import readline from 'node:readline/promises';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import postgres from 'postgres';

const GRAPH = 'https://graph.facebook.com/v26.0';
const PREFIX = 'enc:v1:';
const NONCE_BYTES = 24;

const args = process.argv.slice(2);
const target = args.find(a => !a.startsWith('--'));
const isProd = args.includes('--prod');

const envFile = isProd ? '../.env.prod' : '../.env';
const env = fs.readFileSync(new URL(envFile, import.meta.url), 'utf8');
const read = key => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();

const rawKey = read('CRYPTO_SECRET');
if (!rawKey) {
  console.error(`${envFile.replace('../', '')} has no CRYPTO_SECRET.`);
  process.exit(1);
}
const key = Buffer.from(rawKey, 'base64');
if (key.length !== 32) {
  console.error(`CRYPTO_SECRET must decode to 32 bytes (got ${key.length}).`);
  process.exit(1);
}

// Same format as utils.encryptString: prefix, then base64(nonce ‖ ciphertext).
const decrypt = value => {
  if (!value.startsWith(PREFIX)) return value;
  const bundle = Buffer.from(value.slice(PREFIX.length), 'base64');
  const cipher = xchacha20poly1305(key, bundle.subarray(0, NONCE_BYTES));
  return Buffer.from(cipher.decrypt(bundle.subarray(NONCE_BYTES))).toString(
    'utf8'
  );
};
const encrypt = plaintext => {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(
    new TextEncoder().encode(plaintext)
  );
  return `${PREFIX}${Buffer.concat([nonce, ciphertext]).toString('base64')}`;
};

// What Meta says about a token on this phone number: the number, or why not.
const probe = async (phoneNumberId, token) => {
  const res = await fetch(
    `${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const body = await res.json().catch(() => ({}));
  return res.ok
    ? {
        ok: true,
        label: `${body.display_phone_number} (${body.verified_name})`
      }
    : { ok: false, label: body.error?.message ?? `HTTP ${res.status}` };
};

const sql = postgres(read('DATABASE_URL'), {
  ssl: 'require',
  max: 1,
  prepare: false
});

const channels = await sql`
  select c.id, c.status, c.credentials,
         p.id as project_id, p.name as project_name, o.name as organization_name
  from channel c
  join artifact a on a.id = c.artifact_id
  join project p on p.id = a.project_id
  join organization o on o.id = p.organization_id
  where c.platform = 'whatsapp'
    ${target ? sql`and (c.id = ${target} or p.id = ${target})` : sql``}
  order by c.created_at`;

if (channels.length === 0) {
  console.error(
    target
      ? `No WhatsApp channel matches "${target}" in ${isProd ? 'production' : 'development'}.`
      : `No WhatsApp channels in ${isProd ? 'production' : 'development'}.`
  );
  await sql.end();
  process.exit(1);
}

console.log(`\n  environment  ${isProd ? 'PRODUCTION' : 'development'}\n`);
for (const channel of channels) {
  channel.creds = JSON.parse(decrypt(channel.credentials));
  const current = await probe(
    channel.creds.phoneNumberId,
    channel.creds.accessToken
  );
  console.log(`  ${channel.id}  WhatsApp · ${channel.status}`);
  console.log(
    `    project    ${channel.project_name} in ${channel.organization_name} (${channel.project_id})`
  );
  console.log(
    `    token      ${current.ok ? `works — ${current.label}` : `FAILS — ${current.label}`}\n`
  );
}

if (channels.length > 1) {
  console.log(
    target
      ? '  More than one matches; pass the channel id.\n'
      : '  Pass a channel id (or a project id with one WhatsApp channel) to replace its token.\n'
  );
  await sql.end();
  process.exit(0);
}

const [channel] = channels;

let token = process.env.WHATSAPP_TOKEN?.trim();
if (!token && !process.stdin.isTTY) {
  console.error(
    '  No terminal to prompt on. Pass the token as WHATSAPP_TOKEN=… instead.'
  );
  await sql.end();
  process.exit(1);
}
if (!token) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  token = (await rl.question('  New access token: ')).trim();
  rl.close();
}
if (!token) {
  console.error('  No token given; nothing changed.');
  await sql.end();
  process.exit(1);
}

const next = await probe(channel.creds.phoneNumberId, token);
if (!next.ok) {
  console.error(
    `\n  Meta rejected that token: ${next.label}\n  Nothing changed.\n`
  );
  await sql.end();
  process.exit(1);
}

await sql`
  update channel
     set credentials = ${encrypt(JSON.stringify({ ...channel.creds, accessToken: token }))},
         updated_at = now()
   where id = ${channel.id}`;

console.log(
  `\n  Saved. The ${channel.project_name} channel now sends as ${next.label}; the next message uses the new token.\n`
);

await sql.end();
