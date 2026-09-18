import { defineTool } from '@ganju/sdk';

import { topStories } from './lib/hackerNews';

/** What is on the Hacker News front page right now. */
export default defineTool<{ limit?: number }>(async (input, ctx) => {
  const limit = Math.round(input.limit ?? 10);
  const stories = await topStories(limit);

  ctx.log(`fetched ${stories.length} stories`);

  return { count: stories.length, stories };
});
