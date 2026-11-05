// One service layer for the web app, the REST API and the MCP server.
import { and, asc, desc, eq, inArray, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { fieldList, queryStories, storyIdsFor, FilterError, type StoryQuery } from "./data/stories";
import { loadStoryInputs } from "./data/story-inputs";
import { callOpenRouter, validateVersion } from "./engine/execute";
import { INPUT_DESCRIPTIONS, INPUT_ROOTS, type RunOverrides } from "./engine/inputs";
import { parseFilter } from "./engine/filter";
import { registryList } from "./engine/registry";
import type { Step, VersionDefinition } from "./engine/types";
import { parseJsonText } from "./writer/writer/writer-output";
import { listModels } from "./models";
import { cancelRun, createRun, estimateRun, BadRequest } from "./runs/create";
import { unpack } from "./runs/pack";
import { getSetting } from "./settings";
import { applyChanges, createVersion, diffDefinitions, familiesWithVersions, getVersion, listVersions, VersionError, type StepChange } from "./versions";
import { decided } from "./flow/decided";

export { BadRequest, FilterError, VersionError };

export const listStoryFields = () => ({ fields: fieldList(), inputs: INPUT_ROOTS.map((r) => ({ name: r, description: INPUT_DESCRIPTIONS[r] })) });
export const findStories = (q: StoryQuery) => queryStories(q);

export async function getStory(id: number) {
  const d = db();
  const [st] = await d.select().from(schema.stories).where(eq(schema.stories.id, id));
  if (!st) return null;
  const [job] = await d.select().from(schema.jobs).where(eq(schema.jobs.id, st.jobId));
  const [org] = job?.organizationId ? await d.select().from(schema.organizations).where(eq(schema.organizations.id, job.organizationId)) : [];
  const links = await d.select().from(schema.storyPages).where(eq(schema.storyPages.candidateId, id)).orderBy(asc(schema.storyPages.linkId));
  const pageIds = links.length ? links.map((l) => l.pageExtractId) : st.sourcePageExtractId ? [st.sourcePageExtractId] : [];
  const pages = pageIds.length ? await d.select().from(schema.pages).where(inArray(schema.pages.id, pageIds)) : [];
  const imgLinks = await d.select().from(schema.storyImages).where(eq(schema.storyImages.candidateId, id)).orderBy(asc(schema.storyImages.rank));
  const imgs = imgLinks.length ? await d.select().from(schema.images).where(inArray(schema.images.id, imgLinks.map((l) => l.imageId))) : [];
  const inputs = await loadStoryInputs(id);
  const runs = await d
    .select({ rs: schema.runStories, run: schema.runs, v: schema.versions, f: schema.families })
    .from(schema.runStories)
    .innerJoin(schema.runs, eq(schema.runs.id, schema.runStories.runId))
    .innerJoin(schema.versions, eq(schema.versions.id, schema.runs.versionId))
    .innerJoin(schema.families, eq(schema.families.id, schema.versions.familyId))
    .where(eq(schema.runStories.storyId, id))
    .orderBy(desc(schema.runStories.id));
  const byId = new Map(pages.map((p) => [p.id, p]));
  return {
    story: st,
    job,
    organization: org ?? null,
    settings: inputs.settings,
    brand: inputs.brand,
    pages: pageIds
      .map((pid) => {
        const p = byId.get(pid);
        if (!p) return null;
        const role = links.find((l) => l.pageExtractId === pid)?.role ?? "primary";
        const impacts = inputs.pages.find((x) => x.pageId === String(pid))?.impacts ?? [];
        return { ...p, role, impacts };
      })
      .filter((x) => x !== null),
    images: imgLinks.map((l) => ({ ...imgs.find((i) => i.id === l.imageId), rank: l.rank })),
    runs: runs.map(({ rs, run, v, f }) => ({
      runId: run.id,
      runStoryId: rs.id,
      version: `${f.name} ${v.major}.${v.minor} (${v.author})`,
      versionId: v.id,
      status: rs.status,
      cost: rs.cost,
      createdAt: run.createdAt,
    })),
  };
}

export const listFamilies = () => familiesWithVersions();
export const versionsList = (familyId?: number) => listVersions(familyId);
export const versionGet = (id: number) => getVersion(id);
export const registry = () => registryList();
export const models = () => listModels();

export async function versionCreate(body: {
  author?: string;
  note?: string;
  parent_id?: number | null;
  definition?: unknown;
  changes?: StepChange[];
  edits?: Parameters<typeof createVersion>[0]["edits"];
  new_family?: string;
  family_id?: number;
}) {
  return createVersion({
    author: body.author,
    note: body.note,
    parentId: body.parent_id ?? null,
    definition: body.definition,
    changes: body.changes,
    edits: body.edits,
    newFamily: body.new_family,
    familyId: body.family_id,
  });
}

/** Validates a definition without saving it (the editor's save dialog). */
export async function versionPreview(body: { parent_id: number; definition: unknown }) {
  const parent = await getVersion(body.parent_id);
  if (!parent) throw new VersionError(`version ${body.parent_id} does not exist`);
  const def = body.definition as VersionDefinition;
  return { issues: validateVersion(def), diff: diffDefinitions(parent.definition, def) };
}

// ---------------------------------------------------------------- the prompt editor (§4.1)

export async function proposeEdit(body: { version_id: number; step_id?: string | null; comment: string; trace?: { run_story_id: number; step_id?: string } | null; author?: string }) {
  const v = await getVersion(Number(body.version_id));
  if (!v) throw new VersionError(`version ${body.version_id} does not exist`);
  if (!body.comment?.trim()) throw new BadRequest("A comment is needed.");
  const system = String(await getSetting("prompt_editor_system"));
  const model = String(await getSetting("prompt_editor_model"));
  let traceText: unknown = null;
  if (body.trace?.run_story_id) {
    const t = await getTrace(Number(body.trace.run_story_id), body.trace.step_id);
    traceText = t?.steps.map((s) => ({ step: s.stepId, status: s.status, messages: s.body?.messages, output: s.body?.output, error: s.error }));
  }
  const user = JSON.stringify({ version: { label: v.label, steps: v.definition.steps, settings: v.definition.settings }, target_step: body.step_id || "all", comment: body.comment, trace: traceText });
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set on the server");
  const call = await callOpenRouter(
    { model, messages: [{ role: "system", content: system }, { role: "user", content: user }], stream: false, temperature: 0.2, max_tokens: 16000, response_format: { type: "json_object" }, usage: { include: true } },
    apiKey,
  );
  const parsed = parseJsonText(call.text) as { changes?: unknown; reason?: unknown };
  const changes: StepChange[] = Array.isArray(parsed.changes)
    ? parsed.changes
        .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
        .map((c) => ({ step_id: String(c.step_id ?? ""), field: String(c.field ?? ""), new_value: c.new_value }))
    : [];
  let proposed: VersionDefinition | null = null;
  let error: string | null = null;
  try {
    proposed = applyChanges(v.definition, changes);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  return {
    version_id: v.id,
    label: v.label,
    comment: body.comment,
    changes,
    reason: typeof parsed.reason === "string" ? parsed.reason : "",
    diff: proposed ? diffDefinitions(v.definition, proposed) : [],
    issues: proposed ? validateVersion(proposed) : [],
    error,
    model,
    cost: call.response.usage?.cost ?? null,
  };
}

// ---------------------------------------------------------------- the Ask box (§10b)

export async function askFilter(text: string) {
  if (!text?.trim()) throw new BadRequest("Type a question.");
  const fields = fieldList()
    .map((f) => `${f.name}: ${f.type}`)
    .join(", ");
  const system = String(await getSetting("ask_system")).replace("{{fields}}", fields);
  const model = String(await getSetting("ask_model"));
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set on the server");
  const call = await callOpenRouter(
    { model, messages: [{ role: "system", content: system }, { role: "user", content: text }], stream: false, temperature: 0, max_tokens: 4000, response_format: { type: "json_object" }, usage: { include: true } },
    apiKey,
  );
  const parsed = parseJsonText(call.text) as { filter?: unknown; explanation?: unknown };
  const known = new Set(fieldList().map((f) => f.name));
  const filter = parseFilter(parsed.filter ?? []).filter((c) => known.has(c.field));
  const { total } = await queryStories({ filter, limit: 1 });
  return { filter, explanation: typeof parsed.explanation === "string" ? parsed.explanation : "", count: total, model };
}

// ---------------------------------------------------------------- runs

export async function runEstimate(body: { version_id: number; story_ids?: number[]; filter?: unknown }) {
  const ids = body.story_ids?.length ? body.story_ids : body.filter ? await storyIdsFor(body.filter) : [];
  return estimateRun(Number(body.version_id), ids.length);
}

export async function runStart(body: { version_id: number; story_ids?: number[]; filter?: unknown; author?: string; overrides?: RunOverrides; note?: string }) {
  let ids = body.story_ids ?? [];
  if (!ids.length && body.filter) {
    ids = await storyIdsFor(body.filter, 500);
    if (ids.length > 500) throw new BadRequest("The filter matches more than 500 stories. A run holds 1 to 500.");
  }
  return createRun({ versionId: Number(body.version_id), storyIds: ids, author: body.author, overrides: body.overrides, note: body.note });
}

export const runCancel = (id: number) => cancelRun(id);

export async function listRuns(limit = 100) {
  const rows = await db()
    .select({ run: schema.runs, v: schema.versions, f: schema.families })
    .from(schema.runs)
    .innerJoin(schema.versions, eq(schema.versions.id, schema.runs.versionId))
    .innerJoin(schema.families, eq(schema.families.id, schema.versions.familyId))
    .orderBy(desc(schema.runs.id))
    .limit(limit);
  const ids = rows.map((r) => r.run.id);
  const agg = ids.length
    ? await db()
        .select({
          runId: schema.runStories.runId,
          cost: dsql<number>`coalesce(sum(${schema.runStories.cost}),0)::float`,
          done: dsql<number>`count(*) filter (where ${schema.runStories.status} = 'done')::int`,
          failed: dsql<number>`count(*) filter (where ${schema.runStories.status} = 'failed')::int`,
        })
        .from(schema.runStories)
        .where(inArray(schema.runStories.runId, ids))
        .groupBy(schema.runStories.runId)
    : [];
  return rows.map(({ run, v, f }) => {
    const a = agg.find((x) => x.runId === run.id);
    return {
      id: run.id,
      version: `${f.name} ${v.major}.${v.minor} (${v.author})`,
      versionId: v.id,
      author: run.author,
      status: run.status,
      storyCount: run.storyCount,
      done: a?.done ?? 0,
      failed: a?.failed ?? 0,
      cost: a?.cost ?? 0,
      estimatedCost: run.estimatedCost,
      createdAt: run.createdAt,
      finishedAt: run.finishedAt,
    };
  });
}

export async function getRun(id: number) {
  const [run] = await db().select().from(schema.runs).where(eq(schema.runs.id, id));
  if (!run) return null;
  const v = await getVersion(run.versionId);
  const stories = await db()
    .select({
      rs: schema.runStories,
      headline: schema.stories.storyHeadline,
      sponsor: schema.stories.sponsorName,
      description: schema.stories.description,
    })
    .from(schema.runStories)
    .innerJoin(schema.stories, eq(schema.stories.id, schema.runStories.storyId))
    .where(eq(schema.runStories.runId, id))
    .orderBy(asc(schema.runStories.position));
  const steps = await db()
    .select({ runStoryId: schema.traces.runStoryId, n: dsql<number>`count(*)::int`, ms: dsql<number>`coalesce(sum(extract(epoch from (${schema.traces.endedAt} - ${schema.traces.startedAt}))),0)::float` })
    .from(schema.traces)
    .where(eq(schema.traces.runId, id))
    .groupBy(schema.traces.runStoryId);
  const cost = stories.reduce((a, s) => a + (s.rs.cost ?? 0), 0);
  return {
    id: run.id,
    status: run.status,
    author: run.author,
    note: run.note,
    version: v ? { id: v.id, label: v.label } : null,
    storyCount: run.storyCount,
    concurrency: run.concurrency,
    estimatedCost: run.estimatedCost,
    cost,
    overrides: run.overrides,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
    counts: {
      done: stories.filter((s) => s.rs.status === "done").length,
      failed: stories.filter((s) => s.rs.status === "failed").length,
      running: stories.filter((s) => ["running", "queued"].includes(s.rs.status)).length,
      pending: stories.filter((s) => s.rs.status === "pending").length,
      cancelled: stories.filter((s) => s.rs.status === "cancelled").length,
    },
    stories: stories.map(({ rs, headline, sponsor, description }) => {
      const st = steps.find((x) => x.runStoryId === rs.id);
      return {
        runStoryId: rs.id,
        storyId: rs.storyId,
        sponsor,
        headline: headline ?? description?.slice(0, 120) ?? null,
        status: rs.status,
        cursor: rs.cursor,
        failedStep: rs.failedStep,
        error: rs.error,
        cost: rs.cost,
        seconds: st ? Math.round(st.ms) : null,
        startedAt: rs.startedAt,
        finishedAt: rs.finishedAt,
        summary: rs.summary,
      };
    }),
  };
}

export async function getTrace(runStoryId: number, stepId?: string) {
  const [rs] = await db().select().from(schema.runStories).where(eq(schema.runStories.id, runStoryId));
  if (!rs) return null;
  const [run] = await db().select().from(schema.runs).where(eq(schema.runs.id, rs.runId));
  const v = await getVersion(run.versionId);
  const rows = await db()
    .select()
    .from(schema.traces)
    .where(stepId ? and(eq(schema.traces.runStoryId, runStoryId), eq(schema.traces.stepId, stepId)) : eq(schema.traces.runStoryId, runStoryId))
    .orderBy(asc(schema.traces.stepIndex), asc(schema.traces.id));
  const def = v?.definition;
  return {
    runId: rs.runId,
    runStoryId: rs.id,
    storyId: rs.storyId,
    status: rs.status,
    error: rs.error,
    failedStep: rs.failedStep,
    cost: rs.cost,
    version: v ? { id: v.id, label: v.label } : null,
    definition: def ?? null,
    steps: rows.map((t) => {
      const body = unpack(t.body) as { output?: Record<string, unknown>; messages?: unknown; input?: unknown } | null;
      const step = def?.steps.find((s) => s.id === t.stepId) ?? def?.steps[t.stepIndex];
      return {
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
        startedAt: t.startedAt,
        endedAt: t.endedAt,
        seconds: t.startedAt && t.endedAt ? (Date.parse(t.endedAt) - Date.parse(t.startedAt)) / 1000 : null,
        decided: step ? decided(step, t.status, t.reason, body?.output ?? {}) : t.reason ?? "",
        body,
      };
    }),
  };
}

/** The same story in two runs, step by step (§6.5). */
export async function compareTraces(a: number, b: number) {
  const [ta, tb] = await Promise.all([getTrace(a), getTrace(b)]);
  if (!ta || !tb) return null;
  const ids: string[] = [];
  for (const s of [...ta.steps, ...tb.steps]) if (!ids.includes(s.stepId)) ids.push(s.stepId);
  const text = (s: (typeof ta.steps)[number] | undefined) => {
    if (!s) return null;
    const msgs = (s.body?.messages as { role: string; content: string }[] | undefined)?.map((m) => `[${m.role}]\n${m.content}`).join("\n\n");
    return { prompt: msgs ?? null, output: JSON.stringify(s.body?.output ?? {}, null, 2), status: s.status, decided: s.decided, cost: s.cost };
  };
  return {
    a: { runStoryId: a, storyId: ta.storyId, version: ta.version },
    b: { runStoryId: b, storyId: tb.storyId, version: tb.version },
    steps: ids.map((id) => {
      const sa = ta.steps.find((s) => s.stepId === id);
      const sb = tb.steps.find((s) => s.stepId === id);
      const x = text(sa);
      const y = text(sb);
      return { stepId: id, name: sa?.stepName ?? sb?.stepName ?? id, a: x, b: y, same: JSON.stringify(x?.prompt) === JSON.stringify(y?.prompt) && x?.output === y?.output };
    }),
  };
}

/** Finds the run story of a story in a run (for MCP get_trace by run id and story id). */
export async function runStoryFor(runId: number, storyId: number): Promise<number | null> {
  const [rs] = await db()
    .select({ id: schema.runStories.id })
    .from(schema.runStories)
    .where(and(eq(schema.runStories.runId, runId), eq(schema.runStories.storyId, storyId)));
  return rs?.id ?? null;
}

export function stepsOf(def: VersionDefinition): Step[] {
  return def.steps;
}
