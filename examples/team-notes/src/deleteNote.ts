import { defineTool } from '@ganju/sdk';

import { noteUri } from './lib/notes';

/**
 * Delete one note.
 *
 * `noteUri` only ever yields a uri under the notes prefix, so this tool
 * cannot delete anything else. `resourceAccess: "own"` in `ganju.json` backs
 * that up on the platform side: even a uri typed by hand can only reach
 * resources a tool wrote, never a file someone uploaded.
 */
export default defineTool<{ note: string }>(async (input, ctx) => {
  const uri = noteUri(input.note);
  const result = await ctx.resources.delete(uri);

  ctx.log(result.deleted ? `deleted ${uri}` : `nothing at ${uri}`);

  // Deleting is idempotent: a note that was already gone comes back as
  // `deleted: false` rather than an error.
  return { uri, deleted: result.deleted };
});
