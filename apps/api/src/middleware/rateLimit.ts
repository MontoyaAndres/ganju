import type { Context, MiddlewareHandler, Next } from 'hono';

// types
import type { AppEnv, Bindings, RateLimiter } from '../types';

// `-?` strips the optional modifier: without it the mapped type re-adds
// `undefined` to every optional binding and the union can't index `c.env`.
type LimiterName = {
  [K in keyof Bindings]-?: Bindings[K] extends RateLimiter | undefined
    ? K
    : never;
}[keyof Bindings];

interface RateLimitOptions {
  /** Which binding to count against — each has its own namespace and budget. */
  binding: LimiterName;
  /**
   * The bucket this request counts towards. Return null to skip the check
   * entirely (e.g. an unauthenticated request on a per-user limiter).
   */
  key: (c: Context<AppEnv>) => string | null;
  /** Shown to the caller on a 429. */
  message?: string;
}

/**
 * Best-effort client address. Cloudflare sets `CF-Connecting-IP` on every edge
 * request and it can't be spoofed by the client; the others are fallbacks for
 * local development.
 */
export const clientIp = (c: Context<AppEnv>): string =>
  c.req.header('cf-connecting-ip') ??
  c.req.header('x-real-ip') ??
  c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
  'unknown';

/**
 * Throttle a route against one of the Rate Limiting bindings.
 *
 * Fails OPEN in two cases, both deliberate: when the binding isn't present
 * (older deployments, `wrangler dev`) and when the limiter itself throws. A
 * rate limiter that takes the API down with it is worse than the abuse it
 * prevents — but the error is logged so a silently-disabled limiter is visible.
 */
export const rateLimit = (
  options: RateLimitOptions
): MiddlewareHandler<AppEnv> => {
  const { binding, key, message } = options;

  return async (c: Context<AppEnv>, next: Next) => {
    const limiter = c.env[binding] as RateLimiter | undefined;
    if (!limiter) return next();

    const bucket = key(c);
    if (!bucket) return next();

    try {
      const { success } = await limiter.limit({ key: `${binding}:${bucket}` });
      if (!success) {
        return c.json(
          {
            error:
              message ?? 'Too many requests. Please wait a moment and retry.'
          },
          429,
          // The bindings use a 60s window; tell well-behaved clients to wait it
          // out instead of hammering.
          { 'Retry-After': '60' }
        );
      }
    } catch (error) {
      console.error(`rate limiter ${binding} failed`, error);
    }

    return next();
  };
};

export const RateLimitMiddleware = {
  rateLimit,
  clientIp
};
