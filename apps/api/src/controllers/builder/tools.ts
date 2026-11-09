import { and, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { createTwoFilesPatch } from 'diff';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';
import type { Database } from '@ganju/db';

import * as customCodeActions from '../artifact/customCodeActions';
import {
  readCustomCodeConfig,
  resolveCustomCodeToolReadOnly
} from '../artifact/customCode';
import { buildArtifactConnections } from '../artifact/connections';
import { DATA_TOOL_MAX_LIMIT } from '@ganju/utils/data';
import { generateEmbedding } from '../../utils/embedding';

import type { Bindings } from '../../types';

export interface StagedItem {
  area: 'functions';
  op: 'turn_on';
  payload: Record<string, unknown>;
  label: string;
}

export interface BuilderCard {
  kind: 'change_set' | 'patch' | 'connect_account' | 'secret' | 'upload';
  [key: string]: unknown;
}

export interface BuilderToolContext {
  env: Bindings;
  db: Database;
  organizationId: string;
  projectId: string;
  artifactId: string;
  userId: string;
  conversationId: string;
  staged: StagedItem[];
  onCard: (card: BuilderCard) => void;
}

export interface BuilderToolResult {
  content: string;
  isError: boolean;
  endsTurn?: boolean;
}

const MAX_RESULT = 24_000;
const clip = (text: string) =>
  text.length > MAX_RESULT
    ? `${text.slice(0, MAX_RESULT)}\n…(${text.length - MAX_RESULT} more characters cut)`
    : text;
const json = (value: unknown) => JSON.stringify(value, null, 1);
const outside = (source: string, value: unknown) =>
  utils.wrapUntrustedContent(
    source,
    typeof value === 'string' ? value : json(value)
  );

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required
});
const anyObject = (description: string) => ({
  type: 'object',
  description,
  additionalProperties: true
});

export const BUILDER_TOOLS = [
  {
    name: 'project',
    description:
      "What the project is made of right now: its actions (and whether a developer uploads them), tools (on/off), data tables, saved queries, triggers, knowledge, prompts, connected accounts, secret labels, the owner's account, and how its tools have been doing (calls, errors) over the last 7 days.",
    input_schema: obj({ action: { type: 'string', enum: ['overview'] } }, [
      'action'
    ])
  },
  {
    name: 'functions',
    description: `The project's actions (code).
- read: the files, manifest and config of a version (default: the live one, or the newest draft when nothing is live). Lists recent versions too.
- save_draft: save a new draft from the complete set of files plus the manifest (and optionally config). Returns its versionId. Nobody sees drafts. Always send every file and every action of the project, not only the changed ones. Not available when a developer uploads the live actions: use propose_patch.
- logs: the latest real calls of the live actions (optionally one tool), with their errors and ctx.log lines.
- turn_on: stage making a draft live (the owner applies it with the change set).`,
    input_schema: obj(
      {
        action: {
          type: 'string',
          enum: ['read', 'save_draft', 'logs', 'turn_on']
        },
        versionId: { type: 'string' },
        files: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'path -> file content (save_draft)'
        },
        manifest: anyObject('{ "tools": [...] } (save_draft)'),
        config: anyObject(
          '{ allowedHosts?, connections?, timeoutMs? } (save_draft)'
        ),
        tool: { type: 'string', description: 'logs: one action name' },
        limit: { type: 'integer' },
        label: {
          type: 'string',
          description: 'turn_on: the line the owner reads on the card'
        }
      },
      ['action']
    )
  },
  {
    name: 'run_test',
    description:
      'Run one action of a saved version (draft or live) on a sample input, the way the bot would call it. Real effects happen for real (emails sent, rows written). Returns the output, errors, ctx.log lines and schema violations.',
    input_schema: obj(
      {
        versionId: { type: 'string' },
        tool: { type: 'string' },
        input: anyObject('the action input')
      },
      ['versionId', 'tool']
    )
  },
  {
    name: 'data',
    description:
      "The project's database, read only: describe (tables, columns, saved queries, triggers, time zone), rows (table, where, limit), run_query (name, params).",
    input_schema: obj(
      {
        action: {
          type: 'string',
          enum: ['describe', 'rows', 'run_query']
        },
        table: { type: 'string' },
        where: anyObject('rows: filter like {"status":"open"}'),
        limit: { type: 'integer' },
        name: { type: 'string', description: 'run_query: saved query name' },
        params: anyObject('run_query params')
      },
      ['action']
    )
  },
  {
    name: 'knowledge',
    description:
      'What the bot knows, read only: list (notes, files, websites and their status), search (query: the excerpts the bot would find).',
    input_schema: obj(
      {
        action: { type: 'string', enum: ['list', 'search'] },
        query: { type: 'string' }
      },
      ['action']
    )
  },
  {
    name: 'prompts',
    description:
      "Slash-command prompt templates the bot's users can pick, read only: list.",
    input_schema: obj({ action: { type: 'string', enum: ['list'] } }, [
      'action'
    ])
  },
  {
    name: 'tools',
    description:
      'Ready-made tools, read only: catalog {query?} (what can be added, and which account each needs), list (what the project has, with on/off).',
    input_schema: obj(
      {
        action: { type: 'string', enum: ['catalog', 'list'] },
        query: { type: 'string' }
      },
      ['action']
    )
  },
  {
    name: 'propose_changes',
    description:
      'Show the owner everything staged so far as one change set card with an Apply button. summary: one or two plain sentences of what the change does for them. Nothing changes until they click Apply; you hear how it went in their next message.',
    input_schema: obj({ summary: { type: 'string' } }, ['summary'])
  },
  {
    name: 'propose_patch',
    description:
      'When a developer uploads the live actions: the changed files of their project (path -> full new content, or null to delete), shown to the owner as a patch to pass on. note: one or two plain sentences of what it changes. Nothing is saved here.',
    input_schema: obj(
      {
        files: {
          type: 'object',
          additionalProperties: { type: ['string', 'null'] },
          description: 'path -> full new content, or null to delete'
        },
        note: { type: 'string' }
      },
      ['files', 'note']
    )
  },
  {
    name: 'ask_owner',
    description:
      'Show the owner a card for something only they can do: kind "connect_account" (provider, e.g. google-calendar), "secret" (label, plus step-by-step where to find it in message), or "upload" (what file you need in message). Values never enter the conversation. The card ends your reply; their next message says what they did.',
    input_schema: obj(
      {
        kind: { type: 'string', enum: ['connect_account', 'secret', 'upload'] },
        provider: { type: 'string' },
        label: { type: 'string' },
        message: { type: 'string' }
      },
      ['kind', 'message']
    )
  }
];

type ManifestTool = {
  name: string;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  data?: { access?: string; tables?: string[] };
};

const caller = (ctx: BuilderToolContext) => ({ env: ctx.env, db: ctx.db });
const ids = (ctx: BuilderToolContext) => ({
  organizationId: ctx.organizationId,
  projectId: ctx.projectId,
  userId: ctx.userId
});

const openDatabase = (ctx: BuilderToolContext) =>
  db.data.openArtifactDatabase(
    ctx.db,
    ctx.env.PROJECT_DATABASE,
    ctx.artifactId
  );

const dataCallerFor = (
  ctx: BuilderToolContext,
  opened: NonNullable<Awaited<ReturnType<typeof openDatabase>>>
) => db.data.dataCaller(opened, { actor: `user:${ctx.userId}` });

const describeData = async (ctx: BuilderToolContext) => {
  const opened = await openDatabase(ctx);
  if (!opened) return null;
  const who = dataCallerFor(ctx, opened);
  const [schema, queries, triggers] = await Promise.all([
    db.data.callData('describe', () => opened.stub.describe(who)),
    db.data.callData('listQueries', () => opened.stub.listQueries(who)),
    db.data.callData('listTriggers', () => opened.stub.listTriggers(who))
  ]);
  return { schema, queries, triggers };
};

const versionsSummary = async (ctx: BuilderToolContext) => {
  const listed = await customCodeActions.listVersions(caller(ctx), ids(ctx));
  const live = listed.versions.find(v => v.id === listed.activeVersionId);
  return {
    liveVersionId: listed.activeVersionId,
    developerUploaded: Boolean(
      live && live.sourceKind !== utils.constants.CUSTOM_CODE_SOURCE_KIND_EDITOR
    ),
    versions: listed.versions.slice(0, 8).map(v => ({
      id: v.id,
      version: v.version,
      status: v.status,
      byDeveloper:
        v.sourceKind !== utils.constants.CUSTOM_CODE_SOURCE_KIND_EDITOR,
      tools: (v.tools as ManifestTool[]).map(t => t.name),
      error: v.error
    }))
  };
};

const toolHealth = async (ctx: BuilderToolContext) => {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return ctx.db
    .select({
      name: db.schema.mcpRequest.toolName,
      calls: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where ${db.schema.mcpRequest.errorMessage} is not null)::int`
    })
    .from(db.schema.mcpRequest)
    .innerJoin(
      db.schema.mcpSession,
      eq(db.schema.mcpRequest.sessionId, db.schema.mcpSession.id)
    )
    .where(
      and(
        eq(db.schema.mcpSession.artifactId, ctx.artifactId),
        eq(db.schema.mcpRequest.method, 'tools/call'),
        isNotNull(db.schema.mcpRequest.toolName),
        gte(db.schema.mcpRequest.createdAt, since)
      )
    )
    .groupBy(db.schema.mcpRequest.toolName);
};

const overview = async (ctx: BuilderToolContext) => {
  const [owner] = await ctx.db
    .select({ name: db.schema.user.name, email: db.schema.user.email })
    .from(db.schema.user)
    .where(eq(db.schema.user.id, ctx.userId))
    .limit(1);
  const [tools, prompts, resources, credentials, actions, data, health] =
    await Promise.all([
      ctx.db
        .select()
        .from(db.schema.artifactTool)
        .where(eq(db.schema.artifactTool.artifactId, ctx.artifactId)),
      ctx.db
        .select({
          id: db.schema.artifactPrompt.id,
          title: db.schema.artifactPrompt.title
        })
        .from(db.schema.artifactPrompt)
        .where(eq(db.schema.artifactPrompt.artifactId, ctx.artifactId)),
      ctx.db
        .select({
          title: db.schema.artifactResource.title,
          uri: db.schema.artifactResource.uri,
          status: db.schema.artifactResource.status,
          sourceType: db.schema.artifactResource.sourceType
        })
        .from(db.schema.artifactResource)
        .where(eq(db.schema.artifactResource.artifactId, ctx.artifactId)),
      ctx.db
        .select()
        .from(db.schema.artifactCredential)
        .where(eq(db.schema.artifactCredential.artifactId, ctx.artifactId)),
      versionsSummary(ctx),
      describeData(ctx).catch((error: Error) => ({ error: error.message })),
      toolHealth(ctx)
    ]);

  return {
    owner: owner ?? null,
    tools: tools.map(t => ({
      toolKey: t.toolKey,
      enabled: t.enabled,
      name: (t.config as { name?: string } | null)?.name ?? null
    })),
    actions,
    data: data ?? 'no database yet',
    knowledge: resources,
    prompts,
    secretLabels: credentials
      .filter(
        row => row.provider === utils.constants.CREDENTIAL_PROVIDER_CUSTOM_CODE
      )
      .map(row => (row.metadata as { label?: string } | null)?.label)
      .filter(Boolean),
    accounts: buildArtifactConnections({ env: ctx.env }, credentials)
      .filter(connection => connection.configured)
      .map(({ provider, connected, needsReauth }) => ({
        provider,
        connected,
        needsReauth
      })),
    health: health.filter(row => row.calls > 0)
  };
};

const readVersion = async (ctx: BuilderToolContext, versionId?: string) => {
  const summary = await versionsSummary(ctx);
  const id = versionId ?? summary.liveVersionId ?? summary.versions[0]?.id;
  if (!id) return { ...summary, note: 'The project has no actions yet.' };
  const source = await customCodeActions.readSource(caller(ctx), {
    ...ids(ctx),
    versionId: id
  });
  const { tool } = await resolveCustomCodeToolReadOnly(
    ctx.db,
    ctx.organizationId,
    ctx.projectId
  );
  const { activeVersionId: _, ...config } = tool
    ? readCustomCodeConfig(tool)
    : {};
  return {
    ...summary,
    shown: {
      versionId: id,
      byDeveloper:
        source.sourceKind !== utils.constants.CUSTOM_CODE_SOURCE_KIND_EDITOR,
      readableSource: source.snapshot || source.editable,
      files: source.files,
      manifest: { tools: source.tools }
    },
    config
  };
};

const saveDraft = async (
  ctx: BuilderToolContext,
  input: {
    files?: Record<string, string>;
    manifest?: { tools?: unknown[] };
    config?: unknown;
  }
) => {
  const summary = await versionsSummary(ctx);
  if (summary.developerUploaded) {
    throw new Error(
      'A developer uploads the live actions, so drafts are not saved here. Answer the change with propose_patch.'
    );
  }
  const files = input.files ?? {};
  if (!files[utils.constants.CUSTOM_CODE_MAIN_MODULE]) {
    throw new Error('save_draft needs files with index.js');
  }
  if (!input.manifest?.tools?.length) {
    throw new Error('save_draft needs manifest.tools');
  }
  utils.validateProjectFiles(files);

  const values =
    await utils.Schema.ARTIFACT_CUSTOM_CODE_CREATE_VERSION.parseAsync({
      ...ids(ctx),
      manifest: input.manifest,
      ...(input.config ? { config: input.config } : {})
    });
  const created = await customCodeActions.createDraft(caller(ctx), values);
  const bundle = new TextEncoder().encode(utils.encodeProject(files));
  const stored = await customCodeActions.storeBundle(
    caller(ctx),
    await utils.Schema.ARTIFACT_CUSTOM_CODE_UPLOAD_BUNDLE.parseAsync({
      ...ids(ctx),
      versionId: created.id,
      sourceKind: utils.constants.CUSTOM_CODE_SOURCE_KIND_EDITOR
    }),
    bundle.buffer as ArrayBuffer
  );
  return {
    versionId: stored.id,
    status: stored.status,
    error: stored.error,
    warnings: created.warnings
  };
};

// What turning a version on lets the bot do, from its settings rather than
// from the model's words: the card lists these.
const turnOnEffects = async (ctx: BuilderToolContext, versionId: string) => {
  const source = await customCodeActions.readSource(caller(ctx), {
    ...ids(ctx),
    versionId
  });
  const { tool } = await resolveCustomCodeToolReadOnly(
    ctx.db,
    ctx.organizationId,
    ctx.projectId
  );
  const config = tool ? readCustomCodeConfig(tool) : null;
  const actions = source.tools as ManifestTool[];
  return {
    actions: actions.map(action => ({
      name: action.name,
      changesThings: Boolean(action.annotations?.destructiveHint),
      onlyReads: Boolean(action.annotations?.readOnlyHint),
      data: action.data ?? null
    })),
    hosts: config?.allowedHosts ?? [],
    accounts: config?.connections ?? []
  };
};

const stageTurnOn = async (
  ctx: BuilderToolContext,
  input: { versionId?: string; label?: string }
) => {
  if (!input.versionId) throw new Error('turn_on needs versionId');
  const summary = await versionsSummary(ctx);
  if (summary.liveVersionId === input.versionId) {
    return 'That version is already live; nothing to stage.';
  }
  const effects = await turnOnEffects(ctx, input.versionId);
  const label = input.label ?? 'Turn on the new actions';
  ctx.staged.push({
    area: 'functions',
    op: 'turn_on',
    payload: { versionId: input.versionId, effects },
    label
  });
  return `Staged #${ctx.staged.length}: ${label}. It takes effect when the owner applies the change set (propose_changes).`;
};

const proposeChanges = async (
  ctx: BuilderToolContext,
  input: { summary?: string }
) => {
  if (!ctx.staged.length) return 'Nothing is staged.';
  const items = ctx.staged.splice(0);
  const [row] = await ctx.db
    .insert(db.schema.builderChangeSet)
    .values({
      conversationId: ctx.conversationId,
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      artifactId: ctx.artifactId,
      items: items.map(item => ({ ...item, undoable: true })),
      summary: input.summary ?? null
    })
    .returning();
  ctx.onCard({
    kind: 'change_set',
    changeSetId: row.id,
    summary: input.summary ?? null,
    items: items.map(item => ({
      label: item.label,
      effects: item.payload.effects ?? null,
      undoable: true
    }))
  });
  return 'The owner sees the change set card. Nothing changes until they click Apply; their next message says how it went. End your reply now.';
};

const proposePatch = async (
  ctx: BuilderToolContext,
  input: { files?: Record<string, string | null>; note?: string }
) => {
  const summary = await versionsSummary(ctx);
  if (!summary.liveVersionId || !summary.developerUploaded) {
    throw new Error(
      'The live actions are made here, not uploaded by a developer: save a draft instead.'
    );
  }
  const source = await customCodeActions.readSource(caller(ctx), {
    ...ids(ctx),
    versionId: summary.liveVersionId
  });
  if (!source.snapshot || !source.files) {
    throw new Error(
      "The developer's source isn't available for the live version, so a patch can't be made against it. Tell the owner the developer needs to upload with the source included."
    );
  }
  const changed = Object.entries(input.files ?? {});
  if (!changed.length) throw new Error('propose_patch needs files');
  const patch = changed
    .map(([path, next]) => {
      const before = source.files?.[path] ?? null;
      return createTwoFilesPatch(
        before === null ? '/dev/null' : `a/${path}`,
        next === null ? '/dev/null' : `b/${path}`,
        before ?? '',
        next ?? ''
      );
    })
    .join('\n');
  ctx.onCard({
    kind: 'patch',
    versionId: summary.liveVersionId,
    note: input.note ?? null,
    files: changed.map(([path]) => path),
    patch
  });
  return 'The owner sees the patch with copy and download buttons, to pass on to their developer. Nothing was saved. End your reply now.';
};

const askOwner = (
  ctx: BuilderToolContext,
  input: { kind?: string; provider?: string; label?: string; message?: string }
): BuilderToolResult => {
  if (
    input.kind !== 'connect_account' &&
    input.kind !== 'secret' &&
    input.kind !== 'upload'
  ) {
    throw new Error('ask_owner needs kind connect_account, secret or upload');
  }
  if (input.kind === 'connect_account' && !input.provider) {
    throw new Error('connect_account needs provider');
  }
  if (input.kind === 'secret' && !input.label) {
    throw new Error('secret needs label');
  }
  ctx.onCard({
    kind: input.kind,
    provider: input.provider ?? null,
    label: input.label ?? null,
    message: input.message ?? ''
  });
  return {
    content:
      'The owner sees the card. End your reply now; their next message says what they did.',
    isError: false,
    endsTurn: true
  };
};

const knowledgeSearch = async (ctx: BuilderToolContext, query?: string) => {
  const text = (query ?? '').trim();
  if (!text) throw new Error('search needs query');
  const embedding = await generateEmbedding({ env: ctx.env }, text);
  if (!embedding) throw new Error('Search is not available right now.');
  const rows = await db.searchResourceChunks(ctx.db, {
    artifactId: ctx.artifactId,
    query: text,
    embedding,
    limit: 8
  });
  if (!rows.length) return 'Nothing found. Knowledge may still be indexing.';
  return outside('knowledge search', rows.map(db.toResourceSearchResult));
};

const catalog = (query?: string) => {
  const groups = utils.TOOL_CATALOG.map(group => ({
    group: group.key,
    title: group.title,
    needsAccount: group.provider ?? null,
    description: group.description,
    tools: group.tools.map(tool => ({
      toolKey: tool.key,
      description: tool.description
    }))
  }));
  const q = query?.toLowerCase();
  const hits = q
    ? groups.filter(group => JSON.stringify(group).toLowerCase().includes(q))
    : [];
  return outside(
    'tool catalog',
    hits.length
      ? hits
      : groups.map(({ group, title, needsAccount }) => ({
          group,
          title,
          needsAccount
        }))
  );
};

type Input = Record<string, any>;

const run = async (
  ctx: BuilderToolContext,
  name: string,
  input: Input
): Promise<string | BuilderToolResult> => {
  const action = input.action;
  switch (name) {
    case 'project':
      return json(await overview(ctx));
    case 'functions':
      if (action === 'read')
        return json(await readVersion(ctx, input.versionId));
      if (action === 'save_draft') return json(await saveDraft(ctx, input));
      if (action === 'turn_on') return stageTurnOn(ctx, input);
      if (action === 'logs') {
        const logs = await customCodeActions.listLogs(
          caller(ctx),
          await utils.Schema.ARTIFACT_CUSTOM_CODE_LIST_LOGS.parseAsync({
            ...ids(ctx),
            tool: input.tool,
            limit: input.limit ?? 20
          })
        );
        return outside('action logs', logs.entries);
      }
      break;
    case 'run_test': {
      const result = await customCodeActions.runTest(
        caller(ctx),
        await utils.Schema.ARTIFACT_CUSTOM_CODE_TEST_VERSION.parseAsync({
          ...ids(ctx),
          versionId: input.versionId,
          tool: input.tool,
          input: input.input ?? {}
        })
      );
      return outside(`test of ${input.tool}`, result);
    }
    case 'data': {
      if (action === 'describe') {
        return json(
          (await describeData(ctx)) ?? 'The project has no database yet.'
        );
      }
      const opened = await openDatabase(ctx);
      if (!opened) return 'The project has no database yet.';
      const who = dataCallerFor(ctx, opened);
      if (action === 'rows') {
        const rows = await db.data.callData('query', () =>
          opened.stub.query(who, {
            table: input.table,
            ...(input.where ? { where: input.where } : {}),
            limit: Math.min(input.limit ?? 50, DATA_TOOL_MAX_LIMIT)
          })
        );
        return outside(`data:${input.table}`, rows);
      }
      if (action === 'run_query') {
        const rows = await db.data.callData('runQuery', () =>
          opened.stub.runQuery(who, {
            name: input.name,
            params: input.params ?? {},
            limit: Math.min(input.limit ?? 50, DATA_TOOL_MAX_LIMIT)
          })
        );
        return outside(`data:query ${input.name}`, rows);
      }
      break;
    }
    case 'knowledge':
      if (action === 'list') {
        return json(
          await ctx.db
            .select({
              title: db.schema.artifactResource.title,
              uri: db.schema.artifactResource.uri,
              status: db.schema.artifactResource.status,
              sourceType: db.schema.artifactResource.sourceType
            })
            .from(db.schema.artifactResource)
            .where(eq(db.schema.artifactResource.artifactId, ctx.artifactId))
            .orderBy(desc(db.schema.artifactResource.createdAt))
        );
      }
      if (action === 'search') return knowledgeSearch(ctx, input.query);
      break;
    case 'prompts':
      if (action === 'list') {
        return json(
          await ctx.db
            .select({
              title: db.schema.artifactPrompt.title,
              description: db.schema.artifactPrompt.description,
              messages: db.schema.artifactPrompt.messages,
              schema: db.schema.artifactPrompt.schema
            })
            .from(db.schema.artifactPrompt)
            .where(eq(db.schema.artifactPrompt.artifactId, ctx.artifactId))
        );
      }
      break;
    case 'tools':
      if (action === 'catalog') return catalog(input.query);
      if (action === 'list') {
        const tools = await ctx.db
          .select()
          .from(db.schema.artifactTool)
          .where(eq(db.schema.artifactTool.artifactId, ctx.artifactId));
        return json(
          tools.map(t => ({
            toolKey: t.toolKey,
            enabled: t.enabled,
            name: (t.config as { name?: string } | null)?.name ?? null
          }))
        );
      }
      break;
    case 'propose_changes':
      return proposeChanges(ctx, input);
    case 'propose_patch':
      return proposePatch(ctx, input);
    case 'ask_owner':
      return askOwner(ctx, input);
  }
  throw new Error(`Unknown ${name} action ${action ?? ''}`.trim());
};

export const runBuilderTool = async (
  ctx: BuilderToolContext,
  name: string,
  input: unknown
): Promise<BuilderToolResult> => {
  try {
    const result = await run(ctx, name, (input ?? {}) as Input);
    return typeof result === 'string'
      ? { content: clip(result), isError: false }
      : { ...result, content: clip(result.content) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: clip(`Error: ${message}`), isError: true };
  }
};
