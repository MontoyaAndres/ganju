-- Step 1 of the oidc-provider → @better-auth/oauth-provider migration.
--
-- Stage the rows that survive the move, then drop the old tables. `CREATE TABLE
-- AS` is deliberate: it copies rows without indexes or constraints, so nothing
-- here holds on to a name the new tables need. (Renaming the tables aside
-- instead does not work — a renamed table keeps its index and `_pkey` names,
-- which then collide when 0060 recreates `oauth_consent`.) 0060 backfills from
-- these and drops them, so no `_backfill` table outlives that migration.
--
-- `oauth_access_token` is not staged. The new plugin stores token values
-- hashed, splits refresh tokens into their own table, and links both to the
-- session they were issued under — none of which can be reconstructed from rows
-- that predate those columns. Live tokens die here, so connected clients re-run
-- the authorize flow once. Carrying the client row over is what keeps that a
-- re-consent rather than a re-registration under a new client_id.
CREATE TABLE "oauth_client_backfill" AS SELECT * FROM "oauth_application";--> statement-breakpoint
CREATE TABLE "oauth_consent_backfill" AS SELECT * FROM "oauth_consent" WHERE "consent_given" = true;--> statement-breakpoint
DROP TABLE "oauth_access_token" CASCADE;--> statement-breakpoint
DROP TABLE "oauth_consent" CASCADE;--> statement-breakpoint
DROP TABLE "oauth_application" CASCADE;
