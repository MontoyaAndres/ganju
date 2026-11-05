import { and, eq, inArray } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { unknownFileUris } from '@ganju/utils/data';
import type {
  DataFileLinks,
  DataFileValue,
  DataSchema
} from '@ganju/utils/data';

import * as schema from './schema';
import { callDataMetered, openArtifactDatabase } from './data';
import type { DataNamespaceLike } from './data';
import type { DbExecutor } from './usage';

// Who clears and moves links when knowledge changes, on rows and in history.
const KNOWLEDGE_ACTOR = 'system:knowledge';
const URIS_PER_CALL = 500;

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
};

export interface KnowledgeItem {
  id: string;
  uri: string;
  title: string;
  mimeType: string;
  size: number | null;
}

// The project's knowledge items with these uris, one per uri. A website seed
// shares its uri with its first page; the page is the one a caller can read.
export const knowledgeItemsByUri = async (
  executor: DbExecutor,
  artifactId: string,
  uris: string[]
): Promise<Map<string, KnowledgeItem>> => {
  const found = new Map<string, KnowledgeItem>();
  for (const part of chunk([...new Set(uris)], URIS_PER_CALL)) {
    const rows = await executor
      .select({
        id: schema.artifactResource.id,
        uri: schema.artifactResource.uri,
        title: schema.artifactResource.title,
        mimeType: schema.artifactResource.mimeType,
        size: schema.artifactResource.size,
        sourceType: schema.artifactResource.sourceType,
        parentResourceId: schema.artifactResource.parentResourceId
      })
      .from(schema.artifactResource)
      .where(
        and(
          eq(schema.artifactResource.artifactId, artifactId),
          inArray(schema.artifactResource.uri, part)
        )
      );
    for (const row of rows) {
      if (!utils.isExposedResource(row)) continue;
      found.set(row.uri, {
        id: row.id,
        uri: row.uri,
        title: row.title,
        mimeType: row.mimeType,
        size: row.size === null ? null : Number(row.size)
      });
    }
  }
  return found;
};

// A query result from the database object says where its file values are
// (`fileFields`, key paths within each row). Only those are touched: a json
// column holding { "uri": … } stays as it is.
interface WithFileFields {
  rows?: unknown;
  fileFields?: unknown;
}

const fileValues = (result: unknown): { uri: string }[] => {
  if (!result || typeof result !== 'object') return [];
  const { rows, fileFields } = result as WithFileFields;
  if (!Array.isArray(rows) || !Array.isArray(fileFields)) return [];
  const out: { uri: string }[] = [];
  for (const row of rows) {
    for (const path of fileFields as string[][]) {
      let value: unknown = row;
      for (const key of path) {
        value =
          value && typeof value === 'object'
            ? (value as Record<string, unknown>)[key]
            : undefined;
      }
      if (
        value &&
        typeof value === 'object' &&
        typeof (value as { uri?: unknown }).uri === 'string'
      ) {
        out.push(value as { uri: string });
      }
    }
  }
  return out;
};

const dropFileFields = (result: unknown) => {
  if (result && typeof result === 'object') {
    delete (result as WithFileFields).fileFields;
  }
};

// Fills each file value in a query result with its item's title and type,
// or marks it missing, in one lookup. Changes `result` in place and returns
// it. `withId` adds the item's id and size, for the dashboard's previews.
export const resolveFileValues = async <T>(
  executor: DbExecutor,
  artifactId: string,
  result: T,
  options: { withId?: boolean } = {}
): Promise<T> => {
  const values = fileValues(result);
  dropFileFields(result);
  if (values.length === 0) return result;
  const items = await knowledgeItemsByUri(
    executor,
    artifactId,
    values.map(v => v.uri)
  );
  for (const v of values as DataFileValue[]) {
    const item = items.get(v.uri);
    if (item) {
      if (options.withId) {
        v.id = item.id;
        if (item.size !== null) v.size = item.size;
      }
      v.title = item.title;
      v.mimeType = item.mimeType;
    } else {
      v.missing = true;
    }
  }
  return result;
};

// A query result with each file value back to its plain uri, as trigger
// events carry them.
export const flattenFileValues = <T>(result: T): T => {
  if (!result || typeof result !== 'object') return result;
  const { rows, fileFields } = result as WithFileFields;
  if (Array.isArray(rows) && Array.isArray(fileFields)) {
    for (const row of rows) {
      for (const path of fileFields as string[][]) {
        let parent: unknown = row;
        for (const key of path.slice(0, -1)) {
          parent =
            parent && typeof parent === 'object'
              ? (parent as Record<string, unknown>)[key]
              : undefined;
        }
        const last = path[path.length - 1];
        if (!parent || typeof parent !== 'object') continue;
        const value = (parent as Record<string, unknown>)[last];
        if (value && typeof value === 'object' && 'uri' in value) {
          (parent as Record<string, unknown>)[last] = (
            value as { uri: string }
          ).uri;
        }
      }
    }
  }
  dropFileFields(result);
  return result;
};

// The uris a write sends to file columns that no knowledge item has. Only
// plain values are checked: increments and references can't be files.
export const missingFileUris = async (
  executor: DbExecutor,
  artifactId: string,
  schemaOf: DataSchema,
  operations: unknown
): Promise<string[]> => {
  if (!Array.isArray(operations)) return [];
  const uris: string[] = [];
  for (const op of operations) {
    if (!op || typeof op !== 'object') continue;
    const { table: name, values, rows, set } = op as Record<string, unknown>;
    const table = schemaOf.tables.find(t => t.name === name);
    if (!table) continue;
    const files = table.columns.filter(c => c.type === 'file').map(c => c.name);
    if (files.length === 0) continue;
    const records = [values, set, ...(Array.isArray(rows) ? rows : [])];
    for (const record of records) {
      if (!record || typeof record !== 'object') continue;
      for (const column of files) {
        const raw = (record as Record<string, unknown>)[column];
        const uri =
          typeof raw === 'string'
            ? raw.trim()
            : raw &&
                typeof raw === 'object' &&
                typeof (raw as { uri?: unknown }).uri === 'string'
              ? (raw as { uri: string }).uri.trim()
              : null;
        if (uri) uris.push(uri);
      }
    }
  }
  if (uris.length === 0) return [];
  const items = await knowledgeItemsByUri(executor, artifactId, uris);
  return [...new Set(uris)].filter(uri => !items.has(uri));
};

// Whether a write might set a file column: some value in it looks like a
// uri. Lets a caller skip reading the schema for every other write.
const URI_LIKE = /^\s*[a-z][a-z0-9+.-]*:\/\//i;
const mayLinkFiles = (value: unknown, depth = 0): boolean => {
  if (depth > 4) return false;
  if (typeof value === 'string') return URI_LIKE.test(value);
  if (Array.isArray(value)) return value.some(v => mayLinkFiles(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.values(value).some(v => mayLinkFiles(v, depth + 1));
  }
  return false;
};

// Refuses a write that links a uri no item of the project has. The schema
// is only read when the write carries something uri-like.
export const assertFileUrisExist = async (
  executor: DbExecutor,
  artifactId: string,
  loadSchema: () => Promise<DataSchema>,
  operations: unknown
): Promise<void> => {
  if (!mayLinkFiles(operations)) return;
  const missing = await missingFileUris(
    executor,
    artifactId,
    await loadSchema(),
    operations
  );
  if (missing.length > 0) throw unknownFileUris(missing);
};

// The uris among `uris` that no item of the project has any more: a link is
// only cleared once nothing answers to it.
const goneUris = async (
  executor: DbExecutor,
  artifactId: string,
  uris: string[]
): Promise<string[]> => {
  const remaining = new Set<string>();
  for (const part of chunk([...new Set(uris)], URIS_PER_CALL)) {
    const rows = await executor
      .select({ uri: schema.artifactResource.uri })
      .from(schema.artifactResource)
      .where(
        and(
          eq(schema.artifactResource.artifactId, artifactId),
          inArray(schema.artifactResource.uri, part)
        )
      );
    for (const row of rows) remaining.add(row.uri);
  }
  return [...new Set(uris)].filter(uri => !remaining.has(uri));
};

// The rows that link these items, for the delete dialog. Null when the
// project has no database.
export const fileLinksFor = async (
  executor: DbExecutor,
  namespace: DataNamespaceLike,
  artifactId: string,
  uris: string[]
): Promise<DataFileLinks | null> => {
  if (uris.length === 0) return { links: [] };
  const opened = await openArtifactDatabase(executor, namespace, artifactId);
  if (!opened) return null;
  const byColumn = new Map<string, DataFileLinks['links'][number]>();
  for (const part of chunk([...new Set(uris)], URIS_PER_CALL)) {
    const result = await callDataMetered(
      executor,
      opened.row,
      'fileLinks',
      () => opened.stub.fileLinks({ actor: KNOWLEDGE_ACTOR }, { uris: part }),
      { retryRead: true, ganju: true }
    );
    for (const link of result.links) {
      const key = `${link.table}.${link.column}`;
      const seen = byColumn.get(key);
      if (seen) seen.rows += link.rows;
      else byColumn.set(key, { ...link });
    }
  }
  return { links: [...byColumn.values()] };
};

// After knowledge items are deleted or their uris change: clears the links
// to uris nothing answers to any more, or moves them to the new uri.
// Best-effort: a link left behind reads as missing and is cleared when its
// row is saved.
export const updateFileLinks = async (
  executor: DbExecutor,
  namespace: DataNamespaceLike,
  artifactId: string,
  changes: { from: string; to: string | null }[]
): Promise<void> => {
  try {
    if (changes.length === 0) return;
    const gone = new Set(
      await goneUris(
        executor,
        artifactId,
        changes.map(c => c.from)
      )
    );
    const due = changes.filter(c => gone.has(c.from) && c.from !== c.to);
    if (due.length === 0) return;
    const opened = await openArtifactDatabase(executor, namespace, artifactId);
    if (!opened) return;
    for (const part of chunk(due, URIS_PER_CALL)) {
      await callDataMetered(
        executor,
        opened.row,
        'replaceFileLinks',
        () =>
          opened.stub.replaceFileLinks(
            // Housekeeping: runs even once the plan made the database read-only.
            {
              actor: KNOWLEDGE_ACTOR,
              limits: { maxBytes: opened.limits.maxBytes }
            },
            { changes: part }
          ),
        { ganju: true }
      );
    }
  } catch (error) {
    console.error('data-file-links-update-failed', artifactId, error);
  }
};

// The uris of deleted items, as changes that clear their links.
export const clearedLinks = (uris: string[]) =>
  [...new Set(uris)].map(from => ({ from, to: null }));

// Links to clear, gathered while a sync removes items and cleared at its
// end: one call per project, not one per removed item.
export const createFileLinkCleanup = () => {
  const byArtifact = new Map<string, Set<string>>();
  return {
    add(artifactId: string, uri: string) {
      const uris = byArtifact.get(artifactId) ?? new Set<string>();
      uris.add(uri);
      byArtifact.set(artifactId, uris);
    },
    async flush(executor: DbExecutor, namespace: DataNamespaceLike) {
      for (const [artifactId, uris] of byArtifact) {
        await updateFileLinks(
          executor,
          namespace,
          artifactId,
          clearedLinks([...uris])
        );
      }
      byArtifact.clear();
    }
  };
};

export type FileLinkCleanup = ReturnType<typeof createFileLinkCleanup>;
