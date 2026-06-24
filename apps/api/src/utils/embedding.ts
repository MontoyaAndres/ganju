import { GoogleGenAI } from '@google/genai';
import { db, utils as dbUtils } from '@ganju/db';
import { utils } from '@ganju/utils';
import type { EnvSource, ExtractedDocument } from '@ganju/utils';
import { eq, sql } from 'drizzle-orm';

import type { Bindings } from '../types';

type ApiEnvSource = EnvSource & { env: Bindings };

export type EmbeddingTaskType =
  | 'RETRIEVAL_DOCUMENT'
  | 'RETRIEVAL_QUERY'
  | 'SEMANTIC_SIMILARITY';

const embedGemini = async (params: {
  apiKey: string;
  inputs: string[];
  taskType: EmbeddingTaskType;
}): Promise<number[][]> =>
  utils.withRateLimitRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: params.apiKey });
    const response = await ai.models.embedContent({
      model: utils.constants.EMBEDDING_MODEL,
      contents: params.inputs,
      config: { taskType: params.taskType }
    });

    const items = response.embeddings;
    if (!Array.isArray(items)) {
      throw new Error('Gemini embedding response missing embeddings array');
    }

    return items.map(item => {
      if (!item.values) throw new Error('Gemini embedding missing values');
      if (item.values.length !== utils.constants.EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Gemini returned ${item.values.length} dims; expected ${utils.constants.EMBEDDING_DIMENSIONS}.`
        );
      }
      return item.values;
    });
  });

export const generateEmbeddings = async (
  source: ApiEnvSource,
  inputs: string[],
  taskType: EmbeddingTaskType = 'RETRIEVAL_DOCUMENT'
): Promise<number[][] | null> => {
  const apiKey = utils.getEnv(source, 'EMBEDDING_API_KEY');
  if (!apiKey || inputs.length === 0) return null;

  const out: number[][] = [];
  for (let i = 0; i < inputs.length; i += utils.constants.EMBED_BATCH_SIZE) {
    const batch = inputs.slice(i, i + utils.constants.EMBED_BATCH_SIZE);
    const embeddings = await embedGemini({ apiKey, inputs: batch, taskType });
    out.push(...embeddings);
    if (i + utils.constants.EMBED_BATCH_SIZE < inputs.length) {
      await utils.sleep(100);
    }
  }
  return out;
};

export const generateEmbedding = async (
  source: ApiEnvSource,
  text: string,
  taskType: EmbeddingTaskType = 'RETRIEVAL_QUERY'
): Promise<number[] | null> => {
  if (!text.trim()) return null;
  const embeddings = await generateEmbeddings(source, [text], taskType);
  return embeddings?.[0] ?? null;
};

export const reindexResourceChunks = async (
  source: ApiEnvSource,
  resource: {
    id: string;
    artifactId: string;
    title?: string | null;
    description?: string | null;
    uri?: string | null;
    mimeType?: string | null;
    fileName?: string | null;
    content?: string | null;
    documents?: ExtractedDocument[] | null;
  }
): Promise<void> => {
  const header = utils.buildHeader(resource);
  const prepared = utils.prepareChunks(
    header,
    resource.documents ?? null,
    resource.content ?? null
  );

  const dbInstance = db.create(source);

  // Capture this resource's current embedded footprint (bytes) before we drop
  // its chunks, so we can apply the net change to the artifact's denormalized
  // embedded-size total — the figure the plan's storage quota reads.
  const [{ oldBytes }] = await dbInstance
    .select({
      oldBytes: sql<number>`coalesce(sum(octet_length(${db.schema.artifactResourceChunk.content})), 0)::bigint`
    })
    .from(db.schema.artifactResourceChunk)
    .where(eq(db.schema.artifactResourceChunk.resourceId, resource.id));

  await dbInstance
    .delete(db.schema.artifactResourceChunk)
    .where(eq(db.schema.artifactResourceChunk.resourceId, resource.id));

  const apiKey = utils.getEnv(source, 'EMBEDDING_API_KEY');
  const willEmbed = prepared.length > 0 && !!apiKey;

  // Bytes of embedded content this resource now holds (sum of inserted chunks).
  let newBytes = 0;
  if (willEmbed) {
    const encoder = new TextEncoder();
    const batchSize = utils.constants.EMBED_BATCH_SIZE;
    for (let i = 0; i < prepared.length; i += batchSize) {
      const batch = prepared.slice(i, i + batchSize);
      const embeddings = await embedGemini({
        apiKey: apiKey as string,
        inputs: batch.map(p => p.content),
        taskType: 'RETRIEVAL_DOCUMENT'
      });
      if (i + batchSize < prepared.length) {
        await utils.sleep(100);
      }
      try {
        await dbInstance.insert(db.schema.artifactResourceChunk).values(
          batch.map((chunk, j) => ({
            resourceId: resource.id,
            artifactId: resource.artifactId,
            chunkIndex: i + j,
            content: chunk.content,
            embedding: embeddings[j],
            metadata: chunk.metadata
          }))
        );
      } catch (error: any) {
        const { refId } = await dbUtils.handleError(source, error, {
          service: utils.constants.SERVICE_NAME_API,
          metadata: {
            resourceId: resource.id,
            batchIndex: i / batchSize,
            batchSize: batch.length
          }
        });
        throw new Error(
          `embedding insert failed (refId: ${refId}) ${error.message}`
        );
      }
      for (const chunk of batch) {
        newBytes += encoder.encode(chunk.content).length;
      }
    }
  }

  // Apply the net delta to the artifact total, clamped at zero so transient
  // drift can never make it negative.
  const delta = newBytes - Number(oldBytes);
  if (delta !== 0) {
    await dbInstance
      .update(db.schema.artifact)
      .set({
        artifactResourceEmbeddedSize: sql`GREATEST((${db.schema.artifact.artifactResourceEmbeddedSize}::bigint + ${delta}), 0)`
      })
      .where(eq(db.schema.artifact.id, resource.artifactId));
  }
};
