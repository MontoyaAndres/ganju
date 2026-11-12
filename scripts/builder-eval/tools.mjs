// The builder's tools for the spike: one tool per area with an `action`
// field, run against the dev API as the owner. Changes the bot or its
// clients would see are staged, then applied together when the (simulated)
// owner clicks Apply on the change set.
import * as XLSX from 'xlsx';
import { utils } from '@ganju/utils';
import { API_URL, api, mcp, token, toolText } from './api.mjs';
import { FILES } from './fixtures.mjs';

const MAX_RESULT = 24_000;
const clip = text =>
  text.length > MAX_RESULT
    ? text.slice(0, MAX_RESULT) +
      `\n…(${text.length - MAX_RESULT} more characters cut)`
    : text;
const json = value => JSON.stringify(value, null, 1);
const outside = (source, value) =>
  utils.wrapUntrustedContent(
    source,
    typeof value === 'string' ? value : json(value)
  );

const obj = (properties, required = []) => ({
  type: 'object',
  properties,
  required
});
const anyObject = description => ({
  type: 'object',
  description,
  additionalProperties: true
});

export const toolDefinitions = [
  {
    name: 'project',
    description:
      'What the project is made of right now: its actions, tools (on/off), data tables, saved queries, triggers, knowledge, prompts, connected accounts, secret labels, and how its tools have been doing (calls, errors) over the last 7 days.',
    input_schema: obj({ action: { type: 'string', enum: ['overview'] } }, [
      'action'
    ])
  },
  {
    name: 'functions',
    description: `The project's actions (code).
- read: the files, manifest and config of a version (default: the live one, or the newest draft when nothing is live). Lists all versions too.
- save_draft: save a new draft from the complete set of files plus the manifest (and optionally config). Returns its versionId. Nobody sees drafts. Always send every file and every action of the project, not only the changed ones.
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
    description: `The project's database.
Read (free): describe (tables, columns, saved queries, triggers, time zone), rows (table, where, limit), run_query (name, params).
Stage (applied with the change set): op one of create_database, set_timezone {timeZone}, create_table {table: {name, description?, access, columns:[...]}}, add_column {table, column}, update_column {table, column, patch}, insert_rows {table, rows:[{...}]}, update_row {table, id, set}, import_file {table, file, columns: {"Header in file": "column"}}, create_query {query: {name, description, sql, params, assistant}}, create_trigger {trigger: {...}}, delete_table {table}.`,
    input_schema: obj(
      {
        action: {
          type: 'string',
          enum: ['describe', 'rows', 'run_query', 'stage']
        },
        table: { type: 'string' },
        where: anyObject('rows: filter like {"status":"open"}'),
        limit: { type: 'integer' },
        name: { type: 'string', description: 'run_query: saved query name' },
        params: anyObject('run_query params'),
        op: { type: 'string' },
        payload: anyObject('stage: the op fields'),
        label: {
          type: 'string',
          description: 'stage: the line the owner reads on the card'
        }
      },
      ['action']
    )
  },
  {
    name: 'knowledge',
    description: `What the bot knows: notes, files and websites.
Read (free): list, search {query}, read {uri}.
Stage: op note {title, text}, website {url, title, maxPages}, delete {resourceId}. Files come from the owner via ask_owner kind "upload".`,
    input_schema: obj(
      {
        action: { type: 'string', enum: ['list', 'search', 'read', 'stage'] },
        query: { type: 'string' },
        uri: { type: 'string' },
        op: { type: 'string', enum: ['note', 'website', 'delete'] },
        payload: anyObject('stage fields'),
        label: { type: 'string' }
      },
      ['action']
    )
  },
  {
    name: 'prompts',
    description:
      "Slash-command prompt templates the bot's users can pick. Read: list. Stage: op create {title, description, messages:[{role, content}], schema}, update {promptId, ...same}, delete {promptId}. Every {{var}} in messages must be in schema.properties.",
    input_schema: obj(
      {
        action: { type: 'string', enum: ['list', 'stage'] },
        op: { type: 'string', enum: ['create', 'update', 'delete'] },
        payload: anyObject('stage fields'),
        label: { type: 'string' }
      },
      ['action']
    )
  },
  {
    name: 'tools',
    description: `Ready-made tools.
Read: catalog {query?} (what can be added, and which account each needs), list (what the project has, with ids and on/off).
Stage: op install {toolKey, config?}, http_endpoint {config}, enable {toolId}, disable {toolId}, remove {toolId}, action_settings {config} (the actions' allowedHosts/connections/timeoutMs without a new draft).`,
    input_schema: obj(
      {
        action: { type: 'string', enum: ['catalog', 'list', 'stage'] },
        query: { type: 'string' },
        op: {
          type: 'string',
          enum: [
            'install',
            'http_endpoint',
            'enable',
            'disable',
            'remove',
            'action_settings'
          ]
        },
        payload: anyObject('stage fields'),
        label: { type: 'string' }
      },
      ['action']
    )
  },
  {
    name: 'propose_changes',
    description:
      'Show the owner everything staged so far as one change set card with an Apply button, and wait for their click. summary: one or two plain sentences of what the change does for them. Returns what was applied (or why something failed).',
    input_schema: obj({ summary: { type: 'string' } }, ['summary'])
  },
  {
    name: 'ask_owner',
    description:
      'Show the owner a card for something only they can do: kind "connect_account" (provider, e.g. google-calendar), "secret" (label, plus step-by-step where to find it in message), or "upload" (what file you need in message). Values never enter the conversation; you get back what they did.',
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

// Running them

export const createSession = ({ p, slug, ownerFiles = [], owner, log }) => {
  const session = {
    p,
    slug,
    ownerFiles,
    uploaded: {},
    staged: [],
    applied: [],
    cards: [],
    tests: [],
    counts: {}
  };

  const stage = (area, op, payload, label) => {
    session.staged.push({
      area,
      op,
      payload: payload ?? {},
      label: label ?? `${area} ${op}`
    });
    return `Staged #${session.staged.length}: ${label ?? `${area} ${op}`}. It takes effect when the owner applies the change set (propose_changes).`;
  };

  const customCodeToolId = async () => {
    const tools = await p.get('/artifact/tool');
    return tools.find(t => t.toolKey === 'custom-code')?.id;
  };

  // The signed-in owner, as the dashboard knows them (email included).
  let account;
  const ownerAccount = async () => {
    if (account) return account;
    const response = await fetch(`${API_URL}/auth/oauth2/userinfo`, {
      headers: { authorization: `Bearer ${await token()}` }
    });
    const info = response.ok ? await response.json() : {};
    account = { name: info.name ?? null, email: info.email ?? null };
    return account;
  };

  const overview = async () => {
    const [
      project,
      artifact,
      tools,
      versions,
      data,
      prompts,
      resources,
      credentials,
      connections,
      health
    ] = await Promise.all([
      p.get(''),
      p.get('/artifact'),
      p.get('/artifact/tool'),
      p.get('/artifact/custom-code/versions').catch(() => null),
      p.get('/artifact/data').catch(e => ({ error: e.message })),
      p.get('/artifact/prompt'),
      p.get('/artifact/resource'),
      p.get('/artifact/credential').catch(() => []),
      p.get('/artifact/connections').catch(() => null),
      p.get('/observability/tools', { query: { days: 7 } }).catch(() => null)
    ]);
    let queries = [];
    let triggers = [];
    let tables = [];
    if (data?.database) {
      // The database summary counts columns; the table list has them.
      tables = (
        await p.get('/artifact/data/table').catch(() => ({ tables: [] }))
      ).tables;
      queries = (
        await p.get('/artifact/data/query').catch(() => ({ queries: [] }))
      ).queries;
      triggers = (
        await p.get('/artifact/data/trigger').catch(() => ({ triggers: [] }))
      ).triggers;
    }
    return {
      owner: await ownerAccount(),
      botInstructions: project?.[0]?.botInstructions ?? null,
      slug: artifact.slug,
      tools: tools.map(t => ({
        id: t.id,
        toolKey: t.toolKey,
        enabled: t.enabled,
        name: t.config?.name ?? t.toolDefinition?.name ?? null,
        config: t.toolKey === 'custom-code' ? t.config : undefined
      })),
      actions: versions
        ? {
            liveVersionId: versions.activeVersionId,
            versions: versions.versions.slice(0, 5).map(v => ({
              id: v.id,
              version: v.version,
              status: v.status,
              kind: v.sourceKind,
              tools: v.tools.map(t => t.name),
              error: v.error
            }))
          }
        : null,
      data: data?.database
        ? {
            timeZone: data.database.timeZone,
            tables: tables.map(t => ({
              name: t.name,
              access: t.access,
              rows: data.database.tables?.find(s => s.name === t.name)?.rows,
              columns: (Array.isArray(t.columns) ? t.columns : []).map(
                c => `${c.name}:${c.type}`
              )
            })),
            // The judge checks what was built against the request: a
            // query's SQL, and when and how a trigger runs.
            queries: queries.map(q => ({
              name: q.name,
              sql: q.sql,
              params: q.params
            })),
            triggers: triggers.map(t => ({
              name: t.name,
              table: t.table,
              on: t.on,
              enabled: t.enabled,
              ...(t.after ? { after: t.after } : {}),
              ...(t.when ? { when: t.when } : {}),
              ...(t.on === 'schedule'
                ? {
                    every: t.every,
                    at: t.at,
                    days: t.days,
                    query: t.query,
                    params: t.params,
                    skipEmpty: t.skipEmpty
                  }
                : {}),
              action: t.action
            }))
          }
        : data?.error
          ? { error: data.error }
          : 'no database yet',
      knowledge: resources.map(r => ({
        id: r.id,
        title: r.title,
        uri: r.uri,
        status: r.status,
        sourceType: r.sourceType
      })),
      prompts: prompts.map(x => ({ id: x.id, title: x.title })),
      secretLabels: (credentials ?? []).map(c => c.label).filter(Boolean),
      accounts: connections?.connections ?? connections,
      health: health
        ? {
            tools: health.tools
              .filter(t => t.calls || t.errors)
              .map(t => ({ name: t.name, calls: t.calls, errors: t.errors })),
            errors: health.errors
          }
        : null
    };
  };

  const readVersion = async versionId => {
    const versions = await p
      .get('/artifact/custom-code/versions')
      .catch(() => null);
    if (!versions?.versions?.length)
      return { versions: [], note: 'The project has no actions yet.' };
    const id = versionId ?? versions.activeVersionId ?? versions.versions[0].id;
    const source = await p.get(`/artifact/custom-code/version/${id}/source`);
    const toolId = await customCodeToolId();
    const config = toolId
      ? (await p.get('/artifact/tool')).find(t => t.id === toolId)?.config
      : null;
    return {
      liveVersionId: versions.activeVersionId,
      versions: versions.versions.slice(0, 8).map(v => ({
        id: v.id,
        version: v.version,
        status: v.status,
        kind: v.sourceKind,
        tools: v.tools.map(t => t.name),
        error: v.error
      })),
      shown: {
        versionId: id,
        kind: source.sourceKind,
        editable: source.editable,
        files: source.files ?? { 'index.js': source.source },
        manifest: { tools: source.tools }
      },
      config
    };
  };

  const saveDraft = async ({ files, manifest, config }) => {
    if (!files || !files['index.js'])
      throw new Error('save_draft needs files with index.js');
    if (!manifest?.tools?.length)
      throw new Error('save_draft needs manifest.tools');
    utils.validateProjectFiles(files);
    const version = await p.post('/artifact/custom-code/version', {
      manifest,
      ...(config ? { config } : {})
    });
    const body = Buffer.from(utils.encodeProject(files));
    const updated = await p.raw(
      'PUT',
      `/artifact/custom-code/version/${version.id}/bundle?kind=editor`,
      body,
      {
        'content-type': 'application/json'
      }
    );
    return {
      versionId: updated.id,
      version: updated.version,
      status: updated.status,
      error: updated.error,
      warnings: version.warnings
    };
  };

  const ownerFile = name => {
    const fixture = FILES[name];
    if (!fixture) throw new Error(`No file ${name}`);
    return { bytes: fixture.bytes(), contentType: fixture.contentType };
  };

  const importFile = async ({ table, file, columns }) => {
    const name =
      file ?? Object.keys(session.uploaded).find(f => /\.(xlsx|csv)$/.test(f));
    if (!name) throw new Error('No uploaded spreadsheet to import');
    const { bytes } = ownerFile(name);
    const book = XLSX.read(bytes);
    const sheet = book.Sheets[book.SheetNames[0]];
    const records = XLSX.utils.sheet_to_json(sheet, { defval: null });
    const map =
      columns ??
      Object.fromEntries(Object.keys(records[0] ?? {}).map(h => [h, h]));
    const rows = records.map(r =>
      Object.fromEntries(Object.entries(map).map(([h, c]) => [c, r[h]]))
    );
    const result = await p.post(`/artifact/data/table/${table}/row`, { rows });
    return { imported: result.ids?.length ?? rows.length };
  };

  const apply = async item => {
    const { area, op, payload: x } = item;
    const D = '/artifact/data';
    switch (`${area}.${op}`) {
      case 'functions.turn_on':
        return p.post(
          `/artifact/custom-code/version/${x.versionId}/publish`,
          {}
        );
      case 'data.create_database': {
        const created = await p.post(D, {});
        if (x.timeZone) await p.patch(D, { timeZone: x.timeZone });
        return { created: !!created.database };
      }
      case 'data.set_timezone':
        return p.patch(D, { timeZone: x.timeZone });
      case 'data.create_table':
        return p.post(`${D}/table`, x.table ?? x);
      case 'data.add_column':
        return p.post(`${D}/table/${x.table}/column`, x.column);
      case 'data.update_column':
        return p.patch(`${D}/table/${x.table}/column/${x.column}`, x.patch);
      case 'data.insert_rows':
        return p.post(`${D}/table/${x.table}/row`, { rows: x.rows });
      case 'data.update_row':
        return p.patch(`${D}/table/${x.table}/row/${x.id}`, { set: x.set });
      case 'data.import_file':
        return importFile(x);
      case 'data.create_query':
        return p.post(`${D}/query`, x.query ?? x);
      case 'data.create_trigger':
        return p.post(`${D}/trigger`, x.trigger ?? x);
      case 'data.delete_table':
        return p.del(`${D}/table/${x.table}`, { confirmName: x.table });
      case 'knowledge.note': {
        const slugged = x.title
          .toLowerCase()
          .normalize('NFD')
          .replace(/[^\w]+/g, '-')
          .replace(/^-|-$/g, '');
        return p.post('/artifact/resource', {
          title: x.title,
          uri: `resource://${slugged}-${Date.now().toString(36)}`,
          type: 'static',
          sourceType: 'FILE',
          mimeType: 'text/plain',
          content: x.text,
          size: Buffer.byteLength(x.text),
          encoding: 'utf-8'
        });
      }
      case 'knowledge.website':
        return p.post('/artifact/resource', {
          title: x.title ?? x.url,
          uri: x.url,
          sourceType: 'WEBSITE',
          crawlConfig: { maxPages: x.maxPages ?? 10, maxDepth: 2 }
        });
      case 'knowledge.delete':
        return p.del(`/artifact/resource/${x.resourceId}`);
      case 'prompts.create':
        return p.post('/artifact/prompt', x);
      case 'prompts.update': {
        const { promptId, ...rest } = x;
        return p.put(`/artifact/prompt/${promptId}`, rest);
      }
      case 'prompts.delete':
        return p.del(`/artifact/prompt/${x.promptId}`);
      case 'tools.install':
        return p.post('/artifact/tool', {
          toolKey: x.toolKey,
          ...(x.config ? { config: x.config } : {})
        });
      case 'tools.http_endpoint':
        return p.post('/artifact/tool', {
          toolKey: 'http-endpoint',
          config: x.config ?? x
        });
      case 'tools.enable':
      case 'tools.disable':
        return p.patch(`/artifact/tool/${x.toolId}/enabled`, {
          enabled: op === 'enable'
        });
      case 'tools.remove':
        return p.del(`/artifact/tool/${x.toolId}`);
      case 'tools.action_settings': {
        const id = await customCodeToolId();
        if (!id) throw new Error('The project has no actions yet');
        const current =
          (await p.get('/artifact/tool')).find(t => t.id === id)?.config ?? {};
        return p.put(`/artifact/tool/${id}`, {
          config: { ...current, ...(x.config ?? x) }
        });
      }
      default:
        throw new Error(`Unknown change ${area}.${op}`);
    }
  };

  const proposeChanges = async ({ summary }) => {
    if (!session.staged.length) return 'Nothing is staged.';
    const items = session.staged.splice(0);
    session.cards.push({
      kind: 'change_set',
      summary,
      items: items.map(i => i.label)
    });
    log?.(
      `  [card] change set: ${summary}\n${items.map(i => `     - ${i.label}`).join('\n')}`
    );
    // Owners click the button they see; the card is the safeguard.
    const results = [];
    for (const [i, item] of items.entries()) {
      try {
        const result = await apply(item);
        session.applied.push(item);
        results.push(
          `✓ ${item.label}${result?.error ? ` (warning: ${result.error})` : ''}`
        );
      } catch (error) {
        results.push(`✗ ${item.label}: ${error.message}`);
        for (const rest of items.slice(i + 1))
          results.push(`· not applied: ${rest.label}`);
        session.staged.push(...items.slice(i + 1));
        break;
      }
    }
    return `The owner clicked Apply.\n${results.join('\n')}`;
  };

  const askOwner = async ({ kind, provider, label, message }) => {
    session.cards.push({ kind, provider, label, message });
    log?.(
      `  [card] ${kind}${provider ? ` ${provider}` : ''}${label ? ` ${label}` : ''}: ${message.slice(0, 160)}`
    );
    if (kind === 'upload') {
      const name = session.ownerFiles.find(f => !session.uploaded[f]);
      if (!name)
        return 'The owner closed the card: they have no other file to give.';
      const { bytes, contentType } = ownerFile(name);
      const row = await p.post('/artifact/resource', {
        title: name,
        uri: `resource://${name.replace(/[^\w]+/g, '-')}-${Date.now().toString(36)}`,
        type: 'static',
        sourceType: 'FILE',
        mimeType: contentType,
        size: bytes.length,
        fileName: name
      });
      await p.raw('POST', `/artifact/resource/${row.id}/upload`, bytes, {
        'content-type': contentType,
        'x-file-name': encodeURIComponent(name)
      });
      session.uploaded[name] = row.id;
      return `The owner uploaded "${name}" (${bytes.length} bytes). It is in the project's knowledge as resource ${row.id} (uri ${row.uri}); indexing takes about a minute.${/\.(xlsx|csv)$/.test(name) ? ` To load its rows into a table, stage data import_file with file "${name}".` : ''}`;
    }
    if (kind === 'connect_account') {
      // A script can't finish an OAuth consent, so the eval says so plainly
      // and the case is judged on what was built around the connection.
      return `The owner clicked Connect for ${provider} and finished signing in. Note from the test setup: this test project can't hold a real account connection, so calls that use it will answer "not connected". Don't retry them or troubleshoot the connection; finish building and staging everything as if it were connected, and tell the owner how to try it.`;
    }
    const reply = await owner(
      `[A card asks you for a secret "${label}"]\n${message}`
    );
    return `The owner closed the card without entering a value and wrote: ${reply}`;
  };

  const run = async (name, input) => {
    session.counts[name] = (session.counts[name] ?? 0) + 1;
    const a = input.action;
    switch (name) {
      case 'project':
        return json(await overview());
      case 'functions':
        if (a === 'read') return json(await readVersion(input.versionId));
        if (a === 'save_draft') return json(await saveDraft(input));
        if (a === 'logs') {
          const logs = await p.get('/artifact/custom-code/logs', {
            query: { tool: input.tool, limit: input.limit ?? 20 }
          });
          return outside('action logs', logs.entries);
        }
        if (a === 'turn_on') {
          if (!input.versionId) throw new Error('turn_on needs versionId');
          return stage(
            'functions',
            'turn_on',
            { versionId: input.versionId },
            input.label
          );
        }
        break;
      case 'run_test': {
        const result = await p.post(
          `/artifact/custom-code/version/${input.versionId}/test`,
          {
            tool: input.tool,
            input: input.input ?? {}
          }
        );
        session.tests.push({
          tool: input.tool,
          input: input.input ?? {},
          result: JSON.stringify(result).slice(0, 1500)
        });
        return outside(`test of ${input.tool}`, result);
      }
      case 'data': {
        const D = '/artifact/data';
        if (a === 'describe') {
          const data = await p.get(D);
          if (!data.database) return 'The project has no database yet.';
          const [queries, triggers] = await Promise.all([
            p.get(`${D}/query`).catch(() => ({ queries: [] })),
            p.get(`${D}/trigger`).catch(() => ({ triggers: [] }))
          ]);
          return json({
            database: data.database,
            queries: queries.queries,
            triggers: triggers.triggers
          });
        }
        if (a === 'rows') {
          const rows = await p.get(`${D}/table/${input.table}/row`, {
            query: {
              where: input.where ? JSON.stringify(input.where) : undefined,
              limit: input.limit ?? 50
            }
          });
          return outside(`data:${input.table}`, rows.rows);
        }
        if (a === 'run_query') {
          const result = await p.post(`${D}/query/${input.name}/run`, {
            params: input.params ?? {},
            limit: input.limit ?? 50
          });
          return outside(`data:query ${input.name}`, result.rows);
        }
        if (a === 'stage')
          return stage('data', input.op, input.payload, input.label);
        break;
      }
      case 'knowledge':
        if (a === 'list')
          return json(
            (await p.get('/artifact/resource')).map(r => ({
              id: r.id,
              title: r.title,
              uri: r.uri,
              status: r.status,
              type: r.sourceType
            }))
          );
        if (a === 'search')
          return outside(
            'knowledge search',
            toolText(
              await mcp(slug, 'tools/call', {
                name: 'search-resources',
                arguments: { query: input.query }
              })
            )
          );
        if (a === 'read')
          return outside(
            `knowledge ${input.uri}`,
            toolText(
              await mcp(slug, 'tools/call', {
                name: 'read-resource',
                arguments: { uri: input.uri }
              })
            )
          );
        if (a === 'stage')
          return stage('knowledge', input.op, input.payload, input.label);
        break;
      case 'prompts':
        if (a === 'list') return json(await p.get('/artifact/prompt'));
        if (a === 'stage')
          return stage('prompts', input.op, input.payload, input.label);
        break;
      case 'tools':
        if (a === 'catalog') {
          const catalog = await api('GET', '/catalog/tools').catch(() => null);
          const groups = (catalog ?? []).map(g => ({
            group: g.key,
            title: g.title,
            needsAccount: g.provider,
            description: g.description,
            tools: g.tools.map(t => ({
              toolKey: t.key,
              description: t.description
            }))
          }));
          const q = input.query?.toLowerCase();
          const hits = q
            ? groups.filter(g => JSON.stringify(g).toLowerCase().includes(q))
            : groups;
          return outside(
            'tool catalog',
            hits.length
              ? hits
              : groups.map(g => ({
                  group: g.group,
                  title: g.title,
                  needsAccount: g.needsAccount
                }))
          );
        }
        if (a === 'list')
          return json(
            (await p.get('/artifact/tool')).map(t => ({
              id: t.id,
              toolKey: t.toolKey,
              enabled: t.enabled,
              name: t.toolDefinition?.name ?? t.config?.name
            }))
          );
        if (a === 'stage')
          return stage('tools', input.op, input.payload, input.label);
        break;
      case 'propose_changes':
        return proposeChanges(input);
      case 'ask_owner':
        return askOwner(input);
    }
    throw new Error(`Unknown ${name} action ${a}`);
  };

  session.call = async (name, input) => {
    try {
      return { content: clip(await run(name, input ?? {})), isError: false };
    } catch (error) {
      return { content: clip(`Error: ${error.message}`), isError: true };
    }
  };
  session.overview = overview;
  session.readVersion = readVersion;
  session.saveDraft = saveDraft;
  return session;
};
