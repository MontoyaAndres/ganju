import { and, eq } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';

import * as projectActions from '../artifact/projectActions';

import type { BuilderToolContext } from './tools';
import type {
  ItemArea,
  ItemCaller,
  ItemHandler,
  ItemScope,
  StagedItem
} from './items';

const { Schema, constants } = utils;

type Input = Record<string, any>;
type Payload = Record<string, any>;

const ids = (scope: {
  organizationId: string;
  projectId: string;
  userId: string;
}) => ({
  organizationId: scope.organizationId,
  projectId: scope.projectId,
  userId: scope.userId
});

const resourceRow = async (
  caller: ItemCaller,
  artifactId: string,
  id: string
) => {
  const [row] = await caller.db
    .select()
    .from(db.schema.artifactResource)
    .where(
      and(
        eq(db.schema.artifactResource.id, id),
        eq(db.schema.artifactResource.artifactId, artifactId)
      )
    )
    .limit(1);
  return row ?? null;
};

const promptRow = async (
  caller: ItemCaller,
  artifactId: string,
  id: string
) => {
  const [row] = await caller.db
    .select()
    .from(db.schema.artifactPrompt)
    .where(
      and(
        eq(db.schema.artifactPrompt.id, id),
        eq(db.schema.artifactPrompt.artifactId, artifactId)
      )
    )
    .limit(1);
  return row ?? null;
};

const toolRow = async (caller: ItemCaller, artifactId: string, id: string) => {
  const [row] = await caller.db
    .select()
    .from(db.schema.artifactTool)
    .where(
      and(
        eq(db.schema.artifactTool.id, id),
        eq(db.schema.artifactTool.artifactId, artifactId)
      )
    )
    .limit(1);
  return row ?? null;
};

type ResourceRow = NonNullable<Awaited<ReturnType<typeof resourceRow>>>;
type ToolRow = NonNullable<Awaited<ReturnType<typeof toolRow>>>;

const toolName = (tool: ToolRow) =>
  ((tool.config as { name?: string } | null)?.name as string | undefined) ??
  tool.toolKey;

// A note typed in the app: its text lives on the row, not in storage.
const isNote = (row: ResourceRow) =>
  row.sourceType === constants.RESOURCE_SOURCE_TYPE_FILE &&
  !row.fileKey &&
  row.content !== null;

const isWebsite = (row: ResourceRow) =>
  row.sourceType === constants.RESOURCE_SOURCE_TYPE_WEBSITE &&
  !row.parentResourceId;

const noteBody = (note: {
  title: string;
  uri: string;
  text: string;
  description?: string | null;
}) => ({
  title: note.title,
  uri: note.uri,
  type: constants.RESOURCE_TYPE_STATIC,
  sourceType: constants.RESOURCE_SOURCE_TYPE_FILE,
  mimeType: constants.MIMETYPE_TEXT,
  content: note.text,
  size: new TextEncoder().encode(note.text).length,
  encoding: 'utf-8',
  ...(note.description ? { description: note.description } : {})
});

const websiteBody = (site: {
  title: string;
  uri: string;
  description?: string | null;
  maxPages?: number;
  maxDepth?: number;
}) => ({
  title: site.title,
  uri: site.uri,
  sourceType: constants.RESOURCE_SOURCE_TYPE_WEBSITE,
  ...(site.description ? { description: site.description } : {}),
  crawlConfig: {
    maxPages: site.maxPages ?? constants.CRAWL_DEFAULT_MAX_PAGES,
    maxDepth: site.maxDepth ?? constants.CRAWL_DEFAULT_MAX_DEPTH
  }
});

/**
 * Stages one change to knowledge, prompts or tools, checked against the
 * project as it is now.
 */
export const stageProject = async (
  ctx: BuilderToolContext,
  area: Exclude<ItemArea, 'functions' | 'data'>,
  action: string,
  input: Input
): Promise<string> => {
  const caller = { env: ctx.env, db: ctx.db };
  const scope = {
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    userId: ctx.userId
  };
  const label = typeof input.label === 'string' ? input.label.trim() : '';
  if (!label)
    throw new Error(
      `${action} needs label: the line the owner reads on the card`
    );
  const push = (item: Omit<StagedItem, 'area' | 'label'>) => {
    ctx.staged.push({ area, label, ...item });
    const notes = [
      item.deletes
        ? `It deletes: the owner must type "${item.deletes}" to apply.`
        : '',
      item.undo === 'none' ? 'It cannot be undone.' : '',
      item.lost === 'file' ? "Undo can't bring back the file's contents." : '',
      item.lost === 'credentials'
        ? 'Undo puts the tool back, but its key or account connection must be added again.'
        : ''
    ].filter(Boolean);
    return [`Staged #${ctx.staged.length}: ${label}.`, ...notes].join(' ');
  };

  if (area === 'knowledge') {
    switch (action) {
      case 'add_note': {
        const title = String(input.title ?? '').trim();
        const text = String(input.text ?? '');
        if (!title || !text.trim())
          throw new Error('add_note needs title and text');
        const body = noteBody({
          title,
          uri: utils.resourceUriFromTitle(title),
          text,
          description: input.description
        });
        await Schema.ARTIFACT_CREATE_RESOURCE.parseAsync({ ...body, ...scope });
        return push({ op: action, payload: { body }, undo: 'reverse' });
      }
      case 'edit_note': {
        const row = await resourceRow(
          caller,
          ctx.artifactId,
          String(input.id ?? '')
        );
        if (!row || !isNote(row)) {
          throw new Error(
            'edit_note takes the id of a note typed in the app (knowledge list); files and websites are replaced, not edited.'
          );
        }
        const text = String(input.text ?? row.content ?? '');
        const title = String(input.title ?? row.title);
        return push({
          op: action,
          payload: {
            id: row.id,
            body: noteBody({
              title,
              uri: row.uri,
              text,
              description: input.description ?? row.description
            })
          },
          undo: 'reverse'
        });
      }
      case 'add_website': {
        const body = websiteBody({
          title: String(input.title ?? ''),
          uri: String(input.url ?? ''),
          description: input.description,
          maxPages: input.maxPages,
          maxDepth: input.maxDepth
        });
        await Schema.ARTIFACT_CREATE_WEBSITE.parseAsync({ ...body, ...scope });
        return push({ op: action, payload: { body }, undo: 'reverse' });
      }
      case 'remove': {
        const row = await resourceRow(
          caller,
          ctx.artifactId,
          String(input.id ?? '')
        );
        if (!row)
          throw new Error(
            'remove takes the id of a knowledge item (knowledge list).'
          );
        if (row.parentResourceId) {
          throw new Error(
            'That is one page of a website: remove the website itself.'
          );
        }
        const comesBack = isNote(row) || isWebsite(row);
        return push({
          op: action,
          payload: { id: row.id },
          deletes: row.title,
          undo: comesBack ? 'reverse' : 'none',
          ...(comesBack ? {} : { lost: 'file' as const })
        });
      }
    }
    throw new Error(`Unknown knowledge action ${action}`);
  }

  if (area === 'prompts') {
    const fields = (source: Input) => ({
      title: source.title,
      ...(source.description ? { description: source.description } : {}),
      messages: source.messages,
      schema: source.schema ?? { type: 'object', properties: {} }
    });
    switch (action) {
      case 'create': {
        const values = fields(input);
        await Schema.ARTIFACT_CREATE_PROMPT.parseAsync({ ...values, ...scope });
        return push({ op: action, payload: { values }, undo: 'reverse' });
      }
      case 'edit': {
        const row = await promptRow(
          caller,
          ctx.artifactId,
          String(input.id ?? '')
        );
        if (!row)
          throw new Error('edit takes the id of a prompt (prompts list).');
        const values = fields({
          title: input.title ?? row.title,
          description: input.description ?? row.description,
          messages: input.messages ?? row.messages,
          schema: input.schema ?? row.schema
        });
        await Schema.ARTIFACT_UPDATE_PROMPT.parseAsync({
          ...values,
          promptId: row.id,
          ...scope
        });
        return push({
          op: action,
          payload: { id: row.id, values },
          undo: 'reverse'
        });
      }
      case 'remove': {
        const row = await promptRow(
          caller,
          ctx.artifactId,
          String(input.id ?? '')
        );
        if (!row)
          throw new Error('remove takes the id of a prompt (prompts list).');
        return push({
          op: action,
          payload: { id: row.id },
          deletes: row.title,
          undo: 'reverse'
        });
      }
    }
    throw new Error(`Unknown prompts action ${action}`);
  }

  // Tools
  switch (action) {
    case 'add': {
      const toolKey = String(input.toolKey ?? '');
      if (
        !utils.isToolKey(toolKey) ||
        toolKey === constants.TOOL_DEFINITION_KEY_CUSTOM_CODE
      ) {
        throw new Error(
          'add takes a toolKey from the catalog, http-endpoint or mcp-proxy. Actions are made with functions.'
        );
      }
      const auth = (input.config as Input | undefined)?.auth;
      if (
        toolKey === constants.TOOL_DEFINITION_KEY_MCP_PROXY &&
        auth &&
        auth.kind !== 'none'
      ) {
        throw new Error(
          'A server that needs a sign-in or a key is added by the owner on the Tools page; tell them so.'
        );
      }
      return push({
        op: action,
        payload: {
          toolKey,
          config: input.config ?? undefined,
          metadata: input.metadata ?? undefined
        },
        undo: 'reverse'
      });
    }
    case 'change': {
      const row = await toolRow(caller, ctx.artifactId, String(input.id ?? ''));
      if (!row) throw new Error('change takes the id of a tool (tools list).');
      if (row.toolKey === constants.TOOL_DEFINITION_KEY_CUSTOM_CODE) {
        throw new Error('Actions are changed with functions.');
      }
      return push({
        op: action,
        payload: {
          id: row.id,
          config: input.config ?? undefined,
          metadata: input.metadata ?? undefined
        },
        undo: 'reverse'
      });
    }
    case 'turn': {
      const row = await toolRow(caller, ctx.artifactId, String(input.id ?? ''));
      if (!row) throw new Error('turn takes the id of a tool (tools list).');
      return push({
        op: action,
        payload: { id: row.id, enabled: Boolean(input.enabled) },
        undo: 'reverse'
      });
    }
    case 'remove': {
      const row = await toolRow(caller, ctx.artifactId, String(input.id ?? ''));
      if (!row) throw new Error('remove takes the id of a tool (tools list).');
      if (row.toolKey === constants.TOOL_DEFINITION_KEY_CUSTOM_CODE) {
        throw new Error(
          "The project's actions can be turned off (turn), not removed here."
        );
      }
      const ownCredential = Boolean(
        (row.config as Input | null)?.auth?.credentialId
      );
      return push({
        op: action,
        payload: { id: row.id },
        deletes: toolName(row),
        undo: 'reverse',
        ...(ownCredential ? { lost: 'credentials' as const } : {})
      });
    }
  }
  throw new Error(`Unknown tools action ${action}`);
};

// Apply and undo

const created = (id: string) => ({ id });

const knowledge: Record<string, ItemHandler> = {
  add_note: {
    apply: async (caller, scope, item) =>
      created(
        (
          await projectActions.createResource(caller, {
            ...ids(scope),
            body: item.payload.body as Payload
          })
        ).id
      ),
    undo: (caller, scope, _item, before) =>
      removeResource(caller, scope, before)
  },
  add_website: {
    apply: async (caller, scope, item) =>
      created(
        (
          await projectActions.createResource(caller, {
            ...ids(scope),
            body: item.payload.body as Payload
          })
        ).id
      ),
    undo: (caller, scope, _item, before) =>
      removeResource(caller, scope, before)
  },
  edit_note: {
    apply: async (caller, scope, item) => {
      const { previous } = await projectActions.updateResource(caller, {
        ...ids(scope),
        resourceId: String(item.payload.id),
        body: item.payload.body as Payload
      });
      return {
        id: item.payload.id,
        body: noteBody({
          title: previous.title,
          uri: previous.uri,
          text: previous.content ?? '',
          description: previous.description
        })
      };
    },
    check: async (caller, scope, _item, before) => {
      if (
        !(await resourceRow(caller, scope.artifactId, (before as Payload).id))
      ) {
        throw new Error(
          'That note was removed since, so there is nothing to put back.'
        );
      }
    },
    undo: async (caller, scope, _item, before) => {
      const { id, body } = before as Payload;
      await projectActions.updateResource(caller, {
        ...ids(scope),
        resourceId: id,
        body
      });
    }
  },
  remove: {
    apply: async (caller, scope, item) => {
      const row = await resourceRow(
        caller,
        scope.artifactId,
        String(item.payload.id)
      );
      if (!row) throw new Error('That knowledge item is already gone.');
      await projectActions.removeResource(caller, {
        ...ids(scope),
        resourceId: row.id
      });
      if (isNote(row)) {
        return {
          body: noteBody({
            title: row.title,
            uri: row.uri,
            text: row.content ?? '',
            description: row.description
          })
        };
      }
      if (isWebsite(row)) {
        const crawl = (row.crawlConfig ?? {}) as {
          maxPages?: number;
          maxDepth?: number;
        };
        return {
          body: websiteBody({
            title: row.title,
            uri: row.uri,
            description: row.description,
            ...crawl
          })
        };
      }
      return { body: null };
    },
    undo: async (caller, scope, _item, before) => {
      const { body } = before as { body: Payload | null };
      if (!body)
        throw new Error(
          "A removed file can't be brought back; upload it again."
        );
      await projectActions.createResource(caller, { ...ids(scope), body });
    }
  }
};

const removeResource = async (
  caller: ItemCaller,
  scope: ItemScope,
  before: unknown
) => {
  const { id } = before as { id: string };
  // Already removed by the owner: nothing left to undo.
  if (!(await resourceRow(caller, scope.artifactId, id))) return;
  await projectActions.removeResource(caller, {
    ...ids(scope),
    resourceId: id
  });
};

const promptValues = (
  row: NonNullable<Awaited<ReturnType<typeof promptRow>>>
) => ({
  title: row.title,
  ...(row.description ? { description: row.description } : {}),
  messages: row.messages,
  schema: row.schema
});

const prompts: Record<string, ItemHandler> = {
  create: {
    apply: async (caller, scope, item) => {
      const values = await Schema.ARTIFACT_CREATE_PROMPT.parseAsync({
        ...(item.payload.values as Payload),
        ...ids(scope)
      });
      return created((await projectActions.createPrompt(caller, values)).id);
    },
    undo: async (caller, scope, _item, before) => {
      const { id } = before as { id: string };
      if (!(await promptRow(caller, scope.artifactId, id))) return;
      await projectActions.removePrompt(
        caller,
        await Schema.ARTIFACT_REMOVE_PROMPT.parseAsync({
          ...ids(scope),
          promptId: id
        })
      );
    }
  },
  edit: {
    apply: async (caller, scope, item) => {
      const values = await Schema.ARTIFACT_UPDATE_PROMPT.parseAsync({
        ...(item.payload.values as Payload),
        promptId: item.payload.id,
        ...ids(scope)
      });
      const { previous } = await projectActions.updatePrompt(caller, values);
      return { id: item.payload.id, values: promptValues(previous) };
    },
    check: async (caller, scope, _item, before) => {
      if (
        !(await promptRow(caller, scope.artifactId, (before as Payload).id))
      ) {
        throw new Error(
          'That prompt was removed since, so there is nothing to put back.'
        );
      }
    },
    undo: async (caller, scope, _item, before) => {
      const { id, values } = before as Payload;
      await projectActions.updatePrompt(
        caller,
        await Schema.ARTIFACT_UPDATE_PROMPT.parseAsync({
          ...values,
          promptId: id,
          ...ids(scope)
        })
      );
    }
  },
  remove: {
    apply: async (caller, scope, item) => {
      const row = await promptRow(
        caller,
        scope.artifactId,
        String(item.payload.id)
      );
      if (!row) throw new Error('That prompt is already gone.');
      await projectActions.removePrompt(
        caller,
        await Schema.ARTIFACT_REMOVE_PROMPT.parseAsync({
          ...ids(scope),
          promptId: row.id
        })
      );
      return { values: promptValues(row) };
    },
    undo: async (caller, scope, _item, before) => {
      const { values } = before as Payload;
      await projectActions.createPrompt(
        caller,
        await Schema.ARTIFACT_CREATE_PROMPT.parseAsync({
          ...values,
          ...ids(scope)
        })
      );
    }
  }
};

const tools: Record<string, ItemHandler> = {
  add: {
    apply: async (caller, scope, item) => {
      const values = await Schema.ARTIFACT_CREATE_TOOL.parseAsync({
        toolKey: item.payload.toolKey,
        ...(item.payload.config ? { config: item.payload.config } : {}),
        ...(item.payload.metadata ? { metadata: item.payload.metadata } : {}),
        ...ids(scope)
      });
      return created((await projectActions.createTool(caller, values)).id);
    },
    undo: async (caller, scope, _item, before) => {
      const { id } = before as { id: string };
      if (!(await toolRow(caller, scope.artifactId, id))) return;
      await projectActions.removeTool(
        caller,
        await Schema.ARTIFACT_REMOVE_TOOL.parseAsync({
          toolId: id,
          ...ids(scope)
        })
      );
    }
  },
  change: {
    apply: async (caller, scope, item) => {
      const { previous } = await projectActions.updateTool(
        caller,
        await Schema.ARTIFACT_UPDATE_TOOL.parseAsync({
          toolId: item.payload.id,
          ...(item.payload.config ? { config: item.payload.config } : {}),
          ...(item.payload.metadata ? { metadata: item.payload.metadata } : {}),
          ...ids(scope)
        })
      );
      return {
        id: item.payload.id,
        config: previous.config,
        metadata: previous.metadata
      };
    },
    check: async (caller, scope, _item, before) => {
      if (!(await toolRow(caller, scope.artifactId, (before as Payload).id))) {
        throw new Error(
          'That tool was removed since, so there is nothing to put back.'
        );
      }
    },
    undo: async (caller, scope, _item, before) => {
      const { id, config, metadata } = before as Payload;
      await projectActions.updateTool(
        caller,
        await Schema.ARTIFACT_UPDATE_TOOL.parseAsync({
          toolId: id,
          ...(config ? { config } : {}),
          ...(metadata ? { metadata } : {}),
          ...ids(scope)
        })
      );
    }
  },
  turn: {
    apply: async (caller, scope, item) => {
      const { previous } = await projectActions.setToolEnabled(
        caller,
        await Schema.ARTIFACT_SET_TOOL_ENABLED.parseAsync({
          toolId: item.payload.id,
          enabled: item.payload.enabled,
          ...ids(scope)
        })
      );
      return { id: item.payload.id, enabled: previous.enabled };
    },
    undo: async (caller, scope, _item, before) => {
      const { id, enabled } = before as Payload;
      if (!(await toolRow(caller, scope.artifactId, id))) return;
      await projectActions.setToolEnabled(
        caller,
        await Schema.ARTIFACT_SET_TOOL_ENABLED.parseAsync({
          toolId: id,
          enabled,
          ...ids(scope)
        })
      );
    }
  },
  remove: {
    apply: async (caller, scope, item) => {
      const row = await toolRow(
        caller,
        scope.artifactId,
        String(item.payload.id)
      );
      if (!row) throw new Error('That tool is already gone.');
      await projectActions.removeTool(
        caller,
        await Schema.ARTIFACT_REMOVE_TOOL.parseAsync({
          toolId: row.id,
          ...ids(scope)
        })
      );
      return {
        toolKey: row.toolKey,
        config: row.config,
        metadata: row.metadata,
        enabled: row.enabled
      };
    },
    undo: async (caller, scope, _item, before) => {
      const { toolKey, config, metadata, enabled } = before as Payload;
      // Its own key or sign-in went with it: put back without one, for the
      // owner to add again.
      const auth = (config as Payload | null)?.auth;
      const values = await Schema.ARTIFACT_CREATE_TOOL.parseAsync({
        toolKey,
        ...(config
          ? {
              config: auth?.credentialId
                ? { ...(config as Payload), auth: { kind: 'none' } }
                : config
            }
          : {}),
        ...(metadata ? { metadata } : {}),
        ...ids(scope)
      });
      const tool = await projectActions.createTool(caller, values);
      if (!enabled) {
        await projectActions.setToolEnabled(
          caller,
          await Schema.ARTIFACT_SET_TOOL_ENABLED.parseAsync({
            toolId: tool.id,
            enabled: false,
            ...ids(scope)
          })
        );
      }
    }
  }
};

export const projectHandler = (area: ItemArea, op: string): ItemHandler => {
  const handler =
    area === 'knowledge'
      ? knowledge[op]
      : area === 'prompts'
        ? prompts[op]
        : area === 'tools'
          ? tools[op]
          : undefined;
  if (!handler) throw new Error(`Unknown change ${area} ${op}`);
  return handler;
};
