CREATE TABLE "builder_change_set" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"artifact_id" text NOT NULL,
	"items" json NOT NULL,
	"before" json,
	"status" text DEFAULT 'proposed' NOT NULL,
	"summary" text,
	"error" text,
	"applied_by_user_id" text,
	"applied_at" timestamp,
	"undone_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "builder_conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"artifact_id" text NOT NULL,
	"user_id" text,
	"title" text,
	"status" text DEFAULT 'idle' NOT NULL,
	"summary" text,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "builder_message" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"seq" integer NOT NULL,
	"turn_id" text NOT NULL,
	"role" text NOT NULL,
	"content" json NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"cards" json,
	"tool_results_stripped_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "builder_change_set" ADD CONSTRAINT "builder_change_set_conversation_id_builder_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."builder_conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_change_set" ADD CONSTRAINT "builder_change_set_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_change_set" ADD CONSTRAINT "builder_change_set_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_change_set" ADD CONSTRAINT "builder_change_set_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_change_set" ADD CONSTRAINT "builder_change_set_applied_by_user_id_user_id_fk" FOREIGN KEY ("applied_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_conversation" ADD CONSTRAINT "builder_conversation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_conversation" ADD CONSTRAINT "builder_conversation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_conversation" ADD CONSTRAINT "builder_conversation_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_conversation" ADD CONSTRAINT "builder_conversation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_message" ADD CONSTRAINT "builder_message_conversation_id_builder_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."builder_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "builder_change_set_conversation_idx" ON "builder_change_set" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "builder_change_set_artifact_idx" ON "builder_change_set" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "builder_conversation_artifact_idx" ON "builder_conversation" USING btree ("artifact_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "builder_message_conversation_seq_idx" ON "builder_message" USING btree ("conversation_id","seq");