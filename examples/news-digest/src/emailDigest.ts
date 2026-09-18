import { defineTool } from '@ganju/sdk';

import { toMarkdown, toPlainText, topStories } from './lib/hackerNews';

/**
 * Build today's digest, save it on the project, and email it as an attachment.
 *
 * Two host capabilities, one after the other:
 *
 *   ctx.resources.create   writes the digest as a file on the project
 *   ctx.sendFile           sends that file through the connected Gmail account
 *
 * `sendFile` takes resource uris, never bytes, which is why the digest is
 * saved first. The platform reads the file from storage and attaches it
 * itself, so the same call works for a 40MB PDF this Worker could never hold.
 */
export default defineTool<{ to: string; limit?: number }>(
  async (input, ctx) => {
    const limit = Math.round(input.limit ?? 10);
    const date = new Date().toISOString().slice(0, 10);

    const stories = await topStories(limit);
    if (stories.length === 0)
      throw new Error('Hacker News returned no stories');

    // One uri per day, so running this twice on the same day replaces the
    // morning's digest instead of piling up copies.
    const saved = await ctx.resources.create({
      title: `Hacker News digest — ${date}`,
      uri: `resource://news-digest/${date}`,
      fileName: `hacker-news-${date}.md`,
      mimeType: 'text/markdown',
      content: toMarkdown(stories, date)
    });

    ctx.log(`${saved.created ? 'saved' : 'replaced'} ${saved.uri}`);

    // Refused unless `google-gmail` is in `connections` in ganju.json: sending
    // as an account is the same privilege as holding its token.
    const receipt = await ctx.sendFile({
      to: 'gmail',
      uris: [saved.uri],
      message: {
        to: input.to,
        subject: `Hacker News digest — ${date}`,
        body: `Today's top ${stories.length} stories on Hacker News:\n\n${toPlainText(stories)}\n\nThe full list is attached.`,
        contentType: 'text/plain'
      }
    });

    ctx.log(`sent to ${input.to}`);

    return {
      sentTo: input.to,
      stories: stories.length,
      resourceUri: saved.uri,
      ...(receipt.id ? { messageId: receipt.id } : {})
    };
  }
);
