import { utils } from '@ganju/utils';

import type {
  ApiResult,
  DataColumn,
  DataTable,
  FileValue,
  RelationValue
} from './types';

// The reader's own zone: datetimes come back in it, with the offset.
export const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
}

/**
 * One call to the project's Data API. Never throws: a refused call comes back
 * as `ok: false` with the API's own message, which the database writes for
 * the person reading it ("menu.stock can't go below 0").
 */
export const dataRequest = async <T>(
  base: string,
  path: string,
  options: RequestOptions = {}
): Promise<ApiResult<T>> => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const search = params.toString();
  try {
    const data = await utils.fetcher({
      url: `${base}${path}${search ? `?${search}` : ''}`,
      config: {
        method: options.method ?? 'GET',
        credentials: 'include',
        signal: options.signal,
        ...(options.body !== undefined
          ? { body: JSON.stringify(options.body) }
          : {})
      }
    });
    if (data && (data.error !== undefined || Array.isArray(data.errors))) {
      const fields = Array.isArray(data.errors)
        ? (data.errors as { path?: string; message?: string }[])
            .map(e => (e.path ? `${e.path}: ${e.message}` : e.message))
            .join(' ')
        : '';
      return {
        ok: false,
        data: undefined as T,
        error: data.error || fields || '',
        code: data.code,
        details: data.details
      };
    }
    return { ok: true, data: data as T, error: '' };
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    return { ok: false, data: undefined as T, error: '' };
  }
};

// Saves a file the API answers with, using the session cookie.
export const downloadFile = async (url: string, fallbackName: string) => {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${url}`, {
    credentials: 'include'
  });
  if (!response.ok) return false;
  const disposition = response.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  saveBlob(await response.blob(), name);
  return true;
};

export const saveBlob = (blob: Blob, name: string) => {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
};

// How a table or column is shown: its label, else its name.
export const tableTitle = (table: Pick<DataTable, 'name' | 'label'>) =>
  table.label || table.name;

export const columnTitle = (column: Pick<DataColumn, 'name' | 'label'>) =>
  column.label || column.name;

export const isRelationValue = (value: unknown): value is RelationValue =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof (value as RelationValue).id === 'number';

export const isFileValue = (value: unknown): value is FileValue =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as FileValue).uri === 'string';

// Whether a column is in the table's full-text search. On a file column,
// searchable means its uploads are indexed in Resources instead.
export const inRowSearch = (column: DataColumn) =>
  column.searchable && column.type !== 'file';

// The project's Resources API, next to its Data API.
export const resourceBase = (dataBase: string) =>
  dataBase.replace(/\/artifact\/data$/, '/artifact/resource');

// Image previews, fetched with the session cookie and shared while any cell
// or form shows them. The object URL is released when the last one goes.
const previews = new Map<
  string,
  { url: Promise<string | null>; users: number }
>();

export const acquirePreview = (dataBase: string, id: string) => {
  let preview = previews.get(id);
  if (!preview) {
    preview = {
      users: 0,
      url: fetch(
        `${process.env.NEXT_PUBLIC_API_URL}${resourceBase(dataBase)}/${id}/download`,
        { credentials: 'include' }
      )
        .then(async response =>
          response.ok ? URL.createObjectURL(await response.blob()) : null
        )
        .catch(() => null)
    };
    previews.set(id, preview);
  }
  preview.users += 1;
  return preview.url;
};

export const releasePreview = (id: string) => {
  const preview = previews.get(id);
  if (!preview) return;
  preview.users -= 1;
  if (preview.users > 0) return;
  previews.delete(id);
  preview.url.then(url => {
    if (url) URL.revokeObjectURL(url);
  });
};

// The columns a filter can use without reading the whole table: the
// database indexes these.
export const isFilterable = (column: DataColumn) =>
  column.filterable ||
  column.unique ||
  column.type === 'relation' ||
  column.type === 'file';

// The tables whose relations point at `table`, with what deleting one of its
// rows does to theirs.
export const incomingRelations = (tables: DataTable[], table: string) =>
  tables.flatMap(other =>
    other.columns
      .filter(c => c.type === 'relation' && c.table === table)
      .map(c => ({ table: other, column: c }))
  );
