import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export async function getStaticPaths() {
  const docs = await getCollection('docs');
  return docs.map(entry => ({ params: { slug: entry.id }, props: { entry } }));
}

export const GET: APIRoute = ({ props }) => {
  const { entry } = props as {
    entry: Awaited<ReturnType<typeof getCollection>>[number];
  };
  const body = `# ${entry.data.title}\n\n${entry.data.description}\n\n${entry.body ?? ''}`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
  });
};
