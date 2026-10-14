ALTER TABLE "subscription" ADD COLUMN "voice_note_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "voice_note_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "voice_note_platform_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_period" ADD COLUMN "voice_note_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_period" ADD COLUMN "voice_note_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_period" ADD COLUMN "voice_note_platform_count" integer DEFAULT 0 NOT NULL;