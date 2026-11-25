ALTER TABLE "subscription" ADD COLUMN "trial_ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "no_plan_notice_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "trial_started_at" timestamp;