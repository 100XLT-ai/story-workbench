ALTER TABLE "stories" ADD COLUMN "score_attribution" double precision GENERATED ALWAYS AS ((score_components ->> 'attribution')::double precision) STORED;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "score_evidence_completeness" double precision GENERATED ALWAYS AS ((score_components ->> 'evidenceCompleteness')::double precision) STORED;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "score_beneficiary_interest" double precision GENERATED ALWAYS AS ((score_components ->> 'beneficiaryInterest')::double precision) STORED;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "score_amount" double precision GENERATED ALWAYS AS ((score_components ->> 'amount')::double precision) STORED;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "score_recency" double precision GENERATED ALWAYS AS ((score_components ->> 'recency')::double precision) STORED;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "score_attendance" double precision GENERATED ALWAYS AS ((score_components ->> 'attendance')::double precision) STORED;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "text_page_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Recompute text_page_count without a re-import. The page set is the import's (harness loadStory):
-- the linked pages, else the source page. Like loadStory, it does not drop deleted pages.
-- "Text" means the scraped markdown has a character that is not white space (the import's /\S/ test).
UPDATE "stories" s SET "text_page_count" = COALESCE(
  CASE
    WHEN EXISTS (SELECT 1 FROM "story_pages" sp JOIN "pages" p ON p."id" = sp."page_extract_id" WHERE sp."candidate_id" = s."id")
      THEN (SELECT count(*) FROM "story_pages" sp JOIN "pages" p ON p."id" = sp."page_extract_id"
             WHERE sp."candidate_id" = s."id" AND p."scraped_markdown" ~ '\S')
    ELSE (SELECT count(*) FROM "pages" p WHERE p."id" = s."source_page_extract_id" AND p."scraped_markdown" ~ '\S')
  END, 0);--> statement-breakpoint
-- runnable_v3 (DECISIONS D42): the v3 writer reads only the fact ledger (claims and quotes), never the raw page text,
-- so a story is runnable when its own ledger is not empty. The ledger counts are the import's buildFactLedger counts.
UPDATE "stories" SET "runnable_v3" = ("fact_count" + "impact_count" + "quote_count") > 0;
