import type { Context, MiddlewareHandler, Next } from 'hono';
import { utils } from '@ganju/utils';

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
  /** Sent with the message, for a client that words it itself. */
  code?: string;
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
 * The bucket for /auth/*: the client's address, except for the MCP server
 * checking a token over the service binding. That request has no client
 * address, so it would share one bucket with every other MCP user's; the MCP
 * server limits its own callers.
 */
export const authClientKey = (c: Context<AppEnv>): string | null => {
  const provided = c.req.header(utils.constants.MCP_INTERNAL_HEADER);
  const expected = utils.getEnv(c, 'MCP_INTERNAL_SECRET');
  if (
    c.req.path === '/auth/oauth2/userinfo' &&
    provided &&
    expected &&
    utils.timingSafeEqual(provided, expected)
  ) {
    return null;
  }
  return clientIp(c);
};

/**
 * Counts one request against a Rate Limiting binding; false when the bucket
 * is spent. Fails OPEN in two cases, both deliberate: when the binding isn't
 * present (older deployments, `wrangler dev`) and when the limiter itself
 * throws. A rate limiter that takes the API down with it is worse than the
 * abuse it prevents — but the error is logged so a silently-disabled limiter
 * is visible.
 */
export const consumeRateLimit = async (
  c: Context<AppEnv>,
  binding: LimiterName,
  bucket: string
): Promise<boolean> => {
  const limiter = c.env[binding] as RateLimiter | undefined;
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit({ key: `${binding}:${bucket}` });
    return success;
  } catch (error) {
    console.error(`rate limiter ${binding} failed`, error);
    return true;
  }
};

/**
 * The 429 a spent bucket answers with. The bindings use a 60s window; it
 * tells well-behaved clients to wait it out instead of hammering.
 */
export const rateLimited = (
  c: Context<AppEnv>,
  message = 'Too many requests. Please wait a moment and retry.',
  code?: string
) =>
  c.json({ error: message, ...(code ? { code } : {}) }, 429, {
    'Retry-After': '60'
  });

/** Throttle a route against one of the Rate Limiting bindings. */
export const rateLimit = (
  options: RateLimitOptions
): MiddlewareHandler<AppEnv> => {
  const { binding, key, message, code } = options;

  return async (c: Context<AppEnv>, next: Next) => {
    const bucket = key(c);
    if (!bucket) return next();
    if (!(await consumeRateLimit(c, binding, bucket))) {
      return rateLimited(c, message, code);
    }
    return next();
  };
};

export const RateLimitMiddleware = {
  rateLimit,
  consumeRateLimit,
  rateLimited,
  clientIp
};
