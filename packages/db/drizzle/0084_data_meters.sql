ALTER TABLE "subscription" ADD COLUMN "reported_data_storage_mb" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "reported_data_rows_written" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "reported_data_rows_read" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_period" ADD COLUMN "reported_data_storage_mb" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_period" ADD COLUMN "reported_data_rows_written" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_period" ADD COLUMN "reported_data_rows_read" bigint DEFAULT 0 NOT NULL;