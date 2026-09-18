import { defineTool } from '@ganju/sdk';

import { noteUri } from './lib/notes';

/**
 * Save a note on the project, or replace one with the same title.
 *
 * `index: true` is what makes the note searchable, by `find-notes` and by the
 * assistant's own knowledge search. It is off by default for anything a tool
 * writes, so that adding to the knowledge base is a decision. Here it is the
 * point of the tool.
 */
export default defineTool<{ title: string; body: string; tags?: string[] }>(
  async (input, ctx) => {
    const title = input.title.trim();
    const uri = noteUri(title);
    const tags = (input.tags ?? []).map(tag => tag.trim()).filter(Boolean);

    const markdown = [
      `# ${title}`,
      '',
      ...(tags.length ? [`Tags: ${tags.join(', ')}`, ''] : []),
      input.body.trim(),
      ''
    ].join('\n');

    const saved = await ctx.resources.create({
      title,
      uri,
      content: markdown,
      mimeType: 'text/markdown',
      description: tags.length ? `Note · ${tags.join(', ')}` : 'Note',
      index: true
    });

    ctx.log(`${saved.created ? 'saved' : 'updated'} ${saved.uri}`);

    return {
      uri: saved.uri,
      title: saved.title,
      // False means an earlier note with this title was replaced.
      created: saved.created,
      // Queued for search. A new note is readable at once and searchable a few
      // seconds later.
      indexed: saved.indexed
    };
  }
);
