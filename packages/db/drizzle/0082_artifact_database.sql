CREATE TABLE "artifact_database" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" text,
	"object_name" text NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'CREATING' NOT NULL,
	"error" text,
	"location_hint" text,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"size_checked_at" timestamp,
	"last_read_at" timestamp,
	"last_write_at" timestamp,
	"deleted_at" timestamp,
	"deleted_by" text,
	"delete_after" timestamp,
	"delete_bookmark" text,
	"purged_at" timestamp,
	"abandon_warned_at" timestamp,
	"abandon_reminded_at" timestamp,
	"delete_ready_at" timestamp,
	"export_key" text,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_database_artifact_id_unique" UNIQUE("artifact_id"),
	CONSTRAINT "artifact_database_object_name_unique" UNIQUE("object_name")
);
--> statement-breakpoint
CREATE TABLE "artifact_database_change" (
	"id" text PRIMARY KEY NOT NULL,
	"database_id" text NOT NULL,
	"actor" text NOT NULL,
	"kind" text NOT NULL,
	"target" text,
	"detail" json,
	"bookmark" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "data_rows_read_count" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "data_rows_written_count" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "data_request_count" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "peak_data_mb" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "data_trigger_run_count" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "plan_changed_at" timestamp;--> statement-breakpoint
ALTER TABLE "usage_period" ADD COLUMN "data_rows_read_count" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_period" ADD COLUMN "data_rows_written_count" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_period" ADD COLUMN "data_request_count" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_period" ADD COLUMN "peak_data_mb" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_period" ADD COLUMN "data_trigger_run_count" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "artifact_database" ADD CONSTRAINT "artifact_database_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_database" ADD CONSTRAINT "artifact_database_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_database_change" ADD CONSTRAINT "artifact_database_change_database_id_artifact_database_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."artifact_database"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifact_database_organizationId_idx" ON "artifact_database" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "artifact_database_status_deleteAfter_idx" ON "artifact_database" USING btree ("status","delete_after");--> statement-breakpoint
CREATE INDEX "artifact_database_change_databaseId_createdAt_idx" ON "artifact_database_change" USING btree ("database_id","created_at");