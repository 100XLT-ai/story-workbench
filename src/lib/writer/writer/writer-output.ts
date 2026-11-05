export interface WriterOption {
  option: "grounded" | "upbeat";
  headline: string;
  subhead: string;
  body: string;
  cta: string | null;
  ctaDerived: boolean;
  headlineNote: string | null;
  reserveUsed: string[];
  claims: { span: string; claim_ids: string[] }[];
}

export interface WriterOutput {
  plan: Record<string, unknown>;
  options: WriterOption[];
  conflicts: string[];
  shortReason: string | null;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const s = (v: unknown): string => (typeof v === "string" ? v : "");
const sOrNull = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : null;
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Strips code fences and parses the model's JSON text. */
export function parseJsonText(text: string): unknown {
  let t = text.trim();
  const fenced = t.match(/```(?:json)?([\s\S]*?)```/i);
  if (fenced) t = fenced[1].trim();
  const start = t.indexOf("{");
  if (start < 0) return JSON.parse(t);
  return JSON.parse(t.slice(start, firstObjectEnd(t, start) + 1));
}

// why: models sometimes write a second object or reasoning text after the JSON; read only the first object.
function firstObjectEnd(t: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return i;
  }
  return t.length - 1;
}

/** Validates the writer JSON into options; throws when no option has a body. */
export function parseWriterOutput(raw: unknown): WriterOutput {
  if (!isObj(raw)) throw new Error("writer output is not an object");
  const options = (Array.isArray(raw.options) ? raw.options : [])
    .filter(isObj)
    .map(
      (o): WriterOption => ({
        option: o.option === "upbeat" ? "upbeat" : "grounded",
        headline: s(o.headline),
        subhead: s(o.subhead),
        body: s(o.body).replace(/\\n/g, "\n"),
        cta: sOrNull(o.cta),
        ctaDerived: o.cta_derived !== false,
        headlineNote: sOrNull(o.headline_note),
        reserveUsed: strings(o.reserve_used),
        claims: (Array.isArray(o.claims) ? o.claims : [])
          .filter(isObj)
          .map((c) => ({ span: s(c.span), claim_ids: strings(c.claim_ids) })),
      }),
    );
  if (!options.some((o) => o.body.trim()))
    throw new Error("writer output has no article body");
  return {
    plan: isObj(raw.plan) ? raw.plan : {},
    options,
    conflicts: strings(raw.conflicts),
    shortReason: sOrNull(raw.short_reason),
  };
}

/** Markdown for one option, in the shape the article store expects. */
export function optionToMarkdown(option: WriterOption): string {
  return [
    `# ${option.headline}`,
    option.subhead ? `*${option.subhead}*` : null,
    option.body.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
}
