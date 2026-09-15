CREATE INDEX "artifact_credential_artifact_idx" ON "artifact_credential" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "artifact_prompt_artifact_idx" ON "artifact_prompt" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "artifact_tool_artifact_idx" ON "artifact_tool" USING btree ("artifact_id");