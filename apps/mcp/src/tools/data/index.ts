import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { and, eq } from 'drizzle-orm';
import {
  db,
  type Database,
  type DataNamespaceLike,
  type DataUsageTally,
  type OpenedDatabase
} from '@ganju/db';
import { utils, type JsonSchema } from '@ganju/utils';
import {
  DATA_TOOL_ADMIN,
  DATA_TOOL_DESCRIBE,
  DATA_TOOL_MAX_LIMIT,
  DATA_TOOL_QUERY,
  DATA_TOOL_WRITE,
  DataError,
  dataAdminToolDefinition,
  dataToolDefinitions,
  isSensitiveWrite,
  toTableInput,
  type DataCaller,
  type DataQuery,
  type DataResult,
  type DataSchema,
  type DataToolDefinition
} from '@ganju/utils/data';
import {
  importRows,
  matchHeaders,
  parseCsv,
  relationKey,
  type ImportCell,
  type RelationLookup
} from '@ganju/utils/dataImport';
import type { R2Bucket } from '@cloudflare/workers-types';

import {
  BOOT_RESOURCE_SELECTION,
  readResourceContent,
  withResourceContent,
  type PendingRequest
} from '../../utils';

// The project's database, as the assistant reaches it: data-describe,
// data-query and data-write for everyone the database has a table for, and
// data-admin for the owner's own MCP client. Every call goes to the same
// object methods the Data API calls, under this session's caller.

// Who this session is to the database. A channel bot is restricted (each
// table's assistant access applies) and scoped to its customer; an owner or
// admin signed in to their own client works on every table, as in the
// dashboard.
export interface DataSession {
  caller: Omit<DataCaller, 'limits'>;
  // Offered data-admin: signed in as an owner or admin of the organization,
  // never a bot, never a machine token.
  owner: boolean;
}

export interface LoadedData {
  opened: OpenedDatabase;
  caller: DataCaller;
  schema: DataSchema;
  queries: DataQuery[];
}

/**
 * The database and what this session may see of it, or null when the
 * project has no READY database. One Postgres read for the row and plan, then
 * the schema and named queries from the object, together.
 */
export const loadDataTools = async (
  dbInstance: Database,
  namespace: DataNamespaceLike,
  artifactId: string,
  session: DataSession,
  tally: DataUsageTally
): Promise<LoadedData | null> => {
  const opened = await db.data.openArtifactDatabase(
    dbInstance,
    namespace,
    artifactId
  );
  if (!opened) return null;
  const listing = db.data.dataCaller(opened, session.caller);
  const [schema, queries] = await Promise.all([
    db.data.callData('schemaRead', () => opened.stub.schemaRead(), tally, {
      retryRead: true
    }),
    db.data.callData(
      'listQueries',
      () => opened.stub.listQueries(listing),
      tally,
      {
        retryRead: true
      }
    )
  ]);
  // A caller's own zone (a channel's calendar zone) wins, as in the object;
  // the zone the owner set for the data is the fallback. Set here too, since
  // the tool descriptions tell the model today's date in it.
  const caller =
    !listing.timeZone && schema.timeZone
      ? { ...listing, timeZone: schema.timeZone }
      : listing;
  return { opened, caller, schema, queries };
};

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
};

const text = (value: string): ToolResult => ({
  content: [{ type: 'text', text: value }]
});

// Compact: every byte of a result is read by the model.
const json = (value: unknown) => JSON.stringify(value);

// Rows can hold what customers wrote through a channel, or what a CSV
// brought in: outside text, wrapped always and flagged only when it reads
// like instructions, so an order after a menu lookup doesn't ask.
const rowsResult = (source: string, value: unknown): ToolResult =>
  utils.labelOwnToolResult(text(json(value)), source) as ToolResult;

// The engine's message is written for the caller. Its details can carry a
// row (the current one, on a conflict), so they go back as outside text.
const errorResult = (source: string, error: unknown): ToolResult => {
  if (!(error instanceof DataError)) {
    return {
      ...text(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      ),
      isError: true
    };
  }
  if (!error.details)
    return { ...text(`Error: ${error.message}`), isError: true };
  const detail = json(error.details);
  return utils.untrustedErrorResult(`Error: ${error.message}`, source, detail, {
    flag: utils.readsLikeInstructions(detail)
  });
};

// A page past the result-size limit is read again with fewer rows, so its
// nextCursor still starts right after the last row shown.
const MAX_RESULT_BYTES = utils.constants.MCP_PROXY_MAX_RESPONSE_BYTES;

const sizeOf = (value: unknown) =>
  new TextEncoder().encode(json(value)).byteLength;

interface RegisterOptions {
  loaded: LoadedData;
  session: DataSession;
  tally: DataUsageTally;
  dbInstance: Database;
  bucket: R2Bucket;
  artifactId: string;
  pendingRequests: PendingRequest[];
  // Names already taken on this server; data tools register first, so this
  // only guards a second registration.
  registeredToolNames: Map<string, string | null>;
}

/**
 * Registers the data tools this session may use. Nothing when it sees no
 * table: a hidden table doesn't exist for the model, and neither do tools
 * over nothing. Returns the names registered.
 */
export const registerDataTools = (
  mcpServer: McpServer,
  options: RegisterOptions
): string[] => {
  const { loaded, session, tally, pendingRequests } = options;
  const { opened, caller, schema } = loaded;
  const definitions: DataToolDefinition[] = dataToolDefinitions(
    schema,
    caller,
    {
      queries: loaded.queries
    }
  );
  if (session.owner) definitions.push(dataAdminToolDefinition());
  const registered: string[] = [];

  const record = (
    name: string,
    args: Record<string, unknown>,
    startedAt: number,
    result: ToolResult
  ) => {
    pendingRequests.push({
      method: utils.constants.MCP_REQUEST_METHOD_TOOLS_CALL,
      toolName: name,
      artifactToolId: null,
      input: args,
      output: result,
      latencyMs: Date.now() - startedAt,
      errorMessage: result.isError ? result.content[0]?.text : undefined
    });
    return result;
  };

  const handlers: Record<
    string,
    (args: Record<string, unknown>) => Promise<ToolResult>
  > = {
    [DATA_TOOL_DESCRIBE]: async args =>
      // The owner's own words about their tables: not outside content.
      text(
        json(
          await db.data.callData(
            'describe',
            () => opened.stub.describe(caller, args),
            tally,
            {
              retryRead: true
            }
          )
        )
      ),

    [DATA_TOOL_QUERY]: async args => {
      if (typeof args.query === 'string' && args.query) {
        const result = await db.data.callData(
          'runQuery',
          () =>
            opened.stub.runQuery(caller, {
              name: args.query as string,
              params: (args.params ?? {}) as Record<string, unknown>,
              limit: DATA_TOOL_MAX_LIMIT
            }),
          tally,
          { retryRead: true }
        );
        return rowsResult(DATA_TOOL_QUERY, result);
      }
      const { query: _query, params: _params, ...rest } = args;
      const asked = typeof rest.limit === 'number' ? rest.limit : undefined;
      let limit =
        asked === undefined
          ? undefined
          : Math.min(Math.max(1, asked), DATA_TOOL_MAX_LIMIT);
      const read = () =>
        db.data.callData(
          'query',
          () =>
            opened.stub.query(caller, { ...rest, ...(limit ? { limit } : {}) }),
          tally,
          { retryRead: true }
        );
      let result = (await read()) as { rows?: unknown[] };
      const rows = result.rows;
      if (
        Array.isArray(rows) &&
        rows.length > 1 &&
        sizeOf(result) > MAX_RESULT_BYTES
      ) {
        // Keep the share of rows that fits, and read that many again.
        limit = Math.max(
          1,
          Math.floor((rows.length * MAX_RESULT_BYTES) / sizeOf(result)) - 1
        );
        result = (await read()) as { rows?: unknown[] };
      }
      return rowsResult(DATA_TOOL_QUERY, result);
    },

    [DATA_TOOL_WRITE]: async args =>
      text(
        json(
          await db.data.callData(
            'write',
            () => opened.stub.write(caller, args),
            tally
          )
        )
      ),

    [DATA_TOOL_ADMIN]: args => runAdmin(options, args)
  };

  for (const definition of definitions) {
    if (options.registeredToolNames.has(definition.name)) continue;
    const handler = handlers[definition.name];
    const config = {
      title: definition.title,
      description: definition.description,
      inputSchema: utils.jsonSchemaToZodShape(
        definition.inputSchema as JsonSchema
      ),
      annotations: definition.annotations,
      // Deletes and values set outright ask; an order and its stock
      // decrement don't. Read by the confirmation wrapper, ignored otherwise.
      ...(definition.name === DATA_TOOL_WRITE
        ? {
            sensitiveCall: (args: Record<string, unknown>) => {
              try {
                return isSensitiveWrite(args, schema);
              } catch {
                return true;
              }
            }
          }
        : {})
    };
    mcpServer.registerTool(
      definition.name,
      config as Parameters<McpServer['registerTool']>[1],
      async (args: Record<string, unknown>) => {
        const startedAt = Date.now();
        try {
          return record(definition.name, args, startedAt, await handler(args));
        } catch (error) {
          return record(
            definition.name,
            args,
            startedAt,
            errorResult(definition.name, error)
          );
        }
      }
    );
    options.registeredToolNames.set(definition.name, null);
    registered.push(definition.name);
  }
  return registered;
};

// data-admin

const ADMIN_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const ADMIN_IMPORT_BATCH = 500;

const parseWith = <T>(
  schema: {
    safeParse(value: unknown):
      | { success: true; data: T }
      | {
          success: false;
          error: { issues: { path: PropertyKey[]; message: string }[] };
        };
  },
  value: unknown,
  what: string
): T => {
  const parsed = schema.safeParse(value ?? {});
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  throw new DataError(
    `${what}: ${issue.path.length ? `${issue.path.join('.')}: ` : ''}${issue.message}`
  );
};

const requireText = (value: unknown, what: string): string => {
  if (typeof value !== 'string' || !value)
    throw new DataError(`"${what}" is required.`);
  return value;
};

// The structural changes the Data API makes, through the same object methods
// and into the same change log, named after the owner's MCP session.
const runAdmin = async (
  options: RegisterOptions,
  args: Record<string, unknown>
): Promise<ToolResult> => {
  const { loaded, tally, dbInstance } = options;
  const { opened, caller } = loaded;
  const { Schema } = utils;
  const call = <T>(method: string, run: () => Promise<DataResult<T>>) =>
    db.data.callData(method, run, tally);
  const log = (
    kind: string,
    target: string | null,
    detail?: unknown,
    bookmark?: string | null
  ) =>
    db.data.recordChange(dbInstance, opened.row.id, {
      actor: caller.actor,
      kind,
      target,
      detail,
      bookmark: bookmark ?? null
    });
  const table = () => requireText(args.table, 'table');
  const column = () => requireText(args.column, 'column');

  switch (args.action) {
    case 'schema': {
      const schema = await call('schemaRead', () => opened.stub.schemaRead());
      const queries = await call('listQueries', () =>
        opened.stub.listQueries(caller)
      );
      return text(
        json({
          tables: schema.tables.map(toTableInput),
          queries
        })
      );
    }
    case 'create_table': {
      const input = parseWith(Schema.DATA_TABLE_INPUT, args.input, 'input');
      const created = await call('createTable', () =>
        opened.stub.createTable(caller, input)
      );
      await log('table.create', created.name, input);
      return text(json({ table: created }));
    }
    case 'update_table': {
      const name = table();
      const patch = parseWith(Schema.DATA_TABLE_PATCH, args.input, 'input');
      const updated = await call('updateTable', () =>
        opened.stub.updateTable(caller, name, patch)
      );
      await log('table.update', name, patch);
      return text(json({ table: updated }));
    }
    case 'drop_table': {
      const name = table();
      const result = await call('dropTable', () =>
        opened.stub.dropTable(caller, name)
      );
      await log('table.drop', name, undefined, result.bookmark);
      return text(
        json({
          ...result,
          undo: 'Restore to this bookmark from the Data page or `ganju data restore --bookmark`.'
        })
      );
    }
    case 'add_column': {
      const name = table();
      const input = parseWith(Schema.DATA_COLUMN_INPUT, args.input, 'input');
      const updated = await call('addColumn', () =>
        opened.stub.addColumn(caller, name, input)
      );
      await log('column.add', `${name}.${input.name}`, input);
      return text(json({ table: updated }));
    }
    case 'update_column': {
      const name = table();
      const col = column();
      const patch = parseWith(Schema.DATA_COLUMN_PATCH, args.input, 'input');
      const result = await call('updateColumn', () =>
        opened.stub.updateColumn(caller, name, col, patch)
      );
      await log('column.update', `${name}.${col}`, patch, result.bookmark);
      return text(json(result));
    }
    case 'drop_column': {
      const name = table();
      const col = column();
      const result = await call('dropColumn', () =>
        opened.stub.dropColumn(caller, name, col)
      );
      await log('column.drop', `${name}.${col}`, undefined, result.bookmark);
      return text(json(result));
    }
    case 'save_query': {
      const input = parseWith(Schema.DATA_QUERY_INPUT, args.input, 'input');
      const query = await call('saveQuery', () =>
        opened.stub.saveQuery(caller, input)
      );
      await log('query.save', query.name, input);
      return text(json({ query }));
    }
    case 'drop_query': {
      const name = requireText(args.name ?? args.input, 'name');
      const result = await call('dropQuery', () =>
        opened.stub.dropQuery(caller, name)
      );
      await log('query.drop', name);
      return text(json(result));
    }
    case 'export': {
      const body = parseWith(
        Schema.DATA_EXPORT_BODY,
        args.format ? { format: args.format } : {},
        'format'
      );
      const result = await call('exportStart', () =>
        opened.stub.exportStart(caller, body)
      );
      await log('export', null, {
        exportId: result.exportId,
        format: body.format ?? 'jsonl'
      });
      return text(
        json({
          ...result,
          download:
            "It runs in the background; download it from the Data page's settings, or with `ganju data export`."
        })
      );
    }
    case 'import':
      return importResource(
        options,
        table(),
        requireText(args.resource, 'resource'),
        typeof args.sheet === 'string' ? args.sheet : undefined
      );
    default:
      throw new DataError(
        `"action" is one of: ${['schema', 'create_table', 'update_table', 'drop_table', 'add_column', 'update_column', 'drop_column', 'save_query', 'drop_query', 'import', 'export'].join(', ')}.`
      );
  }
};

const SPREADSHEET = /spreadsheetml|ms-excel|opendocument\.spreadsheet/i;

const pad = (n: number) => String(n).padStart(2, '0');

// A spreadsheet's own date as the text the database reads, as the
// dashboard's import does: a date alone when it has no time, else a
// wall-clock time.
const cellFromSheet = (cell: unknown): ImportCell => {
  if (cell instanceof Date) {
    const date = `${cell.getFullYear()}-${pad(cell.getMonth() + 1)}-${pad(cell.getDate())}`;
    if (!cell.getHours() && !cell.getMinutes() && !cell.getSeconds())
      return date;
    return `${date}T${pad(cell.getHours())}:${pad(cell.getMinutes())}:${pad(cell.getSeconds())}`;
  }
  return typeof cell === 'string' ||
    typeof cell === 'number' ||
    typeof cell === 'boolean'
    ? cell
    : null;
};

interface ImportFile {
  headers: string[];
  rows: ImportCell[][];
  // Each row's line in the file or sheet, counting the header.
  lines: number[];
}

// One sheet of an Excel file stored for the resource. SheetJS loads only
// for an import that needs it.
const readSheet = async (
  bytes: ArrayBuffer,
  uri: string,
  sheetName: string | undefined
): Promise<ImportFile> => {
  const XLSX = await import('xlsx');
  const book = XLSX.read(bytes, { cellDates: true, dense: true });
  const name = sheetName ?? book.SheetNames[0];
  const sheet = name ? book.Sheets[name] : undefined;
  if (!sheet) {
    throw new DataError(
      `${uri} has no sheet "${sheetName}". Sheets: ${book.SheetNames.join(', ')}.`,
      'not_found'
    );
  }
  const all = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true
  });
  // The sheet's range may start below row 1.
  const ref = (sheet as { '!ref'?: string })['!ref'];
  const firstLine = ref ? XLSX.utils.decode_range(ref).s.r + 1 : 1;
  const [header = [], ...body] = all;
  const rows: ImportCell[][] = [];
  const lines: number[] = [];
  body.forEach((row, i) => {
    const cells = row.map(cellFromSheet);
    if (cells.every(c => c === null || c === '')) return;
    rows.push(cells);
    lines.push(firstLine + 1 + i);
  });
  return {
    headers: header.map(h => (h === null ? '' : String(h))),
    rows,
    lines
  };
};

// Adds the rows of a CSV or Excel file in the project's knowledge to a
// table: the dashboard's header matching and value reading, in batches of
// 500. Rows that don't fit are listed, not written.
const importResource = async (
  options: RegisterOptions,
  tableName: string,
  uri: string,
  sheetName: string | undefined
): Promise<ToolResult> => {
  const { loaded, tally, dbInstance, bucket, artifactId } = options;
  const { opened, caller } = loaded;
  const [resource] = await dbInstance
    .select(BOOT_RESOURCE_SELECTION)
    .from(db.schema.artifactResource)
    .where(
      and(
        eq(db.schema.artifactResource.artifactId, artifactId),
        eq(db.schema.artifactResource.uri, uri)
      )
    )
    .limit(1);
  if (!resource)
    throw new DataError(
      `There is no resource ${uri} in this project.`,
      'not_found'
    );
  const tooLarge = () =>
    new DataError(
      'The file is over 5 MB; import it from the Data page or with `ganju data import`.',
      'too_large'
    );
  let parsed: ImportFile;
  if (resource.mimeType && SPREADSHEET.test(resource.mimeType)) {
    const object = resource.fileKey ? await bucket.get(resource.fileKey) : null;
    if (!object)
      throw new DataError(`${uri} has no stored file to read.`, 'not_found');
    if (object.size > ADMIN_IMPORT_MAX_BYTES) throw tooLarge();
    parsed = await readSheet(await object.arrayBuffer(), uri, sheetName);
  } else if (
    !resource.mimeType ||
    /csv|text\/plain|tab-separated/i.test(resource.mimeType)
  ) {
    const content = await readResourceContent(
      await withResourceContent(dbInstance, resource),
      new URL(uri),
      bucket
    );
    const raw = content.contents
      .map(c => ('text' in c && typeof c.text === 'string' ? c.text : ''))
      .join('\n');
    if (new TextEncoder().encode(raw).byteLength > ADMIN_IMPORT_MAX_BYTES) {
      throw tooLarge();
    }
    parsed = parseCsv(raw);
  } else {
    throw new DataError(
      `${uri} is ${resource.mimeType}; import reads CSV and Excel files.`
    );
  }
  const schema = await db.data.callData(
    'schemaRead',
    () => opened.stub.schemaRead(),
    tally
  );
  const target = schema.tables.find(t => t.name === tableName);
  if (!target)
    throw new DataError(`Unknown table "${tableName}".`, 'not_found');
  const mapping = matchHeaders(parsed.headers, target);
  if (mapping.every(m => m === null)) {
    throw new DataError(
      `None of the file's headers (${parsed.headers.join(', ')}) match a column of ${tableName} (${target.columns.map(c => c.name).join(', ')}).`
    );
  }

  // Relation cells name the related row by its display value.
  const relations: Record<string, RelationLookup> = {};
  for (const [i, name] of mapping.entries()) {
    const col = target.columns.find(c => c.name === name);
    if (!col || col.type !== 'relation' || !col.table) continue;
    const related = schema.tables.find(t => t.name === col.table);
    const display = related?.displayColumn;
    if (!related || !display) continue;
    const values = [
      ...new Set(
        parsed.rows
          .map(r => r[i])
          .filter(
            (v): v is string =>
              typeof v === 'string' && v !== '' && !/^\d+$/.test(v)
          )
      )
    ];
    const lookup: RelationLookup = new Map();
    for (let start = 0; start < values.length; start += 50) {
      const page = (await db.data.callData(
        'query',
        () =>
          opened.stub.query(caller, {
            table: related.name,
            where: { [display]: { in: values.slice(start, start + 50) } },
            limit: 500
          }),
        tally
      )) as { rows: Record<string, unknown>[] };
      for (const row of page.rows) {
        const key = String(row[display] ?? '')
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .trim()
          .toLowerCase();
        if (key) lookup.set(key, Number(row.id));
      }
    }
    relations[name as string] = lookup;
  }

  const imported = importRows(target, mapping, parsed.rows, {
    relations,
    timeZone: caller.timeZone,
    lines: parsed.lines
  });
  const good = imported.filter(row => row.errors.length === 0);
  const refused = imported.filter(row => row.errors.length > 0);
  let inserted = 0;
  let stopped: string | null = null;
  for (let start = 0; start < good.length; start += ADMIN_IMPORT_BATCH) {
    const batch = good.slice(start, start + ADMIN_IMPORT_BATCH);
    try {
      await db.data.callData(
        'write',
        () =>
          opened.stub.write(caller, {
            operations: [
              { op: 'insert', table: tableName, rows: batch.map(r => r.values) }
            ]
          }),
        tally
      );
    } catch (error) {
      // Each batch is all or nothing; the ones before it stay.
      stopped = `lines ${batch[0].line}–${batch[batch.length - 1].line} were not written: ${error instanceof Error ? error.message : String(error)}`;
      break;
    }
    inserted += batch.length;
  }
  await db.data.recordChange(dbInstance, opened.row.id, {
    actor: caller.actor,
    kind: 'import',
    target: tableName,
    detail: { resource: uri, inserted, refused: refused.length }
  });
  return text(
    json({
      table: tableName,
      inserted,
      refused: refused.length,
      ...(stopped ? { stopped } : {}),
      unmatchedHeaders: parsed.headers.filter((_, i) => mapping[i] === null),
      ...(refused.length
        ? {
            firstRefused: refused
              .slice(0, 10)
              .map(r => ({ line: r.line, errors: r.errors }))
          }
        : {})
    })
  );
};
