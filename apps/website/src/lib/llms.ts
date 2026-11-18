import { getCollection } from 'astro:content';
import { SITE } from './site';
import {
  DOCS_ROOT,
  docsNav,
  gettingStartedNext,
  type DocNavNode
} from './docs-nav';
import type { Lang } from './i18n';

// Site paths in the markdown point at HTML routes. An agent reading the .md
// export is better served by the .md twin, and by absolute URLs, since it may
// not know which host the text came from.
export function toMarkdownLinks(body: string): string {
  return body.replace(/\]\((\/[^)\s]*)\)/g, (_, target: string) => {
    const [path, hash] = target.split('#');
    if (/^\/(es\/)?docs(\/|$)/.test(path)) {
      const bare = path.replace(/\/$/, '').replace(/\.md$/, '');
      const md = `${SITE.url}${bare}.md`;
      return `](${hash ? `${md}#${hash}` : md})`;
    }
    return `](${SITE.url}${target})`;
  });
}

type Doc = Awaited<ReturnType<typeof getCollection<'docs'>>>[number];

const docsOf = async (lang: Lang): Promise<Doc[]> =>
  (await getCollection(lang === 'es' ? 'docsEs' : 'docs')) as Doc[];

export function docMarkdown(entry: Doc, lang: Lang): string {
  const body = `# ${entry.data.title}\n\n${entry.data.description}\n\n${(entry.body ?? '').trimEnd()}${gettingStartedNext(entry.id, lang)}`;
  return toMarkdownLinks(body);
}

// Pages for features Free doesn't include.
const PAID = new Set([
  'assistant',
  'data',
  'data/functions',
  'data/triggers',
  'data/schedules',
  'data/sheet-sync',
  'data-api',
  'tools/functions',
  'tools/cli',
  'tools/examples',
  'tools/agent-skill'
]);

// Top-level pages with no group of their own in the sidebar.
const LOOSE: Record<string, 'start' | 'account' | 'selfHost'> = {
  '': 'start',
  welcome: 'start',
  assistant: 'start',
  mcp: 'start',
  'organizations-and-projects': 'account',
  analytics: 'account',
  settings: 'account',
  deploy: 'selfHost'
};

const COPY = {
  en: {
    start: 'Start here',
    account: 'Projects and account',
    selfHost: 'Self-hosting',
    more: 'More docs',
    paid: 'Pro and Enterprise only.',
    intro:
      'Every page is also available as Markdown by appending `.md` to its URL. The whole documentation in one file:'
  },
  es: {
    start: 'Empieza aquí',
    account: 'Proyectos y cuenta',
    selfHost: 'Instálalo tú mismo',
    more: 'Más guías',
    paid: 'Solo Pro y Enterprise.',
    intro:
      'Cada página también está en Markdown: agrega `.md` a su URL. Toda la documentación en un solo archivo:'
  }
} as const;

const slugOf = (href: string | undefined, lang: Lang) =>
  href?.slice(DOCS_ROOT[lang].length).replace(/\/$/, '');

const flatten = (node: DocNavNode): DocNavNode[] => [
  node,
  ...(node.items ?? []).flatMap(flatten)
];

/** Docs grouped the way the sidebar groups them, in sidebar order. */
export async function docSections(
  lang: Lang
): Promise<{ title: string; docs: { doc: Doc; label: string }[] }[]> {
  const docs = await docsOf(lang);
  const byId = new Map(docs.map(d => [d.id, d]));
  // The root of the docs is the welcome page.
  byId.set('', byId.get('welcome')!);
  const copy = COPY[lang];

  const dupes = new Set(
    docs
      .map(d => d.data.title)
      .filter((title, i, all) => all.indexOf(title) !== i)
  );
  const used = new Set<string>();
  const entry = (slug: string, parent?: string) => {
    const doc = byId.get(slug);
    if (!doc || used.has(doc.id)) return [];
    used.add(doc.id);
    // "Tools" exists both as a Get started step and as the Tools guide.
    const label =
      parent && dupes.has(doc.data.title)
        ? `${parent}: ${doc.data.title}`
        : doc.data.title;
    return [{ doc, label }];
  };

  const loose: Record<string, { doc: Doc; label: string }[]> = {
    start: [],
    account: [],
    selfHost: []
  };
  const groups: { title: string; docs: { doc: Doc; label: string }[] }[] = [];

  for (const node of docsNav(lang)) {
    const slug = slugOf(node.href, lang);
    if (!node.items) {
      if (slug !== undefined)
        loose[LOOSE[slug] ?? 'account'].push(...entry(slug));
      continue;
    }
    const items: { doc: Doc; label: string }[] = [];
    const walk = (n: DocNavNode, parent: string) => {
      const s = slugOf(n.href, lang);
      if (s !== undefined) items.push(...entry(s, parent));
      n.items?.forEach(child => walk(child, n.label));
    };
    if (slug !== undefined) items.push(...entry(slug));
    node.items.forEach(child => walk(child, node.label));
    groups.push({ title: node.label, docs: items });
  }

  const rest = docs
    .filter(d => !used.has(d.id))
    .sort((a, b) => a.data.order - b.data.order)
    .map(doc => ({ doc, label: doc.data.title }));

  return [
    { title: copy.start, docs: loose.start },
    ...groups,
    { title: copy.account, docs: loose.account },
    { title: copy.selfHost, docs: loose.selfHost },
    ...(rest.length ? [{ title: copy.more, docs: rest }] : [])
  ].filter(s => s.docs.length);
}

const link = (url: string, title: string, note: string) =>
  `- [${title}](${url}): ${note}`;

const docLink = (doc: Doc, label: string, lang: Lang) => {
  const prefix = lang === 'es' ? '/es/docs/' : '/docs/';
  const note = PAID.has(doc.id)
    ? `${doc.data.description} ${COPY[lang].paid}`
    : doc.data.description;
  return link(`${SITE.url}${prefix}${doc.id}.md`, label, note);
};

const KEY_FACTS = {
  en: `## Key facts

- App: ${SITE.appUrl}
- A project's MCP URL: \`https://mcp.ganju.ai/<project-slug>\`, shown on the project's Home page. Changing the slug changes the URL.
- Claude Code: \`claude mcp add --transport http <name> https://mcp.ganju.ai/<project-slug>\`
- Gemini CLI: \`gemini mcp add --transport http --scope user <name> https://mcp.ganju.ai/<project-slug>\`
- CLI: \`npm install -g @ganju/cli\` (Node 20 or newer); the binary is \`ganju\`.
- Data API: \`${SITE.apiUrl}/organization/<organizationId>/project/<projectId>/artifact/data\`, described in OpenAPI at ${SITE.apiUrl}/openapi/data.json
- Plans: Free $0 (1 project, 100 bot replies a month, 7 tools, 3 HTTP endpoints; no functions, Data or Assistant), Pro $29 a month, Enterprise by agreement. Details: ${SITE.url}/pricing.md
- Source: ${SITE.repo} (Apache-2.0). Examples: ${SITE.repo}/tree/main/examples. Agent skill for the CLI: ${SITE.repo}/tree/main/skills/ganju-cli`,
  es: `## Datos clave

- App: ${SITE.appUrl}
- URL MCP de un proyecto: \`https://mcp.ganju.ai/<slug-del-proyecto>\`, en la página Inicio del proyecto. Cambiar el slug cambia la URL.
- Claude Code: \`claude mcp add --transport http <nombre> https://mcp.ganju.ai/<slug-del-proyecto>\`
- Gemini CLI: \`gemini mcp add --transport http --scope user <nombre> https://mcp.ganju.ai/<slug-del-proyecto>\`
- CLI: \`npm install -g @ganju/cli\` (Node 20 o más reciente); el comando es \`ganju\`.
- API de Datos: \`${SITE.apiUrl}/organization/<organizationId>/project/<projectId>/artifact/data\`, descrita en OpenAPI en ${SITE.apiUrl}/openapi/data.json
- Planes: Free $0 (1 proyecto, 100 respuestas del bot al mes, 7 herramientas, 3 endpoints HTTP; sin funciones, Datos ni Asistente), Pro $29 al mes, Enterprise por acuerdo. Detalles: ${SITE.url}/es/precios.md
- Código: ${SITE.repo} (Apache-2.0). Ejemplos: ${SITE.repo}/tree/main/examples. Skill del CLI para agentes: ${SITE.repo}/tree/main/skills/ganju-cli`
};

const FOR_AGENTS = {
  en: `## For agents

Which way to add a tool:
- The catalog, when the service is already there (Gmail, Outlook, Slack, Google Calendar, Cal.com, GitHub, Notion, web search).
- A remote MCP server, connected from the Tools page, for a service that publishes one.
- An HTTP endpoint for one request to an API: no code, every plan. Inputs go in as \`{{name}}\`; \`{name}\` is refused.
- A function for several steps, the project's database, or computing something. Pro and Enterprise only.

Known traps:
- \`ganju deploy\` replaces every function of the project. A function missing from \`ganju.json\` stops existing.
- Tests run for real: a test that sends an email or writes a row does it.
- Changing a project's slug changes its MCP URL; clients on the old URL stop connecting.
- \`ganju login\` refuses to run while \`GANJU_API_TOKEN\` is set.
- After a session reads outside content (an email, a web page), a sensitive action needs the person's approval on a dashboard link, which expires after 10 minutes. Read-only tools run straight away.

Function limits: 5 seconds of CPU per call, a timeout of at most 30 seconds, results over 256 KB cut short, 60 calls a minute per tool, and up to 50 functions in a 3 MB bundle per project.`,
  es: `## Para agentes

Qué vía usar para agregar una herramienta:
- El catálogo, cuando el servicio ya está (Gmail, Outlook, Slack, Google Calendar, Cal.com, GitHub, Notion, búsqueda web).
- Un servidor MCP remoto, conectado desde la página Acciones, para un servicio que lo publique.
- Un endpoint HTTP para una sola petición a una API: sin código, en todos los planes. Los datos de entrada van como \`{{nombre}}\`; \`{nombre}\` se rechaza.
- Una función para varios pasos, la base de datos del proyecto o un cálculo. Solo Pro y Enterprise.

Trampas conocidas:
- \`ganju deploy\` reemplaza todas las funciones del proyecto. Una función que no esté en \`ganju.json\` deja de existir.
- Las pruebas son reales: una prueba que envía un correo o guarda una fila lo hace de verdad.
- Cambiar el slug de un proyecto cambia su URL MCP; los clientes con la URL anterior dejan de conectarse.
- \`ganju login\` no se ejecuta mientras \`GANJU_API_TOKEN\` esté definido.
- Cuando una sesión ya leyó contenido externo (un correo, una página web), una acción sensible necesita la aprobación de la persona en un enlace del panel, que vence a los 10 minutos. Las herramientas de solo lectura se ejecutan de inmediato.

Límites de las funciones: 5 segundos de CPU por llamada, un tiempo máximo de 30 segundos, resultados de más de 256 KB recortados, 60 llamadas por minuto por herramienta, y hasta 50 funciones en un bundle de 3 MB por proyecto.`
};

export async function llmsTxt(lang: Lang): Promise<string> {
  const sections = await docSections(lang);
  const docs = sections
    .map(
      s =>
        `## ${s.title}\n\n${s.docs.map(d => docLink(d.doc, d.label, lang)).join('\n')}`
    )
    .join('\n\n');

  if (lang === 'es') {
    return `# ${SITE.name}

> Ganju conecta asistentes de IA como Claude, ChatGPT y Cursor, y bots de Telegram, Slack, WhatsApp y Discord, con tus propios archivos, herramientas y apps. Un proyecto es a la vez un servidor MCP y un bot. Se construye conversando con el Asistente o con código desde el CLI. Código abierto.

${COPY.es.intro} ${SITE.url}/es/llms-full.txt

${KEY_FACTS.es}

${FOR_AGENTS.es}

## Sitio

${link(`${SITE.url}/es/index.md`, 'Resumen', 'Qué es Ganju y qué hace')}
${link(`${SITE.url}/es/precios.md`, 'Precios', 'Planes, límites e instalación propia')}

${docs}

## Optional

${link(`${SITE.url}/llms.txt`, 'English', 'The same index in English, with the blog')}
${link(`${SITE.url}/es/privacidad.md`, 'Política de Privacidad', 'Versión en español, autoritativa para titulares en Colombia')}
${link(`${SITE.url}/es/terminos.md`, 'Términos y Condiciones', 'Versión en español, autoritativa para usuarios en Colombia')}
${link(`${SITE.url}/es/subencargados.md`, 'Subencargados', 'Cada proveedor que puede tratar datos por cuenta nuestra')}
${link(`${SITE.url}/es/dpa.md`, 'Acuerdo de Tratamiento de Datos', 'Aplica automáticamente a todos los clientes')}
`;
  }

  const posts = (await getCollection('blog'))
    .filter(p => !p.data.draft)
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

  return `# ${SITE.name}

> Ganju connects AI assistants like Claude, ChatGPT and Cursor, and Telegram, Slack, WhatsApp and Discord bots, to your own files, tools and apps. One project is both an MCP server and a bot. Owners build it by chatting with the Assistant; developers write functions with the CLI. Open source.

${COPY.en.intro} ${SITE.url}/llms-full.txt

${KEY_FACTS.en}

${FOR_AGENTS.en}

## Site

${link(`${SITE.url}/index.md`, 'Overview', 'What Ganju is and what it does')}
${link(`${SITE.url}/pricing.md`, 'Pricing', 'Plans, limits, and self-hosting')}

${docs}

## Optional

${link(`${SITE.url}/es/llms.txt`, 'Español', 'The same index in Spanish; the whole site except the blog is under /es')}
${link(`${SITE.url}/privacy.md`, 'Privacy Policy', 'What the hosted service collects, who it is shared with, and how to delete it')}
${link(`${SITE.url}/terms.md`, 'Terms of Service', 'Terms for the hosted service; the source code is Apache-2.0')}
${link(`${SITE.url}/subprocessors.md`, 'Subprocessors', 'Every provider that may process data on our behalf, and how changes are announced')}
${link(`${SITE.url}/dpa.md`, 'Data Processing Agreement', 'Applies automatically to every customer; includes SCCs and security measures')}
${posts.map(p => link(`${SITE.url}/blog/${p.id}.md`, p.data.title, p.data.description)).join('\n')}
`;
}

export async function llmsFullTxt(lang: Lang): Promise<string> {
  const sections = await docSections(lang);
  const pages = sections.flatMap(s =>
    s.docs.map(d => docMarkdown(d.doc, lang))
  );
  const head =
    lang === 'es'
      ? `# ${SITE.name}: documentación completa\n\nÍndice: ${SITE.url}/es/llms.txt`
      : `# ${SITE.name}: full documentation\n\nIndex: ${SITE.url}/llms.txt`;
  return `${head}\n\n${pages.join('\n\n---\n\n')}\n`;
}
