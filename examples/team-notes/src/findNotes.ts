import { defineTool } from '@ganju/sdk';

import { isNote } from './lib/notes';

/**
 * Search the notes by meaning, not just by matching words.
 *
 * `ctx.resources.search` is the same semantic search the assistant answers
 * from, so "when do we ship" finds a note titled "Release schedule". It
 * searches every indexed resource on the project and returns passages
 * (several can come from one note), so this keeps notes only and the best
 * passage per note.
 */
export default defineTool<{ query: string; limit?: number }>(
  async (input, ctx) => {
    const limit = Math.round(input.limit ?? 5);

    // Over-fetched, because other resources and extra passages from the same
    // note are dropped below. 20 is the most one search returns.
    const matches = await ctx.resources.search(input.query, 20);

    const best = new Map<string, (typeof matches)[number]>();
    for (const match of matches) {
      if (!isNote(match.uri)) continue;
      const seen = best.get(match.uri);
      if (!seen || match.score > seen.score) best.set(match.uri, match);
    }

    const results = [...best.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(match => ({
        uri: match.uri,
        title: match.title,
        score: match.score,
        excerpt: match.excerpt
      }));

    ctx.log(`"${input.query}" → ${results.length} note(s)`);

    return { query: input.query, results };
  }
);
