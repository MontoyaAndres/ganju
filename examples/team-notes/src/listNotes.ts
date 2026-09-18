import { defineTool } from '@ganju/sdk';

import { isNote } from './lib/notes';

/**
 * Every note, by title.
 *
 * `ctx.resources.list()` returns everything on the project (uploaded files,
 * crawled pages, other tools' output), so the notes are picked out by their
 * uri prefix. It returns metadata only, which keeps it cheap however many there
 * are.
 */
export default defineTool(async (_input, ctx) => {
  const resources = await ctx.resources.list();

  const notes = resources
    .filter(resource => isNote(resource.uri))
    .map(resource => ({
      uri: resource.uri,
      title: resource.title,
      ...(resource.description ? { description: resource.description } : {})
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  ctx.log(`${notes.length} of ${resources.length} resources are notes`);

  return { count: notes.length, notes };
});
