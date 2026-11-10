ALTER TABLE "builder_message" ADD COLUMN "own_key" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "builder_cost_micros" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "builder_own_key_cost_micros" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "reported_builder_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "builder_credit_cap" integer;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "builder_llm_id" text;--> statement-breakpoint
ALTER TABLE "usage_period" ADD COLUMN "builder_cost_micros" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_period" ADD COLUMN "builder_own_key_cost_micros" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_period" ADD COLUMN "reported_builder_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_builder_llm_id_organization_llm_id_fk" FOREIGN KEY ("builder_llm_id") REFERENCES "public"."organization_llm"("id") ON DELETE set null ON UPDATE no action;