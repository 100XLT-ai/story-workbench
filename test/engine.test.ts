import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderTemplate, templateTokens, TemplateError } from "../src/lib/engine/template";
import { evaluateWhen, parseFilter, testClause } from "../src/lib/engine/filter";
import { buildRequest, runCode, validateVersion } from "../src/lib/engine/execute";
import { applyChanges, diffDefinitions, labelOf, nextNumber } from "../src/lib/version-logic";
import { loadSeedPrompts } from "../src/lib/seeds/load";
import { oneCallSeed, productionSeed, stagedSeed } from "../src/lib/seeds/seeds";
import type { CodeStep, PromptStep, VersionDefinition } from "../src/lib/engine/types";

const prompts = loadSeedPrompts(path.resolve(__dirname, "../prompts"));

describe("templates", () => {
  it("fills tokens and paths in one pass", () => {
    expect(renderTemplate("A {{a}} {{b.c}}", { a: "x{{b.c}}", b: { c: "y" } })).toBe("A x{{b.c}} y");
  });
  it("needs a filter for a value that is not text", () => {
    expect(() => renderTemplate("{{o}}", { o: { k: 1 } })).toThrow(TemplateError);
  });
  it("renders the json filters exactly as JSON.stringify", () => {
    const v = { a: [1, { b: "c" }] };
    expect(renderTemplate("{{v|json}}", { v })).toBe(JSON.stringify(v));
    expect(renderTemplate("{{v|json1}}", { v })).toBe(JSON.stringify(v, null, 1));
    expect(renderTemplate("{{v|json2}}", { v })).toBe(JSON.stringify(v, null, 2));
  });
  it("names a missing value", () => {
    expect(() => renderTemplate("{{nope}}", {})).toThrow(/\{\{nope\}\}/);
  });
  it("lists tokens", () => {
    expect(templateTokens("{{a}} {{a}} {{b.c|json}}").map((t) => t.raw)).toEqual(["{{a}}", "{{b.c|json}}"]);
  });
});

describe("filter format", () => {
  it("parses and tests every op", () => {
    const f = parseFilter([
      { field: "rank", op: "in", value: [3, 5] },
      { field: "quote_count", op: "lte", value: 1 },
    ]);
    expect(f).toHaveLength(2);
    expect(testClause(3, f[0])).toBe(true);
    expect(testClause(4, f[0])).toBe(false);
    expect(testClause(1, f[1])).toBe(true);
    expect(testClause(null, { field: "x", op: "is_null" })).toBe(true);
    expect(testClause("x", { field: "x", op: "not_null" })).toBe(true);
    expect(testClause("Hello", { field: "x", op: "contains", value: "ell" })).toBe(true);
    expect(testClause(2, { field: "x", op: "gt", value: 1 })).toBe(true);
    expect(testClause(2, { field: "x", op: "gte", value: 2 })).toBe(true);
    expect(testClause(1, { field: "x", op: "lt", value: 2 })).toBe(true);
    expect(testClause(true, { field: "x", op: "eq", value: true })).toBe(true);
    expect(testClause(1, { field: "x", op: "ne", value: 2 })).toBe(true);
  });
  it("rejects a bad op and an 'in' without a list", () => {
    expect(() => parseFilter([{ field: "a", op: "like", value: 1 }])).toThrow(/not valid/);
    expect(() => parseFilter([{ field: "a", op: "in", value: 1 }])).toThrow(/list/);
  });
  it("gives a reason for when", () => {
    const r = evaluateWhen([{ field: "story.impactValueRaw", op: "is_null" }], { story: { impactValueRaw: 30000 } });
    expect(r.run).toBe(false);
    expect(r.reason).toMatch(/skipped/);
    expect(evaluateWhen([{ field: "story.impactValueRaw", op: "is_null" }], { story: { impactValueRaw: null } }).run).toBe(true);
  });
});

describe("versions", () => {
  it("numbers the next minor in the family", () => {
    expect(nextNumber([{ major: 3, minor: 0 }], 3)).toEqual({ major: 3, minor: 1 });
    expect(nextNumber([{ major: 3, minor: 0 }, { major: 3, minor: 1 }], 3)).toEqual({ major: 3, minor: 2 });
    expect(nextNumber([], 1)).toEqual({ major: 1, minor: 0 });
    expect(labelOf("Staged writer", { major: 3, minor: 1, author: "Noah" })).toBe("Staged writer 3.1 (Noah)");
  });
  it("applies a change, shows it in the diff and leaves the parent as it was", () => {
    const parent = stagedSeed(prompts);
    const before = JSON.stringify(parent);
    const child = applyChanges(parent, [{ step_id: "write", field: "user", new_value: "{{writer_input.facts}}" }]);
    expect(JSON.stringify(parent)).toBe(before);
    expect(diffDefinitions(parent, child)).toEqual([expect.objectContaining({ step_id: "write", field: "user" })]);
  });
  it("stops a save on an unknown token and names it", () => {
    const def = applyChanges(stagedSeed(prompts), [{ step_id: "write", field: "user", new_value: "hello {{nope}}" }]);
    expect(validateVersion(def)[0].message).toMatch(/\{\{nope\}\}/);
  });
  it("the three seeds validate", () => {
    for (const b of [productionSeed, stagedSeed, oneCallSeed]) expect(validateVersion(b(prompts))).toEqual([]);
  });
  it("an added prompt step after the article that reads it validates", () => {
    const step: PromptStep = {
      kind: "prompt",
      id: "social_post",
      name: "Extra post",
      purpose: "x",
      part: "social",
      inputs: ["article"],
      outputs: ["social_post"],
      system: null,
      user: "{{article.title}}",
      model: "google/gemini-3.5-flash",
      temperature: 0.7,
      maxTokens: 1000,
      reasoning: null,
      format: "text",
    };
    const def: VersionDefinition = applyChanges(stagedSeed(prompts), [], [{ op: "insert", after: "fit_title", step }]);
    expect(validateVersion(def)).toEqual([]);
  });
});

describe("seed settings (§10b)", () => {
  const staged = stagedSeed(prompts);
  const step = (id: string) => staged.steps.find((s) => s.id === id) as PromptStep;
  it("label sends no reasoning field; write and select resolve effort", () => {
    expect(buildRequest(step("label"), []).reasoning).toBeUndefined();
    expect(buildRequest(step("write"), []).reasoning).toEqual({ effort: "medium" });
    expect(buildRequest(step("select"), []).reasoning).toEqual({ effort: "high" });
    expect([step("write").temperature, step("select").temperature, step("label").temperature]).toEqual([0.7, 0.3, 0]);
    expect([step("write").maxTokens, step("select").maxTokens, step("label").maxTokens]).toEqual([16384, 16384, 8192]);
    expect(staged.settings).toMatchObject({ target_words: 425, min_words: 325, max_words: 600 });
  });
  it("headline_shorten uses the title model with minimal effort", () => {
    const h = productionSeed(prompts).steps.find((s) => s.id === "headline_shorten") as PromptStep;
    expect(buildRequest(h, [])).toMatchObject({ model: "google/gemini-3.5-flash", temperature: 0.3, max_tokens: 1536, reasoning: { effort: "minimal" } });
  });
});

describe("code steps are deterministic (AC-04)", () => {
  const inputsFile = path.resolve(__dirname, "goldens/inputs/job-1100.json");
  it.runIf(fs.existsSync(inputsFile))("the same input gives the same output", () => {
    const inputs = JSON.parse(fs.readFileSync(inputsFile, "utf8")) as Record<string, unknown>;
    const def = stagedSeed(prompts);
    let ctx: Record<string, unknown> = { ...inputs };
    for (const s of def.steps.slice(0, 2) as CodeStep[]) {
      const a = runCode(s, ctx);
      const b = runCode(s, structuredClone(ctx));
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      ctx = { ...ctx, ...a };
    }
  });
});
