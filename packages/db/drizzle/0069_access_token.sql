CREATE TABLE "access_token" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"hint" text NOT NULL,
	"expires_at" timestamp,
	"last_used_at" timestamp,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_token" ADD CONSTRAINT "access_token_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_token" ADD CONSTRAINT "access_token_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_token" ADD CONSTRAINT "access_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_token_tokenHash_idx" ON "access_token" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "access_token_projectId_idx" ON "access_token" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "access_token_organizationId_idx" ON "access_token" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "access_token_userId_idx" ON "access_token" USING btree ("user_id");