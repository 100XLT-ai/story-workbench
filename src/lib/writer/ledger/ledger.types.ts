/**
 * The fact ledger: what the story writer may say, built in code from the
 * stored discovery v2 page-story extraction (review "A cheaper design", Fix 2).
 * See .plan/story-writer-test/01-decisions.md.
 */

export interface LedgerImpactInput {
  activity: string | null;
  beneficiary: string | null;
  eventDate: string | null;
  evidenceQuote: string | null;
  valueRaw: number | null;
  valueUnit: string | null;
  typePrimary: string | null;
}

export interface LedgerPageInput {
  pageId: string;
  url: string;
  title: string | null;
  role: "primary" | "support";
  facts: string[];
  quotes: string[];
  impacts: LedgerImpactInput[];
  markdown: string | null;
  publishedDate: string | null;
}

export interface ThinLimits {
  /** A story with this many cause claims or fewer is thin. */
  maxCauseClaims: number;
  /** A story with fewer non-sponsor voices (named people + quotes) than this is thin. */
  minNonSponsorVoices: number;
}

export interface LedgerInput {
  sponsorName: string;
  /** Sponsor, short name, own programs and foundations: a speaker tied to one is a sponsor voice. */
  sponsorAliases: string[];
  /** ISO date (YYYY-MM-DD). */
  generationDate: string;
  /** ISO date; defaults to generation date + 30 days. */
  publicationDate?: string;
  pages: LedgerPageInput[];
  thinLimits?: ThinLimits;
}

export type SpanMatch = "exact" | "fuzzy" | "none";

export interface SourceSpan {
  text: string | null;
  match: SpanMatch;
  /** Content-word overlap, 0..1 (1 for exact). */
  score: number;
}

export interface Figure {
  raw: string;
  value: number;
  /** "USD", "%" or the singular noun after the number ("county"). */
  unit: string;
  /** The noun the figure counts or pays for, when code can tell; null otherwise. */
  noun: string | null;
}

export type ClaimKind = "fact" | "impact";

export interface LedgerClaim {
  id: string;
  kind: ClaimKind;
  text: string;
  sourceUrl: string;
  pageRole: "primary" | "support";
  span: SourceSpan;
  /** ISO date stated for the claim, or null. */
  date: string | null;
  figures: Figure[];
  beneficiary: string | null;
  /** True when the sponsor name or an alias appears in the claim. */
  mentionsSponsor: boolean;
}

export interface LedgerQuote {
  id: string;
  /** The quoted words only, without the attribution. */
  text: string;
  speaker: string;
  surname: string;
  role: string | null;
  isSponsorVoice: boolean;
  sourceUrl: string;
  span: SourceSpan;
}

export interface DroppedItem {
  kind: "quote" | "claim";
  text: string;
  sourceUrl: string;
  reason:
    | "no_speaker"
    | "pronoun_speaker"
    | "duplicate"
    | "duplicate_of_quote"
    | "headline_or_dateline"
    | "empty";
  /** The kept claim or quote ID this item repeats. */
  duplicateOf?: string;
}

export interface FigureConflict {
  /** unit + noun the two values share, e.g. "USD:gift" or "meal". */
  key: string;
  values: { value: number; raw: string; claimId: string }[];
  /** conflict: nothing explains the gap; series: different years; scope: values more than twice apart. */
  kind: "conflict" | "series" | "scope";
}

export type DateStatus = "past" | "window" | "future";

export interface DatedFact {
  claimId: string;
  date: string;
  /** past: before generation; window: between generation and publication; future: after publication. */
  status: DateStatus;
  /** The claim reads as an offer, deadline or sign-up (it can expire). */
  isOffer: boolean;
}

export interface LedgerCounts {
  claims: number;
  causeClaims: number;
  quotes: number;
  nonSponsorQuotes: number;
  namedNonSponsorPeople: number;
  droppedQuotes: number;
}

export interface ThinFlag {
  isThin: boolean;
  reasons: string[];
}

export interface FactLedger {
  sponsorName: string;
  sponsorAliases: string[];
  generationDate: string;
  publicationDate: string;
  claims: LedgerClaim[];
  quotes: LedgerQuote[];
  dropped: DroppedItem[];
  conflicts: FigureConflict[];
  datedFacts: DatedFact[];
  counts: LedgerCounts;
  thin: ThinFlag;
}
