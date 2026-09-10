ALTER TABLE "subscription" RENAME COLUMN "stripe_customer_id" TO "billing_customer_id";--> statement-breakpoint
ALTER TABLE "subscription" RENAME COLUMN "stripe_subscription_id" TO "billing_subscription_id";--> statement-breakpoint
ALTER TABLE "subscription" RENAME COLUMN "stripe_price_id" TO "billing_product_id";--> statement-breakpoint
ALTER TABLE "subscription" RENAME COLUMN "last_stripe_event_at" TO "last_billing_event_at";--> statement-breakpoint
DROP INDEX "subscription_stripe_customer_idx";--> statement-breakpoint
DROP INDEX "subscription_stripe_subscription_idx";--> statement-breakpoint
CREATE INDEX "subscription_billing_customer_idx" ON "subscription" USING btree ("billing_customer_id");--> statement-breakpoint
CREATE INDEX "subscription_billing_subscription_idx" ON "subscription" USING btree ("billing_subscription_id");
