/**
 * Sidebar navigation for the docs — the single source of truth for the docs
 * menu. A node with `items` renders as a collapsible group; if that group also
 * has an `href`, its title is a link to that page (with a separate chevron to
 * expand). A leaf with `href` is a live link; a leaf without `href` is a "Soon"
 * placeholder (page not yet written) so the menu can show the full module map
 * without dead links.
 */
export interface DocNavNode {
  label: string;
  href?: string;
  items?: DocNavNode[];
}

export const DOCS_NAV: DocNavNode[] = [
  { label: 'Welcome', href: '/docs' },
  {
    label: 'Get started',
    href: '/docs/getting-started',
    items: [
      { label: 'Sign in', href: '/docs/getting-started/sign-in' },
      {
        label: 'Create an organization & project',
        href: '/docs/getting-started/organization-and-project'
      },
      { label: 'Prompts', href: '/docs/getting-started/prompts' },
      { label: 'Resources', href: '/docs/getting-started/resources' },
      { label: 'Tools', href: '/docs/getting-started/tools' },
      { label: 'Channels', href: '/docs/getting-started/channels' },
      { label: 'Settings', href: '/docs/getting-started/settings' }
    ]
  },
  { label: 'Organizations & projects', href: '/docs/organizations-and-projects' },
  { label: 'Prompts', href: '/docs/prompts' },
  { label: 'Resources', href: '/docs/resources' },
  {
    label: 'Tools',
    href: '/docs/tools',
    items: [
      { label: 'Built-in', href: '/docs/tools/built-in' },
      { label: 'Gmail', href: '/docs/tools/gmail' },
      { label: 'Outlook', href: '/docs/tools/outlook' },
      { label: 'Slack', href: '/docs/tools/slack' },
      { label: 'Slack Search', href: '/docs/tools/slack-search' },
      { label: 'Google Calendar', href: '/docs/tools/google-calendar' },
      { label: 'Cal.com', href: '/docs/tools/calcom' },
      { label: 'Web Search', href: '/docs/tools/web-search' },
      { label: 'GitHub', href: '/docs/tools/github' },
      { label: 'Notion', href: '/docs/tools/notion' },
      { label: 'HTTP Endpoints', href: '/docs/tools/http-endpoints' },
      { label: 'Greeting', href: '/docs/tools/greeting' }
    ]
  },
  {
    label: 'Channels',
    href: '/docs/channels',
    items: [
      { label: 'Telegram', href: '/docs/channels/telegram' },
      { label: 'WhatsApp', href: '/docs/channels/whatsapp' },
      { label: 'Slack', href: '/docs/channels/slack' },
      { label: 'Discord', href: '/docs/channels/discord' }
    ]
  },
  { label: 'Analytics', href: '/docs/analytics' },
  { label: 'Settings', href: '/docs/settings' },
  { label: 'MCP clients', href: '/docs/mcp' },
  { label: 'Deploy it yourself', href: '/docs/deploy' }
];

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

/**
 * Ancestor trail for a docs page, e.g. `/docs/tools/gmail` →
 * Home › Docs › Tools › Gmail. Walks DOCS_NAV so the breadcrumb labels always
 * match the sidebar. Falls back to Home › Docs for a page not in the menu.
 */
export function docsTrail(current: string): { label: string; href: string }[] {
  const walk = (nodes: DocNavNode[]): DocNavNode[] | null => {
    for (const node of nodes) {
      if (isActive(node.href, current)) return [node];
      const below = node.items ? walk(node.items) : null;
      if (below) return [node, ...below];
    }
    return null;
  };

  const found = walk(DOCS_NAV) ?? [];
  const trail = [{ label: 'Home', href: '/' }, { label: 'Docs', href: '/docs' }];

  for (const node of found) {
    // `Welcome` IS /docs — already the second crumb, so don't repeat it.
    if (!node.href || normalizePath(node.href) === '/docs') continue;
    trail.push({ label: node.label, href: node.href });
  }
  return trail;
}
