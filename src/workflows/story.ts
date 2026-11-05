import { start } from "workflow/api";
import { advance, claimNext, closeRunIfDone, modelCall, runIdOf, type Advance } from "@/lib/runs/exec";

/**
 * One durable workflow per story (§5.2, §10b). Code steps run inline in
 * `advanceStep`; each model call is its own step, so a long call never hits a
 * request time limit. When the story ends, it starts the next queued story of
 * the run, so at most `concurrency` stories run at the same time.
 */
export async function storyWorkflow(runStoryId: number) {
  "use workflow";
  let next = await advanceStep(runStoryId);
  let guard = 0;
  while (next.action === "model" && guard++ < 200) {
    await modelCallStep(runStoryId, next.index);
    next = await advanceStep(runStoryId);
  }
  await finishStep(runStoryId);
  return { runStoryId };
}

async function advanceStep(runStoryId: number): Promise<Advance> {
  "use step";
  return advance(runStoryId);
}

async function modelCallStep(runStoryId: number, index: number): Promise<void> {
  "use step";
  await modelCall(runStoryId, index);
}
modelCallStep.maxRetries = 1;

async function finishStep(runStoryId: number): Promise<void> {
  "use step";
  const runId = await runIdOf(runStoryId);
  const nextId = await claimNext(runId);
  if (nextId !== null) await start(storyWorkflow, [nextId]);
  await closeRunIfDone(runId);
}
