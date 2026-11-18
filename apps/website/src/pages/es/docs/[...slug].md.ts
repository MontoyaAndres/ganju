import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { docMarkdown } from '../../../lib/llms';

export async function getStaticPaths() {
  const docs = await getCollection('docsEs');
  return docs.map(entry => ({ params: { slug: entry.id }, props: { entry } }));
}

export const GET: APIRoute = ({ props }) =>
  new Response(
    docMarkdown(
      (props as { entry: Parameters<typeof docMarkdown>[0] }).entry,
      'es'
    ),
    {
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
    }
  );
