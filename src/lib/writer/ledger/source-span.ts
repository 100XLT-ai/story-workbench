import type { SourceSpan } from "./ledger.types";
import { contentWords, normalizeText, splitSentences } from "./text-utils";

const FUZZY_FLOOR = 0.6;

/** Finds the page words a claim comes from: an exact copy, or the closest sentence. */
export function findSourceSpan(
  claim: string,
  markdown: string | null,
): SourceSpan {
  if (!markdown || !claim.trim())
    return { text: null, match: "none", score: 0 };
  const page = normalizeText(markdown);
  const pieces = normalizeText(claim)
    .split(/\s?\.\.\.\s?|…/)
    .map((p) => p.trim().replace(/^"|"$/g, ""))
    .filter((p) => p.length > 12);
  if (pieces.length && pieces.every((p) => page.includes(p))) {
    return { text: pieces.join(" ... "), match: "exact", score: 1 };
  }
  const wanted = new Set(contentWords(claim));
  if (!wanted.size) return { text: null, match: "none", score: 0 };
  let best: SourceSpan = { text: null, match: "none", score: 0 };
  const sentences = splitSentences(markdown);
  for (let i = 0; i < sentences.length; i++) {
    for (const window of [
      sentences[i],
      `${sentences[i]} ${sentences[i + 1] ?? ""}`.trim(),
    ]) {
      const have = new Set(contentWords(window));
      let hit = 0;
      for (const w of wanted) if (have.has(w)) hit++;
      const score = hit / wanted.size;
      if (score > best.score + 0.001)
        best = { text: window, match: "fuzzy", score };
    }
  }
  return best.score >= FUZZY_FLOOR
    ? { ...best, score: Math.round(best.score * 100) / 100 }
    : { text: null, match: "none", score: Math.round(best.score * 100) / 100 };
}
