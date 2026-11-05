// Ported from longtale-core at 136fa4ac, apps/api/src/api/modules/story/ad-copy/:
//   basic-business.signal-source.ts (resolveBasicBusinessFields, formatBasicBusinessBlock)
//   brand-voice.signal-source.ts (load, without the database read)
//   crawl-facts.signal-source.ts (aggregatePageExtracts, formatCauseCandidateBlock, load)
//   copy-context-composer.ts (BlendedCopyComposer.compose)
// The database reads are replaced by the snapshot values the story inputs hold.

export interface OrgFields {
  name: string;
  industry: string | null;
  businessType: string | null;
  website: string | null;
  description: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  businessAddress: string | null;
}

export interface BasicBusinessFields {
  name: string;
  category: string;
  location: string;
  description: string | null;
  website: string | null;
}

export function resolveBasicBusinessFields(org: OrgFields): BasicBusinessFields {
  const category = [org.industry, org.businessType]
    .filter((part): part is string => !!part && part.trim().length > 0)
    .join(" / ");
  const location = org.businessAddress?.trim()
    ? org.businessAddress.trim()
    : [org.city, org.state, org.country]
        .filter((part): part is string => !!part && part.trim().length > 0)
        .join(", ");
  return {
    name: org.name,
    category,
    location,
    description: org.description ?? null,
    website: org.website ?? null,
  };
}

export function formatBasicBusinessBlock(fields: BasicBusinessFields): string {
  const lines = [`name: ${fields.name}`];
  if (fields.category) lines.push(`category: ${fields.category}`);
  if (fields.location) lines.push(`location: ${fields.location}`);
  if (fields.description) lines.push(`description: ${fields.description}`);
  if (fields.website) lines.push(`website: ${fields.website}`);
  return `BASIC BUSINESS:\n${lines.join("\n")}`;
}

export interface BrandVoiceFields {
  brandPersonalityTraits: string[];
  toneOfVoice: string | null;
  brandVoice: string | null;
}

/** `BrandVoiceSignalSource.load` on the snapshot's brand profile (null when the org has none). */
export function brandVoiceBlock(profile: BrandVoiceFields | null): string | null {
  if (!profile) return null;
  const lines: string[] = [];
  const traits = profile.brandPersonalityTraits.filter((t) => t.trim().length > 0);
  if (traits.length > 0) lines.push(`personality: ${traits.join(", ")}`);
  const tone = profile.toneOfVoice?.trim();
  if (tone) lines.push(`tone of voice: ${tone}`);
  const voice = profile.brandVoice?.trim();
  if (voice) lines.push(`brand voice: ${voice}`);
  if (lines.length === 0) return null;
  return `BRAND VOICE:\n${lines.join("\n")}`;
}

const MAX_FACTS_CHARS = 700;
const MAX_QUOTES_CHARS = 500;
const MAX_SUMMARY_CHARS = 600;
const MAX_ANGLE_FIELD_CHARS = 500;
const MAX_LEAVES_PER_ROW = 20;
export const MAX_PAGE_EXTRACT_ROWS = 5;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function collectStringLeaves(value: unknown, limit: number): string[] {
  const out: string[] = [];
  const visit = (node: unknown): void => {
    if (out.length >= limit) return;
    if (typeof node === "string") {
      const trimmed = node.trim();
      if (trimmed) out.push(trimmed);
    } else if (Array.isArray(node)) {
      for (const item of node) {
        if (out.length >= limit) break;
        visit(item);
      }
    } else if (isRecord(node)) {
      for (const val of Object.values(node)) {
        if (out.length >= limit) break;
        visit(val);
      }
    }
  };
  visit(value);
  return out;
}

function capText(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

export interface CrawlRow {
  facts: unknown;
  quotes: unknown;
  summary: string | null;
}

export interface CauseCandidateAngle {
  description: string | null;
  beneficiary: string | null;
  evidenceQuote: string | null;
  attribution: string | null;
}

/** `CrawlFactsSignalSource.load`: the job's first 5 page extracts plus the story's candidate. */
export function crawlFactsBlock(rows: CrawlRow[], candidate: CauseCandidateAngle | null): string | null {
  const lines: string[] = [];
  if (rows.length > 0) {
    const factsLeaves: string[] = [];
    const quotesLeaves: string[] = [];
    const summaries: string[] = [];
    for (const row of rows) {
      if (factsLeaves.length < MAX_LEAVES_PER_ROW) factsLeaves.push(...collectStringLeaves(row.facts, MAX_LEAVES_PER_ROW));
      if (quotesLeaves.length < MAX_LEAVES_PER_ROW) quotesLeaves.push(...collectStringLeaves(row.quotes, MAX_LEAVES_PER_ROW));
      if (row.summary?.trim()) summaries.push(row.summary.trim());
    }
    const facts = capText(factsLeaves.join("; "), MAX_FACTS_CHARS);
    const quotes = capText(quotesLeaves.join("; "), MAX_QUOTES_CHARS);
    const summary = capText(summaries.join(" "), MAX_SUMMARY_CHARS);
    if (summary) lines.push(`summary: ${summary}`);
    if (facts) lines.push(`facts: ${facts}`);
    if (quotes) lines.push(`quotes: ${quotes}`);
  }
  if (candidate) {
    if (candidate.description?.trim())
      lines.push(`story angle: ${capText(candidate.description.trim(), MAX_ANGLE_FIELD_CHARS)}`);
    if (candidate.beneficiary?.trim()) lines.push(`beneficiary: ${candidate.beneficiary.trim()}`);
    if (candidate.evidenceQuote?.trim())
      lines.push(`evidence: "${capText(candidate.evidenceQuote.trim(), MAX_ANGLE_FIELD_CHARS)}"`);
    if (candidate.attribution?.trim()) lines.push(`attribution: ${candidate.attribution.trim()}`);
  }
  if (lines.length === 0) return null;
  return `CRAWL FACTS & STORY ANGLE:\n${lines.join("\n")}`;
}

/** `BlendedCopyComposer.compose`. */
export function composeBlocks(blocks: Array<string | null>): string {
  return blocks
    .map((b) => b?.trim())
    .filter((b): b is string => !!b && b.length > 0)
    .join("\n\n");
}
