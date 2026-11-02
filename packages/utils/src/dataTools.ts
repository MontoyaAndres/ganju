// The data tools as a model sees them: names, descriptions and input schemas,
// built from the database's schema for one caller. The MCP worker registers
// them and the tool-design eval measures them, so the text the eval scored is
// the text that ships.
import { DATA_ACCESS_RANK } from './dataTypes';
import type {
  DataCaller,
  DataColumn,
  DataSchema,
  DataTable
} from './dataTypes';
import type { DataQuery } from './dataQueries';

export const DATA_TOOL_DESCRIBE = 'data-describe';
export const DATA_TOOL_QUERY = 'data-query';
export const DATA_TOOL_WRITE = 'data-write';
export const DATA_TOOL_ADMIN = 'data-admin';
export const DATA_TOOL_NAMES = [
  DATA_TOOL_DESCRIBE,
  DATA_TOOL_QUERY,
  DATA_TOOL_WRITE,
  DATA_TOOL_ADMIN
] as const;

// How Tool health names them: they have no install row, and aren't a name
// the model made up.
export const DATA_TOOL_TITLES: Record<string, string> = {
  [DATA_TOOL_DESCRIBE]: 'Describe the database',
  [DATA_TOOL_QUERY]: 'Query the database',
  [DATA_TOOL_WRITE]: 'Change rows in the database',
  [DATA_TOOL_ADMIN]: 'Manage the database'
};

// How many rows data-query returns at most. The engine pages up to 500; a
// model reading 500 rows answers worse, not better.
export const DATA_TOOL_MAX_LIMIT = 100;

export interface DataToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    openWorldHint: boolean;
  };
}

const READS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false
};
// One annotation per tool: a write may delete, so the tool says it is
// destructive, and the runner and the MCP confirmation decide per call.
const CHANGES = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false
};

const WHERE_HELP =
  'Filter object. { "column": value } matches exactly; { "column": { "op": value } } with op one of eq, ne, gt, gte, lt, lte, in, notIn (lists), contains, startsWith (text, case-insensitive), isNull (true/false). Several keys must all match; { "or": [ {...}, {...} ] } matches any. A relation column takes the related row\'s id, or filter on a column of the related table with "relation.column", e.g. { "product.name": "Margherita" }. Datetimes are ISO 8601; include the offset for local times, e.g. "2026-10-19T00:00:00-05:00".';

const accessOf = (caller: DataCaller, table: DataTable) =>
  caller.restricted ? table.access : 'full';

const visible = (schema: DataSchema, caller: DataCaller) =>
  schema.tables.filter(table => DATA_ACCESS_RANK[accessOf(caller, table)] >= 1);

// One column as data-query's description lists it: the type when it isn't
// plain text, so the model can write filters without guessing names.
const columnHint = (column: DataColumn) =>
  column.type === 'relation'
    ? `${column.name} (→ ${column.table})`
    : column.type === 'enum'
      ? `${column.name} (${(column.values ?? []).join('|')})`
      : column.type === 'text' || column.type === 'long_text'
        ? column.name
        : `${column.name} (${column.type}${column.min !== null ? `, ≥ ${column.min}` : ''})`;

const tableLine = (caller: DataCaller, table: DataTable) => {
  const access = accessOf(caller, table);
  const description = table.description?.trim().replace(/\.$/, '');
  return `- ${table.name}${description ? `: ${description}.` : '.'}${
    caller.restricted && table.customerScoped
      ? " Only this customer's own rows are visible."
      : ''
  }${access === 'read' ? ' Read only.' : access === 'add' ? ' Rows can be added, not changed.' : ''} Columns: ${table.columns
    .map(columnHint)
    .join(', ')}.`;
};

const queryLine = (query: DataQuery) =>
  `- ${query.name}${query.description ? `: ${query.description.replace(/\.$/, '')}.` : '.'}${
    query.params.length
      ? ` Params: ${query.params
          .map(
            p =>
              `${p.name} (${p.type}${p.required === false ? ', optional' : ''})`
          )
          .join(', ')}.`
      : ''
  }`;

/** Whether the caller may use the data tools at all: it sees a table. */
export const hasDataToolTables = (schema: DataSchema, caller: DataCaller) =>
  visible(schema, caller).length > 0;

/**
 * data-describe, data-query and, when the caller may add rows somewhere,
 * data-write. Only tables the caller may see are named, so a hidden table
 * doesn't exist for the model. `queries` are the named queries it may run.
 */
export const dataToolDefinitions = (
  schema: DataSchema,
  caller: DataCaller,
  options: { queries?: DataQuery[] } = {}
): DataToolDefinition[] => {
  const tables = visible(schema, caller);
  if (tables.length === 0) return [];
  const queries = options.queries ?? [];
  const timeZone = caller.timeZone || 'UTC';
  const tools: DataToolDefinition[] = [
    {
      name: DATA_TOOL_DESCRIBE,
      title: DATA_TOOL_TITLES[DATA_TOOL_DESCRIBE],
      description:
        "Describe the project's database: its tables, their columns (type, allowed values, which table a relation points to, the owner's description of each), row counts, which columns full-text search covers, and what the assistant may do with each table (read, add, or full). Call it before querying a table whose columns you haven't seen in this conversation.",
      inputSchema: {
        type: 'object',
        properties: {
          table: {
            type: 'string',
            description:
              'One table to describe. Leave out to describe all of them.'
          }
        }
      },
      annotations: READS
    },
    {
      name: DATA_TOOL_QUERY,
      title: DATA_TOOL_TITLES[DATA_TOOL_QUERY],
      description: [
        "Read rows from the project's database: structured records such as products, prices, stock, orders, bookings or customers. Use it for anything with fields and numbers; use the knowledge/resource tools for documents and pages.",
        'Returns matching rows (relation columns come back as { id, label }), the total that match, and nextCursor when there are more. With "aggregate" it returns counts, sums, averages, minimums or maximums instead of rows, optionally per group: use that for "how many" and "how much" rather than adding rows up yourself.',
        "The database holds only what these tables and columns hold. When a question needs something they don't have (opening hours, parking, calories, reviews, forecasts), look in the knowledge tools if you have them; if nothing has it, say you don't have that information. Never guess it.",
        `Every table also has id, created_at and updated_at. Datetimes come back in the project's time zone (${timeZone}) with their offset; read them as local times.`,
        'Tables:',
        tables.map(table => tableLine(caller, table)).join('\n'),
        ...(queries.length
          ? [
              'Saved reports: instead of "table", pass "query" with its name and "params"; they return exactly what the report computes.',
              queries.map(queryLine).join('\n')
            ]
          : [])
      ].join('\n'),
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table to read.' },
          where: { type: 'object', description: WHERE_HELP },
          search: {
            type: 'string',
            description:
              "Words to look for in the table's searchable text columns (accents and case ignored, ranked by relevance). Use it when the user names something loosely; use where for exact values."
          },
          sort: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Columns to sort by, "-" first for descending, e.g. ["-created_at"]. Relation paths allowed.'
          },
          limit: {
            type: 'integer',
            description: `Rows to return, 1 to ${DATA_TOOL_MAX_LIMIT}. Default 20.`
          },
          cursor: {
            type: 'string',
            description:
              'nextCursor from the previous call, to get the next page.'
          },
          include: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Relation columns to expand into the full related row, e.g. ["customer"].'
          },
          aggregate: {
            type: 'array',
            description:
              'Compute instead of listing rows. Each item is { "fn": "count" } or { "fn": "sum"|"avg"|"min"|"max", "column": "..." } (relation paths allowed, e.g. "order.total"). Add "times": "<number column>" to aggregate a product, e.g. { "fn": "sum", "column": "stock", "times": "unit_cost" } for stock value.',
            items: {
              type: 'object',
              properties: {
                fn: {
                  type: 'string',
                  enum: ['count', 'sum', 'avg', 'min', 'max']
                },
                column: { type: 'string' },
                times: { type: 'string' }
              },
              required: ['fn']
            }
          },
          groupBy: {
            type: 'array',
            items: { type: 'string' },
            description:
              'With aggregate: columns to group by, e.g. ["status"] or ["product"]. Groups come back largest first.'
          },
          ...(queries.length
            ? {
                query: {
                  type: 'string',
                  enum: queries.map(q => q.name),
                  description:
                    'A saved report to run instead of reading a table.'
                },
                params: {
                  type: 'object',
                  description:
                    'The saved report\'s parameters, e.g. { "from": "2026-10-01" }.'
                }
              }
            : {})
        },
        ...(queries.length ? {} : { required: ['table'] })
      },
      annotations: READS
    }
  ];
  if (
    tables.some(
      table => DATA_ACCESS_RANK[accessOf(caller, table)] >= DATA_ACCESS_RANK.add
    )
  ) {
    tools.push({
      name: DATA_TOOL_WRITE,
      title: DATA_TOOL_TITLES[DATA_TOOL_WRITE],
      description: [
        "Add, change or delete rows in the project's database. All operations in one call succeed together or none is applied, so put everything that belongs together (an order, its lines and the stock they use) in one call.",
        '- insert: { "op": "insert", "table": "...", "values": { column: value } }. A relation column takes the related row\'s id; to point at a row inserted earlier in the same call use { "$ref": n }, n being that operation\'s position (0-based).',
        '- update: { "op": "update", "table": "...", "id": 12, "set": { column: value } }. For numbers, { "decrement": 2 } or { "increment": 2 } changes the value relative to what is stored. Instead of id you can give "where" (same format as data-query).',
        '- delete: { "op": "delete", "table": "...", "id": 12 } (or "where").',
        'Guards: an update or delete also takes "where" conditions that must hold, e.g. "where": { "stock": { "gte": 2 } }, and "expect", how many rows must change (1 by default when id is given). If a guard fails, nothing in the call is written and the error says why (e.g. how much stock is left).',
        'Only use ids you got from data-query or from an earlier insert; never guess them.'
      ].join('\n'),
      inputSchema: {
        type: 'object',
        properties: {
          operations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                op: { type: 'string', enum: ['insert', 'update', 'delete'] },
                table: { type: 'string' },
                id: { type: 'integer' },
                values: { type: 'object' },
                set: { type: 'object' },
                where: { type: 'object' },
                expect: { type: 'integer' }
              },
              required: ['op', 'table']
            }
          }
        },
        required: ['operations']
      },
      annotations: CHANGES
    });
  }
  return tools;
};

export const DATA_ADMIN_ACTIONS = [
  'schema',
  'create_table',
  'update_table',
  'drop_table',
  'add_column',
  'update_column',
  'drop_column',
  'save_query',
  'drop_query',
  'import',
  'export'
] as const;
export type DataAdminAction = (typeof DATA_ADMIN_ACTIONS)[number];

/**
 * data-admin: the owner's own MCP client managing the database's structure.
 * One tool, so it costs one slot in the session it exists in; destructive, so
 * every call goes through confirmation and, after outside content, the
 * approval link.
 */
export const dataAdminToolDefinition = (): DataToolDefinition => ({
  name: DATA_TOOL_ADMIN,
  title: DATA_TOOL_TITLES[DATA_TOOL_ADMIN],
  description: [
    "Manage the project's database structure as its owner: tables, columns, indexes, descriptions, saved reports, imports and exports. To read or change rows use data-query and data-write.",
    '- schema: every table as it would be written again (columns with type, required, unique, filterable, searchable, description, enum values, relation target and minimum), plus the saved reports.',
    '- create_table: "input" is { name, description, displayColumn, access (none|read|add|full: what channel bots may do), customerScoped, columns: [{ name, type, ... }] }. Types: text, long_text, integer, decimal, boolean, date, datetime, enum (with "values"), json, email, url, phone, relation (with "table" and "onDelete": restrict|cascade|set_null), file.',
    '- update_table: "table" and "input" with what changes: name, description, displayColumn, access, customerScoped, history.',
    '- drop_table: "table". It can be undone with a restore from the dashboard.',
    '- add_column: "table" and "input" as one column of create_table.',
    '- update_column: "table", "column" and "input" with what changes: name, type, description, required, unique, filterable (adds an index), searchable, values, min, default. A type change copies the table and refuses if a value doesn\'t fit.',
    '- drop_column: "table" and "column".',
    '- save_query: "input" is { name, description, sql, params: [{ name, type: text|integer|decimal|boolean|date|datetime, description }], assistant }. sql is one SELECT with named parameters (:from); it is checked to only read. assistant: true lets channel bots run it.',
    '- drop_query: "name".',
    '- import: "table" and "resource", the uri of a CSV or Excel file in the project\'s knowledge ("sheet" picks one, the first by default). Headers are matched to columns by name or label, and relation columns by the related row\'s name; rows are added, not replaced. Up to 5 MB.',
    '- export: start a copy of the whole database (format jsonl or csv); download it from the Data page.'
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: [...DATA_ADMIN_ACTIONS] },
      table: { type: 'string' },
      column: { type: 'string' },
      name: { type: 'string', description: 'drop_query: the saved report.' },
      resource: {
        type: 'string',
        description: 'import: the CSV or Excel resource uri.'
      },
      sheet: {
        type: 'string',
        description: 'import: the Excel sheet; the first by default.'
      },
      format: { type: 'string', enum: ['jsonl', 'csv'] },
      input: { type: 'object' }
    },
    required: ['action']
  },
  annotations: CHANGES
});
