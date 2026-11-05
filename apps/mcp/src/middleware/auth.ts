import type { Context, MiddlewareHandler } from 'hono';
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'jose';
import { utils } from '@ganju/utils';

import { resolveArtifactSlug } from '../utils';

import type { AppEnv } from '../types';

const fetchJwks = async (c: Context<AppEnv>): Promise<JSONWebKeySet> => {
  const cached = await c.env.JWKS_CACHE.get(
    utils.constants.JWKS_KV_KEY,
    'json'
  );
  if (cached) return cached as JSONWebKeySet;

  const apiUrl = c.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error('Missing env: NEXT_PUBLIC_API_URL');

  const res = await c.env.API.fetch(`${apiUrl}/auth/jwks`);
  if (!res.ok) {
    throw new Error(`Failed to fetch JWKS (${res.status})`);
  }
  const jwks = (await res.json()) as JSONWebKeySet;
  c.executionCtx.waitUntil(
    c.env.JWKS_CACHE.put(utils.constants.JWKS_KV_KEY, JSON.stringify(jwks), {
      expirationTtl: utils.constants.JWKS_TTL_SECONDS
    })
  );
  return jwks;
};

// RFC 9728 challenge — points clients at this MCP server's protected-resource
// metadata so they can discover the authorization server and start OAuth.
const buildChallenge = (c: Context<AppEnv>): string => {
  const { origin } = new URL(c.req.url);
  const slug = c.req.param('slug');
  const path = slug
    ? `/.well-known/oauth-protected-resource/${slug}`
    : '/.well-known/oauth-protected-resource';
  return `Bearer resource_metadata="${origin}${path}"`;
};

interface TokenResult {
  userId?: string;
  scopes: string[];
  aud: string[];
  // True for bot-on-behalf-of JWTs (identified by the `external_provider`
  // claim). These are minted per-artifact, so their audience is enforced.
  isBotToken: boolean;
}

// Signed JWTs (bot-on-behalf-of grant) — verified offline against the JWKS.
const verifyJwt = async (
  c: Context<AppEnv>,
  token: string
): Promise<TokenResult | null> => {
  let jwks: JSONWebKeySet;
  try {
    jwks = await fetchJwks(c);
  } catch {
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, createLocalJWKSet(jwks), {
      issuer: c.env.NEXT_PUBLIC_API_URL
    });
    const aud = Array.isArray(payload.aud)
      ? payload.aud
      : payload.aud
        ? [payload.aud]
        : [];
    return {
      userId: typeof payload.sub === 'string' ? payload.sub : undefined,
      scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [],
      aud,
      isBotToken: typeof payload.external_provider === 'string'
    };
  } catch {
    return null;
  }
};

// Opaque OIDC access tokens aren't JWTs — better-auth issues random strings
// validated by DB lookup. The userinfo endpoint introspects them: it 200s with
// the subject when the token is live, 401s otherwise.
const introspectToken = async (
  c: Context<AppEnv>,
  token: string
): Promise<TokenResult | null> => {
  const apiUrl = c.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    console.warn('MCP introspection: NEXT_PUBLIC_API_URL is not set');
    return null;
  }
  // The internal secret keeps this check out of the API's per-address auth
  // limit: over the service binding there is no address, so every MCP user
  // would share one bucket.
  const secret = c.env.MCP_INTERNAL_SECRET;
  const res = await c.env.API.fetch(`${apiUrl}/auth/oauth2/userinfo`, {
    headers: {
      authorization: `Bearer ${token}`,
      ...(secret ? { [utils.constants.MCP_INTERNAL_HEADER]: secret } : {})
    }
  }).catch((error: unknown) => {
    console.warn(`MCP introspection: userinfo fetch failed — ${error}`);
    return null;
  });
  if (!res) return null;
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.warn(
      `MCP introspection: userinfo rejected the token — ${res.status} ${detail}`
    );
    return null;
  }
  const claims = (await res.json().catch(() => null)) as {
    sub?: string;
    scope?: string;
  } | null;
  if (!claims?.sub) {
    console.warn('MCP introspection: userinfo response had no `sub`');
    return null;
  }
  return {
    userId: claims.sub,
    scopes: typeof claims.scope === 'string' ? claims.scope.split(' ') : [],
    aud: [],
    isBotToken: false
  };
};

const verify: MiddlewareHandler<AppEnv> = async (c, next) => {
  const internalSecret = c.req.header(utils.constants.MCP_INTERNAL_HEADER);
  const expectedSecret = c.env.MCP_INTERNAL_SECRET;

  if (internalSecret && expectedSecret) {
    const ok = utils.timingSafeEqual(internalSecret, expectedSecret);
    if (ok) {
      c.set('authContext', { kind: 'internal' });
      return next();
    }
  }

  const authHeader = c.req.header('authorization');
  if (!authHeader?.toLowerCase().startsWith('bearer ')) {
    return c.json({ error: 'Missing bearer token' }, 401, {
      'WWW-Authenticate': buildChallenge(c)
    });
  }
  const token = authHeader.slice(7).trim();

  // Two token types reach this server: signed JWTs from the bot-on-behalf-of
  // grant, and opaque OIDC access tokens. Try offline JWT verification first,
  // then fall back to remote introspection for opaque tokens.
  const result =
    (await verifyJwt(c, token)) ?? (await introspectToken(c, token));

  if (!result) {
    return c.json({ error: 'Invalid or expired token' }, 401, {
      'WWW-Authenticate': buildChallenge(c)
    });
  }

  const slug = c.req.param('slug') ?? resolveArtifactSlug(c.req.raw);

  // Bot-on-behalf-of tokens are minted for one specific artifact, with that
  // artifact's slug as the JWT audience. Enforce the binding so a token minted
  // for one MCP server can't be replayed against another — the bot grant
  // accepts an arbitrary audience from its caller.
  if (slug && result.isBotToken && !result.aud.includes(slug)) {
    return c.json({ error: 'Token not authorized for this artifact' }, 403);
  }

  // User tokens carry a subject; their per-artifact access is enforced
  // downstream by the project membership check in MCPController. Only
  // subjectless machine tokens are gated on audience/scope here.
  if (slug && !result.userId) {
    const audMatch = result.aud.includes(slug) || result.aud.includes('*');
    const scopeMatch = result.scopes.includes(
      `${utils.constants.ARTIFACT_SCOPE_PREFIX}${slug}`
    );
    if (!audMatch && !scopeMatch) {
      return c.json({ error: 'Token not authorized for this artifact' }, 403);
    }
  }

  c.set('authContext', {
    kind: 'jwt',
    userId: result.userId,
    artifactSlug: slug ?? undefined,
    scopes: result.scopes,
    isBotToken: result.isBotToken
  });

  return next();
};

export const AuthMiddleware = {
  verify
};
