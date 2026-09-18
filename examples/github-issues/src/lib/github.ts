import type { ToolContext } from '@ganju/sdk';

/**
 * The GitHub REST API, authenticated with a token stored as a secret.
 *
 * The token is never in this file, in `ganju.json` or in the bundle. It is set
 * once with `ganju secret set GITHUB_TOKEN` and fetched with `ctx.secret` on
 * every call, so rotating it needs no redeploy.
 */

const API = 'https://api.github.com';

export const github = async <T>(
  ctx: ToolContext,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> => {
  const token = await ctx.secret('GITHUB_TOKEN');

  const response = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      // GitHub refuses requests without one, and a Worker does not send one
      // by default.
      'user-agent': 'ganju-example-github-issues',
      ...(init.body ? { 'content-type': 'application/json' } : {})
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {})
  });

  if (response.ok) return (await response.json()) as T;

  // The three failures worth telling apart, each with what to do about it.
  const detail = (
    (await response.json().catch(() => null)) as {
      message?: string;
    } | null
  )?.message;

  if (response.status === 401) {
    throw new Error(
      'GitHub rejected the token. Set a valid one with `ganju secret set GITHUB_TOKEN`.'
    );
  }
  if (response.status === 404) {
    throw new Error(
      'Repository not found, or the token cannot see it. Check the name and the token’s repository access.'
    );
  }
  throw new Error(
    `GitHub answered ${response.status}${detail ? ` — ${detail}` : ''}`
  );
};

/** `owner/name`, already checked by the input schema's pattern. */
export const repoPath = (repo: string): string => {
  const [owner, name] = repo.trim().split('/');
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
};
