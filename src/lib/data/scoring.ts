import { inArray, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { explainStory, jobContext, type JobContext, type ScoringRow, type StoryScoring } from "../scoring/explain";

const c = schema.stories;

const ROW = {
  id: c.id,
  jobId: c.jobId,
  rank: c.rank,
  winner: c.winner,
  rankingSystem: c.rankingSystem,
  weightedScore: c.weightedScore,
  total: c.total,
  tierImpact: c.tierImpact,
  tierRecency: c.tierRecency,
  tierReach: c.tierReach,
  tierEvidence: c.tierEvidence,
  tierAttribution: c.tierAttribution,
  tierMarket: c.tierMarket,
  tierImage: c.tierImage,
  dealGrade: c.dealGrade,
  confidence: c.confidence,
  scoreComponents: c.scoreComponents,
  description: c.description,
  beneficiary: c.beneficiary,
  evidenceQuote: c.evidenceQuote,
  impactTypePrimary: c.impactTypePrimary,
  impactValueRaw: c.impactValueRaw,
  impactValueUnit: c.impactValueUnit,
  domain: c.domain,
  // Only the raw keys the explainer reads (raw is large).
  raw: dsql<ScoringRow["raw"]>`jsonb_build_object(
    'amount', ${c.raw}->'amount', 'attendees', ${c.raw}->'attendees', 'attribution', ${c.raw}->'attribution',
    'signal_date', ${c.raw}->'signal_date', 'signal_date_source', ${c.raw}->'signal_date_source', 'created_at', ${c.raw}->'created_at',
    'beneficiary_specificity', ${c.raw}->'beneficiary_specificity', 'impact_secondary', ${c.raw}->'impact_secondary',
    'is_future', ${c.raw}->'is_future', 'market_relevance', ${c.raw}->'market_relevance')`,
};

async function contexts(jobIds: number[]): Promise<Map<number, JobContext>> {
  if (!jobIds.length) return new Map();
  const rows = await db()
    .select({ jobId: c.jobId, beneficiary: c.beneficiary, impactTypePrimary: c.impactTypePrimary, impactValueRaw: c.impactValueRaw })
    .from(c)
    .where(inArray(c.jobId, jobIds));
  const byJob = new Map<number, typeof rows>();
  for (const r of rows) byJob.set(r.jobId, [...(byJob.get(r.jobId) ?? []), r]);
  return new Map([...byJob].map(([j, rs]) => [j, jobContext(rs)]));
}

/** Each system's raw inputs next to its scores, for the given stories (Part 2, D48). */
export async function scoringFor(ids: number[]): Promise<Map<number, StoryScoring>> {
  if (!ids.length) return new Map();
  const rows = (await db().select(ROW).from(c).where(inArray(c.id, ids))) as unknown as ScoringRow[];
  const ctx = await contexts([...new Set(rows.map((r) => r.jobId))]);
  return new Map(rows.map((r) => [r.id, explainStory(r, ctx.get(r.jobId) ?? jobContext([]))]));
}

/** Every story's explanation, job by job (for the check script and the summary). */
export async function scoringForJob(jobId: number): Promise<StoryScoring[]> {
  const rows = (await db().select(ROW).from(c).where(inArray(c.jobId, [jobId]))) as unknown as ScoringRow[];
  const ctx = jobContext(rows);
  return rows.map((r) => explainStory(r, ctx));
}
