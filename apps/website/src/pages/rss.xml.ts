import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '../lib/site';

/** Escape the five characters that are not legal as raw text in XML. */
const xml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export const GET: APIRoute = async () => {
  const posts = (await getCollection('blog'))
    .filter(p => !p.data.draft)
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

  const items = posts
    .map(post => {
      const url = new URL(`/blog/${post.id}`, SITE.url).href;
      return `    <item>
      <title>${xml(post.data.title)}</title>
      <link>${xml(url)}</link>
      <guid isPermaLink="true">${xml(url)}</guid>
      <description>${xml(post.data.description)}</description>
      <pubDate>${post.data.date.toUTCString()}</pubDate>
      <author>${xml(SITE.email)} (${xml(post.data.author)})</author>
    </item>`;
    })
    .join('\n');

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(SITE.name)} Blog</title>
    <link>${xml(`${SITE.url}/blog`)}</link>
    <description>Updates, guides, and stories from the ${xml(SITE.name)} team.</description>
    <language>en-us</language>
    <atom:link href="${xml(`${SITE.url}/rss.xml`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(feed, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' }
  });
};
