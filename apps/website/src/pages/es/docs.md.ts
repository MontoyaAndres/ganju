import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '../../lib/site';

export const GET: APIRoute = async () => {
  const docs = (await getCollection('docsEs')).sort(
    (a, b) => a.data.order - b.data.order
  );
  const lines = docs.map(
    d =>
      `- [${d.data.title}](${SITE.url}/es/docs/${d.id}.md) — ${d.data.description}`
  );
  const body = `# Docs de Ganju\n\nGuías para conectar tu IA con tus archivos, herramientas y apps.\n\n${lines.join('\n')}\n`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
  });
};
