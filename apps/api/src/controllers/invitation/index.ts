import { Context } from 'hono';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';

import { sendInvitationEmail, Plan } from '../../utils';

// types
import { AppEnv } from '../../types';

// A pending invitation is valid for INVITATION_EXPIRY_DAYS from creation.
const computeExpiresAt = (): Date => {
  const expiresAt = new Date();
  expiresAt.setDate(
    expiresAt.getDate() + utils.constants.INVITATION_EXPIRY_DAYS
  );
  return expiresAt;
};

const invitedByColumns = {
  columns: { id: true, name: true, email: true }
} as const;

const createForOrganization = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues =
    await utils.Schema.ORGANIZATION_INVITATION_CREATE.parseAsync({
      ...body,
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId')
    });

  const dbInstance = db.create(c);

  const organization = await dbInstance.query.organization.findFirst({
    where: eq(db.schema.organization.id, currentValues.organizationId),
    columns: { id: true, name: true }
  });

  if (!organization) {
    throw new Error('Organization not found');
  }

  // Inviting teammates is a paid feature (throws PlanLimitError → 402 on Free).
  Plan.assertInviteAllowed(
    await Plan.getEffectivePlan(dbInstance, currentValues.organizationId)
  );

  const created = await dbInstance.transaction(async tx => {
    // Already a member? Match the invited email to an existing account that is in this organization.
    const [member] = await tx
      .select({ id: db.schema.user.id })
      .from(db.schema.user)
      .innerJoin(
        db.schema.organizationUser,
        eq(db.schema.organizationUser.userId, db.schema.user.id)
      )
      .where(
        and(
          eq(db.schema.user.email, currentValues.email),
          eq(
            db.schema.organizationUser.organizationId,
            currentValues.organizationId
          )
        )
      )
      .limit(1);

    if (member) {
      throw new Error('This user is already a member of the organization');
    }

    const [pending] = await tx
      .select({ id: db.schema.invitation.id })
      .from(db.schema.invitation)
      .where(
        and(
          eq(db.schema.invitation.email, currentValues.email),
          eq(db.schema.invitation.organizationId, currentValues.organizationId),
          isNull(db.schema.invitation.projectId),
          eq(db.schema.invitation.status, utils.constants.STATUS_PENDING)
        )
      )
      .limit(1);

    if (pending) {
      throw new Error('An invitation for this email is already pending');
    }

    const [invitation] = await tx
      .insert(db.schema.invitation)
      .values({
        email: currentValues.email,
        organizationId: currentValues.organizationId,
        invitedById: currentValues.userId,
        token: utils.generateRandomToken(),
        expiresAt: computeExpiresAt()
      })
      .returning();

    return invitation;
  });

  c.executionCtx.waitUntil(
    sendInvitationEmail(c, {
      to: created.email,
      scope: utils.constants.INVITATION_SCOPE_ORGANIZATION,
      targetName: organization.name,
      inviterName: c.get('user').name,
      token: created.token
    })
  );

  return c.json(created);
};

const listForOrganization = async (c: Context<AppEnv>) => {
  const currentValues =
    await utils.Schema.ORGANIZATION_INVITATION_LIST.parseAsync({
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId')
    });

  const dbInstance = db.create(c);

  const invitations = await dbInstance.query.invitation.findMany({
    where: and(
      eq(db.schema.invitation.organizationId, currentValues.organizationId),
      isNull(db.schema.invitation.projectId)
    ),
    with: {
      invitedBy: invitedByColumns,
      acceptedBy: invitedByColumns
    },
    orderBy: desc(db.schema.invitation.createdAt)
  });

  return c.json(invitations);
};

const removeForOrganization = async (c: Context<AppEnv>) => {
  const currentValues =
    await utils.Schema.ORGANIZATION_INVITATION_REMOVE.parseAsync({
      invitationId: c.req.param('invitationId'),
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId')
    });

  const dbInstance = db.create(c);

  // Only a still-pending invitation can be revoked.
  const [revoked] = await dbInstance
    .update(db.schema.invitation)
    .set({ status: utils.constants.STATUS_DISABLED })
    .where(
      and(
        eq(db.schema.invitation.id, currentValues.invitationId),
        eq(db.schema.invitation.organizationId, currentValues.organizationId),
        isNull(db.schema.invitation.projectId),
        eq(db.schema.invitation.status, utils.constants.STATUS_PENDING)
      )
    )
    .returning({ id: db.schema.invitation.id });

  if (!revoked) {
    throw new Error('Pending invitation not found');
  }

  return c.json(revoked);
};

const createForProject = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues = await utils.Schema.PROJECT_INVITATION_CREATE.parseAsync(
    {
      ...body,
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId'),
      projectId: c.req.param('projectId')
    }
  );

  const dbInstance = db.create(c);

  // Confirm the project belongs to the organization in the URL — the stored
  // organizationId must be the project's real owner, not a forged path value.
  const project = await dbInstance.query.project.findFirst({
    where: and(
      eq(db.schema.project.id, currentValues.projectId),
      eq(db.schema.project.organizationId, currentValues.organizationId)
    ),
    columns: { id: true, name: true, organizationId: true }
  });

  if (!project) {
    throw new Error('Project not found');
  }

  // Inviting teammates is a paid feature (throws PlanLimitError → 402 on Free).
  Plan.assertInviteAllowed(
    await Plan.getEffectivePlan(dbInstance, project.organizationId)
  );

  const created = await dbInstance.transaction(async tx => {
    const [member] = await tx
      .select({ id: db.schema.user.id })
      .from(db.schema.user)
      .innerJoin(
        db.schema.projectUser,
        eq(db.schema.projectUser.userId, db.schema.user.id)
      )
      .where(
        and(
          eq(db.schema.user.email, currentValues.email),
          eq(db.schema.projectUser.projectId, currentValues.projectId)
        )
      )
      .limit(1);

    if (member) {
      throw new Error('This user is already a member of the project');
    }

    const [pending] = await tx
      .select({ id: db.schema.invitation.id })
      .from(db.schema.invitation)
      .where(
        and(
          eq(db.schema.invitation.email, currentValues.email),
          eq(db.schema.invitation.projectId, currentValues.projectId),
          eq(db.schema.invitation.status, utils.constants.STATUS_PENDING)
        )
      )
      .limit(1);

    if (pending) {
      throw new Error('An invitation for this email is already pending');
    }

    const [invitation] = await tx
      .insert(db.schema.invitation)
      .values({
        email: currentValues.email,
        organizationId: project.organizationId,
        projectId: project.id,
        invitedById: currentValues.userId,
        token: utils.generateRandomToken(),
        expiresAt: computeExpiresAt()
      })
      .returning();

    return invitation;
  });

  c.executionCtx.waitUntil(
    sendInvitationEmail(c, {
      to: created.email,
      scope: utils.constants.INVITATION_SCOPE_PROJECT,
      targetName: project.name,
      inviterName: c.get('user').name,
      token: created.token
    })
  );

  return c.json(created);
};

const listForProject = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.PROJECT_INVITATION_LIST.parseAsync({
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId'),
    projectId: c.req.param('projectId')
  });

  const dbInstance = db.create(c);

  const invitations = await dbInstance.query.invitation.findMany({
    where: eq(db.schema.invitation.projectId, currentValues.projectId),
    with: {
      invitedBy: invitedByColumns,
      acceptedBy: invitedByColumns
    },
    orderBy: desc(db.schema.invitation.createdAt)
  });

  return c.json(invitations);
};

const removeForProject = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.PROJECT_INVITATION_REMOVE.parseAsync(
    {
      invitationId: c.req.param('invitationId'),
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId'),
      projectId: c.req.param('projectId')
    }
  );

  const dbInstance = db.create(c);

  const [revoked] = await dbInstance
    .update(db.schema.invitation)
    .set({ status: utils.constants.STATUS_DISABLED })
    .where(
      and(
        eq(db.schema.invitation.id, currentValues.invitationId),
        eq(db.schema.invitation.projectId, currentValues.projectId),
        eq(db.schema.invitation.status, utils.constants.STATUS_PENDING)
      )
    )
    .returning({ id: db.schema.invitation.id });

  if (!revoked) {
    throw new Error('Pending invitation not found');
  }

  return c.json(revoked);
};

// Pending invitations addressed to the signed-in user, matched by email so it
// works whether or not they had an account when the invitation was created.
const listMine = async (c: Context<AppEnv>) => {
  const dbInstance = db.create(c);

  const invitations = await dbInstance.query.invitation.findMany({
    where: and(
      eq(db.schema.invitation.email, c.get('user').email.toLowerCase()),
      eq(db.schema.invitation.status, utils.constants.STATUS_PENDING),
      gt(db.schema.invitation.expiresAt, new Date())
    ),
    with: {
      organization: { columns: { id: true, name: true } },
      project: { columns: { id: true, name: true } },
      invitedBy: invitedByColumns
    },
    orderBy: desc(db.schema.invitation.createdAt)
  });

  return c.json(invitations);
};

// Accept or decline one of the caller's own pending invitations. Accepting
// grants the membership the invitation was scoped to (project vs organization).
const respond = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues = await utils.Schema.INVITATION_RESPOND.parseAsync({
    ...body,
    invitationId: c.req.param('invitationId'),
    userId: c.get('user').id
  });

  const dbInstance = db.create(c);
  const sessionEmail = c.get('user').email.toLowerCase();

  const [invitation] = await dbInstance
    .select()
    .from(db.schema.invitation)
    .where(eq(db.schema.invitation.id, currentValues.invitationId))
    .limit(1);

  if (!invitation) {
    throw new Error('Invitation not found');
  }

  if (invitation.email !== sessionEmail) {
    throw new Error('Forbidden: this invitation was not sent to your account');
  }

  if (invitation.status !== utils.constants.STATUS_PENDING) {
    throw new Error('This invitation has already been responded to');
  }

  if (invitation.expiresAt.getTime() <= Date.now()) {
    throw new Error('This invitation has already expired');
  }

  if (currentValues.action === utils.constants.INVITATION_RESPONSE_DECLINE) {
    const [declined] = await dbInstance
      .update(db.schema.invitation)
      .set({ status: utils.constants.STATUS_DISABLED })
      .where(
        and(
          eq(db.schema.invitation.id, invitation.id),
          eq(db.schema.invitation.status, utils.constants.STATUS_PENDING)
        )
      )
      .returning({ id: db.schema.invitation.id });

    if (!declined) {
      throw new Error('This invitation has already been responded to');
    }

    return c.json({
      id: invitation.id,
      status: utils.constants.STATUS_DISABLED
    });
  }

  const result = await dbInstance.transaction(async tx => {
    // Guard on PENDING so a concurrent response can't double-grant membership.
    const [accepted] = await tx
      .update(db.schema.invitation)
      .set({
        status: utils.constants.STATUS_COMPLETED,
        acceptedById: currentValues.userId
      })
      .where(
        and(
          eq(db.schema.invitation.id, invitation.id),
          eq(db.schema.invitation.status, utils.constants.STATUS_PENDING)
        )
      )
      .returning();

    if (!accepted) {
      throw new Error('This invitation has already been responded to');
    }

    if (accepted.projectId) {
      const joined = await tx
        .insert(db.schema.projectUser)
        .values({
          projectId: accepted.projectId,
          userId: currentValues.userId,
          role: accepted.role
        })
        .onConflictDoNothing()
        .returning({ projectId: db.schema.projectUser.projectId });

      if (joined.length > 0) {
        await tx
          .update(db.schema.project)
          .set({
            projectUserCount: sql`(${db.schema.project.projectUserCount}::int + 1)::int`
          })
          .where(eq(db.schema.project.id, accepted.projectId));
      }
    } else {
      const joined = await tx
        .insert(db.schema.organizationUser)
        .values({
          organizationId: accepted.organizationId,
          userId: currentValues.userId,
          role: accepted.role
        })
        .onConflictDoNothing()
        .returning({ userId: db.schema.organizationUser.userId });

      if (joined.length > 0) {
        await tx
          .update(db.schema.organization)
          .set({
            organizationUserCount: sql`(${db.schema.organization.organizationUserCount}::int + 1)::int`
          })
          .where(eq(db.schema.organization.id, accepted.organizationId));
      }
    }

    return accepted;
  });

  return c.json({ id: result.id, status: result.status });
};

const getByToken = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.INVITATION_GET_BY_TOKEN.parseAsync({
    token: c.req.param('token')
  });

  const dbInstance = db.create(c);

  const invitation = await dbInstance.query.invitation.findFirst({
    where: eq(db.schema.invitation.token, currentValues.token),
    with: {
      organization: { columns: { id: true, name: true } },
      project: { columns: { id: true, name: true } },
      invitedBy: { columns: { id: true, name: true } }
    }
  });

  if (!invitation) {
    throw new Error('Invitation not found');
  }

  return c.json({
    id: invitation.id,
    email: invitation.email,
    status: invitation.status,
    scope: invitation.projectId
      ? utils.constants.INVITATION_SCOPE_PROJECT
      : utils.constants.INVITATION_SCOPE_ORGANIZATION,
    expired: invitation.expiresAt.getTime() <= Date.now(),
    expiresAt: invitation.expiresAt,
    organizationName: invitation.organization?.name ?? null,
    projectName: invitation.project?.name ?? null,
    inviterName: invitation.invitedBy?.name ?? null
  });
};

export const InvitationController = {
  createForOrganization,
  listForOrganization,
  removeForOrganization,
  createForProject,
  listForProject,
  removeForProject,
  listMine,
  respond,
  getByToken
};
