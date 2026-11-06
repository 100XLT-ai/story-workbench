import { evaluateWhen, describeClause } from "./filter";
import { reasoningFor, runCode, skippedOutputs, stepReads } from "./execute";
import { getPath, templateTokens, type TemplateToken } from "./template";
import type { Context, PromptStep, Step, VersionDefinition } from "./types";

/** A value that only a model call (or a step after one) makes. The preview shows it as a named slot. */
export interface Slot {
  name: string;
  /** 1-based step number that makes the value. */
  fromStep: number;
  fromName: string;
  /** The model step this value waits on, when the maker is a code step after one. */
  waitsOn?: { step: number; name: string };
}

export interface PreviewMessage {
  role: "system" | "user";
  content: string;
}

export interface PreviewStep {
  index: number;
  id: string;
  name: string;
  kind: Step["kind"];
  /** ready: every value is known. slots: some values come from a model call. skipped: the `when` is false. waits: the `when` needs a model output. error: the step fails on these inputs. */
  status: "ready" | "slots" | "skipped" | "waits" | "error";
  reason: string;
  model?: string;
  reasoning?: Record<string, unknown> | null;
  temperature?: number | null;
  maxTokens?: number | null;
  messages?: PreviewMessage[];
  /** About 4 characters per token, for the rendered messages (an estimate, not a tokenizer). */
  tokens?: number;
  slots: Slot[];
  /** Code steps that ran: their outputs, for the reader. */
  outputs?: Record<string, unknown>;
  error?: string;
}

const TOKEN = /\{\{\s*([A-Za-z_][\w]*(?:\.[\w]+)*)\s*(?:\|\s*(json|json1|json2)\s*)?\}\}/g;

export const slotText = (s: Slot) => `⟦${s.name}: from step ${s.fromStep} "${s.fromName}"${s.waitsOn ? `, after model step ${s.waitsOn.step} "${s.waitsOn.name}"` : ""}⟧`;

function format(value: unknown, token: Pick<TemplateToken, "raw" | "path" | "filter">): string {
  if (token.filter === "json") return JSON.stringify(value) ?? "null";
  if (token.filter === "json1") return JSON.stringify(value, null, 1) ?? "null";
  if (token.filter === "json2") return JSON.stringify(value, null, 2) ?? "null";
  if (value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  throw new Error(`${token.raw} is not text. Add a filter: {{${token.path}|json}}.`);
}

/** renderTemplate with one change: a token whose root is a slot becomes the slot's label. */
function renderWithSlots(template: string, ctx: Context, slots: Map<string, Slot>): string {
  return template.replace(TOKEN, (raw, path: string, filter?: string) => {
    const slot = slots.get(path.split(".")[0]);
    if (slot) return path.includes(".") ? `${slotText(slot).slice(0, -1)} → ${path.split(".").slice(1).join(".")}⟧` : slotText(slot);
    const value = getPath(ctx, path);
    if (value === undefined) throw new Error(`${raw} has no value in the context.`);
    return format(value, { raw, path, filter: (filter as TemplateToken["filter"]) ?? null });
  });
}

export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/**
 * Renders what every step of a version receives for one story, with no model call.
 * Code steps run when all their inputs are known (they are deterministic). A value that a
 * model step makes, or that a code step makes from one, is a named slot.
 */
export function previewVersion(def: VersionDefinition, inputs: Context): PreviewStep[] {
  const ctx: Context = { ...inputs };
  const slots = new Map<string, Slot>();
  const out: PreviewStep[] = [];

  def.steps.forEach((step, i) => {
    const index = i + 1;
    const reads = stepReads(step);
    const used = [...new Set(reads.map((r) => slots.get(r)).filter((s): s is Slot => !!s))];
    const base = { index, id: step.id, name: step.name, kind: step.kind, slots: used } as const;
    const model =
      step.kind === "prompt"
        ? { model: step.model, reasoning: reasoningFor(step) ?? null, temperature: step.temperature, maxTokens: step.maxTokens }
        : {};
    const makeSlots = (waitsOn?: Slot["waitsOn"]) => {
      for (const name of step.outputs) slots.set(name, { name, fromStep: index, fromName: step.name, waitsOn });
    };
    const firstModel = used.find((s) => !s.waitsOn) ?? used[0];
    const waitsOn = firstModel ? (firstModel.waitsOn ?? { step: firstModel.fromStep, name: firstModel.fromName }) : undefined;

    // The `when` condition.
    const whenSlot = (step.when ?? []).map((c) => ({ c, s: slots.get(c.field.split(".")[0]) })).find((x) => x.s);
    if (whenSlot?.s) {
      out.push({ ...base, ...model, status: "waits", reason: `depends on ${describeClause(whenSlot.c)}: ${slotText(whenSlot.s)}` });
      makeSlots(waitsOn ?? { step: whenSlot.s.fromStep, name: whenSlot.s.fromName });
      return;
    }
    const decision = evaluateWhen(step.when, ctx);
    if (!decision.run) {
      Object.assign(ctx, skippedOutputs(step, ctx));
      out.push({ ...base, ...model, status: "skipped", reason: decision.reason });
      return;
    }

    if (step.kind === "prompt") {
      const p = step as PromptStep;
      try {
        const messages: PreviewMessage[] = [];
        if (p.system !== null && p.system !== undefined && p.system !== "") messages.push({ role: "system", content: renderWithSlots(p.system, ctx, slots) });
        messages.push({ role: "user", content: renderWithSlots(p.user, ctx, slots) });
        const tokens = messages.reduce((t, m) => t + estimateTokens(m.content), 0);
        out.push({ ...base, ...model, status: used.length ? "slots" : "ready", reason: decision.reason, messages, tokens });
      } catch (e) {
        out.push({ ...base, ...model, status: "error", reason: decision.reason, error: e instanceof Error ? e.message : String(e) });
      }
      makeSlots();
      return;
    }

    if (used.length) {
      out.push({ ...base, status: "slots", reason: `${decision.reason}; it runs after ${slotText(firstModel!)}` });
      makeSlots(waitsOn);
      return;
    }
    try {
      const result = runCode(step, ctx);
      Object.assign(ctx, result);
      out.push({ ...base, status: "ready", reason: decision.reason, outputs: result });
    } catch (e) {
      out.push({ ...base, status: "error", reason: decision.reason, error: e instanceof Error ? e.message : String(e) });
      makeSlots();
    }
  });
  return out;
}

/** Tokens that read a page's raw text. No seed prompt has one; the preview reports any. */
export function pageTextTokens(def: VersionDefinition): { stepId: string; token: string }[] {
  const hits: { stepId: string; token: string }[] = [];
  for (const s of def.steps) {
    if (s.kind !== "prompt") continue;
    for (const t of [...templateTokens(s.system ?? ""), ...templateTokens(s.user)]) {
      if (["pages", "other_pages"].includes(t.root)) hits.push({ stepId: s.id, token: t.raw });
    }
  }
  return hits;
}
