// The Data API's routes, as one list: apps/api registers its data routes from
// it, and the OpenAPI file is generated from it, so the documented API and the
// served one can't drift apart. Entry point `@ganju/utils/dataApi`.
import { z } from 'zod';

import { Schema } from './schema';

export const DATA_API_BASE =
  '/organization/:organizationId/project/:projectId/artifact/data';

export type DataApiMethod = 'get' | 'post' | 'patch' | 'delete';

export interface DataApiRoute {
  method: DataApiMethod;
  // Relative to DATA_API_BASE, in Hono's `:param` form.
  path: string;
  summary: string;
  description?: string;
  tag: 'Database' | 'Tables' | 'Rows' | 'History and export';
  body?: z.ZodType;
  query?: z.ZodObject;
  // What a 200/201 answers with, in a sentence.
  returns: string;
  status?: 200 | 201;
  // Answers with a file instead of JSON.
  file?: boolean;
}

const {
  DATA_DATABASE_CREATE,
  DATA_DATABASE_DELETE,
  DATA_TABLE_INPUT,
  DATA_TABLE_PATCH,
  DATA_COLUMN_INPUT,
  DATA_COLUMN_PATCH,
  DATA_TABLE_DROP_BODY,
  DATA_ROW_LIST_QUERY,
  DATA_ROW_GET_QUERY,
  DATA_ROW_CREATE_BODY,
  DATA_ROW_UPDATE_BODY,
  DATA_ROW_DELETE_BODY,
  DATA_WRITE_BODY,
  DATA_ROW_HISTORY_QUERY,
  DATA_RESTORE_POINT_BODY,
  DATA_EXPORT_BODY,
  DATA_EXPORT_QUERY,
  DATA_EXPORT_FILE_QUERY,
  DATA_CHANGE_LIST_QUERY
} = Schema;

export const DATA_API_ROUTES = {
  getDatabase: {
    method: 'get',
    path: '',
    tag: 'Database',
    summary: "The project's database",
    description:
      'Its status and size, and its tables when it is ready. `database` is null when the project has none.',
    returns: '{ database }'
  },
  create: {
    method: 'post',
    path: '',
    tag: 'Database',
    summary: 'Create the database',
    description:
      "Pro and Enterprise. Safe to repeat: a second call returns the same database. `name` defaults to the project's slug.",
    body: DATA_DATABASE_CREATE.pick({ name: true }),
    returns: '{ database }',
    status: 201
  },
  remove: {
    method: 'delete',
    path: '',
    tag: 'Database',
    summary: 'Delete the database',
    description:
      'Needs `confirmName`, the database name typed out. It can be restored for 7 days.',
    body: DATA_DATABASE_DELETE.pick({ confirmName: true }),
    returns: '{ database }'
  },
  restore: {
    method: 'post',
    path: '/restore',
    tag: 'Database',
    summary: 'Undo a delete',
    description: 'Within the 7-day grace period.',
    returns: '{ database }'
  },
  restorePoint: {
    method: 'post',
    path: '/restore-point',
    tag: 'Database',
    summary: 'Restore to a point in time',
    description:
      'Replaces everything with the database as it was at `timestamp` (within 30 days), or at the `bookmark` a dropped table or column, a type change or an earlier restore answered with. The answer carries `undoBookmark`, which undoes the restore. Calls in flight while it restarts fail.',
    body: DATA_RESTORE_POINT_BODY,
    returns: '{ bookmark, undoBookmark }'
  },
  listTables: {
    method: 'get',
    path: '/table',
    tag: 'Tables',
    summary: 'Tables and their columns',
    returns: '{ tables }'
  },
  createTable: {
    method: 'post',
    path: '/table',
    tag: 'Tables',
    summary: 'Create a table',
    body: DATA_TABLE_INPUT,
    returns: '{ table }',
    status: 201
  },
  updateTable: {
    method: 'patch',
    path: '/table/:table',
    tag: 'Tables',
    summary: 'Rename a table or change its settings',
    body: DATA_TABLE_PATCH,
    returns: '{ table }'
  },
  dropTable: {
    method: 'delete',
    path: '/table/:table',
    tag: 'Tables',
    summary: 'Drop a table',
    description:
      'Needs `confirmName`, the table name typed out. The answer carries a `bookmark`: restoring to it brings the table back.',
    body: DATA_TABLE_DROP_BODY,
    returns: '{ dropped, bookmark }'
  },
  addColumn: {
    method: 'post',
    path: '/table/:table/column',
    tag: 'Tables',
    summary: 'Add a column',
    body: DATA_COLUMN_INPUT,
    returns: '{ table }',
    status: 201
  },
  updateColumn: {
    method: 'patch',
    path: '/table/:table/column/:column',
    tag: 'Tables',
    summary: 'Rename a column or change it',
    description:
      'A type change copies the table and lists the first rows that would not fit. When it copies, the answer carries a `bookmark` from just before.',
    body: DATA_COLUMN_PATCH,
    returns: '{ table, bookmark }'
  },
  dropColumn: {
    method: 'delete',
    path: '/table/:table/column/:column',
    tag: 'Tables',
    summary: 'Drop a column',
    description:
      'The answer carries a `bookmark`: restoring to it brings the column back.',
    returns: '{ table, bookmark }'
  },
  listRows: {
    method: 'get',
    path: '/table/:table/row',
    tag: 'Rows',
    summary: 'List, filter and search rows',
    description:
      'Up to 500 rows or 1 MB a page; `nextCursor` reads the next. `where` is JSON, e.g. `{"status":"open","price":{"lt":30000}}`. `sort` is a list of columns, `-` for descending. `q` searches the searchable columns.',
    query: DATA_ROW_LIST_QUERY,
    returns: '{ table, rows, total?, nextCursor? }'
  },
  createRows: {
    method: 'post',
    path: '/table/:table/row',
    tag: 'Rows',
    summary: 'Insert one row, or up to 500',
    body: DATA_ROW_CREATE_BODY,
    returns: '{ ids }',
    status: 201
  },
  getRow: {
    method: 'get',
    path: '/table/:table/row/:id',
    tag: 'Rows',
    summary: 'One row',
    query: DATA_ROW_GET_QUERY,
    returns: '{ row }'
  },
  updateRow: {
    method: 'patch',
    path: '/table/:table/row/:id',
    tag: 'Rows',
    summary: 'Change a row',
    description:
      'Send the `version` you read: if the row changed since, the answer is 409 with the current row and who changed it.',
    body: DATA_ROW_UPDATE_BODY,
    returns: '{ row }'
  },
  deleteRow: {
    method: 'delete',
    path: '/table/:table/row/:id',
    tag: 'Rows',
    summary: 'Delete a row',
    description: 'Send the `version` you read, as for a change.',
    body: DATA_ROW_DELETE_BODY,
    returns: '{ deleted }'
  },
  rowHistory: {
    method: 'get',
    path: '/table/:table/row/:id/history',
    tag: 'History and export',
    summary: "A row's history",
    description: 'Newest first, kept 90 days, with who made each change.',
    query: DATA_ROW_HISTORY_QUERY,
    returns: '{ entries, nextCursor? }'
  },
  write: {
    method: 'post',
    path: '/write',
    tag: 'Rows',
    summary: 'Several writes, all or nothing',
    description:
      'Inserts, updates and deletes across tables in one transaction. A guard (`where` plus `expect`) that fails rolls everything back. A later step uses an earlier single-row insert\'s id as `{ "$ref": <step> }`, in its values or as the `id` it updates or deletes.',
    body: DATA_WRITE_BODY,
    returns: '{ results }'
  },
  startExport: {
    method: 'post',
    path: '/export',
    tag: 'History and export',
    summary: 'Start an export',
    description:
      'Writes a copy in the background: schema.json and one JSONL or CSV file per table. Poll `GET /export` until `status` is `done`. Works during the 7-day grace period after a delete too.',
    body: DATA_EXPORT_BODY,
    returns: '{ exportId, status }',
    status: 201
  },
  exportStatus: {
    method: 'get',
    path: '/export',
    tag: 'History and export',
    summary: 'The latest export',
    query: DATA_EXPORT_QUERY,
    returns: '{ export }'
  },
  exportFile: {
    method: 'get',
    path: '/export/file',
    tag: 'History and export',
    summary: "Download one of an export's files",
    description: "A table's file, or schema.json without `table`.",
    query: DATA_EXPORT_FILE_QUERY,
    returns: 'The file',
    file: true
  },
  listChanges: {
    method: 'get',
    path: '/change',
    tag: 'History and export',
    summary: 'The schema change log',
    description:
      'Newest first: tables and columns changed, restores, exports, deletes.',
    query: DATA_CHANGE_LIST_QUERY,
    returns: '{ changes, nextCursor? }'
  }
} as const satisfies Record<string, DataApiRoute>;

export type DataApiRouteId = keyof typeof DATA_API_ROUTES;

// `/table/:table` → `/table/{table}`
const openApiPath = (path: string) => path.replace(/:([A-Za-z]+)/g, '{$1}');

const jsonSchema = (schema: z.ZodType) =>
  z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'any',
    target: 'draft-2020-12'
  });

const errorResponse = (description: string) => ({
  description,
  content: {
    'application/json': { schema: { $ref: '#/components/schemas/Error' } }
  }
});

/**
 * The OpenAPI 3.1 document for the Data API, served by apps/api at
 * /openapi/data.json.
 */
export const dataOpenApi = (serverUrl: string) => {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [id, route] of Object.entries(DATA_API_ROUTES) as [
    DataApiRouteId,
    DataApiRoute
  ][]) {
    const fullPath = openApiPath(`${DATA_API_BASE}${route.path}`);
    const pathParams = [...fullPath.matchAll(/\{([A-Za-z]+)\}/g)].map(m => ({
      name: m[1],
      in: 'path',
      required: true,
      schema:
        m[1] === 'id' ? { type: 'integer', minimum: 1 } : { type: 'string' }
    }));
    const queryParams = route.query
      ? Object.entries(route.query.shape).map(([name, field]) => ({
          name,
          in: 'query',
          required: !(field as z.ZodType).safeParse(undefined).success,
          schema: jsonSchema(field as z.ZodType)
        }))
      : [];
    const status = String(route.status ?? 200);
    paths[fullPath] ??= {};
    paths[fullPath][route.method] = {
      operationId: id,
      tags: [route.tag],
      summary: route.summary,
      ...(route.description ? { description: route.description } : {}),
      parameters: [...pathParams, ...queryParams],
      ...(route.body
        ? {
            requestBody: {
              required: true,
              content: {
                'application/json': { schema: jsonSchema(route.body) }
              }
            }
          }
        : {}),
      responses: {
        [status]: route.file
          ? {
              description: route.returns,
              content: { 'application/octet-stream': {} }
            }
          : {
              description: route.returns,
              content: { 'application/json': { schema: { type: 'object' } } }
            },
        '400': errorResponse(
          'The request is not valid; `errors` lists each field.'
        ),
        '401': errorResponse('No session or token.'),
        '402': errorResponse('The plan does not include Data.'),
        '403': errorResponse(
          'Not an admin of the project, or the token is for another project.'
        ),
        '404': errorResponse('No database, table or row by that name.'),
        '409': errorResponse(
          'A conflict: a stale `version` (with `details.current`), a guard that failed, a constraint, or a full database.'
        ),
        '429': errorResponse('Too many requests for this token; wait a minute.')
      }
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Ganju Data API',
      version: '1',
      description:
        "Tables, rows and search in a project's database. Authenticate with a personal access token (`ganju token create`) as a bearer token; a token reaches only its own project."
    },
    servers: [{ url: serverUrl }],
    security: [{ bearer: [] }],
    tags: [
      { name: 'Database' },
      { name: 'Tables' },
      { name: 'Rows' },
      { name: 'History and export' }
    ],
    paths,
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'object' },
            // A request that didn't parse: one entry per field.
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  message: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  };
};
