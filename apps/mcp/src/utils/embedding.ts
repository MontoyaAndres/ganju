import { Context } from 'hono';
import { GoogleGenAI } from '@google/genai';
import { utils } from '@ganju/utils';

export type EmbeddingTaskType =
  | 'RETRIEVAL_DOCUMENT'
  | 'RETRIEVAL_QUERY'
  | 'SEMANTIC_SIMILARITY';

export const generateEmbedding = async (
  c: Context,
  text: string,
  taskType: EmbeddingTaskType = 'RETRIEVAL_QUERY'
): Promise<number[] | null> => {
  const apiKey = utils.getEnv(c, 'EMBEDDING_API_KEY');
  if (!apiKey || !text.trim()) return null;

  return utils.withRateLimitRetry(async () => {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.embedContent({
      model: utils.constants.EMBEDDING_MODEL,
      contents: text,
      config: {
        taskType,
        outputDimensionality: utils.constants.EMBEDDING_DIMENSIONS
      }
    });

    const values = response.embeddings?.[0]?.values;
    if (!Array.isArray(values)) return null;
    if (values.length !== utils.constants.EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Gemini returned ${values.length} dims; expected ${utils.constants.EMBEDDING_DIMENSIONS}.`
      );
    }
    // Query vectors must be normalised exactly as the stored ones are, or the
    // two sides of the cosine comparison aren't on the same scale.
    return utils.l2Normalize(values);
  });
};
