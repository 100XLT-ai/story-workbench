/**
 * Shows, for one story, each ranking system's raw input next to its score (Part 2, DECISIONS D48).
 * It recomputes each value with longtale-core's own functions (copied in ./upstream) from stored
 * fields, and compares it with the stored value. It never makes a new score (P1).
 */
import { buildBeneficiaryInterest, isProperNounBeneficiary, normalizeBeneficiary, scoreCandidate, type ScoreComponents } from "./upstream/cause-score";
import {
  computeAttributionTier,
  computeConfidence,
  computeDealGrade,
  computeDealGradeV2,
  computeRecencyTier,
  confidenceFromTier,
  DEAL_GRADE_BOUNDS,
  DEAL_GRADE_BOUNDS_V2,
  impactPoints,
  impactValueTier,
  marketPoints,
  quintileTier,
  recencyPoints,
  recencyTierV2,
  REACH_STUB,
  simpleGrade,
  specificityNudge,
  tierToFib,
  UNIT_BANDS,
  WEIGHT_CONFIG,
  WEIGHT_CONFIG_V2,
} from "./upstream/tiers";
import { rankedBy, scoreLabel, type SystemId } from "./systems";

/** The stored fields the explainer reads (one story row plus a slice of `raw`). */
export interface ScoringRow {
  id: number;
  jobId: number;
  rank: number | null;
  winner: boolean;
  rankingSystem: string;
  weightedScore: number | null;
  total: number | null;
  tierImpact: number | null;
  tierRecency: number | null;
  tierReach: number | null;
  tierEvidence: number | null;
  tierAttribution: number | null;
  tierMarket: number | null;
  tierImage: number | null;
  dealGrade: string | null;
  confidence: string | null;
  scoreComponents: Partial<ScoreComponents> | null;
  description: string | null;
  beneficiary: string | null;
  evidenceQuote: string | null;
  impactTypePrimary: string | null;
  impactValueRaw: number | null;
  impactValueUnit: string | null;
  domain: string | null;
  raw: {
    amount?: number | string | null;
    attendees?: number | string | null;
    attribution?: string | null;
    signal_date?: string | null;
    signal_date_source?: string | null;
    created_at?: string | null;
    beneficiary_specificity?: string | null;
    impact_secondary?: { impactTypePrimary?: string | null; impactValueRaw?: number | null; impactValueUnit?: string | null }[] | null;
    is_future?: boolean | null;
    market_relevance?: string | null;
  };
}

/** Job-level facts the job's other stories give (the snapshot keeps ranked candidates only). */
export interface JobContext {
  /** normalized beneficiary → stories in the job with it. */
  beneficiaryCount: Map<string, number>;
  /** impact type → the impact values of the job's stories of that type. */
  impactCohort: Map<string, number[]>;
}

export type Check = "match" | "differs" | "rebuilt" | "not stored" | null;

export interface Part {
  key: string;
  label: string;
  /** The raw input, in words: "2026-02-18 (event), 105 days before the rank time". */
  input: string;
  /** The band or rule that applied. */
  band?: string;
  /** The value the copied function gives. */
  computed: number | string | null;
  /** The value in the snapshot. */
  stored: number | string | null;
  check: Check;
  note?: string;
}

export interface SystemExplain {
  system: SystemId;
  /** True when this system ranked the story. */
  ranked: boolean;
  parts: Part[];
  score?: Part;
  grade?: Part;
  confidence?: Part;
}

export interface StoryScoring {
  rankingSystem: string;
  rankedBy: SystemId;
  scoreLabel: string;
  /** The rank time: raw.created_at (the rank phase writes the row a few seconds after it reads "now"). */
  rankTime: string | null;
  systems: Partial<Record<SystemId, SystemExplain>>;
}

const DAY = 24 * 60 * 60 * 1000;
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const close = (a: number | null, b: number | null, eps = 1e-6) => a !== null && b !== null && Math.abs(a - b) < eps;
const checkOf = (computed: number | string | null, stored: number | string | null): Check => {
  if (stored === null || stored === undefined) return "not stored";
  if (typeof computed === "number" && typeof stored === "number") return close(computed, stored, 1e-4) ? "match" : "differs";
  return computed === stored ? "match" : "differs";
};
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const day = (s: string | null | undefined) => (s ? String(s).slice(0, 10) : null);
const utcDate = (d: string | null) => (d ? new Date(`${d}T00:00:00.000Z`) : null);
const hostOf = (url: string | null | undefined) => {
  try {
    return url ? new URL(url).hostname.toLowerCase().replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};
const ageDaysAt = (date: string | null, now: Date | null) => (date && now ? (now.getTime() - Date.parse(`${date}T00:00:00.000Z`)) / DAY : null);

/** The inverse of log10(x + 1) × k: the value a stored part was computed from. */
const fromPart = (part: number | null, k: number) => (part && part > 0 ? Math.round((10 ** (part / k) - 1) * 100) / 100 : null);

function impactsOf(r: ScoringRow) {
  const list = [{ impactType: r.impactTypePrimary, impactValueRaw: r.impactValueRaw, impactValueUnit: r.impactValueUnit }];
  for (const s of Array.isArray(r.raw.impact_secondary) ? r.raw.impact_secondary : []) list.push({ impactType: s.impactTypePrimary ?? null, impactValueRaw: num(s.impactValueRaw), impactValueUnit: s.impactValueUnit ?? null });
  return list;
}

// ---------------------------------------------------------------- cause-score@v1

function explainCause(r: ScoringRow, job: JobContext, now: Date | null, system: SystemId): SystemExplain {
  const stored = r.scoreComponents ?? {};
  const v2Path = system === "weighted-grade@v2" || system === "simple-score@v1";
  const signalDate = day(r.raw.signal_date);
  // amount and attendance inputs: v1 path stores them in raw; v2/simple read the primary impact.
  let amountUsd = num(r.raw.amount);
  let amountFrom = amountUsd !== null ? "raw.amount" : "";
  if (amountUsd === null && v2Path && (r.impactValueUnit ?? "").toLowerCase() === "usd") {
    amountUsd = r.impactValueRaw;
    amountFrom = "the primary impact (unit usd)";
  }
  if (amountUsd === null && fromPart(num(stored.amount), 20) !== null) {
    amountUsd = fromPart(num(stored.amount), 20);
    amountFrom = "implied by the stored part";
  }
  let attendees = num(r.raw.attendees);
  let attendeesFrom = attendees !== null ? "raw.attendees" : "";
  if (attendees === null && v2Path && ["count", "attendees", "people"].includes((r.impactValueUnit ?? "").toLowerCase()) && r.impactValueRaw !== null) {
    attendees = Math.round(r.impactValueRaw);
    attendeesFrom = `the primary impact (unit ${r.impactValueUnit})`;
  }
  if (attendees === null && fromPart(num(stored.attendance), 15) !== null) {
    attendees = fromPart(num(stored.attendance), 15);
    attendeesFrom = "implied by the stored part";
  }
  const sourceUrl = r.raw.attribution ?? "";
  const advertiserHost = (r.domain ?? "").toLowerCase().replace(/^www\./, "");
  const storedAttribution = num(stored.attribution);
  // The on-domain flag is not stored: a stored attribution above 0 proves it; else assume off-domain.
  const onDomain = (storedAttribution ?? 0) > 0;
  const key = normalizeBeneficiary(r.beneficiary);
  const interest = v2Path ? new Map<string, number>() : new Map(job.beneficiaryCount);
  const computed = now
    ? scoreCandidate(
        { amountUsd, attendees, signalDate: utcDate(signalDate), evidenceQuote: r.evidenceQuote, beneficiary: r.beneficiary, sourceUrl, onDomain },
        { advertiserHost, beneficiaryInterest: interest },
        now,
      ).components
    : null;
  const c = (k: keyof ScoreComponents) => (computed ? Math.round(computed[k] * 1e6) / 1e6 : null);
  const s = (k: keyof ScoreComponents) => num(stored[k]);
  const age = ageDaysAt(signalDate, now);
  const interestCount = job.beneficiaryCount.get(key) ?? 0;
  const storedInterest = s("beneficiaryInterest");
  const quote = !!r.evidenceQuote?.trim();
  const proper = isProperNounBeneficiary(r.beneficiary);
  const parts: Part[] = [
    {
      key: "recency",
      label: "Recency",
      input: signalDate ? `${signalDate} (${r.raw.signal_date_source ?? "source not stored"}), ${age === null ? "?" : Math.floor(age)} days before the rank time` : "no signal date",
      band: !signalDate ? "no date: factor 0" : age !== null && age < 0 ? "future: factor 100" : age !== null && age < 30 ? "under 30 days: factor 100" : age !== null && age < 180 ? "under 180 days: factor 50" : age !== null && age < 365 ? "under 365 days: factor 10" : "365 days or more: factor 0",
      computed: c("recency"),
      stored: s("recency"),
      check: checkOf(c("recency"), s("recency")),
    },
    {
      key: "amount",
      label: "Amount",
      input: amountUsd !== null ? `${usd(amountUsd)} (${amountFrom})` : v2Path && r.impactValueRaw !== null ? `none: the primary impact's unit is "${r.impactValueUnit}", not exactly "usd"` : "no USD value",
      band: "log10(USD + 1) × 20",
      computed: c("amount"),
      stored: s("amount"),
      check: checkOf(c("amount"), s("amount")),
    },
    {
      key: "attendance",
      label: "Attendance",
      input: attendees !== null ? `${Math.round(attendees).toLocaleString("en-US")} people (${attendeesFrom})` : "no people count",
      band: "log10(people + 1) × 15",
      computed: c("attendance"),
      stored: s("attendance"),
      check: checkOf(c("attendance"), s("attendance")),
    },
    {
      key: "attribution",
      label: "Attribution",
      input: `source host ${hostOf(sourceUrl) ?? "(none)"} vs advertiser host ${advertiserHost || "(none)"}`,
      band: storedAttribution === 25 ? "on-domain: same host or a subdomain" : storedAttribution === 12 ? "on-domain: the brand stem in the host or path" : "off-domain, or no host match",
      computed: c("attribution"),
      stored: storedAttribution,
      check: checkOf(c("attribution"), storedAttribution),
      note: "The on-domain flag is not stored. A stored value above 0 proves it; otherwise the app assumes off-domain.",
    },
    {
      key: "beneficiaryInterest",
      label: "Beneficiary interest",
      input: v2Path
        ? "always 0: the v2 and simple pipelines pass an empty beneficiary map"
        : `"${r.beneficiary ?? ""}": ${interestCount} ranked ${interestCount === 1 ? "story" : "stories"} in this job share it${storedInterest !== null && storedInterest < 20 ? `; the stored part implies ${Math.round(storedInterest / 4)} harvested candidates` : ""}`,
      band: "min(count ÷ 5, 1) × 20",
      computed: c("beneficiaryInterest"),
      stored: storedInterest,
      check: checkOf(c("beneficiaryInterest"), storedInterest),
      note: v2Path ? undefined : "The rank phase counted every harvested candidate; the snapshot keeps the ranked ones only, so the count can be lower.",
    },
    {
      key: "evidenceCompleteness",
      label: "Evidence completeness",
      input: [`quote ${quote ? "yes" : "no"}`, `USD value ${amountUsd && amountUsd > 0 ? "yes" : "no"}`, `beneficiary ${!r.beneficiary?.trim() ? "none" : proper ? "named" : "common noun"}`, `signal date ${signalDate ? "yes" : "no"}`].join(" · "),
      band: "20 × (0.25 + 0.25 + 0.25 or 0.125 + 0.25)",
      computed: c("evidenceCompleteness"),
      stored: s("evidenceCompleteness"),
      check: checkOf(c("evidenceCompleteness"), s("evidenceCompleteness")),
    },
  ];
  const totalComputed = computed ? parts.reduce((t, p) => t + (typeof p.computed === "number" ? p.computed : 0), 0) : null;
  return {
    system: "cause-score@v1",
    ranked: rankedBy(r.rankingSystem, r.weightedScore) === "cause-score@v1",
    parts,
    score: { key: "total", label: "Total", input: "the sum of the six parts", computed: totalComputed, stored: r.total, check: checkOf(totalComputed, r.total) },
  };
}

// ---------------------------------------------------------------- weighted-grade@v1

function explainV1(r: ScoringRow, job: JobContext, now: Date | null, ranked: boolean): SystemExplain {
  const signalDate = day(r.raw.signal_date);
  const recency = computeRecencyTier(utcDate(signalDate), now ?? new Date(0));
  const cohort = r.impactTypePrimary ? (job.impactCohort.get(r.impactTypePrimary) ?? []) : [];
  const impactTier = r.impactTypePrimary ? quintileTier(r.impactValueRaw ?? 0, cohort) : null;
  const attribution = num(r.scoreComponents?.attribution) ?? 0;
  const narrative = (r.description ?? "").length >= 200;
  const quote = !!r.evidenceQuote?.trim();
  const nudge = specificityNudge(r.raw.beneficiary_specificity ?? null);
  const fib = (t: number | null) => (t === null ? null : tierToFib(t));
  // The image tier is not stored: the stored score gives it.
  const known =
    r.tierImpact !== null && r.tierRecency !== null && r.tierEvidence !== null && r.tierAttribution !== null
      ? WEIGHT_CONFIG.impact * tierToFib(r.tierImpact) + WEIGHT_CONFIG.recency * tierToFib(r.tierRecency) + WEIGHT_CONFIG.reach * tierToFib(REACH_STUB) + WEIGHT_CONFIG.evidence * tierToFib(r.tierEvidence) + WEIGHT_CONFIG.attribution * tierToFib(r.tierAttribution)
      : null;
  let imageTier: number | null = null;
  if (known !== null && r.weightedScore !== null) {
    for (let t = 1; t <= 5; t++) if (close((known + WEIGHT_CONFIG.image * tierToFib(t)) / 100 + nudge, r.weightedScore, 1e-6)) imageTier = t;
  }
  const scoreComputed = known !== null && imageTier !== null ? Math.round(((known + WEIGHT_CONFIG.image * tierToFib(imageTier)) / 100 + nudge) * 1e6) / 1e6 : null;
  const attrTierNoCorr = computeAttributionTier(attribution, 0);
  const attrTierCorr = computeAttributionTier(attribution, 1);
  const parts: Part[] = [
    {
      key: "tier_impact",
      label: "Impact tier",
      input: r.impactTypePrimary ? `${r.impactTypePrimary}, value ${r.impactValueRaw ?? "none (0)"}; quintile among ${cohort.length} ranked ${r.impactTypePrimary} stories in the job` : "no impact type",
      band: "quintile 1–5 (top = 5)",
      computed: impactTier,
      stored: r.tierImpact,
      check: checkOf(impactTier, r.tierImpact),
      note: "The rank phase ranked against every harvested candidate of the type; the snapshot keeps the ranked ones only.",
    },
    {
      key: "tier_recency",
      label: "Recency tier",
      input: signalDate ? `${signalDate}, ${Math.max(0, Math.floor(ageDaysAt(signalDate, now) ?? 0))} days before the rank time` : "no signal date",
      band: "<90 d 5 · <180 4 · <365 3 · <730 2 · else 1 · no date 3",
      computed: recency,
      stored: r.tierRecency,
      check: checkOf(recency, r.tierRecency),
    },
    { key: "tier_reach", label: "Reach tier", input: "a stub: always 3", computed: REACH_STUB, stored: r.tierReach, check: checkOf(REACH_STUB, r.tierReach) },
    {
      key: "tier_evidence",
      label: "Evidence tier",
      input: `quote ${quote ? "yes" : "no"} · description ${(r.description ?? "").length} characters (${narrative ? "≥ 200" : "< 200"}) · editorial photo: not stored`,
      band: "quintile of the count among the job's candidates",
      computed: null,
      stored: r.tierEvidence,
      check: r.tierEvidence === null ? "not stored" : null,
    },
    {
      key: "tier_attribution",
      label: "Attribution tier",
      input: `cause-score attribution ${attribution}; a second source page for the beneficiary: ${r.tierAttribution === attrTierCorr && attrTierCorr !== attrTierNoCorr ? "yes" : r.tierAttribution === attrTierNoCorr && attrTierCorr !== attrTierNoCorr ? "no" : "?"}`,
      band: "25 → 5 or 4 · 12 → 3 or 2 · else 1",
      computed: r.tierAttribution === attrTierCorr ? attrTierCorr : attrTierNoCorr,
      stored: r.tierAttribution,
      check: checkOf(r.tierAttribution === attrTierCorr ? attrTierCorr : attrTierNoCorr, r.tierAttribution),
    },
    {
      key: "tier_image",
      label: "Image tier",
      input: "not stored: the stored weighted score gives it",
      computed: imageTier,
      stored: null,
      check: imageTier === null ? null : "rebuilt",
    },
    { key: "nudge", label: "Beneficiary nudge", input: `specificity "${r.raw.beneficiary_specificity ?? "unknown"}"`, band: "named +0.25 · generic −0.15 · else 0", computed: nudge, stored: null, check: null },
  ];
  const grade = computeDealGrade(r.weightedScore);
  return {
    system: "weighted-grade@v1",
    ranked,
    parts,
    score: {
      key: "weighted_score",
      label: scoreLabel("weighted-grade@v1"),
      input: `(30·${fib(r.tierImpact)} + 20·${fib(r.tierRecency)} + 10·3 + 15·${fib(r.tierEvidence)} + 15·${fib(r.tierAttribution)} + 10·${fib(imageTier) ?? "?"}) ÷ 100 ${nudge >= 0 ? "+" : "−"} ${Math.abs(nudge)}`,
      computed: scoreComputed,
      stored: r.weightedScore,
      check: checkOf(scoreComputed, r.weightedScore),
    },
    grade: {
      key: "deal_grade",
      label: "Deal grade",
      input: `weighted score ${r.weightedScore ?? "none"}`,
      band: `A ≥ ${DEAL_GRADE_BOUNDS.A} · B ≥ ${DEAL_GRADE_BOUNDS.B} · C ≥ ${DEAL_GRADE_BOUNDS.C} · else D`,
      computed: grade,
      stored: r.dealGrade,
      check: checkOf(grade, r.dealGrade),
    },
    confidence: {
      key: "confidence",
      label: "Confidence",
      input: r.winner ? `winner; cause-score attribution ${attribution}` : "set on the winner only",
      band: "≥ 25 high · ≥ 12 medium · else verify",
      computed: r.winner ? computeConfidence(attribution) : null,
      stored: r.confidence,
      check: r.winner ? checkOf(computeConfidence(attribution), r.confidence) : null,
    },
  };
}

// ---------------------------------------------------------------- weighted-grade@v2

const V2_POINTS_FROM = "2026-10-28";

function explainV2(r: ScoringRow, now: Date | null, ranked: boolean): SystemExplain {
  const signalDate = day(r.raw.signal_date);
  const impacts = impactsOf(r);
  const types = new Set(impacts.map((i) => i.impactType).filter(Boolean));
  const tiers = impacts.map((i) => impactValueTier(i.impactValueRaw, i.impactValueUnit));
  const impactTier = Math.min(5, Math.max(...tiers) + (types.size > 1 ? 1 : 0));
  const recency = now ? recencyTierV2(signalDate, now) : null;
  const rankDay = day(r.raw.created_at);
  const points = !!rankDay && rankDay >= V2_POINTS_FROM;
  const nudge = specificityNudge(r.raw.beneficiary_specificity ?? null);
  const t = (v: number | null) => (v === null ? null : tierToFib(v));
  const m = r.tierMarket === null ? null : points ? marketPoints(r.tierMarket) : tierToFib(r.tierMarket);
  const all = [r.tierImpact, r.tierRecency, m, r.tierEvidence, r.tierAttribution, r.tierImage];
  const score =
    all.every((x) => x !== null) && m !== null
      ? Math.round(((WEIGHT_CONFIG_V2.impact * tierToFib(r.tierImpact!) + WEIGHT_CONFIG_V2.recency * tierToFib(r.tierRecency!) + WEIGHT_CONFIG_V2.market * m + WEIGHT_CONFIG_V2.evidence * tierToFib(r.tierEvidence!) + WEIGHT_CONFIG_V2.attribution * tierToFib(r.tierAttribution!) + WEIGHT_CONFIG_V2.image * tierToFib(r.tierImage!)) / 100 + nudge) * 1e4) / 1e4
      : null;
  const parts: Part[] = [
    {
      key: "tier_impact",
      label: "Impact tier",
      input: impacts.map((i, k) => `${i.impactValueRaw ?? "no value"} ${i.impactValueUnit ?? ""} (${i.impactType ?? "?"}) → ${tiers[k]}`).join(" · "),
      band: `per value: ${(Object.keys(UNIT_BANDS) as (keyof typeof UNIT_BANDS)[]).map((k) => `${k} ${UNIT_BANDS[k].join("/")}`).join("; ")}; no value or unit 3. Best ${Math.max(...tiers)}${types.size > 1 ? " +1 (more than one impact type)" : ""}, at most 5`,
      computed: impactTier,
      stored: r.tierImpact,
      check: checkOf(impactTier, r.tierImpact),
      note: "The v2 merge can join impacts from several pages; the snapshot has the primary impact and impact_secondary.",
    },
    {
      key: "tier_recency",
      label: "Recency tier",
      input: signalDate ? `${signalDate} (${r.raw.signal_date_source ?? "?"}), ${Math.floor(ageDaysAt(signalDate, now) ?? 0)} days before the rank time` : "no date",
      band: "<90 d (or future) 5 · <180 4 · <365 3 · <730 2 · else 1 · no date 3",
      computed: recency,
      stored: r.tierRecency,
      check: checkOf(recency, r.tierRecency),
    },
    { key: "tier_market", label: "Market tier", input: `market relevance "${r.raw.market_relevance ?? "?"}"; the page places are not in the snapshot`, band: `${points ? "market points: tier ≥ 4 → 5 · 2–3 → 3 · 1 → 0" : "fib(tier) (before 2026-10-28)"}; this story: M = ${m ?? "?"}`, computed: null, stored: r.tierMarket, check: r.tierMarket === null ? "not stored" : null },
    { key: "tier_evidence", label: "Evidence tier", input: `quote ${r.evidenceQuote ? "yes" : "no"} · named beneficiary ${r.raw.beneficiary_specificity === "named" ? "yes" : "no"} · value ${r.impactValueRaw !== null ? "yes" : "no"}`, band: "one point each for quote, named beneficiary, event date, value, long activity; list pages max 2", computed: null, stored: r.tierEvidence, check: null },
    { key: "tier_attribution", label: "Attribution tier", input: "from the on-site and off-site pages about the advertiser", band: "on-site + off-site 5 · on-site 4 · else 4 or 3", computed: null, stored: r.tierAttribution, check: null },
    { key: "tier_image", label: "Image tier", input: "from the photo search", band: "hero 5 · 2+ editorial 4 · 1 editorial or brand 3 · else 1", computed: null, stored: r.tierImage, check: null },
    { key: "nudge", label: "Beneficiary nudge", input: `specificity "${r.raw.beneficiary_specificity ?? "unknown"}"`, band: "named +0.25 · generic −0.15 · else 0", computed: nudge, stored: null, check: null },
  ];
  const grade = r.weightedScore === null ? null : points ? computeDealGradeV2(r.weightedScore, r.tierMarket ?? 0) : computeDealGradeV2(r.weightedScore, 5);
  return {
    system: "weighted-grade@v2",
    ranked,
    parts,
    score: {
      key: "weighted_score",
      label: ranked ? scoreLabel("weighted-grade@v2") : "weighted-grade@v2 score (computed by longtale-core, not stored here)",
      input: `(25·${t(r.tierImpact)} + 20·${t(r.tierRecency)} + 15·${m ?? "?"} + 15·${t(r.tierEvidence)} + 10·${t(r.tierAttribution)} + 15·${t(r.tierImage)}) ÷ 100 ${nudge >= 0 ? "+" : "−"} ${Math.abs(nudge)}`,
      computed: score,
      stored: ranked ? r.weightedScore : null,
      check: ranked ? checkOf(score, r.weightedScore) : null,
    },
    grade: ranked
      ? {
          key: "deal_grade",
          label: "Deal grade",
          input: `weighted score ${r.weightedScore}, market tier ${r.tierMarket}`,
          band: `A ≥ ${DEAL_GRADE_BOUNDS_V2.A} · B ≥ ${DEAL_GRADE_BOUNDS_V2.B} · C ≥ ${DEAL_GRADE_BOUNDS_V2.C} · else D${points ? "; A or B with market < 4 → C" : " (no market cap before 2026-10-28)"}`,
          computed: grade,
          stored: r.dealGrade,
          check: checkOf(grade, r.dealGrade),
        }
      : undefined,
    confidence: {
      key: "confidence",
      label: "Confidence",
      input: r.winner ? `winner; tier_attribution ${r.tierAttribution}` : "set on the winner only",
      band: "≥ 4 high · 3 medium · else verify",
      computed: r.winner && r.tierAttribution !== null ? confidenceFromTier(r.tierAttribution) : null,
      stored: r.confidence,
      check: r.winner && r.tierAttribution !== null ? checkOf(confidenceFromTier(r.tierAttribution), r.confidence) : null,
    },
  };
}

// ---------------------------------------------------------------- simple-score@v1

function explainSimple(r: ScoringRow, now: Date | null): SystemExplain {
  const signalDate = day(r.raw.signal_date);
  const age = ageDaysAt(signalDate, now);
  const ageDays = age === null ? null : Math.max(0, Math.floor(age));
  const recency = recencyPoints(ageDays);
  const local = r.tierMarket === null ? null : r.tierMarket >= 4 ? 25 : 10;
  const impact = impactPoints(impactsOf(r));
  const photoOptions = r.tierImage === 5 ? [15] : r.tierImage === 4 ? [8] : r.tierImage === 3 ? [0, 8] : [0];
  const points = r.weightedScore;
  const proofOptions = points === null || local === null ? [] : photoOptions.map((p) => ({ photo: p, proof: points - recency - local - impact - p })).filter((x) => [0, 5, 10, 15].includes(x.proof));
  const one = proofOptions.length === 1 ? proofOptions[0] : null;
  const grade = points === null ? null : simpleGrade(points, ageDays, r.tierMarket ?? 0);
  const parts: Part[] = [
    { key: "recency", label: "Recency", input: signalDate ? `${signalDate} (${r.raw.signal_date_source ?? "?"}), ${ageDays} days before the rank time` : "no date", band: "<183 d 30 · <365 22 · <730 10 · else 0 · no date 5", computed: recency, stored: null, check: "rebuilt", note: "simple-score uses the newest event date, else the newest page date; signal_date is the v2 date, so a few stories differ." },
    { key: "local", label: "Local", input: `market tier ${r.tierMarket ?? "?"}`, band: "tier ≥ 4 → 25 · else 10", computed: local, stored: null, check: "rebuilt" },
    { key: "impact", label: "Impact", input: impactsOf(r).map((i) => `${i.impactValueRaw ?? "no value"} ${i.impactValueUnit ?? ""}`).join(" · "), band: "10 for a USD or people value · +5 for USD ≥ 25,000 or people ≥ 500", computed: impact, stored: null, check: "rebuilt" },
    { key: "photo", label: "Photo", input: `image tier ${r.tierImage ?? "?"}`, band: "hero 15 · editorial 8 · else 0 (tier 3 can be 0 or 8)", computed: one ? one.photo : photoOptions.length === 1 ? photoOptions[0] : photoOptions.join(" or "), stored: null, check: "rebuilt" },
    { key: "proof", label: "Proof", input: "the points minus the other four parts", band: "off-site non-social page about the advertiser 10 · on-site page 5", computed: one ? one.proof : proofOptions.length ? proofOptions.map((x) => x.proof).join(" or ") : null, stored: null, check: one ? "rebuilt" : "differs", note: one ? undefined : "No single proof value fits the stored points; a rebuilt part is off (most often recency, see its note)." },
  ];
  return {
    system: "simple-score@v1",
    ranked: true,
    parts,
    score: { key: "weighted_score", label: scoreLabel("simple-score@v1"), input: "recency + local + impact + proof + photo", computed: one && local !== null ? recency + local + impact + one.photo + one.proof : null, stored: points, check: one ? "match" : "differs" },
    grade: {
      key: "deal_grade",
      label: "Deal grade (simple)",
      input: `points ${points}, age ${ageDays ?? "?"} days, market tier ${r.tierMarket ?? "?"}`,
      band: "A ≥ 75, age < 365, market ≥ 4 · B ≥ 55, age < 730 · C ≥ 35 · else D; no place named → C at most",
      computed: grade,
      stored: r.dealGrade,
      check: checkOf(grade, r.dealGrade),
      note: "Whether the story names a city or county is not stored; the app assumes it does.",
    },
    confidence: {
      key: "confidence",
      label: "Confidence",
      input: r.winner ? `winner; the v2 tier_attribution ${r.tierAttribution}` : "set on the winner only",
      band: "≥ 4 high · 3 medium · else verify",
      computed: r.winner && r.tierAttribution !== null ? confidenceFromTier(r.tierAttribution) : null,
      stored: r.confidence,
      check: r.winner && r.tierAttribution !== null ? checkOf(confidenceFromTier(r.tierAttribution), r.confidence) : null,
    },
  };
}

// ---------------------------------------------------------------- entry points

/** The job context from the job's stories (beneficiary counts and impact cohorts). */
export function jobContext(rows: Pick<ScoringRow, "beneficiary" | "impactTypePrimary" | "impactValueRaw">[]): JobContext {
  const beneficiaryCount = buildBeneficiaryInterest(rows.map((r) => r.beneficiary));
  const impactCohort = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.impactTypePrimary) continue;
    const list = impactCohort.get(r.impactTypePrimary) ?? [];
    list.push(r.impactValueRaw ?? 0);
    impactCohort.set(r.impactTypePrimary, list);
  }
  return { beneficiaryCount, impactCohort };
}

export function explainStory(r: ScoringRow, job: JobContext): StoryScoring {
  const system = rankedBy(r.rankingSystem, r.weightedScore);
  const created = r.raw.created_at ? new Date(`${String(r.raw.created_at).replace(" ", "T").slice(0, 23)}Z`) : null;
  const now = created && !Number.isNaN(created.getTime()) ? created : null;
  const systems: StoryScoring["systems"] = { "cause-score@v1": explainCause(r, job, now, system) };
  if (system === "weighted-grade@v1") systems["weighted-grade@v1"] = explainV1(r, job, now, true);
  if (system === "weighted-grade@v2") systems["weighted-grade@v2"] = explainV2(r, now, true);
  if (system === "simple-score@v1") {
    systems["simple-score@v1"] = explainSimple(r, now);
    // Simple stories store the v2 tiers too (rank-v2.ts writes them for every row).
    systems["weighted-grade@v2"] = explainV2(r, now, false);
  }
  return { rankingSystem: r.rankingSystem, rankedBy: system, scoreLabel: scoreLabel(system), rankTime: now ? now.toISOString().slice(0, 19).replace("T", " ") : null, systems };
}
