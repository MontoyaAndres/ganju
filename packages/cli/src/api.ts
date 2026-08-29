import { CliError } from './errors.js';
import {
  readAccount,
  writeAccount,
  type StoredAccount
} from './credentials.js';
import { isExpiring, refresh } from './oauth.js';

/**
 * The one way this CLI talks to Ganju.
 *
 * Every command here is a client of endpoints the dashboard already uses — no
 * command reaches past them, and none of them exists only for the CLI. That is
 * deliberate: two write paths onto the same rows is how two surfaces come to
 * disagree about what a valid deploy is.
 */

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | undefined>;
  json?: unknown;
  // Only ever a string here — the one non-JSON body the CLI sends is a bundle,
  // which is source text.
  body?: string;
  headers?: Record<string, string>;
}

/**
 * `GANJU_API_TOKEN` is the escape hatch for a machine that has no browser: CI,
 * a container, a box reached over SSH. It bypasses the token store entirely, so
 * it is never refreshed and never written anywhere.
 */
const tokenFromEnvironment = (): string | null =>
  process.env.GANJU_API_TOKEN?.trim() || null;

export class ApiClient {
  readonly apiUrl: string;
  private account: StoredAccount | null = null;
  private readonly envToken: string | null;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
    this.envToken = tokenFromEnvironment();
  }

  private async token(): Promise<string> {
    if (this.envToken) return this.envToken;

    if (!this.account) {
      const stored = await readAccount(this.apiUrl);
      if (!stored?.accessToken) {
        throw new CliError(`Not logged in to ${this.apiUrl}`, {
          hint: 'Run `ganju login` first, or set GANJU_API_TOKEN on a machine with no browser.'
        });
      }
      this.account = stored;
    }

    // Refreshed before the request rather than after a 401, when we already know
    // it is about to expire — a deploy that dies between uploading a bundle and
    // publishing it leaves a draft nobody asked for.
    if (isExpiring(this.account)) {
      const renewed = await refresh(this.apiUrl, this.account);
      if (renewed) this.account = renewed;
    }

    return this.account.accessToken;
  }

  private async renew(): Promise<boolean> {
    if (this.envToken || !this.account) return false;
    const renewed = await refresh(this.apiUrl, this.account);
    if (!renewed) return false;
    this.account = renewed;
    await writeAccount(this.apiUrl, renewed);
    return true;
  }

  async request<T = unknown>(
    path: string,
    options: ApiOptions = {}
  ): Promise<T> {
    const url = new URL(`${this.apiUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== '')
        url.searchParams.set(key, String(value));
    }

    const send = async (token: string) => {
      const headers: Record<string, string> = {
        authorization: `Bearer ${token}`,
        ...options.headers
      };
      let body = options.body;
      if (options.json !== undefined) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(options.json);
      }
      return fetch(url, { method: options.method ?? 'GET', headers, body });
    };

    let response = await send(await this.token());

    // One retry, and only on 401: a token can expire between the check above and
    // the request landing, but a second 401 means the session is genuinely over.
    if (response.status === 401 && (await this.renew())) {
      response = await send(await this.token());
    }

    if (!response.ok)
      throw await describeFailure(response, this.apiUrl, !!this.envToken);

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }
}

/**
 * Turn an API failure into something the reader can act on.
 *
 * The server answers a validation failure with an issue per field, and the path
 * is the useful half — a 50-tool manifest rejected for a reserved name reports
 * `manifest.tools.3.name`, which says which entry. Flattening that to the first
 * message would throw away the only part that locates the problem.
 */
const describeFailure = async (
  response: Response,
  apiUrl: string,
  usingEnvironmentToken: boolean
): Promise<CliError> => {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    errors?: Array<{ path?: string; message?: string }>;
  } | null;

  if (payload?.errors?.length) {
    const lines = payload.errors.map(issue =>
      issue.path ? `${issue.path}: ${issue.message}` : (issue.message ?? '')
    );
    return new CliError(lines[0] ?? 'The request was rejected', {
      hint: lines.length > 1 ? lines.slice(1).join('\n  ') : undefined
    });
  }

  if (response.status === 401) {
    // The advice differs by how this machine authenticated, and getting it wrong
    // wastes the reader's time in both directions: told to log in again, someone
    // holding an access token goes looking for a browser on a build agent; told
    // to check a token, someone with an expired login re-reads their CI config.
    return usingEnvironmentToken
      ? new CliError('GANJU_API_TOKEN was not accepted', {
          hint: "It may have been revoked or expired — mint a new one in the dashboard, under the organization's settings."
        })
      : new CliError('Your session has expired', {
          hint: 'Run `ganju login` again.'
        });
  }
  if (response.status === 403) {
    // The server's own message when it has one: an access token used against an
    // organization it is not scoped to is refused here too, and "you are not an
    // admin" would send the reader to fix the wrong thing.
    return payload?.error
      ? new CliError(payload.error, {
          hint: usingEnvironmentToken
            ? 'Check that GANJU_API_TOKEN belongs to the organization in ganju.json.'
            : 'Run `ganju link` to pick a project you are an admin of.'
        })
      : new CliError('You are not an admin of that project', {
          hint: 'Run `ganju link` to pick one you are.'
        });
  }
  if (response.status === 402) {
    return new CliError(payload?.error ?? 'Your plan does not include this', {
      hint: 'Custom tools are a paid feature — upgrade the organization to Pro.'
    });
  }

  return new CliError(
    payload?.error ?? `${apiUrl} answered HTTP ${response.status}`
  );
};
