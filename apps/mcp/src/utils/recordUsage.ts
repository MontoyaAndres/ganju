import { Context } from 'hono';
import { eq, sql, and } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

import type { AppEnv } from '../types';

export interface PendingRequest {
  method: string;
  toolName?: string | null;
  resourceUri?: string | null;
  promptId?: string | null;
  input: unknown;
  output?: unknown;
  latencyMs?: number | null;
  errorMessage?: string | null;
  artifactToolId?: string | null;
  artifactResourceId?: string | null;
  artifactPromptId?: string | null;
  customCodeCall?: boolean;
  // Brought outside content into the session where the output can't say so
  // itself (a proxied resource read). Tool results carry the flag in `_meta`.
  untrusted?: boolean;
}

/**
 * Whether a message sent ahead of this one in the same batch reads something:
 * any tool call or resource read. Their results don't exist yet when this call
 * is checked — a batch runs concurrently — so any of them counts, flagged or
 * not.
 */
export const readsEarlierInBatch = (
  messages: JsonRpcRequest[],
  requestId: string | number | undefined
): boolean => {
  if (requestId === undefined) return false;
  const index = messages.findIndex(m => m.id === requestId);
  return messages
    .slice(0, Math.max(index, 0))
    .some(
      m =>
        m.method === utils.constants.MCP_REQUEST_METHOD_TOOLS_CALL ||
        m.method === utils.constants.MCP_REQUEST_METHOD_RESOURCES_READ
    );
};

/** Whether any of these requests brought outside content into the session. */
export const readUntrustedContent = (requests: PendingRequest[]): boolean =>
  requests.some(r => r.untrusted || utils.isUntrustedToolResult(r.output));

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

// JSON-RPC bodies can be a single object or an array (batch). Notifications
// (no `id`) don't expect a response and don't really represent usage; we still
// log them so the audit trail matches what the client sent.
export const parseJsonRpcMessages = (body: unknown): JsonRpcRequest[] => {
  if (!body) return [];
  const items = Array.isArray(body) ? body : [body];
  return items.filter(
    (item): item is JsonRpcRequest =>
      !!item &&
      typeof item === 'object' &&
      typeof (item as JsonRpcRequest).method === 'string'
  );
};

// Methods we record from the parsed body alone (we don't intercept the SDK's
// auto-handlers, so we won't have output detail — just acknowledge they ran).
const BODY_ONLY_METHODS = new Set<string>([
  utils.constants.MCP_REQUEST_METHOD_INITIALIZE,
  utils.constants.MCP_REQUEST_METHOD_PING,
  utils.constants.MCP_REQUEST_METHOD_TOOLS_LIST,
  utils.constants.MCP_REQUEST_METHOD_RESOURCES_LIST,
  utils.constants.MCP_REQUEST_METHOD_RESOURCES_TEMPLATES_LIST,
  utils.constants.MCP_REQUEST_METHOD_PROMPTS_LIST
]);

export const collectBodyOnlyRequests = (
  messages: JsonRpcRequest[]
): PendingRequest[] =>
  messages
    .filter(m => BODY_ONLY_METHODS.has(m.method))
    .map(m => ({
      method: m.method,
      input: m.params ?? null,
      output: null,
      latencyMs: null
    }));

// The failure a tool result reports, if any. Tools are asked to answer a
// failure as text starting `Error:` rather than throw (see tools/README), and
// most don't also set `isError` — both count as a failed call, or Home's error
// rate would only ever see the ones that throw.
export const toolResultError = (result: unknown): string | null => {
  if (!result || typeof result !== 'object') return null;
  const { content, isError } = result as {
    content?: unknown;
    isError?: unknown;
  };
  const first = Array.isArray(content)
    ? (content as { type?: unknown; text?: unknown }[]).find(
        part => part?.type === 'text' && typeof part.text === 'string'
      )
    : undefined;
  // A proxied tool's error arrives labelled as outside content; the record
  // keeps the message itself.
  const text =
    typeof first?.text === 'string'
      ? utils.unwrapUntrustedContent(first.text).trim()
      : '';
  if (isError === true) return text.slice(0, 1000) || 'Tool returned an error';
  if (text.startsWith('Error:')) return text.slice(0, 1000);
  return null;
};

// The SDK answers some calls itself, before any handler runs: arguments that
// fail the tool's input schema, and a name this server doesn't have. Both are
// a model getting a tool wrong, and no handler is there to record them. The
// SDK turns them into an `isError` result under this fixed prefix.
const SDK_REJECTION =
  /^MCP error -32602: ((?:Input validation error|Tool \S+ (?:not found|disabled))[\s\S]*)$/;

/**
 * Calls the SDK rejected, read back from the response the client got and
 * matched to the request by JSON-RPC id. Only JSON responses carry them —
 * the server answers with `enableJsonResponse` — and the body is cloned, so
 * the client still gets the original stream.
 */
export const collectRejectedToolCalls = async (
  messages: JsonRpcRequest[],
  response: Response | undefined,
  toolIds: Map<string, string>
): Promise<PendingRequest[]> => {
  const calls = new Map(
    messages
      .filter(
        m =>
          m.method === utils.constants.MCP_REQUEST_METHOD_TOOLS_CALL &&
          m.id !== undefined
      )
      .map(m => [String(m.id), m])
  );
  if (calls.size === 0 || !response) return [];
  if (!response.headers.get('content-type')?.includes('application/json')) {
    return [];
  }

  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    return [];
  }

  const rejected: PendingRequest[] = [];
  for (const reply of Array.isArray(body) ? body : [body]) {
    if (!reply || typeof reply !== 'object') continue;
    const { id, result } = reply as { id?: unknown; result?: unknown };
    const call = id == null ? undefined : calls.get(String(id));
    if (!call) continue;
    const match = toolResultError(result)?.match(SDK_REJECTION);
    if (!match) continue;
    const name =
      typeof call.params?.name === 'string' ? call.params.name : null;
    rejected.push({
      method: utils.constants.MCP_REQUEST_METHOD_TOOLS_CALL,
      toolName: name,
      artifactToolId: name ? (toolIds.get(name) ?? null) : null,
      input: call.params?.arguments ?? null,
      output: result,
      latencyMs: null,
      errorMessage: match[1]
    });
  }
  return rejected;
};

// Best-effort parse of the MCP client identity from User-Agent. Real clients
// (Claude Desktop, mcp-inspector, etc.) follow product-token form
// `name/version (extra)`; fall back to a truncated raw UA otherwise so we
// always have something searchable.
export const parseClient = (
  userAgent: string | undefined | null
): { name: string | null; version: string | null } => {
  if (!userAgent) return { name: null, version: null };
  const match = userAgent.match(/^([A-Za-z0-9._-]+)\/(\S+)/);
  if (match) return { name: match[1], version: match[2] };
  return { name: userAgent.slice(0, 64), version: null };
};

// Stable session key for grouping requests. Real clients echo the
// `mcp-session-id` header issued on `initialize`; for stateless clients we
// fall back to a synthetic per-hour bucket keyed by user + UA so a single
// client doesn't create a new row on every request. A channel turn names its
// conversation (trusted callers only), so each chat is one session and its
// calls replay in order without other chats' calls mixed in.
export const resolveExternalSessionId = (
  c: Context<AppEnv>,
  artifactId: string,
  userId: string | undefined,
  userAgent: string | null,
  channelConversationId?: string | null
): string => {
  if (channelConversationId) {
    return `channel:${artifactId}:${channelConversationId}`;
  }
  const header = c.req.header(utils.constants.MCP_SESSION_HEADER);
  if (header) return header;
  return syntheticSessionId(artifactId, userId, userAgent, currentHourBucket());
};

const HOUR_MS = 60 * 60 * 1000;

const currentHourBucket = (): number => Math.floor(Date.now() / HOUR_MS);

const syntheticSessionId = (
  artifactId: string,
  userId: string | undefined,
  userAgent: string | null,
  hourBucket: number
): string =>
  `synthetic:${artifactId}:${userId ?? 'machine'}:${
    userAgent ?? 'unknown'
  }:${hourBucket}`;

/**
 * Which session rows say whether this caller has read outside content lately.
 * A session the client named (or a channel conversation) is one row, for as
 * long as it lasts. A synthetic one is a clock-hour bucket, so an email read at
 * 10:59 sits in the previous hour's row when the send comes at 11:01: both rows
 * are read, and a mark counts for the 60 minutes after it — not until the
 * bucket happens to turn over.
 */
export const untrustedSessionScope = (
  c: Context<AppEnv>,
  artifactId: string,
  userId: string | undefined,
  userAgent: string | null,
  channelConversationId?: string | null
): { externalSessionIds: string[]; since: Date | null } => {
  const current = resolveExternalSessionId(
    c,
    artifactId,
    userId,
    userAgent,
    channelConversationId
  );
  if (!current.startsWith('synthetic:')) {
    return { externalSessionIds: [current], since: null };
  }
  return {
    externalSessionIds: [
      current,
      syntheticSessionId(artifactId, userId, userAgent, currentHourBucket() - 1)
    ],
    since: new Date(Date.now() - HOUR_MS)
  };
};

interface SessionInput {
  artifactId: string;
  externalSessionId: string;
  authKind: string;
  userId: string | undefined;
  userAgent: string | null;
  ipAddress: string | null;
  clientName: string | null;
  clientVersion: string | null;
  metadata?: Record<string, unknown> | null;
}

export const upsertSession = async (
  dbInstance: ReturnType<typeof db.create>,
  input: SessionInput
): Promise<{ id: string }> => {
  const [existing] = await dbInstance
    .select({ id: db.schema.mcpSession.id })
    .from(db.schema.mcpSession)
    .where(
      and(
        eq(db.schema.mcpSession.artifactId, input.artifactId),
        eq(db.schema.mcpSession.externalSessionId, input.externalSessionId)
      )
    )
    .limit(1);

  if (existing) return existing;

  const [created] = await dbInstance
    .insert(db.schema.mcpSession)
    .values({
      artifactId: input.artifactId,
      externalSessionId: input.externalSessionId,
      authKind: input.authKind,
      userId: input.userId ?? null,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      clientName: input.clientName,
      clientVersion: input.clientVersion,
      metadata: input.metadata ?? null
    })
    .onConflictDoNothing({
      target: [
        db.schema.mcpSession.artifactId,
        db.schema.mcpSession.externalSessionId
      ]
    })
    .returning({ id: db.schema.mcpSession.id });

  if (created) return created;

  const [refetched] = await dbInstance
    .select({ id: db.schema.mcpSession.id })
    .from(db.schema.mcpSession)
    .where(
      and(
        eq(db.schema.mcpSession.artifactId, input.artifactId),
        eq(db.schema.mcpSession.externalSessionId, input.externalSessionId)
      )
    )
    .limit(1);

  if (!refetched) throw new Error('Failed to upsert mcpSession');
  return refetched;
};

export interface RequestActor {
  // The authenticated user behind this MCP session, when there is one.
  userId: string | null;
  // The MCP client name (e.g. "Claude Desktop") — used as the actor label when
  // the session has no registered user (machine / api-token access).
  clientName: string | null;
  // True when these requests were proxied in by a channel bot. The channel
  // runner owns usage/execution accounting for those, so we skip it here to
  // avoid double counting the same logical call.
  viaChannel: boolean;
}

export const flushRequests = async (
  dbInstance: ReturnType<typeof db.create>,
  sessionId: string,
  artifactId: string,
  organizationId: string,
  requests: PendingRequest[],
  actor: RequestActor
): Promise<void> => {
  if (requests.length === 0) return;

  await dbInstance.insert(db.schema.mcpRequest).values(
    requests.map(r => ({
      sessionId,
      method: r.method,
      toolName: r.toolName ?? null,
      resourceUri: r.resourceUri ?? null,
      promptId: r.promptId ?? null,
      input: (r.input as Record<string, unknown>) ?? null,
      output: (r.output as Record<string, unknown>) ?? null,
      latencyMs: r.latencyMs ?? null,
      errorMessage: r.errorMessage ?? null,
      artifactToolId: r.artifactToolId ?? null,
      artifactResourceId: r.artifactResourceId ?? null,
      artifactPromptId: r.artifactPromptId ?? null
    }))
  );

  const now = new Date();
  await dbInstance
    .update(db.schema.mcpSession)
    .set({
      requestCount: sql`(${db.schema.mcpSession.requestCount}::int + ${requests.length})::int`,
      lastRequestAt: now,
      ...(readUntrustedContent(requests) ? { untrustedReadAt: now } : {})
    })
    .where(eq(db.schema.mcpSession.id, sessionId));

  // Custom-tool invocations, counted against the organization's monthly budget.
  //
  // Deliberately ABOVE the channel-proxy early return below. That return exists
  // because the channel runner records the execution audit for turns it proxied,
  // and recording them twice would double count — but the runner counts
  // MESSAGES, and a turn that called three custom tools spent three dispatches
  // whoever asked for them. Compute is a different axis from inference, and each
  // is counted exactly once, where it is spent.
  //
  // One statement per request rather than per call, and best-effort: this runs
  // after the response, so a failure here costs a counter, not a tool call.
  const customCodeCalls = requests.filter(r => r.customCodeCall).length;
  if (customCodeCalls > 0) {
    await db.plan.incrementToolCallUsage(
      dbInstance,
      organizationId,
      customCodeCalls
    );
  }

  // Channel-proxied calls are accounted for by the channel runner (which knows
  // the external actor) — recording them here as well would double count.
  if (actor.viaChannel) return;

  // Map each meaningful call to an execution-audit row: who ran which
  // tool/prompt or read which resource, and when. Protocol noise
  // (initialize/ping/list) carries no kind and is skipped.
  const kindFor = (method: string): string | null => {
    if (method === utils.constants.MCP_REQUEST_METHOD_TOOLS_CALL) {
      return utils.constants.USAGE_KIND_TOOL;
    }
    if (method === utils.constants.MCP_REQUEST_METHOD_PROMPTS_GET) {
      return utils.constants.USAGE_KIND_PROMPT;
    }
    if (method === utils.constants.MCP_REQUEST_METHOD_RESOURCES_READ) {
      return utils.constants.USAGE_KIND_RESOURCE;
    }
    return null;
  };

  const executions = requests
    .map(r => ({ r, kind: kindFor(r.method) }))
    .filter((e): e is { r: PendingRequest; kind: string } => e.kind !== null)
    .map(({ r, kind }) => ({
      artifactId,
      kind,
      name:
        kind === utils.constants.USAGE_KIND_RESOURCE
          ? (r.resourceUri ?? null)
          : (r.toolName ?? r.promptId ?? null),
      source: utils.constants.SERVICE_NAME_MCP,
      userId: actor.userId,
      externalActorId: null,
      externalActorName: actor.userId ? null : actor.clientName,
      artifactToolId: r.artifactToolId ?? null,
      artifactPromptId: r.artifactPromptId ?? null,
      artifactResourceId: r.artifactResourceId ?? null
    }));

  if (executions.length === 0) return;

  await dbInstance.insert(db.schema.artifactExecution).values(executions);
  await db.incrementArtifactUsage(
    dbInstance,
    artifactId,
    utils.tallyUsageKinds(executions)
  );
};
