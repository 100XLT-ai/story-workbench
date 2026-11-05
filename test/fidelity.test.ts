/**
 * AC-06: every rendered prompt of the seeds equals longtale-core's own output.
 * The goldens (test/goldens/<seed>/job-<id>.json) were made by
 * scripts/make-goldens.ts with longtale-core's builders. The app renders the
 * same steps from its seed versions and the app's own story inputs
 * (test/goldens/inputs/job-<id>.json, exported from the snapshot), replaying
 * the recorded model replies. No network, no database.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runInMemory } from "../src/lib/engine/step";
import type { ChatRequest, ModelCall } from "../src/lib/engine/execute";
import type { Context, PromptStep } from "../src/lib/engine/types";
import { loadSeedPrompts } from "../src/lib/seeds/load";
import { oneCallSeed, productionSeed, stagedSeed } from "../src/lib/seeds/seeds";

const ROOT = path.resolve(__dirname, "goldens");
const SEEDS = { production: productionSeed, staged: stagedSeed, one_call: oneCallSeed } as const;
const JOBS = [1104, 1100, 1107, 1099];
const KEYS = ["model", "temperature", "max_tokens", "response_format", "reasoning"] as const;

interface Golden {
  steps: { id: string; messages: { role: string; content: string }[]; options: Record<string, unknown> }[];
  recorded: Record<string, string>;
}

const pick = (o: Record<string, unknown>) => Object.fromEntries(KEYS.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

describe("fidelity: the seeds render longtale-core's prompts byte for byte", () => {
  const prompts = loadSeedPrompts(path.resolve(__dirname, "../prompts"));
  for (const [seed, build] of Object.entries(SEEDS)) {
    for (const job of JOBS) {
      it(`${seed} on the job ${job} winner`, async () => {
        const golden = JSON.parse(fs.readFileSync(path.join(ROOT, seed, `job-${job}.json`), "utf8")) as Golden;
        const inputs = JSON.parse(fs.readFileSync(path.join(ROOT, "inputs", `job-${job}.json`), "utf8")) as Context;
        const def = build(prompts);
        const sent: { id: string; req: ChatRequest }[] = [];
        const llm = async (req: ChatRequest, step: PromptStep): Promise<ModelCall> => {
          sent.push({ id: step.id, req });
          const text = golden.recorded[step.id];
          if (text === undefined) throw new Error(`no recorded reply for ${step.id}`);
          return { response: { choices: [{ message: { content: text }, finish_reason: "stop" }] }, text, sent: req, notes: [], ms: 0 };
        };
        const { traces } = await runInMemory(def.steps, inputs, llm);
        const failed = traces.find((t) => t.status === "failed");
        expect(failed?.error ?? null).toBeNull();
        expect(sent.map((s) => s.id)).toEqual(golden.steps.map((s) => s.id));
        for (const g of golden.steps) {
          const mine = sent.find((s) => s.id === g.id);
          expect(mine, g.id).toBeDefined();
          expect(mine?.req.messages, `${g.id} messages`).toEqual(g.messages);
          const { messages: _m, stream: _s, usage: _u, ...opts } = mine?.req ?? ({} as ChatRequest);
          expect(pick(opts as Record<string, unknown>), `${g.id} settings`).toEqual(pick(g.options));
        }
      });
    }
  }
});
