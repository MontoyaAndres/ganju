/**
 * Sidebar navigation for the docs — the single source of truth for the docs
 * menu, in every language.
 *
 * The tree is declared once, keyed by slug, with a label per language. Both
 * language trees therefore have exactly the same shape and the same slugs:
 * `/docs/tools/gmail` and `/es/docs/tools/gmail` are the same page in two
 * languages. Slugs stay English on purpose — translating them would mean
 * maintaining a slug map and rewriting every cross-link inside 34 documents,
 * for a URL nobody reads.
 *
 * A node with `items` renders as a collapsible group; if that group also has a
 * slug, its title links to that page (with a separate chevron to expand). A
 * leaf with a slug is a live link; a leaf without one is a "Soon" placeholder
 * (page not yet written) so the menu can show the full module map without dead
 * links.
 */
import type { Lang } from './i18n';

/** Where each language's docs tree is rooted. */
export const DOCS_ROOT: Record<Lang, string> = { en: '/docs', es: '/es/docs' };

/** A label in every language we publish. */
type Label = Record<Lang, string>;

interface DocNavSpec {
  /** Path below the docs root, e.g. `tools/gmail`. Omitted for the root page. */
  slug?: string;
  label: Label;
  items?: DocNavSpec[];
  /** Set for a menu entry with no page behind it yet. */
  soon?: boolean;
}

/** A node with its href already resolved for one language. */
export interface DocNavNode {
  label: string;
  href?: string;
  items?: DocNavNode[];
}

const SPEC: DocNavSpec[] = [
  { label: { en: 'Welcome', es: 'Bienvenido' } },
  {
    slug: 'getting-started',
    label: { en: 'Get started', es: 'Primeros pasos' },
    items: [
      {
        slug: 'getting-started/sign-in',
        label: { en: 'Sign in', es: 'Iniciar sesión' }
      },
      {
        slug: 'getting-started/organization-and-project',
        label: {
          en: 'Create an organization & project',
          es: 'Crear una organización y un proyecto'
        }
      },
      {
        slug: 'getting-started/prompts',
        label: { en: 'Prompts', es: 'Prompts' }
      },
      {
        slug: 'getting-started/resources',
        label: { en: 'Resources', es: 'Recursos' }
      },
      {
        slug: 'getting-started/tools',
        label: { en: 'Tools', es: 'Herramientas' }
      },
      {
        slug: 'getting-started/channels',
        label: { en: 'Channels', es: 'Canales' }
      },
      {
        slug: 'getting-started/settings',
        label: { en: 'Settings', es: 'Configuración' }
      }
    ]
  },
  {
    slug: 'organizations-and-projects',
    label: { en: 'Organizations & projects', es: 'Organizaciones y proyectos' }
  },
  { slug: 'prompts', label: { en: 'Prompts', es: 'Prompts' } },
  { slug: 'resources', label: { en: 'Resources', es: 'Recursos' } },
  {
    slug: 'tools',
    label: { en: 'Tools', es: 'Herramientas' },
    items: [
      { slug: 'tools/built-in', label: { en: 'Built-in', es: 'Integradas' } },
      { slug: 'tools/gmail', label: { en: 'Gmail', es: 'Gmail' } },
      { slug: 'tools/outlook', label: { en: 'Outlook', es: 'Outlook' } },
      { slug: 'tools/slack', label: { en: 'Slack', es: 'Slack' } },
      {
        slug: 'tools/slack-search',
        label: { en: 'Slack Search', es: 'Búsqueda en Slack' }
      },
      {
        slug: 'tools/google-calendar',
        label: { en: 'Google Calendar', es: 'Google Calendar' }
      },
      { slug: 'tools/calcom', label: { en: 'Cal.com', es: 'Cal.com' } },
      {
        slug: 'tools/web-search',
        label: { en: 'Web Search', es: 'Búsqueda web' }
      },
      { slug: 'tools/github', label: { en: 'GitHub', es: 'GitHub' } },
      { slug: 'tools/notion', label: { en: 'Notion', es: 'Notion' } },
      {
        slug: 'tools/http-endpoints',
        label: { en: 'HTTP Endpoints', es: 'Endpoints HTTP' }
      },
      { slug: 'tools/greeting', label: { en: 'Greeting', es: 'Saludo' } }
    ]
  },
  {
    slug: 'channels',
    label: { en: 'Channels', es: 'Canales' },
    items: [
      { slug: 'channels/telegram', label: { en: 'Telegram', es: 'Telegram' } },
      { slug: 'channels/whatsapp', label: { en: 'WhatsApp', es: 'WhatsApp' } },
      { slug: 'channels/slack', label: { en: 'Slack', es: 'Slack' } },
      { slug: 'channels/discord', label: { en: 'Discord', es: 'Discord' } }
    ]
  },
  { slug: 'analytics', label: { en: 'Analytics', es: 'Analítica' } },
  { slug: 'settings', label: { en: 'Settings', es: 'Configuración' } },
  { slug: 'mcp', label: { en: 'MCP clients', es: 'Clientes MCP' } },
  {
    slug: 'deploy',
    label: { en: 'Deploy it yourself', es: 'Instálalo tú mismo' }
  }
];

/** Absolute path of a docs page in one language. `slug` omitted → the root. */
export function docsHref(slug: string | undefined, lang: Lang): string {
  return slug ? `${DOCS_ROOT[lang]}/${slug}` : DOCS_ROOT[lang];
}

const resolve = (spec: DocNavSpec, lang: Lang): DocNavNode => ({
  label: spec.label[lang],
  ...(spec.soon ? {} : { href: docsHref(spec.slug, lang) }),
  ...(spec.items ? { items: spec.items.map((item) => resolve(item, lang)) } : {})
});

/** The sidebar tree for one language, hrefs resolved. */
export function docsNav(lang: Lang): DocNavNode[] {
  return SPEC.map((spec) => resolve(spec, lang));
}

/** Strip a trailing slash (except on the root path) so paths compare equal. */
export function normalizePath(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/** Whether `href` points at the current page. */
export function isActive(href: string | undefined, current: string): boolean {
  return href ? normalizePath(href) === normalizePath(current) : false;
}

/** Whether a node (or any descendant) is the current page — used to auto-open groups. */
export function containsActive(node: DocNavNode, current: string): boolean {
  if (isActive(node.href, current)) return true;
  return node.items?.some((child) => containsActive(child, current)) ?? false;
}

const TRAIL_ROOT: Record<Lang, { home: string; docs: string }> = {
  en: { home: 'Home', docs: 'Docs' },
  es: { home: 'Inicio', docs: 'Docs' }
};

const HOME: Record<Lang, string> = { en: '/', es: '/es/' };

/**
 * Ancestor trail for a docs page, e.g. `/docs/tools/gmail` →
 * Home › Docs › Tools › Gmail. Walks the nav so the breadcrumb labels always
 * match the sidebar. Falls back to Home › Docs for a page not in the menu.
 */
export function docsTrail(
  current: string,
  lang: Lang = 'en'
): { label: string; href: string }[] {
  const walk = (nodes: DocNavNode[]): DocNavNode[] | null => {
    for (const node of nodes) {
      if (isActive(node.href, current)) return [node];
      const below = node.items ? walk(node.items) : null;
      if (below) return [node, ...below];
    }
    return null;
  };

  const root = DOCS_ROOT[lang];
  const found = walk(docsNav(lang)) ?? [];
  const trail = [
    { label: TRAIL_ROOT[lang].home, href: HOME[lang] },
    { label: TRAIL_ROOT[lang].docs, href: root }
  ];

  for (const node of found) {
    // `Welcome` IS the docs root — already the second crumb, so don't repeat it.
    if (!node.href || normalizePath(node.href) === root) continue;
    trail.push({ label: node.label, href: node.href });
  }
  return trail;
}
