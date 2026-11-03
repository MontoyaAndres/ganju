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
  tag:
    | 'Database'
    | 'Tables'
    | 'Rows'
    | 'Queries'
    | 'Triggers'
    | 'History and export';
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
  DATA_DATABASE_PATCH,
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
  DATA_DELETE_PREVIEW_BODY,
  DATA_WRITE_BODY,
  DATA_ROW_HISTORY_QUERY,
  DATA_RESTORE_POINT_BODY,
  DATA_EXPORT_BODY,
  DATA_EXPORT_QUERY,
  DATA_EXPORT_FILE_QUERY,
  DATA_CHANGE_LIST_QUERY,
  DATA_QUERY_INPUT,
  DATA_QUERY_RUN_BODY,
  DATA_TRIGGER_INPUT,
  DATA_TRIGGER_PATCH,
  DATA_TRIGGER_DEPLOY_BODY,
  DATA_TRIGGER_RUN_LIST_QUERY
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
      "Pro and Enterprise. Safe to repeat: a second call returns the same database. `name` defaults to the project's slug. While a deleted database is in its grace period this is refused unless `replaceDeleted` is true: the deleted one can then no longer be restored or exported, and is emptied when its grace period ends.",
    body: DATA_DATABASE_CREATE.pick({ name: true, replaceDeleted: true }),
    returns: '{ database }',
    status: 201
  },
  updateDatabase: {
    method: 'patch',
    path: '',
    tag: 'Database',
    summary: "Change the database's settings",
    description:
      '`timeZone`, an IANA zone such as `America/Bogota`, or null for UTC. Datetimes come back in it for callers that send no `timeZone` of their own: the assistant, functions and scripts. Datetimes without an offset are read in it too.',
    body: DATA_DATABASE_PATCH,
    returns: '{ database }'
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
      'Replaces everything with the database as it was at `timestamp` (within 30 days), or at the `bookmark` a checkpoint, a dropped table or column, a type change or an earlier restore answered with. The answer carries `undoBookmark`, which undoes the restore. Calls in flight while it restarts fail.',
    body: DATA_RESTORE_POINT_BODY,
    returns: '{ bookmark, undoBookmark }'
  },
  checkpoint: {
    method: 'post',
    path: '/checkpoint',
    tag: 'Database',
    summary: 'Take a restore point',
    description:
      "Answers with the `bookmark` of the database as it is right now, which `POST /restore-point` accepts. Take one before a large change, such as replacing a table's rows, to undo exactly that change: a time is not that precise.",
    returns: '{ bookmark }'
  },
  dismissCopy: {
    method: 'delete',
    path: '/copy',
    tag: 'Tables',
    summary: 'Dismiss a failed table copy',
    description:
      'A column change on a table over 100,000 rows copies it in the background; table changes, and writes that would change its rows, wait until it finishes (`copy` on `GET` shows how far it got). A copy that failed left the table as it was and stays in `copy` with its `error` until dismissed, or until the next column change.',
    returns: '{ copy: null }'
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
      'A type change copies the table and lists the first rows that would not fit. When it copies, the answer carries a `bookmark` from just before. Over 100,000 rows the copy runs in the background: the answer carries `copy`, the table keeps its old columns until it finishes, and meanwhile table changes, and writes that would change its rows, are refused.',
    body: DATA_COLUMN_PATCH,
    returns: '{ table, bookmark, copy }'
  },
  dropColumn: {
    method: 'delete',
    path: '/table/:table/column/:column',
    tag: 'Tables',
    summary: 'Drop a column',
    description:
      'The answer carries a `bookmark`: restoring to it brings the column back. Dropping a relation column copies the table, in the background over 100,000 rows, as for a type change.',
    returns: '{ table, bookmark, copy }'
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
  deletePreview: {
    method: 'post',
    path: '/table/:table/delete-preview',
    tag: 'Rows',
    summary: 'What deleting rows would do',
    description:
      'For `ids`, or every row without them: each relation column pointing at a row the delete removes, with how many rows it would delete (cascade), clear (set null) or that refuse the delete (restrict). Cascades are followed all the way down. `blocked` says a restrict would refuse it. Past 200,000 affected rows `truncated` is true and the counts are lower bounds. Nothing is deleted.',
    body: DATA_DELETE_PREVIEW_BODY,
    returns: '{ table, rows, effects, blocked, truncated }'
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
  listQueries: {
    method: 'get',
    path: '/query',
    tag: 'Queries',
    summary: 'Named queries',
    description:
      'Each with its SQL, parameters, the tables it reads and its plan (`SCAN orders` means it reads the whole table).',
    returns: '{ queries }'
  },
  saveQuery: {
    method: 'post',
    path: '/query',
    tag: 'Queries',
    summary: 'Save a named query',
    description:
      "One `SELECT` (or `WITH … SELECT`) with named parameters such as `:from`, each declared in `params` with its type. It is compiled, never run, and refused unless it only reads this database's tables. Saving under an existing name replaces it. `assistant: true` lets channel bots run it from data-query.",
    body: DATA_QUERY_INPUT,
    returns: '{ query }',
    status: 201
  },
  dropQuery: {
    method: 'delete',
    path: '/query/:name',
    tag: 'Queries',
    summary: 'Delete a named query',
    returns: '{ dropped }'
  },
  runQuery: {
    method: 'post',
    path: '/query/:name/run',
    tag: 'Queries',
    summary: 'Run a named query',
    description:
      'With its `params`, up to `limit` rows (100 by default, 500 at most) and 1 MB; `truncated` says it stopped early. A query that would scan a table over 200,000 rows is refused.',
    body: DATA_QUERY_RUN_BODY,
    returns: '{ query, rows, truncated? }'
  },
  listTriggers: {
    method: 'get',
    path: '/trigger',
    tag: 'Triggers',
    summary: 'Triggers',
    description:
      'Each with its table, event, condition and action. `pending` counts events not yet handed to the queue. Webhook secrets are never listed.',
    returns: '{ triggers, pending }'
  },
  saveTrigger: {
    method: 'post',
    path: '/trigger',
    tag: 'Triggers',
    summary: 'Save a trigger',
    description:
      'Runs one action when rows of `table` are inserted, updated or deleted, and `when` holds: `{ "status": { "changedTo": "READY" } }` fires on the transition only; `changedFrom`, `changed: true` and `equals` test a column too, and `all` / `any` combine them. The action is one of `function` (a function of this project, given `{ event, table, row, previous, actor, eventId, triggerId }`), `webhook` (an https URL, sent a POST signed in `x-ganju-signature`), `chat` (`{ channelId, chatId, text }`), `email` (`{ to, subject, text }`) or `customer` (`{ text, template? }`, to the row\'s customer on a customer-scoped table). Texts take `{{field}}` from the row, inserted as plain text. Saving under an existing name replaces it, unless `replace` is false; with no `name`, it always creates a new trigger, named from the table, event and action and numbered past those taken. Left out, `enabled` keeps a saved trigger on or off as it was. A new webhook answers with its signing `secret`, shown this once. Delivery is at least once: every event carries an `eventId`.',
    body: DATA_TRIGGER_INPUT,
    returns: '{ trigger, secret? }',
    status: 201
  },
  updateTrigger: {
    method: 'patch',
    path: '/trigger/:name',
    tag: 'Triggers',
    summary: 'Turn a trigger on or off',
    description:
      'Turning one back on clears why Ganju turned it off (20 failed runs in a row).',
    body: DATA_TRIGGER_PATCH,
    returns: '{ trigger }'
  },
  dropTrigger: {
    method: 'delete',
    path: '/trigger/:name',
    tag: 'Triggers',
    summary: 'Delete a trigger',
    returns: '{ dropped }'
  },
  deployTriggers: {
    method: 'post',
    path: '/trigger/deploy',
    tag: 'Triggers',
    summary: 'Deploy the triggers of ganju.json',
    description:
      "What `ganju deploy` sends: every trigger listed is saved as managed by the CLI, and the CLI's earlier ones not listed are deleted. Triggers made in the dashboard are left alone. All or nothing. New webhooks' secrets come back once, by name.",
    body: DATA_TRIGGER_DEPLOY_BODY,
    returns: '{ triggers, removed, secrets }'
  },
  listTriggerRuns: {
    method: 'get',
    path: '/trigger/:name/run',
    tag: 'Triggers',
    summary: "A trigger's recent runs",
    description:
      'Newest first, up to 50: `ok`, `failed` with its error, `skipped`, or `running`.',
    query: DATA_TRIGGER_RUN_LIST_QUERY,
    returns: '{ runs }'
  },
  retryTriggerRun: {
    method: 'post',
    path: '/trigger/:name/run/:runId/retry',
    tag: 'Triggers',
    summary: 'Run a failed event again',
    description: 'The same event, with the same `eventId`.',
    returns: '{ run }'
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
      { name: 'Queries' },
      { name: 'Triggers' },
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
