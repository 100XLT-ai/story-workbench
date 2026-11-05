// Ported from longtale-core at 136fa4ac:
//   apps/api/scripts/story-writer-test/harness.lib.ts (ledgerInputFor, recrawlPages,
//     armAPayload, splitMarkdown, selectionSystemTemplate, buildSelectionMessages, sourceTextFor)
//   apps/api/src/api/modules/story-writer/story-writer.service.ts (impactsFromCauseSignal)
//   apps/api/src/api/modules/openrouter/openrouter.service.ts (generateStatistics prompt and parse)
//   apps/api/src/api/modules/story/story.service.ts (enforceArticleTitleLimit, capTitle, generateShortStoryTitle)
// The logic is the same; only the input types are the app's own.
import { dedupePages } from "./ledger/fact-ledger";
import type { LedgerImpactInput, LedgerInput, LedgerPageInput } from "./ledger/ledger.types";
import { normalizeText } from "./ledger/text-utils";

export const RECRAWL_PAGES = 3;
export const ARTICLE_TITLE_MAX_LEN = 45;
export const SHORT_STORY_TITLE_MAX_LEN = 35;

export interface LoadedPage extends LedgerPageInput {
  planted?: boolean;
}

export interface Winner {
  id: string;
  description: string | null;
  beneficiary: string | null;
  evidenceQuote: string | null;
  impactTypePrimary: string | null;
  impactValueRaw: number | null;
  impactValueUnit: string | null;
  storyHeadline: string | null;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Maps the stored cause_signal impacts of a page extract to ledger impacts. */
export function impactsFromCauseSignal(causeSignal: unknown): LedgerImpactInput[] {
  if (!isObj(causeSignal) || !Array.isArray(causeSignal.impacts)) return [];
  return causeSignal.impacts.filter(isObj).map((i) => ({
    activity: str(i.activity),
    beneficiary: str(i.beneficiary),
    eventDate: str(i.eventDate),
    evidenceQuote: str(i.evidenceQuote),
    valueRaw: num(i.impactValueRaw),
    valueUnit: str(i.impactValueUnit),
    typePrimary: str(i.impactTypePrimary),
  }));
}

/** The stored pages of the same job that name the beneficiary: the offline stand-in for a re-crawl. */
export function recrawlPages(
  beneficiary: string | null,
  otherPages: LoadedPage[],
  limit = RECRAWL_PAGES,
): LoadedPage[] {
  const name = normalizeText(beneficiary ?? "").toLowerCase();
  const key = name
    .split(" ")
    .filter((w) => w.length > 3)
    .slice(0, 3)
    .join(" ");
  if (!key) return [];
  return otherPages
    .map((p) => ({
      p,
      hits: (
        normalizeText(p.markdown ?? "")
          .toLowerCase()
          .match(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []
      ).length,
    }))
    .filter((x) => x.hits > 0 && (x.p.facts.length || x.p.impacts.length))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit)
    .map((x) => x.p);
}

export function ledgerInputFor(
  sponsor: string,
  aliases: string[],
  programs: string[],
  generationDate: string,
  pages: LoadedPage[],
): LedgerInput {
  return {
    sponsorName: sponsor,
    sponsorAliases: [...aliases, ...programs],
    generationDate,
    pages,
  };
}

/** Arm A: the 13-key payload getDataForLLM builds today, from the same winner columns. */
export function armAPayload(
  org: { name: string; description: string | null },
  w: Winner,
  generatedStatistics: unknown,
): Record<string, unknown> {
  const label = w.impactTypePrimary ? w.impactTypePrimary.replace(/_/g, " ") : "impact";
  const unit = w.impactValueUnit ? ` ${w.impactValueUnit}` : "";
  const initiative =
    [w.description, w.impactValueRaw !== null ? `${label}: ${w.impactValueRaw}${unit}` : null]
      .filter(Boolean)
      .join(" — ") || null;
  const stats =
    w.impactTypePrimary && w.impactValueRaw !== null
      ? `${label}: ${w.impactValueRaw}${unit}`
      : generatedStatistics;
  return {
    BrandName: org.name,
    BrandCoreBusiness: org.description,
    CausePartnerName: w.beneficiary,
    CausePartnerMission: null,
    InitiativeDetails: initiative,
    missionAndGoals: null,
    storyAssets: [],
    Perspective: null,
    PerspectiveQuote: w.evidenceQuote,
    RelevantBackgroundStats: stats,
    CallToActionLink: null,
    DesiredWordCount: 300,
    KeyThemesToEmphasize: null,
  };
}

/** Splits the production markdown into headline and body. */
export function splitMarkdown(markdown: string): { headline: string; subhead: string; body: string } {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const at = lines.findIndex((l) => /^#\s+/.test(l));
  const headline = at >= 0 ? lines[at].replace(/^#\s+/, "").trim() : "";
  const rest = (at >= 0 ? lines.slice(at + 1) : lines).join("\n").trim();
  const body = rest
    .replace(/^#{2,6}\s+.*$/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^\s*[*_](.+?)[*_]\s*$/gm, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { headline, subhead: "", body };
}

/** The built-in selection system prompt (arm C, Prompt 1), with {{tokens}}. */
export function selectionSystemTemplate(): string {
  return `You are the features editor for {{publisher}}. Before anyone writes, you decide what one sponsored feature about {{sponsor}} will say. You do not write the feature. A writer works only from your choices, and an editor may review them first, so every choice must be clear and must cite facts.

GROUND RULES
- Use only the FACTS. Cite claim IDs for every choice.
- Never choose a story that needs a fact you do not have.
- A COMPANY fact is about who the sponsor is in general. It is never the story. The writer may use at most one clause of it.
- A fact marked CONFLICT is not a fact for its figure. Never choose either figure.
- The story is the one discovery chose. Code set its type: focus {{focus}}, time {{time}}, sponsor role {{role}}. Keep them.

DECIDE - answer each question.
1. ANGLE. Give two or three possible angles, one sentence each. Choose one. Say why it is the strongest for this story, not the easiest. Do not default to a list of what happened in date order.
2. WALKAWAY. The one sentence a reader should keep. It must be true from the facts alone.
3. WHY NOW. A fact that makes the story timely, with its claim ID. If no fact does, write null. Never invent a reason.
4. FACTS. List the claim IDs to USE, most important first. Eight to fourteen is normal for about 425 words. List the other cause facts that could answer who was helped, how help reaches them or what changed as RESERVE. For each fact you leave out on purpose, give a reason in five words or fewer.
5. QUOTES. Which quotes, by which speaker, and where: opening, nut_graf, body or close. People closest to the work come first. The sponsor's executive comes last and never in the opening.
6. OPTIONS. In one sentence each, say how the grounded and the upbeat option differ in angle or emphasis.
7. RISKS. List figure conflicts, offers that end before or near publication, promises that could read as done, and firsts, records or predictions that need attribution.

Return JSON only:
{"angles":[""],"angle":"","angle_reason":"","walkaway":"","why_now":{"text":"","claim_id":""}|null,"use_facts":["C1"],"reserve_facts":["C2"],"left_out":[{"claim_id":"","reason":""}],"quotes":[{"claim_id":"Q1","speaker":"","place":"opening|nut_graf|body|close"}],"option_grounded":"","option_upbeat":"","risks":[{"type":"conflict|expiring_offer|promise|attribution","claim_ids":[""],"note":""}],"human_review":false}`;
}

/** The source text of the pages, capped per page (harness `sourceTextFor`). */
export function sourceTextFor(pages: LedgerPageInput[], perPage = 24000): string {
  return dedupePages(pages)
    .map(
      (p) =>
        `--- ${p.url}${p.title ? ` (${p.title})` : ""}\n${normalizeText(p.markdown ?? "").slice(0, perPage)}`,
    )
    .join("\n\n");
}

/** `generateStatistics` user prompt, with `location`, `event_type` and the mission as tokens. */
export function statisticsTemplate(): string {
  return `You are a data extraction assistant.

Input:
- location: "{{statistics_input.location}}"
- event_type: "{{statistics_input.event_type}}"

Task:
my goal and mission is : {{statistics_input.mission_goals}}
Return 1-2 concise, verifiable statistics that quantify the size or severity of the event_type problem in the given location.

Rules (STRICT):
- Output MUST be a valid JSON array only.
- DO NOT include any explanations, markdown, or extra text.
- DO NOT include comments.
- DO NOT wrap the JSON in code blocks.
- Each statistic must be factual, recenly updated and measurable (percentages, counts, rates, or trends).
- If exact city-level data is unavailable, you may use county or state-level data, but specify the scope.

JSON schema (MUST FOLLOW EXACTLY):

[
  {
    "statistic": "string",
    "value": "string or number",
    "year": "number or string",
    "scope": "city | county | state | metro",
    "source": "string"
  }
]

If no reliable data is available, return an empty JSON array: []`;
}

/** The parse that `generateStatistics` applies to the model text. Any failure gives []. */
export function parseStatistics(content: string | null): unknown[] {
  if (!content) return [];
  try {
    const cleaned = content.trim();
    if (cleaned.startsWith("[")) {
      const v = JSON.parse(cleaned) as unknown;
      return Array.isArray(v) ? v : [];
    }
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const v = parsed.data || parsed.statistics || parsed.results || [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** `story.service.ts` `generation.articleTitle` prompt (system and instruction). */
export const ARTICLE_TITLE_SYSTEM =
  "You shorten news article headlines. Reply with ONLY the headline as " +
  "plain text — no quotes, no markdown, no emoji, at most " +
  `${ARTICLE_TITLE_MAX_LEN} characters counting spaces and punctuation.`;
export const ARTICLE_TITLE_INSTRUCTION =
  `Rewrite this news headline in at most ${ARTICLE_TITLE_MAX_LEN} ` +
  "characters. Keep its facts and put the core impact first. Never cut " +
  'a word in half and never end with "...":\n\n';

/** `story.service.ts` `generation.title` prompt (system and instruction). */
export const SHORT_TITLE_SYSTEM =
  "You rewrite long story titles into short, punchy organic-social " +
  "headlines. Reply with ONLY the headline — no quotes, no trailing " +
  `punctuation, at most ${SHORT_STORY_TITLE_MAX_LEN} characters.`;
export const SHORT_TITLE_INSTRUCTION =
  `Shorten this story title to at most ${SHORT_STORY_TITLE_MAX_LEN} ` +
  `characters while preserving its meaning:\n\n`;

/** Hard cap at `maxLen`, preferring a word boundary (story.service.ts `capTitle`). */
export function capTitle(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const hard = text.slice(0, maxLen);
  const lastSpace = hard.lastIndexOf(" ");
  return (lastSpace >= 20 ? hard.slice(0, lastSpace) : hard).trim();
}

/** The cleanup `rewriteTitleWithLlm` applies to the reply; null when nothing usable is left. */
export function cleanTitleReply(raw: string | null, maxLen: number): string | null {
  const text = (raw ?? "").trim().replace(/^["']|["']$/g, "").trim();
  return capTitle(text, maxLen) || null;
}

/** The `#` heading test of `enforceArticleTitleLimit`: the heading must open the markdown. */
export function articleHeading(markdown: string): { marks: string; title: string; length: number } | null {
  const heading = /^(#{1,6})[ \t]+([^\r\n]*)/.exec(markdown);
  const title = heading?.[2].replace(/[*_~`]/g, "").trim();
  if (!heading || !title) return null;
  return { marks: heading[1], title, length: heading[0].length };
}

/** Puts the fitted title back into the markdown, as `enforceArticleTitleLimit` does. */
export function replaceHeading(markdown: string, fitted: string): string {
  const h = articleHeading(markdown);
  if (!h) return markdown;
  return `${h.marks} ${fitted}${markdown.slice(h.length)}`;
}
