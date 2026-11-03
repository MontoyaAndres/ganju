CREATE TABLE "artifact_database_trigger_run" (
	"id" text PRIMARY KEY NOT NULL,
	"database_id" text NOT NULL,
	"trigger_id" text NOT NULL,
	"trigger_name" text NOT NULL,
	"event_id" text NOT NULL,
	"table_name" text NOT NULL,
	"event" text NOT NULL,
	"row_id" integer,
	"action" text,
	"status" text NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"message" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "reported_data_trigger_runs" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_period" ADD COLUMN "reported_data_trigger_runs" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "artifact_database_trigger_run" ADD CONSTRAINT "artifact_database_trigger_run_database_id_artifact_database_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."artifact_database"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_database_trigger_run_eventId_idx" ON "artifact_database_trigger_run" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "artifact_database_trigger_run_trigger_createdAt_idx" ON "artifact_database_trigger_run" USING btree ("database_id","trigger_id","created_at");