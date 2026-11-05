import type { IChatMessage } from "../llm-types";
import { modulesFor } from "./writer-modules";
import type { WriterInput, WriterSettings } from "./writer-input";

export const ONE_CALL_PROMPT_VERSION = "story-writer-one-call@v1";
export const STAGED_WRITER_PROMPT_VERSION = "story-writer-staged@v1";

export type WriterMode = "one_call" | "staged";

interface PromptVars {
  publisher: string;
  sponsor: string;
  targetWords: string;
  minWords: string;
  maxWords: string;
}

/** The tokens a writer template may hold. */
export const WRITER_TEMPLATE_TOKENS = [
  "publisher",
  "sponsor",
  "targetWords",
  "minWords",
  "maxWords",
  "modules",
] as const;

const TOKEN_VARS: PromptVars = {
  publisher: "{{publisher}}",
  sponsor: "{{sponsor}}",
  targetWords: "{{targetWords}}",
  minWords: "{{minWords}}",
  maxWords: "{{maxWords}}",
};

/** Replaces each {{token}} once; inserted text is not scanned again. */
export function fillTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );
}

/** Lists the {{tokens}} in a template. */
export function templateTokens(template: string): string[] {
  return [
    ...new Set([...template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])),
  ];
}

const lengthRule = (s: PromptVars) =>
  `Target ${s.targetWords} words, at least ${s.minWords}, at most ${s.maxWords}. If the facts do not reach ${s.minWords} words, add, in this order: facts about how the help works (who qualifies, where, how help arrives, how money moves); then one outside-voice quote in full; then at most one sentence about what the sponsor did in this community. Never invent and never repeat a fact to reach the length. If the piece is still short, stop and set "short_reason".`;

const PLAN_ONE_CALL = `FIRST, THE PLAN. You choose the story yourself, inside the STORY TYPE that code set. Fill "plan" before the articles:
- angles: two or three possible angles, one sentence each. "angle": the one you choose; "angle_reason": why it is the strongest, not the easiest. Never a list of what happened in date order.
- theme: the story in six words or fewer.
- walkaway: the one sentence a reader should keep. It must be true from the facts alone.
- why_now: {"text","claim_id"} from a fact that makes the story timely, or null. Never invent a reason.
- use_facts: the claim IDs you will use, most important first (8 to 14 is normal).
- for each option: intro_type (problem, scene, human or figure) and the claim IDs in each paragraph.`;

const PLAN_STAGED = `FIRST, THE PLAN. The STORY block holds the editor's choices. Fill "plan" before the articles: the angle and walkaway from the STORY, why_now from the STORY, and for each option the intro_type (problem, scene, human or figure) and the claim IDs in each paragraph.`;

function core(s: PromptVars, mode: WriterMode): string {
  const factsRule =
    mode === "staged"
      ? `- Use the USE facts, most important first. Add a RESERVE fact only to answer: who was helped, how the help reaches them, or what changed. List every reserve fact you add in "reserve_used".`
      : `- Use the facts you list in the plan. Leave out facts that do not serve the angle.`;
  return `You write a sponsored feature for ${s.publisher}. The reader is a ${s.publisher} subscriber who will see that the piece is sponsored and should still find it worth finishing. Write two options, grounded and upbeat, from the facts and quotes at the end of this brief.

WHEN RULES COLLIDE - apply them in this order. A higher rule always wins.
1. Truth. Say only what the facts state. No invented fact, quote, cause, outcome, figure, date or detail. That includes colour: a day of the week, a feeling, the weather, what someone wanted.
2. Attribution. Every quote carries its speaker. Every first, record, prediction or outcome that the sponsor or a partner claims is said to be theirs: "UAMS says the pilot will be the first...".
3. Not misleading. No promise written as done. No expired offer written as current. No coordination the facts do not state. No claim that purchases fund the cause unless the facts say which ones.
4. Disclosure. Never hide that the piece is sponsored.
5. Length. ${lengthRule(s)}
6. Structure. The focus and time modules.
7. Style. Plain words, rhythm, headline form.

${mode === "staged" ? PLAN_STAGED : PLAN_ONE_CALL}

OPENING TYPES
- problem: the situation in one or two sentences, never three.
- scene: one or two sentences that place the reader, then the people. Only a situation the facts describe. Say what it is, not how it feels.
- human: a person, then one short quote from them. Never the sponsor's own executive.
- figure: a number that means something alone, with its unit and its recipient in the same sentence.
Choose the strongest for this story, not the first available.

FACTS
${factsRule}
- Keep apart: done and promised, current and expired, what the sponsor did and what partners did, money the sponsor gave and money others gave.
- Tie a figure to a human result only when a fact states that link. "$10,000 raised" does not become "fed 100 families" unless a fact says so. "Served 100,000 households" does not become "furnished 100,000 homes".
- If a detail is unclear, use careful wording or leave it out.
- Never add figures together to make a new total.
- A fact marked CONFLICT, and every figure in RISKS as a conflict, is not a fact. Never print either figure.
- If why_now is null, give the date of the work and say nothing about timing.

PLAIN WORDS
- Write the thing, not the category: money, not "philanthropic capital"; hunger, not "food insecurity"; the charity's name, not "organizations". A proper noun beats a category.
- Prefer short, common words. Fix the words; do not chop sentences. Keep some sentences under 10 words.
- Every sentence names a person, place, figure, organization or event from the facts. A sentence that does not is filler. Take it out.
- No paragraph carries more than three specifics.
- Connect facts with because, so, after, until, when the facts state the link. If a link needs a fact you do not have, use a plainer transition.
- Name an organization in full once. If two or more organizations appear, use each one's short name after that, not "the group".

SHAPE (unless a module says otherwise)
- Paragraph 1: the opening type from the plan. Name the sponsor at the end of paragraph 1 or the start of paragraph 2. No dates in paragraph 1.
- Paragraph 2: the nut graf. Why this story exists and what it is an example of, in the same plain words. Never "is not alone".
- Last paragraph: what changed because of this work. A quote may follow, but a quote alone is not a close.

QUOTES
- Use only the QUOTES given, word for word. You may trim. Never change a word.
- Name the speaker in the same sentence as the quote or the sentence just before it.
- Put quotes in different paragraphs. People closest to the work speak first. The sponsor's executive speaks last, never in the opening.
- Do not repeat a quoted fact in your own words next to the quote.
- If only one speaker exists, use that one well. Never add a second voice. If QUOTES is empty, write no quotes.

THE TWO OPTIONS
- Grounded: direct and factual, with concrete circumstances and clear attribution.
- Upbeat: warm and reader-centred. The sponsor's voice comes through its own program name and its specific actions. Its values come only through its own quotes. No stock cheer ("game-changing", "transformative", "making a difference", "giving back") outside a quote, even when the sponsor's own copy uses it.
- The options differ in angle or emphasis, not only in tone.

HEADLINE: one clause, 6 to 10 words, under 70 characters, no colon. Who is helped, what changed, the place if the facts give one. Name the sponsor or its own named program; "${s.sponsor}" counts as one word. If you leave the sponsor out, the headline must be better for it, and you add "headline_note" saying why.
SUBHEAD: one sentence, 12 to 20 words, under 140 characters. It adds something the headline does not.
FIGURES: $575,000, $37 million, 80%. When two figures sit near each other, say how they relate.
VERBS: gives, donates, funds, pays for, commits. Report what the sponsor spent, built or delivered. Do not praise what it meant by it.

CALL TO ACTION: in its own field, never in the body. The time module says which kind. A derived CTA never invents a URL, phone number, date, deadline or amount, names only organizations in the facts, never points at an offer that ends before publication, and stays general enough to be true.

NEVER
- em dashes
- a colon that restates what came before it
- a closing appeal in the body: visit, learn more, donate, or "support" as a command
- relative time in your own words: "recently", "last week", "this year", "soon"
- an opening such as "For more than X years" or "Since 1987"
- "It's not just X. It's Y."
- a closer such as "X continues to evolve"
- more than one clause about what the company is in general`;
}

function outputSpec(s: PromptVars, mode: WriterMode): string {
  const plan =
    mode === "staged"
      ? `"plan": { "angle": "", "walkaway": "", "why_now": {"text":"","claim_id":""} | null,
    "grounded": { "intro_type": "", "paragraphs": [["claim_id"]] },
    "upbeat":   { "intro_type": "", "paragraphs": [["claim_id"]] } }`
      : `"plan": { "angles": [""], "angle": "", "angle_reason": "", "theme": "", "walkaway": "",
    "why_now": {"text":"","claim_id":""} | null, "use_facts": ["claim_id"],
    "grounded": { "intro_type": "", "paragraphs": [["claim_id"]] },
    "upbeat":   { "intro_type": "", "paragraphs": [["claim_id"]] } }`;
  return `Return JSON only:
{
  ${plan},
  "options": [
    { "option": "grounded", "headline": "", "subhead": "", "sponsor_line": "Sponsored content from ${s.sponsor}",
      "body": "paragraphs separated by \\n\\n", "word_count": 0, "cta": "", "cta_derived": true,
      "headline_note": null, "reserve_used": ["claim_id"],
      "claims": [ { "span": "exact words from the body", "claim_ids": ["C1"] } ] },
    { "option": "upbeat", ...the same fields... }
  ],
  "conflicts": ["any fact you found that contradicts another"],
  "short_reason": null
}
Every sentence that states a fact, a figure or a quote has a "claims" entry. A quote's claim_ids hold its Q id.`;
}

/** The built-in writer system prompt for a mode, with {{tokens}} for the settings. */
export function writerSystemTemplate(mode: WriterMode): string {
  return [
    core(TOKEN_VARS, mode),
    "================ STORY TYPE MODULES ================",
    "{{modules}}",
    "================ OUTPUT ================",
    outputSpec(TOKEN_VARS, mode),
  ].join("\n\n");
}

/** Builds the writer messages: core rules, the story-type modules, then the inputs. */
export function buildWriterMessages(
  input: WriterInput,
  settings: WriterSettings,
  mode: WriterMode,
  storyJson?: string,
  template: string = writerSystemTemplate(mode),
): IChatMessage[] {
  const t = input.storyType;
  const system = fillTemplate(template, {
    publisher: settings.publisher,
    sponsor: settings.sponsor,
    targetWords: String(settings.targetWords),
    minWords: String(settings.minWords),
    maxWords: String(settings.maxWords),
    modules: modulesFor(t.focus, t.time, t.role, t.mechanisms),
  });
  const user = [
    `SETTINGS\nPublisher: ${settings.publisher}\nSponsor (approved short name): ${settings.sponsor}\nSponsor's own program or foundation names: ${settings.sponsorPrograms.join(", ") || "(none)"}`,
    `STORY TYPE (set by code): focus ${t.focus}, time ${t.time}, sponsor role ${t.role}, mechanisms ${t.mechanisms.join(", ") || "none"}${t.windowRisk ? ", window risk" : ""}. Status: ${input.thin}.`,
    storyJson ? `STORY (from the selection step):\n${storyJson}` : null,
    `${mode === "staged" ? "FACTS (USE and RESERVE are named in the STORY)" : "FACTS"}:\n${input.facts}`,
    `COMPANY (at most one clause in the piece):\n${input.company}`,
    `QUOTES (word for word, with speaker and role):\n${input.quotes}`,
    `RISKS:\n${input.risks}`,
  ]
    .filter((x): x is string => !!x)
    .join("\n\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
