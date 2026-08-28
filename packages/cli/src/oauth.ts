import { createHash, randomBytes } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from 'node:http';
import { spawn } from 'node:child_process';
import * as constants from '@ganju/utils/cliConstants';

import { CliError } from './errors.js';
import {
  rememberClientId,
  readAccount,
  writeAccount,
  type StoredAccount
} from './credentials.js';
import { color, note, step } from './output.js';

/**
 * Signing in from a terminal, through the authorization server every MCP client
 * already uses.
 *
 * This is the loopback redirect of RFC 8252 — the CLI holds a port open, sends
 * the browser to the authorize endpoint, and reads the code off the redirect. It
 * is what `wrangler`, `gh` and `vercel` do, and it is the flow the installed
 * provider actually supports: the plugin implements `authorization_code`,
 * `client_credentials` and `refresh_token` and no device grant, so a device-code
 * login would mean writing that grant before writing this command.
 *
 * The client is public — no secret, PKCE instead. A secret shipped in an npm
 * package is a secret every user of the package has.
 */

interface Endpoints {
  authorization: string;
  token: string;
  registration: string;
}

const discover = async (apiUrl: string): Promise<Endpoints> => {
  const response = await fetch(
    `${apiUrl}/.well-known/oauth-authorization-server`
  ).catch((error: unknown) => {
    throw new CliError(`Could not reach ${apiUrl} — ${String(error)}`, {
      hint: 'Check the URL, or set GANJU_API_URL to point somewhere else.'
    });
  });
  if (!response.ok) {
    throw new CliError(
      `${apiUrl} did not answer with OAuth metadata (HTTP ${response.status})`
    );
  }
  const metadata = (await response.json()) as {
    authorization_endpoint?: string;
    token_endpoint?: string;
    registration_endpoint?: string;
  };
  if (
    !metadata.authorization_endpoint ||
    !metadata.token_endpoint ||
    !metadata.registration_endpoint
  ) {
    throw new CliError(
      `${apiUrl} advertises an incomplete OAuth metadata document`
    );
  }
  return {
    authorization: metadata.authorization_endpoint,
    token: metadata.token_endpoint,
    registration: metadata.registration_endpoint
  };
};

const redirectUris = (): string[] =>
  constants.CLI_OAUTH_REDIRECT_PORTS.map(
    port => `http://127.0.0.1:${port}${constants.CLI_OAUTH_REDIRECT_PATH}`
  );

/**
 * Register this CLI as a client, once per deployment it is used against.
 *
 * Dynamic registration (RFC 7591) is open on this server because MCP clients
 * need it, and using it here means a fresh `npm i -g` needs no client id anyone
 * had to provision by hand — the one manual step that has bitten this codebase
 * before.
 */
const registerClient = async (
  apiUrl: string,
  endpoints: Endpoints
): Promise<string> => {
  const response = await fetch(endpoints.registration, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: constants.CLI_OAUTH_CLIENT_NAME,
      // Every candidate port, not only the one this run will use — see the
      // note on CLI_OAUTH_REDIRECT_PORTS.
      redirect_uris: redirectUris(),
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: constants.CLI_OAUTH_SCOPES.join(' ')
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new CliError(
      `Could not register the CLI with ${apiUrl} (HTTP ${response.status})`,
      { hint: detail.slice(0, 300) || undefined }
    );
  }

  const registered = (await response.json()) as { client_id?: string };
  if (!registered.client_id) {
    throw new CliError(
      'The authorization server registered the CLI without a client id'
    );
  }
  await rememberClientId(apiUrl, registered.client_id);
  return registered.client_id;
};

const base64url = (input: Buffer): string =>
  input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const openBrowser = (url: string): void => {
  const command =
    process.platform === 'darwin'
      ? { file: 'open', args: [url] }
      : process.platform === 'win32'
        ? { file: 'cmd', args: ['/c', 'start', '""', url] }
        : { file: 'xdg-open', args: [url] };
  try {
    // Detached and ignored: the browser outliving the CLI is the point, and a
    // browser that writes to our stdout would interleave with the next command.
    spawn(command.file, command.args, {
      stdio: 'ignore',
      detached: true
    }).unref();
  } catch {
    // No browser is a printable situation, not a fatal one — the URL is on
    // screen either way.
  }
};

const page = (title: string, body: string) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;height:100vh;background:#0b0b0c;color:#e8e8ea}
main{text-align:center;max-width:32rem;padding:2rem}h1{font-size:1.25rem;margin:0 0 .5rem}p{margin:0;color:#a1a1aa}</style>
</head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;

interface CallbackResult {
  code: string;
  redirectUri: string;
}

/**
 * Hold a loopback port open until the browser comes back with a code.
 *
 * Bound to 127.0.0.1 rather than to every interface: this port accepts an
 * authorization code for the length of one login, and it has no business being
 * reachable from the network the laptop happens to be on.
 */
const awaitCallback = async (
  state: string,
  timeoutMs: number,
  onReady: (redirectUri: string) => void
): Promise<CallbackResult> => {
  const ports = constants.CLI_OAUTH_REDIRECT_PORTS;

  for (const port of ports) {
    const redirectUri = `http://127.0.0.1:${port}${constants.CLI_OAUTH_REDIRECT_PATH}`;
    const bound = await new Promise<ReturnType<typeof createServer> | null>(
      resolve => {
        const server = createServer();
        server.once('error', () => resolve(null));
        server.listen(port, '127.0.0.1', () => resolve(server));
      }
    );
    if (!bound) continue;

    try {
      return await new Promise<CallbackResult>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new CliError('Timed out waiting for the browser to come back', {
              hint: 'Run `ganju login` again, or paste the URL into a browser on this machine.'
            })
          );
        }, timeoutMs);

        bound.on(
          'request',
          (request: IncomingMessage, response: ServerResponse) => {
            const url = new URL(request.url ?? '/', redirectUri);
            if (url.pathname !== constants.CLI_OAUTH_REDIRECT_PATH) {
              response.writeHead(404).end();
              return;
            }

            const send = (status: number, title: string, body: string) => {
              response.writeHead(status, {
                'content-type': 'text/html; charset=utf-8'
              });
              response.end(page(title, body));
            };

            const error = url.searchParams.get('error');
            if (error) {
              send(
                400,
                'Sign-in was refused',
                url.searchParams.get('error_description') ?? error
              );
              clearTimeout(timer);
              reject(new CliError(`Sign-in was refused — ${error}`));
              return;
            }

            // The state check is what stops a link someone else crafted from
            // pushing their code into this terminal's session.
            if (url.searchParams.get('state') !== state) {
              send(
                400,
                'Sign-in could not be verified',
                'The response did not match this request.'
              );
              clearTimeout(timer);
              reject(
                new CliError(
                  'The authorization response did not match this request'
                )
              );
              return;
            }

            const code = url.searchParams.get('code');
            if (!code) {
              send(
                400,
                'Sign-in is incomplete',
                'No authorization code came back.'
              );
              clearTimeout(timer);
              reject(new CliError('The authorization server returned no code'));
              return;
            }

            send(
              200,
              'You are signed in',
              'You can close this tab and go back to your terminal.'
            );
            clearTimeout(timer);
            resolve({ code, redirectUri });
          }
        );

        onReady(redirectUri);
      });
    } finally {
      bound.close();
    }
  }

  throw new CliError(
    `Every loopback port the CLI can use is busy (${ports.join(', ')})`,
    { hint: 'Close whatever is holding them and run `ganju login` again.' }
  );
};

interface Tokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

const exchange = async (
  endpoints: Endpoints,
  body: Record<string, string>
): Promise<Tokens> => {
  const response = await fetch(endpoints.token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString()
  });

  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } | null;

  if (!response.ok || !payload?.access_token) {
    throw new CliError(
      `The authorization server refused the request — ${
        payload?.error_description ??
        payload?.error ??
        `HTTP ${response.status}`
      }`
    );
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt:
      typeof payload.expires_in === 'number'
        ? Date.now() + payload.expires_in * 1000
        : undefined
  };
};

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

export const login = async (apiUrl: string): Promise<StoredAccount> => {
  const endpoints = await discover(apiUrl);

  const stored = await readAccount(apiUrl);
  const clientId =
    stored?.clientId ?? (await registerClient(apiUrl, endpoints));

  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(16));

  const { code, redirectUri } = await awaitCallback(
    state,
    LOGIN_TIMEOUT_MS,
    uri => {
      const authorize = new URL(endpoints.authorization);
      authorize.searchParams.set('client_id', clientId);
      authorize.searchParams.set('redirect_uri', uri);
      authorize.searchParams.set('response_type', 'code');
      authorize.searchParams.set('scope', constants.CLI_OAUTH_SCOPES.join(' '));
      authorize.searchParams.set('state', state);
      authorize.searchParams.set('code_challenge', challenge);
      authorize.searchParams.set('code_challenge_method', 'S256');

      step('opening your browser to sign in');
      note(`  ${color.cyan(authorize.toString())}`);
      note(`  ${color.gray(`waiting on ${uri}`)}`);
      openBrowser(authorize.toString());
    }
  );

  const tokens = await exchange(endpoints, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier
  });

  const account: StoredAccount = { clientId, ...tokens };
  await writeAccount(apiUrl, account);
  return account;
};

/**
 * Trade the refresh token for a new access token.
 *
 * Returns null rather than throwing when the server refuses: a refresh token
 * that has been revoked or has expired is an ordinary end of session, and the
 * caller's answer to it is "run `ganju login`", not a stack trace.
 */
export const refresh = async (
  apiUrl: string,
  account: StoredAccount
): Promise<StoredAccount | null> => {
  if (!account.refreshToken) return null;
  const endpoints = await discover(apiUrl);
  try {
    const tokens = await exchange(endpoints, {
      grant_type: 'refresh_token',
      refresh_token: account.refreshToken,
      client_id: account.clientId
    });
    const next: StoredAccount = {
      clientId: account.clientId,
      accessToken: tokens.accessToken,
      // A server that rotates refresh tokens returns a new one; one that does
      // not returns nothing, and the old one stays valid.
      refreshToken: tokens.refreshToken ?? account.refreshToken,
      expiresAt: tokens.expiresAt
    };
    await writeAccount(apiUrl, next);
    return next;
  } catch {
    return null;
  }
};

export const isExpiring = (account: StoredAccount): boolean =>
  typeof account.expiresAt === 'number' &&
  account.expiresAt - constants.CLI_TOKEN_REFRESH_SKEW_SECONDS * 1000 <=
    Date.now();
