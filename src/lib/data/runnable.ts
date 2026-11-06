// The v3 runnable rule (DECISIONS D42). Pure, so the import, the app and the
// tests share one copy.

/** A page has text when its scraped markdown holds a character that is not white space. */
export function hasText(page: { markdown?: string | null }): boolean {
  return /\S/.test(page.markdown ?? "");
}

export interface LedgerCounts {
  factCount: number;
  impactCount: number;
  quoteCount: number;
}

/**
 * v3 is runnable when the story's own fact ledger is not empty. The v3 writer
 * reads only ledger claims (facts, impacts) and quotes; it never sends the raw
 * page text to a model.
 */
export function runnableV3(c: LedgerCounts): boolean {
  return c.factCount + c.impactCount + c.quoteCount > 0;
}

export interface StoryEvidence extends LedgerCounts {
  pageCount: number;
  textPageCount: number;
}

/** Why v3 cannot run the story, in words, or null when it can. */
export function v3BlockReason(s: StoryEvidence): string | null {
  if (runnableV3(s)) return null;
  if (s.pageCount === 0) return "it has no page";
  if (s.textPageCount === 0) return s.pageCount === 1 ? "its page was never scraped" : "its pages were never scraped";
  if (s.textPageCount < s.pageCount)
    return `${s.pageCount - s.textPageCount} of its ${s.pageCount} pages were never scraped, and the others give no facts, impacts or quotes`;
  return s.pageCount === 1
    ? "its page has text, but the extractor found no facts, impacts or quotes on it"
    : "its pages have text, but the extractor found no facts, impacts or quotes on them";
}
