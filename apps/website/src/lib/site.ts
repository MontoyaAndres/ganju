export const SITE = {
  name: 'Ganju',
  url: 'https://ganju.ai',
  appUrl: 'https://app.ganju.ai',
  docsUrl: '/docs',
  email: 'hello@ganju.ai',
  apiUrl: 'https://api.ganju.ai',
  repo: 'https://github.com/MontoyaAndres/ganju',
  tagline: 'Connect your AI to your files, tools & apps.',
  homeTitle: 'Ganju — Connect Your AI to Your Files, Tools & Apps',
  description:
    'Ganju connects AI assistants like Claude, ChatGPT, and Gemini — and your Telegram, Slack, WhatsApp, and Discord bots — to your own files, tools, and apps. Set it up in minutes, no coding required. Open source.',
  social: {
    x: 'https://x.com/ganju_ai',
    linkedin: 'https://www.linkedin.com/company/ganju',
    github: 'https://github.com/MontoyaAndres/ganju'
  }
} as const;

/**
 * Supplier identity. Colombia's Estatuto del Consumidor (Ley 1480 de 2011,
 * art. 50) requires an online supplier to publish its razón social, NIT,
 * address for judicial notice, phone, and email where a buyer can see them —
 * which is why this ends up in the footer, not just in the legal pages.
 *
 * `nit` is rendered only when set: leave it empty until the RUT is issued
 * rather than shipping a placeholder that reads as a real number.
 */
export const LEGAL = {
  entity: 'Ganju S.A.S.',
  nit: '',
  address: 'Bogotá, D.C., Colombia',
  phone: '+57 312 4678519',
  // E.164, for `tel:` links — humans read `phone`, dialers read this.
  phoneHref: '+573124678519',
  email: SITE.email,
  jurisdiction: 'Bogotá, D.C., Colombia'
} as const;

/**
 * Spanish half of the identity above, for `/es`. Navigation and footer strings
 * live in `lib/i18n.ts`; this is only what SEO and structured data need.
 */
export const SITE_ES = {
  tagline: 'Conecta tu IA con tus archivos, herramientas y apps.',
  homeTitle: 'Ganju — Conecta tu IA con tus archivos, herramientas y apps',
  description:
    'Ganju conecta asistentes de IA como Claude, ChatGPT y Gemini — y tus bots de Telegram, Slack, WhatsApp y Discord — con tus propios archivos, herramientas y aplicaciones. Se configura en minutos, sin programar. Código abierto.'
} as const;

const ORG_ID = `${SITE.url}/#organization`;

export const ORGANIZATION_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': ORG_ID,
  name: SITE.name,
  url: SITE.url,
  logo: `${SITE.url}/icons/favicon.svg`,
  description: SITE.description,
  email: SITE.email,
  sameAs: [SITE.social.x, SITE.social.linkedin, SITE.social.github]
} as const;

export const WEBSITE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE.url}/#website`,
  name: SITE.name,
  url: SITE.url,
  description: SITE.description,
  publisher: { '@id': ORG_ID },
  inLanguage: 'en'
} as const;

export const SOFTWARE_APPLICATION_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE.name,
  url: SITE.url,
  description: SITE.description,
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Web',
  publisher: { '@id': ORG_ID },
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    description: 'Free plan available; open source under Apache-2.0.'
  }
} as const;

/** Same application, described in Spanish for `/es`. */
export const SOFTWARE_APPLICATION_SCHEMA_ES = {
  ...SOFTWARE_APPLICATION_SCHEMA,
  url: `${SITE.url}/es`,
  description: SITE_ES.description,
  inLanguage: 'es',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    description: 'Plan gratuito disponible; código abierto bajo Apache-2.0.'
  }
} as const;

/**
 * SoftwareApplication carrying the real plan prices, for the pricing page.
 * `offers` is what makes Google eligible to show a price alongside the result.
 */
export const PRICING_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE.name,
  url: `${SITE.url}/pricing`,
  description: SITE.description,
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Web',
  publisher: { '@id': ORG_ID },
  offers: [
    {
      '@type': 'Offer',
      name: 'Free',
      price: '0',
      priceCurrency: 'USD',
      url: `${SITE.url}/pricing`,
      description:
        'One workspace, up to 7 tools, 3 prompts, 1 channel, and 100 channel messages a month.'
    },
    {
      '@type': 'Offer',
      name: 'Pro',
      price: '20',
      priceCurrency: 'USD',
      url: `${SITE.url}/pricing`,
      description:
        'Unlimited projects, teammates, tools and prompts. Includes 3,000 messages a month and 1 GB of searchable content, then usage-based pricing.'
    }
  ]
} as const;

/** The same plan prices, described in Spanish for `/es/precios`. */
export const PRICING_SCHEMA_ES = {
  ...PRICING_SCHEMA,
  url: `${SITE.url}/es/precios`,
  description: SITE_ES.description,
  inLanguage: 'es',
  offers: [
    {
      '@type': 'Offer',
      name: 'Gratis',
      price: '0',
      priceCurrency: 'USD',
      url: `${SITE.url}/es/precios`,
      description:
        'Un espacio de trabajo, hasta 7 herramientas, 3 prompts, 1 canal y 100 mensajes de canal al mes.'
    },
    {
      '@type': 'Offer',
      name: 'Pro',
      price: '20',
      priceCurrency: 'USD',
      url: `${SITE.url}/es/precios`,
      description:
        'Proyectos, compañeros de equipo, herramientas y prompts ilimitados. Incluye 3.000 mensajes al mes y 1 GB de contenido consultable; de ahí en adelante, precio por consumo.'
    }
  ]
} as const;

/** Build a BreadcrumbList so search results show the page's place in the site. */
export function breadcrumbSchema(trail: { label: string; href: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map(({ label, href }, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: label,
      item: new URL(href, SITE.url).href
    }))
  };
}

/** Build a TechArticle schema for a docs page. */
export function techArticleSchema(doc: {
  title: string;
  description: string;
  url: string;
  updated?: Date;
  lang?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: doc.title,
    description: doc.description,
    url: doc.url,
    mainEntityOfPage: doc.url,
    ...(doc.updated ? { dateModified: doc.updated.toISOString() } : {}),
    author: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
    isPartOf: { '@type': 'WebSite', '@id': `${SITE.url}/#website` },
    inLanguage: doc.lang ?? 'en'
  };
}

/** Build a Blog schema listing the posts, for the blog index. */
export function blogSchema(
  posts: { title: string; description: string; url: string; date: Date }[]
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': `${SITE.url}/blog#blog`,
    name: `${SITE.name} Blog`,
    url: `${SITE.url}/blog`,
    description: 'Updates, guides, and stories from the Ganju team.',
    publisher: { '@id': ORG_ID },
    inLanguage: 'en',
    blogPost: posts.map(post => ({
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.description,
      url: post.url,
      datePublished: post.date.toISOString()
    }))
  };
}

/** Build a FAQPage schema from on-page Q&A pairs. */
export function faqSchema(faqs: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a }
    }))
  };
}

/** Build a BlogPosting schema for a post page. */
export function blogPostingSchema(post: {
  title: string;
  description: string;
  url: string;
  date: Date;
  updated?: Date;
  author: string;
  image: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    url: post.url,
    mainEntityOfPage: post.url,
    datePublished: post.date.toISOString(),
    dateModified: (post.updated ?? post.date).toISOString(),
    image: post.image,
    author: { '@type': 'Organization', name: post.author, url: SITE.url },
    publisher: { '@id': ORG_ID },
    inLanguage: 'en'
  };
}
