// The small tier, grade and point functions of longtale-core's ranking systems, copied
// verbatim (bodies unchanged; imports and types inlined). Do not edit: re-copy (DECISIONS D48).
// Sources (apps/api/src/api/modules/discovery/ranking/):
//   weighted-grade@v1: weighted-score.ts and deal-grade.ts at 162c7559^ (removed from main on 2026-11-01)
//   weighted-grade@v2: weighted-score-v2.ts at origin/main 20e943e7
//   simple-score@v1:   simple-score.ts at origin/main 20e943e7

export type DealGrade = "A" | "B" | "C" | "D";
export type Confidence = "high" | "medium" | "verify";
export type BeneficiarySpecificity = "named" | "generic" | "descriptive" | "unknown" | string | null;

// ---------------------------------------------------------------- weighted-grade@v1 (weighted-score.ts, deal-grade.ts at 162c7559^)

/** tier (1..5) → Fibonacci magnitude. */
export const TIER_VALUES = [1, 2, 3, 5, 8] as const;
export function tierToFib(tier: number): number {
  const idx = Math.max(1, Math.min(5, Math.round(tier))) - 1;
  return TIER_VALUES[idx];
}

/** Reach is a stub until ProPublica/Wikipedia lookup ships (FRD Plan B). */
export const REACH_STUB = 3;

export const WEIGHT_CONFIG = {
  impact: 30,
  recency: 20,
  reach: 10,
  evidence: 15,
  attribution: 15,
  image: 10,
  nudge: { named: 0.25, generic: -0.15 },
} as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Recency tier from the signal date. null/undefined → 3 (neutral). */
export function computeRecencyTier(signalDate: Date | null | undefined, now: Date = new Date()): number {
  if (!signalDate) return 3;
  const days = Math.max(0, (now.getTime() - signalDate.getTime()) / MS_PER_DAY);
  if (days < 90) return 5; // < 3 months
  if (days < 180) return 4; // 3–6 months
  if (days < 365) return 3; // 6–12 months
  if (days < 730) return 2; // 12–24 months
  return 1; // 24+ months
}

/**
 * Attribution tier from the legacy attribution raw (25 on-domain / 12 brand-stem
 * / 0) crossed with corroboration (≥1 other source page sharing the beneficiary).
 */
export function computeAttributionTier(attributionRaw: number, corroborationCount: number): number {
  const corr = corroborationCount >= 1;
  if (attributionRaw >= 25) return corr ? 5 : 4;
  if (attributionRaw >= 12) return corr ? 3 : 2;
  return 1;
}

/** Named beneficiary → +0.25, generic → −0.15, else 0. */
export function specificityNudge(spec: BeneficiarySpecificity): number {
  if (spec === "named") return WEIGHT_CONFIG.nudge.named;
  if (spec === "generic") return WEIGHT_CONFIG.nudge.generic;
  return 0;
}

/** Quintile-by-rank tier. A cohort whose values are all equal collapses to tier 5. */
export function quintileTier(value: number, cohortValues: number[]): number {
  const n = cohortValues.length;
  if (n <= 1) return 5;
  const sorted = [...cohortValues].sort((a, b) => b - a);
  if (sorted[0] === sorted[n - 1]) return 5; // uniform cohort
  // Index of the first cohort value <= this value (rank among >= values).
  const rank = sorted.findIndex((v) => v <= value);
  const i = rank < 0 ? n - 1 : rank;
  return Math.max(1, Math.min(5, 5 - Math.floor((5 * i) / n)));
}

/** Deal-grade boundaries on weighted_score (Plan-A). */
export const DEAL_GRADE_BOUNDS = { A: 6.6, B: 5.55, C: 4.5 } as const;

/** A≥6.6, B≥5.55, C≥4.5, else D. Null when weighted_score is null. */
export function computeDealGrade(weightedScore: number | null | undefined): DealGrade | null {
  if (weightedScore === null || weightedScore === undefined) return null;
  if (weightedScore >= DEAL_GRADE_BOUNDS.A) return "A";
  if (weightedScore >= DEAL_GRADE_BOUNDS.B) return "B";
  if (weightedScore >= DEAL_GRADE_BOUNDS.C) return "C";
  return "D";
}

/** Winner confidence from the legacy attribution raw: ≥25 high; 12–24 medium; otherwise verify. */
export function computeConfidence(attributionRaw: number): Confidence {
  if (attributionRaw >= 25) return "high";
  if (attributionRaw >= 12) return "medium";
  return "verify";
}

// ---------------------------------------------------------------- weighted-grade@v2 (weighted-score-v2.ts)

/** The approved weights of SPEC §9.4 (R23); they sum to 100. */
export const WEIGHT_CONFIG_V2 = {
  impact: 25,
  recency: 20,
  market: 15,
  evidence: 15,
  attribution: 10,
  image: 15,
} as const;

export const DEAL_GRADE_BOUNDS_V2 = { A: 5.5, B: 4.1, C: 2.75 } as const;

const UNKNOWN = 3;

export type ValueUnit = "usd" | "people" | "hours";

export const UNIT_BANDS: Record<ValueUnit, number[]> = {
  usd: [500, 5_000, 25_000, 100_000],
  people: [25, 100, 500, 2_000],
  hours: [20, 100, 500, 2_000],
};

export function unitOf(unit: string | null): ValueUnit | null {
  const u = (unit ?? "").toLowerCase();
  if (["usd", "$", "dollars", "dollar"].includes(u)) return "usd";
  if (["hours", "hour", "hrs", "volunteer_hours"].includes(u)) return "hours";
  if (["count", "people", "attendees", "persons", "participants", "served"].includes(u)) {
    return "people";
  }
  return null;
}

/** The impact tier of one value (SPEC §9.3.1); no value or no known unit gives 3. */
export function impactValueTier(value: number | null, unit: string | null): number {
  const u = unitOf(unit);
  if (value === null || !Number.isFinite(value) || !u) return UNKNOWN;
  const bands = UNIT_BANDS[u];
  return 1 + bands.filter((b) => value >= b).length;
}

/** The recency tier (SPEC §9.3.2): an event up to 90 days ahead gives 5, no date gives 3. */
export function recencyTierV2(date: string | null, now: Date): number {
  if (!date) return UNKNOWN;
  const days = (now.getTime() - Date.parse(`${date}T00:00:00.000Z`)) / MS_PER_DAY;
  if (days < 90) return 5;
  if (days < 180) return 4;
  if (days < 365) return 3;
  if (days < 730) return 2;
  return 1;
}

const GRADE_RANK: Record<DealGrade, number> = { A: 4, B: 3, C: 2, D: 1 };
export const gradeRank = (g: DealGrade): number => GRADE_RANK[g];

/** The market points (R36): in market 5, near market or no place 3, another state 0. */
export function marketPoints(tierMarket: number): number {
  if (tierMarket >= 4) return 5;
  return tierMarket >= 2 ? 3 : 0;
}

/** The v2 deal grade; R36 caps a story outside the service area at C. */
export function computeDealGradeV2(score: number, tierMarket: number): DealGrade {
  let grade: DealGrade = "D";
  if (score >= DEAL_GRADE_BOUNDS_V2.A) grade = "A";
  else if (score >= DEAL_GRADE_BOUNDS_V2.B) grade = "B";
  else if (score >= DEAL_GRADE_BOUNDS_V2.C) grade = "C";
  return gradeRank(grade) > GRADE_RANK.C && tierMarket < 4 ? "C" : grade;
}

/** Winner confidence from the attribution tier (SPEC §9.3.5). */
export function confidenceFromTier(tierAttribution: number): Confidence {
  if (tierAttribution >= 4) return "high";
  if (tierAttribution === 3) return "medium";
  return "verify";
}

// ---------------------------------------------------------------- simple-score@v1 (simple-score.ts)

export function recencyPoints(ageDays: number | null): number {
  if (ageDays === null) return 5;
  if (ageDays < 183) return 30;
  if (ageDays < 365) return 22;
  return ageDays < 730 ? 10 : 0;
}

/** impactPoints over plain (value, unit) pairs; the body is simple-score.ts impactPoints with the loop source changed. */
export function impactPoints(impacts: { impactValueRaw: number | null; impactValueUnit: string | null }[]): number {
  let stated = false;
  let large = false;
  for (const impact of impacts) {
    const u = unitOf(impact.impactValueUnit);
    const v = impact.impactValueRaw;
    if (v === null || !Number.isFinite(v) || (u !== "usd" && u !== "people")) continue;
    stated = true;
    if ((u === "usd" && v >= 25_000) || (u === "people" && v >= 500)) large = true;
  }
  return (stated ? 10 : 0) + (large ? 5 : 0);
}

/** The grade of R39 and R40: points, age and place. */
export function simpleGrade(points: number, ageDays: number | null, tierMarket: number, namesPlace = true): DealGrade {
  if (!namesPlace) return points >= 35 ? "C" : "D";
  if (points >= 75 && ageDays !== null && ageDays < 365 && tierMarket >= 4) return "A";
  if (points >= 55 && ageDays !== null && ageDays < 730) return "B";
  return points >= 35 ? "C" : "D";
}
