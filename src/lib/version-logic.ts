import { validateVersion, type ValidationIssue } from "./engine/execute";
import type { Step, VersionDefinition } from "./engine/types";

export class VersionError extends Error {
  constructor(
    message: string,
    public issues: ValidationIssue[] = [],
  ) {
    super(message);
  }
}

export interface StepChange {
  step_id: string;
  /** A step field (system, user, model, temperature, maxTokens, reasoning, format, when, name, purpose, inputs, outputs) or params.<key>. */
  field: string;
  new_value: unknown;
}

export interface StepEdit {
  /** Insert a new step after this id ("" or null: at the start). */
  op: "insert" | "remove" | "move";
  step?: Step;
  after?: string | null;
  step_id?: string;
}

export const numberOf = (v: { major: number; minor: number }) => `${v.major}.${v.minor}`;
export const labelOf = (family: string, v: { major: number; minor: number; author: string }) => `${family} ${numberOf(v)} (${v.author})`;

/** The next free number in a family: the next minor of the family's major (§4). */
export function nextNumber(existing: { major: number; minor: number }[], major: number): { major: number; minor: number } {
  const minors = existing.filter((v) => v.major === major).map((v) => v.minor);
  return { major, minor: minors.length ? Math.max(...minors) + 1 : 0 };
}

const STEP_FIELDS = new Set(["system", "user", "model", "temperature", "maxTokens", "reasoning", "format", "when", "name", "purpose", "inputs", "outputs", "fn", "id", "part"]);

/** Applies field changes and step edits to a definition; returns a new definition. */
export function applyChanges(def: VersionDefinition, changes: StepChange[] = [], edits: StepEdit[] = []): VersionDefinition {
  const next: VersionDefinition = structuredClone(def);
  for (const e of edits) {
    if (e.op === "insert") {
      if (!e.step) throw new VersionError("insert needs a step");
      const at = e.after ? next.steps.findIndex((s) => s.id === e.after) : -1;
      if (e.after && at < 0) throw new VersionError(`no step "${e.after}" to insert after`);
      next.steps.splice(at + 1, 0, e.step);
    } else if (e.op === "remove") {
      const at = next.steps.findIndex((s) => s.id === e.step_id);
      if (at < 0) throw new VersionError(`no step "${e.step_id}" to remove`);
      next.steps.splice(at, 1);
    } else if (e.op === "move") {
      const at = next.steps.findIndex((s) => s.id === e.step_id);
      if (at < 0) throw new VersionError(`no step "${e.step_id}" to move`);
      const [s] = next.steps.splice(at, 1);
      const to = e.after ? next.steps.findIndex((x) => x.id === e.after) : -1;
      if (e.after && to < 0) throw new VersionError(`no step "${e.after}" to move after`);
      next.steps.splice(to + 1, 0, s);
    }
  }
  for (const c of changes) {
    if (c.step_id === "*settings*" || c.step_id === "settings") {
      next.settings = { ...next.settings, [c.field]: c.new_value };
      continue;
    }
    const step = next.steps.find((s) => s.id === c.step_id);
    if (!step) throw new VersionError(`no step "${c.step_id}"`);
    if (c.field.startsWith("params.")) {
      if (step.kind !== "code") throw new VersionError(`step "${c.step_id}" is not a code step; it has no params`);
      step.params = { ...(step.params ?? {}), [c.field.slice(7)]: c.new_value };
    } else if (STEP_FIELDS.has(c.field)) {
      (step as unknown as Record<string, unknown>)[c.field] = c.new_value;
    } else {
      throw new VersionError(`"${c.field}" is not a field that can change`);
    }
  }
  return next;
}

export interface FieldDiff {
  step_id: string;
  field: string;
  before: unknown;
  after: unknown;
}

/** Every changed field between two definitions (for the save dialog and the compare page). */
export function diffDefinitions(a: VersionDefinition, b: VersionDefinition): FieldDiff[] {
  const out: FieldDiff[] = [];
  const byA = new Map(a.steps.map((s) => [s.id, s]));
  const byB = new Map(b.steps.map((s) => [s.id, s]));
  const orderA = a.steps.map((s) => s.id).join(" → ");
  const orderB = b.steps.map((s) => s.id).join(" → ");
  if (orderA !== orderB) out.push({ step_id: "(order)", field: "steps", before: orderA, after: orderB });
  for (const [id, sb] of byB) {
    const sa = byA.get(id);
    if (!sa) {
      out.push({ step_id: id, field: "(added)", before: null, after: sb });
      continue;
    }
    const keys = new Set([...Object.keys(sa), ...Object.keys(sb)]);
    for (const k of keys) {
      const va = (sa as unknown as Record<string, unknown>)[k];
      const vb = (sb as unknown as Record<string, unknown>)[k];
      if (k === "params" && va && vb) {
        const pk = new Set([...Object.keys(va as object), ...Object.keys(vb as object)]);
        for (const p of pk) {
          const pa = (va as Record<string, unknown>)[p];
          const pb = (vb as Record<string, unknown>)[p];
          if (JSON.stringify(pa) !== JSON.stringify(pb)) out.push({ step_id: id, field: `params.${p}`, before: pa, after: pb });
        }
        continue;
      }
      if (JSON.stringify(va) !== JSON.stringify(vb)) out.push({ step_id: id, field: k, before: va ?? null, after: vb ?? null });
    }
  }
  for (const [id, sa] of byA) if (!byB.has(id)) out.push({ step_id: id, field: "(removed)", before: sa, after: null });
  if (JSON.stringify(a.settings) !== JSON.stringify(b.settings)) out.push({ step_id: "(settings)", field: "settings", before: a.settings, after: b.settings });
  return out;
}

export function checkDefinition(def: unknown): VersionDefinition {
  if (typeof def !== "object" || def === null || !Array.isArray((def as VersionDefinition).steps))
    throw new VersionError("A definition is { steps: [...], settings: {...} }.");
  const d = def as VersionDefinition;
  const issues = validateVersion({ steps: d.steps, settings: d.settings ?? {} });
  if (issues.length) throw new VersionError(issues.map((i) => i.message).join("\n"), issues);
  return { steps: d.steps, settings: d.settings ?? {} };
}

