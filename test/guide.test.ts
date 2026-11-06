import { describe, expect, it } from "vitest";
import { GUIDE_DOCS, listHeadings, readGuideDoc, resolveDocLink } from "../src/lib/guide-docs";

describe("guide docs", () => {
  it("lists the team guide sections with GitHub-style ids", () => {
    const headings = listHeadings(readGuideDoc(GUIDE_DOCS.team));
    const ids = headings.map((h) => h.id);
    expect(ids).toContain("the-5-minute-tour");
    expect(ids).toContain("connect-claude");
    expect(headings.find((h) => h.text === "Staged writer 3.0")).toMatchObject({ depth: 3, id: "staged-writer-30" });
  });

  it("skips headings inside code fences and keeps duplicate suffixes", () => {
    const md = "# Top\n## A\n```bash\n## not a heading\n```\n## A\n### `code` and [link](x)";
    expect(listHeadings(md)).toEqual([
      { depth: 2, text: "A", id: "a" },
      { depth: 2, text: "A", id: "a-1" },
      { depth: 3, text: "code and link", id: "code-and-link" },
    ]);
  });

  it("maps links to app routes, guide routes and GitHub", () => {
    expect(resolveDocLink("/stories", "docs/TEAM-GUIDE.md")).toEqual({ kind: "app", href: "/stories" });
    expect(resolveDocLink("docs/TEAM-GUIDE.md", "README.md")).toEqual({ kind: "app", href: "/guide" });
    expect(resolveDocLink("../README.md#tests", "docs/TEAM-GUIDE.md")).toEqual({ kind: "app", href: "/guide/developers#tests" });
    expect(resolveDocLink("docs/SPEC.md", "README.md")).toEqual({
      kind: "external",
      href: "https://github.com/100XLT-ai/story-workbench/blob/main/docs/SPEC.md",
    });
    expect(resolveDocLink("https://example.com", "README.md").kind).toBe("external");
    expect(resolveDocLink("#tests", "README.md")).toEqual({ kind: "anchor", href: "#tests" });
  });
});
