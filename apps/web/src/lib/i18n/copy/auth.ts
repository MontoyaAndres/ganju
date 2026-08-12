import type { Catalog } from '../core';

/**
 * The sign-in screen, at `/` and at `/login`.
 *
 * The consent sentence is split into five pieces rather than one string with
 * placeholders, because two of them are anchors: JSX cannot be spliced into a
 * translated string. Spanish keeps the same five slots in the same order, which
 * is what makes the split safe here — `los Términos … y la Política …`.
 *
 * The legal links are per-language on purpose: `ganju.ai/terms` and
 * `ganju.ai/es/terminos` are the same document, and a Spanish speaker should
 * not have to read the English one to tick the box.
 */
const en = {
  seoTitle: 'Log in to Ganju',
  /** `/` — the canonical sign-in page, and the only indexed page in the app. */
  seoIndexDescription:
    'Log in to your Ganju account to manage your projects, resources, tools, and channels — and connect your AI to your files and apps.',
  /** `/login` — the same view, reached mid-OAuth-authorize. Never indexed. */
  seoLoginDescription:
    'Log in to your Ganju account to continue authorizing the application that sent you here.',
  /** `og:image:alt` — the share image is the marketing hero, in both languages. */
  seoImageAlt: 'Connect your AI to your files, tools & apps',

  headline: 'Give Your AI Superpowers',
  subheadline: 'No Coding Needed',
  signInGoogle: 'Sign in with Google',
  signInGithub: 'Sign in with GitHub',

  consentBefore: 'I have read and accept the ',
  consentTerms: 'Terms & Conditions',
  consentBetween: ' and the ',
  consentPrivacy: 'Privacy Policy',
  consentAfter: '.',
  termsUrl: 'https://ganju.ai/terms',
  privacyUrl: 'https://ganju.ai/privacy'
};

type AuthCopy = typeof en;

export const AUTH: Catalog<AuthCopy> = {
  en,
  es: {
    seoTitle: 'Inicia sesión en Ganju',
    seoIndexDescription:
      'Inicia sesión en tu cuenta de Ganju para gestionar tus proyectos, recursos, herramientas y canales — y conectar tu IA con tus archivos y aplicaciones.',
    seoLoginDescription:
      'Inicia sesión en tu cuenta de Ganju para continuar autorizando la aplicación que te trajo hasta aquí.',
    seoImageAlt: 'Conecta tu IA con tus archivos, herramientas y aplicaciones',

    headline: 'Dale superpoderes a tu IA',
    subheadline: 'Sin escribir código',
    signInGoogle: 'Entrar con Google',
    signInGithub: 'Entrar con GitHub',

    consentBefore: 'He leído y acepto los ',
    consentTerms: 'Términos y Condiciones',
    consentBetween: ' y la ',
    consentPrivacy: 'Política de Privacidad',
    consentAfter: '.',
    termsUrl: 'https://ganju.ai/es/terminos',
    privacyUrl: 'https://ganju.ai/es/privacidad'
  }
};
