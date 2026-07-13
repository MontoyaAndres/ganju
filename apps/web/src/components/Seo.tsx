import Head from 'next/head';

import { SEO, LOCALES, DEFAULT_LOCALE, localeUrl } from '../seo';

export interface ISeoProps {
  title: string;
  description: string;
  /**
   * Allow this page into search results. Defaults to `false` — the dashboard is
   * private, so the safe default is to stay out of the index. Only the sign-in
   * page opts in.
   */
  index?: boolean;
  /** Path this page lives at, e.g. `/`. Required when `index` is set. */
  path?: string;
  /** Current locale, so the canonical and hreflang tags point at the right URL. */
  locale?: string;
}

/**
 * Per-page SEO tags. `next/head` keeps the *last* tag it sees for a given
 * `key`, and pages render after `_app`, so anything set here overrides the
 * defaults in `_app.tsx`.
 */
export const Seo = ({
  title,
  description,
  index = false,
  path = '/',
  locale = DEFAULT_LOCALE
}: ISeoProps) => {
  const canonical = localeUrl(path, locale);

  return (
    <Head>
      <title key="title">{title}</title>
      <meta name="description" content={description} key="description" />
      <meta
        name="robots"
        content={index ? 'index, follow' : 'noindex, nofollow'}
        key="robots"
      />

      {index && <link rel="canonical" href={canonical} key="canonical" />}

      {/* Tell search engines the sign-in page exists in both languages, so the
          English and Spanish versions aren't treated as duplicates. */}
      {index &&
        LOCALES.map((code: string) => (
          <link
            rel="alternate"
            hrefLang={code}
            href={localeUrl(path, code)}
            key={`alternate-${code}`}
          />
        ))}
      {index && (
        <link
          rel="alternate"
          hrefLang="x-default"
          href={localeUrl(path, DEFAULT_LOCALE)}
          key="alternate-default"
        />
      )}

      <meta property="og:title" content={title} key="og:title" />
      <meta
        property="og:description"
        content={description}
        key="og:description"
      />
      <meta property="og:url" content={canonical} key="og:url" />
      <meta property="og:image" content={SEO.ogImage} key="og:image" />
      <meta
        property="og:image:alt"
        content={SEO.ogImageAlt}
        key="og:image:alt"
      />

      <meta name="twitter:title" content={title} key="twitter:title" />
      <meta
        name="twitter:description"
        content={description}
        key="twitter:description"
      />
      <meta name="twitter:image" content={SEO.ogImage} key="twitter:image" />
    </Head>
  );
};
