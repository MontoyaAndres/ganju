CREATE TABLE "tool_approval" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"user_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"tool_title" text,
	"arguments" json NOT NULL,
	"arguments_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"approved_at" timestamp,
	"denied_at" timestamp,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tool_approval" ADD CONSTRAINT "tool_approval_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_approval" ADD CONSTRAINT "tool_approval_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tool_approval_userId_idx" ON "tool_approval" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tool_approval_expiresAt_idx" ON "tool_approval" USING btree ("expires_at");