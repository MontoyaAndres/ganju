import { sql } from 'drizzle-orm';
import { utils } from '@ganju/utils';

import type { Database } from './db';

// Scores each document against the query, in input order. Returning null — or
// throwing — keeps the fused order, so a reranker outage degrades search rather
// than breaking it.
export type ResourceReranker = (
  query: string,
  documents: string[]
) => Promise<number[] | null>;

export interface ResourceChunkSearch {
  artifactId: string;
  query: string;
  // The query embedded exactly as stored chunks are (RETRIEVAL_QUERY, L2-normalised).
  embedding: number[];
  limit: number;
  rerank?: ResourceReranker;
  // Filled in as the search runs, for a caller that wants to report where the
  // time went. Left untouched for a stage that didn't run.
  timings?: ResourceSearchTimings;
}

export interface ResourceSearchTimings {
  // The fused query: both rankers, fusion and the citation fields.
  sqlMs?: number;
  rerankMs?: number;
  // How many fused candidates went to the reranker (or were returned).
  candidates?: number;
  // Whether the reranker's order was used: false when it failed or returned
  // an incomplete ranking and the fused order was kept.
  reranked?: boolean;
}

export interface ResourceChunkMatch {
  resourceId: string;
  uri: string;
  title: string;
  description: string | null;
  mimeType: string | null;
  chunkIndex: number;
  content: string;
  // Cosine similarity to the query. Still reported for every match, including
  // one that only the lexical ranker found, but it is no longer the sort key.
  similarity: number;
  // 1-based position in each ranker's candidate list, null when that ranker
  // didn't surface the chunk. Kept for evaluating the search, not for clients.
  vectorRank: number | null;
  lexicalRank: number | null;
  sourceType: string;
  // Where a reader can open what this chunk came from: the page for a crawled
  // site, the file in Drive or OneDrive. Null for an upload, which has no
  // address outside Ganju.
  source: string | null;
  // The page (or slide) the chunk is on, when the document has pages worth
  // citing — never for a spreadsheet, a web page or a plain text file.
  page: number | null;
  // The heading path ("Returns > Gift orders"), a spreadsheet's sheet, or a
  // slide's title.
  section: string | null;
  // When our copy was last refreshed: the last sync for an imported file,
  // otherwise the last change to the resource. ISO 8601.
  updatedAt: string;
}

type Row = {
  resourceId: string;
  uri: string;
  title: string;
  description: string | null;
  mimeType: string | null;
  chunkIndex: number;
  content: string;
  similarity: number | string;
  vectorRank: number | string | null;
  lexicalRank: number | string | null;
  sourceType: string;
  sourceLink: string | null;
  pageNumber: string | null;
  totalPages: string | null;
  sheetName: string | null;
  slideTitle: string | null;
  headingPath: string | null;
  lastSyncedAt: string | null;
  updatedAt: string;
};

const toNumber = (value: number | string | null): number | null =>
  value === null ? null : Number(value);

// Only a link a reader can follow. The metadata a source link comes from can be
// written by a user's own tool, so anything but http(s) is dropped.
const toWebUrl = (value: string | null): string | null => {
  if (!value || !URL.canParse(value)) return null;
  const { protocol } = new URL(value);
  return protocol === 'https:' || protocol === 'http:' ? value : null;
};

const toIso = (value: string | null): string | null => {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
};

const parseHeadingPath = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((h): h is string => typeof h === 'string' && !!h)
      : [];
  } catch {
    return [];
  }
};

const resolvePage = (row: Row): number | null => {
  const page = toNumber(row.pageNumber);
  if (!page || row.sheetName) return null;
  // Every extracted document has a page number, most of them "1 of 1": a web
  // page, a text file, a Word file with no page breaks. Citing "p. 1" there
  // points at nothing, so only a PDF or a document with real pages gets one.
  const paged =
    row.mimeType === utils.constants.MIMETYPE_APPLICATION_PDF ||
    (toNumber(row.totalPages) ?? 1) > 1;
  return paged ? page : null;
};

const resolveSection = (row: Row): string | null => {
  const headingPath = parseHeadingPath(row.headingPath);
  if (headingPath.length > 0) return headingPath.join(' > ');
  return row.sheetName || row.slideTitle || null;
};

/**
 * Hybrid search over an artifact's indexed chunks: the nearest chunks by
 * embedding and the best full-text matches, merged with reciprocal rank fusion.
 *
 * Vectors find paraphrases and miss exact tokens; full text is the reverse — an
 * order id, SKU or error code is one token to it and a faint direction to an
 * embedding. Fusing ranks keeps both without tuning a weight between them.
 *
 * Each ranker's candidates are cut in a subquery before they are numbered, so
 * the vector side stays an ORDER BY … LIMIT the HNSW index can serve, and the
 * lexical side is a GIN lookup on the generated tsvector.
 */
export const searchResourceChunks = async (
  executor: Database,
  params: ResourceChunkSearch
): Promise<ResourceChunkMatch[]> => {
  const candidates = utils.constants.RESOURCE_SEARCH_CANDIDATES;
  const k = utils.constants.RESOURCE_SEARCH_RRF_K;
  const take = params.rerank
    ? Math.max(params.limit, utils.constants.RESOURCE_SEARCH_RERANK_CANDIDATES)
    : params.limit;
  const vector = `[${params.embedding.join(',')}]`;
  const commonDivisor = utils.constants.RESOURCE_SEARCH_COMMON_TERM_DIVISOR;
  const minCommon = utils.constants.RESOURCE_SEARCH_COMMON_TERM_MIN;

  const sqlStartedAt = Date.now();
  const rows = (await executor.execute(sql`
    WITH vec AS (
      SELECT id, row_number() OVER (ORDER BY distance, id) AS rank
      FROM (
        SELECT id, embedding <=> ${vector}::halfvec AS distance
        FROM artifact_resource_chunk
        WHERE artifact_id = ${params.artifactId}
        ORDER BY distance
        LIMIT ${candidates}
      ) nearest
    ),
    -- The query's words, OR-ed. Requiring every word (websearch_to_tsquery)
    -- loses the case this exists for: "estado del pedido ORD-48215" against an
    -- English order line, or "ORD-50139 refund" against an order that was
    -- cancelled. Stopwords in either language are dropped — the 'simple' config
    -- keeps them. Each lexeme is quoted for to_tsquery (quotes doubled,
    -- backslashes escaped) so no user text is ever read as tsquery syntax.
    words AS (
      SELECT to_tsquery(
        'simple',
        '''' || replace(replace(lexeme, '\', '\\'), '''', '''''') || ''''
      ) AS q
      FROM unnest(tsvector_to_array(to_tsvector('simple', ${params.query}))) AS lexeme
      WHERE ts_lexize('english_stem', lexeme) <> '{}'
        AND ts_lexize('spanish_stem', lexeme) <> '{}'
    ),
    -- Stopwords for this artifact: a word in more than a tenth of its chunks
    -- (RESOURCE_SEARCH_COMMON_TERM_DIVISOR) carries no signal here. It matters because of
    -- fusion — "ord" in "ORD-48213" matches every order record, which then
    -- appear in BOTH lists and outrank the one record that has the number.
    -- Counting stops at the threshold, so a common word costs a bounded scan.
    threshold AS (
      SELECT greatest(${minCommon}, count(*) / ${commonDivisor}) AS n
      FROM artifact_resource_chunk
      WHERE artifact_id = ${params.artifactId}
    ),
    counted AS (
      SELECT w.q, (
        SELECT count(*) FROM (
          SELECT 1 FROM artifact_resource_chunk c
          WHERE c.artifact_id = ${params.artifactId} AND c.content_tsv @@ w.q
          LIMIT (SELECT n + 1 FROM threshold)
        ) hits
      ) <= (SELECT n FROM threshold) AS distinctive
      FROM words w
    ),
    -- The distinctive words, or every word when none is: a query that is all
    -- common words ("order status") still gets a lexical list.
    terms AS (
      SELECT string_agg(q::text, ' | ')::tsquery AS q
      FROM counted
      WHERE distinctive OR NOT EXISTS (SELECT 1 FROM counted WHERE distinctive)
    ),
    lex AS (
      SELECT id, row_number() OVER (ORDER BY score DESC, id) AS rank
      FROM (
        -- ts_rank, not ts_rank_cd: under OR, a chunk matching more of the
        -- query's words should outrank one matching a single common word.
        SELECT c.id, ts_rank(c.content_tsv, terms.q, 1) AS score
        FROM artifact_resource_chunk c, terms
        WHERE c.artifact_id = ${params.artifactId} AND c.content_tsv @@ terms.q
        ORDER BY score DESC
        LIMIT ${candidates}
      ) matched
    ),
    fused AS (
      SELECT
        coalesce(vec.id, lex.id) AS id,
        coalesce(1.0 / (${k} + vec.rank), 0)
          + coalesce(1.0 / (${k} + lex.rank), 0) AS rrf,
        vec.rank AS vector_rank,
        lex.rank AS lexical_rank
      FROM vec FULL OUTER JOIN lex ON lex.id = vec.id
    )
    SELECT
      c.resource_id AS "resourceId",
      r.uri AS "uri",
      r.title AS "title",
      r.description AS "description",
      r.mime_type AS "mimeType",
      c.chunk_index AS "chunkIndex",
      c.content AS "content",
      1 - (c.embedding <=> ${vector}::halfvec) AS "similarity",
      f.vector_rank AS "vectorRank",
      f.lexical_rank AS "lexicalRank",
      -- Citation fields, read as single paths rather than whole columns. A
      -- crawled page's resource metadata is skipped outright: it holds the
      -- page's SEO snapshot, and a json column is parsed whole to read one key
      -- — tens of milliseconds a search on a large site. A page has neither
      -- key anyway; its link is its uri.
      r.source_type AS "sourceType",
      CASE WHEN r.source_type <> ${utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE}
        THEN coalesce(r.metadata->>'webViewLink', r.metadata->>'webUrl')
      END AS "sourceLink",
      c.metadata->'loc'->>'pageNumber' AS "pageNumber",
      c.metadata->'loc'->>'totalPages' AS "totalPages",
      c.metadata->'loc'->>'sheetName' AS "sheetName",
      c.metadata->'loc'->>'slideTitle' AS "slideTitle",
      c.metadata->>'headingPath' AS "headingPath",
      CASE WHEN r.source_type <> ${utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE}
        THEN r.metadata->>'lastSyncedAt'
      END AS "lastSyncedAt",
      to_char(r.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
    FROM fused f
    JOIN artifact_resource_chunk c ON c.id = f.id
    JOIN artifact_resource r ON r.id = c.resource_id
    -- On a tie (one list's #n against the other's #n), the exact-token match
    -- wins: it contains what the user typed, the vector hit only resembles it.
    ORDER BY f.rrf DESC, f.lexical_rank NULLS LAST, f.id
    LIMIT ${take}
  `)) as unknown as Row[];

  const matches: ResourceChunkMatch[] = rows.map(row => ({
    resourceId: row.resourceId,
    uri: row.uri,
    title: row.title,
    description: row.description,
    mimeType: row.mimeType,
    chunkIndex: Number(row.chunkIndex),
    content: row.content,
    similarity: Number(row.similarity),
    vectorRank: toNumber(row.vectorRank),
    lexicalRank: toNumber(row.lexicalRank),
    sourceType: row.sourceType,
    source:
      toWebUrl(row.sourceLink) ??
      (row.sourceType === utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE
        ? toWebUrl(row.uri)
        : null),
    page: resolvePage(row),
    section: resolveSection(row),
    updatedAt: toIso(row.lastSyncedAt) ?? toIso(row.updatedAt) ?? row.updatedAt
  }));

  if (params.timings) {
    params.timings.sqlMs = Date.now() - sqlStartedAt;
    params.timings.candidates = matches.length;
  }

  if (!params.rerank || matches.length <= 1) {
    return matches.slice(0, params.limit);
  }

  let scores: number[] | null = null;
  const rerankStartedAt = Date.now();
  try {
    scores = await params.rerank(
      params.query,
      matches.map(m => m.content)
    );
  } catch (error) {
    console.error('Resource rerank failed; keeping the fused order', error);
  }
  const reranked = !!scores && scores.length === matches.length;
  if (params.timings) {
    params.timings.rerankMs = Date.now() - rerankStartedAt;
    params.timings.reranked = reranked;
  }
  if (!scores || !reranked) {
    return matches.slice(0, params.limit);
  }

  return matches
    .map((match, i) => ({ match, score: scores[i], i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, params.limit)
    .map(({ match }) => match);
};

// What a search result looks like to whoever asked — the search-resources tool
// and a custom tool's ctx.resources.search answer with exactly this, so a model
// and a script see the same fields. Citation fields are left out rather than
// sent as null when a chunk has none: the model reads every key it is given.
export interface ResourceSearchResult {
  uri: string;
  title: string;
  description?: string;
  mimeType: string | null;
  source?: string;
  page?: number;
  section?: string;
  updatedAt: string;
  chunkIndex: number;
  score: number;
  excerpt: string;
}

export const toResourceSearchResult = (
  match: ResourceChunkMatch
): ResourceSearchResult => ({
  uri: match.uri,
  title: match.title,
  description: match.description || undefined,
  mimeType: match.mimeType,
  ...(match.source ? { source: match.source } : {}),
  ...(match.page ? { page: match.page } : {}),
  ...(match.section ? { section: match.section } : {}),
  updatedAt: match.updatedAt,
  chunkIndex: match.chunkIndex,
  score: Number(match.similarity.toFixed(4)),
  excerpt: match.content
});
