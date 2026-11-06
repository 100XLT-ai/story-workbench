import { getRun, getTrace } from "../service";
import type { StorySummary } from "./summary";

const PLATFORMS = ["facebook", "instagram", "linkedin", "x"];

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

type Run = NonNullable<Awaited<ReturnType<typeof getRun>>>;

export function runCsv(run: Run): string {
  // Social outputs of added steps (summary.ts keys them by name after "social_").
  const extra = [...new Set(run.stories.flatMap((s) => Object.keys((s.summary as StorySummary | null)?.social ?? {})))].filter((k) => !PLATFORMS.includes(k));
  const head = [
    "story_id", "status", "sponsor", "story_headline", "article_title", "article_subtitle", "word_count", "article_content",
    ...PLATFORMS.map((p) => `${p}_post`), ...extra.map((k) => `social_${k}`), "ad_headline", "ad_subheadline", "ad_cta", "check_blockers", "check_flags",
    "failed_step", "error", "cost_usd", "seconds",
  ];
  const lines = [head.join(",")];
  for (const s of run.stories) {
    const sum = (s.summary ?? null) as StorySummary | null;
    lines.push(
      [
        s.storyId, s.status, s.sponsor, s.headline, sum?.article?.title, sum?.article?.subtitle, sum?.article?.word_count, sum?.article?.content,
        ...PLATFORMS.map((p) => sum?.social?.[p]?.content ?? ""),
        ...extra.map((k) => sum?.social?.[k]?.content ?? ""),
        sum?.ad?.headline, sum?.ad?.subheadline, sum?.ad?.cta,
        sum?.checks?.map((c) => `${c.option}:${c.blockers}`).join(" "),
        sum?.checks?.map((c) => `${c.option}: ${c.flags.join("; ")}`).join(" | "),
        s.failedStep, s.error, s.cost?.toFixed(6), s.seconds,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

/** One section per story, in the layout of .plan/story-v3/story-writer-arms-gemini-stories.md. */
export async function runMarkdown(run: Run): Promise<string> {
  const out: string[] = [];
  out.push(`# Story Workbench run ${run.id}: ${run.version?.label ?? ""}`);
  out.push("");
  out.push(`Made ${run.createdAt.slice(0, 10)} by ${run.author}. ${run.storyCount} stories. Real cost $${run.cost.toFixed(4)}. Status: ${run.status}.`);
  out.push("");
  for (const s of run.stories) {
    const sum = (s.summary ?? null) as StorySummary | null;
    const trace = await getTrace(s.runStoryId);
    const models = [...new Set((trace?.steps ?? []).filter((t) => t.kind === "prompt" && t.status === "done").map((t) => `\`${t.model}\``))].join(", ");
    out.push(`## ${s.sponsor ?? "Story"} (story ${s.storyId}) · ${run.version?.label ?? ""}`);
    out.push("");
    out.push(`Story: ${s.headline ?? "(no headline)"}. Status: ${s.status}.`);
    out.push("");
    out.push("### Article");
    out.push("");
    if (s.status === "failed") out.push(`- **Failed at:** ${s.failedStep}: ${s.error}`);
    out.push(`- **Length:** ${sum?.article?.word_count ?? 0} words`);
    out.push(`- **Models:** ${models || "none"}`);
    out.push(`- **Cost:** $${(s.cost ?? 0).toFixed(4)}`);
    if (sum?.checks) out.push(`- **Code checks:** ${sum.checks.map((c) => `${c.option} ${c.blockers} blockers${c.flags.length ? ` (${c.flags.join("; ")})` : ""}`).join(" · ")}`);
    out.push("");
    if (sum?.article) {
      out.push(`**${sum.article.title}**`);
      out.push("");
      if (sum.article.subtitle) {
        out.push(`*${sum.article.subtitle}*`);
        out.push("");
      }
      out.push(sum.article.content);
      out.push("");
      if (sum.article.cta) {
        out.push(`CTA: ${sum.article.cta}`);
        out.push("");
      }
    }
    out.push("### Social posts");
    out.push("");
    for (const [p, post] of Object.entries(sum?.social ?? {})) {
      out.push(`**${p}** (${post?.characters ?? 0} characters)`);
      out.push("");
      out.push(post?.content ?? "(none)");
      out.push("");
    }
    out.push("### Ad copy");
    out.push("");
    if (sum?.ad) {
      out.push(`- **Headline:** ${sum.ad.headline}`);
      out.push(`- **Subheadline:** ${sum.ad.subheadline}`);
      out.push(`- **CTA:** ${sum.ad.cta}`);
    } else out.push("(none)");
    out.push("");
  }
  return out.join("\n");
}

export async function runJson(run: Run) {
  const traces = [];
  for (const s of run.stories) traces.push(await getTrace(s.runStoryId));
  return { run, traces };
}
