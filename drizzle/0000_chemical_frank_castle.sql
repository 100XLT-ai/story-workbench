CREATE TABLE "families" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "families_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" bigint PRIMARY KEY NOT NULL,
	"page_extract_id" bigint,
	"job_id" bigint,
	"url" text NOT NULL,
	"usable" boolean,
	"confidence" double precision,
	"classification" jsonb,
	"classifier_version" text
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" bigint PRIMARY KEY NOT NULL,
	"domain" text,
	"url" text,
	"organization_id" bigint,
	"sponsor_name" text,
	"market_id" bigint,
	"market_name" text,
	"publisher_name" text,
	"run_date" timestamp,
	"status" text
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"org_type" text,
	"industry" text,
	"business_type" text,
	"website" text,
	"city" text,
	"state" text,
	"country" text,
	"business_address" text,
	"brand" jsonb
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" bigint PRIMARY KEY NOT NULL,
	"job_id" bigint NOT NULL,
	"source_url" text NOT NULL,
	"title" text,
	"page_type" text,
	"published_date" text,
	"text_published_date" text,
	"extractor_version" text,
	"summary" text,
	"facts" jsonb,
	"quotes" jsonb,
	"cause_signal" jsonb,
	"scraped_markdown" text,
	"deleted" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_stories" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"story_id" bigint NOT NULL,
	"position" integer NOT NULL,
	"status" text NOT NULL,
	"cursor" integer DEFAULT 0 NOT NULL,
	"state" "bytea",
	"error" text,
	"failed_step" text,
	"cost" double precision DEFAULT 0 NOT NULL,
	"summary" jsonb,
	"workflow_run_id" text,
	"started_at" timestamp,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_id" integer NOT NULL,
	"author" text NOT NULL,
	"status" text NOT NULL,
	"story_count" integer NOT NULL,
	"overrides" jsonb,
	"estimated_cost" double precision,
	"concurrency" integer NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "saved_filters" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"author" text NOT NULL,
	"filter" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"author" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" bigint PRIMARY KEY NOT NULL,
	"job_id" bigint NOT NULL,
	"rank" integer,
	"winner" boolean NOT NULL,
	"weighted_score" double precision,
	"total" double precision,
	"tier_impact" integer,
	"tier_recency" integer,
	"tier_reach" integer,
	"tier_evidence" integer,
	"tier_attribution" integer,
	"tier_market" integer,
	"tier_image" integer,
	"tiebreak_reasoning" text,
	"deal_grade" text,
	"confidence" text,
	"score_components" jsonb,
	"story_headline" text,
	"story_angle" text,
	"description" text,
	"beneficiary" text,
	"evidence_quote" text,
	"impact_type_primary" text,
	"impact_value_raw" double precision,
	"impact_value_unit" text,
	"signal_type" text,
	"source_page_extract_id" bigint,
	"idea_title" text,
	"idea_description" text,
	"raw" jsonb NOT NULL,
	"domain" text,
	"sponsor_name" text,
	"publisher_name" text,
	"market_name" text,
	"run_date" timestamp,
	"page_count" integer NOT NULL,
	"fact_count" integer NOT NULL,
	"quote_count" integer NOT NULL,
	"impact_count" integer NOT NULL,
	"usable_image_count" integer NOT NULL,
	"newest_page_date" text,
	"oldest_page_date" text,
	"extractor_versions" text,
	"has_angle" boolean NOT NULL,
	"runnable_production" boolean NOT NULL,
	"runnable_v3" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_images" (
	"candidate_id" bigint NOT NULL,
	"image_id" bigint NOT NULL,
	"rank" integer,
	"link_id" bigint NOT NULL,
	CONSTRAINT "story_images_link_id_pk" PRIMARY KEY("link_id")
);
--> statement-breakpoint
CREATE TABLE "story_pages" (
	"candidate_id" bigint NOT NULL,
	"page_extract_id" bigint NOT NULL,
	"role" text,
	"link_id" bigint NOT NULL,
	CONSTRAINT "story_pages_link_id_pk" PRIMARY KEY("link_id")
);
--> statement-breakpoint
CREATE TABLE "traces" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"run_story_id" integer NOT NULL,
	"story_id" bigint NOT NULL,
	"step_index" integer NOT NULL,
	"step_id" text NOT NULL,
	"step_name" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"model" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"tokens_reasoning" integer,
	"cost" double precision,
	"error" text,
	"body" "bytea",
	"started_at" timestamp,
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"family_id" integer NOT NULL,
	"major" integer NOT NULL,
	"minor" integer NOT NULL,
	"author" text NOT NULL,
	"parent_id" integer,
	"note" text,
	"definition" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "pages_job_idx" ON "pages" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "run_stories_run_idx" ON "run_stories" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "stories_job_idx" ON "stories" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "story_images_candidate_idx" ON "story_images" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "story_pages_candidate_idx" ON "story_pages" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "traces_run_story_idx" ON "traces" USING btree ("run_story_id");--> statement-breakpoint
CREATE INDEX "versions_family_idx" ON "versions" USING btree ("family_id");