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

  // Search entries stay in the order search returned them. That order is the
  // fused and reranked one; `score` is only the cosine similarity, and sorting
  // by it would undo the ranking.
  const searchEntries = collected.filter(s => s.score !== undefined);
  const readEntries = collected.filter(s => s.score === undefined);
  return [...searchEntries, ...readEntries];
};

// When an answer names none of what it searched, the footer still shows where
// the answer most likely came from — the top of the ranking — rather than
// nothing, or every hit.
const UNCITED_SOURCE_FALLBACK = 3;

// "p. 125", "pp. 123–126", "page 12", "págs. 4-5".
const PAGE_REFERENCE =
  /\b(?:pp?|pages?|p[aá]gs?|p[aá]ginas?)\.?\s*(\d{1,5})(?:\s*(?:[-–—]|to|a)\s*(\d{1,5}))?/gi;
const MAX_PAGE_RANGE = 50;

// Lowercased words only, so "ETag header — HTTP | MDN" in an answer matches the
// title "ETag header - HTTP | MDN", and "mml-book.pdf" matches "mml-book".
const normalize = (text: string): string =>
  ` ${text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;

// The ways an answer refers to a source: its whole title, the title without a
// parenthetical or a site suffix ("Northwind Handbook (draft)", "ETag header
// - HTTP | MDN"), its file name with and without the extension, and its URL.
const namesFor = (source: Source): string[] => {
  const names = [source.title, source.title.replace(/\s*\([^)]*\)\s*/g, ' ')];
  const lead = source.title.split(/\s+[|\-–—:]\s+/)[0];
  // A one-word lead ("Introduction", "Pricing") names half the corpus.
  if (lead.trim().split(/\s+/).length >= 2) names.push(lead);
  if (source.fileName) {
    names.push(source.fileName, source.fileName.replace(/\.[a-z0-9]+$/i, ''));
  }
  return names.map(normalize).filter(name => name.trim().length >= 4);
};

const citedPages = (answer: string): Set<number> => {
  const pages = new Set<number>();
  for (const match of answer.matchAll(PAGE_REFERENCE)) {
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : from;
    if (to < from || to - from > MAX_PAGE_RANGE) {
      pages.add(from);
      continue;
    }
    for (let page = from; page <= to; page++) pages.add(page);
  }
  return pages;
};

/**
 * Narrow a turn's sources to the ones its answer actually cites.
 *
 * Every search hit used to become a footer line, so an answer drawn from one
 * handbook section was followed by eight unrelated pages the search had also
 * returned. A search hit is kept when the answer names its resource — by title,
 * file name or URL — and, for a paged file, only the pages the answer cites
 * (or the best-ranked one, when it cites none). Resources the model read whole
 * are always kept: reading one is itself the citation.
 */
export const selectCitedSources = (
  sources: Source[],
  answerText: string
): Source[] => {
  const searchEntries = sources.filter(s => s.score !== undefined);
  const readEntries = sources.filter(s => s.score === undefined);
  if (searchEntries.length === 0) return sources;

  const answer = normalize(answerText);
  const pages = citedPages(answerText);
  const citedResources = new Set(
    searchEntries
      .filter(
        s =>
          answerText.includes(s.uri.replace(/\/+$/, '')) ||
          namesFor(s).some(name => answer.includes(name))
      )
      .map(s => s.resourceId)
  );

  const kept: Source[] = [];
  for (const resourceId of citedResources) {
    const entries = searchEntries.filter(s => s.resourceId === resourceId);
    const onCitedPage = entries.filter(
      s => s.pageNumber !== undefined && pages.has(s.pageNumber)
    );
    kept.push(...(onCitedPage.length > 0 ? onCitedPage : entries.slice(0, 1)));
  }

  const cited =
    kept.length > 0
      ? searchEntries.filter(s => kept.includes(s))
      : searchEntries.slice(0, UNCITED_SOURCE_FALLBACK);
  return [...cited, ...readEntries];
};
