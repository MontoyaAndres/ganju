// The three data tools as the model sees them: names, descriptions and input
// schemas. This is what the eval iterates on; once the scores hold across
// models, these texts move into the real tools.
import { tableSummaries } from './compiler.mjs';

const WHERE_HELP =
  'Filter object. { "column": value } matches exactly; { "column": { "op": value } } with op one of eq, ne, gt, gte, lt, lte, in, notIn (lists), contains, startsWith (text, case-insensitive), isNull (true/false). Several keys must all match; { "or": [ {...}, {...} ] } matches any. A relation column takes the related row\'s id, or filter on a column of the related table with "relation.column", e.g. { "product.name": "Margherita" }. Datetimes are ISO 8601; include the offset for local times, e.g. "2026-10-19T00:00:00-05:00".';

// One line per table: what it holds, then its columns with the type when it
// isn't plain text, so the model can write filters without guessing names.
const columnHint = column =>
  column.type === 'relation'
    ? `${column.name} (→ ${column.references})`
    : column.type === 'enum'
      ? `${column.name} (${column.values.join('|')})`
      : ['text', 'long_text'].includes(column.type)
        ? column.name
        : `${column.name} (${column.type}${column.min !== undefined ? `, ≥ ${column.min}` : ''})`;

export const toolDefinitions = (state, actor) => {
  const timeZone = state.definition.timeZone;
  const tables = tableSummaries(state, actor)
    .map(
      t =>
        `- ${t.name}: ${t.description}.${t.scoped ? " Only this customer's own rows are visible." : ''}${t.access === 'read' ? ' Read only.' : t.access === 'add' ? ' Rows can be added, not changed.' : ''} Columns: ${t.columns.map(columnHint).join(', ')}.`
    )
    .join('\n');
  return [
    {
      name: 'data-describe',
      description:
        "Describe the project's database: its tables, their columns (type, allowed values, which table a relation points to, the owner's description of each), row counts, which columns full-text search covers, and what the assistant may do with each table (read, add, or full). Call it before querying a table whose columns you haven't seen in this conversation.",
      inputSchema: {
        type: 'object',
        properties: {
          table: {
            type: 'string',
            description: 'One table to describe. Leave out to describe all of them.'
          }
        }
      }
    },
    {
      name: 'data-query',
      description: [
        "Read rows from the project's database: structured records such as products, prices, stock, orders, bookings or customers. Use it for anything with fields and numbers; use the knowledge/resource tools for documents and pages.",
        'Returns matching rows (relation columns come back as { id, label }), the total that match, and nextCursor when there are more. With "aggregate" it returns counts, sums, averages, minimums or maximums instead of rows, optionally per group: use that for "how many" and "how much" rather than adding rows up yourself.',
        "The database holds only what these tables and columns hold. When a question needs something they don't have (opening hours, parking, calories, reviews, forecasts), look in the knowledge tools if you have them; if nothing has it, say you don't have that information. Never guess it.",
        `Every table also has id, created_at and updated_at. Datetimes come back in the project's time zone (${timeZone}) with their offset; read them as local times.`,
        'Tables:',
        tables
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
            description: 'Columns to sort by, "-" first for descending, e.g. ["-created_at"]. Relation paths allowed.'
          },
          limit: {
            type: 'integer',
            description: 'Rows to return, 1 to 100. Default 20.'
          },
          cursor: {
            type: 'string',
            description: 'nextCursor from the previous call, to get the next page.'
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
                fn: { type: 'string', enum: ['count', 'sum', 'avg', 'min', 'max'] },
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
          }
        },
        required: ['table']
      }
    },
    {
      name: 'data-write',
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
      }
    }
  ];
};
