import { Context } from 'hono';
import { GoogleGenAI } from '@google/genai';
import { utils } from '@ganju/utils';

// Query embeddings for ctx.resources.search. Same call apps/mcp makes for
// search-resources — the vectors have to be produced by the same model, at the
// same dimensionality, and normalised the same way, or the two sides of the
// cosine comparison aren't on the same scale.
export const generateEmbedding = async (
  c: Context,
  text: string
): Promise<number[] | null> => {
  const apiKey = utils.getEnv(c, 'EMBEDDING_API_KEY');
  if (!apiKey || !text.trim()) return null;

  return utils.withRateLimitRetry(async () => {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.embedContent({
      model: utils.constants.EMBEDDING_MODEL,
      contents: text,
      config: {
        taskType: 'RETRIEVAL_QUERY',
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
    return utils.l2Normalize(values);
  });
};
