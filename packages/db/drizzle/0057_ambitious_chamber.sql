CREATE TABLE "user_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"document" text NOT NULL,
	"version" text NOT NULL,
	"source" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"locale" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_consent" ADD CONSTRAINT "user_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_consent_userId_idx" ON "user_consent" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_consent_user_document_version_idx" ON "user_consent" USING btree ("user_id","document","version");