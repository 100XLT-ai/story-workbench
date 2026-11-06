import {
  bigint,
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const id = (name: string) => bigint(name, { mode: "number" });

// ---------------------------------------------------------------------------
// Snapshot tables: a fixed copy of longtale_dv2. The import script replaces
// them whole. They keep the source IDs.
// ---------------------------------------------------------------------------

export const jobs = pgTable("jobs", {
  id: id("id").primaryKey(),
  domain: text("domain"),
  url: text("url"),
  organizationId: id("organization_id"),
  sponsorName: text("sponsor_name"),
  marketId: id("market_id"),
  marketName: text("market_name"),
  publisherName: text("publisher_name"),
  runDate: timestamp("run_date", { mode: "string" }),
  status: text("status"),
});

export const organizations = pgTable("organizations", {
  id: id("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  orgType: text("org_type"),
  industry: text("industry"),
  businessType: text("business_type"),
  website: text("website"),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  businessAddress: text("business_address"),
  /** The brand profile row (organization_brand_profiles), or null. */
  brand: jsonb("brand"),
});

export const stories = pgTable(
  "stories",
  {
    id: id("id").primaryKey(),
    jobId: id("job_id").notNull(),
    rank: integer("rank"),
    winner: boolean("winner").notNull(),
    weightedScore: doublePrecision("weighted_score"),
    total: doublePrecision("total"),
    tierImpact: integer("tier_impact"),
    tierRecency: integer("tier_recency"),
    tierReach: integer("tier_reach"),
    tierEvidence: integer("tier_evidence"),
    tierAttribution: integer("tier_attribution"),
    tierMarket: integer("tier_market"),
    tierImage: integer("tier_image"),
    tiebreakReasoning: text("tiebreak_reasoning"),
    dealGrade: text("deal_grade"),
    confidence: text("confidence"),
    scoreComponents: jsonb("score_components"),
    // why: the score parts are generated from score_components, so the field registry can sort and filter them like any column.
    scoreAttribution: doublePrecision("score_attribution").generatedAlwaysAs(sql`(score_components ->> 'attribution')::double precision`),
    scoreEvidenceCompleteness: doublePrecision("score_evidence_completeness").generatedAlwaysAs(sql`(score_components ->> 'evidenceCompleteness')::double precision`),
    scoreBeneficiaryInterest: doublePrecision("score_beneficiary_interest").generatedAlwaysAs(sql`(score_components ->> 'beneficiaryInterest')::double precision`),
    scoreAmount: doublePrecision("score_amount").generatedAlwaysAs(sql`(score_components ->> 'amount')::double precision`),
    scoreRecency: doublePrecision("score_recency").generatedAlwaysAs(sql`(score_components ->> 'recency')::double precision`),
    scoreAttendance: doublePrecision("score_attendance").generatedAlwaysAs(sql`(score_components ->> 'attendance')::double precision`),
    /** The ranking system that ordered the job (raw.weighted_version), or "untagged" (DECISIONS D46). */
    rankingSystem: text("ranking_system").notNull().generatedAlwaysAs(sql`coalesce(raw ->> 'weighted_version', 'untagged')`),
    storyHeadline: text("story_headline"),
    storyAngle: text("story_angle"),
    description: text("description"),
    beneficiary: text("beneficiary"),
    evidenceQuote: text("evidence_quote"),
    impactTypePrimary: text("impact_type_primary"),
    impactValueRaw: doublePrecision("impact_value_raw"),
    impactValueUnit: text("impact_value_unit"),
    signalType: text("signal_type"),
    sourcePageExtractId: id("source_page_extract_id"),
    ideaTitle: text("idea_title"),
    ideaDescription: text("idea_description"),
    raw: jsonb("raw").notNull(),
    // derived (§2.4)
    domain: text("domain"),
    sponsorName: text("sponsor_name"),
    publisherName: text("publisher_name"),
    marketName: text("market_name"),
    runDate: timestamp("run_date", { mode: "string" }),
    pageCount: integer("page_count").notNull(),
    /** Pages of the story (the same page set as page_count) whose scraped text is not empty. */
    textPageCount: integer("text_page_count").notNull().default(0),
    factCount: integer("fact_count").notNull(),
    quoteCount: integer("quote_count").notNull(),
    impactCount: integer("impact_count").notNull(),
    usableImageCount: integer("usable_image_count").notNull(),
    newestPageDate: text("newest_page_date"),
    oldestPageDate: text("oldest_page_date"),
    extractorVersions: text("extractor_versions"),
    hasAngle: boolean("has_angle").notNull(),
    runnableProduction: boolean("runnable_production").notNull(),
    runnableV3: boolean("runnable_v3").notNull(),
  },
  (t) => [index("stories_job_idx").on(t.jobId)],
);

export const pages = pgTable(
  "pages",
  {
    id: id("id").primaryKey(),
    jobId: id("job_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    title: text("title"),
    pageType: text("page_type"),
    publishedDate: text("published_date"),
    textPublishedDate: text("text_published_date"),
    extractorVersion: text("extractor_version"),
    summary: text("summary"),
    facts: jsonb("facts"),
    quotes: jsonb("quotes"),
    causeSignal: jsonb("cause_signal"),
    scrapedMarkdown: text("scraped_markdown"),
    deleted: boolean("deleted").notNull(),
  },
  (t) => [index("pages_job_idx").on(t.jobId)],
);

export const storyPages = pgTable(
  "story_pages",
  {
    candidateId: id("candidate_id").notNull(),
    pageExtractId: id("page_extract_id").notNull(),
    role: text("role"),
    linkId: id("link_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.linkId] }),
    index("story_pages_candidate_idx").on(t.candidateId),
  ],
);

export const images = pgTable("images", {
  id: id("id").primaryKey(),
  pageExtractId: id("page_extract_id"),
  jobId: id("job_id"),
  url: text("url").notNull(),
  usable: boolean("usable"),
  confidence: doublePrecision("confidence"),
  classification: jsonb("classification"),
  classifierVersion: text("classifier_version"),
});

export const storyImages = pgTable(
  "story_images",
  {
    candidateId: id("candidate_id").notNull(),
    imageId: id("image_id").notNull(),
    rank: integer("rank"),
    linkId: id("link_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.linkId] }),
    index("story_images_candidate_idx").on(t.candidateId),
  ],
);

// ---------------------------------------------------------------------------
// App tables: never touched by the import.
// ---------------------------------------------------------------------------

export const families = pgTable("families", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

export const versions = pgTable(
  "versions",
  {
    id: serial("id").primaryKey(),
    familyId: integer("family_id").notNull(),
    major: integer("major").notNull(),
    minor: integer("minor").notNull(),
    author: text("author").notNull(),
    parentId: integer("parent_id"),
    note: text("note"),
    definition: jsonb("definition").notNull(),
    createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  },
  (t) => [index("versions_family_idx").on(t.familyId)],
);

export const runs = pgTable("runs", {
  id: serial("id").primaryKey(),
  versionId: integer("version_id").notNull(),
  author: text("author").notNull(),
  status: text("status").notNull(),
  storyCount: integer("story_count").notNull(),
  overrides: jsonb("overrides"),
  estimatedCost: doublePrecision("estimated_cost"),
  concurrency: integer("concurrency").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { mode: "string" }),
});

export const runStories = pgTable(
  "run_stories",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull(),
    storyId: id("story_id").notNull(),
    position: integer("position").notNull(),
    status: text("status").notNull(),
    cursor: integer("cursor").notNull().default(0),
    /** Context values the steps wrote (never the story inputs). gzip JSON. */
    state: bytea("state"),
    error: text("error"),
    failedStep: text("failed_step"),
    cost: doublePrecision("cost").notNull().default(0),
    summary: jsonb("summary"),
    workflowRunId: text("workflow_run_id"),
    startedAt: timestamp("started_at", { mode: "string" }),
    finishedAt: timestamp("finished_at", { mode: "string" }),
  },
  (t) => [index("run_stories_run_idx").on(t.runId)],
);

export const traces = pgTable(
  "traces",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull(),
    runStoryId: integer("run_story_id").notNull(),
    storyId: id("story_id").notNull(),
    stepIndex: integer("step_index").notNull(),
    stepId: text("step_id").notNull(),
    stepName: text("step_name").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    reason: text("reason"),
    model: text("model"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    tokensReasoning: integer("tokens_reasoning"),
    cost: doublePrecision("cost"),
    error: text("error"),
    /** gzip JSON: messages, request, raw response, input and output values. */
    body: bytea("body"),
    startedAt: timestamp("started_at", { mode: "string" }),
    endedAt: timestamp("ended_at", { mode: "string" }),
  },
  (t) => [index("traces_run_story_idx").on(t.runStoryId)],
);

export const savedFilters = pgTable("saved_filters", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  author: text("author").notNull(),
  filter: jsonb("filter").notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

/** Key-value settings; every change is a new row, so history stays. */
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  value: jsonb("value").notNull(),
  author: text("author").notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});
