import type { Context, Next } from 'hono';
import { and, eq, isNull, or, gt } from 'drizzle-orm';
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
 * Resolve an OAuth access token to the user it may act as here.
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
 *
 * Whose token it is settles nothing on its own, which is the second check.
 * The same authorization server mints tokens for MCP clients: connect Claude
 * Desktop to one of your MCP servers and it holds a live token for your account,
 * and userinfo will confirm as much. Accepting that here would make connecting
 * an MCP client an act of full delegation — deploy code, read secrets, change
 * billing — which nobody agreed to. So a token also has to carry the scope the
 * CLI asks for and discovery never offers.
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
    scope?: string;
  } | null;
  if (!claims?.sub) return null;

  const scopes =
    typeof claims.scope === 'string' ? claims.scope.split(' ') : [];
  if (!scopes.includes(utils.constants.CONTROL_PLANE_SCOPE)) return null;

  const [row] = await db
    .create(c)
    .select()
    .from(db.schema.user)
    .where(eq(db.schema.user.id, claims.sub))
    .limit(1);

  return (row as Variables['user']) ?? null;
};

/**
 * Resolve a personal access token to the user and project it acts for.
 *
 * An OAuth access token lives an hour, and the CLI deliberately never refreshes
 * the one it is handed through the environment, because there is nowhere to
 * write the new value back to. That is fine for a job someone starts by hand and
 * useless for a scheduled one: the second run is always after the first hour. So
 * a machine needs a credential whose lifetime is a decision rather than a
 * side effect, and this is it.
 *
 * The prefix is checked before the database is, so an OAuth token never costs a
 * lookup here and one of these never costs an introspection round trip. What is
 * stored is the SHA-256 of the value, so the lookup is by hash — there is no
 * query that could return the token, and no code path that could print it.
 *
 * Expiry is part of the same statement rather than a check afterwards, because
 * "no row" and "an expired row" have to be the same answer: a caller who learns
 * which of the two happened learns that their token was real.
 */
const userFromPersonalToken = async (
  c: Context<AppEnv>,
  dbInstance: ReturnType<typeof db.create>,
  token: string
): Promise<{
  user: Variables['user'];
  token: Variables['apiToken'];
} | null> => {
  const tokenHash = await utils.hashAccessToken(token);

  const [row] = await dbInstance
    .select({
      id: db.schema.accessToken.id,
      projectId: db.schema.accessToken.projectId,
      organizationId: db.schema.accessToken.organizationId,
      lastUsedAt: db.schema.accessToken.lastUsedAt,
      user: db.schema.user
    })
    .from(db.schema.accessToken)
    // Left, not inner: a token outlives the account that minted it, so the row
    // is still here to be found and the absence has to be answered for rather
    // than hidden by the join dropping it.
    .leftJoin(
      db.schema.user,
      eq(db.schema.user.id, db.schema.accessToken.userId)
    )
    .where(
      and(
        eq(db.schema.accessToken.tokenHash, tokenHash),
        or(
          isNull(db.schema.accessToken.expiresAt),
          gt(db.schema.accessToken.expiresAt, new Date())
        )
      )
    )
    .limit(1);

  if (!row) return null;

  // The token survived its owner. It cannot authenticate: every check below this
  // middleware is phrased against a user, so a credential with nobody behind it
  // has nobody to act as, and picking a stand-in would silently hand it whatever
  // that person can reach. Refused here; the row stays visible in the project's
  // list, marked as having lost its owner, so somebody can revoke it or mint a
  // replacement instead of debugging a pipeline that stopped for no stated
  // reason.
  if (!row.user) return null;

  // Off the response path, and rate-limited to one write per token per few
  // minutes. This exists so somebody can tell whether revoking a credential will
  // break something, which is a question minute-level precision does not answer
  // any better — and a write on every CI request would be a real cost for it.
  const stale =
    !row.lastUsedAt ||
    Date.now() - row.lastUsedAt.getTime() >
      utils.constants.ACCESS_TOKEN_LAST_USED_INTERVAL_MS;
  if (stale) {
    const write = dbInstance
      .update(db.schema.accessToken)
      .set({ lastUsedAt: new Date() })
      .where(eq(db.schema.accessToken.id, row.id))
      .then(
        () => undefined,
        error => {
          console.error('failed to record access token use', error);
        }
      );
    try {
      c.executionCtx.waitUntil(write);
    } catch {
      // No execution context (a direct invocation in a test) — the write is
      // already in flight either way, and a bookkeeping column is not worth
      // failing a request over.
    }
  }

  return {
    user: row.user as Variables['user'],
    token: {
      id: row.id,
      projectId: row.projectId,
      organizationId: row.organizationId
    }
  };
};

export const verify = async (c: Context<AppEnv>, next: Next) => {
  const auth = createAuth(c);
  // One connection for the whole middleware. `postgres()` connects lazily, so a
  // request rejected before any query runs pays nothing for holding it.
  const dbInstance = db.create(c);

  const session = await auth.api.getSession({
    headers: c.req.raw.headers
  });

  // The cookie first, because it is what every dashboard request carries and
  // costs nothing extra. A bearer token is only looked up when there is no
  // session to read.
  const token = session ? null : bearerToken(c);

  // Two kinds of bearer token reach here, and the prefix tells them apart before
  // either lookup happens: a personal access token is a row in this database, an
  // OAuth access token is one the authorization server owns.
  const personal =
    token && utils.isAccessToken(token)
      ? await userFromPersonalToken(c, dbInstance, token)
      : null;

  const user =
    session?.user ??
    personal?.user ??
    (token && !utils.isAccessToken(token)
      ? await userFromAccessToken(c, auth, token)
      : null);

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

  // Organization and project memberships are independent: a project route is
  // authorized by project membership alone (an invitee may belong to a project
  // without belonging to its organization), while an org-scoped route is
  // authorized by organization membership.
  const projectId = c.req.param('projectId');
  const organizationId = c.req.param('organizationId');

  // A personal access token carries a boundary the membership checks below do
  // not have. Those answer "is this user an admin here", and the answer is yes
  // for every project and organization its holder belongs to — which is exactly
  // what a credential pasted into one repository's CI settings must not inherit.
  // One repository deploys one artifact, so a token names one project, and a
  // request reaching past it is refused however well its holder would have been
  // authorized.
  //
  // A route naming no project is refused rather than reasoned about, and that
  // includes every organization route: billing, members, the model configs and
  // the sibling projects are not what a deploy credential is for. The single
  // exception is reporting who the token is. Refusing by default is what keeps a
  // route added later closed by omission rather than open by it.
  if (personal) {
    if (projectId) {
      if (projectId !== personal.token.projectId) {
        return c.json(
          { error: utils.constants.ACCESS_TOKEN_SCOPE_MESSAGE },
          403
        );
      }
    } else if (
      c.req.method !== 'GET' ||
      !utils.constants.ACCESS_TOKEN_UNSCOPED_PATHS.includes(c.req.path)
    ) {
      return c.json({ error: utils.constants.ACCESS_TOKEN_SCOPE_MESSAGE }, 403);
    }

    c.set('apiToken', personal.token);
  }

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
