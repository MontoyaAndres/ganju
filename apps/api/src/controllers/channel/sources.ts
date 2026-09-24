import { and, inArray, InferSelectModel } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';
import type { ExtractedDocumentMetadata, Source } from '@ganju/utils';

import { extractToolText } from './toolText';

type ArtifactResourceRow = InferSelectModel<typeof db.schema.artifactResource>;

interface SearchHit {
  uri: string;
  chunkIndex: number;
  score?: number;
  excerpt?: string;
  page?: number;
  updatedAt?: string;
}

const parseSearchHits = (output: unknown): SearchHit[] => {
  const text = extractToolText(output);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (h): h is SearchHit =>
        h && typeof h.uri === 'string' && typeof h.chunkIndex === 'number'
    );
  } catch {
    return [];
  }
};

export interface CollectSourcesUsageEvent {
  toolName: string;
  output: unknown;
  artifactResourceId?: string | null;
}

export const collectSources = async (
  dbInstance: ReturnType<typeof db.create>,
  usageEvents: CollectSourcesUsageEvent[],
  artifactResourceByUri: Map<string, ArtifactResourceRow>,
  artifactResourceById: Map<string, ArtifactResourceRow>
): Promise<Source[]> => {
  const orderedHits: Array<{
    resource: ArtifactResourceRow;
    hit?: SearchHit;
  }> = [];
  const seenSearch = new Set<string>();
  const seenRead = new Set<string>();

  for (const event of usageEvents) {
    if (event.toolName === utils.constants.RESOURCE_TOOL_KEY_SEARCH_RESOURCES) {
      for (const hit of parseSearchHits(event.output)) {
        const resource = artifactResourceByUri.get(hit.uri);
        if (!resource) continue;
        if (!utils.isResourceSourceEnabled(resource)) continue;
        const key = `${hit.uri}|${hit.chunkIndex}`;
        if (seenSearch.has(key)) continue;
        seenSearch.add(key);
        orderedHits.push({ resource, hit });
      }
    } else if (
      event.toolName === utils.constants.RESOURCE_TOOL_KEY_READ_RESOURCE &&
      event.artifactResourceId
    ) {
      if (seenRead.has(event.artifactResourceId)) continue;
      seenRead.add(event.artifactResourceId);
      const resource = artifactResourceById.get(event.artifactResourceId);
      if (!resource) continue;
      if (!utils.isResourceSourceEnabled(resource)) continue;
      orderedHits.push({ resource });
    }
  }

  if (orderedHits.length === 0) return [];

  // Search results carry their page now. The chunk lookup below is only for
  // results that predate that — an MCP worker older than this one, since the
  // two deploy separately.
  const pageByKey = new Map<string, number>();
  for (const { resource, hit } of orderedHits) {
    if (typeof hit?.page === 'number') {
      pageByKey.set(`${resource.id}|${hit.chunkIndex}`, hit.page);
    }
  }

  const fileLookups = orderedHits
    .filter(
      h =>
        h.resource.sourceType === utils.constants.RESOURCE_SOURCE_TYPE_FILE &&
        h.hit !== undefined &&
        typeof h.hit.updatedAt !== 'string'
    )
    .map(h => ({ resourceId: h.resource.id, chunkIndex: h.hit!.chunkIndex }));

  if (fileLookups.length > 0) {
    const resourceIds = Array.from(new Set(fileLookups.map(l => l.resourceId)));
    const indexes = Array.from(new Set(fileLookups.map(l => l.chunkIndex)));
    const rows = await dbInstance
      .select({
        resourceId: db.schema.artifactResourceChunk.resourceId,
        chunkIndex: db.schema.artifactResourceChunk.chunkIndex,
        metadata: db.schema.artifactResourceChunk.metadata
      })
      .from(db.schema.artifactResourceChunk)
      .where(
        and(
          inArray(db.schema.artifactResourceChunk.resourceId, resourceIds),
          inArray(db.schema.artifactResourceChunk.chunkIndex, indexes)
        )
      );
    for (const row of rows) {
      const meta = row.metadata as ExtractedDocumentMetadata | null;
      const page = meta?.loc?.pageNumber;
      if (typeof page === 'number') {
        pageByKey.set(`${row.resourceId}|${row.chunkIndex}`, page);
      }
    }
  }

  const seenSource = new Set<string>();
  const collected: Source[] = [];
  for (const { resource, hit } of orderedHits) {
    const isFile =
      resource.sourceType === utils.constants.RESOURCE_SOURCE_TYPE_FILE;
    const pageNumber =
      isFile && hit
        ? pageByKey.get(`${resource.id}|${hit.chunkIndex}`)
        : undefined;
    const dedupeKey = isFile
      ? `${resource.id}|${pageNumber ?? ''}`
      : resource.id;
    if (seenSource.has(dedupeKey)) continue;
    seenSource.add(dedupeKey);
    collected.push({
      resourceId: resource.id,
      uri: resource.uri,
      title: resource.title,
      sourceType: resource.sourceType as Source['sourceType'],
      mimeType: resource.mimeType,
      fileName: resource.fileName,
      pageNumber,
      chunkIndex: hit?.chunkIndex,
      score: hit?.score,
      excerpt: hit?.excerpt
    });
  }

  const searchEntries = collected
    .filter(s => s.score !== undefined)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const readEntries = collected.filter(s => s.score === undefined);
  return [...searchEntries, ...readEntries];
};
