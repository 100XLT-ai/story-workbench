import fs from "node:fs";
import path from "node:path";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  askFilter,
  compareTraces,
  findStories,
  getRun,
  getStory,
  getTrace,
  listFamilies,
  listStoryFields,
  proposeEdit,
  registry,
  runEstimate,
  runStart,
  runStoryFor,
  versionCreate,
  versionGet,
  versionsList,
} from "@/lib/service";
import { CORS } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const filterClause = z.object({
  field: z.string().describe("A story field name; see list_story_fields."),
  op: z.enum(["eq", "ne", "lt", "lte", "gt", "gte", "in", "contains", "is_null", "not_null"]),
  value: z.unknown().optional().describe("A number, text, true/false, or a list for 'in'."),
});
const filter = z.array(filterClause).describe('All clauses are joined by AND. Example: [{"field":"rank","op":"in","value":[3,5]},{"field":"quote_count","op":"lte","value":1}]');

const text = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 1) }] });
const err = (e: unknown) => ({ content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true });
const wrap = async (f: () => Promise<unknown>) => {
  try {
    return text(await f());
  } catch (e) {
    return err(e);
  }
};

function guideText(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), "docs/TEAM-GUIDE.md"), "utf8");
  } catch {
    return "The team guide is docs/TEAM-GUIDE.md in the repo 100XLT-ai/story-workbench.";
  }
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_story_fields",
      { title: "List story fields", description: "Lists every story field you can filter and sort on (name, type, meaning), and the story inputs a prompt template can read.", inputSchema: z.object({}) },
      async () => text(listStoryFields()),
    );
    server.registerTool(
      "query_stories",
      {
        title: "Query stories",
        description: "Finds ranked stories in the fixed snapshot (15,051 stories). Returns the total count and one page of rows. Use list_story_fields for the field names.",
        inputSchema: z.object({
          filter: filter.optional(),
          sort: z.string().optional().describe("A field name, for example rank or quote_count."),
          dir: z.enum(["asc", "desc"]).optional(),
          limit: z.number().int().min(1).max(200).optional().describe("Default 20."),
          offset: z.number().int().min(0).optional(),
        }),
      },
      async (a) =>
        wrap(async () => {
          const r = await findStories({ filter: a.filter ?? [], sort: a.sort, dir: a.dir, limit: a.limit ?? 20, offset: a.offset });
          return { total: r.total, offset: r.offset, rows: r.rows.map((x) => ({ id: x.id, job_id: x.jobId, sponsor: x.sponsorName, rank: x.rank, winner: x.winner, weighted_score: x.weightedScore, headline: x.storyHeadline, quote_count: x.quoteCount, fact_count: x.factCount, page_count: x.pageCount, text_page_count: x.textPageCount, runnable_production: x.runnableProduction, runnable_v3: x.runnableV3 })) };
        }),
    );
    server.registerTool(
      "ask_stories",
      { title: "Ask for stories in plain words", description: "Turns a plain request (for example 'rank 3 or 5, no quotes') into a filter and returns the filter and the count.", inputSchema: z.object({ text: z.string() }) },
      async (a) => wrap(() => askFilter(a.text)),
    );
    server.registerTool(
      "get_story",
      { title: "Get one story", description: "The fixed inputs of one story: candidate fields and scores, sponsor settings, brand profile, pages with facts, quotes and impacts, images, and the runs of this story.", inputSchema: z.object({ story_id: z.number().int(), include_page_text: z.boolean().optional().describe("Default false: page markdown is cut to 500 characters.") }) },
      async (a) =>
        wrap(async () => {
          const s = await getStory(a.story_id);
          if (!s) throw new Error(`story ${a.story_id} not found`);
          if (!a.include_page_text) for (const p of s.pages) p.scrapedMarkdown = p.scrapedMarkdown ? `${p.scrapedMarkdown.slice(0, 500)}…` : null;
          return s;
        }),
    );
    server.registerTool(
      "list_families",
      { title: "List workflow families", description: "The writer families (Production writer, Staged writer, One-call writer, and any copies) with their versions.", inputSchema: z.object({}) },
      async () => wrap(() => listFamilies()),
    );
    server.registerTool(
      "list_versions",
      { title: "List versions", description: "Every version (or one family's versions): id, label like 'Staged writer 3.1 (Noah)', parent, author, note.", inputSchema: z.object({ family_id: z.number().int().optional() }) },
      async (a) => wrap(() => versionsList(a.family_id)),
    );
    server.registerTool(
      "get_version",
      { title: "Get a version", description: "A version's full definition: every step with its prompt templates, model, settings, when condition, inputs and outputs.", inputSchema: z.object({ version_id: z.number().int() }) },
      async (a) => wrap(() => versionGet(a.version_id)),
    );
    server.registerTool(
      "create_version",
      {
        title: "Create a version",
        description:
          "Saves a new version. Either give parent_id and changes (each { step_id, field, new_value }; fields: system, user, model, temperature, maxTokens, reasoning, format, when, name, purpose, inputs, outputs, or params.<key> for a code step), with optional edits ({ op: insert|remove|move, step, after, step_id }); or give a full definition. The number is the family's next minor (3.0 → 3.1). new_family copies into a new family at 1.0. A token that no step makes stops the save.",
        inputSchema: z.object({
          author: z.string().optional().describe('Default "api".'),
          note: z.string().describe("Why this version exists."),
          parent_id: z.number().int().optional(),
          changes: z.array(z.object({ step_id: z.string(), field: z.string(), new_value: z.unknown() })).optional(),
          edits: z.array(z.object({ op: z.enum(["insert", "remove", "move"]), step: z.record(z.string(), z.unknown()).optional(), after: z.string().nullable().optional(), step_id: z.string().optional() })).optional(),
          definition: z.object({ steps: z.array(z.record(z.string(), z.unknown())), settings: z.record(z.string(), z.unknown()).optional() }).optional(),
          new_family: z.string().optional(),
        }),
      },
      async (a) =>
        wrap(async () => {
          const v = await versionCreate({ ...a, edits: a.edits as never, definition: a.definition });
          return { id: v.id, label: v.label, parentId: v.parentId, note: v.note, diff: v.diff };
        }),
    );
    server.registerTool(
      "propose_edit",
      { title: "Ask the prompt editor", description: "Sends a comment (for example 'Headlines must be 8 words or fewer') to the prompt editor model. Returns proposed changes, a reason and a diff. Nothing is saved; call create_version with the changes to save them.", inputSchema: z.object({ version_id: z.number().int(), step_id: z.string().optional(), comment: z.string(), run_story_id: z.number().int().optional().describe("A trace that shows the problem.") }) },
      async (a) => wrap(() => proposeEdit({ version_id: a.version_id, step_id: a.step_id, comment: a.comment, trace: a.run_story_id ? { run_story_id: a.run_story_id } : null })),
    );
    server.registerTool(
      "estimate_run",
      { title: "Estimate a run", description: "The estimated cost of a run before it starts (from past traces or the OpenRouter price list).", inputSchema: z.object({ version_id: z.number().int(), story_ids: z.array(z.number().int()).optional(), filter: filter.optional() }) },
      async (a) => wrap(() => runEstimate(a)),
    );
    server.registerTool(
      "start_run",
      { title: "Start a run", description: "Runs a version on 1 to 500 stories in the background. Returns the run id at once; poll get_run. Each model call is its own durable step.", inputSchema: z.object({ version_id: z.number().int(), story_ids: z.array(z.number().int()).optional(), filter: filter.optional(), author: z.string().optional(), note: z.string().optional(), generation_date: z.string().optional().describe("YYYY-MM-DD; default the job's run date.") }) },
      async (a) =>
        wrap(async () => {
          const r = await runStart({ version_id: a.version_id, story_ids: a.story_ids, filter: a.filter, author: a.author, note: a.note, overrides: a.generation_date ? { generation_date: a.generation_date } : undefined });
          return { run_id: r.runId, estimated_cost_usd: r.estimate.total, stories: r.estimate.stories };
        }),
    );
    server.registerTool(
      "get_run",
      { title: "Get a run", description: "A run's status, counts and one row per story: status, article title, subtitle and word count, the social posts, the ad copy, the check flags, the failing step and error, cost.", inputSchema: z.object({ run_id: z.number().int() }) },
      async (a) =>
        wrap(async () => {
          const r = await getRun(a.run_id);
          if (!r) throw new Error(`run ${a.run_id} not found`);
          return r;
        }),
    );
    server.registerTool(
      "get_trace",
      { title: "Get a trace", description: "One story's trace in one run: each step's status, the 'what it decided' line, model, tokens, cost, and (with full) the rendered messages, the inputs and the outputs. Give step_id for one step.", inputSchema: z.object({ run_id: z.number().int(), story_id: z.number().int(), step_id: z.string().optional(), full: z.boolean().optional().describe("Default true when step_id is given, else false.") }) },
      async (a) =>
        wrap(async () => {
          const rs = await runStoryFor(a.run_id, a.story_id);
          if (!rs) throw new Error(`story ${a.story_id} is not in run ${a.run_id}`);
          const t = await getTrace(rs, a.step_id);
          if (!t) throw new Error("no trace");
          const full = a.full ?? !!a.step_id;
          return { ...t, definition: undefined, steps: t.steps.map((s) => (full ? s : { ...s, body: undefined })) };
        }),
    );
    server.registerTool(
      "compare_traces",
      { title: "Compare two traces", description: "The same story in two runs (for example version 3.0 and 3.1), step by step: each step's prompt and output on both sides and whether they are the same.", inputSchema: z.object({ run_a: z.number().int(), run_b: z.number().int(), story_id: z.number().int() }) },
      async (a) =>
        wrap(async () => {
          const [x, y] = await Promise.all([runStoryFor(a.run_a, a.story_id), runStoryFor(a.run_b, a.story_id)]);
          if (!x || !y) throw new Error("the story is not in both runs");
          return compareTraces(x, y);
        }),
    );
    server.registerTool(
      "export_run",
      { title: "Export a run", description: "Links to download a run's results as CSV, Markdown or JSON (all traces).", inputSchema: z.object({ run_id: z.number().int() }) },
      async (a) => text({ csv: `/api/runs/${a.run_id}/results?format=csv`, markdown: `/api/runs/${a.run_id}/results?format=md`, json: `/api/runs/${a.run_id}/results?format=json`, note: "Paths are relative to this server's URL." }),
    );
    server.registerTool(
      "list_registry",
      { title: "List code functions", description: "The code functions a code step can call: name, description, inputs, outputs and a JSON schema of the parameters.", inputSchema: z.object({}) },
      async () => text(registry()),
    );
    server.registerResource("guide", "workbench://guide", { title: "Story Workbench team guide", mimeType: "text/markdown" }, async (uri) => ({ contents: [{ uri: uri.href, text: guideText() }] }));
  },
  { serverInfo: { name: "story-workbench", version: "1.0.0" } },
);

async function withCors(req: Request) {
  const res = await handler(req);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export { withCors as GET, withCors as POST, withCors as DELETE };
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
