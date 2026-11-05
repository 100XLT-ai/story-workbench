import { and, eq, inArray, sql as dsql } from "drizzle-orm";
import { start } from "workflow/api";
import { db, schema } from "@/db";
import type { PromptStep, VersionDefinition } from "../engine/types";
import type { RunOverrides } from "../engine/inputs";
import { priceOf } from "../models";
import { getSetting } from "../settings";
import { storyWorkflow } from "@/workflows/story";

export class BadRequest extends Error {}

export interface StepEstimate {
  stepId: string;
  model: string;
  basis: "past traces" | "size of the prompt";
  costPerStory: number;
}

export interface Estimate {
  stories: number;
  steps: { id: string; name: string; kind: string; when: boolean }[];
  promptSteps: StepEstimate[];
  costPerStory: number;
  total: number;
  note: string;
}

/**
 * The cost estimate before a run (§5.1). A step that ran before uses the mean
 * real cost of its past traces with the same model. A new step uses the
 * OpenRouter price list and the size of its templates plus a typical story.
 * Steps with a `when` count in full, so the estimate is an upper bound.
 */
export async function estimateRun(versionId: number, storyCount: number): Promise<Estimate> {
  const [version] = await db().select().from(schema.versions).where(eq(schema.versions.id, versionId));
  if (!version) throw new BadRequest(`version ${versionId} does not exist`);
  const def = version.definition as VersionDefinition;
  const prompts = def.steps.filter((s): s is PromptStep => s.kind === "prompt");
  const promptSteps: StepEstimate[] = [];
  for (const s of prompts) {
    const past = await db()
      .select({ avg: dsql<number | null>`avg(${schema.traces.cost})` })
      .from(schema.traces)
      .where(and(eq(schema.traces.stepId, s.id), eq(schema.traces.status, "done"), dsql`${schema.traces.cost} is not null`, dsql`${schema.traces.model} like ${s.model.split(":")[0] + "%"}`));
    const avg = past[0]?.avg;
    if (avg !== null && avg !== undefined) {
      promptSteps.push({ stepId: s.id, model: s.model, basis: "past traces", costPerStory: Number(avg) });
      continue;
    }
    const price = await priceOf(s.model);
    const templateChars = (s.system ?? "").length + s.user.length;
    const inTokens = templateChars / 4 + 3000;
    const outTokens = Math.min(s.maxTokens ?? 4000, 4000);
    promptSteps.push({
      stepId: s.id,
      model: s.model,
      basis: "size of the prompt",
      costPerStory: price ? inTokens * price.prompt + outTokens * price.completion : 0,
    });
  }
  const costPerStory = promptSteps.reduce((a, b) => a + b.costPerStory, 0);
  return {
    stories: storyCount,
    steps: def.steps.map((s) => ({ id: s.id, name: s.name, kind: s.kind, when: !!s.when?.length })),
    promptSteps,
    costPerStory,
    total: costPerStory * storyCount,
    note: "An estimate. Steps with a condition count as if they run.",
  };
}

export async function createRun(input: {
  versionId: number;
  storyIds: number[];
  author?: string;
  overrides?: RunOverrides;
  note?: string;
}): Promise<{ runId: number; estimate: Estimate }> {
  const ids = [...new Set(input.storyIds.map(Number).filter((n) => Number.isFinite(n)))];
  if (ids.length < 1 || ids.length > 500) throw new BadRequest("A run holds 1 to 500 stories.");
  const found = await db().select({ id: schema.stories.id }).from(schema.stories).where(inArray(schema.stories.id, ids));
  if (found.length !== ids.length) {
    const have = new Set(found.map((f) => f.id));
    throw new BadRequest(`These stories are not in the snapshot: ${ids.filter((i) => !have.has(i)).slice(0, 20).join(", ")}`);
  }
  const estimate = await estimateRun(input.versionId, ids.length);
  const concurrency = Math.max(1, Math.min(20, Number(await getSetting("run_concurrency")) || 8));
  const [run] = await db()
    .insert(schema.runs)
    .values({
      versionId: input.versionId,
      author: input.author?.trim() || "api",
      status: "running",
      storyCount: ids.length,
      overrides: input.overrides ?? {},
      estimatedCost: estimate.total,
      concurrency,
      note: input.note ?? null,
    })
    .returning();
  await db()
    .insert(schema.runStories)
    .values(ids.map((storyId, position) => ({ runId: run.id, storyId, position, status: "pending" })));
  for (let i = 0; i < Math.min(concurrency, ids.length); i++) {
    const { claimNext } = await import("./exec");
    const next = await claimNext(run.id);
    if (next === null) break;
    const wf = await start(storyWorkflow, [next]);
    await db().update(schema.runStories).set({ workflowRunId: wf.runId }).where(eq(schema.runStories.id, next));
  }
  return { runId: run.id, estimate };
}

export async function cancelRun(runId: number): Promise<void> {
  await db().update(schema.runs).set({ status: "cancelled" }).where(eq(schema.runs.id, runId));
  await db()
    .update(schema.runStories)
    .set({ status: "cancelled", finishedAt: new Date().toISOString() })
    .where(and(eq(schema.runStories.runId, runId), inArray(schema.runStories.status, ["pending", "queued"])));
  const { closeRunIfDone } = await import("./exec");
  await closeRunIfDone(runId);
}
