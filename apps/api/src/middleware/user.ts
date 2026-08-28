import type { Context, Next } from 'hono';
import { and, eq } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';

import { createAuth } from '../utils';

// types
import type { AppEnv, Variables } from '../types';
import type { Auth } from '../utils';

const bearerToken = (c: Context<AppEnv>): string | null => {
  const header = c.req.header('authorization');
  if (!header?.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim() || null;
};

/**
 * Resolve an opaque OAuth access token to the user it was minted for.
 *
 * Browsers carry the session cookie; a terminal cannot. The CLI signs in through
 * the same authorization server every MCP client uses and holds an access token,
 * so the token has to open the control plane too — otherwise `ganju deploy`
 * would need a second way in, which is exactly the second write path the publish
 * API was built to avoid.
 *
 * Introspection goes through the auth handler in this process rather than over
 * the network: tokens are opaque rows, so what makes one valid is a lookup the
 * provider owns, and reading `oauth_access_token` here would be a second copy of
 * its expiry and revocation rules. The endpoint answers with the subject when
 * the token is live and 401s otherwise.
 */
const userFromAccessToken = async (
  c: Context<AppEnv>,
  auth: Auth,
  token: string
): Promise<Variables['user'] | null> => {
  const apiUrl = utils.getEnv(c, 'NEXT_PUBLIC_API_URL');
  if (!apiUrl) return null;

  const response = await auth
    .handler(
      new Request(`${apiUrl}/auth/oauth2/userinfo`, {
        headers: { authorization: `Bearer ${token}` }
      })
    )
    .catch(() => null);

  if (!response?.ok) return null;

  const claims = (await response.json().catch(() => null)) as {
    sub?: string;
  } | null;
  if (!claims?.sub) return null;

  const [row] = await db
    .create(c)
    .select()
    .from(db.schema.user)
    .where(eq(db.schema.user.id, claims.sub))
    .limit(1);

  return (row as Variables['user']) ?? null;
};

export const verify = async (c: Context<AppEnv>, next: Next) => {
  const auth = createAuth(c);

  const session = await auth.api.getSession({
    headers: c.req.raw.headers
  });

  // The cookie first, because it is what every dashboard request carries and
  // costs nothing extra. A bearer token is only introspected when there is no
  // session to read.
  const token = session ? null : bearerToken(c);
  const user =
    session?.user ?? (token ? await userFromAccessToken(c, auth, token) : null);

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // One per-user ceiling for every authenticated route, applied here so no new
  // endpoint can be added without it. Fails open — see middleware/rateLimit.
  const limiter = c.env.API_RATE_LIMITER;
  if (limiter) {
    try {
      const { success } = await limiter.limit({
        key: `API_RATE_LIMITER:${user.id}`
      });
      if (!success) {
        return c.json(
          { error: 'Too many requests. Please slow down and retry.' },
          429,
          { 'Retry-After': '60' }
        );
      }
    } catch (error) {
      console.error('rate limiter API_RATE_LIMITER failed', error);
    }
  }

  const dbInstance = db.create(c);

  // Organization and project memberships are independent: a project route is
  // authorized by project membership alone (an invitee may belong to a project
  // without belonging to its organization), while an org-scoped route is
  // authorized by organization membership.
  const projectId = c.req.param('projectId');
  const organizationId = c.req.param('organizationId');

  if (projectId) {
    const [adminOnProject] = await dbInstance
      .select()
      .from(db.schema.projectUser)
      .where(
        and(
          eq(db.schema.projectUser.projectId, projectId),
          eq(db.schema.projectUser.userId, user.id),
          eq(db.schema.projectUser.role, utils.constants.USER_ROLE_ADMIN)
        )
      )
      .limit(1);

    if (!adminOnProject) {
      return c.json({ error: 'Forbidden' }, 403);
    }
  } else if (organizationId) {
    const [adminOnOrganization] = await dbInstance
      .select()
      .from(db.schema.organizationUser)
      .where(
        and(
          eq(db.schema.organizationUser.organizationId, organizationId),
          eq(db.schema.organizationUser.userId, user.id),
          eq(db.schema.organizationUser.role, utils.constants.USER_ROLE_ADMIN)
        )
      )
      .limit(1);

    if (!adminOnOrganization) {
      return c.json({ error: 'Forbidden' }, 403);
    }
  }

  c.set('user', user);
  if (session) c.set('session', session.session);

  return next();
};

export const UserMiddleware = {
  verify
};
