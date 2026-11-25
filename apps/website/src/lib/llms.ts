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
    intro:
      'Every page is also available as Markdown by appending `.md` to its URL. The whole documentation in one file:'
  },
  es: {
    start: 'Empieza aquí',
    account: 'Proyectos y cuenta',
    selfHost: 'Instálalo tú mismo',
    more: 'Más guías',
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
  return link(`${SITE.url}${prefix}${doc.id}.md`, label, doc.data.description);
};

const KEY_FACTS = {
  en: `## Key facts

- App: ${SITE.appUrl}
- A project's MCP URL: \`https://mcp.ganju.ai/<project-slug>\`, shown on the project's Home page. Changing the slug changes the URL.
- Claude Code: \`claude mcp add --transport http <name> https://mcp.ganju.ai/<project-slug>\`
- Gemini CLI: \`gemini mcp add --transport http --scope user <name> https://mcp.ganju.ai/<project-slug>\`
- CLI: \`npm install -g @ganju/cli\` (Node 20 or newer); the binary is \`ganju\`.
- Data API: \`${SITE.apiUrl}/organization/<organizationId>/project/<projectId>/artifact/data\`, described in OpenAPI at ${SITE.apiUrl}/openapi/data.json
- Plans: Pro $29 a month plus usage, starting with a 7-day free trial (card required, nothing charged until day 7); Enterprise by agreement. Self-hosting is free (Apache-2.0). Details: ${SITE.url}/pricing.md
- Source: ${SITE.repo} (Apache-2.0). Agent skill for the CLI: ${SITE.repo}/tree/main/skills/ganju-cli`,
  es: `## Datos clave

- App: ${SITE.appUrl}
- URL MCP de un proyecto: \`https://mcp.ganju.ai/<slug-del-proyecto>\`, en la página Inicio del proyecto. Cambiar el slug cambia la URL.
- Claude Code: \`claude mcp add --transport http <nombre> https://mcp.ganju.ai/<slug-del-proyecto>\`
- Gemini CLI: \`gemini mcp add --transport http --scope user <nombre> https://mcp.ganju.ai/<slug-del-proyecto>\`
- CLI: \`npm install -g @ganju/cli\` (Node 20 o más reciente); el comando es \`ganju\`.
- API de Datos: \`${SITE.apiUrl}/organization/<organizationId>/project/<projectId>/artifact/data\`, descrita en OpenAPI en ${SITE.apiUrl}/openapi/data.json
- Planes: Pro $29 al mes más consumo, con una prueba gratis de 7 días (se necesita tarjeta, no se cobra nada hasta el día 7); Enterprise por acuerdo. Instalarlo por tu cuenta es gratis (Apache-2.0). Detalles: ${SITE.url}/es/precios.md
- Código: ${SITE.repo} (Apache-2.0). Skill del CLI para agentes: ${SITE.repo}/tree/main/skills/ganju-cli`
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

> Crea software completo que funciona dentro de cualquier IA. Con Ganju construyes
> aplicaciones que funcionan, con su propio conocimiento, herramientas, datos y lógica,
> y las llevas a cualquier asistente de IA por MCP (Claude, ChatGPT, Cursor, Gemini CLI)
> o directo a las personas por apps de chat (WhatsApp, Telegram, Slack y Discord).
> Código abierto (Apache-2.0), en la nube o instalado por tu cuenta.

En vez de construir un frontend, un backend y un chatbot por separado, construyes una
vez en Ganju y la IA se vuelve la interfaz. Un mismo proyecto funciona como servidor
MCP y como bot de chat al mismo tiempo. Los dueños lo construyen conversando con el
Asistente; los desarrolladores usan el CLI \`ganju\`.

Ejemplos: ${SITE.repo}/tree/main/examples

${COPY.es.intro} ${SITE.url}/es/llms-full.txt

## En qué se diferencia Ganju

- **Frente a herramientas de automatización (n8n, Zapier, Make):** esas ejecutan flujos
  que se disparan con un evento. Ganju construye aplicaciones con las que las personas
  y los asistentes de IA conversan. Traen su propia base de conocimiento, base de datos
  y herramientas, y la IA decide cuándo usar cada una en la conversación.
- **Frente a constructores de chatbots:** te dan un bot que vive en un solo canal. Un
  proyecto de Ganju es un backend completo (datos, funciones, integraciones) que atiende
  todos los canales y todos los clientes MCP desde la misma fuente.
- **Frente a plataformas de RAG o de conocimiento:** esas responden preguntas con tus
  documentos. Ganju también lo hace, y además actúa: envía correos, agenda reuniones,
  escribe en una base de datos o llama a tus APIs, con aprobación humana para las
  acciones sensibles.
- **Frente a construir tu propio servidor MCP:** Ganju se encarga del hosting, la
  autenticación, las integraciones, los datos, la analítica y las aprobaciones de
  seguridad, para que te enfoques en la lógica. Igual puedes escribir funciones propias
  con el CLI \`ganju\`, o instalar todo por tu cuenta.

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

> Build complete software that runs inside any AI. Ganju lets you create working
> applications, with their own knowledge, tools, data, and logic, and deliver them
> to any AI assistant through MCP (Claude, ChatGPT, Cursor, Gemini CLI) or to people
> directly through chat apps (WhatsApp, Telegram, Slack, and Discord).
> Open source (Apache-2.0), hosted or self-hosted.

Instead of building a separate frontend, backend, and chatbot, you build once in Ganju
and the AI becomes the interface. A single project works as an MCP server and as a
chat bot at the same time. Owners build it by chatting with the Assistant; developers
use the \`ganju\` CLI.

Examples: ${SITE.repo}/tree/main/examples

${COPY.en.intro} ${SITE.url}/llms-full.txt

## How Ganju compares

- **vs. automation tools (n8n, Zapier, Make):** Those run workflows that a trigger
  fires. Ganju builds applications that people and AI assistants talk to. They come
  with their own knowledge base, database, and tools, and the AI decides when to use
  each one in a conversation.
- **vs. chatbot builders:** Chatbot builders give you a bot that lives in one channel.
  A Ganju project is a full backend (data, functions, integrations) that serves every
  channel and every MCP client from the same source.
- **vs. RAG / knowledge platforms:** Those answer questions from your documents. Ganju
  does that too, and it can also act: send emails, book meetings, write to a database,
  or call your APIs, with human approval for sensitive actions.
- **vs. building an MCP server yourself:** Ganju handles hosting, auth, integrations,
  data, analytics, and safety approvals, so you can focus on the logic. You can still
  write custom functions with the \`ganju\` CLI, or self-host the whole thing.

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
