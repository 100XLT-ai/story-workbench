import { and, asc, eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { loadStoryInputs } from "../data/story-inputs";
import { callOpenRouter } from "../engine/execute";
import { executeStep, type StepTrace } from "../engine/step";
import { evaluateWhen } from "../engine/filter";
import type { Context, VersionDefinition } from "../engine/types";
import type { RunOverrides } from "../engine/inputs";
import { pack, unpack } from "./pack";
import { storySummary } from "./summary";

export type Advance = { action: "model"; index: number } | { action: "done" };

async function load(runStoryId: number) {
  const d = db();
  const [rs] = await d.select().from(schema.runStories).where(eq(schema.runStories.id, runStoryId));
  if (!rs) throw new Error(`run story ${runStoryId} not found`);
  const [run] = await d.select().from(schema.runs).where(eq(schema.runs.id, rs.runId));
  const [version] = await d.select().from(schema.versions).where(eq(schema.versions.id, run.versionId));
  const def = version.definition as VersionDefinition;
  return { rs, run, def };
}

async function contextFor(rs: typeof schema.runStories.$inferSelect, run: typeof schema.runs.$inferSelect, def: VersionDefinition): Promise<Context> {
  const inputs = await loadStoryInputs(rs.storyId, def.settings, (run.overrides ?? {}) as RunOverrides);
  const state = rs.state ? (unpack(rs.state) as Context) : {};
  // Story inputs always win over state with the same name (the state never stores inputs).
  return { ...state, ...(inputs as unknown as Context) };
}

function stateOf(ctx: Context, inputKeys: string[]): Context {
  const out: Context = {};
  for (const [k, v] of Object.entries(ctx)) if (!inputKeys.includes(k)) out[k] = v;
  return out;
}

const INPUT_KEYS = ["story", "org", "brand", "pages", "other_pages", "crawl_rows", "settings"];

async function saveTrace(rs: typeof schema.runStories.$inferSelect, t: StepTrace) {
  await db().insert(schema.traces).values({
    runId: rs.runId,
    runStoryId: rs.id,
    storyId: rs.storyId,
    stepIndex: t.stepIndex,
    stepId: t.stepId,
    stepName: t.stepName,
    kind: t.kind,
    status: t.status,
    reason: t.reason,
    model: t.model,
    tokensIn: t.tokensIn,
    tokensOut: t.tokensOut,
    tokensReasoning: t.tokensReasoning,
    cost: t.cost,
    error: t.error,
    body: pack(t.body),
    startedAt: t.startedAt,
    endedAt: t.endedAt,
  });
}

async function markFailed(rs: typeof schema.runStories.$inferSelect, t: StepTrace, ctx: Context, def: VersionDefinition) {
  await db()
    .update(schema.runStories)
    .set({
      status: "failed",
      error: t.error,
      failedStep: t.stepId,
      state: pack(stateOf(ctx, INPUT_KEYS)),
      summary: storySummary(ctx, def),
      finishedAt: new Date().toISOString(),
      cost: dsql`${schema.runStories.cost} + ${t.cost ?? 0}`,
    })
    .where(eq(schema.runStories.id, rs.id));
}

/** Runs code steps and skips inline until the next model call. */
export async function advance(runStoryId: number): Promise<Advance> {
  const { rs, run, def } = await load(runStoryId);
  if (["done", "failed", "cancelled"].includes(rs.status)) return { action: "done" };
  if (run.status === "cancelled") {
    await db().update(schema.runStories).set({ status: "cancelled", finishedAt: new Date().toISOString() }).where(eq(schema.runStories.id, rs.id));
    return { action: "done" };
  }
  if (rs.status !== "running")
    await db().update(schema.runStories).set({ status: "running", startedAt: new Date().toISOString() }).where(eq(schema.runStories.id, rs.id));
  let ctx: Context;
  try {
    ctx = await contextFor(rs, run, def);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db().update(schema.runStories).set({ status: "failed", error: `inputs: ${msg}`, failedStep: "inputs", finishedAt: new Date().toISOString() }).where(eq(schema.runStories.id, rs.id));
    return { action: "done" };
  }
  let cursor = rs.cursor;
  const costAdd = 0;
  while (cursor < def.steps.length) {
    const step = def.steps[cursor];
    if (step.kind === "prompt") {
      if (evaluateWhen(step.when, ctx).run) {
        await db()
          .update(schema.runStories)
          .set({ cursor, state: pack(stateOf(ctx, INPUT_KEYS)), cost: dsql`${schema.runStories.cost} + ${costAdd}` })
          .where(eq(schema.runStories.id, rs.id));
        return { action: "model", index: cursor };
      }
    }
    const { outputs, trace } = await executeStep(step, cursor, ctx, null);
    await saveTrace(rs, trace);
    if (trace.status === "failed") {
      await markFailed(rs, trace, ctx, def);
      return { action: "done" };
    }
    Object.assign(ctx, outputs);
    cursor++;
  }
  await db()
    .update(schema.runStories)
    .set({
      status: "done",
      cursor,
      state: pack(stateOf(ctx, INPUT_KEYS)),
      summary: storySummary(ctx, def),
      finishedAt: new Date().toISOString(),
      cost: dsql`${schema.runStories.cost} + ${costAdd}`,
    })
    .where(eq(schema.runStories.id, rs.id));
  return { action: "done" };
}

/** One model call: render, call OpenRouter, store the trace and the output. */
export async function modelCall(runStoryId: number, index: number): Promise<void> {
  const { rs, run, def } = await load(runStoryId);
  if (rs.status !== "running" || rs.cursor !== index) return; // already done (a retried step)
  if (run.status === "cancelled") return;
  const ctx = await contextFor(rs, run, def);
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set on the server");
  const step = def.steps[index];
  const { outputs, trace } = await executeStep(step, index, ctx, (req) => callOpenRouter(req, apiKey));
  await saveTrace(rs, trace);
  if (trace.status === "failed") {
    await markFailed(rs, trace, ctx, def);
    return;
  }
  Object.assign(ctx, outputs);
  await db()
    .update(schema.runStories)
    .set({ cursor: index + 1, state: pack(stateOf(ctx, INPUT_KEYS)), cost: dsql`${schema.runStories.cost} + ${trace.cost ?? 0}` })
    .where(eq(schema.runStories.id, rs.id));
}

/** Claims the next pending story of the run (one at a time, so at most `concurrency` run together). */
export async function claimNext(runId: number): Promise<number | null> {
  const rows = await db().execute<{ id: number }>(dsql`
    update run_stories set status = 'queued'
     where id = (select id from run_stories where run_id = ${runId} and status = 'pending' order by position limit 1 for update skip locked)
     returning id`);
  const list = rows as unknown as { id: number }[];
  return list[0]?.id ?? null;
}

/** Marks the run done when no story is left to run. */
export async function closeRunIfDone(runId: number): Promise<void> {
  const open = await db()
    .select({ n: dsql<number>`count(*)::int` })
    .from(schema.runStories)
    .where(and(eq(schema.runStories.runId, runId), dsql`${schema.runStories.status} in ('pending','queued','running')`));
  if ((open[0]?.n ?? 0) > 0) return;
  const [run] = await db().select().from(schema.runs).where(eq(schema.runs.id, runId));
  if (!run || run.finishedAt) return;
  const failed = await db()
    .select({ n: dsql<number>`count(*)::int` })
    .from(schema.runStories)
    .where(and(eq(schema.runStories.runId, runId), eq(schema.runStories.status, "failed")));
  await db()
    .update(schema.runs)
    .set({ status: run.status === "cancelled" ? "cancelled" : (failed[0]?.n ?? 0) > 0 ? "done_with_failures" : "done", finishedAt: new Date().toISOString() })
    .where(eq(schema.runs.id, runId));
}

export async function runIdOf(runStoryId: number): Promise<number> {
  const [rs] = await db().select({ runId: schema.runStories.runId }).from(schema.runStories).where(eq(schema.runStories.id, runStoryId));
  return rs.runId;
}

export async function pendingInOrder(runId: number) {
  return db().select().from(schema.runStories).where(eq(schema.runStories.runId, runId)).orderBy(asc(schema.runStories.position));
}
