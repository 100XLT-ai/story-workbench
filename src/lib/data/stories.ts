import { and, asc, desc, eq, getTableColumns, gt, gte, ilike, inArray, isNotNull, isNull, lt, lte, ne, or, sql as dsql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { parseFilter } from "../engine/filter";
import type { FilterClause } from "../engine/types";

export type FieldType = "number" | "text" | "boolean" | "date";

export interface StoryField {
  name: string;
  label: string;
  type: FieldType;
  group: "story" | "ranking" | "sponsor" | "evidence" | "runnable";
  description: string;
  column: PgColumn;
}

const c = schema.stories;

/** Every filterable and sortable story column, by its API name (§2.3, §2.4). */
export const STORY_FIELDS: StoryField[] = [
  { name: "id", label: "Story id", type: "number", group: "story", description: "The candidate id in longtale_dv2.", column: c.id },
  { name: "job_id", label: "Job", type: "number", group: "story", description: "The discovery job id.", column: c.jobId },
  { name: "story_headline", label: "Headline", type: "text", group: "story", description: "Discovery's story headline (top 5 of each job).", column: c.storyHeadline },
  { name: "story_angle", label: "Angle", type: "text", group: "story", description: "Discovery's story angle. No seed reads it.", column: c.storyAngle },
  { name: "description", label: "Description", type: "text", group: "story", description: "The candidate description.", column: c.description },
  { name: "beneficiary", label: "Beneficiary", type: "text", group: "story", description: "Who the cause helps.", column: c.beneficiary },
  { name: "idea_title", label: "Idea title", type: "text", group: "story", description: "The ranked idea title (production's Story.title).", column: c.ideaTitle },
  { name: "signal_type", label: "Signal type", type: "text", group: "story", description: "The kind of signal discovery found.", column: c.signalType },
  { name: "impact_type_primary", label: "Impact type", type: "text", group: "story", description: "The main impact type.", column: c.impactTypePrimary },
  { name: "impact_value_raw", label: "Impact value", type: "number", group: "story", description: "The impact number. Empty means production runs the statistics call.", column: c.impactValueRaw },
  { name: "rank", label: "Rank", type: "number", group: "ranking", description: "1 = the job's top ranked story.", column: c.rank },
  { name: "winner", label: "Winner", type: "boolean", group: "ranking", description: "The job's chosen story (25 jobs have none).", column: c.winner },
  { name: "weighted_score", label: "Weighted score", type: "number", group: "ranking", description: "The score the rank sorts by.", column: c.weightedScore },
  { name: "total", label: "Total", type: "number", group: "ranking", description: "The raw total score.", column: c.total },
  { name: "tier_impact", label: "Tier: impact", type: "number", group: "ranking", description: "Ranking tier for impact.", column: c.tierImpact },
  { name: "tier_recency", label: "Tier: recency", type: "number", group: "ranking", description: "Ranking tier for recency.", column: c.tierRecency },
  { name: "tier_reach", label: "Tier: reach", type: "number", group: "ranking", description: "Ranking tier for reach.", column: c.tierReach },
  { name: "tier_evidence", label: "Tier: evidence", type: "number", group: "ranking", description: "Ranking tier for evidence.", column: c.tierEvidence },
  { name: "tier_attribution", label: "Tier: attribution", type: "number", group: "ranking", description: "Ranking tier for attribution.", column: c.tierAttribution },
  { name: "tier_market", label: "Tier: market", type: "number", group: "ranking", description: "Ranking tier for market fit.", column: c.tierMarket },
  { name: "tier_image", label: "Tier: image", type: "number", group: "ranking", description: "Ranking tier for images.", column: c.tierImage },
  { name: "deal_grade", label: "Deal grade", type: "text", group: "ranking", description: "Discovery's deal grade.", column: c.dealGrade },
  { name: "confidence", label: "Confidence", type: "text", group: "ranking", description: "Discovery's confidence.", column: c.confidence },
  { name: "tiebreak_reasoning", label: "Tiebreak reasoning", type: "text", group: "ranking", description: "Why the tiebreak chose the winner.", column: c.tiebreakReasoning },
  { name: "sponsor_name", label: "Sponsor", type: "text", group: "sponsor", description: "The organization name of the job.", column: c.sponsorName },
  { name: "publisher_name", label: "Publisher", type: "text", group: "sponsor", description: "The masthead (data/mastheads.json).", column: c.publisherName },
  { name: "market_name", label: "Market", type: "text", group: "sponsor", description: "The market name in the database.", column: c.marketName },
  { name: "domain", label: "Domain", type: "text", group: "sponsor", description: "The sponsor's web domain.", column: c.domain },
  { name: "run_date", label: "Run date", type: "date", group: "sponsor", description: "When discovery ran (the default generation date).", column: c.runDate },
  { name: "page_count", label: "Pages", type: "number", group: "evidence", description: "The story's pages (linked pages, else the source page).", column: c.pageCount },
  { name: "fact_count", label: "Facts", type: "number", group: "evidence", description: "Fact claims in the ledger, after de-duplication.", column: c.factCount },
  { name: "quote_count", label: "Quotes", type: "number", group: "evidence", description: "Quotes in the ledger, after de-duplication.", column: c.quoteCount },
  { name: "impact_count", label: "Impacts", type: "number", group: "evidence", description: "Impact claims in the ledger.", column: c.impactCount },
  { name: "usable_image_count", label: "Usable images", type: "number", group: "evidence", description: "The story's images marked usable.", column: c.usableImageCount },
  { name: "newest_page_date", label: "Newest page", type: "text", group: "evidence", description: "The newest page date (YYYY-MM-DD).", column: c.newestPageDate },
  { name: "oldest_page_date", label: "Oldest page", type: "text", group: "evidence", description: "The oldest page date (YYYY-MM-DD).", column: c.oldestPageDate },
  { name: "extractor_versions", label: "Extractor versions", type: "text", group: "evidence", description: "The page extractor versions.", column: c.extractorVersions },
  { name: "has_angle", label: "Has angle", type: "boolean", group: "evidence", description: "Discovery wrote an angle.", column: c.hasAngle },
  { name: "runnable_production", label: "Runnable by Production", type: "boolean", group: "runnable", description: "Has a description and a sponsor name, which the production payload needs.", column: c.runnableProduction },
  { name: "runnable_v3", label: "Runnable by v3", type: "boolean", group: "runnable", description: "Has at least one page (linked or source page), which the v3 ledger needs.", column: c.runnableV3 },
];

export const FIELD_BY_NAME = new Map(STORY_FIELDS.map((f) => [f.name, f]));

export class FilterError extends Error {}

function clauseSql(cl: FilterClause): SQL {
  const f = FIELD_BY_NAME.get(cl.field);
  if (!f) throw new FilterError(`Unknown field "${cl.field}". See /api/stories/fields or list_story_fields.`);
  const col = f.column;
  const conv = (v: unknown): unknown => {
    if (f.type === "number") {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isNaN(n)) throw new FilterError(`"${cl.field}" needs a number, not ${JSON.stringify(v)}.`);
      return n;
    }
    if (f.type === "boolean") return v === true || v === "true" || v === 1 || v === "yes";
    return String(v);
  };
  switch (cl.op) {
    case "eq":
      return eq(col, conv(cl.value));
    case "ne":
      return or(ne(col, conv(cl.value)), isNull(col)) as SQL;
    case "lt":
      return lt(col, conv(cl.value));
    case "lte":
      return lte(col, conv(cl.value));
    case "gt":
      return gt(col, conv(cl.value));
    case "gte":
      return gte(col, conv(cl.value));
    case "in": {
      const list = Array.isArray(cl.value) ? cl.value.map(conv) : [];
      if (!list.length) return dsql`false`;
      return inArray(col, list);
    }
    case "contains":
      return f.type === "text" ? ilike(col, `%${String(cl.value ?? "").replace(/[%_\\]/g, "\\$&")}%`) : dsql`${col}::text ilike ${`%${String(cl.value ?? "")}%`}`;
    case "is_null":
      return f.type === "text" ? (or(isNull(col), eq(col, "")) as SQL) : isNull(col);
    case "not_null":
      return f.type === "text" ? (and(isNotNull(col), ne(col, "")) as SQL) : isNotNull(col);
  }
}

export function whereFor(filter: FilterClause[]): SQL | undefined {
  if (!filter.length) return undefined;
  return and(...filter.map(clauseSql));
}

const { raw: _raw, scoreComponents: _sc, ...listColumns } = getTableColumns(schema.stories);

export interface StoryQuery {
  filter?: unknown;
  sort?: string;
  dir?: "asc" | "desc";
  limit?: number;
  offset?: number;
  ids?: number[];
}

export async function queryStories(q: StoryQuery) {
  const filter = parseFilter(q.filter);
  let where = whereFor(filter);
  if (q.ids?.length) where = and(where, inArray(c.id, q.ids));
  const sortField = q.sort ? FIELD_BY_NAME.get(q.sort) : FIELD_BY_NAME.get("id");
  if (q.sort && !sortField) throw new FilterError(`Unknown sort field "${q.sort}".`);
  const order = q.dir === "desc" ? desc(sortField!.column) : asc(sortField!.column);
  const limit = Math.max(1, Math.min(q.limit ?? 50, 1000));
  const offset = Math.max(0, q.offset ?? 0);
  const [rows, [{ total }]] = await Promise.all([
    db()
      .select(listColumns)
      .from(c)
      .where(where)
      .orderBy(dsql`${order} nulls last`, asc(c.id))
      .limit(limit)
      .offset(offset),
    db().select({ total: dsql<number>`count(*)::int` }).from(c).where(where),
  ]);
  return { total, limit, offset, filter, rows };
}

export async function storyIdsFor(filter: unknown, max = 500): Promise<number[]> {
  const where = whereFor(parseFilter(filter));
  const rows = await db().select({ id: c.id }).from(c).where(where).orderBy(asc(c.id)).limit(max + 1);
  return rows.map((r) => r.id);
}

export function fieldList() {
  return STORY_FIELDS.map(({ column: _c, ...rest }) => rest);
}
