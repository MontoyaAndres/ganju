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
    'Ganju connects AI assistants like Claude, ChatGPT, and Cursor — and your Telegram, Slack, WhatsApp, and Discord bots — to your own files, tools, and apps. Set it up in minutes, no coding required. Open source.',
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
