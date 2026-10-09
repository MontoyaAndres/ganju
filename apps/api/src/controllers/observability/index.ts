import { Context } from 'hono';
import { and, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';

import { Plan } from '../../utils';

// types
import { AppEnv } from '../../types';

/**
 * Tool observability for a project: how each tool is doing, what fails, which
 * tools nobody calls, and the exact calls behind any of it.
 *
 * Everything is read from `mcp_request`, which the MCP worker writes for every
 * call — channel turns included, since the runner calls tools through the same
 * worker. Nothing here records anything, so the windows are bounded by that
 * table's retention (`RETENTION_DAYS.mcpRequest`).
 */

type DbInstance = ReturnType<typeof db.create>;

// The artifact behind a project, checked against the organization in the URL —
// the same scoping every project route uses.
const resolveArtifactId = async (
  dbInstance: DbInstance,
  organizationId: string,
  projectId: string
): Promise<string> => {
  const [row] = await dbInstance
    .select({ id: db.schema.artifact.id })
    .from(db.schema.project)
    .innerJoin(
      db.schema.artifact,
      eq(db.schema.artifact.projectId, db.schema.project.id)
    )
    .where(
      and(
        eq(db.schema.project.id, projectId),
        eq(db.schema.project.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!row) {
    throw new Error('Project not found');
  }
  return row.id;
};

// Tool arguments and results can hold mail, calendar entries and documents
// from a connected account. A personal access token is a deploy credential for
// CI — `ganju logs` is what it reads — so the calls themselves are only shown
// to a signed-in admin.
const refuseAccessToken = (c: Context<AppEnv>) =>
  c.get('apiToken')
    ? c.json({ error: utils.constants.ACCESS_TOKEN_SCOPE_MESSAGE }, 403)
    : null;

type InstallKind = 'native' | 'mcp-proxy' | 'custom-code' | 'http-endpoint';

const installKind = (toolKey: string): InstallKind => {
  if (toolKey === utils.constants.TOOL_DEFINITION_KEY_MCP_PROXY) {
    return 'mcp-proxy';
  }
  if (toolKey === utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE) {
    return 'custom-code';
  }
  if (toolKey === utils.constants.TOOL_DEFINITION_KEY_HTTP_ENDPOINT) {
    return 'http-endpoint';
  }
  return 'native';
};

// What the dashboard calls an install row. Custom code has no name of its own
// — the dashboard labels it — so it comes back null.
const installLabel = (row: {
  toolKey: string;
  config: unknown;
  metadata: unknown;
  serverName: string | null;
}): string | null => {
  switch (installKind(row.toolKey)) {
    case 'native':
      return utils.describeCatalogTool(row.toolKey)?.title ?? row.toolKey;
    case 'http-endpoint':
      return (row.config as { name?: string } | null)?.name ?? null;
    case 'mcp-proxy':
      return (
        row.serverName ??
        (
          row.metadata as {
            discovery?: { serverInfo?: { name?: string } };
          } | null
        )?.discovery?.serverInfo?.name ??
        null
      );
    default:
      return null;
  }
};

interface ToolHealthRow {
  name: string;
  artifact_tool_id: string | null;
  calls: number;
  errors: number;
  schema_rejections: number;
  retries: number;
  switched_after_error: number;
  p95_ms: number | null;
  last_used_at: string | Date;
}

interface TopErrorRow {
  tool: string;
  message: string;
  count: number;
  last_seen_at: string | Date;
  last_request_id: string;
}

/**
 * Per-tool health over the window, the most common errors, and the enabled
 * tools nobody has called in `OBSERVABILITY_UNUSED_DAYS`.
 *
 * Confusion signals are read off each session's sequence of calls: a call
 * the input schema rejected; the same tool called again right after a failure
 * or with the very same arguments (a retry — a search run again with a new
 * query is just a search); and an error followed right after by a different
 * tool — counted on the tool that failed, since that's the one the model gave
 * up on.
 */
const getToolHealth = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.PROJECT_TOOL_HEALTH.parseAsync({
    days: c.req.query('days'),
    projectId: c.req.param('projectId'),
    organizationId: c.req.param('organizationId'),
    userId: c.get('user').id
  });

  const dbInstance = db.create(c);
  const artifactId = await resolveArtifactId(
    dbInstance,
    currentValues.organizationId,
    currentValues.projectId
  );

  const dayMs = 24 * 60 * 60 * 1000;
  const since = new Date(Date.now() - currentValues.days * dayMs);
  const unusedSince = new Date(
    Date.now() - utils.constants.OBSERVABILITY_UNUSED_DAYS * dayMs
  );
  // Raw SQL gets the timestamp the way drizzle writes one for a `timestamp`
  // column, so both kinds of query compare the same way.
  const sinceParam = since.toISOString();
  const toolsCall = utils.constants.MCP_REQUEST_METHOD_TOOLS_CALL;
  const followUpSeconds = utils.constants.OBSERVABILITY_FOLLOW_UP_SECONDS;
  const schemaRejection = `${utils.constants.OBSERVABILITY_SCHEMA_REJECTION_PREFIX}%`;

  const [healthRows, errorRows, usedRows, installs, effectivePlan, counts] =
    await Promise.all([
      dbInstance.execute(sql`
      WITH calls AS (
        SELECT
          r.tool_name,
          r.artifact_tool_id,
          r.latency_ms,
          r.error_message,
          r.created_at,
          r.input::jsonb AS input,
          lag(r.input::jsonb) OVER w AS prev_input,
          lag(r.tool_name) OVER w AS prev_tool,
          lag(r.error_message) OVER w AS prev_error,
          lag(r.created_at) OVER w AS prev_at
        FROM mcp_request r
        JOIN mcp_session s ON s.id = r.session_id
        WHERE s.artifact_id = ${artifactId}
          AND r.method = ${toolsCall}
          AND r.tool_name IS NOT NULL
          AND r.created_at >= ${sinceParam}
        WINDOW w AS (PARTITION BY r.session_id ORDER BY r.created_at, r.id)
      ),
      followed AS (
        SELECT
          *,
          coalesce(
            created_at - prev_at <= ${followUpSeconds} * interval '1 second',
            false
          ) AS close
        FROM calls
      ),
      switched AS (
        SELECT prev_tool AS tool_name, count(*)::int AS n
        FROM followed
        WHERE close AND prev_error IS NOT NULL AND prev_tool <> tool_name
        GROUP BY prev_tool
      )
      SELECT
        f.tool_name AS name,
        (array_agg(f.artifact_tool_id ORDER BY f.created_at DESC)
          FILTER (WHERE f.artifact_tool_id IS NOT NULL))[1] AS artifact_tool_id,
        count(*)::int AS calls,
        count(f.error_message)::int AS errors,
        count(*) FILTER (WHERE f.error_message LIKE ${schemaRejection})::int
          AS schema_rejections,
        count(*) FILTER (
          WHERE f.close
            AND f.prev_tool = f.tool_name
            AND (f.prev_error IS NOT NULL OR f.prev_input = f.input)
        )::int AS retries,
        coalesce(max(sw.n), 0)::int AS switched_after_error,
        round(
          percentile_cont(0.95) WITHIN GROUP (ORDER BY f.latency_ms)
        )::int AS p95_ms,
        max(f.created_at) AS last_used_at
      FROM followed f
      LEFT JOIN switched sw ON sw.tool_name = f.tool_name
      GROUP BY f.tool_name
      ORDER BY calls DESC, name
    `) as unknown as Promise<ToolHealthRow[]>,

      // Grouped by the kind of failure, not the instance of it: quoted values,
      // ids and long numbers are masked, so "No Pokémon named "mew"" and
      // "… "ditto"" are one error. Short numbers stay — "answered 403" and
      // "answered 500" are different failures. Opened, an error shows its most
      // recent call whole.
      dbInstance.execute(sql`
      WITH failed AS (
        SELECT
          r.id,
          r.tool_name,
          r.created_at,
          regexp_replace(
            left(r.error_message, 300),
            '"[^"]*"|''[^'']*''|[0-9a-fA-F]{8}-[0-9a-fA-F-]{27}|[0-9]{5,}',
            '…',
            'g'
          ) AS message
        FROM mcp_request r
        JOIN mcp_session s ON s.id = r.session_id
        WHERE s.artifact_id = ${artifactId}
          AND r.method = ${toolsCall}
          AND r.tool_name IS NOT NULL
          AND r.error_message IS NOT NULL
          AND r.created_at >= ${sinceParam}
      )
      SELECT
        tool_name AS tool,
        message,
        count(*)::int AS count,
        max(created_at) AS last_seen_at,
        (array_agg(id ORDER BY created_at DESC))[1] AS last_request_id
      FROM failed
      GROUP BY tool_name, message
      ORDER BY count DESC, last_seen_at DESC
      LIMIT ${utils.constants.OBSERVABILITY_TOP_ERRORS}
    `) as unknown as Promise<TopErrorRow[]>,

      dbInstance
        .selectDistinct({ id: db.schema.mcpRequest.artifactToolId })
        .from(db.schema.mcpRequest)
        .innerJoin(
          db.schema.mcpSession,
          eq(db.schema.mcpSession.id, db.schema.mcpRequest.sessionId)
        )
        .where(
          and(
            eq(db.schema.mcpSession.artifactId, artifactId),
            eq(db.schema.mcpRequest.method, toolsCall),
            isNotNull(db.schema.mcpRequest.artifactToolId),
            gte(db.schema.mcpRequest.createdAt, unusedSince)
          )
        ),

      dbInstance
        .select({
          id: db.schema.artifactTool.id,
          toolKey: db.schema.artifactTool.toolKey,
          enabled: db.schema.artifactTool.enabled,
          config: db.schema.artifactTool.config,
          metadata: db.schema.artifactTool.metadata,
          createdAt: db.schema.artifactTool.createdAt,
          serverName: db.schema.mcpServerCatalog.name
        })
        .from(db.schema.artifactTool)
        .leftJoin(
          db.schema.mcpServerCatalog,
          eq(
            db.schema.mcpServerCatalog.id,
            db.schema.artifactTool.mcpServerCatalogId
          )
        )
        .where(eq(db.schema.artifactTool.artifactId, artifactId)),

      Plan.getEffectivePlan(dbInstance, currentValues.organizationId),

      dbInstance
        .select({ enabled: db.schema.artifact.artifactToolCount })
        .from(db.schema.artifact)
        .where(eq(db.schema.artifact.id, artifactId))
        .limit(1)
    ]);

  const installById = new Map(installs.map(row => [row.id, row]));
  const used = new Set(usedRows.map(row => row.id));

  return c.json({
    since: since.toISOString(),
    days: currentValues.days,
    tools: healthRows.map(row => {
      const install = row.artifact_tool_id
        ? installById.get(row.artifact_tool_id)
        : undefined;
      return {
        name: row.name,
        // A native tool's name is its catalog key; anything else is named by
        // whoever wrote it, and a name with no install is one the model made
        // up (the server answered "not found").
        title:
          install && installKind(install.toolKey) === 'native'
            ? (utils.describeCatalogTool(row.name)?.title ?? null)
            : null,
        kind: install ? installKind(install.toolKey) : null,
        artifactToolId: install?.id ?? null,
        enabled: install?.enabled ?? null,
        calls: row.calls,
        errors: row.errors,
        schemaRejections: row.schema_rejections,
        retries: row.retries,
        switchedAfterError: row.switched_after_error,
        p95Ms: row.p95_ms,
        lastUsedAt: row.last_used_at
      };
    }),
    errors: errorRows.map(row => ({
      tool: row.tool,
      message: row.message,
      count: row.count,
      lastSeenAt: row.last_seen_at,
      lastRequestId: row.last_request_id
    })),
    // Judged per install row, the unit the Tools page switches on and off: an
    // MCP server or a script counts as used when any of its tools was called.
    // A row younger than the window hasn't had the chance to be used.
    unused: installs
      .filter(
        row => row.enabled && row.createdAt <= unusedSince && !used.has(row.id)
      )
      .map(row => ({
        artifactToolId: row.id,
        toolKey: row.toolKey,
        kind: installKind(row.toolKey),
        label: installLabel(row),
        createdAt: row.createdAt
      })),
    unusedDays: utils.constants.OBSERVABILITY_UNUSED_DAYS,
    // Disabling is free, but enabling re-checks the plan's tool limit
    // against this count. An artifact over its limit (a downgrade leaves it
    // there) can't turn a tool back on without turning another off, and the
    // dashboard says so before it disables anything.
    toolQuota: {
      plan: effectivePlan.plan,
      limit: effectivePlan.limits.maxToolsPerArtifact,
      enabled: counts[0]?.enabled ?? 0
    }
  });
};

// Who a session was: a channel chat, a signed-in user's MCP client, or a
// client on a token. Channel sessions say which conversation, when the worker
// recorded one, so the dashboard can open it.
const describeSession = (session: {
  id: string;
  clientName: string | null;
  clientVersion: string | null;
  authKind: string;
  metadata: unknown;
  createdAt: Date;
  lastRequestAt: Date | null;
  userName: string | null;
}) => {
  const metadata = (session.metadata ?? {}) as {
    via?: string;
    channelId?: string;
    platform?: string;
    conversationId?: string;
  };
  const viaChannel = metadata.via === 'channel';
  return {
    id: session.id,
    clientName: session.clientName,
    clientVersion: session.clientVersion,
    authKind: session.authKind,
    userName: session.userName,
    via: viaChannel ? 'channel' : 'mcp',
    channel: viaChannel
      ? {
          channelId: metadata.channelId ?? null,
          platform: metadata.platform ?? null,
          conversationId: metadata.conversationId ?? null
        }
      : null,
    createdAt: session.createdAt,
    lastRequestAt: session.lastRequestAt
  };
};

const sessionColumns = {
  id: db.schema.mcpSession.id,
  clientName: db.schema.mcpSession.clientName,
  clientVersion: db.schema.mcpSession.clientVersion,
  authKind: db.schema.mcpSession.authKind,
  metadata: db.schema.mcpSession.metadata,
  createdAt: db.schema.mcpSession.createdAt,
  lastRequestAt: db.schema.mcpSession.lastRequestAt,
  userName: db.schema.user.name
};

/**
 * The tool calls behind a row of the health table (or every tool's), newest
 * first, optionally only the failed ones. Paged by `after`, the id of the last
 * call the reader has.
 */
const listToolCalls = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.PROJECT_TOOL_CALLS.parseAsync({
    tool: c.req.query('tool'),
    status: c.req.query('status'),
    limit: c.req.query('limit'),
    after: c.req.query('after'),
    projectId: c.req.param('projectId'),
    organizationId: c.req.param('organizationId'),
    userId: c.get('user').id
  });

  const dbInstance = db.create(c);
  const artifactId = await resolveArtifactId(
    dbInstance,
    currentValues.organizationId,
    currentValues.projectId
  );

  const rows = await dbInstance
    .select({
      id: db.schema.mcpRequest.id,
      toolName: db.schema.mcpRequest.toolName,
      inputPreview: sql<
        string | null
      >`left(${db.schema.mcpRequest.input}::text, 200)`,
      latencyMs: db.schema.mcpRequest.latencyMs,
      errorMessage: db.schema.mcpRequest.errorMessage,
      createdAt: db.schema.mcpRequest.createdAt,
      sessionId: db.schema.mcpRequest.sessionId,
      clientName: db.schema.mcpSession.clientName,
      sessionMetadata: db.schema.mcpSession.metadata
    })
    .from(db.schema.mcpRequest)
    .innerJoin(
      db.schema.mcpSession,
      eq(db.schema.mcpSession.id, db.schema.mcpRequest.sessionId)
    )
    .where(
      and(
        eq(db.schema.mcpSession.artifactId, artifactId),
        eq(
          db.schema.mcpRequest.method,
          utils.constants.MCP_REQUEST_METHOD_TOOLS_CALL
        ),
        ...(currentValues.tool
          ? [eq(db.schema.mcpRequest.toolName, currentValues.tool)]
          : []),
        ...(currentValues.status === 'error'
          ? [isNotNull(db.schema.mcpRequest.errorMessage)]
          : []),
        // Compared against that call's stored timestamp, to the microsecond,
        // with the id breaking ties — the same order the page is sorted in.
        ...(currentValues.after
          ? [
              sql`(${db.schema.mcpRequest.createdAt}, ${db.schema.mcpRequest.id}) < (
                SELECT created_at, id FROM mcp_request WHERE id = ${currentValues.after}
              )`
            ]
          : [])
      )
    )
    .orderBy(
      desc(db.schema.mcpRequest.createdAt),
      desc(db.schema.mcpRequest.id)
    )
    .limit(currentValues.limit);

  return c.json({
    entries: rows.map(({ sessionMetadata, ...row }) => {
      const metadata = (sessionMetadata ?? {}) as {
        via?: string;
        platform?: string;
      };
      return {
        ...row,
        via: metadata.via === 'channel' ? 'channel' : 'mcp',
        platform: metadata.platform ?? null
      };
    })
  });
};

/**
 * One call, whole: the arguments it was given, what it returned or the error,
 * and the session it ran in.
 */
const getToolCall = async (c: Context<AppEnv>) => {
  const refused = refuseAccessToken(c);
  if (refused) return refused;

  const currentValues = await utils.Schema.PROJECT_TOOL_CALL.parseAsync({
    requestId: c.req.param('requestId'),
    projectId: c.req.param('projectId'),
    organizationId: c.req.param('organizationId'),
    userId: c.get('user').id
  });

  const dbInstance = db.create(c);
  const artifactId = await resolveArtifactId(
    dbInstance,
    currentValues.organizationId,
    currentValues.projectId
  );

  const [row] = await dbInstance
    .select({
      request: {
        id: db.schema.mcpRequest.id,
        method: db.schema.mcpRequest.method,
        toolName: db.schema.mcpRequest.toolName,
        resourceUri: db.schema.mcpRequest.resourceUri,
        promptId: db.schema.mcpRequest.promptId,
        input: db.schema.mcpRequest.input,
        output: db.schema.mcpRequest.output,
        latencyMs: db.schema.mcpRequest.latencyMs,
        errorMessage: db.schema.mcpRequest.errorMessage,
        createdAt: db.schema.mcpRequest.createdAt
      },
      session: sessionColumns
    })
    .from(db.schema.mcpRequest)
    .innerJoin(
      db.schema.mcpSession,
      eq(db.schema.mcpSession.id, db.schema.mcpRequest.sessionId)
    )
    .leftJoin(
      db.schema.user,
      eq(db.schema.user.id, db.schema.mcpSession.userId)
    )
    .where(
      and(
        eq(db.schema.mcpRequest.id, currentValues.requestId),
        eq(db.schema.mcpSession.artifactId, artifactId)
      )
    )
    .limit(1);

  if (!row) {
    return c.json({ error: 'Call not found' }, 404);
  }

  return c.json({ ...row.request, session: describeSession(row.session) });
};

/**
 * Replay of one MCP session: every tool call, prompt and resource read in
 * order. Protocol traffic (initialize, list, ping) is left out. Outputs are
 * left out too — a timeline of hundreds of results would be megabytes — and
 * read one at a time through the call endpoint.
 */
const getSession = async (c: Context<AppEnv>) => {
  const refused = refuseAccessToken(c);
  if (refused) return refused;

  const currentValues = await utils.Schema.PROJECT_MCP_SESSION.parseAsync({
    sessionId: c.req.param('sessionId'),
    projectId: c.req.param('projectId'),
    organizationId: c.req.param('organizationId'),
    userId: c.get('user').id
  });

  const dbInstance = db.create(c);
  const artifactId = await resolveArtifactId(
    dbInstance,
    currentValues.organizationId,
    currentValues.projectId
  );

  const [session] = await dbInstance
    .select(sessionColumns)
    .from(db.schema.mcpSession)
    .leftJoin(
      db.schema.user,
      eq(db.schema.user.id, db.schema.mcpSession.userId)
    )
    .where(
      and(
        eq(db.schema.mcpSession.id, currentValues.sessionId),
        eq(db.schema.mcpSession.artifactId, artifactId)
      )
    )
    .limit(1);

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const max = utils.constants.OBSERVABILITY_SESSION_MAX_CALLS;
  const newestFirst = await dbInstance
    .select({
      id: db.schema.mcpRequest.id,
      method: db.schema.mcpRequest.method,
      toolName: db.schema.mcpRequest.toolName,
      resourceUri: db.schema.mcpRequest.resourceUri,
      promptId: db.schema.mcpRequest.promptId,
      // Enough of the arguments to tell calls apart on the timeline.
      inputPreview: sql<
        string | null
      >`left(${db.schema.mcpRequest.input}::text, 300)`,
      latencyMs: db.schema.mcpRequest.latencyMs,
      errorMessage: db.schema.mcpRequest.errorMessage,
      createdAt: db.schema.mcpRequest.createdAt
    })
    .from(db.schema.mcpRequest)
    .where(
      and(
        eq(db.schema.mcpRequest.sessionId, session.id),
        inArray(db.schema.mcpRequest.method, [
          utils.constants.MCP_REQUEST_METHOD_TOOLS_CALL,
          utils.constants.MCP_REQUEST_METHOD_PROMPTS_GET,
          utils.constants.MCP_REQUEST_METHOD_RESOURCES_READ
        ])
      )
    )
    .orderBy(
      desc(db.schema.mcpRequest.createdAt),
      desc(db.schema.mcpRequest.id)
    )
    .limit(max + 1);

  const truncated = newestFirst.length > max;
  return c.json({
    session: describeSession(session),
    truncated,
    entries: newestFirst.slice(0, max).reverse()
  });
};

export const ObservabilityController = {
  getToolHealth,
  listToolCalls,
  getToolCall,
  getSession
};
