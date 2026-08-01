import type { Context, Next } from 'hono';
import { and, eq } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';

import { createAuth } from '../utils';

// types
import type { AppEnv } from '../types';

export const verify = async (c: Context<AppEnv>, next: Next) => {
  const auth = createAuth(c);

  const session = await auth.api.getSession({
    headers: c.req.raw.headers
  });

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // One per-user ceiling for every authenticated route, applied here so no new
  // endpoint can be added without it. Fails open — see middleware/rateLimit.
  const limiter = c.env.API_RATE_LIMITER;
  if (limiter) {
    try {
      const { success } = await limiter.limit({
        key: `API_RATE_LIMITER:${session.user.id}`
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
          eq(db.schema.projectUser.userId, session.user.id),
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
          eq(db.schema.organizationUser.userId, session.user.id),
          eq(db.schema.organizationUser.role, utils.constants.USER_ROLE_ADMIN)
        )
      )
      .limit(1);

    if (!adminOnOrganization) {
      return c.json({ error: 'Forbidden' }, 403);
    }
  }

  c.set('user', session.user);
  c.set('session', session.session);

  return next();
};

export const UserMiddleware = {
  verify
};
