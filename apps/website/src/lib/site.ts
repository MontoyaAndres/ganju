export const SITE = {
  name: 'Ganju',
  url: 'https://ganju.ai',
  appUrl: 'https://app.ganju.ai',
  docsUrl: '/docs',
  email: 'hello@ganju.ai',
  apiUrl: 'https://api.ganju.ai',
  repo: 'https://github.com/MontoyaAndres/ganju',
  tagline: 'Connect your AI to your files, tools & apps.',
  description:
    'Ganju connects AI assistants like Claude, ChatGPT, and Gemini — and your Telegram, Slack, WhatsApp, and Discord bots — to your own files, tools, and apps. Set it up in minutes, no coding required. Open source.',
  social: {
    x: 'https://x.com/ganju_ai',
    linkedin: 'https://www.linkedin.com/company/ganju',
    github: 'https://github.com/MontoyaAndres/ganju'
  }
} as const;

export const NAV = [
  { label: 'Features', href: '/#features' },
  { label: 'Docs', href: '/docs' },
  { label: 'Blog', href: '/blog' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Contact', href: '/contact' }
] as const;

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
