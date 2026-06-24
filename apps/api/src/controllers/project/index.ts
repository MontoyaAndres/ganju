import { Context } from 'hono';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';
import { v7 as uuid } from 'uuid';

import { Plan } from '../../utils';

// types
import { AppEnv } from '../../types';

const create = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues = await utils.Schema.PROJECT_CREATE.parseAsync({
    ...body,
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const dbInstance = db.create(c);

  const result = await dbInstance.transaction(async tx => {
    // Free plan = one project per org (throws PlanLimitError → 402 otherwise).
    await Plan.assertProjectQuota(tx, currentValues.organizationId);

    const [project] = await tx
      .insert(db.schema.project)
      .values({
        name: currentValues.name,
        description: currentValues.description || null,
        createdById: currentValues.userId,
        projectUserCount: 1,
        organizationId: currentValues.organizationId
      })
      .returning();

    await tx
      .insert(db.schema.projectUser)
      .values({ userId: currentValues.userId, projectId: project.id });

    await tx
      .update(db.schema.organization)
      .set({
        projectCount: sql`(${db.schema.organization.projectCount}::int + 1)::int`
      })
      .where(eq(db.schema.organization.id, currentValues.organizationId));

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

    return project;
  });

  return c.json(result);
};

const update = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues = await utils.Schema.PROJECT_UPDATE.parseAsync({
    ...body,
    id: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const dbInstance = db.create(c);

  const result = await dbInstance
    .update(db.schema.project)
    .set({
      name: currentValues.name,
      description: currentValues.description || null
    })
    .where(
      and(
        eq(db.schema.project.id, currentValues.id),
        eq(db.schema.project.organizationId, currentValues.organizationId)
      )
    )
    .returning();

  return c.json(result);
};

const get = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.PROJECT_GET.parseAsync({
    id: c.req.param('projectId'),
    organizationId: c.req.param('organizationId'),
    userId: c.get('user').id
  });

  const dbInstance = db.create(c);

  const result = await dbInstance
    .select()
    .from(db.schema.project)
    .where(
      and(
        eq(db.schema.project.id, currentValues.id),
        eq(db.schema.project.organizationId, currentValues.organizationId)
      )
    );

  return c.json(result);
};

const getOverview = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.PROJECT_GET.parseAsync({
    id: c.req.param('projectId'),
    organizationId: c.req.param('organizationId'),
    userId: c.get('user').id
  });

  const dbInstance = db.create(c);

  // Project + its artifact in one shot. Available counts, storage and usage are
  // all denormalized on the artifact row, so the home cards read straight from
  // here without aggregating anything.
  const [base] = await dbInstance
    .select({
      projectId: db.schema.project.id,
      projectName: db.schema.project.name,
      projectDescription: db.schema.project.description,
      artifactId: db.schema.artifact.id,
      slug: db.schema.artifact.slug,
      resourceCount: db.schema.artifact.artifactResourceCount,
      resourceTotalSize: db.schema.artifact.artifactResourceTotalSize,
      resourceUsageCount: db.schema.artifact.artifactResourceUsageCount,
      toolCount: db.schema.artifact.artifactToolCount,
      toolUsageCount: db.schema.artifact.artifactToolUsageCount,
      promptCount: db.schema.artifact.artifactPromptCount,
      promptUsageCount: db.schema.artifact.artifactPromptUsageCount,
      channelCount: db.schema.artifact.channelCount
    })
    .from(db.schema.project)
    .innerJoin(
      db.schema.artifact,
      eq(db.schema.artifact.projectId, db.schema.project.id)
    )
    .where(
      and(
        eq(db.schema.project.id, currentValues.id),
        eq(db.schema.project.organizationId, currentValues.organizationId)
      )
    )
    .limit(1);

  if (!base) {
    throw new Error('Project not found');
  }

  // Activity is a genuine time-series (interactions per day), so unlike the
  // cards it has nothing to denormalize — it must aggregate over the raw rows.
  // Window is selectable (7/30/90 days), bucketed per day in the DB's timezone.
  const requestedDays = Number(c.req.query('days'));
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 7;
  const since = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
  since.setHours(0, 0, 0, 0);

  const channelDay = sql<string>`to_char(date_trunc('day', ${db.schema.channelMessage.createdAt}), 'YYYY-MM-DD')`;
  const mcpDay = sql<string>`to_char(date_trunc('day', ${db.schema.mcpRequest.createdAt}), 'YYYY-MM-DD')`;

  const [channels, channelActivity, mcpActivity, recentActivity] =
    await Promise.all([
      dbInstance
        .select({
          id: db.schema.channel.id,
          platform: db.schema.channel.platform,
          status: db.schema.channel.status
        })
        .from(db.schema.channel)
        .where(eq(db.schema.channel.artifactId, base.artifactId)),

      // One line per channel platform: count the messages exchanged per day —
      // both the user's turns and the assistant's replies (tool/system rows are
      // internal plumbing and excluded).
      dbInstance
        .select({
          platform: db.schema.channel.platform,
          date: channelDay,
          total: sql<number>`count(*)::int`
        })
        .from(db.schema.channelMessage)
        .innerJoin(
          db.schema.channelConversation,
          eq(
            db.schema.channelConversation.id,
            db.schema.channelMessage.conversationId
          )
        )
        .innerJoin(
          db.schema.channel,
          eq(db.schema.channel.id, db.schema.channelConversation.channelId)
        )
        .where(
          and(
            eq(db.schema.channel.artifactId, base.artifactId),
            inArray(db.schema.channelMessage.role, [
              utils.constants.ROLE_MESSAGE_USER,
              utils.constants.ROLE_MESSAGE_ASSISTANT
            ]),
            gte(db.schema.channelMessage.createdAt, since)
          )
        )
        .groupBy(db.schema.channel.platform, channelDay),

      // One line per MCP client: count the meaningful calls (tool/prompt/resource)
      // per client per day, ignoring protocol noise like initialize/ping/list.
      dbInstance
        .select({
          client: db.schema.mcpSession.clientName,
          date: mcpDay,
          total: sql<number>`count(*)::int`
        })
        .from(db.schema.mcpRequest)
        .innerJoin(
          db.schema.mcpSession,
          eq(db.schema.mcpSession.id, db.schema.mcpRequest.sessionId)
        )
        .where(
          and(
            eq(db.schema.mcpSession.artifactId, base.artifactId),
            gte(db.schema.mcpRequest.createdAt, since),
            inArray(db.schema.mcpRequest.method, [
              utils.constants.MCP_REQUEST_METHOD_TOOLS_CALL,
              utils.constants.MCP_REQUEST_METHOD_PROMPTS_GET,
              utils.constants.MCP_REQUEST_METHOD_RESOURCES_READ
            ])
          )
        )
        .groupBy(db.schema.mcpSession.clientName, mcpDay),

      // The "who ran what, when" feed — the most recent executions across MCP
      // clients and channel bots, with the registered user's name when known.
      dbInstance
        .select({
          id: db.schema.artifactExecution.id,
          kind: db.schema.artifactExecution.kind,
          name: db.schema.artifactExecution.name,
          source: db.schema.artifactExecution.source,
          userName: db.schema.user.name,
          externalActorName: db.schema.artifactExecution.externalActorName,
          createdAt: db.schema.artifactExecution.createdAt
        })
        .from(db.schema.artifactExecution)
        .leftJoin(
          db.schema.user,
          eq(db.schema.user.id, db.schema.artifactExecution.userId)
        )
        .where(eq(db.schema.artifactExecution.artifactId, base.artifactId))
        .orderBy(desc(db.schema.artifactExecution.createdAt))
        .limit(8)
    ]);

  return c.json({
    project: {
      id: base.projectId,
      name: base.projectName,
      description: base.projectDescription
    },
    artifact: { id: base.artifactId, slug: base.slug },
    stats: {
      resources: {
        count: base.resourceCount,
        totalSize: base.resourceTotalSize,
        usage: base.resourceUsageCount
      },
      tools: { count: base.toolCount, usage: base.toolUsageCount },
      prompts: { count: base.promptCount, usage: base.promptUsageCount },
      channels: { count: base.channelCount }
    },
    channels,
    activity: {
      since: since.toISOString(),
      days,
      channel: channelActivity,
      mcp: mcpActivity
    },
    recentActivity
  });
};

const remove = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.PROJECT_GET.parseAsync({
    id: c.req.param('projectId'),
    organizationId: c.req.param('organizationId'),
    userId: c.get('user').id
  });

  const dbInstance = db.create(c);

  await dbInstance.transaction(async tx => {
    await tx
      .delete(db.schema.project)
      .where(
        and(
          eq(db.schema.project.id, currentValues.id),
          eq(db.schema.project.organizationId, currentValues.organizationId)
        )
      );

    await tx
      .update(db.schema.organization)
      .set({
        projectCount: sql`(${db.schema.organization.projectCount}::int - 1)::int`
      })
      .where(eq(db.schema.organization.id, currentValues.organizationId));
  });

  return c.json(currentValues);
};

export const ProjectController = {
  create,
  update,
  get,
  getOverview,
  remove
};
