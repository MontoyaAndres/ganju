-- Halve the embedding from 3072 to 1536 dimensions.
--
-- drizzle-kit generates only the bare `ALTER COLUMN ... SET DATA TYPE`, which
-- cannot work here for two reasons: there is no implicit cast between halfvec
-- widths, and the HNSW index is built on the old width. So the conversion is
-- written by hand.
--
-- No re-embedding is needed. gemini-embedding-001 is Matryoshka-trained, so the
-- first 1536 components of a stored vector, re-normalised to unit length, are
-- identical to what the API returns when asked for 1536 directly (verified:
-- cosine 1.000000). That makes this a pure in-database transform.
--
-- Note for production: the ALTER rewrites the table and the CREATE INDEX
-- rebuilds HNSW from scratch, so both take an ACCESS EXCLUSIVE lock. On a large
-- corpus run it in a maintenance window, and consider raising
-- maintenance_work_mem first so the index build stays in memory.

DROP INDEX IF EXISTS "artifact_resource_chunk_embedding_idx";

ALTER TABLE "artifact_resource_chunk"
  ALTER COLUMN "embedding" SET DATA TYPE halfvec(1536)
  USING l2_normalize(subvector("embedding"::vector, 1, 1536))::halfvec(1536);

CREATE INDEX "artifact_resource_chunk_embedding_idx"
  ON "artifact_resource_chunk"
  USING hnsw ("embedding" halfvec_cosine_ops);
