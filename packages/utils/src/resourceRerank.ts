import { constants } from './constants';
import type { EnvSource } from './getEnv';

// The slice of the Workers AI binding the reranker calls. Declared here rather
// than imported so this package doesn't take a dependency on workers-types.
export interface RerankAiBinding {
  run(
    model: string,
    input: { query: string; contexts: Array<{ text: string }>; top_k?: number }
  ): Promise<unknown>;
}

type RerankResponse = {
  response?: Array<{ id?: number; score?: number }>;
};

/**
 * The cross-encoder second stage for resource search, or undefined when it is
 * off (RESOURCE_SEARCH_RERANK_ENABLED, unless `enabled` overrides it) or the
 * Worker has no `AI` binding — local dev without Workers AI keeps plain fusion.
 *
 * Returns one score per document, in input order. A response that doesn't
 * cover every document returns null, which keeps the fused order — a partial
 * ranking would silently drop the chunks it left out.
 */
export const createResourceReranker = (
  source: EnvSource,
  enabled: boolean = constants.RESOURCE_SEARCH_RERANK_ENABLED
):
  | ((query: string, documents: string[]) => Promise<number[] | null>)
  | undefined => {
  if (!enabled) return undefined;
  const ai = (source.env as { AI?: RerankAiBinding } | undefined)?.AI;
  if (!ai) return undefined;

  return async (query, documents) => {
    const result = (await ai.run(constants.RESOURCE_SEARCH_RERANK_MODEL, {
      query,
      contexts: documents.map(text => ({ text })),
      top_k: documents.length
    })) as RerankResponse;

    // Filled, not just sized: `some` skips the holes of a bare new Array(n), so
    // a document the response left out would pass the check below unscored.
    const scores: Array<number | undefined> = new Array(documents.length).fill(
      undefined
    );
    for (const item of result?.response ?? []) {
      if (
        typeof item.id === 'number' &&
        typeof item.score === 'number' &&
        item.id >= 0 &&
        item.id < documents.length
      ) {
        scores[item.id] = item.score;
      }
    }
    if (scores.some(score => score === undefined)) return null;
    return scores as number[];
  };
};
