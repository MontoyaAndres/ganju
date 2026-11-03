ALTER TABLE "artifact_database_trigger_run" ADD COLUMN "started_at" timestamp;--> statement-breakpoint
CREATE INDEX "artifact_database_trigger_run_trigger_startedAt_idx" ON "artifact_database_trigger_run" USING btree ("database_id","trigger_id","started_at");--> statement-breakpoint
UPDATE "artifact_database_trigger_run" SET "started_at" = "created_at" WHERE "attempts" > 0;