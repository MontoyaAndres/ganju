import { Context } from 'hono';
import { eq, sql, and, gt, inArray, InferSelectModel } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

import { collectSources, selectCitedSources } from './sources';
import { transcribeVoiceNotes } from './voiceNotes';
import { replaceBufferedBatchRows } from './debounce';
import { extractToolText } from './toolText';
import {
  createMcpClient,
  getLlmAdapter,
  createAuth,
  refreshArtifactCredential,
  resolveMcpProxyOauthSecret,
  Plan
} from '../../utils';

import type {
  LlmMessage,
  LlmToolCall,
  LlmToolDefinition,
  Transcriber
} from '../../utils';
import type { AppEnv } from '../../types';
import type { VoiceNoteDownload, VoiceNoteTranscribers } from './voiceNotes';
import type {
  BufferedVoiceNote,
  ChannelNotifier,
  PendingToolConfirmation,
  PendingToolConfirmations,
  Source,
  SourceButton
} from '@ganju/utils';
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

// One inbound message from the user. A turn normally carries a single entry;
// a debounced burst carries the whole batch the participant typed before they
// paused. Each becomes its own channel_message row (the dashboard shows what
// was actually sent), and together they form one user turn for the model.
export interface RunUserMessage {
  text: string;
  externalMessageId?: string | null;
  // Written on this message's row only (a voice note's transcription).
  metadata?: Record<string, unknown> | null;
  // Audio sent with the message, transcribed by the turn when it runs.
  voice?: BufferedVoiceNote | null;
}

interface RunOptions {
  channelId: string;
  externalConversationId: string;
  conversationTitle?: string | null;
  conversationScope: string;
  externalParticipantId: string;
  participantDisplayName?: string | null;
  participantMetadata?: Record<string, unknown>;
  userMessages: RunUserMessage[];
  messageMetadata?: Record<string, unknown>;
  promptId?: string | null;
  // The artifact_prompt FK to record on usage. Null for proxied prompts, whose
  // promptId is an MCP name (`<prefix>__<remote>`), not an artifact_prompt id.
  promptArtifactId?: string | null;
  promptTitle?: string | null;
  promptArgs?: Record<string, string>;
  notifier?: ChannelNotifier;
  // The participant's language, for the fixed lines the runner writes itself
  // (the daily-limit notice). Falls back to what the participant metadata
  // carries (Telegram's language_code, Discord's locale).
  locale?: string | null;
  // How this platform fetches a voice note's audio. Without it voice notes
  // are recorded but not transcribed.
  downloadVoiceNote?: VoiceNoteDownload;
}

interface RunResult {
  assistantText: string;
  conversationId: string;
  // The last inbound row recorded for this turn — a debounced batch writes one
  // row per message, and this is the newest of them.
  userMessageId: string;
  assistantMessageId: string;
  attachments: ChannelAttachment[];
  sources: Source[];
  sourcesFooter: string | null;
  sourceButtons: SourceButton[];
  // `asked`: this reply asks the participant to confirm a sensitive action, so
  // the platform offers Yes/No buttons where it can. `answered`: this turn
  // closed such a question, so buttons left from it can go.
  confirmation: 'asked' | 'answered' | null;
  // Send nothing: the participant is past their daily limit and has already
  // been told. Answering every message of someone flooding the bot would
  // cost what the limit is there to save.
  silent?: boolean;
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

// What a turn has written so far, for marking it if it then fails.
interface TurnRecord {
  userMessages: Array<{ id: string; metadata: unknown }>;
  answered: boolean;
}

export const runChannelTurn = async (
  c: Context<AppEnv>,
  options: RunOptions
): Promise<RunResult> => {
  const record: TurnRecord = { userMessages: [], answered: false };
  try {
    return await runTurn(c, options, record);
  } catch (error) {
    // The platform tells the customer something went wrong, but nothing
    // answered these rows. Left unmarked, the next turn reads them as a request
    // still waiting and acts on it again — a failed "send an email" was sent
    // along with the next one.
    if (record.userMessages.length > 0 && !record.answered) {
      await markTurnFailed(db.create(c), record.userMessages).catch(
        () => undefined
      );
    }
    throw error;
  }
};

const runTurn = async (
  c: Context<AppEnv>,
  options: RunOptions,
  record: TurnRecord
): Promise<RunResult> => {
  if (
    !utils.constants.CHANNEL_CONVERSATION_SCOPES.includes(
      options.conversationScope as (typeof utils.constants.CHANNEL_CONVERSATION_SCOPES)[0]
    )
  ) {
    throw new Error(`Invalid conversationScope: ${options.conversationScope}`);
  }

  if (options.userMessages.length === 0) {
    throw new Error('runChannelTurn requires at least one user message');
  }

  const dbInstance = db.create(c);

  // Channel → artifact → project is a strict FK chain, so resolve all three in a
  // single joined round-trip instead of three sequential ones. Every turn pays
  // this before any model work, so the saved latency is pure overhead removed.
  const [chain] = await dbInstance
    .select({
      channel: db.schema.channel,
      artifact: db.schema.artifact,
      project: db.schema.project,
      requireToolConfirmation: db.schema.organization.requireToolConfirmation
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
    .innerJoin(
      db.schema.organization,
      eq(db.schema.organization.id, db.schema.project.organizationId)
    )
    .where(eq(db.schema.channel.id, options.channelId))
    .limit(1);

  if (!chain) throw new Error('Channel not found');

  const channelRow = chain.channel;
  const artifactRow = chain.artifact;
  const projectRow = chain.project;
  const participantDailyLimit = utils.resolveParticipantDailyLimit(
    channelRow.config
  );

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
    linkedIdentity,
    participantUsage
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
        key: db.schema.artifactTool.toolKey,
        config: db.schema.artifactTool.config,
        metadata: db.schema.artifactTool.metadata
      })
      .from(db.schema.artifactTool)
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
      .then(rows => rows[0]),
    participantDailyLimit === null
      ? Promise.resolve(null)
      : readParticipantUsage(
          dbInstance,
          channelRow.id,
          options.externalParticipantId
        )
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

  // Whether this turn reaches the model at all, decided before anything is
  // paid for: a voice note is only transcribed for a turn that will run.
  const overSharedHardCap =
    onSharedKey &&
    messageCap.sharedKeyHardCap != null &&
    messageCap.sharedUsed >= messageCap.sharedKeyHardCap;
  const overParticipantLimit =
    participantDailyLimit !== null &&
    !!participantUsage &&
    participantUsage.replies >= participantDailyLimit;
  const willRun =
    messageCap.allowed && !overSharedHardCap && !overParticipantLimit;

  // A re-sent batch whose earlier hand-off already transcribed a note gets
  // that transcript back: it was paid for and counted then.
  const priorTranscripts = c.get('bufferBatchTranscripts') || {};
  const reused = options.userMessages.map(
    message =>
      !!message.voice &&
      !!message.externalMessageId &&
      !!priorTranscripts[message.externalMessageId]
  );
  const pendingMessages = options.userMessages.map(
    (message, i): RunUserMessage => {
      if (!reused[i]) return message;
      const prior = priorTranscripts[message.externalMessageId as string];
      return {
        ...message,
        text: prior.text,
        voice: null,
        metadata: {
          ...message.metadata,
          [utils.VOICE_NOTE_METADATA_KEY]: prior.voiceNote
        }
      };
    }
  );

  // Voice notes become text: the transcript, after any caption sent with it.
  const userMessages: RunUserMessage[] =
    willRun && options.downloadVoiceNote
      ? await transcribeVoiceNotes(
          c,
          channelRow,
          pendingMessages,
          options.downloadVoiceNote,
          voiceNoteTranscribers(c, llmRow, apiKeyPlain, onSharedKey)
        )
      : pendingMessages.map(markVoiceNoteSkipped);

  // What the model is asked to answer: every buffered fragment as one user
  // turn. Recorded separately below, so the audit trail keeps the fragments
  // while the model sees a single coherent question.
  const mergedUserText = utils.joinBufferedMessages(userMessages);

  // Present when the turn came from the message buffer. Written on the turn's
  // rows so a re-sent batch can be told apart from a new one.
  const bufferBatchId = c.get('bufferBatchId');
  const userMetadata =
    options.messageMetadata || bufferBatchId
      ? {
          ...options.messageMetadata,
          ...(bufferBatchId ? { bufferBatchId } : {})
        }
      : null;

  // One row per message the user actually sent, in arrival order. The voice
  // notes this turn transcribed are counted in the same transaction: a re-sent
  // batch finds the rows and reuses their transcripts, so rows and count exist
  // together or not at all and a note is never counted twice. Tracked per
  // organization, never billed (the turn a note feeds is), so a counting
  // failure is held to a savepoint rather than losing the rows.
  const userMessageRows = await dbInstance.transaction(async tx => {
    // A re-sent batch's earlier rows go in the same transaction its own are
    // written in, so the record that its notes were counted is never missing.
    if (bufferBatchId) {
      await replaceBufferedBatchRows(tx, conversation.id, bufferBatchId);
    }
    const rows = await tx
      .insert(db.schema.channelMessage)
      .values(
        userMessages.map(message => ({
          role: utils.constants.ROLE_MESSAGE_USER,
          content: message.text,
          externalMessageId: message.externalMessageId || null,
          conversationId: conversation.id,
          participantId: participant.id,
          metadata:
            userMetadata || message.metadata
              ? { ...userMetadata, ...message.metadata }
              : null
        }))
      )
      .returning();
    await tx
      .transaction(savepoint =>
        Plan.incrementVoiceNoteUsage(
          savepoint,
          projectRow.organizationId,
          userMessages.filter((_, i) => !reused[i])
        )
      )
      .catch(() => undefined);
    return rows;
  });
  const userMessage = userMessageRows[userMessageRows.length - 1];
  record.userMessages = userMessageRows;

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
      sourceButtons: [],
      confirmation: null
    };
  }

  // Shared-model abuse backstop. A channel with no org LLM runs on OUR key and
  // OUR inference bill. Going past the plan's INCLUDED shared allowance is not
  // handled here — those turns keep running and meter at the shared overage
  // rate, because a paying customer whose bot goes silent is worse for both of
  // us than an invoice. This gate is only the far outer limit, set where the
  // traffic can no longer be a real business using the product.
  //
  // Measured against `sharedUsed`, NOT the org total: own-key turns cost us no
  // inference, so letting them count here would penalise a mixed org for traffic
  // we never paid for. Free never reaches this line — its hard total cap is the
  // same number, so `messageCap.allowed` fails first.
  //
  // The reply below is read by whoever is chatting with the bot — a stranger, not
  // the owner — so keep it neutral: no plan details, no billing instructions they
  // can't act on. The actionable prompt lives in the owner's billing dashboard
  // (Settings › Billing) instead.
  if (overSharedHardCap) {
    return {
      assistantText:
        'This assistant is temporarily unavailable. Please check back later.',
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      assistantMessageId: '',
      attachments: [],
      sources: [],
      sourcesFooter: null,
      sourceButtons: [],
      confirmation: null
    };
  }

  // The fixed lines below are written by the runner, not the model, in the
  // participant's language where the platform says it.
  const participantMeta = (options.participantMetadata || {}) as {
    languageCode?: unknown;
    locale?: unknown;
  };
  const locale =
    options.locale ??
    (typeof participantMeta.languageCode === 'string'
      ? participantMeta.languageCode
      : typeof participantMeta.locale === 'string'
        ? participantMeta.locale
        : null);
  const fixedReply = (assistantText: string, assistantMessageId: string) => ({
    assistantText,
    assistantMessageId,
    conversationId: conversation.id,
    userMessageId: userMessage.id,
    attachments: [],
    sources: [],
    sourcesFooter: null,
    sourceButtons: [],
    confirmation: null
  });

  // One customer past their replies for the day. Each time they reach the
  // limit they are told once, in a row the limit doesn't count; after that the
  // bot stays quiet until the oldest reply in the window ages out. Nothing here
  // is billed: no model runs and the message budget isn't touched.
  if (overParticipantLimit) {
    const notice = utils.participantLimitNotice(locale);
    const noticeId = await claimParticipantLimitNotice(
      dbInstance,
      participant.id,
      {
        role: utils.constants.ROLE_MESSAGE_ASSISTANT,
        content: notice,
        conversationId: conversation.id,
        participantId: participant.id,
        metadata: {
          [utils.PARTICIPANT_LIMIT_METADATA_KEY]: participantDailyLimit,
          ...(bufferBatchId ? { bufferBatchId } : {})
        }
      }
    );
    if (!noticeId) return { ...fixedReply('', ''), silent: true };
    return fixedReply(notice, noticeId);
  }

  // Only voice notes that couldn't be used, and nothing typed: ask for the
  // message in writing — or in shorter parts, when a note was too long.
  // Recorded, so the owner sees what happened in the conversation; not billed.
  const voiceNotes = userMessages
    .map(
      message =>
        message.metadata?.[utils.VOICE_NOTE_METADATA_KEY] as
          | { transcribed?: unknown; tooLong?: unknown }
          | undefined
    )
    .filter(Boolean);
  if (
    !mergedUserText.trim() &&
    voiceNotes.some(note => note?.transcribed === false)
  ) {
    const tooLong = voiceNotes.some(note => note?.tooLong === true);
    const notice = tooLong
      ? utils.voiceNoteTooLongNotice(locale)
      : utils.voiceNoteUnreadableNotice(locale);
    const [noticeRow] = await dbInstance
      .insert(db.schema.channelMessage)
      .values({
        role: utils.constants.ROLE_MESSAGE_ASSISTANT,
        content: notice,
        conversationId: conversation.id,
        participantId: participant.id,
        metadata: {
          [utils.VOICE_NOTE_UNREADABLE_METADATA_KEY]: tooLong
            ? 'too_long'
            : true,
          ...(bufferBatchId ? { bufferBatchId } : {})
        }
      })
      .returning({ id: db.schema.channelMessage.id });
    return fixedReply(notice, noticeRow.id);
  }

  // A sensitive call this participant was asked to confirm last turn. It is
  // claimed now whatever the reply says — a yes runs it, anything else drops
  // it — so a question is answered at most once. Claimed by id, so a buffer
  // batch sent twice can't run the same calls twice.
  const answered = await claimPendingConfirmation(
    dbInstance,
    conversation,
    participant.id,
    // A slash command is a new request, never an answer.
    !options.promptId && utils.isConfirmationReply(mergedUserText)
  );
  const confirmedCalls =
    answered?.outcome === 'confirmed' ? answered.calls : [];

  // custom-code registers one MCP tool per entry in its ACTIVE VERSION's
  // manifest, and that manifest lives in its own table rather than on the
  // install row — so unlike the other two proxied definitions, its call-names
  // can't be derived from the rows already loaded. An artifact with no
  // published custom code issues no query at all.
  const customCodeVersionIds = artifactTools
    .filter(t => t.key === utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE)
    .map(
      t => (t.config as { activeVersionId?: unknown } | null)?.activeVersionId
    )
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  // Loaded after the user-message insert so it reflects this turn, matching the
  // prior ordering — but the rows just written are excluded, because they're
  // already the user turn appended below. Without that a debounced batch would
  // reach the model twice: once as history, once as the question.
  //
  // Paired with the manifest read above, which the turn would otherwise wait on
  // separately: history is on the critical path either way, so attribution for
  // custom tools costs no extra latency.
  const [history, customCodeVersions] = await Promise.all([
    loadRecentHistory(
      dbInstance,
      conversation.id,
      historyLimit,
      new Set(userMessageRows.map(row => row.id))
    ),
    customCodeVersionIds.length > 0
      ? dbInstance
          .select({
            id: db.schema.artifactToolVersion.id,
            tools: db.schema.artifactToolVersion.tools
          })
          .from(db.schema.artifactToolVersion)
          .where(
            inArray(db.schema.artifactToolVersion.id, customCodeVersionIds)
          )
      : Promise.resolve([] as Array<{ id: string; tools: unknown }>)
  ]);

  const customCodeToolsByVersionId = new Map(
    customCodeVersions.map(v => [v.id, v.tools])
  );

  // Native tools call by their definition key, so key → install id resolves the
  // usage FK. Proxied definitions (http-endpoint, mcp-proxy, custom-code)
  // register MANY MCP tools per row under names that aren't the definition
  // key — `lookup-order`, `github__search_repositories` — so we also map every
  // derived call-name back to its parent install. Without this those calls
  // record artifactToolId=null and the "Open in Tools" link can't navigate.
  // Mirrors the MCP boot loop's naming so the map matches what the model
  // actually calls.
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
  // Whether each proxied tool is confirmed, decided from the install's config
  // and the discovered hints by the same helper the MCP server registers it
  // with — so this never rests on the listed annotations alone, and the two
  // can't drift.
  const proxiedToolSensitive = new Map<string, boolean>();
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
        trustAnnotations?: unknown;
        readOnlyTools?: unknown;
      } | null;
      const prefix = typeof cfg?.prefix === 'string' ? cfg.prefix : 'mcp';
      // Empty/absent allowedTools = all discovered tools enabled (boot semantics).
      const allowed =
        Array.isArray(cfg?.allowedTools) && cfg.allowedTools.length > 0
          ? new Set(cfg.allowedTools as string[])
          : null;
      const meta = t.metadata as {
        discovery?: {
          tools?: Array<{
            name?: unknown;
            annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
          }>;
        };
      } | null;
      for (const remote of meta?.discovery?.tools || []) {
        if (typeof remote?.name !== 'string') continue;
        if (allowed && !allowed.has(remote.name)) continue;
        const localName = utils.buildProxyToolName(prefix, remote.name);
        if (!localName) continue;
        claimCallName(localName, t.id);
        // Only where this install owns the name, as the boot loop registers it.
        if (artifactToolIdByCallName.get(localName) === t.id) {
          proxiedToolSensitive.set(
            localName,
            utils.isSensitiveProxiedTool(
              remote.annotations,
              utils.proxiedToolTrust(cfg, remote.name)
            )
          );
        }
      }
    } else if (t.key === utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE) {
      // The manifest is the same row the MCP boot loop registers from, so the
      // names here are exactly the ones exposed — no prefixing or derivation.
      // A row whose active version was rolled back or deleted between boot and
      // now simply contributes nothing, the same as an install with no
      // published version.
      const cfg = t.config as { activeVersionId?: unknown } | null;
      const versionId =
        typeof cfg?.activeVersionId === 'string' ? cfg.activeVersionId : null;
      const manifest = versionId
        ? customCodeToolsByVersionId.get(versionId)
        : null;
      if (!Array.isArray(manifest)) continue;
      for (const entry of manifest) {
        const name = (entry as { name?: unknown } | null)?.name;
        if (typeof name === 'string' && name) claimCallName(name, t.id);
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

  // Scheduling tools need the model to resolve "today" / "9am" before it calls
  // anything — by the time a handler runs, the instant is already chosen. So the
  // zone goes in the system prompt.
  //
  // Cal.com counts here as much as Google Calendar does. An earlier version
  // checked only the `calendar-` prefix, so an artifact that booked exclusively
  // through Cal.com got neither the zone nor the ISO-8601 instruction below.
  const isSchedulingTool = (key: string): boolean =>
    key.startsWith(utils.constants.CALENDAR_TOOL_KEY_PREFIX) ||
    key.startsWith(utils.constants.CALCOM_TOOL_KEY_PREFIX);
  const schedulingTools = artifactTools.filter(t => isSchedulingTool(t.key));
  const hasCalendarTools = schedulingTools.length > 0;

  let channelTimeZone: string | null = null;
  for (const t of schedulingTools) {
    const cfg = t.config as Record<string, unknown> | null;
    const tz = cfg?.defaultTimeZone;
    if (typeof tz === 'string' && tz) {
      channelTimeZone = tz;
      break;
    }
  }

  // Nothing configured in our dashboard, which is the ordinary case — that
  // field is only written when someone opens the dropdown and changes it. Fall
  // back to the zone the user configured with the vendor, cached on the
  // connection by the tool handlers. Read, never fetched: a chat turn must not
  // wait on Google or Cal.com to answer before the model starts thinking.
  if (!channelTimeZone && hasCalendarTools) {
    const providers = Array.from(
      new Set(
        schedulingTools
          .map(t =>
            t.key.startsWith(utils.constants.CALENDAR_TOOL_KEY_PREFIX)
              ? utils.constants.OAUTH_PROVIDER_GOOGLE_CALENDAR
              : utils.constants.API_KEY_PROVIDER_CALCOM
          )
          .filter(Boolean)
      )
    );
    if (providers.length > 0) {
      const credentialRows = await dbInstance
        .select({ metadata: db.schema.artifactCredential.metadata })
        .from(db.schema.artifactCredential)
        .where(
          and(
            eq(db.schema.artifactCredential.artifactId, artifactRow.id),
            inArray(db.schema.artifactCredential.provider, providers)
          )
        );
      for (const row of credentialRows) {
        const cached = utils.readCredentialTimeZone(row.metadata);
        if (cached) {
          channelTimeZone = cached;
          break;
        }
      }
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
    platform: channelRow.platform,
    conversationId: conversation.id
  });
  let assistantText = '';
  let assistantMessageId = '';
  let totalLatency = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  const attachments: ChannelAttachment[] = [];
  const usageEvents: UsageEvent[] = [];
  // The tools the MCP server registered as destructive. This turn asks before
  // running them when the organization confirms actions, or once a tool has
  // brought outside content into the turn — an email or a web page may have
  // been written to steer the model into exactly that call.
  const sensitiveToolNames = new Set<string>();
  // Whether a tool brought outside content in during this turn. A turn soon
  // after one that did is treated the same: the reply built on that content
  // is in the history this turn reads.
  let readUntrusted = false;
  const untrustedCarried = utils.conversationReadUntrustedRecently(
    conversation.metadata
  );
  // How the confirmation summary names a tool: its title, else its name.
  const toolTitles = new Map<string, string>();
  // Sensitive calls the model made this turn, held for the participant's yes.
  const heldCalls: LlmToolCall[] = [];

  // What the bot remembers about this customer. Only in a private
  // conversation: in a group the bot would read one member's address or
  // allergies out to everyone.
  const memoryEnabled =
    utils.resolveParticipantMemoryEnabled(channelRow.config) &&
    options.conversationScope ===
      utils.constants.CHANNEL_CONVERSATION_SCOPE_PRIVATE;
  // What the prompt shows is read once, here; a save applies to what is
  // stored when it runs, under a row lock, so an owner's "Forget" during the
  // turn isn't undone and two turns at once don't overwrite each other.
  const memory = utils.readParticipantMemory(participant.memory);
  const rememberCustomer = async (
    call: LlmToolCall
  ): Promise<ToolCallOutcome> => {
    const start = Date.now();
    const result = await dbInstance
      .transaction(async tx => {
        const [row] = await tx
          .select({ memory: db.schema.channelParticipant.memory })
          .from(db.schema.channelParticipant)
          .where(eq(db.schema.channelParticipant.id, participant.id))
          .for('update');
        const update = utils.applyParticipantMemoryUpdate(
          utils.readParticipantMemory(row?.memory),
          call.arguments
        );
        if (update.changed) {
          await tx
            .update(db.schema.channelParticipant)
            .set({ memory: update.memory })
            .where(eq(db.schema.channelParticipant.id, participant.id));
        }
        return update.result;
      })
      .catch(
        (error: any) => `Error saving: ${error?.message || String(error)}`
      );
    return {
      text: result,
      usageEvent: {
        kind: utils.constants.USAGE_KIND_TOOL,
        toolName: call.name,
        artifactToolId: null,
        // Which facts changed, not what they say: usage rows outlive a
        // "Forget", and these are a customer's address and health details.
        input: utils.redactParticipantMemoryArgs(call.arguments),
        output: { content: [{ type: 'text', text: result }] },
        latencyMs: Date.now() - start,
        ...(result.startsWith('Error') ? { errorMessage: result } : {})
      }
    };
  };

  // Every call one model step asked for, run together — there's no ordering
  // dependency between them — so N round-trips collapse into one. The caller
  // appends the outcomes in call order to keep accounting deterministic.
  const runToolCalls = (calls: LlmToolCall[]) =>
    Promise.all(
      calls.map(async call => {
        if (options.notifier && utils.getToolStatusMessage(call.name)) {
          await options.notifier
            .toolStarted({ toolName: call.name, arguments: call.arguments })
            .catch(() => undefined);
        }
        if (memoryEnabled && call.name === utils.PARTICIPANT_MEMORY_TOOL_NAME) {
          return rememberCustomer(call);
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

  try {
    let llmTools: LlmToolDefinition[] = [];
    try {
      const toolsResponse = await mcp.client.listTools();
      for (const tool of toolsResponse.tools || []) {
        if (
          proxiedToolSensitive.get(tool.name) ??
          utils.isSensitiveTool(tool.annotations)
        ) {
          sensitiveToolNames.add(tool.name);
        }
        toolTitles.set(
          tool.name,
          tool.title || tool.annotations?.title || tool.name
        );
      }
      llmTools = (toolsResponse.tools || []).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema || { type: 'object', properties: {} }
      }));

      // Every tool's schema is re-sent on every model call, and a turn makes
      // several — so the tool list, not the conversation, is what actually
      // drives input tokens (see CHANNEL_MAX_TOOLS). Cap what a channel turn
      // exposes: it bounds our per-turn cost on shared-key turns and improves
      // tool selection, which degrades past a few dozen options anyway.
      //
      // The RAG core is pinned to the front rather than left to list order,
      // because the runner intercepts those tools BY NAME below — dropping
      // `send-resource` in particular would silently remove the only path that
      // streams a file to the user. Everything else keeps its listTools order,
      // which mirrors the artifact's own tool order, so the cut is predictable
      // for the owner rather than arbitrary.
      if (llmTools.length > utils.constants.CHANNEL_MAX_TOOLS) {
        const core = llmTools.filter(t => RESOURCE_TOOL_KEYS.has(t.name));
        const rest = llmTools.filter(t => !RESOURCE_TOOL_KEYS.has(t.name));
        const kept = [...core, ...rest].slice(
          0,
          utils.constants.CHANNEL_MAX_TOOLS
        );
        // Never truncate silently — the owner sees a bot ignoring tools it has
        // installed, and this log is the only thing that explains why.
        console.warn(
          `[channel] artifact ${artifactRow.slug}: ${llmTools.length} tools exceeds the ${utils.constants.CHANNEL_MAX_TOOLS}-tool channel cap; dropping ${llmTools
            .filter(t => !kept.includes(t))
            .map(t => t.name)
            .join(', ')}`
        );
        llmTools = kept;
      }
    } catch (error: any) {
      // -32601 = artifact has no tools registered; SDK never enabled tools/list
      if (error?.code !== -32601) throw error;
    }

    // Outside the channel cap: it is the runner's own tool, not the
    // artifact's, and a name an artifact tool can't take (reserved).
    if (memoryEnabled) {
      // How a held save is named under the confirmation question.
      toolTitles.set(
        utils.PARTICIPANT_MEMORY_TOOL_NAME,
        'Remember customer details'
      );
      llmTools = [
        ...llmTools.filter(t => t.name !== utils.PARTICIPANT_MEMORY_TOOL_NAME),
        {
          name: utils.PARTICIPANT_MEMORY_TOOL_NAME,
          description: utils.PARTICIPANT_MEMORY_TOOL_DESCRIPTION,
          inputSchema: utils.PARTICIPANT_MEMORY_TOOL_SCHEMA
        }
      ];
    }

    let userTurn: LlmMessage[] = [
      {
        role: utils.constants.ROLE_MESSAGE_USER,
        content: mergedUserText
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
              content: mergedUserText
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
        content: mergedUserText || 'Continue.'
      });
    }

    // The participant said yes to the calls held last turn. They run now,
    // exactly as they were asked about, and the model sees them as its own
    // calls with their results — so it answers "done" (or reports the error)
    // in its own words, without a chance to change what was confirmed.
    if (confirmedCalls.length > 0) {
      const outcomes = await runToolCalls(confirmedCalls);
      messages.push({
        role: utils.constants.ROLE_MESSAGE_ASSISTANT,
        content: '',
        toolCalls: confirmedCalls
      });
      outcomes.forEach(({ text, usageEvent, attachment, untrusted }, i) => {
        usageEvents.push(usageEvent);
        if (attachment) attachments.push(attachment);
        if (untrusted) readUntrusted = true;
        messages.push({
          role: utils.constants.ROLE_MESSAGE_TOOL,
          content: text,
          toolCallId: confirmedCalls[i].id
        });
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
    // Not "absolute timestamps": asked for those, models wrote the user's
    // local hour with a `Z`, and events landed hours off. Each tool's
    // parameters say which form it takes — event start/end are local times.
    if (hasCalendarTools) {
      contextParts.push(
        "Pass times to calendar tools in the form each tool's parameters describe; a time the user names is in their time zone."
      );
    }
    // Models that ask before acting on their own (Claude does) would
    // otherwise ask once in their words, then again through the runner once
    // the call is made — two questions for one action.
    if (chain.requireToolConfirmation && sensitiveToolNames.size > 0) {
      contextParts.push(utils.constants.TOOL_CONFIRMATION_SYSTEM_NOTE);
    }
    if (llmTools.length > 0) {
      contextParts.push(utils.UNTRUSTED_CONTENT_NOTE);
    }
    const systemPrompt = [
      contextParts.join(' '),
      memoryEnabled
        ? utils.formatParticipantMemoryPrompt(memory)
        : // Memory is on but this is a group: without the tool, a model asked
          // to remember something says it did.
          utils.resolveParticipantMemoryEnabled(channelRow.config)
          ? utils.PARTICIPANT_MEMORY_GROUP_NOTE
          : null,
      llmRow.systemPrompt
    ]
      .filter(Boolean)
      .join('\n\n');

    const complete = async (
      toolChoice?: 'none',
      stepSystemPrompt: string = systemPrompt
    ) => {
      const start = Date.now();
      const completion = await adapter.complete({
        model: llmRow.model,
        baseUrl: llmRow.baseUrl,
        apiKey: apiKeyPlain,
        systemPrompt: stepSystemPrompt,
        messages,
        tools: llmTools,
        toolChoice,
        config: (llmRow.config as Record<string, unknown>) || null
      });
      totalLatency += Date.now() - start;
      totalTokensIn += completion.usage.tokensIn || 0;
      totalTokensOut += completion.usage.tokensOut || 0;

      if (completion.assistant.content) {
        assistantText += completion.assistant.content;
      }
      return completion;
    };

    for (let loop = 0; loop < maxToolLoops; loop++) {
      const completion = await complete();

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

      // A sensitive call doesn't run: it is held for the participant's yes,
      // and the model is told to ask for it. The rest of the step runs as
      // usual. A call repeated within the step is held once — confirming it
      // must not run it twice.
      const stepCalls = completion.assistant.toolCalls;
      // Saving to memory counts as sensitive once outside content is in the
      // turn: text hidden in a page or document could otherwise plant a
      // "fact" (a fake discount) in every later prompt for this customer. A
      // fact that itself reads like instructions asks first too, whoever
      // wrote it.
      const untrusted = readUntrusted || untrustedCarried;
      const isHeld = (call: LlmToolCall) =>
        (sensitiveToolNames.has(call.name) &&
          (chain.requireToolConfirmation || untrusted)) ||
        (memoryEnabled &&
          call.name === utils.PARTICIPANT_MEMORY_TOOL_NAME &&
          (untrusted ||
            utils.participantMemoryUpdateReadsLikeInstructions(
              call.arguments
            )));
      for (const call of stepCalls.filter(isHeld)) {
        const signature = callSignature(call);
        if (!heldCalls.some(held => callSignature(held) === signature)) {
          heldCalls.push(call);
        }
      }
      const runnable = stepCalls.filter(call => !isHeld(call));
      const outcomes = await runToolCalls(runnable);
      const outcomeById = new Map(
        runnable.map((call, i) => [call.id, outcomes[i]])
      );

      for (const call of stepCalls) {
        const outcome = outcomeById.get(call.id);
        if (outcome) {
          usageEvents.push(outcome.usageEvent);
          if (outcome.attachment) attachments.push(outcome.attachment);
          if (outcome.untrusted) readUntrusted = true;
        }
        messages.push({
          role: utils.constants.ROLE_MESSAGE_TOOL,
          content: outcome
            ? outcome.text
            : utils.constants.TOOL_CONFIRMATION_REQUIRED_RESULT,
          toolCallId: call.id
        });
      }

      // Once a call is held, the turn only asks. A model left to carry on
      // tends to "fix" the held call with a second one, and a yes would then
      // run both — so one last step writes the question, with no tools.
      // The tool result alone doesn't stop every model from announcing the
      // action as done (and inventing its result), so this step's system
      // prompt says it too, naming the actions.
      if (heldCalls.length > 0) {
        const pendingNames = [
          ...new Set(
            heldCalls.map(call => toolTitles.get(call.name) || call.name)
          )
        ].join(', ');
        await complete(
          'none',
          [
            systemPrompt,
            utils.constants.TOOL_CONFIRMATION_ASK_INSTRUCTION.replace(
              '{{actions}}',
              pendingNames
            )
          ].join('\n\n')
        );
        break;
      }
    }
  } finally {
    await mcp.close().catch(() => undefined);
  }

  // Under the model's question, what a yes actually runs — written from the
  // stored calls, not by the model. Kept on the message's metadata too, so
  // history can hand the model its question without it (see
  // loadRecentHistory).
  const confirmationSummary =
    heldCalls.length > 0
      ? utils.formatConfirmationSummary(
          heldCalls,
          name => toolTitles.get(name) || name
        )
      : null;
  if (confirmationSummary) {
    assistantText = [
      assistantText.trim() ||
        utils.constants.TOOL_CONFIRMATION_FALLBACK_QUESTION,
      confirmationSummary
    ].join('\n\n');
  }

  const sources = selectCitedSources(
    await collectSources(
      dbInstance,
      usageEvents,
      artifactResourceByUri,
      artifactResourceById
    ),
    assistantText
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
        ...(bufferBatchId ? { bufferBatchId } : {}),
        // What this turn asked the participant to confirm, and what became of
        // the question they were asked last turn: run on their yes, dropped
        // on anything else, or dropped because the yes came too late — the
        // conversation view's record of who approved what.
        ...(heldCalls.length > 0 || answered
          ? {
              toolConfirmation: {
                ...(heldCalls.length > 0
                  ? {
                      requested: heldCalls.map(toConfirmationCall),
                      summary: confirmationSummary
                    }
                  : {}),
                ...(answered
                  ? {
                      [answered.outcome]: answered.calls.map(toConfirmationCall)
                    }
                  : {})
              }
            }
          : {}),
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
  record.answered = true;

  // Open the question only once the reply asking it is recorded, so the
  // participant can't answer a question they haven't been shown. It sits
  // beside other participants' open questions — never over them — and
  // questions past their time are swept out on the way.
  if (heldCalls.length > 0) {
    const pending: PendingToolConfirmation = {
      id: crypto.randomUUID(),
      participantId: participant.id,
      createdAt: new Date().toISOString(),
      calls: heldCalls.map(toConfirmationCall)
    };
    const column = db.schema.channelConversation.pendingToolConfirmation;
    await dbInstance
      .update(db.schema.channelConversation)
      .set({
        pendingToolConfirmation: sql`((
          SELECT coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
          FROM jsonb_each(coalesce(${column}::jsonb, '{}'::jsonb)) AS entry
          WHERE (entry.value ->> 'createdAt')::timestamptz
            > now() - interval '${sql.raw(String(utils.constants.TOOL_CONFIRMATION_TTL_MS))} milliseconds'
        ) || jsonb_build_object(${participant.id}::text, ${JSON.stringify(pending)}::jsonb))::json`
      })
      .where(eq(db.schema.channelConversation.id, conversation.id));
  }

  // Remember that this conversation read outside content, so the next turns
  // in the window ask before sensitive calls too. Merged in SQL, so other
  // keys on the metadata are kept. Best-effort: losing it only shortens the
  // window to this turn, which is how it was before.
  if (readUntrusted) {
    const metadataColumn = db.schema.channelConversation.metadata;
    await dbInstance
      .update(db.schema.channelConversation)
      .set({
        metadata: sql`(coalesce(${metadataColumn}::jsonb, '{}'::jsonb) || jsonb_build_object(${utils.CONVERSATION_UNTRUSTED_READ_AT_KEY}::text, ${new Date().toISOString()}::text))::json`
      })
      .where(eq(db.schema.channelConversation.id, conversation.id))
      .catch(() => undefined);
  }

  // Count this assistant turn against the org's monthly budget synchronously.
  // This single cheap UPDATE is billing-grade — `checkMessageCap` reads it to
  // enforce the Free cap and the hourly meter reports it as overage —
  // so it must not ride on waitUntil, which can silently drop work if the isolate
  // is evicted (dropping it lets Free bots overrun and under-reports revenue).
  // Best-effort still: a metering failure must never break delivery.
  await Plan.incrementMessageUsage(
    dbInstance,
    projectRow.organizationId,
    onSharedKey
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

    // The inbound rows plus the one assistant reply. A debounced batch writes
    // more than one inbound row, so this can't assume the old fixed +2.
    const recordedMessages = userMessageRows.length + 1;

    await dbInstance
      .update(db.schema.channelConversation)
      .set({
        messageCount: sql`(${db.schema.channelConversation.messageCount}::int + ${recordedMessages})::int`,
        lastMessageAt: new Date()
      })
      .where(eq(db.schema.channelConversation.id, conversation.id))
      .catch(() => undefined);

    await dbInstance
      .update(db.schema.channel)
      .set({
        messageCount: sql`(${db.schema.channel.messageCount}::int + ${recordedMessages})::int`
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
    sourceButtons,
    confirmation: heldCalls.length > 0 ? 'asked' : answered ? 'answered' : null
  };
};

const toConfirmationCall = (
  call: LlmToolCall
): PendingToolConfirmation['calls'][number] => ({
  id: call.id,
  name: call.name,
  arguments: call.arguments
});

// Two calls that would do the same thing: same tool, same arguments.
const callSignature = (call: LlmToolCall): string =>
  `${call.name}:${utils.stableJson(call.arguments ?? {})}`;

// This participant's open question, if the conversation holds one for them.
const readPendingConfirmation = (
  value: unknown,
  participantId: string
): PendingToolConfirmation | null => {
  const open = value as PendingToolConfirmations | null;
  const pending = (
    open && typeof open === 'object' ? open[participantId] : null
  ) as Partial<PendingToolConfirmation> | null | undefined;
  if (
    !pending ||
    typeof pending.id !== 'string' ||
    pending.participantId !== participantId ||
    typeof pending.createdAt !== 'string' ||
    !Array.isArray(pending.calls)
  ) {
    return null;
  }
  return pending as PendingToolConfirmation;
};

/**
 * Close the question this participant was asked, if there is one, and say how
 * it ended: `confirmed` (the calls to run), `declined` (anything but a yes) or
 * `expired` (a yes that came too late). Null when there was nothing to close.
 *
 * The UPDATE is the claim. It removes the question only if it is still the
 * same one, and only the request that removed it may run the calls — a buffer
 * batch delivered twice, or two messages racing, can't both act on one yes.
 * Other participants' questions are left as they are.
 */
const claimPendingConfirmation = async (
  dbInstance: ReturnType<typeof db.create>,
  conversation: { id: string; pendingToolConfirmation: unknown },
  participantId: string,
  confirmed: boolean
): Promise<{
  outcome: 'confirmed' | 'declined' | 'expired';
  calls: LlmToolCall[];
} | null> => {
  const pending = readPendingConfirmation(
    conversation.pendingToolConfirmation,
    participantId
  );
  if (!pending) return null;

  const column = db.schema.channelConversation.pendingToolConfirmation;
  const claimed = await dbInstance
    .update(db.schema.channelConversation)
    .set({
      pendingToolConfirmation: sql`(${column}::jsonb - ${participantId}::text)::json`
    })
    .where(
      and(
        eq(db.schema.channelConversation.id, conversation.id),
        sql`((${column}::jsonb -> ${participantId}::text) ->> 'id') = ${pending.id}`
      )
    )
    .returning({ id: db.schema.channelConversation.id });
  if (claimed.length === 0) return null;

  const calls = pending.calls.map(call => ({
    id: call.id,
    name: call.name,
    arguments: call.arguments ?? {},
    // These calls are replayed into a new turn, where Gemini requires every
    // function call to carry a thought signature. The one from the turn that
    // made the call belongs to that turn's context, so the placeholder Google
    // documents for injected calls is used instead. Other providers ignore it.
    metadata: { thoughtSignature: 'skip_thought_signature_validator' }
  }));
  if (!confirmed) return { outcome: 'declined', calls };
  const inTime =
    Date.now() - Date.parse(pending.createdAt) <
    utils.constants.TOOL_CONFIRMATION_TTL_MS;
  return { outcome: inTime ? 'confirmed' : 'expired', calls };
};

/**
 * Whether a participant, identified as the platform knows them, still has a
 * question open in a conversation — so a button left under an answered or
 * expired question can say so instead of reaching the model as a bare "yes".
 */
export const hasOpenConfirmation = async (
  dbInstance: ReturnType<typeof db.create>,
  channelId: string,
  externalConversationId: string,
  externalParticipantId: string
): Promise<boolean> => {
  const [row] = await dbInstance
    .select({
      pending: db.schema.channelConversation.pendingToolConfirmation,
      participantId: db.schema.channelParticipant.id
    })
    .from(db.schema.channelConversation)
    .innerJoin(
      db.schema.channelParticipant,
      and(
        eq(db.schema.channelParticipant.channelId, channelId),
        eq(db.schema.channelParticipant.externalUserId, externalParticipantId)
      )
    )
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
  if (!row) return false;
  const pending = readPendingConfirmation(row.pending, row.participantId);
  return (
    pending !== null &&
    Date.now() - Date.parse(pending.createdAt) <
      utils.constants.TOOL_CONFIRMATION_TTL_MS
  );
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

// A customer's replies in the last 24 hours, not counting the limit notices.
// Keyed by the platform's id so it can run beside the participant upsert
// rather than after it.
const readParticipantUsage = async (
  dbInstance: ReturnType<typeof db.create>,
  channelId: string,
  externalParticipantId: string
): Promise<{ replies: number }> => {
  const [row] = await dbInstance
    .select({ replies: sql<number>`count(*)::int` })
    .from(db.schema.channelMessage)
    .innerJoin(
      db.schema.channelParticipant,
      eq(
        db.schema.channelParticipant.id,
        db.schema.channelMessage.participantId
      )
    )
    .where(
      and(
        eq(db.schema.channelParticipant.channelId, channelId),
        eq(db.schema.channelParticipant.externalUserId, externalParticipantId),
        eq(
          db.schema.channelMessage.role,
          utils.constants.ROLE_MESSAGE_ASSISTANT
        ),
        sql`(${db.schema.channelMessage.metadata}->>${utils.PARTICIPANT_LIMIT_METADATA_KEY}) is null`,
        gt(
          db.schema.channelMessage.createdAt,
          new Date(Date.now() - utils.PARTICIPANT_DAILY_LIMIT_WINDOW_MS)
        )
      )
    );
  return { replies: row?.replies ?? 0 };
};

/**
 * Write the limit notice unless this customer was already told since their
 * last reply — the moment they reached the limit — and return its id, or null
 * when the bot should stay quiet. A customer who reaches the limit again later
 * in the day is told again. Serialized per participant, so two messages
 * arriving together can't both be the one that gets the notice.
 */
const claimParticipantLimitNotice = async (
  dbInstance: ReturnType<typeof db.create>,
  participantId: string,
  notice: typeof db.schema.channelMessage.$inferInsert
): Promise<string | null> =>
  dbInstance.transaction(async tx => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`participant-limit:${participantId}`}))`
    );
    const isNotice = sql`(${db.schema.channelMessage.metadata}->>${utils.PARTICIPANT_LIMIT_METADATA_KEY}) is not null`;
    const [row] = await tx
      .select({
        lastReply: sql<Date | null>`max(${db.schema.channelMessage.createdAt}) filter (where not ${isNotice})`,
        lastNotice: sql<Date | null>`max(${db.schema.channelMessage.createdAt}) filter (where ${isNotice})`
      })
      .from(db.schema.channelMessage)
      .where(
        and(
          eq(db.schema.channelMessage.participantId, participantId),
          eq(
            db.schema.channelMessage.role,
            utils.constants.ROLE_MESSAGE_ASSISTANT
          ),
          gt(
            db.schema.channelMessage.createdAt,
            new Date(Date.now() - utils.PARTICIPANT_DAILY_LIMIT_WINDOW_MS)
          )
        )
      );
    const lastNotice = row?.lastNotice ? new Date(row.lastNotice) : null;
    const lastReply = row?.lastReply ? new Date(row.lastReply) : null;
    if (lastNotice && (!lastReply || lastNotice > lastReply)) return null;
    const [inserted] = await tx
      .insert(db.schema.channelMessage)
      .values(notice)
      .returning({ id: db.schema.channelMessage.id });
    return inserted.id;
  });

// Who transcribes this channel's voice notes. An organization's own key does
// when its provider takes audio — Google (any Gemini key can call our
// transcription model) or OpenAI — with ours behind it if that call fails.
// Anthropic takes no audio and OpenAI-compatible endpoints don't serve the
// OpenAI transcription model, so those channels, and the shared tier, use ours.
const voiceNoteTranscribers = (
  c: Context<AppEnv>,
  llmRow: ResolvedLlm['row'],
  apiKey: string,
  onSharedKey: boolean
): VoiceNoteTranscribers => {
  const platformKey = utils.getEnv(c, 'EMBEDDING_API_KEY');
  const platform: Transcriber | null = platformKey
    ? { provider: 'google', apiKey: platformKey, paidBy: 'platform' }
    : null;
  if (onSharedKey) return { primary: platform, fallback: null };
  if (llmRow.provider === utils.constants.LLM_PROVIDER_GOOGLE) {
    return {
      primary: { provider: 'google', apiKey, paidBy: 'organization' },
      fallback: platform
    };
  }
  // Only on OpenAI itself: a custom base URL (OpenRouter, Groq, …) doesn't
  // serve our transcription model, so every note would fail there first.
  if (
    llmRow.provider === utils.constants.LLM_PROVIDER_OPENAI &&
    !llmRow.baseUrl
  ) {
    return {
      primary: { provider: 'openai', apiKey, paidBy: 'organization' },
      fallback: platform
    };
  }
  return { primary: platform, fallback: null };
};

// A voice note in a turn that won't run: recorded as sent, not transcribed.
const markVoiceNoteSkipped = (message: RunUserMessage): RunUserMessage =>
  message.voice
    ? {
        ...message,
        metadata: {
          ...message.metadata,
          [utils.VOICE_NOTE_METADATA_KEY]: {
            mimeType: message.voice.mimeType,
            transcribed: false,
            skipped: true
          }
        }
      }
    : message;

const loadRecentHistory = async (
  dbInstance: ReturnType<typeof db.create>,
  conversationId: string,
  limit: number,
  excludeIds: Set<string>
): Promise<LlmMessage[]> => {
  // Over-fetch by the number of excluded rows so dropping them still leaves a
  // full `limit` of prior context.
  //
  // The id breaks ties on created_at: a debounced burst inserts its rows in one
  // statement, so they all carry the same transaction timestamp. Ids are
  // UUIDv7 (time-ordered), so ordering by them second replays a burst in the
  // order it was actually typed instead of an arbitrary one.
  const rows = await dbInstance
    .select()
    .from(db.schema.channelMessage)
    .where(eq(db.schema.channelMessage.conversationId, conversationId))
    .orderBy(
      sql`${db.schema.channelMessage.createdAt} DESC, ${db.schema.channelMessage.id} DESC`
    )
    .limit(limit + excludeIds.size);

  const kept = rows
    .filter(
      r =>
        !excludeIds.has(r.id) &&
        (r.role === utils.constants.ROLE_MESSAGE_USER ||
          r.role === utils.constants.ROLE_MESSAGE_ASSISTANT) &&
        // A voice note that couldn't be read left an empty row; some
        // providers refuse an empty message.
        !!r.content?.trim() &&
        // The daily-limit notice wasn't the model's answer; left in, the
        // model apologizes for it once the customer is answered again.
        !(r.metadata as Record<string, unknown> | null)?.[
          utils.PARTICIPANT_LIMIT_METADATA_KEY
        ]
    )
    .slice(0, limit)
    .reverse();

  const history: LlmMessage[] = [];
  kept.forEach((r, i) => {
    history.push({
      role: r.role as 'user' | 'assistant',
      content: withoutConfirmationSummary(r.content || '', r.metadata)
    });
    // A failed turn has no answer of its own; this one stands in for the
    // error the customer was shown, after the last of its messages.
    if (
      isFailedTurnMessage(r.metadata) &&
      !isFailedTurnMessage(kept[i + 1]?.metadata)
    ) {
      history.push({ role: 'assistant', content: FAILED_TURN_NOTE });
    }
  });
  return history;
};

const TURN_FAILED_METADATA_KEY = 'turnFailed';

const FAILED_TURN_NOTE =
  '(Not done: this request failed with an error and the user was told something went wrong. Do not carry it out now unless the user asks for it again.)';

const isFailedTurnMessage = (metadata: unknown): boolean =>
  (metadata as Record<string, unknown> | null)?.[TURN_FAILED_METADATA_KEY] ===
  true;

const markTurnFailed = async (
  dbInstance: ReturnType<typeof db.create>,
  messages: TurnRecord['userMessages']
): Promise<void> => {
  await dbInstance.transaction(async tx => {
    for (const message of messages) {
      await tx
        .update(db.schema.channelMessage)
        .set({
          metadata: {
            ...(message.metadata as Record<string, unknown> | null),
            [TURN_FAILED_METADATA_KEY]: true
          }
        })
        .where(eq(db.schema.channelMessage.id, message.id));
    }
  });
};

// A confirmation question as the model wrote it, without the summary the
// runner put under it. Left in, the model learns the block's look and starts
// writing its own copies — a second summary under the real one, or one that
// no stored call backs.
const withoutConfirmationSummary = (
  content: string,
  metadata: unknown
): string => {
  const summary = (
    metadata as { toolConfirmation?: { summary?: unknown } } | null
  )?.toolConfirmation?.summary;
  if (typeof summary !== 'string' || !content.endsWith(summary)) {
    return content;
  }
  return content.slice(0, -summary.length).trimEnd();
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
  // The result brought outside content into the turn (see
  // utils.isUntrustedToolResult).
  untrusted?: boolean;
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
      const items: Array<{
        uri: string;
        title?: string;
        description?: string;
        mimeType?: string;
      }> = [];
      try {
        // The whole set, then the model's page of it: the native tool pages
        // the same way, so a cursor means the same thing on either path.
        let protocolCursor: string | undefined;
        do {
          const listed = await client.listResources(
            protocolCursor ? { cursor: protocolCursor } : undefined
          );
          for (const r of listed.resources || []) {
            items.push({
              uri: r.uri,
              title: r.title || r.name,
              description: r.description,
              mimeType: r.mimeType
            });
          }
          protocolCursor = listed.nextCursor;
        } while (protocolCursor);
      } catch (err: any) {
        // -32601 = server registered no resources; an empty list is correct.
        if (err?.code !== -32601) throw err;
      }
      result = {
        content: [
          {
            type: 'text',
            text: utils.listResourcesPage(items, call.arguments || {}, {
              defaultLimit: utils.constants.LIST_RESOURCES_DEFAULT_LIMIT,
              maxLimit: utils.constants.LIST_RESOURCES_MAX_LIMIT
            })
          }
        ]
      };
    } else if (
      call.name === utils.constants.RESOURCE_TOOL_KEY_READ_RESOURCE &&
      uri &&
      !artifactResourceByUri.has(uri)
    ) {
      // A proxied (remote) resource — read it through the client, which forwards
      // to the remote. Artifact resources keep the native path below (its binary
      // short-circuit + R2 reads).
      const read = await client.readResource({ uri });
      // The MCP worker labels each text part already; unwrapped here so the
      // parts are joined and labelled once, as one block.
      const text = (read.contents || [])
        .map(cnt =>
          'text' in cnt && typeof cnt.text === 'string'
            ? utils.unwrapUntrustedContent(cnt.text)
            : '[non-text content omitted]'
        )
        .join('\n');
      // The remote's text, labelled and flagged like a proxied tool's answer.
      result = text
        ? {
            content: [
              { type: 'text', text: utils.wrapUntrustedContent(uri, text) }
            ],
            _meta: { [utils.UNTRUSTED_CONTENT_META_KEY]: true }
          }
        : { content: [{ type: 'text', text: '(empty resource)' }] };
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
      untrusted: utils.isUntrustedToolResult(result),
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
