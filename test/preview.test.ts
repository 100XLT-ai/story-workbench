/**
 * Part 4 (2026-11-06): "Preview inputs" renders what each step receives with no model call.
 * A value that a model step makes shows as a named slot; code steps run when their inputs are known.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pageTextTokens, previewVersion } from "../src/lib/engine/preview";
import type { Context, VersionDefinition } from "../src/lib/engine/types";
import { loadSeedPrompts } from "../src/lib/seeds/load";
import { productionSeed, stagedSeed } from "../src/lib/seeds/seeds";

const prompts = loadSeedPrompts(path.resolve(__dirname, "../prompts"));
const inputsOf = (job: number) => JSON.parse(fs.readFileSync(path.resolve(__dirname, "goldens", "inputs", `job-${job}.json`), "utf8")) as Context;

describe("previewVersion", () => {
  it("runs known code steps, renders prompts and names model outputs as slots", () => {
    const def: VersionDefinition = {
      settings: {},
      steps: [
        { id: "write", kind: "prompt", name: "Write", purpose: "", part: "article", inputs: ["story"], outputs: ["draft"], system: null, user: "Story: {{story.headline}}", model: "m", temperature: 0, maxTokens: 100, reasoning: null, format: "text" },
        { id: "fix", kind: "prompt", name: "Fix", purpose: "", part: "article", inputs: ["draft"], outputs: ["final"], system: "Be brief.", user: "Fix: {{draft}}", model: "m", temperature: 0, maxTokens: 100, reasoning: null, format: "text" },
        { id: "maybe", kind: "prompt", name: "Maybe", purpose: "", part: "article", inputs: ["final"], outputs: ["extra"], when: [{ field: "final", op: "not_null" }], system: null, user: "{{final}}", model: "m", temperature: 0, maxTokens: 100, reasoning: null, format: "text" },
      ],
    };
    const steps = previewVersion(def, { story: { headline: "Food bank opens" } });
    expect(steps[0].status).toBe("ready");
    expect(steps[0].messages?.[0].content).toBe("Story: Food bank opens");
    expect(steps[1].status).toBe("slots");
    expect(steps[1].messages?.[1].content).toBe('Fix: ⟦draft: from step 1 "Write"⟧');
    expect(steps[1].tokens).toBeGreaterThan(0);
    expect(steps[2].status).toBe("waits");
    expect(steps[2].reason).toContain('final is not empty: ⟦final: from step 2 "Fix"⟧');
  });

  it("Staged writer 3.0 on the job 1104 winner: the ledger runs, the writer waits on the model steps", () => {
    const steps = previewVersion(stagedSeed(prompts), inputsOf(1104));
    const by = (id: string) => steps.find((s) => s.id === id)!;
    expect(by("ledger_input").status).toBe("ready");
    expect(by("ledger").status).toBe("ready");
    expect(by("label").status).toBe("ready");
    expect(by("label").messages?.length).toBeGreaterThan(0);
    expect(by("apply_labels").status).toBe("slots");
    expect(by("select").status).toBe("slots");
    const selectText = by("select").messages!.map((m) => m.content).join("\n");
    expect(selectText).toMatch(/⟦writer_input: from step \d+ "Writer input", after model step \d+ "Label the facts"( → \w+)?⟧/);
    expect(steps.every((s) => s.status !== "error")).toBe(true);
  });

  it("Production writer 1.0 renders the article prompt in full before any model call", () => {
    const steps = previewVersion(productionSeed(prompts), inputsOf(1104));
    const write = steps.find((s) => s.id === "article")!;
    expect(["ready", "slots"]).toContain(write.status);
    expect(write.messages?.map((m) => m.content).join("").length).toBeGreaterThan(1000);
  });

  it("no seed prompt reads the raw page text", () => {
    expect(pageTextTokens(stagedSeed(prompts))).toEqual([]);
    expect(pageTextTokens(productionSeed(prompts))).toEqual([]);
  });
});
