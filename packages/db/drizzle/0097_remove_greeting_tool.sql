-- The Greeting demo tool left the catalog. Its switches would still count
-- toward a plan's tool limit with no card left to turn them off.
DELETE FROM "artifact_tool" WHERE "tool_key" = 'greeting';
