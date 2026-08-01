CREATE TABLE "alert_state" (
	"key" text PRIMARY KEY NOT NULL,
	"last_seen_id" text,
	"last_alert_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
