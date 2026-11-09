// The dev API and a project's MCP server, called as the signed-in owner with
// the CLI's own credentials (refreshed the way the CLI refreshes them).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const API_URL =
  process.env.EVAL_API_URL ?? 'https://development-api.vocesqueabrazan.com';
export const MCP_URL =
  process.env.EVAL_MCP_URL ?? 'https://development-mcp.vocesqueabrazan.com';

const CREDENTIALS = path.join(os.homedir(), '.ganju', 'credentials.json');

const readAccount = () => {
  const all = JSON.parse(fs.readFileSync(CREDENTIALS, 'utf8'));
  const account = all.accounts?.[API_URL];
  if (!account)
    throw new Error(`No CLI sign-in for ${API_URL}; run ganju login`);
  return account;
};

const writeAccount = account => {
  const all = JSON.parse(fs.readFileSync(CREDENTIALS, 'utf8'));
  all.accounts[API_URL] = account;
  fs.writeFileSync(CREDENTIALS, JSON.stringify(all, null, 2) + '\n', {
    mode: 0o600
  });
};

let refreshing = null;
const refresh = async account => {
  const meta = await fetch(
    `${API_URL}/.well-known/oauth-authorization-server`
  ).then(r => r.json());
  const response = await fetch(meta.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: account.refreshToken,
      client_id: account.clientId
    })
  });
  if (!response.ok)
    throw new Error(
      `Token refresh failed (${response.status}); run ganju whoami or login`
    );
  const tokens = await response.json();
  const next = {
    clientId: account.clientId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? account.refreshToken,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000
  };
  writeAccount(next);
  return next;
};

export const token = async () => {
  const account = readAccount();
  if (account.expiresAt && account.expiresAt - 5 * 60_000 > Date.now())
    return account.accessToken;
  refreshing ??= refresh(account).finally(() => (refreshing = null));
  return (await refreshing).accessToken;
};

export class ApiError extends Error {
  constructor(status, body) {
    super(
      typeof body === 'object' && body
        ? (body.error ?? JSON.stringify(body.errors ?? body))
        : String(body)
    );
    this.status = status;
    this.body = body;
  }
}

export const api = async (
  method,
  url,
  { json, raw, headers = {}, query } = {}
) => {
  const qs = query
    ? '?' +
      new URLSearchParams(
        Object.entries(query).filter(([, v]) => v !== undefined && v !== null)
      ).toString()
    : '';
  const init = {
    method,
    headers: { authorization: `Bearer ${await token()}`, ...headers },
    signal: AbortSignal.timeout(120_000)
  };
  if (json !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(json);
  } else if (raw !== undefined) {
    init.body = raw;
    init.headers['content-length'] = String(
      raw.length ?? Buffer.byteLength(raw)
    );
  }
  const response = await fetch(`${API_URL}${url}${qs}`, init);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) throw new ApiError(response.status, body);
  return body;
};

/** One project's API, with its artifact routes under `a(...)`. */
export const projectApi = (organizationId, projectId) => {
  const base = `/organization/${organizationId}/project/${projectId}`;
  return {
    organizationId,
    projectId,
    base,
    get: (p, o) => api('GET', base + p, o),
    post: (p, json, o) => api('POST', base + p, { json, ...o }),
    put: (p, json, o) => api('PUT', base + p, { json, ...o }),
    patch: (p, json, o) => api('PATCH', base + p, { json, ...o }),
    del: (p, json, o) => api('DELETE', base + p, { json, ...o }),
    raw: (method, p, raw, headers) => api(method, base + p, { raw, headers })
  };
};

let rpcId = 0;
/** A JSON-RPC call to the project's MCP server (stateless, JSON responses). */
export const mcp = async (slug, method, params = {}) => {
  const response = await fetch(`${MCP_URL}/${slug}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await token()}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream'
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    signal: AbortSignal.timeout(90_000)
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    // An SSE answer: the last data line holds the JSON-RPC message.
    const data = text
      .split('\n')
      .filter(l => l.startsWith('data:'))
      .pop();
    body = data
      ? JSON.parse(data.slice(5))
      : { error: { message: text.slice(0, 300) } };
  }
  if (body.error) throw new Error(`MCP ${method}: ${body.error.message}`);
  return body.result;
};

export const toolText = result =>
  (result?.content ?? [])
    .map(part => (part.type === 'text' ? part.text : `[${part.type}]`))
    .join('\n');
