import type { Context, VersionDefinition } from "../engine/types";

export interface StorySummary {
  article: { title: string; subtitle: string; word_count: number; content: string; cta: string | null } | null;
  social: Record<string, { content: string; characters: number; hashtags: unknown[] } | null>;
  ad: { headline: string; subheadline: string; cta: string } | null;
  checks: { option: string; blockers: number; flags: string[] }[] | null;
}

const PLATFORMS = ["facebook", "instagram", "linkedin", "x"];

/** The results-table row of one story, read from the context by code (never a model). */
export function storySummary(ctx: Context, def: VersionDefinition): StorySummary {
  const a = ctx.article as { title?: string; subtitle?: string; word_count?: number; content?: string; cta?: string | null } | null | undefined;
  const social: StorySummary["social"] = {};
  const names = new Set(def.steps.flatMap((s) => s.outputs));
  for (const p of PLATFORMS) {
    const v = ctx[`social_${p}`] as { content?: string; characters?: number; hashtags?: unknown[] } | null | undefined;
    if (names.has(`social_${p}`)) social[p] = v && typeof v.content === "string" ? { content: v.content, characters: v.characters ?? [...v.content].length, hashtags: v.hashtags ?? [] } : null;
  }
  // Any added step that writes a social_* text output shows too.
  for (const n of names) {
    if (n.startsWith("social_") && !PLATFORMS.some((p) => n.startsWith(`social_${p}`)) && typeof ctx[n] === "string") {
      const text = ctx[n] as string;
      social[n.slice(7)] = { content: text, characters: [...text].length, hashtags: [] };
    }
  }
  const ad = ctx.ad as { headline?: string; subheadline?: string; cta?: string } | null | undefined;
  const checks = ctx.checks as Record<string, { blockers: number; results: { check: string; severity: string; result: string }[] }> | null | undefined;
  return {
    article: a ? { title: a.title ?? "", subtitle: a.subtitle ?? "", word_count: a.word_count ?? 0, content: a.content ?? "", cta: a.cta ?? null } : null,
    social,
    ad: ad ? { headline: ad.headline ?? "", subheadline: ad.subheadline ?? "", cta: ad.cta ?? "" } : null,
    checks: checks
      ? Object.entries(checks).map(([option, r]) => ({
          option,
          blockers: r.blockers,
          flags: r.results.filter((x) => x.result === "fail").map((x) => `${x.severity}: ${x.check}`),
        }))
      : null,
  };
}
