-- Moves the shipped tool catalog out of the database and into code.
--
-- `tool_group` and `tool_definition` held static reference data that only ever
-- meant something in combination with a handler in apps/mcp's `toolRegistry`. A
-- row whose key had no handler did not error — the boot loop skipped it and the
-- tool quietly stopped appearing on the customer's MCP server. The rows also had
-- to be seeded per environment by hand, so a definition could exist on dev and
-- not on production, which is exactly what had happened to `custom-code`.
--
-- Every consumer of the `artifact_tool -> tool_definition` join did one thing
-- with it: resolve the id back into `tool_definition.key`. So the join becomes
-- the key itself, and the catalog now ships as TOOL_CATALOG in @ganju/utils,
-- generated from precisely the rows this migration drops.
--
-- `mcp_server_catalog` is deliberately untouched: its rows point at a remote
-- server whose tools are discovered at configure time, so there is no handler in
-- our code to keep them in step with.
ALTER TABLE "artifact_tool" ADD COLUMN "tool_key" text;--> statement-breakpoint

UPDATE "artifact_tool" AS t
  SET "tool_key" = d."key"
  FROM "tool_definition" AS d
  WHERE d."id" = t."tool_definition_id";--> statement-breakpoint

-- The FK made every row resolvable, so nothing should be left null. Fail loudly
-- rather than let SET NOT NULL report it as an anonymous constraint violation.
DO $$
DECLARE orphaned int;
BEGIN
  SELECT count(*) INTO orphaned FROM "artifact_tool" WHERE "tool_key" IS NULL;
  IF orphaned > 0 THEN
    RAISE EXCEPTION 'tool_key backfill left % artifact_tool row(s) unresolved', orphaned;
  END IF;
END $$;--> statement-breakpoint

ALTER TABLE "artifact_tool" ALTER COLUMN "tool_key" SET NOT NULL;--> statement-breakpoint

-- Drops the foreign key along with it.
ALTER TABLE "artifact_tool" DROP COLUMN "tool_definition_id";--> statement-breakpoint

DROP TABLE "tool_definition" CASCADE;--> statement-breakpoint
DROP TABLE "tool_group" CASCADE;
