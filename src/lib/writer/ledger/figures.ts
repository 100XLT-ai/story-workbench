import type { Figure, FigureConflict, LedgerClaim } from "./ledger.types";
import { normalizeText } from "./text-utils";

const SCALE: Record<string, number> = {
  thousand: 1e3,
  k: 1e3,
  million: 1e6,
  m: 1e6,
  billion: 1e9,
  b: 1e9,
};
const NOISE_NOUNS = new Set(
  "the a an more than over about nearly almost each new".split(" "),
);
const STOP_NOUNS = new Set(
  "and or of to in for from on at with by per as".split(" "),
);
export const MAX_CONFLICT_RATIO = 2;
const UNIT_WORDS: Record<string, string> = {
  percent: "%",
  "per cent": "%",
  dollars: "USD",
};

function singular(word: string): string {
  const w = word.toLowerCase().replace(/[^a-z-]/g, "");
  if (w.endsWith("ies") && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith("ses") || w.endsWith("xes")) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3)
    return w.slice(0, -1);
  return w;
}

const MONEY_VERBS: Record<string, string> = {
  invested: "invest",
  invests: "invest",
  raised: "raise",
  raises: "raise",
  donated: "donate",
  donates: "donate",
  gave: "give",
  gives: "give",
  granted: "grant",
  grants: "grant",
  awarded: "award",
  awards: "award",
  committed: "commit",
  commits: "commit",
  pledged: "pledge",
  pledges: "pledge",
  contributed: "contribute",
};

function verbBefore(before: string): string | null {
  const words = before
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(-5);
  for (let i = words.length - 1; i >= 0; i--)
    if (MONEY_VERBS[words[i]]) return MONEY_VERBS[words[i]];
  return null;
}

function nounAfter(rest: string): string | null {
  const words = rest.trim().split(/\s+/).slice(0, 4);
  for (const word of words) {
    if (/\d/.test(word)) return null;
    const w = word
      .toLowerCase()
      .replace(/[^a-z-]/g, "")
      .replace(/^-+/, "");
    if (STOP_NOUNS.has(w)) return null;
    if (!w || NOISE_NOUNS.has(w)) continue;
    if (
      /^(special|annual|total|additional|individual|local|grant|matching)$/.test(
        w,
      )
    )
      continue;
    return singular(w);
  }
  return null;
}

/** Numbers with their unit and counted noun; years and dates are skipped. */
export function extractFigures(text: string): Figure[] {
  const t = normalizeText(text);
  const re =
    /(\$)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(\s?(?:thousand|million|billion|[kKmMbB])\b)?(\s?%|\s(?:percent|per cent|dollars)\b)?/g;
  const figures: Figure[] = [];
  for (const m of t.matchAll(re)) {
    const [raw, dollar, digits, scaleRaw, unitRaw] = m;
    const at = m.index ?? 0;
    const before = t.slice(Math.max(0, at - 12), at);
    const wideBefore = t.slice(Math.max(0, at - 50), at);
    const after = t.slice(at + raw.length);
    let value = Number(digits.replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    const isYear =
      !dollar &&
      !scaleRaw &&
      !unitRaw &&
      /^\d{4}$/.test(digits) &&
      value >= 1900 &&
      value <= 2100;
    const isDate =
      /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*$/i.test(
        before,
      ) || /^(?:st|nd|rd|th)\b/.test(after);
    if (isYear || isDate || /[\d/-]$/.test(before) || /^[/-]\d|^\(/.test(after))
      continue;
    if (scaleRaw) value *= SCALE[scaleRaw.trim().toLowerCase()] ?? 1;
    const unitWord = unitRaw?.trim().toLowerCase();
    const unit =
      dollar || unitWord === "dollars"
        ? "USD"
        : unitWord
          ? (UNIT_WORDS[unitWord] ?? "%")
          : "count";
    const after1 = nounAfter(after);
    const noun = after1 ?? (unit === "USD" ? verbBefore(wideBefore) : null);
    figures.push({
      raw: raw.trim(),
      value,
      unit: unit === "count" ? (noun ?? "count") : unit,
      noun,
    });
  }
  return figures;
}

function yearsOf(claim: LedgerClaim): Set<string> {
  const years = new Set<string>();
  for (const m of claim.text.matchAll(/\b(19\d{2}|20\d{2})\b/g))
    years.add(m[1]);
  if (claim.date) years.add(claim.date.slice(0, 4));
  return years;
}

/** Same-noun figures with different values across claims (review Fix 2). */
export function findFigureConflicts(claims: LedgerClaim[]): FigureConflict[] {
  const byKey = new Map<
    string,
    { value: number; raw: string; claim: LedgerClaim }[]
  >();
  for (const claim of claims) {
    for (const f of claim.figures) {
      if (!f.noun) continue;
      const key = f.unit === f.noun ? f.noun : `${f.unit}:${f.noun}`;
      const list = byKey.get(key) ?? [];
      list.push({ value: f.value, raw: f.raw, claim });
      byKey.set(key, list);
    }
  }
  const conflicts: FigureConflict[] = [];
  for (const [key, list] of byKey) {
    const distinct = [...new Map(list.map((v) => [v.value, v])).values()];
    if (distinct.length < 2) continue;
    const claimIds = new Set(distinct.map((v) => v.claim.id));
    if (claimIds.size < 2) continue;
    const yearSets = distinct.map((v) => [...yearsOf(v.claim)].join(","));
    const series =
      new Set(yearSets).size === distinct.length && yearSets.every((y) => y);
    // why: values more than twice apart count different scopes (one campaign vs all years), not one thing told twice.
    const close = distinct.filter((v) =>
      distinct.some(
        (w) =>
          w !== v &&
          w.claim.id !== v.claim.id &&
          v.value > 0 &&
          w.value > 0 &&
          Math.max(v.value, w.value) / Math.min(v.value, w.value) <=
            MAX_CONFLICT_RATIO,
      ),
    );
    const kind = series ? "series" : close.length ? "conflict" : "scope";
    const shown = kind === "conflict" ? close : distinct;
    conflicts.push({
      key,
      kind,
      values: shown.map((v) => ({
        value: v.value,
        raw: v.raw,
        claimId: v.claim.id,
      })),
    });
  }
  return conflicts;
}
