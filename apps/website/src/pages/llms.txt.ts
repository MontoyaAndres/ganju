import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '../lib/site';

export const GET: APIRoute = async () => {
  const docs = (await getCollection('docs')).sort(
    (a, b) => a.data.order - b.data.order
  );
  const docsEs = (await getCollection('docsEs')).sort(
    (a, b) => a.data.order - b.data.order
  );
  const posts = (await getCollection('blog'))
    .filter(p => !p.data.draft)
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

  const link = (path: string, title: string, note: string) =>
    `- [${title}](${SITE.url}${path}): ${note}`;

  const body = `# ${SITE.name}

> ${SITE.description}

Every page is available as Markdown by appending \`.md\` to its URL.

## Core

${link('/index.md', 'Overview', 'What Ganju is and what it does')}
${link('/pricing.md', 'Pricing', 'Plans, limits, and self-hosting')}
${link('/docs.md', 'Docs index', 'All documentation guides')}
${link('/blog.md', 'Blog index', 'All posts')}

## Español

Todo el sitio está en español bajo \`/es\`, salvo el blog.

${link('/es/index.md', 'Resumen', 'Qué es Ganju y qué hace')}
${link('/es/precios.md', 'Precios', 'Planes, límites e instalación propia')}
${link('/es/docs.md', 'Índice de documentación', 'Todas las guías')}
${link('/es/privacidad.md', 'Política de Privacidad', 'Versión en español, autoritativa para titulares en Colombia')}
${link('/es/terminos.md', 'Términos y Condiciones', 'Versión en español, autoritativa para usuarios en Colombia')}
${link('/es/subencargados.md', 'Subencargados', 'Cada proveedor que puede tratar datos por cuenta nuestra')}
${link('/es/dpa.md', 'Acuerdo de Tratamiento de Datos', 'Aplica automáticamente a todos los clientes')}

${docsEs.map(d => link(`/es/docs/${d.id}.md`, d.data.title, d.data.description)).join('\n')}

## Legal

${link('/privacy.md', 'Privacy Policy', 'What the hosted service collects, who it is shared with, and how to delete it')}
${link('/terms.md', 'Terms of Service', 'Terms for the hosted service; the source code is Apache-2.0')}
${link('/subprocessors.md', 'Subprocessors', 'Every provider that may process data on our behalf, and how changes are announced')}
${link('/dpa.md', 'Data Processing Agreement', 'Applies automatically to every customer; includes SCCs and security measures')}

## Docs

${docs.map(d => link(`/docs/${d.id}.md`, d.data.title, d.data.description)).join('\n')}

## Blog

${posts.map(p => link(`/blog/${p.id}.md`, p.data.title, p.data.description)).join('\n')}
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
};
