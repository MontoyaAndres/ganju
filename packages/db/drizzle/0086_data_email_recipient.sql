CREATE TABLE "data_email_recipient" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"confirmed_at" timestamp,
	"unsubscribed_at" timestamp,
	"requested_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_email_recipient" ADD CONSTRAINT "data_email_recipient_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "data_email_recipient_org_email_idx" ON "data_email_recipient" USING btree ("organization_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "data_email_recipient_token_idx" ON "data_email_recipient" USING btree ("token");--> statement-breakpoint
CREATE INDEX "data_email_recipient_org_requestedAt_idx" ON "data_email_recipient" USING btree ("organization_id","requested_at");--> statement-breakpoint
-- Functions published while ctx.channels needed no opt-in keep it. It
-- shipped on 2026-11-02; older versions can't call it.
UPDATE "artifact_tool_version" SET "tools" = (
	SELECT json_agg((t::jsonb || '{"channels": true}'::jsonb)::json)
	FROM json_array_elements("tools") AS t
) WHERE json_typeof("tools") = 'array' AND json_array_length("tools") > 0
	AND "created_at" >= '2026-11-01';
