import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const PROMPT_EDITOR_SYSTEM = `You are the prompt editor of Story Workbench. A person wants to change a writer workflow. You get the whole version (all steps as JSON), the target step (or "all"), the person's comment and, sometimes, a trace that shows the problem.

Return the smallest set of changes that does what the comment asks. Change prompt fields only (system, user), unless the comment asks for a model, a setting or a step change; then you may change model, temperature, maxTokens, reasoning or format.
Keep every {{token}} that the prompt needs. Do not invent new tokens: a token must name a story input (story, org, brand, pages, other_pages, crawl_rows, settings) or an output of an earlier step.
For a code step, you may change one key of its params with field "params.<key>".
new_value is the full new value of the field, not a diff.

Return JSON only:
{"changes":[{"step_id":"","field":"user","new_value":""}],"reason":"one paragraph: what you changed and why"}`;

export const ASK_SYSTEM = `You turn a plain request about stories into a filter for the Story Workbench table. Return JSON only: {"filter":[{"field":"","op":"","value":null}],"explanation":""}.
Ops: eq, ne, lt, lte, gt, gte, in (value is a list), contains (text), is_null, not_null. All clauses are joined by AND.
Fields (name: type): {{fields}}
Rules:
- "top ranked" or "rank 1" means rank eq 1. "winner" or "winning" means winner eq true.
- "no quotes" means quote_count eq 0. "one quote or none" means quote_count lte 1.
- "rank 3 or 5" means rank in [3,5].
- "runnable by v3" means runnable_v3 eq true. "runnable by production" means runnable_production eq true.
- A sponsor name goes to sponsor_name contains. A publisher goes to publisher_name contains.
- Use only the fields above. If a part of the request has no field, leave it out and say so in the explanation.`;

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  prompt_editor_system: PROMPT_EDITOR_SYSTEM,
  prompt_editor_model: "anthropic/claude-opus-4.6",
  ask_system: ASK_SYSTEM,
  ask_model: "google/gemini-3-flash-preview",
  run_concurrency: 8,
  default_models: [
    "google/gemini-3-flash-preview",
    "google/gemini-3.5-flash",
    "google/gemini-2.5-flash",
    "anthropic/claude-opus-4.6",
    "anthropic/claude-sonnet-4.5",
    "openai/gpt-5",
  ],
};

/** The newest value of a setting (each change is a new row, so the history stays). */
export async function getSetting(key: string): Promise<unknown> {
  const [row] = await db().select().from(schema.settings).where(eq(schema.settings.key, key)).orderBy(desc(schema.settings.id)).limit(1);
  return row ? row.value : DEFAULT_SETTINGS[key];
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  const rows = await db().select().from(schema.settings).orderBy(schema.settings.id);
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function setSetting(key: string, value: unknown, author: string): Promise<void> {
  if (!(key in DEFAULT_SETTINGS)) throw new Error(`unknown setting "${key}"`);
  await db().insert(schema.settings).values({ key, value: value as never, author: author || "api" });
}

export async function settingHistory(key: string) {
  return db().select().from(schema.settings).where(eq(schema.settings.key, key)).orderBy(desc(schema.settings.id)).limit(50);
}
