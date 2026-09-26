ALTER TABLE "artifact_resource" ADD COLUMN "sync_interval" text DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE "artifact_resource" ADD COLUMN "sync_started_at" timestamp;