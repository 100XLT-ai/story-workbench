// Copied verbatim from longtale-core origin/main (20e943e7): apps/api/src/api/modules/discovery/ranking/cause-score.ts
// Do not edit: re-copy instead (DECISIONS D48).
/**
 * Cause-candidate scoring — six-component formula (01-spec Slice 4 Data Model).
 *
 * Pure functions, no LLM / no DB, so the golden-value tests are deterministic.
 * The weights, recency bands, and attribution tiers are PRODUCT-DEFINED and
 * FIXED BY SCOPE — implemented VERBATIM, never derived/rounded/re-weighted. The
 * coefficient set is code-keyed by `SCORING_VERSION`; only that tag is persisted
 * (a future re-weight ships a new module + version tag, never an edit-in-place).
 *
 *   amount               = amount_usd > 0 ? log10(amount_usd + 1) * 20 : 0
 *   attendance           = attendees  > 0 ? log10(attendees  + 1) * 15 : 0
 *   recency              = (recencyFactor / 100) * 25
 *                            recencyFactor = 100 (<30d) | 50 (<180d) | 10 (<365d) | 0
 *   beneficiaryInterest  = min(interestCount / 5, 1) * 20
 *   evidenceCompleteness = completeness * 20
 *                            completeness = (evidenceQuote ? .25 : 0)
 *                              + (amount_usd > 0 ? .25 : 0)
 *                              + (properNoun ? .25 : commonNoun ? .125 : 0)
 *                              + (signalDate ? .25 : 0)
 *   attribution          = on-domain only (off-domain → 0):
 *                            25 host === advertiserHost
 *                            25 host is a subdomain of advertiserHost
 *                            12 advertiser brand-stem (>=4 chars) in source host
 *                            12 "/stem" or "-stem" in the URL path
 *                            0  otherwise
 *   total                = sum of the six (max ~135)
 */

export const SCORING_VERSION = "cause-score@v1";

/** Recency bands (days) → recencyFactor. Fixed by scope. */
const RECENCY_30D_MS = 30 * 24 * 60 * 60 * 1000;
const RECENCY_180D_MS = 180 * 24 * 60 * 60 * 1000;
const RECENCY_365D_MS = 365 * 24 * 60 * 60 * 1000;

/** Minimum advertiser brand-stem length for the host/path attribution tiers. */
const BRAND_STEM_MIN_LEN = 4;

export interface ScoreCandidateInput {
  /** USD amount (or null/undefined when none). */
  amountUsd?: number | null;
  attendees?: number | null;
  /** Signal date (or null/undefined when none). */
  signalDate?: Date | null;
  evidenceQuote?: string | null;
  /** The candidate's beneficiary string (or null/undefined). */
  beneficiary?: string | null;
  /** The source URL the candidate was harvested from. */
  sourceUrl: string;
  /**
   * True when this candidate was harvested from the advertiser's own domain
   * (discoveryMethod === "on-domain"). Off-domain candidates score 0 on
   * attribution regardless of host/path.
   */
  onDomain: boolean;
}

export interface ScoreContext {
  /** Advertiser host (lowercased, no leading www.). */
  advertiserHost: string;
  /**
   * beneficiary (normalized) → count of candidates in THIS job sharing it.
   * Built across all harvested candidates before scoring. Used for the
   * beneficiary-interest component.
   */
  beneficiaryInterest: Map<string, number>;
}

export interface ScoreComponents {
  amount: number;
  attendance: number;
  recency: number;
  beneficiaryInterest: number;
  evidenceCompleteness: number;
  attribution: number;
}

export interface ScoreResult {
  components: ScoreComponents;
  total: number;
}

/**
 * Common-noun blocklist for beneficiary scoring. Strings (lowercased) that are
 * generic aggregates — these score at 0.125, NOT 0.25, but are NEVER dropped.
 * The row-dropping prototype behaviour is a known SCAR; this implementation
 * scores-don't-drop per the spec.
 */
const COMMON_NOUN_BLOCKLIST = new Set([
  "community",
  "communities",
  "local communities",
  "the community",
  "families",
  "family",
  "local families",
  "children",
  "kids",
  "youth",
  "young people",
  "seniors",
  "elderly",
  "the elderly",
  "students",
  "schools",
  "local schools",
  "veterans",
  "people",
  "individuals",
  "residents",
  "neighbors",
  "neighbours",
  "those in need",
  "people in need",
  "the public",
  "everyone",
  "all",
  "animals",
  "wildlife",
  "environment",
]);

/**
 * Returns true when the beneficiary string represents a specific named
 * organisation or proper-noun entity (scores +0.25), false for common-noun
 * aggregates (scores +0.125). NEVER drops a row.
 *
 * Logic: must start with an uppercase letter (proper noun indicator) AND must
 * not be in the generic common-noun blocklist (case-insensitive).
 */
export function isValidBeneficiary(beneficiary?: string | null): boolean {
  if (!beneficiary) return false;
  const trimmed = beneficiary.trim();
  if (trimmed.length === 0) return false;
  if (!/^[A-Z]/.test(trimmed)) return false;
  return !COMMON_NOUN_BLOCKLIST.has(trimmed.toLowerCase());
}

/**
 * Thin alias kept for backward compatibility with unit tests that import
 * isProperNounBeneficiary directly. New code should call isValidBeneficiary.
 */
export function isProperNounBeneficiary(beneficiary?: string | null): boolean {
  return isValidBeneficiary(beneficiary);
}

/** Normalize a beneficiary for the interest-map key (lowercased, trimmed). */
export function normalizeBeneficiary(beneficiary?: string | null): string {
  return (beneficiary ?? "").trim().toLowerCase();
}

/**
 * Derive the advertiser brand-stem from the advertiser host.
 *
 * Strategy: split on ".", drop tokens ≤2 chars (TLDs and country codes such as
 * "co", "uk", "io"), then take the longest remaining token (lowercased).
 * Returns "" when no token survives.
 *
 * Examples:
 *   "acme.com"            → "acme"           (unchanged)
 *   "m.acmefoundation.org"→ "acmefoundation" (longest wins over "m")
 *   "shop.acme.co.uk"     → "acme"           (the one legitimate golden flip)
 *   "bp.io"               → ""               (all tokens ≤2 chars)
 *   "x.co"                → ""               (all tokens ≤2 chars)
 */
export function brandStem(advertiserHost: string): string {
  if (!advertiserHost) return "";
  const tokens = advertiserHost.toLowerCase().split(".");
  const meaningful = tokens.filter((t) => t.length > 2);
  if (meaningful.length === 0) return "";
  return meaningful.reduce((longest, t) =>
    t.length > longest.length ? t : longest,
  );
}

/** Hostname (lowercased, leading www. stripped) of a URL, or "" if invalid. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** URL pathname (lowercased) of a URL, or "" if invalid. */
function pathOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return "";
  }
}

function amountComponent(amountUsd?: number | null): number {
  return amountUsd && amountUsd > 0 ? Math.log10(amountUsd + 1) * 20 : 0;
}

function attendanceComponent(attendees?: number | null): number {
  return attendees && attendees > 0 ? Math.log10(attendees + 1) * 15 : 0;
}

function recencyComponent(
  signalDate: Date | null | undefined,
  now: Date,
): number {
  const recencyFactor = recencyFactorFor(signalDate, now);
  return (recencyFactor / 100) * 25;
}

function recencyFactorFor(
  signalDate: Date | null | undefined,
  now: Date,
): number {
  if (!signalDate) return 0;
  const delta = now.getTime() - signalDate.getTime();
  if (delta < 0) return 100; // future-dated → treat as most recent
  if (delta < RECENCY_30D_MS) return 100;
  if (delta < RECENCY_180D_MS) return 50;
  if (delta < RECENCY_365D_MS) return 10;
  return 0;
}

function beneficiaryInterestComponent(
  beneficiary: string | null | undefined,
  ctx: ScoreContext,
): number {
  const key = normalizeBeneficiary(beneficiary);
  if (key.length === 0) return 0;
  const interestCount = ctx.beneficiaryInterest.get(key) ?? 0;
  return Math.min(interestCount / 5, 1) * 20;
}

function evidenceCompletenessComponent(input: ScoreCandidateInput): number {
  const hasQuote = Boolean(input.evidenceQuote);
  const hasAmount = Boolean(input.amountUsd && input.amountUsd > 0);
  const hasDate = Boolean(input.signalDate);
  const proper = isValidBeneficiary(input.beneficiary);
  const commonNoun = Boolean(
    input.beneficiary && input.beneficiary.trim().length > 0 && !proper,
  );
  const completeness =
    (hasQuote ? 0.25 : 0) +
    (hasAmount ? 0.25 : 0) +
    (proper ? 0.25 : commonNoun ? 0.125 : 0) +
    (hasDate ? 0.25 : 0);
  return completeness * 20;
}

function attributionComponent(
  input: ScoreCandidateInput,
  ctx: ScoreContext,
): number {
  // Off-domain candidates never crown — attribution is 0 regardless of host.
  if (!input.onDomain) return 0;
  const advertiserHost = ctx.advertiserHost;
  if (!advertiserHost) return 0;
  const sourceHost = hostOf(input.sourceUrl);
  if (sourceHost && sourceHost === advertiserHost) return 25;
  if (sourceHost && sourceHost.endsWith(`.${advertiserHost}`)) return 25;
  const stem = brandStem(advertiserHost);
  if (stem.length >= BRAND_STEM_MIN_LEN) {
    if (sourceHost.includes(stem)) return 12;
    const path = pathOf(input.sourceUrl);
    if (path.includes(`/${stem}`) || path.includes(`-${stem}`)) return 12;
  }
  return 0;
}

/**
 * Score one candidate with the six-component formula. Pure — the only inputs
 * are the candidate and the per-job scoring context (advertiser host +
 * beneficiary-interest map). `now` is injectable for deterministic recency.
 */
export function scoreCandidate(
  input: ScoreCandidateInput,
  ctx: ScoreContext,
  now: Date = new Date(),
): ScoreResult {
  const components: ScoreComponents = {
    amount: amountComponent(input.amountUsd),
    attendance: attendanceComponent(input.attendees),
    recency: recencyComponent(input.signalDate, now),
    beneficiaryInterest: beneficiaryInterestComponent(input.beneficiary, ctx),
    evidenceCompleteness: evidenceCompletenessComponent(input),
    attribution: attributionComponent(input, ctx),
  };
  const total =
    components.amount +
    components.attendance +
    components.recency +
    components.beneficiaryInterest +
    components.evidenceCompleteness +
    components.attribution;
  return { components, total };
}

/**
 * Build the per-job beneficiary-interest map: normalized beneficiary → count of
 * candidates sharing it. Empty/blank beneficiaries are not counted.
 */
export function buildBeneficiaryInterest(
  beneficiaries: (string | null | undefined)[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const b of beneficiaries) {
    const key = normalizeBeneficiary(b);
    if (key.length === 0) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}
