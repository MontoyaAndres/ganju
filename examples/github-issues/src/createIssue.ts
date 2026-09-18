import { defineTool } from '@ganju/sdk';

import { github, repoPath } from './lib/github';

/**
 * Open a new issue.
 *
 * This one writes, so its description in `ganju.json` tells the model to
 * confirm with the person first. The token decides which repositories it can
 * reach — give it Issues access on the repositories you mean, and no others.
 */
export default defineTool<{
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
}>(async (input, ctx) => {
  const title = input.title.trim();
  if (!title) throw new Error('An issue needs a title');

  const created = await github<{ number: number; html_url: string }>(
    ctx,
    `${repoPath(input.repo)}/issues`,
    {
      method: 'POST',
      body: {
        title,
        ...(input.body ? { body: input.body } : {}),
        ...(input.labels?.length ? { labels: input.labels } : {})
      }
    }
  );

  ctx.log(`opened ${input.repo}#${created.number}`);

  return { number: created.number, url: created.html_url };
});
