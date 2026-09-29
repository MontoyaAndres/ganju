CREATE TABLE "tool_confirmation_use" (
	"id" text PRIMARY KEY NOT NULL,
	"tool_name" text NOT NULL,
	"artifact_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tool_confirmation_use" ADD CONSTRAINT "tool_confirmation_use_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tool_confirmation_use_createdAt_idx" ON "tool_confirmation_use" USING btree ("created_at");