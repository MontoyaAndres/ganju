/**
 * The security headers that `public/_headers` applies to every static
 * response.
 *
 * Cloudflare does not run `_headers` over responses that a Pages Function
 * produced, so `/` — the one route with a Function in front of it — would
 * silently lose them. This module is that route's copy.
 *
 * **Keep it in sync with `public/_headers`.** The rationale for each value
 * lives there; this file deliberately carries no opinions of its own.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://api.ganju.ai; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; manifest-src 'self'; upgrade-insecure-requests",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-site'
};

/**
 * Add the headers a response is missing, leaving any it already carries
 * untouched — so if Cloudflare ever does apply `_headers` here, this becomes a
 * no-op rather than a source of duplicates.
 */
export function withSecurityHeaders(response: Response): Response {
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!out.headers.has(name)) out.headers.set(name, value);
  }
  return out;
}
