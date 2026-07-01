import { Context } from 'hono';
import { eq, sql, and, InferSelectModel } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

import { collectSources } from './sources';
import { extractToolText } from './toolText';
import {
  createMcpClient,
  getLlmAdapter,
  createAuth,
  refreshArtifactCredential,
  resolveMcpProxyOauthSecret,
  Plan
} from '../../utils';

import type { LlmMessage, LlmToolCall, LlmToolDefinition } from '../../utils';
import type { AppEnv } from '../../types';
import type { ChannelNotifier, Source, SourceButton } from '@ganju/utils';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

type ArtifactResourceRow = InferSelectModel<typeof db.schema.artifactResource>;

interface ResolvedLlm {
  row: {
    provider: string;
    model: string;
    baseUrl: string | null;
    systemPrompt: string | null;
    config: unknown;
  };
  apiKey: string;
  llmId: string | null;
  llmName: string | null;
}

const resolveChannelLlm = async (
  c: Context<AppEnv>,
  dbInstance: ReturnType<typeof db.create>,
  llmId: string | null
): Promise<ResolvedLlm> => {
  if (llmId) {
    const [llmRow] = await dbInstance
      .select()
      .from(db.schema.organizationLlm)
      .where(eq(db.schema.organizationLlm.id, llmId))
      .limit(1);

    if (!llmRow) throw new Error('LLM not found for channel');

    const encryptionKey = utils.getCredentialEncryptionKey(c);
    return {
      row: {
        provider: llmRow.provider,
        model: llmRow.model,
        baseUrl: llmRow.baseUrl,
        systemPrompt: llmRow.systemPrompt,
        config: llmRow.config
      },
      apiKey: utils.decryptString(llmRow.apiKey, encryptionKey),
      llmId: llmRow.id,
      llmName: llmRow.name
    };
  }

  const apiKey = utils.getEnv(c, 'EMBEDDING_API_KEY');
  if (!apiKey) {
    throw new Error(
      'No LLM configured for this channel and EMBEDDING_API_KEY is not set'
    );
  }

  return {
    row: {
      provider: utils.constants.DEFAULT_LLM_PROVIDER,
      model: utils.constants.DEFAULT_LLM_MODEL,
      baseUrl: null,
      systemPrompt: utils.constants.DEFAULT_LLM_SYSTEM_PROMPT,
      config: null
    },
    apiKey,
    llmId: null,
    llmName: null
  };
};

// An artifact attachment carries an artifact_resource row (bytes live in R2 or
// the row's `content`); a remote-resource attachment carries only the remote
// MCP connection details — used for proxied (mcp-proxy) resources, which the
// resource-handler container reads + decodes + sends itself, so the file bytes
// never transit this worker.
export type ChannelAttachment =
  | { kind: 'artifact'; resource: ArtifactResourceRow; caption?: string }
  | {
      kind: 'remote-resource';
      uri: string;
      caption?: string;
      remote: {
        url: string;
        transport: string;
        authHeader: { name: string; value: string } | null;
        timeoutMs: number;
      };
    };

type UsageEvent = {
  kind: string;
  toolName: string;
  resourceUri?: string | null;
  artifactToolId: string | null;
  artifactResourceId?: string | null;
  artifactPromptId?: string | null;
  input: Record<string, unknown>;
  output: unknown;
  latencyMs: number;
  errorMessage?: string;
};

interface RunOptions {
  channelId: string;
  externalConversationId: string;
  conversationTitle?: string | null;
  conversationScope: string;
  externalParticipantId: string;
  participantDisplayName?: string | null;
  participantMetadata?: Record<string, unknown>;
  externalMessageId?: string | null;
  userText: string;
  messageMetadata?: Record<string, unknown>;
  promptId?: string | null;
  // The artifact_prompt FK to record on usage. Null for proxied prompts, whose
  // promptId is an MCP name (`<prefix>__<remote>`), not an artifact_prompt id.
  promptArtifactId?: string | null;
  promptTitle?: string | null;
  promptArgs?: Record<string, string>;
  notifier?: ChannelNotifier;
}

interface RunResult {
  assistantText: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  attachments: ChannelAttachment[];
  sources: Source[];
  sourcesFooter: string | null;
  sourceButtons: SourceButton[];
}

interface BotTokenApi {
  botToken: (args: {
    body: {
      grant_type: string;
      provider: string;
      external_id: string;
      channel_id: string;
      audience: string;
      scope?: string;
      client_id?: string;
      client_secret?: string;
    };
  }) => Promise<{ access_token?: string }>;
}

// Mints a bot-on-behalf-of JWT so the channel can call MCP as the linked user.
// Called in-process — a Worker self-fetch to its own hostname times out.
// Returns undefined on any failure — the caller then falls back to the
// channel's internal-secret access.
const mintBotToken = async (
  c: Context<AppEnv>,
  provider: string,
  externalId: string,
  channelId: string,
  audience: string
): Promise<string | undefined> => {
  const clientId = utils.getEnv(c, 'BOT_OAUTH_CLIENT_ID');
  const clientSecret = utils.getEnv(c, 'BOT_OAUTH_CLIENT_SECRET');
  if (!clientId || !clientSecret) return undefined;

  try {
    const auth = createAuth(c);

    const api = auth.api as unknown as BotTokenApi;
    const result = await api.botToken({
      body: {
        grant_type: utils.constants.BOT_GRANT_TYPE,
        provider,
        external_id: externalId,
        channel_id: channelId,
        audience,
        client_id: clientId,
        client_secret: clientSecret
      }
    });
    return result.access_token;
  } catch {
    return undefined;
  }
};

export const runChannelTurn = async (
  c: Context<AppEnv>,
  options: RunOptions
): Promise<RunResult> => {
  if (
    !utils.constants.CHANNEL_CONVERSATION_SCOPES.includes(
      options.conversationScope as (typeof utils.constants.CHANNEL_CONVERSATION_SCOPES)[0]
    )
  ) {
    throw new Error(`Invalid conversationScope: ${options.conversationScope}`);
  }

  const dbInstance = db.create(c);

  // Channel → artifact → project is a strict FK chain, so resolve all three in a
  // single joined round-trip instead of three sequential ones. Every turn pays
  // this before any model work, so the saved latency is pure overhead removed.
  const [chain] = await dbInstance
    .select({
      channel: db.schema.channel,
      artifact: db.schema.artifact,
      project: db.schema.project
    })
    .from(db.schema.channel)
    .innerJoin(
      db.schema.artifact,
      eq(db.schema.artifact.id, db.schema.channel.artifactId)
    )
    .innerJoin(
      db.schema.project,
      eq(db.schema.project.id, db.schema.artifact.projectId)
    )
    .where(eq(db.schema.channel.id, options.channelId))
    .limit(1);

  if (!chain) throw new Error('Channel not found');

  const channelRow = chain.channel;
  const artifactRow = chain.artifact;
  const projectRow = chain.project;

  // Everything below is independent once the FK chain is resolved, so fan the
  // reads out: the turn pays one round-trip of front-matter latency instead of
  // six sequential ones, all before the (dominant) model loop even starts.
  const [
    llmConfig,
    [conversation, participant],
    messageCap,
    artifactTools,
    artifactResources,
    // Resolve the participant's link for THIS channel only (set by `/link`).
    // Per-channel scoping: a link in another channel — even by the same user —
    // does not authenticate them here.
    linkedIdentity
  ] = await Promise.all([
    resolveChannelLlm(c, dbInstance, channelRow.llmId),
    Promise.all([
      upsertConversation(
        dbInstance,
        channelRow.id,
        options.externalConversationId,
        options.conversationTitle || null,
        options.conversationScope
      ),
      upsertParticipant(
        dbInstance,
        channelRow.id,
        options.externalParticipantId,
        options.participantDisplayName || null,
        options.participantMetadata || null
      )
    ]),
    // Enforce the org's monthly assistant-message budget. Paid plans have no
    // hard cap, so this only ever stops Free bots.
    Plan.checkMessageCap(dbInstance, projectRow.organizationId),
    dbInstance
      .select({
        id: db.schema.artifactTool.id,
        key: db.schema.toolDefinition.key,
        config: db.schema.artifactTool.config,
        metadata: db.schema.artifactTool.metadata
      })
      .from(db.schema.artifactTool)
      .innerJoin(
        db.schema.toolDefinition,
        eq(db.schema.artifactTool.toolDefinitionId, db.schema.toolDefinition.id)
      )
      .where(eq(db.schema.artifactTool.artifactId, artifactRow.id)),
    dbInstance
      .select()
      .from(db.schema.artifactResource)
      .where(eq(db.schema.artifactResource.artifactId, artifactRow.id)),
    dbInstance
      .select({ userId: db.schema.externalIdentity.userId })
      .from(db.schema.externalIdentity)
      .where(
        and(
          eq(db.schema.externalIdentity.channelId, channelRow.id),
          eq(db.schema.externalIdentity.provider, channelRow.platform),
          eq(
            db.schema.externalIdentity.externalId,
            options.externalParticipantId
          )
        )
      )
      .limit(1)
      .then(rows => rows[0])
  ]);

  const llmRow = llmConfig.row;
  const apiKeyPlain = llmConfig.apiKey;

  // No org LLM configured → this turn runs on the shared platform key and we pay
  // the inference.
  const onSharedKey = llmConfig.llmId === null;

  // The tighter, cheaper envelope (less history, fewer tool loops) is the
  // Free-tier experience on our default model. Paying orgs get the full envelope
  // even when they use the default model — within their included shared-model
  // allowance (bounded below), paying buys the better experience, not just more
  // messages. Orgs on their own key always get the full envelope.
  const limitedEnvelope =
    onSharedKey && messageCap.plan === utils.constants.PLAN_FREE;
  const historyLimit = limitedEnvelope
    ? utils.constants.SHARED_KEY_HISTORY_LIMIT
    : utils.constants.CHANNEL_HISTORY_LIMIT;
  const maxToolLoops = limitedEnvelope
    ? utils.constants.SHARED_KEY_MAX_TOOL_LOOPS
    : utils.constants.MAX_TOOL_LOOPS;

  const [userMessage] = await dbInstance
    .insert(db.schema.channelMessage)
    .values({
      role: utils.constants.ROLE_MESSAGE_USER,
      content: options.userText,
      externalMessageId: options.externalMessageId || null,
      conversationId: conversation.id,
      participantId: participant.id,
      metadata: options.messageMetadata || null
    })
    .returning();

  // The inbound user message is recorded above regardless; if the org is over
  // its cap we reply with a one-line notice and skip the (costly) LLM
  // tool-calling loop entirely. Like the shared-model block below, this reply is
  // read by a stranger chatting with the bot, not the owner — keep it neutral;
  // the upgrade prompt lives in the owner's billing dashboard.
  if (!messageCap.allowed) {
    return {
      assistantText:
        'This assistant is temporarily unavailable. Please check back later.',
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      assistantMessageId: '',
      attachments: [],
      sources: [],
      sourcesFooter: null,
      sourceButtons: []
    };
  }

  // Shared-model allowance gate. A channel with no org LLM runs on OUR key and
  // OUR inference bill; that's included only up to the plan's shared-key cap.
  // Past it we don't flat-rate inference — the owner must connect their own AI
  // model to keep this channel running (a paid feature). Own-key turns skip this
  // entirely (they're metered as overage, not capped). Free never reaches here:
  // its hard cap equals its shared-key cap, so `messageCap.allowed` fails first.
  //
  // The reply below is read by whoever is chatting with the bot — a stranger, not
  // the owner — so keep it neutral: no plan details, no billing instructions they
  // can't act on. The actionable "connect your own model" prompt lives in the
  // owner's billing dashboard (Settings › Billing) instead.
  if (
    onSharedKey &&
    messageCap.sharedKeyCap != null &&
    messageCap.used >= messageCap.sharedKeyCap
  ) {
    return {
      assistantText:
        'This assistant is temporarily unavailable. Please check back later.',
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      assistantMessageId: '',
      attachments: [],
      sources: [],
      sourcesFooter: null,
      sourceButtons: []
    };
  }

  // Loaded after the user-message insert so it reflects this turn, matching the
  // prior ordering.
  const history = await loadRecentHistory(
    dbInstance,
    conversation.id,
    historyLimit
  );

  // Native tools call by their definition key, so key → install id resolves the
  // usage FK. Proxied definitions (http-endpoint, mcp-proxy) register MANY MCP
  // tools per row under names that aren't the definition key — `lookup-order`,
  // `github__search_repositories` — so we also map every derived call-name back
  // to its parent install. Without this those calls record artifactToolId=null
  // and the "Open in Tools" link can't navigate. Mirrors the MCP boot loop's
  // naming so the map matches what the model actually calls.
  const artifactToolIdByCallName = new Map<string, string>(
    artifactTools.map(t => [t.key, t.id])
  );
  // First registration wins on a name clash, mirroring the boot loop's dedupe
  // (it skips a name already claimed) so attribution matches what's exposed.
  const claimCallName = (name: string, id: string) => {
    if (!artifactToolIdByCallName.has(name)) {
      artifactToolIdByCallName.set(name, id);
    }
  };
  for (const t of artifactTools) {
    if (t.key === utils.constants.TOOL_DEFINITION_KEY_HTTP_ENDPOINT) {
      const cfg = t.config as { name?: unknown } | null;
      if (typeof cfg?.name === 'string') {
        claimCallName(cfg.name, t.id);
      }
    } else if (t.key === utils.constants.TOOL_DEFINITION_KEY_MCP_PROXY) {
      const cfg = t.config as {
        prefix?: unknown;
        allowedTools?: unknown;
      } | null;
      const prefix = typeof cfg?.prefix === 'string' ? cfg.prefix : 'mcp';
      // Empty/absent allowedTools = all discovered tools enabled (boot semantics).
      const allowed =
        Array.isArray(cfg?.allowedTools) && cfg.allowedTools.length > 0
          ? new Set(cfg.allowedTools as string[])
          : null;
      const meta = t.metadata as {
        discovery?: { tools?: Array<{ name?: unknown }> };
      } | null;
      for (const remote of meta?.discovery?.tools || []) {
        if (typeof remote?.name !== 'string') continue;
        if (allowed && !allowed.has(remote.name)) continue;
        const localName = utils.buildProxyToolName(prefix, remote.name);
        if (localName) claimCallName(localName, t.id);
      }
    }
  }

  // Resolves the remote connection details when the agent sends a proxied
  // resource as a file, so the resource-handler can read + send it directly.
  const resolveRemoteResource = buildRemoteResourceResolver(
    c,
    dbInstance,
    artifactTools
  );

  // Calendar tools share a fanned-out defaultTimeZone in their config; surface
  // it so the model can resolve "today" / "9am" in the user's zone.
  const hasCalendarTools = artifactTools.some(t =>
    t.key.startsWith(utils.constants.CALENDAR_TOOL_KEY_PREFIX)
  );
  let channelTimeZone: string | null = null;
  for (const t of artifactTools) {
    if (!t.key.startsWith(utils.constants.CALENDAR_TOOL_KEY_PREFIX)) continue;
    const cfg = t.config as Record<string, unknown> | null;
    const tz = cfg?.defaultTimeZone;
    if (typeof tz === 'string' && tz) {
      channelTimeZone = tz;
      break;
    }
  }

  const artifactResourceByUri = new Map(artifactResources.map(r => [r.uri, r]));
  const artifactResourceById = new Map(artifactResources.map(r => [r.id, r]));
  const artifactResourceIdByUri = new Map<string, string>(
    artifactResources.map(r => [r.uri, r.id])
  );

  // Mirror the global link onto this channel's participant row — re-derived
  // every turn, so it tracks linking, unlinking, and re-linking to another
  // account without staleness.
  const linkedUserId = linkedIdentity?.userId ?? null;
  if (participant.linkedUserId !== linkedUserId) {
    await dbInstance
      .update(db.schema.channelParticipant)
      .set({ linkedUserId })
      .where(eq(db.schema.channelParticipant.id, participant.id));
  }

  // Call MCP on behalf of the participant only when they have linked their
  // Ganju account AND are a member of this project — projects are isolated, so
  // org membership alone doesn't grant access. Otherwise fall back to the
  // channel's internal-secret access, so linking never downgrades a user.
  let mcpAuthToken: string | undefined;
  if (linkedIdentity) {
    const [projectMember] = await dbInstance
      .select({ userId: db.schema.projectUser.userId })
      .from(db.schema.projectUser)
      .where(
        and(
          eq(db.schema.projectUser.projectId, artifactRow.projectId),
          eq(db.schema.projectUser.userId, linkedIdentity.userId)
        )
      )
      .limit(1);

    if (projectMember) {
      mcpAuthToken = await mintBotToken(
        c,
        channelRow.platform,
        options.externalParticipantId,
        channelRow.id,
        artifactRow.slug
      );
    }
  }

  const mcp = await createMcpClient(c, artifactRow.slug, mcpAuthToken, {
    channelId: channelRow.id,
    platform: channelRow.platform
  });
  let assistantText = '';
  let assistantMessageId = '';
  let totalLatency = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  const attachments: ChannelAttachment[] = [];
  const usageEvents: UsageEvent[] = [];

  try {
    let llmTools: LlmToolDefinition[] = [];
    try {
      const toolsResponse = await mcp.client.listTools();
      llmTools = (toolsResponse.tools || []).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema || { type: 'object', properties: {} }
      }));
    } catch (error: any) {
      // -32601 = artifact has no tools registered; SDK never enabled tools/list
      if (error?.code !== -32601) throw error;
    }

    let userTurn: LlmMessage[] = [
      {
        role: utils.constants.ROLE_MESSAGE_USER,
        content: options.userText
      }
    ];

    if (options.promptId) {
      const start = Date.now();
      try {
        const promptResult = await mcp.client.getPrompt({
          name: options.promptId,
          arguments: options.promptArgs || {}
        });
        userTurn = (promptResult.messages || [])
          .map(m => {
            const content = m.content;
            const text =
              typeof content === 'string'
                ? content
                : content?.type === 'text' && typeof content.text === 'string'
                  ? content.text
                  : '';
            return {
              role:
                m.role === utils.constants.ROLE_MESSAGE_ASSISTANT
                  ? utils.constants.ROLE_MESSAGE_ASSISTANT
                  : utils.constants.ROLE_MESSAGE_USER,
              content: text
            } as LlmMessage;
          })
          .filter(m => m.content);
        if (userTurn.length === 0) {
          userTurn = [
            {
              role: utils.constants.ROLE_MESSAGE_USER,
              content: options.userText
            }
          ];
        }
        usageEvents.push({
          kind: utils.constants.USAGE_KIND_PROMPT,
          toolName: options.promptTitle || options.promptId,
          artifactToolId: null,
          artifactPromptId: options.promptArtifactId ?? null,
          input: options.promptArgs || {},
          output: promptResult,
          latencyMs: Date.now() - start
        });
      } catch (error: any) {
        usageEvents.push({
          kind: utils.constants.USAGE_KIND_PROMPT,
          toolName: options.promptTitle || options.promptId,
          artifactToolId: null,
          artifactPromptId: options.promptArtifactId ?? null,
          input: options.promptArgs || {},
          output: null,
          latencyMs: Date.now() - start,
          errorMessage: error?.message || String(error)
        });
      }
    }

    const messages: LlmMessage[] = [...history, ...userTurn];

    // The conversation must end with a user message — many models reject an
    // assistant-final request as an unsupported "prefill". A matched prompt can
    // legitimately expand to messages ending in an assistant turn (e.g. a
    // `/start` welcome that's a canned greeting, or a few-shot example), and
    // that expansion replaces the user's own text. Re-append the user's input
    // as the final turn so the model has something to respond to.
    const lastMessage = messages[messages.length - 1];
    if (
      lastMessage &&
      lastMessage.role === utils.constants.ROLE_MESSAGE_ASSISTANT
    ) {
      messages.push({
        role: utils.constants.ROLE_MESSAGE_USER,
        content: options.userText || 'Continue.'
      });
    }

    const adapter = getLlmAdapter(llmRow.provider);

    // Anchor the model in real time — channel clients don't inject "now", so
    // without this the model guesses today's date from its training prior.
    const contextParts = [
      `Current date and time: ${new Date().toISOString()}.`
    ];
    contextParts.push(
      channelTimeZone
        ? `The user's time zone is ${channelTimeZone}; resolve relative dates and times ("today", "tomorrow", "9am") in that zone.`
        : `Resolve relative dates and times in UTC unless the user specifies a zone.`
    );
    if (hasCalendarTools) {
      contextParts.push('Pass absolute ISO 8601 timestamps to calendar tools.');
    }
    const systemPrompt = [contextParts.join(' '), llmRow.systemPrompt]
      .filter(Boolean)
      .join('\n\n');

    for (let loop = 0; loop < maxToolLoops; loop++) {
      const start = Date.now();
      const completion = await adapter.complete({
        model: llmRow.model,
        baseUrl: llmRow.baseUrl,
        apiKey: apiKeyPlain,
        systemPrompt,
        messages,
        tools: llmTools,
        config: (llmRow.config as Record<string, unknown>) || null
      });
      totalLatency += Date.now() - start;
      totalTokensIn += completion.usage.tokensIn || 0;
      totalTokensOut += completion.usage.tokensOut || 0;

      if (completion.assistant.content) {
        assistantText += completion.assistant.content;
      }

      if (
        completion.stopReason !== 'tool_use' ||
        completion.assistant.toolCalls.length === 0
      ) {
        messages.push({
          role: utils.constants.ROLE_MESSAGE_ASSISTANT,
          content: completion.assistant.content,
          toolCalls: completion.assistant.toolCalls
        });
        break;
      }

      messages.push({
        role: utils.constants.ROLE_MESSAGE_ASSISTANT,
        content: completion.assistant.content,
        toolCalls: completion.assistant.toolCalls
      });

      // The model requested these tool calls together, so there's no ordering
      // dependency between them — run them concurrently to collapse N sequential
      // round-trips into one. We still append usage rows, attachments, and
      // tool-result messages in the original call order afterward so persisted
      // accounting and attachment delivery stay deterministic.
      const toolOutcomes = await Promise.all(
        completion.assistant.toolCalls.map(async call => {
          if (options.notifier && utils.getToolStatusMessage(call.name)) {
            await options.notifier
              .toolStarted({ toolName: call.name, arguments: call.arguments })
              .catch(() => undefined);
          }
          return executeToolCall(
            mcp.client,
            call,
            artifactToolIdByCallName,
            artifactResourceIdByUri,
            artifactResourceByUri,
            resolveRemoteResource
          );
        })
      );

      for (let i = 0; i < toolOutcomes.length; i++) {
        const call = completion.assistant.toolCalls[i];
        const { text, usageEvent, attachment } = toolOutcomes[i];
        usageEvents.push(usageEvent);
        if (attachment) attachments.push(attachment);
        messages.push({
          role: utils.constants.ROLE_MESSAGE_TOOL,
          content: text,
          toolCallId: call.id
        });
      }
    }
  } finally {
    await mcp.close().catch(() => undefined);
  }

  const sources = await collectSources(
    dbInstance,
    usageEvents,
    artifactResourceByUri,
    artifactResourceById
  );

  let sourcesFooter: string | null = null;
  let sourceButtons: SourceButton[] = [];
  if (sources.length > 0) {
    const apiUrl = utils.getEnv(c, 'NEXT_PUBLIC_API_URL') || '';
    if (apiUrl) {
      const ctx = {
        apiUrl,
        organizationId: projectRow.organizationId,
        projectId: projectRow.id
      };
      sourcesFooter = utils.formatSourcesAsMarkdown(sources, ctx);
      sourceButtons = utils.formatSourcesAsButtons(sources, ctx);
    }
  }

  const [assistantMessage] = await dbInstance
    .insert(db.schema.channelMessage)
    .values({
      role: utils.constants.ROLE_MESSAGE_ASSISTANT,
      content: assistantText,
      conversationId: conversation.id,
      participantId: participant.id,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      latencyMs: totalLatency,
      metadata: {
        ...(sources.length > 0 ? { sources } : {}),
        llm: {
          provider: llmRow.provider,
          model: llmRow.model,
          id: llmConfig.llmId,
          name: llmConfig.llmName
        }
      }
    })
    .returning();
  assistantMessageId = assistantMessage.id;

  // Count this assistant turn against the org's monthly budget synchronously.
  // This single cheap UPDATE is billing-grade — `checkMessageCap` reads it to
  // enforce the Free cap and the hourly meter reports it to Stripe as overage —
  // so it must not ride on waitUntil, which can silently drop work if the isolate
  // is evicted (dropping it lets Free bots overrun and under-reports revenue).
  // Best-effort still: a metering failure must never break delivery.
  await Plan.incrementMessageUsage(
    dbInstance,
    projectRow.organizationId
  ).catch(() => undefined);

  // Everything below is pure analytics — the usage/audit rows and the
  // denormalized display counters. The reply doesn't depend on any of it, so
  // flush it after the turn returns (via waitUntil) and answer the user without
  // waiting on these writes. The two message rows above stay synchronous on
  // purpose: the next turn rebuilds context by reading them back, so deferring
  // those could race a fast follow-up and drop the turn from history. Each
  // segment is best-effort and can't even be observed by the user.
  const flushBookkeeping = async () => {
    if (usageEvents.length > 0) {
      // The message-usage rows, the execution-audit rows, and the denormalized
      // counter bump are one logical accounting record for this turn — write
      // them in a transaction so a mid-sequence failure can't leave them
      // disagreeing.
      await dbInstance
        .transaction(async tx => {
          await tx.insert(db.schema.channelMessageUsage).values(
            usageEvents.map(event => ({
              kind: event.kind,
              toolName: event.toolName,
              artifactToolId: event.artifactToolId,
              artifactResourceId: event.artifactResourceId || null,
              artifactPromptId: event.artifactPromptId || null,
              input: event.input,
              output: event.output,
              latencyMs: event.latencyMs,
              errorMessage: event.errorMessage || null,
              messageId: assistantMessage.id
            }))
          );

          // Record the execution-audit rows for this channel turn: who (the
          // linked user when known, plus the external participant) ran which
          // tool/prompt or read which resource, and when. Source is the channel
          // platform. Resource rows are named by their URI (matching the MCP
          // path), not the generic read/send tool key.
          await tx.insert(db.schema.artifactExecution).values(
            usageEvents.map(event => ({
              artifactId: artifactRow.id,
              kind: event.kind,
              name:
                event.kind === utils.constants.USAGE_KIND_RESOURCE
                  ? event.resourceUri || event.toolName || null
                  : event.toolName || null,
              source: channelRow.platform,
              channelId: channelRow.id,
              userId: linkedUserId,
              externalActorId: participant.externalUserId,
              externalActorName: participant.displayName,
              artifactToolId: event.artifactToolId || null,
              artifactPromptId: event.artifactPromptId || null,
              artifactResourceId: event.artifactResourceId || null
            }))
          );

          // Mirror invocations into the artifact's denormalized usage totals so
          // the home view reads usage without aggregating usage rows.
          await db.incrementArtifactUsage(
            tx,
            artifactRow.id,
            utils.tallyUsageKinds(usageEvents)
          );
        })
        .catch(() => undefined);
    }

    await dbInstance
      .update(db.schema.channelConversation)
      .set({
        messageCount: sql`(${db.schema.channelConversation.messageCount}::int + 2)::int`,
        lastMessageAt: new Date()
      })
      .where(eq(db.schema.channelConversation.id, conversation.id))
      .catch(() => undefined);

    await dbInstance
      .update(db.schema.channel)
      .set({
        messageCount: sql`(${db.schema.channel.messageCount}::int + 2)::int`
      })
      .where(eq(db.schema.channel.id, channelRow.id))
      .catch(() => undefined);
  };

  c.executionCtx.waitUntil(flushBookkeeping());

  return {
    assistantText: assistantText || '...',
    conversationId: conversation.id,
    userMessageId: userMessage.id,
    assistantMessageId,
    attachments,
    sources,
    sourcesFooter,
    sourceButtons
  };
};

const upsertConversation = async (
  dbInstance: ReturnType<typeof db.create>,
  channelId: string,
  externalConversationId: string,
  title: string | null,
  scope: string
) => {
  const [existing] = await dbInstance
    .select()
    .from(db.schema.channelConversation)
    .where(
      and(
        eq(db.schema.channelConversation.channelId, channelId),
        eq(
          db.schema.channelConversation.externalConversationId,
          externalConversationId
        )
      )
    )
    .limit(1);

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (title && existing.title !== title) patch.title = title;
    if (existing.scope !== scope) patch.scope = scope;
    if (Object.keys(patch).length > 0) {
      const [updated] = await dbInstance
        .update(db.schema.channelConversation)
        .set(patch)
        .where(eq(db.schema.channelConversation.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }

  const [created] = await dbInstance
    .insert(db.schema.channelConversation)
    .values({
      channelId,
      externalConversationId,
      title,
      scope
    })
    .returning();

  await dbInstance
    .update(db.schema.channel)
    .set({
      conversationCount: sql`(${db.schema.channel.conversationCount}::int + 1)::int`
    })
    .where(eq(db.schema.channel.id, channelId));

  return created;
};

const upsertParticipant = async (
  dbInstance: ReturnType<typeof db.create>,
  channelId: string,
  externalUserId: string,
  displayName: string | null,
  metadata: Record<string, unknown> | null
) => {
  const [existing] = await dbInstance
    .select()
    .from(db.schema.channelParticipant)
    .where(
      and(
        eq(db.schema.channelParticipant.channelId, channelId),
        eq(db.schema.channelParticipant.externalUserId, externalUserId)
      )
    )
    .limit(1);

  if (existing) return existing;

  const [created] = await dbInstance
    .insert(db.schema.channelParticipant)
    .values({ channelId, externalUserId, displayName, metadata })
    .returning();
  return created;
};

const loadRecentHistory = async (
  dbInstance: ReturnType<typeof db.create>,
  conversationId: string,
  limit: number
): Promise<LlmMessage[]> => {
  const rows = await dbInstance
    .select()
    .from(db.schema.channelMessage)
    .where(eq(db.schema.channelMessage.conversationId, conversationId))
    .orderBy(sql`${db.schema.channelMessage.createdAt} DESC`)
    .limit(limit);

  return rows
    .filter(
      r =>
        r.role === utils.constants.ROLE_MESSAGE_USER ||
        r.role === utils.constants.ROLE_MESSAGE_ASSISTANT
    )
    .reverse()
    .map(r => ({
      role: r.role as 'user' | 'assistant',
      content: r.content || ''
    }));
};

const RESOURCE_TOOL_KEYS = new Set(utils.constants.RESOURCE_TOOL_KEYS);
const URI_BEARING_RESOURCE_TOOL_KEYS = new Set(
  utils.constants.URI_BEARING_RESOURCE_TOOL_KEYS
);

type RemoteResourceTarget = {
  url: string;
  transport: string;
  authHeader: { name: string; value: string } | null;
  timeoutMs: number;
};

// Resolve the remote MCP connection details for a proxied resource uri being
// sent as a file. Finds the enabled mcp-proxy install that exposes it and
// decrypts/refreshes its auth header — the only work the worker does; the
// resource-handler container then reads + sends the bytes. Returns null when no
// enabled install owns the uri (so the agent can't send a resource it can't
// even see via list-resources).
type RemoteResourceResolver = (
  uri: string
) => Promise<RemoteResourceTarget | null>;

const buildRemoteResourceResolver = (
  c: Context<AppEnv>,
  dbInstance: ReturnType<typeof db.create>,
  artifactTools: Array<{ key: string; config: unknown; metadata: unknown }>
): RemoteResourceResolver => {
  return async (uri: string) => {
    for (const t of artifactTools) {
      if (t.key !== utils.constants.TOOL_DEFINITION_KEY_MCP_PROXY) continue;
      const parsed = utils.Schema.MCP_PROXY_CONFIG.safeParse(t.config);
      if (!parsed.success) continue;
      const cfg = parsed.data;
      // Resources are opt-in: only ones in allowedResources are registered, so
      // only those are listable — and therefore sendable.
      if (!(cfg.allowedResources || []).includes(uri)) continue;
      // Confirm this install actually exposes the uri (dedupe order matches the
      // boot loop: first install that owns it wins).
      const meta = t.metadata as {
        discovery?: { resources?: Array<{ uri?: unknown }> };
      } | null;
      if (!(meta?.discovery?.resources || []).some(r => r?.uri === uri)) {
        continue;
      }

      let authHeader: { name: string; value: string } | null = null;
      if (cfg.auth.kind !== utils.constants.MCP_PROXY_AUTH_KIND_NONE) {
        const [credential] = await dbInstance
          .select()
          .from(db.schema.artifactCredential)
          .where(eq(db.schema.artifactCredential.id, cfg.auth.credentialId))
          .limit(1);
        if (!credential) return null;
        const { secret, needsReauth } =
          cfg.auth.kind === utils.constants.MCP_PROXY_AUTH_KIND_OAUTH
            ? await resolveMcpProxyOauthSecret({ c, dbInstance, credential })
            : await refreshArtifactCredential(c, dbInstance, credential);
        if (needsReauth || !secret) return null;
        authHeader =
          cfg.auth.kind === utils.constants.MCP_PROXY_AUTH_KIND_HEADER
            ? { name: cfg.auth.name, value: secret }
            : { name: 'Authorization', value: `Bearer ${secret}` };
      }

      return {
        url: cfg.url,
        transport: cfg.transport,
        authHeader,
        timeoutMs: cfg.timeoutMs
      };
    }
    return null;
  };
};

// Runs one tool call and returns its result text plus the accounting it
// produced (the usage event, and an attachment if the call sent a file). It no
// longer mutates shared arrays so calls within a turn can run concurrently; the
// caller appends the outcomes in call order to keep persistence deterministic.
type ToolCallOutcome = {
  text: string;
  usageEvent: UsageEvent;
  attachment?: ChannelAttachment;
};

const executeToolCall = async (
  client: Client,
  call: LlmToolCall,
  artifactToolIdByCallName: Map<string, string>,
  artifactResourceIdByUri: Map<string, string>,
  artifactResourceByUri: Map<string, ArtifactResourceRow>,
  resolveRemoteResource: RemoteResourceResolver
): Promise<ToolCallOutcome> => {
  const artifactToolId = artifactToolIdByCallName.get(call.name) || null;
  const isResourceTool = RESOURCE_TOOL_KEYS.has(call.name);
  const kind = isResourceTool
    ? utils.constants.USAGE_KIND_RESOURCE
    : utils.constants.USAGE_KIND_TOOL;
  const uri =
    URI_BEARING_RESOURCE_TOOL_KEYS.has(call.name) &&
    typeof call.arguments?.uri === 'string'
      ? (call.arguments.uri as string)
      : null;
  const artifactResourceId = uri
    ? artifactResourceIdByUri.get(uri) || null
    : null;
  let attachment: ChannelAttachment | undefined;
  const start = Date.now();
  try {
    // Bridge resources through the MCP client so the agent sees the FULL set the
    // server exposes (artifact + proxied GitHub/Notion), not just the native
    // list-resources/read-resource tools' artifact-only view.
    let result: unknown;
    if (call.name === utils.constants.RESOURCE_TOOL_KEY_LIST_RESOURCES) {
      let items: Array<{
        uri: string;
        title?: string;
        description?: string;
        mimeType?: string;
      }> = [];
      try {
        const listed = await client.listResources();
        items = (listed.resources || []).map(r => ({
          uri: r.uri,
          title: r.title || r.name,
          description: r.description,
          mimeType: r.mimeType
        }));
      } catch (err: any) {
        // -32601 = server registered no resources; an empty list is correct.
        if (err?.code !== -32601) throw err;
      }
      result = { content: [{ type: 'text', text: JSON.stringify(items) }] };
    } else if (
      call.name === utils.constants.RESOURCE_TOOL_KEY_READ_RESOURCE &&
      uri &&
      !artifactResourceByUri.has(uri)
    ) {
      // A proxied (remote) resource — read it through the client, which forwards
      // to the remote. Artifact resources keep the native path below (its binary
      // short-circuit + R2 reads).
      const read = await client.readResource({ uri });
      const text = (read.contents || [])
        .map(cnt =>
          'text' in cnt && typeof cnt.text === 'string'
            ? cnt.text
            : '[non-text content omitted]'
        )
        .join('\n');
      result = {
        content: [{ type: 'text', text: text || '(empty resource)' }]
      };
    } else if (
      call.name === utils.constants.RESOURCE_TOOL_KEY_SEND_RESOURCE &&
      uri &&
      !artifactResourceByUri.has(uri)
    ) {
      // A proxied (remote) resource. Don't read it here — resolve only the
      // remote connection details and queue them; the resource-handler reads,
      // decodes, and sends the file, so its bytes never transit this worker.
      // Artifact resources keep the native path below (R2 / row content).
      const target = await resolveRemoteResource(uri);
      const rawCaption = call.arguments?.caption;
      if (target) {
        attachment = {
          kind: 'remote-resource',
          uri,
          caption:
            typeof rawCaption === 'string' && rawCaption.trim()
              ? rawCaption.trim()
              : undefined,
          remote: target
        };
      }
      result = {
        content: [
          {
            type: 'text',
            text: target
              ? 'Queued for delivery.'
              : `That resource isn't available to send: ${uri}`
          }
        ]
      };
    } else {
      result = await client.callTool({
        name: call.name,
        arguments: call.arguments
      });
    }
    const latencyMs = Date.now() - start;
    const text = extractToolText(result);
    if (call.name === 'send-resource' && uri) {
      const resource = artifactResourceByUri.get(uri);
      if (resource) {
        const rawCaption = call.arguments?.caption;
        attachment = {
          kind: 'artifact',
          resource,
          caption:
            typeof rawCaption === 'string' && rawCaption.trim()
              ? rawCaption.trim()
              : undefined
        };
      }
    }
    return {
      text,
      attachment,
      usageEvent: {
        kind,
        toolName: call.name,
        resourceUri: uri,
        artifactToolId,
        artifactResourceId,
        input: call.arguments,
        output: result,
        latencyMs
      }
    };
  } catch (error: any) {
    const latencyMs = Date.now() - start;
    return {
      text: `Error calling tool ${call.name}: ${error?.message || error}`,
      usageEvent: {
        kind,
        toolName: call.name,
        resourceUri: uri,
        artifactToolId,
        artifactResourceId,
        input: call.arguments,
        output: null,
        latencyMs,
        errorMessage: error?.message || String(error)
      }
    };
  }
};
