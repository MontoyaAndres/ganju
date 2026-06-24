ALTER TABLE "channel" DROP CONSTRAINT "channel_llm_id_organization_llm_id_fk";
--> statement-breakpoint
ALTER TABLE "channel" ADD CONSTRAINT "channel_llm_id_organization_llm_id_fk" FOREIGN KEY ("llm_id") REFERENCES "public"."organization_llm"("id") ON DELETE cascade ON UPDATE no action;