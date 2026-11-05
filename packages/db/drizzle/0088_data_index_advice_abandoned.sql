CREATE TABLE "artifact_database_index_advice" (
	"id" text PRIMARY KEY NOT NULL,
	"database_id" text NOT NULL,
	"table_name" text NOT NULL,
	"column_name" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"queries" integer DEFAULT 0 NOT NULL,
	"avg_rows_read" integer DEFAULT 0 NOT NULL,
	"avg_rows_returned" integer DEFAULT 0 NOT NULL,
	"rows_written" bigint DEFAULT 0 NOT NULL,
	"dismissed_queries" integer,
	"dismissed_avg_rows_read" integer,
	"dismissed_rows_written" bigint,
	"dismissed_at" timestamp,
	"dismissed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifact_database_query_stat" (
	"database_id" text NOT NULL,
	"table_name" text NOT NULL,
	"column_name" text NOT NULL,
	"day" timestamp NOT NULL,
	"queries" integer DEFAULT 0 NOT NULL,
	"rows_read" bigint DEFAULT 0 NOT NULL,
	"rows_returned" bigint DEFAULT 0 NOT NULL,
	"writes" integer DEFAULT 0 NOT NULL,
	"rows_written" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "artifact_database_query_stat_database_id_table_name_column_name_day_pk" PRIMARY KEY("database_id","table_name","column_name","day")
);
--> statement-breakpoint
ALTER TABLE "artifact_database" ADD COLUMN "delete_listed_at" timestamp;--> statement-breakpoint
ALTER TABLE "artifact_database_index_advice" ADD CONSTRAINT "artifact_database_index_advice_database_id_artifact_database_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."artifact_database"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_database_query_stat" ADD CONSTRAINT "artifact_database_query_stat_database_id_artifact_database_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."artifact_database"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_database_index_advice_column_kind_idx" ON "artifact_database_index_advice" USING btree ("database_id","table_name","column_name","kind");--> statement-breakpoint
CREATE INDEX "artifact_database_query_stat_day_idx" ON "artifact_database_query_stat" USING btree ("day");