-- Lexical index for hybrid resource search.
--
-- Note for production: adding a STORED generated column rewrites the table under
-- an ACCESS EXCLUSIVE lock, and the GIN build reads every row again. Search and
-- indexing both block until it finishes, so run it in a quiet window.

ALTER TABLE "artifact_resource_chunk" ADD COLUMN "content_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;--> statement-breakpoint
CREATE INDEX "artifact_resource_chunk_content_tsv_idx" ON "artifact_resource_chunk" USING gin ("content_tsv");--> statement-breakpoint
-- Every vector search filters by artifact_id, and HNSW applies that filter only
-- AFTER its index scan: on an artifact holding half the table, asking for 50
-- nearest chunks returned 14. Iterative scans (pgvector 0.8+) keep scanning
-- until the LIMIT is met. relaxed_order is safe here because search re-sorts
-- its candidates by exact distance before ranking them.
--
-- A database default rather than a per-query SET LOCAL, which would cost a
-- transaction and three extra round trips on every search. Takes effect on new
-- connections. Fails here — not at search time — if pgvector is older than 0.8.
DO $$
BEGIN
  EXECUTE format(
    'ALTER DATABASE %I SET hnsw.iterative_scan = relaxed_order',
    current_database()
  );
END $$;
