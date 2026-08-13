/**
 * Site chrome in every language we publish.
 *
 * Everything is translated except the blog, whose posts are dated and would
 * double the work of every future one — the Spanish nav points at the English
 * blog on purpose. Adding a language means adding a key here plus the pages
 * themselves; nothing else reads locale.
 */
import { utils } from './utils';

export type Lang = 'en' | 'es';

/**
 * Where each language's homepage lives. Trailing slash on `/es/` because Pages
 * 308s the short form there anyway, and it is what the page's own canonical
 * URL says — links that skip it pay a redirect on every click.
 */
export const HOME: Record<Lang, string> = { en: '/', es: '/es/' };

/**
 * hreflang set for the homepage. Every variant has to advertise the whole set
 * (including itself) or search engines ignore the pairing — see Seo.astro.
 */
export const HOME_ALTERNATES = { en: HOME.en, es: HOME.es } as const;

/**
 * Language links go through `/` with a `?lang=` hint rather than straight to
 * the target page: `functions/index.ts` reads the parameter, remembers the
 * choice in a cookie, and forwards on. Without that round trip an explicit
 * choice would be undone by the next geo redirect.
 */
export const LANG_HREF: Record<Lang, string> = {
  en: `/?${utils.constants.LANGUAGE_QUERY_PARAM}=en`,
  es: `/?${utils.constants.LANGUAGE_QUERY_PARAM}=es`
};

export const UI = {
  en: {
    label: 'English',
    brandAria: 'Ganju home',
    navAria: 'Primary',
    menuAria: 'Toggle menu',
    starAria: 'Star Ganju on GitHub',
    star: 'Star',
    getStarted: 'Get started',
    nav: [
      { label: 'Features', href: '/#features' },
      { label: 'Docs', href: '/docs' },
      { label: 'Blog', href: '/blog' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Contact', href: '/contact' }
    ],
    footer: {
      tagline: 'Connect your AI to your files, tools, and apps.',
      product: {
        title: 'Product',
        links: [
          { label: 'Features', href: '/#features' },
          { label: 'How it works', href: '/#how' },
          { label: 'Integrations', href: '/#integrations' },
          { label: 'Pricing', href: '/pricing' }
        ]
      },
      resources: {
        title: 'Resources',
        links: [
          { label: 'Docs', href: '/docs' },
          { label: 'Blog', href: '/blog' },
          { label: 'Contact', href: '/contact' }
        ]
      },
      legal: {
        title: 'Legal',
        links: [
          { label: 'Privacy', href: '/privacy' },
          { label: 'Terms', href: '/terms' },
          { label: 'Subprocessors', href: '/subprocessors' },
          { label: 'DPA', href: '/dpa' }
        ],
        license: 'License (Apache-2.0)'
      },
      languageAria: 'Language'
    }
  },
  es: {
    label: 'Español',
    brandAria: 'Inicio de Ganju',
    navAria: 'Principal',
    menuAria: 'Abrir menú',
    starAria: 'Dale una estrella a Ganju en GitHub',
    star: 'Estrella',
    getStarted: 'Empezar',
    nav: [
      { label: 'Funciones', href: '/es/#features' },
      { label: 'Docs', href: '/es/docs' },
      { label: 'Blog', href: '/blog' },
      { label: 'Precios', href: '/es/precios' },
      { label: 'Contacto', href: '/es/contacto' }
    ],
    footer: {
      tagline: 'Conecta tu IA con tus archivos, herramientas y apps.',
      product: {
        title: 'Producto',
        links: [
          { label: 'Funciones', href: '/es/#features' },
          { label: 'Cómo funciona', href: '/es/#how' },
          { label: 'Integraciones', href: '/es/#integrations' },
          { label: 'Precios', href: '/es/precios' }
        ]
      },
      resources: {
        title: 'Recursos',
        links: [
          { label: 'Docs', href: '/es/docs' },
          { label: 'Blog', href: '/blog' },
          { label: 'Contacto', href: '/es/contacto' }
        ]
      },
      legal: {
        title: 'Legal',
        links: [
          { label: 'Privacidad', href: '/es/privacidad' },
          { label: 'Términos', href: '/es/terminos' },
          { label: 'Subencargados', href: '/es/subencargados' },
          { label: 'DPA', href: '/es/dpa' }
        ],
        license: 'Licencia (Apache-2.0)'
      },
      languageAria: 'Idioma'
    }
  }
} as const satisfies Record<Lang, unknown>;

/** Narrow an arbitrary `lang` prop (a BCP-47 tag) to a language we ship. */
export function toLang(lang: string | undefined): Lang {
  return lang?.startsWith('es') ? 'es' : 'en';
}

/** Chrome around the docs — sidebar, article furniture, and the feedback block. */
export const DOCS = {
  en: {
    /** Brand half of the title tag, so 34 doc pages don't compete as bare nouns. */
    brand: 'Ganju Docs',
    menu: 'Menu',
    navTitle: 'Documentation',
    navAria: 'Documentation',
    eyebrow: 'Documentation',
    landingTitle: 'Documentation',
    soon: 'Soon',
    lastUpdated: 'Last updated',
    /** BCP-47 tag for formatting the "last updated" date. */
    dateLocale: 'en-US',
    feedback: {
      eyebrow: 'Open source',
      heading: 'Found a bug or have an idea?',
      body: 'Ganju is open source. Report bugs and request features on GitHub — we read every issue.',
      create: 'Create a GitHub issue',
      browse: 'Browse open issues'
    }
  },
  es: {
    brand: 'Docs de Ganju',
    menu: 'Menú',
    navTitle: 'Documentación',
    navAria: 'Documentación',
    eyebrow: 'Documentación',
    landingTitle: 'Documentación',
    soon: 'Pronto',
    lastUpdated: 'Última actualización',
    dateLocale: 'es-CO',
    feedback: {
      eyebrow: 'Código abierto',
      heading: '¿Encontraste un error o tienes una idea?',
      body: 'Ganju es software libre. Reporta errores y pide funciones en GitHub — leemos todos los issues.',
      create: 'Crear un issue en GitHub',
      browse: 'Ver los issues abiertos'
    }
  }
} as const satisfies Record<Lang, unknown>;

/**
 * Copy for the contact form. The submit handler reads the three status strings
 * off `data-` attributes, so one script serves both languages — see
 * components/ContactForm.astro.
 */
export const CONTACT = {
  en: {
    nameLabel: 'Your name or company',
    namePlaceholder: 'My company Inc.',
    emailLabel: 'Email',
    emailPlaceholder: 'you@company.com',
    messageLabel: 'How can we help?',
    messagePlaceholder: "Tell us what you're building or what you need…",
    submit: 'Send message',
    sending: 'Sending…',
    success:
      "🎉 Thanks! Your message is on its way — we'll get back to you soon.",
    failure: 'Could not send your message.',
    notePrefix: 'We usually reply within a day. Prefer email? Write to'
  },
  es: {
    nameLabel: 'Tu nombre o empresa',
    namePlaceholder: 'Mi empresa S.A.S.',
    emailLabel: 'Correo electrónico',
    emailPlaceholder: 'tu@empresa.com',
    messageLabel: '¿En qué te podemos ayudar?',
    messagePlaceholder: 'Cuéntanos qué estás construyendo o qué necesitas…',
    submit: 'Enviar mensaje',
    sending: 'Enviando…',
    success: '🎉 ¡Gracias! Tu mensaje va en camino — te responderemos pronto.',
    failure: 'No pudimos enviar tu mensaje.',
    notePrefix:
      'Solemos responder en un día. ¿Prefieres el correo? Escríbenos a'
  }
} as const satisfies Record<Lang, unknown>;

/**
 * Copy for the pricing estimator. It lives out here rather than in the
 * component because the component is a hydrated island: Astro serialises its
 * props, so the strings have to cross as plain data. Anything variable is a
 * `{placeholder}` the component fills in — functions would not survive the
 * trip.
 */
export interface CalculatorCopy {
  /** BCP-47 tag for `Intl` — drives thousands separators and currency shape. */
  locale: string;
  presets: { label: string; messages: number; storageGb: number }[];
  messagesLabel: string;
  messagesUnit: string;
  /** `{included}` — messages bundled with the plan. */
  messagesHint: string;
  storageLabel: string;
  storageUnit: string;
  /** `{included}` — GB bundled with the plan. */
  storageHint: string;
  domainLabel: string;
  /** `{price}` — monthly price of the add-on. */
  domainHint: string;
  resultLabel: string;
  resultPer: string;
  proPlan: string;
  /** `{n}` — messages beyond the allowance. */
  extraMessages: string;
  /** `{n}` — GB beyond the allowance. */
  extraStorage: string;
  domainLine: string;
  /** `{messages}` and `{storage}` — what the plan bundles. */
  included: string;
  note: string;
  free: string;
}

export const CALCULATOR: Record<Lang, CalculatorCopy> = {
  en: {
    locale: 'en-US',
    presets: [
      { label: '👋 Just trying it out', messages: 1_000, storageGb: 1 },
      { label: '💬 Small support bot', messages: 8_000, storageGb: 3 },
      { label: '🚀 Growing product', messages: 30_000, storageGb: 10 },
      { label: '🏢 High volume', messages: 100_000, storageGb: 30 }
    ],
    messagesLabel: 'How many messages will your bots send?',
    messagesUnit: '/mo',
    messagesHint:
      'Every reply your bot sends on Telegram, Slack, WhatsApp, or Discord. The first {included} each month are included. This estimate assumes you connect your own AI model — replies on ours are included up to 1,000/mo, then $15 per 1,000.',
    storageLabel: 'How much can your AI search through?',
    storageUnit: ' GB',
    storageHint:
      "Documents, web pages, and files your AI can read and answer from. The first {included} GB are included — that's thousands of pages.",
    domainLabel: 'Use your own web address',
    domainHint: 'Like your-company.mcp.ganju.ai — adds {price}/mo',
    resultLabel: "You'd pay about",
    resultPer: 'per month',
    proPlan: 'Pro plan',
    extraMessages: '{n} extra messages',
    extraStorage: '{n} GB extra content',
    domainLine: 'Your own web address',
    included:
      'Your plan already includes {messages} messages and {storage} GB every month.',
    note: 'Using Ganju from Claude, Cursor, or ChatGPT is always free — it never uses up your messages.',
    free: '🎉 Good news — this fits the Free plan. You might not need Pro yet.'
  },
  es: {
    locale: 'es-CO',
    presets: [
      { label: '👋 Solo estoy probando', messages: 1_000, storageGb: 1 },
      { label: '💬 Bot de soporte pequeño', messages: 8_000, storageGb: 3 },
      { label: '🚀 Producto en crecimiento', messages: 30_000, storageGb: 10 },
      { label: '🏢 Alto volumen', messages: 100_000, storageGb: 30 }
    ],
    messagesLabel: '¿Cuántos mensajes enviarán tus bots?',
    messagesUnit: '/mes',
    messagesHint:
      'Cada respuesta que tu bot envía en Telegram, Slack, WhatsApp o Discord. Los primeros {included} de cada mes están incluidos. Este estimado asume que conectas tu propio modelo de IA — con el nuestro van incluidas hasta 1.000/mes, y luego cuestan $15 por cada 1.000.',
    storageLabel: '¿Cuánto contenido puede buscar tu IA?',
    storageUnit: ' GB',
    storageHint:
      'Documentos, páginas web y archivos que tu IA puede leer y usar para responder. Los primeros {included} GB están incluidos — son miles de páginas.',
    domainLabel: 'Usar tu propia dirección web',
    domainHint: 'Como tu-empresa.mcp.ganju.ai — suma {price}/mes',
    resultLabel: 'Pagarías alrededor de',
    resultPer: 'al mes',
    proPlan: 'Plan Pro',
    extraMessages: '{n} mensajes adicionales',
    extraStorage: '{n} GB de contenido adicional',
    domainLine: 'Tu propia dirección web',
    included: 'Tu plan ya incluye {messages} mensajes y {storage} GB cada mes.',
    note: 'Usar Ganju desde Claude, Cursor o ChatGPT siempre es gratis — nunca consume tus mensajes.',
    free: '🎉 Buenas noticias: esto cabe en el plan Gratis. Puede que todavía no necesites Pro.'
  }
};
