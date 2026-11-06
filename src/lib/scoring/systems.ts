/**
 * The ranking systems of longtale-core discovery, as the snapshot stores them (DECISIONS D48).
 * Dates and commits are from longtale-core's git history (origin/main and the commits named).
 * Shared by the stories table, the story page, the Scoring guide page and the API.
 */

export type SystemId = "cause-score@v1" | "weighted-grade@v1" | "weighted-grade@v2" | "simple-score@v1";

export interface ScoringSystem {
  id: SystemId;
  title: string;
  created: string;
  commit: string;
  /** Where the code is (or was). */
  code: string;
  ranksOn: string;
  formula: string[];
  dealGrade: string;
  confidence: string;
  /** Which stored columns hold this system's values. */
  columns: string;
  /** The `ranking_system` values whose stories this system ranked. */
  usedBy: string;
}

export const SYSTEMS: ScoringSystem[] = [
  {
    id: "cause-score@v1",
    title: "Cause score",
    created: "2026-05-31",
    commit: "73252f90 (last change d9fb2a8a, 2026-06-03)",
    code: "ranking/cause-score.ts (origin/main)",
    ranksOn: "Every story has it (total and the six parts). It decided rank only in jobs 555 and 556 (2026-06-03), before the weighted grade existed. Later it is only the second sort key of weighted-grade@v1.",
    formula: [
      "amount = log10(USD + 1) × 20 (0 when no USD value). On v2 and simple stories the USD value counts only when the unit is exactly \"usd\".",
      "attendance = log10(people + 1) × 15 (0 when none).",
      "recency = factor ÷ 100 × 25. Factor: no date 0; future 100; under 30 days 100; under 180 days 50; under 365 days 10; else 0. The age is from the signal date to the rank time.",
      "beneficiary interest = min(count ÷ 5, 1) × 20. Count = candidates in the job with the same beneficiary. The v2 and simple pipelines pass an empty map, so it is always 0 there.",
      "evidence completeness = 20 × (quote 0.25 + USD value 0.25 + named beneficiary 0.25, or a common-noun beneficiary 0.125 + signal date 0.25).",
      "attribution: an off-domain source gives 0. On-domain: the source host is the advertiser host or a subdomain 25; the advertiser's brand stem (4+ letters) in the host 12; \"/stem\" or \"-stem\" in the path 12; else 0.",
      "total = the sum of the six parts.",
    ],
    dealGrade: "None.",
    confidence: "None (weighted-grade@v1 reads its attribution part).",
    columns: "total, score_components (score_amount … score_attendance).",
    usedBy: "All stories.",
  },
  {
    id: "weighted-grade@v1",
    title: "Weighted grade v1",
    created: "2026-06-05",
    commit: "9dc7dc3c (score), 6b21378a (deal grade, confidence); removed from main 2026-11-01 (878be743, 162c7559)",
    code: "ranking/weighted-score.ts and deal-grade.ts at 162c7559^",
    ranksOn: "weighted score, then total, then the number of impact types. An LLM picks the winner from the top 5 (rank 1 if it fails).",
    formula: [
      "weighted score = (30·fib(impact) + 20·fib(recency) + 10·fib(reach) + 15·fib(evidence) + 15·fib(attribution) + 10·fib(image)) ÷ 100 + nudge.",
      "fib(tier) = 1, 2, 3, 5, 8 for tiers 1 to 5. Nudge: named beneficiary +0.25, generic −0.15.",
      "impact tier: the quintile of the impact value among the job's candidates of the same impact type.",
      "recency tier: no date 3; under 90 days 5; under 180 days 4; under 365 days 3; under 730 days 2; else 1.",
      "reach tier: always 3 (a stub).",
      "evidence tier: the quintile of (quote + description of 200+ characters + an editorial photo) among the job's candidates.",
      "attribution tier: cause-score attribution 25 → 5 with a second source page for the beneficiary, else 4; 12 → 3 or 2; else 1.",
      "image tier: the quintile of the editorial photo count for the source host (5 for all when no candidate has a photo). Not stored.",
    ],
    dealGrade: "From the weighted score: A ≥ 6.6, B ≥ 5.55, C ≥ 4.5, else D.",
    confidence: "Winner only. From the cause-score attribution part: ≥ 25 high, ≥ 12 medium, else verify.",
    columns: "weighted_score, tier_impact, tier_recency, tier_reach (= 3), tier_evidence, tier_attribution, deal_grade, confidence. tier_image is not stored.",
    usedBy: "\"untagged\" (2,316 of 2,328 stories; jobs from 2026-06-08 to 2026-10-23, before the version column existed) and \"weighted-grade@v1\" (12 stories, one job on 2026-10-27).",
  },
  {
    id: "weighted-grade@v2",
    title: "Weighted grade v2",
    created: "2026-10-25",
    commit: "f644e7e8 (market rules 5c1d44a7 and 43f6e8a7; market points and the C cap 95eb019f, 2026-10-27)",
    code: "ranking/weighted-score-v2.ts (origin/main)",
    ranksOn: "deal grade (from 2026-10-28), then weighted score, then impact types, then the earlier date. The LLM winner is replaced by rank 1 when it has a lower grade.",
    formula: [
      "weighted score = (25·fib(impact) + 20·fib(recency) + 15·M + 15·fib(evidence) + 10·fib(attribution) + 15·fib(image)) ÷ 100 + nudge.",
      "M = market points from 2026-10-28 (tier ≥ 4 → 5; tier 2–3 → 3; tier 1 → 0); before that M = fib(market tier).",
      "impact tier: per value, 1 + the number of bands it reaches; USD 500 / 5k / 25k / 100k; people 25 / 100 / 500 / 2k; hours 20 / 100 / 500 / 2k. No value or unit → 3. The best value, +1 when the story has more than one impact type, at most 5.",
      "recency tier: from the newest impact date; under 90 days (or future) 5; under 180 4; under 365 3; under 730 2; else 1; no date 3.",
      "market tier: from the places the pages name (primary city or county 5; region or another city in the area 4; …).",
      "evidence tier: points for a verbatim quote, a named beneficiary, an event date, a value and a long activity; list pages are capped at 2.",
      "attribution tier: on-site and off-site pages 5; on-site only 4; else 4 or 3 by the about-the-advertiser pages.",
      "image tier: a hero photo 5; 2+ editorial photos 4; one editorial photo or a brand photo 3; else 1.",
    ],
    dealGrade: "From the weighted score: A ≥ 5.5, B ≥ 4.1, C ≥ 2.75, else D. From 2026-10-28, A or B with market tier < 4 becomes C.",
    confidence: "Winner only. From tier_attribution: ≥ 4 high, 3 medium, else verify.",
    columns: "weighted_score, tier_impact, tier_recency, tier_market, tier_evidence, tier_attribution, tier_image, deal_grade, confidence.",
    usedBy: "\"weighted-grade@v2\" (3,920 stories, 41 jobs, 2026-10-24 to 2026-10-28).",
  },
  {
    id: "simple-score@v1",
    title: "Simple score",
    created: "2026-10-27",
    commit: "121ee294 (R40 changes 54a48523, 2026-10-28; winner = rank 1 from 329e114b)",
    code: "ranking/simple-score.ts (origin/main)",
    ranksOn: "grade, then points, then the newer date. From 2026-10-29 the winner is rank 1.",
    formula: [
      "points = recency + local + impact + proof + photo (15 to 100).",
      "recency: age under 183 days 30; under 365 22; under 730 10; else 0; no date 5. The date is the newest event date, else the newest page date.",
      "local: market tier ≥ 4 → 25, else 10.",
      "impact: 10 when a value in USD or people is stated; +5 when USD ≥ 25,000 or people ≥ 500.",
      "proof: 10 when an off-site, non-social page is about the advertiser; +5 when an on-site page is.",
      "photo: a hero photo 15; an editorial photo 8; else 0.",
    ],
    dealGrade: "A: points ≥ 75, age under 365 days and market tier ≥ 4. B: points ≥ 55 and age under 730 days. C: points ≥ 35. Else D. A story that names no city or county gets C at most.",
    confidence: "Winner only. From the v2 tier_attribution: ≥ 4 high, 3 medium, else verify.",
    columns: "weighted_score holds the points; deal_grade holds the simple grade. The tier_* columns hold the weighted-grade@v2 tiers. The five parts are not stored: the app rebuilds them from stored fields.",
    usedBy: "\"simple-score@v1\" (8,791 stories, 98 jobs, 2026-10-28 to 2026-10-29).",
  },
];

export const SYSTEM_BY_ID = new Map(SYSTEMS.map((s) => [s.id, s]));

/** The system that ranked a story, from its ranking_system value and weighted score. */
export function rankedBy(rankingSystem: string, weightedScore: number | null): SystemId {
  if (rankingSystem === "weighted-grade@v2") return "weighted-grade@v2";
  if (rankingSystem === "simple-score@v1") return "simple-score@v1";
  if (rankingSystem === "weighted-grade@v1") return "weighted-grade@v1";
  // untagged: weighted-grade@v1 before the version column (f644e7e8), except jobs 555 and 556.
  return weightedScore === null ? "cause-score@v1" : "weighted-grade@v1";
}

/** The label for the weighted_score column of a story: it always names the system that made it. */
export function scoreLabel(system: SystemId): string {
  if (system === "simple-score@v1") return "simple points";
  if (system === "cause-score@v1") return "no weighted score (ranked by total)";
  return `${system} score`;
}
