/**
 * Provision (or repair) the bot OAuth client row that `/link` authenticates as.
 *
 * `BOT_OAUTH_CLIENT_ID` / `BOT_OAUTH_CLIENT_SECRET` name a client that has to
 * exist in `oauth_client`; without the row, `authenticateBotClient` rejects
 * every call and channel bots answer "Could not start account linking". The
 * same client backs the bot-on-behalf-of token grant.
 *
 * It cannot be created through `/auth/oauth2/register` — that route issues its
 * own id and secret, and these two are fixed by the Worker's environment. Hence
 * this script.
 *
 * Since the move to `@better-auth/oauth-provider`, the secret is stored hashed
 * (SHA-256, unpadded base64url), so a hand-written INSERT that stores the
 * plaintext will authenticate as "Bad client secret" — this writes the hash.
 *
 * Usage (dev):
 *   npx dotenv -e .env -- node scripts/provision-bot-client.mjs
 * Usage (prod):
 *   npx dotenv -e .env.prod -- node scripts/provision-bot-client.mjs
 *
 * Idempotent: re-running updates the existing row in place.
 */
import postgres from 'postgres';
import crypto from 'node:crypto';

const { DATABASE_URL, BOT_OAUTH_CLIENT_ID, BOT_OAUTH_CLIENT_SECRET } =
  process.env;

const missing = [
  ['DATABASE_URL', DATABASE_URL],
  ['BOT_OAUTH_CLIENT_ID', BOT_OAUTH_CLIENT_ID],
  ['BOT_OAUTH_CLIENT_SECRET', BOT_OAUTH_CLIENT_SECRET]
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length) {
  console.error(`Missing required env: ${missing.join(', ')}`);
  process.exit(1);
}

const clientId = BOT_OAUTH_CLIENT_ID.trim();
const clientSecret = BOT_OAUTH_CLIENT_SECRET.trim();

// Matches the plugin's `defaultHasher`: SHA-256 → base64url, unpadded.
const hashedSecret = crypto
  .createHash('sha256')
  .update(clientSecret, 'utf8')
  .digest('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

const sql = postgres(DATABASE_URL, { max: 1 });

try {
  const [existing] = await sql`
    SELECT client_id FROM oauth_client WHERE client_id = ${clientId}
  `;

  // This client never runs a browser redirect flow — it authenticates with its
  // own credentials on the custom bot grant — so it holds no redirect URIs.
  // `redirect_uris` is NOT NULL, hence the empty array.
  if (existing) {
    await sql`
      UPDATE oauth_client
      SET client_secret = ${hashedSecret},
          disabled = false,
          public = false,
          updated_at = now()
      WHERE client_id = ${clientId}
    `;
    console.log(`Updated bot client ${clientId.slice(0, 6)}… (secret rehashed)`);
  } else {
    await sql`
      INSERT INTO oauth_client (
        id, client_id, client_secret, name, disabled, public,
        redirect_uris, grant_types, skip_consent, created_at, updated_at
      ) VALUES (
        ${crypto.randomUUID()}, ${clientId}, ${hashedSecret},
        'Ganju channel bot', false, false,
        ${sql.array([])}, ${sql.array(['urn:ganju:bot-on-behalf-of'])},
        true, now(), now()
      )
    `;
    console.log(`Created bot client ${clientId.slice(0, 6)}…`);
  }

  const [row] = await sql`
    SELECT client_secret = ${hashedSecret} AS secret_ok, disabled
    FROM oauth_client WHERE client_id = ${clientId}
  `;
  console.log(
    `Verified: secret matches env = ${row.secret_ok}, disabled = ${row.disabled}`
  );
} finally {
  await sql.end();
}
