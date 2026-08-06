import { readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, fontProviders } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

const SITE_URL = 'https://ganju.ai';
const root = fileURLToPath(new URL('.', import.meta.url));

/** Every `.md` file under `dir`, as paths relative to `dir`. */
function markdownFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.md'))
    .map(e => relative(dir, join(e.parentPath ?? e.path, e.name)));
}

/** Read a single `key: <date>` line out of a file's frontmatter block. */
function frontmatterDate(file, key) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, 'utf8'));
  if (!block) return undefined;
  const line = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(block[1]);
  if (!line) return undefined;
  const date = new Date(line[1].trim().replace(/^['"]|['"]$/g, ''));
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

/**
 * Map each content URL to its last-modified date, read straight from the
 * markdown frontmatter — `updated:` for docs, `updated:` then `date:` for blog
 * posts. The sitemap integration runs before `astro:content` is available, so
 * this reads the files itself instead of going through the collections API.
 */
function buildLastmod() {
  const lastmod = new Map();
  const slug = file => file.replace(/\.md$/, '').split('\\').join('/');

  // Both docs trees, each rooted at its own prefix. File ids match one-to-one
  // across them — see src/lib/docs-nav.ts.
  for (const [dir, prefix] of [
    ['src/content/docs', '/docs'],
    ['src/content/docs-es', '/es/docs']
  ]) {
    for (const file of markdownFiles(join(root, dir))) {
      const updated = frontmatterDate(join(root, dir, file), 'updated');
      if (!updated) continue;
      const id = slug(file);
      // `welcome` is served at the docs root, not at `<root>/welcome`.
      lastmod.set(id === 'welcome' ? prefix : `${prefix}/${id}`, updated);
    }
  }

  for (const file of markdownFiles(join(root, 'src/content/blog'))) {
    const path = join(root, 'src/content/blog', file);
    const date = frontmatterDate(path, 'updated') ?? frontmatterDate(path, 'date');
    if (date) lastmod.set(`/blog/${slug(file)}`, date);
  }

  // A listing page is only as fresh as the newest thing it lists.
  const newestUnder = prefix =>
    [...lastmod]
      .filter(([path]) => path.startsWith(prefix))
      .map(([, date]) => date)
      .sort((a, b) => b - a)[0];

  const newestPost = newestUnder('/blog');
  const newestAny = [newestUnder('/docs'), newestPost]
    .filter(Boolean)
    .sort((a, b) => b - a)[0];

  if (newestPost) lastmod.set('/blog', newestPost);
  if (newestAny) lastmod.set('/', newestAny);

  return lastmod;
}

const LASTMOD = buildLastmod();

/** `https://ganju.ai/docs/tools/gmail/` → `/docs/tools/gmail` */
const toPath = url => {
  const { pathname } = new URL(url);
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
};

// Pages that send `noindex` — keep them out of the sitemap rather than
// advertising URLs we've asked search engines not to index.
const NOINDEX = new Set(['/404', '/es/404']);

/**
 * Move the Spanish 404 to where Cloudflare Pages looks for it.
 *
 * Pages answers a miss with the nearest `404.html`, walking up from the
 * requested path — so `/es/404.html` covers everything under `/es/` and a
 * Spanish visitor keeps their language instead of landing on the English 404.
 * Astro's directory build format writes `es/404/index.html` instead (it only
 * special-cases the root 404), so this hook puts the file where it belongs and
 * drops the directory, which would otherwise be a second, reachable copy.
 */
function spanishNotFound() {
  return {
    name: 'spanish-404',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const out = fileURLToPath(dir);
        renameSync(join(out, 'es/404/index.html'), join(out, 'es/404.html'));
        rmSync(join(out, 'es/404'), { recursive: true, force: true });
      }
    }
  };
}

export default defineConfig({
  site: SITE_URL,
  integrations: [
    react(),
    spanishNotFound(),
    sitemap({
      // Keep the raw Markdown twins (`*.md`) and text/feed endpoints (llms.txt,
      // rss.xml) out of the sitemap — they're for agents and readers, not for
      // search indexing.
      filter: page => {
        const path = toPath(page);
        return !/\.(md|txt|xml)$/.test(path) && !NOINDEX.has(path);
      },
      changefreq: 'weekly',
      priority: 0.7,
      serialize: item => {
        const path = toPath(item.url);

        const lastmod = LASTMOD.get(path);
        if (lastmod) item.lastmod = lastmod.toISOString();

        // Both homepages — each is the entry point for its language.
        if (path === '/' || path === '/es') {
          item.priority = 1.0;
          item.changefreq = 'daily';
        }
        // Docs are the deep organic-search surface — rank them above the
        // boilerplate pages that share the 0.7 default.
        if (path.startsWith('/docs') || path.startsWith('/es/docs')) {
          item.priority = 0.8;
        }

        return item;
      }
    })
  ],
  markdown: {
    shikiConfig: { theme: 'github-light', wrap: true }
  },
  experimental: {
    fonts: [
      {
        provider: fontProviders.google(),
        name: 'Fustat',
        cssVariable: '--font-fustat',
        weights: [400, 500, 600, 700, 800],
        display: 'swap'
      }
    ]
  }
});
