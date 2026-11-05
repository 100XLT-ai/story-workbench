import { getPath } from "./template";
import type { Context, FilterClause, FilterOp } from "./types";

export const FILTER_OPS: FilterOp[] = [
  "eq",
  "ne",
  "lt",
  "lte",
  "gt",
  "gte",
  "in",
  "contains",
  "is_null",
  "not_null",
];

const OP_WORDS: Record<FilterOp, string> = {
  eq: "is",
  ne: "is not",
  lt: "<",
  lte: "≤",
  gt: ">",
  gte: "≥",
  in: "is one of",
  contains: "contains",
  is_null: "is empty",
  not_null: "is not empty",
};

export function isFilterClause(v: unknown): v is FilterClause {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.field === "string" &&
    typeof o.op === "string" &&
    (FILTER_OPS as string[]).includes(o.op)
  );
}

/** Parses an unknown value into a filter list, or throws with a clear message. */
export function parseFilter(v: unknown): FilterClause[] {
  if (v === undefined || v === null || v === "") return [];
  const list = typeof v === "string" ? (JSON.parse(v) as unknown) : v;
  if (!Array.isArray(list)) throw new Error("A filter is a list of { field, op, value }.");
  return list.map((c, i) => {
    if (!isFilterClause(c))
      throw new Error(
        `Filter clause ${i + 1} is not valid. Use { field, op, value } with op one of ${FILTER_OPS.join(", ")}.`,
      );
    if (c.op === "in" && !Array.isArray(c.value))
      throw new Error(`Filter clause ${i + 1}: "in" needs a list value.`);
    return c;
  });
}

const isEmpty = (v: unknown) =>
  v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/** True when one value passes one clause. */
export function testClause(value: unknown, c: FilterClause): boolean {
  switch (c.op) {
    case "is_null":
      return isEmpty(value);
    case "not_null":
      return !isEmpty(value);
    case "eq":
      return value === c.value || (value != null && c.value != null && String(value) === String(c.value));
    case "ne":
      return !(value === c.value || (value != null && c.value != null && String(value) === String(c.value)));
    case "lt":
    case "lte":
    case "gt":
    case "gte": {
      if (value === null || value === undefined) return false;
      const a = typeof value === "number" ? value : Number(value);
      const b = typeof c.value === "number" ? c.value : Number(c.value);
      if (Number.isNaN(a) || Number.isNaN(b)) {
        const sa = String(value);
        const sb = String(c.value);
        return c.op === "lt" ? sa < sb : c.op === "lte" ? sa <= sb : c.op === "gt" ? sa > sb : sa >= sb;
      }
      return c.op === "lt" ? a < b : c.op === "lte" ? a <= b : c.op === "gt" ? a > b : a >= b;
    }
    case "in":
      return Array.isArray(c.value) && c.value.some((x) => x === value || String(x) === String(value));
    case "contains":
      if (Array.isArray(value)) return value.some((x) => String(x).toLowerCase().includes(String(c.value).toLowerCase()));
      return value != null && String(value).toLowerCase().includes(String(c.value ?? "").toLowerCase());
  }
}

/** Evaluates a `when` list on the context. Returns the reason in plain words. */
export function evaluateWhen(
  when: FilterClause[] | undefined,
  ctx: Context,
): { run: boolean; reason: string } {
  if (!when || when.length === 0) return { run: true, reason: "always runs" };
  const parts: string[] = [];
  for (const c of when) {
    const value = getPath(ctx, c.field);
    const ok = testClause(value, c);
    const shown = value === undefined ? "missing" : JSON.stringify(value);
    const text = `${describeClause(c)} (value: ${shown && shown.length > 80 ? `${shown.slice(0, 77)}...` : shown})`;
    if (!ok) return { run: false, reason: `skipped: needs ${text}` };
    parts.push(text);
  }
  return { run: true, reason: `runs: ${parts.join(" and ")}` };
}

export function describeClause(c: FilterClause): string {
  if (c.op === "is_null" || c.op === "not_null") return `${c.field} ${OP_WORDS[c.op]}`;
  return `${c.field} ${OP_WORDS[c.op]} ${JSON.stringify(c.value)}`;
}
