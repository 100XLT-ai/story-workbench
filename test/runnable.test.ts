import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { buildFactLedger } from "../src/lib/writer/ledger/fact-ledger";
import { ledgerInputFor, type LoadedPage } from "../src/lib/writer/harness";
import { hasText, runnableV3, v3BlockReason } from "../src/lib/data/runnable";
import { FIELD_BY_NAME, FilterError, whereFor } from "../src/lib/data/stories";
import { parseFilter } from "../src/lib/engine/filter";

const page = (over: Partial<LoadedPage>): LoadedPage => ({
  pageId: "1",
  url: "https://example.org/a",
  title: null,
  role: "primary",
  facts: [],
  quotes: [],
  impacts: [],
  markdown: null,
  publishedDate: null,
  ...over,
});

/** The import's path: pages → ledger → counts → rule. */
function evidenceOf(pages: LoadedPage[]) {
  const ledger = buildFactLedger(ledgerInputFor("Acme", [], [], "2026-10-29", pages));
  return {
    pageCount: pages.length,
    textPageCount: pages.filter(hasText).length,
    factCount: ledger.claims.filter((c) => c.kind === "fact").length,
    impactCount: ledger.claims.filter((c) => c.kind === "impact").length,
    quoteCount: ledger.quotes.length,
  };
}

describe("runnable_v3", () => {
  it("is false for a story whose only page was never scraped", () => {
    const e = evidenceOf([page({ url: "https://www.iheart.com/x" })]);
    expect(e.textPageCount).toBe(0);
    expect(runnableV3(e)).toBe(false);
    expect(v3BlockReason(e)).toBe("its page was never scraped");
  });

  it("is true for a story with a scraped page that has facts", () => {
    const md = "Acme gave $50,000 to the Food Bank in 2025 to feed 2,000 families in Spokane.";
    const e = evidenceOf([page({ markdown: md, facts: ["Acme gave $50,000 to the Food Bank in 2025 to feed 2,000 families."] })]);
    expect(e.textPageCount).toBe(1);
    expect(e.factCount).toBeGreaterThan(0);
    expect(runnableV3(e)).toBe(true);
    expect(v3BlockReason(e)).toBeNull();
  });

  it("is false for scraped text with nothing extracted, and says why", () => {
    const e = evidenceOf([page({ markdown: "Some page text with no extracted facts." })]);
    expect(e.textPageCount).toBe(1);
    expect(runnableV3(e)).toBe(false);
    expect(v3BlockReason(e)).toMatch(/has text, but the extractor found no facts/);
  });

  it("is false with no page", () => {
    expect(v3BlockReason({ pageCount: 0, textPageCount: 0, factCount: 0, impactCount: 0, quoteCount: 0 })).toBe("it has no page");
  });

  it("counts impacts and quotes as ledger content", () => {
    expect(runnableV3({ factCount: 0, impactCount: 7, quoteCount: 0 })).toBe(true);
    expect(runnableV3({ factCount: 0, impactCount: 0, quoteCount: 1 })).toBe(true);
  });

  it("treats white space as no text", () => {
    expect(hasText({ markdown: " \n\t " })).toBe(false);
    expect(hasText({ markdown: null })).toBe(false);
    expect(hasText({ markdown: "x" })).toBe(true);
  });
});

describe("new fields in the filter format", () => {
  const dialect = new PgDialect();
  const render = (f: unknown) => {
    const w = whereFor(parseFilter(f));
    if (!w) throw new Error("no where");
    return dialect.sqlToQuery(w);
  };
  const NEW = [
    "text_page_count",
    "score_attribution",
    "score_evidence_completeness",
    "score_beneficiary_interest",
    "score_amount",
    "score_recency",
    "score_attendance",
  ];

  it("registers each new field as a number", () => {
    for (const name of NEW) expect(FIELD_BY_NAME.get(name)?.type, name).toBe("number");
    for (const name of ["tier_impact", "tier_market", "tier_image", "deal_grade", "confidence"]) expect(FIELD_BY_NAME.has(name), name).toBe(true);
  });

  it("turns each new field into SQL on its own column", () => {
    for (const name of NEW) {
      const q = render([{ field: name, op: "gte", value: "2" }]);
      expect(q.sql).toContain(`"stories"."${name}" >=`);
      expect(q.params).toEqual([2]);
    }
  });

  it("filters the never-scraped stories", () => {
    const q = render([
      { field: "text_page_count", op: "eq", value: 0 },
      { field: "page_count", op: "gt", value: 0 },
      { field: "runnable_v3", op: "eq", value: true },
    ]);
    expect(q.sql).toBe('("stories"."text_page_count" = $1 and "stories"."page_count" > $2 and "stories"."runnable_v3" = $3)');
    expect(q.params).toEqual([0, 0, true]);
  });

  it("rejects a value that is not a number", () => {
    expect(() => render([{ field: "score_amount", op: "lt", value: "lots" }])).toThrow(FilterError);
  });
});
