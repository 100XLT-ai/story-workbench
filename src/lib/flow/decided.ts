// "What this step decided": one fixed line per known output, made by code.
// It is never a model call (§10b, P1).
import type { Step } from "../engine/types";

export const FOCUS_WORDS: Record<string, string> = {
  program: "an ongoing program",
  event: "an event",
  gift_grant: "a gift or grant",
  giving_record: "a giving record over time",
  contest_award: "a contest or award",
  community_response: "a community response",
};
export const TIME_WORDS: Record<string, string> = {
  upcoming: "upcoming",
  latest: "recent (the latest news)",
  this_year: "this year",
  multi_year: "multi-year",
};
export const ROLE_WORDS: Record<string, string> = {
  funder: "the sponsor funds it",
  doer: "the sponsor does the work",
  one_of_many: "the sponsor is one of many",
};
export const MECH_WORDS: Record<string, string> = {
  money: "money",
  cause_purchase: "purchases that fund the cause",
  matching: "matching gifts",
  fundraising: "fundraising",
  volunteering: "volunteering",
  in_kind: "in-kind gifts",
  none: "none",
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const len = (v: unknown) => (typeof v === "string" ? [...v].length : 0);
const cut = (s: unknown, n = 90) => {
  const t = typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const words = (s: unknown) => (typeof s === "string" ? s.trim().split(/\s+/).filter(Boolean).length : 0);

function one(name: string, v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (name === "statistics") return Array.isArray(v) ? `${v.length} background statistic${v.length === 1 ? "" : "s"}` : null;
  if (name === "payload" && isObj(v))
    return `Initiative: "${cut(v.InitiativeDetails, 70)}"; partner: ${v.CausePartnerName ?? "none"}; statistics: ${v.RelevantBackgroundStats ? "yes" : "none"}`;
  if (name === "article_raw" && isObj(v)) return `Wrote ${words(v.content)} words of markdown`;
  if (name === "title_check" && isObj(v))
    return v.heading_found ? `The headline has ${v.characters} characters: ${v.over_limit ? `over the ${v.max} limit, so it is shortened` : `within ${v.max}`}` : "No # headline found, so nothing to shorten";
  if (name === "headline_shorten") return `Short headline: "${cut(v)}" (${len(v)} characters)`;
  if (name === "article" && isObj(v)) return `"${cut(v.title, 70)}" · ${v.word_count} words · ${v.title_note}`;
  if (name === "raw_ledger" && isObj(v)) {
    const counts = (v.counts ?? {}) as Record<string, number>;
    const thin = (v.thin ?? {}) as { isThin?: boolean };
    return `${counts.claims ?? 0} claims, ${counts.quotes ?? 0} quotes, ${Array.isArray(v.conflicts) ? v.conflicts.length : 0} figure conflicts${thin.isThin ? "; thin" : ""}`;
  }
  if ((name === "labels_raw" || name === "labels_recrawl_raw") && isObj(v)) return `Labelled ${Array.isArray(v.labels) ? v.labels.length : 0} facts`;
  if (name === "prepared" && isObj(v)) {
    const labels = Object.values((v.labels ?? {}) as Record<string, { material?: string }>);
    const ledger = (v.ledger ?? {}) as { thin?: { isThin?: boolean; reasons?: string[] } };
    const company = labels.filter((l) => l.material === "company").length;
    return `${labels.length - company} cause facts, ${company} company facts; ${ledger.thin?.isThin ? `thin (${(ledger.thin.reasons ?? []).join("; ")})` : "not thin"}`;
  }
  if (name === "recrawl" && isObj(v)) return Number(v.count) > 0 ? `Added ${v.count} page${Number(v.count) === 1 ? "" : "s"} that name the beneficiary` : "No other page names the beneficiary; nothing added";
  if (name === "story_type" && isObj(v)) {
    const mech = Array.isArray(v.mechanisms) && v.mechanisms.length ? v.mechanisms.map((m) => MECH_WORDS[String(m)] ?? m).join(", ") : "none";
    return `About ${FOCUS_WORDS[String(v.focus)] ?? v.focus}; ${TIME_WORDS[String(v.time)] ?? v.time}; ${ROLE_WORDS[String(v.role)] ?? v.role}; how: ${mech}${v.windowRisk ? "; a date falls before publication" : ""}`;
  }
  if (name === "writer_input" && isObj(v)) {
    const lines = (s: unknown) => (typeof s === "string" && s.trim() && s.trim() !== "(none)" ? s.trim().split("\n").length : 0);
    return `${lines(v.facts)} fact lines, ${lines(v.company)} company lines, ${lines(v.quotes)} quotes; ${cut(v.thin, 60)}`;
  }
  if (name === "modules") return `${len(v)} characters of story-type rules`;
  if (name === "selection" && isObj(v)) {
    const use = Array.isArray(v.use_facts) ? v.use_facts.length : 0;
    const out = Array.isArray(v.left_out) ? v.left_out.length : 0;
    return `Angle: "${cut(v.angle, 80)}"; uses ${use} facts, leaves out ${out}`;
  }
  if (name === "writer_raw" && isObj(v)) return `Wrote ${Array.isArray(v.articles) ? v.articles.length : 0} options`;
  if (name === "writer_output" && isObj(v)) {
    const opts = Array.isArray(v.options) ? (v.options as { option: string; headline: string; body: string }[]) : [];
    return opts.map((o) => `${o.option}: "${cut(o.headline, 50)}" (${words(o.body)} words)`).join(" · ");
  }
  if (name === "checks" && isObj(v))
    return Object.entries(v as Record<string, { blockers: number; results: { result: string; severity: string }[] }>)
      .map(([o, r]) => `${o}: ${r.blockers} blocker${r.blockers === 1 ? "" : "s"}, ${r.results.filter((x) => x.result === "fail" && x.severity === "flag").length} flags`)
      .join(" · ");
  if (name === "short_title_check" && isObj(v)) return v.needed ? `The idea title has ${v.characters} characters (over ${v.max}), so production makes a short title` : `The idea title fits (${v.characters} characters)`;
  if (name === "short_title") return `Short title: "${cut(v)}"`;
  if (name === "social_data" && isObj(v)) {
    const st = (v.story ?? {}) as { title?: string };
    return `Social posts use the title "${cut(st.title, 60)}" and this run's article`;
  }
  if (/^social_\w+_prompt$/.test(name)) return `${len(v)} characters of prompt`;
  if (/^social_\w+_raw$/.test(name)) return `Reply of ${len(v)} characters`;
  if (name === "social_facebook_first" && isObj(v)) return `${v.characters}/${v.limit} characters${v.over_limit ? ": too long, so production asks again" : ": fits"}`;
  if (/^social_\w+$/.test(name) && isObj(v)) return `${v.characters ?? len(v.content)} characters${Array.isArray(v.hashtags) && v.hashtags.length ? `, ${v.hashtags.length} hashtags` : ""}${v.note ? `; ${v.note}` : ""}`;
  if (name === "ad_input" && isObj(v)) return `Vertical ${v.vertical}; angle: "${cut(v.angle, 70)}"`;
  if (name === "ad_prompt") return `${len(v)} characters of prompt`;
  if (name === "ad_raw") return `Reply of ${len(v)} characters`;
  if (name === "ad" && isObj(v)) return `Headline ${len(v.headline)} ch · subheadline ${len(v.subheadline)} ch · CTA "${v.cta}"`;
  if (typeof v === "string") return `${len(v)} characters of text`;
  if (Array.isArray(v)) return `${v.length} items`;
  if (isObj(v)) return `${Object.keys(v).length} fields`;
  return String(v);
}

export function decided(step: Step, status: string, reason: string | null, output: Record<string, unknown>): string {
  if (status === "skipped") return reason ?? "skipped";
  if (status === "failed") return "failed";
  const parts = step.outputs.map((o) => one(o, output[o])).filter((x): x is string => !!x);
  return parts.join(" · ") || "done";
}
