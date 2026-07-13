import { utils } from '@ganju/utils';

export const SEO = {
  /** The marketing site — this is what should rank. */
  siteUrl: 'https://ganju.ai',
  /** This app. Private, except for the sign-in page. */
  appUrl: 'https://app.ganju.ai',
  name: 'Ganju',
  ogImage: 'https://ganju.ai/images/hero.png',
  ogImageAlt: 'Connect your AI to your files, tools & apps'
} as const;

export const LOCALES = utils.constants.LANGUAGES;
export const DEFAULT_LOCALE = utils.constants.LANGUAGE_EN;

/**
 * Absolute URL for a path in a given locale. Next's i18n routing serves the
 * default locale unprefixed (`/`) and the others under a prefix (`/es`).
 */
export function localeUrl(path: string, locale: string = DEFAULT_LOCALE) {
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  const url = `${SEO.appUrl}${prefix}${path === '/' ? '' : path}`;
  // Keep the bare origin as `https://app.ganju.ai/`, not `https://app.ganju.ai`.
  return url === SEO.appUrl ? `${SEO.appUrl}/` : url;
}
