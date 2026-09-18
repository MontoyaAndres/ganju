import { defineTool } from '@ganju/sdk';

import { github, repoPath } from './lib/github';

interface Issue {
  number: number;
  title: string;
  state: string;
  html_url: string;
  comments: number;
  updated_at: string;
  user?: { login: string } | null;
  labels: Array<{ name?: string } | string>;
  /** Only present on pull requests, which this endpoint also returns. */
  pull_request?: unknown;
}

/** The most recently updated issues in a repository. */
export default defineTool<{
  repo: string;
  state?: 'open' | 'closed' | 'all';
  limit?: number;
}>(async (input, ctx) => {
  const state = input.state ?? 'open';
  const limit = Math.round(input.limit ?? 10);

  ctx.log(`listing ${state} issues in ${input.repo}`);

  // Always a full page, because GitHub counts pull requests as issues here and
  // those are filtered out below. On a busy repository the most recently
  // updated items are often all pull requests.
  const params = new URLSearchParams({
    state,
    sort: 'updated',
    per_page: '100'
  });
  const rows = await github<Issue[]>(
    ctx,
    `${repoPath(input.repo)}/issues?${params}`
  );

  const issues = rows
    .filter(row => !row.pull_request)
    .slice(0, limit)
    .map(row => ({
      number: row.number,
      title: row.title,
      state: row.state,
      author: row.user?.login ?? 'ghost',
      labels: row.labels
        .map(label => (typeof label === 'string' ? label : (label.name ?? '')))
        .filter(Boolean),
      comments: row.comments,
      updatedAt: row.updated_at,
      url: row.html_url
    }));

  return { repo: input.repo, count: issues.length, issues };
});
