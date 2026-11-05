import type { Context } from "./types";

export type TokenFilter = "json" | "json1" | "json2";

export interface TemplateToken {
  raw: string;
  path: string;
  root: string;
  filter: TokenFilter | null;
}

const TOKEN = /\{\{\s*([A-Za-z_][\w]*(?:\.[\w]+)*)\s*(?:\|\s*(json|json1|json2)\s*)?\}\}/g;

/** Every `{{token}}` in a template, in order, without duplicates. */
export function templateTokens(template: string): TemplateToken[] {
  const seen = new Set<string>();
  const out: TemplateToken[] = [];
  for (const m of template.matchAll(TOKEN)) {
    if (seen.has(m[0])) continue;
    seen.add(m[0]);
    out.push({
      raw: m[0],
      path: m[1],
      root: m[1].split(".")[0],
      filter: (m[2] as TokenFilter | undefined) ?? null,
    });
  }
  return out;
}

/** Reads `a.b.c` from the context. Undefined when a part is missing. */
export function getPath(ctx: Context, path: string): unknown {
  let cur: unknown = ctx;
  for (const part of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur) && /^\d+$/.test(part)) {
      cur = cur[Number(part)];
      continue;
    }
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export class TemplateError extends Error {}

function format(value: unknown, token: TemplateToken): string {
  if (token.filter === "json") return JSON.stringify(value) ?? "null";
  if (token.filter === "json1") return JSON.stringify(value, null, 1) ?? "null";
  if (token.filter === "json2") return JSON.stringify(value, null, 2) ?? "null";
  if (value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  throw new TemplateError(
    `${token.raw} is not text. Add a filter: {{${token.path}|json}}, |json1 or |json2.`,
  );
}

/**
 * Fills every token in one pass over the template. Inserted text is never
 * scanned again (the same rule as longtale-core's fillTemplate and
 * substituteTokens).
 */
export function renderTemplate(template: string, ctx: Context): string {
  return template.replace(TOKEN, (raw, path: string, filter?: string) => {
    const token: TemplateToken = {
      raw,
      path,
      root: path.split(".")[0],
      filter: (filter as TokenFilter | undefined) ?? null,
    };
    const value = getPath(ctx, path);
    if (value === undefined)
      throw new TemplateError(`${raw} has no value in the context.`);
    return format(value, token);
  });
}
