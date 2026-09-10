CREATE TABLE "usage_period" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"plan" text NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"shared_message_count" integer DEFAULT 0 NOT NULL,
	"tool_call_count" integer DEFAULT 0 NOT NULL,
	"peak_embedded_mb" bigint DEFAULT 0 NOT NULL,
	"reported_message_overage" integer DEFAULT 0 NOT NULL,
	"reported_shared_message_overage" integer DEFAULT 0 NOT NULL,
	"reported_embedded_overage_mb" bigint DEFAULT 0 NOT NULL,
	"reported_tool_call_overage" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "peak_embedded_mb" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_period" ADD CONSTRAINT "usage_period_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_period_organization_start_idx" ON "usage_period" USING btree ("organization_id","period_start");--> statement-breakpoint
CREATE INDEX "usage_period_organizationId_idx" ON "usage_period" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "usage_period_periodStart_idx" ON "usage_period" USING btree ("period_start");
