CREATE TABLE "artifact_tool_version" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_tool_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"script_tag" text,
	"tools" json NOT NULL,
	"source_key" text,
	"source_hash" text,
	"error" text,
	"published_at" timestamp,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifact_tool_version" ADD CONSTRAINT "artifact_tool_version_artifact_tool_id_artifact_tool_id_fk" FOREIGN KEY ("artifact_tool_id") REFERENCES "public"."artifact_tool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_tool_version" ADD CONSTRAINT "artifact_tool_version_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_tool_version_tool_version_idx" ON "artifact_tool_version" USING btree ("artifact_tool_id","version");--> statement-breakpoint
CREATE INDEX "artifact_tool_version_tool_idx" ON "artifact_tool_version" USING btree ("artifact_tool_id");