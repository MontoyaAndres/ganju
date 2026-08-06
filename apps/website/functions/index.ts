/**
 * Language routing for `/`.
 *
 * The site is otherwise a pile of static files. This is the only route with a
 * Function in front of it: it decides whether a visitor should read the
 * English homepage (the static asset at `/`) or the Spanish one at `/es`.
 *
 * The order of precedence is deliberate:
 *
 *   1. `?lang=` — an explicit click on the footer language switcher. It also
 *      writes the cookie, so the choice survives.
 *   2. The `ganju_lang` cookie — a choice made on an earlier visit.
 *   3. The country Cloudflare resolved the request to.
 *   4. English.
 *
 * Location, not `Accept-Language`, drives step 3: the Spanish pages carry
 * Colombian legal content (Ley 1480, Ley 1581), so where someone is matters
 * more than which language their browser happens to be configured in.
 *
 * Crawlers are exempt from step 3 entirely — a bot indexing from Bogotá should
 * still see the English homepage at `/`, with `hreflang` pointing it at `/es`.
 * Redirecting it instead is how `/` drops out of the index.
 */
import { withSecurityHeaders } from './security-headers';

/** Minimal shape of the Pages Function context we use. */
interface Context {
  request: Request & { cf?: { country?: string } };
  next: () => Promise<Response>;
}

const COOKIE = 'ganju_lang';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Countries where Spanish is the (or an) official language. */
const SPANISH_COUNTRIES = new Set([
  'AR', 'BO', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'ES', 'GQ', 'GT',
  'HN', 'MX', 'NI', 'PA', 'PE', 'PR', 'PY', 'SV', 'UY', 'VE'
]);

const BOT = /bot|crawler|crawling|spider|slurp|facebookexternalhit|embedly|preview|lighthouse|headless/i;

type Lang = 'en' | 'es';

// Trailing slash on purpose: Pages 308s `/es` → `/es/`, and that is also the
// canonical URL the page advertises. Redirecting to the short form would cost
// every Spanish-speaking visitor a second round trip.
const HOME: Record<Lang, string> = { en: '/', es: '/es/' };

const asLang = (value: string | null | undefined): Lang | undefined =>
  value === 'en' || value === 'es' ? value : undefined;

function readCookie(request: Request, name: string): string | undefined {
  return request.headers
    .get('Cookie')
    ?.split(';')
    .map(part => part.trim().split('='))
    .find(([key]) => key === name)?.[1];
}

/** 302 — the choice can change on the next visit, so it must not be cached. */
function redirect(to: string, setCookie?: Lang): Response {
  const headers = new Headers({ Location: to, 'Cache-Control': 'no-store' });
  if (setCookie) {
    headers.set(
      'Set-Cookie',
      `${COOKIE}=${setCookie}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax; Secure`
    );
  }
  return withSecurityHeaders(new Response(null, { status: 302, headers }));
}

export const onRequest = async ({ request, next }: Context): Promise<Response> => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return withSecurityHeaders(await next());
  }

  // An explicit choice: remember it, then land the visitor on that homepage
  // without the query string trailing behind them.
  const chosen = asLang(new URL(request.url).searchParams.get('lang'));
  if (chosen) return redirect(HOME[chosen], chosen);

  const remembered = asLang(readCookie(request, COOKIE));
  if (remembered === 'es') return redirect(HOME.es);

  if (!remembered && !BOT.test(request.headers.get('User-Agent') ?? '')) {
    const country =
      request.headers.get('CF-IPCountry') ?? request.cf?.country ?? '';
    if (SPANISH_COUNTRIES.has(country)) return redirect(HOME.es);
  }

  // English: serve the static asset, and put back the headers that `_headers`
  // no longer applies now that a Function owns this route.
  const response = withSecurityHeaders(await next());
  // Which homepage a visitor gets depends on their cookie and their country,
  // so no shared cache may hold this response — but the browser can keep it
  // and revalidate against the asset's ETag.
  response.headers.set('Cache-Control', 'private, no-cache');
  return response;
};
