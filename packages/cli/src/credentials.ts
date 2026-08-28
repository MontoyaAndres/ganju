import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { CliError } from './errors.js';

/**
 * Where the CLI keeps what it is not willing to ask for twice: the registered
 * OAuth client id, and the tokens a login produced.
 *
 * Keyed by API origin, because a contributor running against a local API and
 * against production is the ordinary case, not the exotic one — and a single
 * token slot would silently log them out of one every time they touched the
 * other. The registered client id is keyed the same way for the same reason: it
 * is a row in one deployment's database and means nothing in another.
 */
export interface StoredAccount {
  clientId: string;
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds. Absent when the server declined to say. */
  expiresAt?: number;
}

interface CredentialsFile {
  version: 1;
  accounts: Record<string, StoredAccount>;
}

export const credentialsPath = (): string =>
  join(
    process.env.GANJU_CONFIG_DIR ?? join(homedir(), '.ganju'),
    'credentials.json'
  );

const empty = (): CredentialsFile => ({ version: 1, accounts: {} });

const readFileSafely = async (): Promise<CredentialsFile> => {
  let raw: string;
  try {
    raw = await readFile(credentialsPath(), 'utf8');
  } catch {
    return empty();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CredentialsFile>;
    if (!parsed.accounts || typeof parsed.accounts !== 'object') return empty();
    return {
      version: 1,
      accounts: parsed.accounts as Record<string, StoredAccount>
    };
  } catch {
    // A corrupt store is recoverable by logging in again, and refusing to run
    // until the user deletes a file they never knew existed is not a service.
    return empty();
  }
};

const writeFileSafely = async (contents: CredentialsFile): Promise<void> => {
  const path = credentialsPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(contents, null, 2), { mode: 0o600 });
  // mkdir/writeFile only apply a mode when they create the file, so a store
  // written before this line existed keeps whatever it had. Set it every time.
  await chmod(path, 0o600);
};

export const readAccount = async (
  apiUrl: string
): Promise<StoredAccount | null> => {
  const file = await readFileSafely();
  return file.accounts[apiUrl] ?? null;
};

export const writeAccount = async (
  apiUrl: string,
  account: StoredAccount
): Promise<void> => {
  const file = await readFileSafely();
  file.accounts[apiUrl] = account;
  await writeFileSafely(file);
};

export const clearAccount = async (apiUrl: string): Promise<boolean> => {
  const file = await readFileSafely();
  if (!file.accounts[apiUrl]) return false;
  delete file.accounts[apiUrl];
  if (Object.keys(file.accounts).length === 0) {
    await rm(credentialsPath(), { force: true });
    return true;
  }
  await writeFileSafely(file);
  return true;
};

/**
 * The registered client id survives a logout; the tokens do not.
 *
 * Registration is a row in the authorization server, not a credential — keeping
 * it means `ganju login` after `ganju logout` reuses the client it already has
 * instead of leaving a second orphan behind on every cycle.
 */
export const rememberClientId = async (
  apiUrl: string,
  clientId: string
): Promise<void> => {
  const file = await readFileSafely();
  const existing = file.accounts[apiUrl];
  file.accounts[apiUrl] = existing
    ? { ...existing, clientId }
    : { clientId, accessToken: '' };
  await writeFileSafely(file);
};

export const requireAccount = async (
  apiUrl: string
): Promise<StoredAccount> => {
  const account = await readAccount(apiUrl);
  if (!account?.accessToken) {
    throw new CliError(`Not logged in to ${apiUrl}`, {
      hint: 'Run `ganju login` first, or set GANJU_API_TOKEN for a non-interactive machine.'
    });
  }
  return account;
};
