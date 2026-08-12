import { NextResponse } from 'next/server';
import { utils } from '@ganju/utils';

import type { NextRequest } from 'next/server';

/**
 * Language routing for the dashboard.
 *
 * Next's own `i18n` config already serves `/es/*` alongside `/*`; what it does
 * not do is *choose*. Its built-in detection reads `Accept-Language`, which is
 * turned off in `next.config.js` — the Spanish surface exists for a Colombian
 * audience whose browsers are very often configured in English, so where
 * someone is beats how their browser is set. That is the same call
 * `apps/website/functions/index.ts` makes for the marketing site, and the two
 * read the same country list so a visitor who signs in from ganju.ai does not
 * change language on the way.
 *
 * Next 16 deprecates this filename in favour of `proxy.ts` and says so on every
 * build. Do not take the rename: `proxy.ts` is always Node-runtime
 * (`next/dist/build/entries.js:231` calls `onServer()` with no way to opt out),
 * and `@opennextjs/cloudflare` rejects Node middleware — "Node.js middleware is
 * not currently supported. Consider switching to Edge Middleware." `middleware`
 * is the edge convention, which is what this deploys on. Revisit when OpenNext
 * supports the Node runtime here.
 *
 * Precedence, identical to the website's:
 *
 *   1. `?lang=` — an explicit click on the switcher. It writes the cookie.
 *   2. An `/es` prefix already in the URL.
 *   3. The `ganju_lang` cookie — a choice made earlier.
 *   4. The country Cloudflare resolved the request to.
 *   5. English.
 *
 * The website exempts crawlers from step 3 so `/` stays indexed. Nothing here
 * needs that: `_app.tsx` sends `noindex, nofollow` on every page.
 */

type Lang = 'en' | 'es';

const SPANISH_COUNTRIES = new Set(utils.constants.SPANISH_COUNTRIES);

const asLang = (value: string | null | undefined): Lang | undefined =>
  value === utils.constants.LANGUAGE_EN || value === utils.constants.LANGUAGE_ES
    ? (value as Lang)
    : undefined;

/** 307 rather than 308: the choice can change on the next request. */
const redirect = (url: URL, remember?: Lang): NextResponse => {
  const response = NextResponse.redirect(url);
  // Which language a visitor gets depends on their cookie and their country,
  // so nothing in front of the Worker may hold on to this.
  response.headers.set('Cache-Control', 'no-store');
  if (remember) {
    response.cookies.set(utils.constants.LANGUAGE_COOKIE, remember, {
      path: '/',
      // Scoped to the registrable domain, not this host, so the choice is the
      // same one the marketing site on the apex reads and writes.
      domain: utils.languageCookieDomain(url.hostname),
      maxAge: utils.constants.LANGUAGE_COOKIE_MAX_AGE,
      sameSite: 'lax',
      secure: true
    });
  }
  return response;
};

export const middleware = (request: NextRequest) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return NextResponse.next();
  }

  const { nextUrl } = request;

  // An explicit choice: remember it, then land the visitor on the same page in
  // that language without the query string trailing behind them.
  const chosen = asLang(
    nextUrl.searchParams.get(utils.constants.LANGUAGE_QUERY_PARAM)
  );
  if (chosen) {
    const url = nextUrl.clone();
    url.searchParams.delete(utils.constants.LANGUAGE_QUERY_PARAM);
    url.locale = chosen;
    return redirect(url, chosen);
  }

  // `nextUrl.locale` is what Next resolved from the path — `es` for `/es/…`,
  // `en` for everything else, since English is served unprefixed. A URL that
  // spells the prefix out is a choice of its own, and the only thing that may
  // override it is `?lang=`, handled above: an invite emailed as
  // `/es/invitation/…` has to stay Spanish even for a reader in New York. This
  // is why the rule is asymmetric — an unprefixed path is indistinguishable
  // from no choice at all, so only that one gets steered.
  if (nextUrl.locale !== utils.constants.LANGUAGE_EN) {
    return NextResponse.next();
  }

  const remembered = asLang(
    request.cookies.get(utils.constants.LANGUAGE_COOKIE)?.value
  );

  const country = request.headers.get('CF-IPCountry') ?? '';
  const byCountry: Lang | undefined = SPANISH_COUNTRIES.has(country)
    ? (utils.constants.LANGUAGE_ES as Lang)
    : undefined;

  const preferred =
    remembered ?? byCountry ?? (utils.constants.LANGUAGE_EN as Lang);

  if (preferred !== nextUrl.locale) {
    const url = nextUrl.clone();
    url.locale = preferred;
    return redirect(url);
  }

  return NextResponse.next();
};

export const config = {
  // Everything except Next's own assets, the auth routes proxied through the
  // app, and anything with a file extension. A language prefix on those is
  // either meaningless or actively breaks them.
  //
  // `'/'` is listed separately, and it is not redundant: with i18n on, Next
  // rewrites each matcher to consume the locale segment first, which leaves
  // `/es` with nothing for the `/(…)` in the pattern below to match. Without
  // this entry the Spanish home page is the one URL the middleware never sees,
  // and `?lang=` silently does nothing there.
  matcher: ['/', '/((?!_next|api|.*\\.).*)']
};
