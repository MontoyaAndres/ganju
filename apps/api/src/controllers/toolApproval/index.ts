import { Context } from 'hono';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';

// types
import { AppEnv } from '../../types';

// A sensitive call an MCP client made after its session read outside content,
// waiting on the user's own yes. That yes is the whole point of the page, so
// only the person counts: a signed-in dashboard session, not a personal access
// token or an OAuth token (the CLI's, or an MCP client's — the very model this
// exists to keep from approving itself). Every miss is the same 404, so
// someone else's approval id says nothing about whether it exists.

const NOT_FOUND = { error: 'Approval not found' } as const;

const loadForUser = async (
  dbInstance: ReturnType<typeof db.create>,
  approvalId: string,
  userId: string
) => {
  const [row] = await dbInstance
    .select({
      approval: db.schema.toolApproval,
      artifactSlug: db.schema.artifact.slug,
      projectId: db.schema.project.id,
      projectName: db.schema.project.name,
      organizationId: db.schema.project.organizationId
    })
    .from(db.schema.toolApproval)
    .innerJoin(
      db.schema.artifact,
      eq(db.schema.artifact.id, db.schema.toolApproval.artifactId)
    )
    .innerJoin(
      db.schema.project,
      eq(db.schema.project.id, db.schema.artifact.projectId)
    )
    // Still on the project: the same membership that let them connect the MCP
    // server at all. Someone removed since can no longer approve its calls.
    .innerJoin(
      db.schema.projectUser,
      and(
        eq(db.schema.projectUser.projectId, db.schema.project.id),
        eq(db.schema.projectUser.userId, userId)
      )
    )
    .where(
      and(
        eq(db.schema.toolApproval.id, approvalId),
        eq(db.schema.toolApproval.userId, userId)
      )
    )
    .limit(1);
  return row ?? null;
};

const view = (row: NonNullable<Awaited<ReturnType<typeof loadForUser>>>) => ({
  id: row.approval.id,
  toolName: row.approval.toolName,
  toolTitle: row.approval.toolTitle,
  arguments: row.approval.arguments,
  status: utils.toolApprovalStatus(row.approval),
  expiresAt: row.approval.expiresAt.toISOString(),
  createdAt: row.approval.createdAt.toISOString(),
  artifactSlug: row.artifactSlug,
  projectName: row.projectName
});

const get = async (c: Context<AppEnv>) => {
  if (!c.get('session')) return c.json(NOT_FOUND, 404);
  const parsed = utils.Schema.TOOL_APPROVAL_GET.safeParse({
    approvalId: c.req.param('approvalId')
  });
  if (!parsed.success) return c.json(NOT_FOUND, 404);

  const row = await loadForUser(
    db.create(c),
    parsed.data.approvalId,
    c.get('user').id
  );
  if (!row) return c.json(NOT_FOUND, 404);

  return c.json(view(row));
};

const decide = async (c: Context<AppEnv>) => {
  if (!c.get('session')) return c.json(NOT_FOUND, 404);
  const body = await c.req.json().catch(() => ({}));
  const parsed = utils.Schema.TOOL_APPROVAL_DECIDE.safeParse({
    ...body,
    approvalId: c.req.param('approvalId')
  });
  if (!parsed.success) {
    return c.json({ error: 'Invalid decision' }, 400);
  }

  const dbInstance = db.create(c);
  const userId = c.get('user').id;
  const row = await loadForUser(dbInstance, parsed.data.approvalId, userId);
  if (!row) return c.json(NOT_FOUND, 404);

  // Answered once, and only while it is still open: the conditions are part
  // of the update, so two tabs answering at once can't both land.
  const now = new Date();
  const table = db.schema.toolApproval;
  const approve =
    parsed.data.decision === utils.constants.TOOL_APPROVAL_DECISION_APPROVE;
  const answered = await dbInstance
    .update(table)
    .set(approve ? { approvedAt: now } : { deniedAt: now })
    .where(
      and(
        eq(table.id, row.approval.id),
        eq(table.userId, userId),
        isNull(table.approvedAt),
        isNull(table.deniedAt),
        isNull(table.usedAt),
        gt(table.expiresAt, now)
      )
    )
    .returning();

  if (answered.length === 0) {
    const current = await loadForUser(dbInstance, row.approval.id, userId);
    return c.json(
      {
        error: 'This approval was already answered or has expired',
        ...(current ? view(current) : {})
      },
      409
    );
  }

  return c.json(view({ ...row, approval: answered[0] }));
};

export const ToolApprovalController = {
  get,
  decide
};
