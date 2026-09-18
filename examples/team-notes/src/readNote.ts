import { defineTool } from '@ganju/sdk';

import { noteUri } from './lib/notes';

/** One note in full, by its title or its uri. */
export default defineTool<{ note: string }>(async (input, ctx) => {
  const uri = noteUri(input.note);

  try {
    const { text } = await ctx.resources.read(uri);
    return { uri, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/not found/i.test(message)) throw error;

    // The platform's own message is about resources in general. This one
    // tells the model what to try next.
    throw new Error(
      `There is no note called "${input.note}". Use list-notes to see the titles that exist.`
    );
  }
});
