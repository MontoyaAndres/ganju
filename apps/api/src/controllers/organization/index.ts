import { Context } from 'hono';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';
import { v7 as uuid } from 'uuid';

import { Plan, createStripe } from '../../utils';

// types
import { AppEnv } from '../../types';

const create = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues = await utils.Schema.ORGANIZATION_CREATE.parseAsync({
    ...body,
    userId: c.get('user').id
  });

  const dbInstance = db.create(c);

  const result = await dbInstance.transaction(async tx => {
    // Free plan = one organization per user; additional orgs require an
    // existing paid org (throws PlanLimitError → 402 otherwise).
    await Plan.assertOrganizationCreation(tx, currentValues.userId);

    const [org] = await tx
      .insert(db.schema.organization)
      .values({
        name: currentValues.name,
        ownerId: currentValues.userId,
        organizationUserCount: 1,
        projectCount: 1
      })
      .returning();

    // Every org starts on the Free plan; the row backs all later quota checks
    // and the Stripe upgrade flow.
    await Plan.ensureSubscription(tx, org.id);

    await tx
      .insert(db.schema.organizationUser)
      .values({ userId: currentValues.userId, organizationId: org.id });

    const [project] = await tx
      .insert(db.schema.project)
      .values({
        name: currentValues.projectName,
        description: currentValues.projectDescription || null,
        createdById: currentValues.userId,
        projectUserCount: 1,
        organizationId: org.id
      })
      .returning();

    await tx
      .insert(db.schema.projectUser)
      .values({ userId: currentValues.userId, projectId: project.id });

    const artifactId = uuid();

    await tx.insert(db.schema.artifact).values({
      id: artifactId,
      slug: utils.generateRandomSlug(),
      artifactPromptCount: 0,
      artifactResourceCount: 0,
      projectId: project.id
    });

    const defaultTools = await tx
      .select({ id: db.schema.toolDefinition.id })
      .from(db.schema.toolDefinition)
      .where(
        inArray(
          db.schema.toolDefinition.key,
          utils.constants.RESOURCE_TOOL_KEYS
        )
      );

    if (defaultTools.length > 0) {
      await tx.insert(db.schema.artifactTool).values(
        defaultTools.map(t => ({
          toolDefinitionId: t.id,
          artifactId
        }))
      );
      await tx
        .update(db.schema.artifact)
        .set({
          artifactToolCount: sql`(${db.schema.artifact.artifactToolCount}::int + ${defaultTools.length})::int`
        })
        .where(eq(db.schema.artifact.id, artifactId));
    }

    return { organization: org, project };
  });

  return c.json(result);
};

const update = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues = await utils.Schema.ORGANIZATION_UPDATE.parseAsync({
    ...body,
    id: c.req.param('organizationId'),
    userId: c.get('user').id
  });

  const dbInstance = db.create(c);

  // Any admin member may rename the organization — membership is already
  // verified by UserMiddleware. Deleting it stays owner-only (see `remove`).
  const [org] = await dbInstance
    .update(db.schema.organization)
    .set({ name: currentValues.name })
    .where(eq(db.schema.organization.id, currentValues.id))
    .returning();

  return c.json(org);
};

const get = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.ORGANIZATION_GET.parseAsync({
    id: c.req.param('organizationId'),
    userId: c.get('user').id
  });

  const dbInstance = db.create(c);

  // Membership was already verified by UserMiddleware — return the org to any
  // member, not only the owner.
  const organization = await dbInstance.query.organization.findFirst({
    where: eq(db.schema.organization.id, currentValues.id),
    with: {
      projects: {
        columns: {
          id: true,
          name: true
        }
      }
    }
  });

  return c.json(organization);
};

const list = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.AUTH_USER_GET.parseAsync({
    userId: c.get('user').id
  });

  const dbInstance = db.create(c);

  // Organizations the caller is a full member of.
  const orgMemberships = await dbInstance
    .select({ organizationId: db.schema.organizationUser.organizationId })
    .from(db.schema.organizationUser)
    .where(eq(db.schema.organizationUser.userId, currentValues.userId));
  const fullOrgIds = new Set(orgMemberships.map(m => m.organizationId));

  // Projects the caller belongs to. These can sit in organizations the caller
  // is NOT a member of — org and project memberships are independent.
  const projectMemberships = await dbInstance
    .select({ projectId: db.schema.projectUser.projectId })
    .from(db.schema.projectUser)
    .where(eq(db.schema.projectUser.userId, currentValues.userId));
  const memberProjectIds = new Set(projectMemberships.map(m => m.projectId));

  const memberProjects =
    memberProjectIds.size > 0
      ? await dbInstance
          .select({
            id: db.schema.project.id,
            organizationId: db.schema.project.organizationId
          })
          .from(db.schema.project)
          .where(inArray(db.schema.project.id, Array.from(memberProjectIds)))
      : [];
  const projectOnlyOrgIds = new Set(memberProjects.map(p => p.organizationId));

  const visibleOrgIds = Array.from(
    new Set([...fullOrgIds, ...projectOnlyOrgIds])
  );

  if (visibleOrgIds.length === 0) {
    return c.json([]);
  }

  const organizations = await dbInstance.query.organization.findMany({
    where: inArray(db.schema.organization.id, visibleOrgIds),
    orderBy: desc(db.schema.organization.id),
    with: {
      projects: {
        columns: {
          id: true,
          name: true
        }
      },
      organizationUsers: {
        with: {
          user: {
            columns: { id: true, name: true, email: true, image: true }
          }
        }
      }
    }
  });

  // Full members see every project and the member list. Project-only members
  // see basic org info plus just the projects they can actually reach.
  const result = organizations.map(organization => {
    const isMember = fullOrgIds.has(organization.id);
    const projects = organization.projects
      .filter(project => isMember || memberProjectIds.has(project.id))
      .map(project => ({
        id: project.id,
        name: project.name,
        isMember: memberProjectIds.has(project.id)
      }));

    return {
      id: organization.id,
      name: organization.name,
      ownerId: organization.ownerId,
      projectCount: organization.projectCount,
      organizationUserCount: organization.organizationUserCount,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
      isMember,
      projects,
      members: isMember
        ? organization.organizationUsers.map(organizationUser => ({
            userId: organizationUser.userId,
            role: organizationUser.role,
            user: organizationUser.user
          }))
        : []
    };
  });

  return c.json(result);
};

const remove = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.ORGANIZATION_GET.parseAsync({
    id: c.req.param('organizationId'),
    userId: c.get('user').id
  });

  const dbInstance = db.create(c);

  const [sub] = await dbInstance
    .select({
      stripeSubscriptionId: db.schema.subscription.stripeSubscriptionId
    })
    .from(db.schema.subscription)
    .where(eq(db.schema.subscription.organizationId, currentValues.id))
    .limit(1);

  if (sub?.stripeSubscriptionId) {
    const stripe = createStripe(c);
    if (stripe) {
      try {
        await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
      } catch (err) {
        console.error(
          `Failed to cancel Stripe subscription ${sub.stripeSubscriptionId} for org ${currentValues.id}:`,
          err
        );
      }
    }
  }

  await dbInstance
    .delete(db.schema.organization)
    .where(
      and(
        eq(db.schema.organization.id, currentValues.id),
        eq(db.schema.organization.ownerId, currentValues.userId)
      )
    );

  return c.json({ id: currentValues.id });
};

export const OrganizationController = {
  create,
  update,
  get,
  list,
  remove
};
