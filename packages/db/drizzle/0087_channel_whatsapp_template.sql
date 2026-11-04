CREATE TABLE "channel_whatsapp_template" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"template_id" text NOT NULL,
	"name" text NOT NULL,
	"language" text NOT NULL,
	"category" text NOT NULL,
	"status" text NOT NULL,
	"rejected_reason" text,
	"components" json NOT NULL,
	"variable_labels" json,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_whatsapp_template" ADD CONSTRAINT "channel_whatsapp_template_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_whatsapp_template_channel_name_language_idx" ON "channel_whatsapp_template" USING btree ("channel_id","name","language");--> statement-breakpoint
CREATE INDEX "channel_whatsapp_template_status_idx" ON "channel_whatsapp_template" USING btree ("status");