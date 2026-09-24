import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

import { ToolDefinition } from '../types';

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

export const searchResources: ToolDefinition = {
  title: 'Search Resources',
  description:
    "REQUIRED FIRST CALL on every user message before composing your answer. Pass the user's question (or a slightly rephrased natural-language version) as `query` — this searches every resource attached to this MCP server by meaning AND by exact words, so it finds paraphrases as well as literal ids, codes, SKUs and names, and returns the most relevant chunks first. Keep exact identifiers from the user's message verbatim in the query. ALWAYS call this before answering anything about the user's data, project, or any domain-specific topic; skipping it means answering blind and risking hallucination. Returns up to `limit` excerpts (default 5, max 20) with uri/title/score/excerpt, most relevant first (score is semantic similarity; an exact-match hit can outrank a higher score) — cite them directly, or call read-resource for full content / send-resource to deliver the file. Only skip on pure chit-chat with no factual content (greetings, thanks).",
  schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Natural language description of what to find (e.g. "shipping policy", "Q3 revenue numbers").'
      },
      limit: {
        type: 'number',
        description: `Maximum number of chunks to return (1-${MAX_LIMIT}). Defaults to ${DEFAULT_LIMIT}.`
      }
    },
    required: ['query']
  },
  handler: async (args, context) => {
    const query = String(args.query || '').trim();
    if (!query) {
      return {
        content: [{ type: 'text', text: 'Query is required.' }]
      };
    }

    const requestedLimit = Number(args.limit) || DEFAULT_LIMIT;
    const limit = Math.max(1, Math.min(MAX_LIMIT, requestedLimit));

    const queryEmbedding = await context.embedQuery(query);
    if (!queryEmbedding) {
      return {
        content: [
          {
            type: 'text',
            text: 'Embedding service is not configured (set EMBEDDING_API_KEY).'
          }
        ]
      };
    }

    const rows = await db.searchResourceChunks(context.db, {
      artifactId: context.artifactId,
      query,
      embedding: queryEmbedding,
      limit,
      rerank: utils.createResourceReranker({ env: context.env })
    });

    if (rows.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No matching resource chunks found. Resources may not be indexed yet.'
          }
        ]
      };
    }

    const results = rows.map(row => ({
      uri: row.uri,
      title: row.title,
      description: row.description || undefined,
      mimeType: row.mimeType,
      chunkIndex: row.chunkIndex,
      score: Number(row.similarity.toFixed(4)),
      excerpt: row.content
    }));

    return {
      content: [{ type: 'text', text: JSON.stringify(results) }]
    };
  }
};
