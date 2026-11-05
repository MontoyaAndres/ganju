import type { DATA_API_ROUTES } from '@ganju/utils/dataApi';

import type { ApiClient, ApiOptions } from '../api.js';
import { isApiError } from '../errors.js';
import { warn } from '../output.js';

// How many times one request waits out the rate limit before giving up.
const MAX_RATE_LIMIT_WAITS = 5;

/**
 * The Data API's routes, as the CLI calls them.
 *
 * The list itself lives in `@ganju/utils/dataApi`, where the API registers its
 * routes from it. Importing it for real would carry zod and every schema into
 * the CLI's bundle to read some paths, so this is a copy that the compiler
 * holds to the original: a route missing here, one too many, or a path or
 * method that differs fails `tsc`. Only the types cross over.
 */
type Routes = typeof DATA_API_ROUTES;
export type DataRouteId = keyof Routes;

const ROUTES = {
  getDatabase: { method: 'get', path: '' },
  create: { method: 'post', path: '' },
  updateDatabase: { method: 'patch', path: '' },
  remove: { method: 'delete', path: '' },
  restore: { method: 'post', path: '/restore' },
  restorePoint: { method: 'post', path: '/restore-point' },
  checkpoint: { method: 'post', path: '/checkpoint' },
  dismissCopy: { method: 'delete', path: '/copy' },
  listTables: { method: 'get', path: '/table' },
  createTable: { method: 'post', path: '/table' },
  updateTable: { method: 'patch', path: '/table/:table' },
  dropTable: { method: 'delete', path: '/table/:table' },
  addColumn: { method: 'post', path: '/table/:table/column' },
  updateColumn: { method: 'patch', path: '/table/:table/column/:column' },
  dropColumn: { method: 'delete', path: '/table/:table/column/:column' },
  applyIndexAdvice: { method: 'post', path: '/advice/:adviceId' },
  dismissIndexAdvice: { method: 'delete', path: '/advice/:adviceId' },
  listRows: { method: 'get', path: '/table/:table/row' },
  createRows: { method: 'post', path: '/table/:table/row' },
  getRow: { method: 'get', path: '/table/:table/row/:id' },
  updateRow: { method: 'patch', path: '/table/:table/row/:id' },
  deleteRow: { method: 'delete', path: '/table/:table/row/:id' },
  deletePreview: { method: 'post', path: '/table/:table/delete-preview' },
  rowHistory: { method: 'get', path: '/table/:table/row/:id/history' },
  write: { method: 'post', path: '/write' },
  listQueries: { method: 'get', path: '/query' },
  saveQuery: { method: 'post', path: '/query' },
  dropQuery: { method: 'delete', path: '/query/:name' },
  runQuery: { method: 'post', path: '/query/:name/run' },
  listTriggers: { method: 'get', path: '/trigger' },
  saveTrigger: { method: 'post', path: '/trigger' },
  updateTrigger: { method: 'patch', path: '/trigger/:name' },
  dropTrigger: { method: 'delete', path: '/trigger/:name' },
  deployTriggers: { method: 'post', path: '/trigger/deploy' },
  listTriggerRuns: { method: 'get', path: '/trigger/:name/run' },
  retryTriggerRun: { method: 'post', path: '/trigger/:name/run/:runId/retry' },
  startExport: { method: 'post', path: '/export' },
  exportStatus: { method: 'get', path: '/export' },
  exportFile: { method: 'get', path: '/export/file' },
  listChanges: { method: 'get', path: '/change' }
} as const satisfies {
  [K in DataRouteId]: Pick<Routes[K], 'method' | 'path'>;
};

export interface DataRequestOptions extends Pick<ApiOptions, 'query' | 'json'> {
  // The path's `:table`, `:column`, `:id` and `:name`.
  params?: Record<string, string | number>;
}

export const dataRoutePath = (
  id: DataRouteId,
  params: Record<string, string | number> = {}
): string =>
  ROUTES[id].path.replace(/:([A-Za-z]+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`${id} needs :${name}`);
    return encodeURIComponent(String(value));
  });

/** A client for one project's Data API, every call named by its route id. */
export class DataApi {
  constructor(
    readonly api: ApiClient,
    // `${artifactPath}/data`
    readonly base: string
  ) {}

  async request<T = unknown>(
    id: DataRouteId,
    options: DataRequestOptions = {}
  ): Promise<T> {
    const route = ROUTES[id];
    const send = () =>
      this.api.request<T>(`${this.base}${dataRoutePath(id, options.params)}`, {
        method: route.method.toUpperCase() as ApiOptions['method'],
        query: options.query,
        json: options.json,
        // The route answers a file; read it as text rather than JSON.
        ...(id === 'exportFile' ? { raw: true } : {})
      });
    // A personal access token has a per-route limit a minute. A 429 means the
    // request was never run, so a long import waits it out rather than stop
    // halfway through a file.
    for (let attempt = 1; ; attempt++) {
      try {
        return await send();
      } catch (error) {
        if (
          !isApiError(error) ||
          error.status !== 429 ||
          attempt > MAX_RATE_LIMIT_WAITS
        ) {
          throw error;
        }
        const seconds = error.retryAfter ?? 60;
        warn(`rate limited; waiting ${seconds}s before going on`);
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      }
    }
  }
}
