import type {
  DatedFact,
  DroppedItem,
  FactLedger,
  LedgerClaim,
  LedgerInput,
  LedgerPageInput,
  LedgerQuote,
  ThinLimits,
} from "./ledger.types";
import { extractFigures, findFigureConflicts } from "./figures";
import { parseQuote, quoteContext, surnameOf } from "./quote-speaker";
import { findSourceSpan } from "./source-span";
import { addDays, contentWords, normalizeText } from "./text-utils";

export const DEFAULT_THIN_LIMITS: ThinLimits = {
  maxCauseClaims: 6,
  minNonSponsorVoices: 1,
};
export const PUBLICATION_WINDOW_DAYS = 30;

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const OFFER_WORDS =
  /\b(deadline|apply|applications?|register|registration|sign[- ]?up|tickets?|(?:through|until) (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d)|ends?|ending|expires?|by (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|nominat\w*|enter|entries|rsvp|match(?:ing|es)? (?:gifts?|donations?)|sale|bring|drop[- ]off|(?:food|toy|coat|blood|school supply) drive|donate money)\b/i;

/** First full date in the text (ISO, "October 15, 2026" or "Oct. 15, 2026"), or null. */
export function findDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i,
  );
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
  return `${m[3]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

function mentionsAlias(text: string, aliases: string[]): boolean {
  const t = normalizeText(text).toLowerCase();
  return aliases.some(
    (a) => a.trim() && t.includes(normalizeText(a).toLowerCase()),
  );
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const TITLE_WORDS = String.raw`(?:Director|Executive|Manager|President|Vice|CEO|Chief|Board|Chair|Principal|Superintendent|Officer|Founder|Coordinator|Pastor|Mayor|Senator|Commissioner)\b`;

interface SpeakerInfo {
  fullName: string;
  roles: string[];
}

/** Full names and roles for each speaker surname, from quote attributions and page text. */
function speakerRegistry(
  parsed: { speaker: string; role: string | null }[],
  pages: LedgerPageInput[],
): Map<string, SpeakerInfo> {
  const registry = new Map<string, SpeakerInfo>();
  const text = pages
    .map((p) => normalizeText(p.markdown ?? "").replace(/"[^"]*"/g, " | "))
    .join(" | ");
  for (const { speaker, role } of parsed) {
    const surname = surnameOf(speaker);
    const info = registry.get(surname) ?? { fullName: speaker, roles: [] };
    if (speaker.split(" ").length > info.fullName.split(" ").length)
      info.fullName = speaker;
    if (role) info.roles.push(role);
    registry.set(surname, info);
  }
  for (const [surname, info] of registry) {
    const re = new RegExp(
      `((?:(?!${TITLE_WORDS})[A-Z][a-zA-Z'\\-]+\\s+){0,2})${escapeRe(surname)},\\s*([^.|]{3,120}?)(?:,\\s*(?:said|says)|\\.|\\|)`,
      "g",
    );
    for (const m of text.matchAll(re)) {
      const full = `${m[1]}${surname}`.trim();
      if (
        full.split(" ").length > info.fullName.split(" ").length &&
        !/^(The|A|An)\b/.test(full)
      )
        info.fullName = full;
      info.roles.push(m[2].trim());
    }
  }
  return registry;
}

// why: one press release is often stored twice (www and bare host, a tracking query, a trailing slash).
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()])
      if (/^(utm_|fbclid|gclid)/i.test(key)) u.searchParams.delete(key);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const query = u.searchParams.toString();
    return `${host}${u.pathname.replace(/\/+$/, "")}${query ? `?${query}` : ""}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

/** Keeps one copy of each page, primary pages first. */
export function dedupePages<T extends LedgerPageInput>(pages: T[]): T[] {
  const ordered = [...pages].sort((a, b) =>
    a.role === b.role ? 0 : a.role === "primary" ? -1 : 1,
  );
  const seen = new Set<string>();
  return ordered.filter((p) => {
    const key = canonicalUrl(p.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface DedupeEntry {
  id: string;
  words: Set<string>;
  figures: string;
}

function dedupeEntry(id: string, text: string): DedupeEntry {
  return {
    id,
    words: new Set(contentWords(text)),
    figures: [...new Set(extractFigures(text).map((f) => f.value))]
      .sort((a, b) => a - b)
      .join(","),
  };
}

const NEAR_DUPLICATE_OVERLAP = 0.8;
const MIN_DEDUPE_WORDS = 4;

/** Overlap of the smaller word set with the larger one, 0..1. */
function overlap(a: Set<string>, b: Set<string>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  if (!small.size) return 0;
  let shared = 0;
  for (const w of small) if (large.has(w)) shared++;
  return shared / small.size;
}

// why: two facts with different figures ("$315,000 in 2023", "$372,000 in 2024") are never one fact.
function findNearDuplicate(
  entry: DedupeEntry,
  kept: DedupeEntry[],
): DedupeEntry | undefined {
  if (entry.words.size < MIN_DEDUPE_WORDS) return undefined;
  return kept.find(
    (k) =>
      k.figures === entry.figures &&
      k.words.size >= MIN_DEDUPE_WORDS &&
      overlap(entry.words, k.words) >= NEAR_DUPLICATE_OVERLAP,
  );
}

function buildClaims(
  pages: LedgerPageInput[],
  aliases: string[],
  dropped: DroppedItem[],
  quotes: LedgerQuote[],
): LedgerClaim[] {
  const claims: LedgerClaim[] = [];
  const kept: DedupeEntry[] = [];
  const quoteEntries = quotes.map((q) => dedupeEntry(q.id, q.text));
  const ordered = [...pages].sort((a, b) =>
    a.role === b.role ? 0 : a.role === "primary" ? -1 : 1,
  );
  const push = (
    page: LedgerPageInput,
    kind: LedgerClaim["kind"],
    text: string,
    date: string | null,
    beneficiary: string | null,
  ) => {
    const clean = normalizeText(text);
    const id = `C${claims.length + 1}`;
    const entry = dedupeEntry(id, clean);
    if (!entry.words.size) return;
    const asQuote = findNearDuplicate(entry, quoteEntries);
    const asClaim = asQuote ? undefined : findNearDuplicate(entry, kept);
    if (asQuote || asClaim) {
      dropped.push({
        kind: "claim",
        text: clean,
        sourceUrl: page.url,
        reason: asQuote ? "duplicate_of_quote" : "duplicate",
        duplicateOf: (asQuote ?? asClaim)?.id,
      });
      return;
    }
    kept.push(entry);
    claims.push({
      id,
      kind,
      text: clean,
      sourceUrl: page.url,
      pageRole: page.role,
      span: findSourceSpan(clean, page.markdown),
      date: date ?? findDate(clean),
      figures: extractFigures(clean),
      beneficiary,
      mentionsSponsor: mentionsAlias(clean, aliases),
    });
  };
  for (const page of ordered) {
    for (const impact of page.impacts) {
      const text =
        impact.evidenceQuote ??
        [impact.activity, impact.beneficiary].filter(Boolean).join(" for ");
      if (text)
        push(
          page,
          "impact",
          text,
          impact.eventDate?.slice(0, 10) ?? null,
          impact.beneficiary,
        );
    }
    for (const fact of page.facts) push(page, "fact", fact, null, null);
  }
  return claims;
}

function buildQuotes(
  pages: LedgerPageInput[],
  aliases: string[],
  dropped: DroppedItem[],
): LedgerQuote[] {
  const kept: {
    page: LedgerPageInput;
    text: string;
    speaker: string;
    role: string | null;
  }[] = [];
  const entries: DedupeEntry[] = [];
  for (const page of pages) {
    for (const raw of page.quotes) {
      const bare = normalizeText(raw).replace(/"/g, "").slice(0, 80);
      const parsed = parseQuote(raw, quoteContext(page.markdown, bare));
      if (parsed.reason !== "ok" || !parsed.speaker) {
        dropped.push({
          kind: "quote",
          text: normalizeText(raw),
          sourceUrl: page.url,
          reason: parsed.reason === "ok" ? "no_speaker" : parsed.reason,
        });
        continue;
      }
      const entry = dedupeEntry(`Q${kept.length + 1}`, parsed.text);
      // why: a trimmed copy of a quote drops a figure, so quotes match on words only.
      const index = entries.findIndex(
        (k) =>
          [...k.words].sort().join(" ") === [...entry.words].sort().join(" ") ||
          (Math.min(k.words.size, entry.words.size) >= MIN_DEDUPE_WORDS &&
            overlap(entry.words, k.words) >= NEAR_DUPLICATE_OVERLAP),
      );
      if (index >= 0) {
        const longer = parsed.text.length > kept[index].text.length;
        dropped.push({
          kind: "quote",
          text: longer ? kept[index].text : parsed.text,
          sourceUrl: longer ? kept[index].page.url : page.url,
          reason: "duplicate",
          duplicateOf: entries[index].id,
        });
        if (longer) {
          kept[index] = {
            page,
            text: parsed.text,
            speaker: parsed.speaker,
            role: parsed.role,
          };
          entries[index] = { ...entry, id: entries[index].id };
        }
        continue;
      }
      entries.push(entry);
      kept.push({
        page,
        text: parsed.text,
        speaker: parsed.speaker,
        role: parsed.role,
      });
    }
  }
  const registry = speakerRegistry(kept, pages);
  return kept.map((q, i) => {
    const info = registry.get(surnameOf(q.speaker));
    const roles = info?.roles ?? [];
    return {
      id: `Q${i + 1}`,
      text: q.text,
      speaker: info?.fullName ?? q.speaker,
      surname: surnameOf(q.speaker),
      role: q.role ?? roles[0] ?? null,
      isSponsorVoice:
        roles.some((r) => mentionsAlias(r, aliases)) ||
        mentionsAlias(q.speaker, aliases),
      sourceUrl: q.page.url,
      span: findSourceSpan(q.text, q.page.markdown),
    };
  });
}

function buildDatedFacts(
  claims: LedgerClaim[],
  generationDate: string,
  publicationDate: string,
): DatedFact[] {
  return claims
    .filter((c): c is LedgerClaim & { date: string } => c.date !== null)
    .map((c) => ({
      claimId: c.id,
      date: c.date,
      status:
        c.date < generationDate
          ? "past"
          : c.date <= publicationDate
            ? "window"
            : "future",
      isOffer: OFFER_WORDS.test(c.text),
    }));
}

/** Builds the fact ledger for one story from its stored page-story extraction. */
export function buildFactLedger(input: LedgerInput): FactLedger {
  const generationDate = input.generationDate.slice(0, 10);
  const publicationDate = (
    input.publicationDate ?? addDays(generationDate, PUBLICATION_WINDOW_DAYS)
  ).slice(0, 10);
  const aliases = [input.sponsorName, ...input.sponsorAliases].filter(
    (a) => a.trim().length > 1,
  );
  const dropped: DroppedItem[] = [];
  const pages = dedupePages(input.pages);
  const quotes = buildQuotes(pages, aliases, dropped);
  const claims = buildClaims(pages, aliases, dropped, quotes);
  const limits = input.thinLimits ?? DEFAULT_THIN_LIMITS;

  const nonSponsorQuotes = quotes.filter((q) => !q.isSponsorVoice);
  const namedNonSponsorPeople = new Set(
    nonSponsorQuotes.map((q) => q.speaker.toLowerCase()),
  ).size;
  const causeClaims = claims.length;
  const reasons: string[] = [];
  if (causeClaims <= limits.maxCauseClaims)
    reasons.push(`${causeClaims} claims (limit ${limits.maxCauseClaims})`);
  if (
    namedNonSponsorPeople + nonSponsorQuotes.length <
    limits.minNonSponsorVoices
  )
    reasons.push("no voice outside the sponsor");

  return {
    sponsorName: input.sponsorName,
    sponsorAliases: aliases,
    generationDate,
    publicationDate,
    claims,
    quotes,
    dropped,
    conflicts: findFigureConflicts(claims),
    datedFacts: buildDatedFacts(claims, generationDate, publicationDate),
    counts: {
      claims: claims.length,
      causeClaims,
      quotes: quotes.length,
      nonSponsorQuotes: nonSponsorQuotes.length,
      namedNonSponsorPeople,
      droppedQuotes: dropped.filter((d) => d.kind === "quote").length,
    },
    thin: { isThin: reasons.length > 0, reasons },
  };
}

/** Recounts cause claims once the labeller has marked company material. */
export function applyMaterialLabels(
  ledger: FactLedger,
  companyClaimIds: Set<string>,
  limits = DEFAULT_THIN_LIMITS,
): FactLedger {
  const causeClaims = ledger.claims.filter(
    (c) => !companyClaimIds.has(c.id),
  ).length;
  const reasons = ledger.thin.reasons.filter(
    (r) => !r.includes("claims (limit"),
  );
  if (causeClaims <= limits.maxCauseClaims)
    reasons.unshift(
      `${causeClaims} cause claims (limit ${limits.maxCauseClaims})`,
    );
  return {
    ...ledger,
    counts: { ...ledger.counts, causeClaims },
    thin: { isThin: reasons.length > 0, reasons },
  };
}
