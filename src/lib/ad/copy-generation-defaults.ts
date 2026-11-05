import type { AngleToInputsRules } from "./angle-to-inputs";

/**
 * Judgment call (flagged for coordinator review): Slice 1's
 * `angle-to-inputs.ts` docstring explicitly says appendix K writes
 * `{tonePreamble: editorial | brand | direct-response}` as an enum of
 * allowed tones with NO appendix defining the actual preamble sentences,
 * and flags `bannedBodyOpeners` / `bannedPassiveVerbs` / the copy rules the
 * same way — "Slice 3 owns picking/constructing" these. None of these
 * values are ported from any appendix; they are Slice 3's own design,
 * written to serve the SCARs documented in 01-spec.md Learnings:
 *   - "editorial-looking local advertisers got synthetic-looking ads that
 *     read as fake" -> default tone is "editorial" (Cause_Marketing is the
 *     only content type this phase, and is grounded/community-voiced).
 *   - "Minimal-density banners hallucinated garbled subtitles and leaked
 *     prompt tokens (BODY, subtext)" -> the banned-opener list targets
 *     "this is a summary of the article" tells, which is the failure mode
 *     that produces that leakage.
 *   - RULE "Never default an empty CTA to 'Learn More'" -> the CTA rule
 *     explicitly bans it as a literal phrase (the model producing it
 *     verbatim is still allowed to fail validation downstream; this is
 *     about not FISHING for that exact cliché).
 */

export type AngleToInputsTone = "editorial" | "brand" | "direct-response";

export const DEFAULT_TONE_PREAMBLES: Record<AngleToInputsTone, string> = {
  editorial:
    "VOICE: write like a local newsroom's sponsor spot — grounded, specific, community-voiced. Avoid hype and superlatives.",
  brand:
    "VOICE: write in the advertiser's own confident voice, on-message with their brand personality above.",
  "direct-response":
    "VOICE: write with urgency and a single, clear action for the reader to take right now.",
};

/** Default tone track. Cause_Marketing (the only content type this phase)
 * is local/community-focused, so "editorial" is the safest default. */
export const DEFAULT_TONE: AngleToInputsTone = "editorial";
export const DEFAULT_TONE_PREAMBLE = DEFAULT_TONE_PREAMBLES[DEFAULT_TONE];

/** Phrases that prove the model is summarizing the source article instead
 * of writing ad copy (the SCAR this list targets — see file docstring). */
export const DEFAULT_BANNED_BODY_OPENERS: string[] = [
  "This story",
  "This article",
  "This piece",
  "In this story",
  "In this article",
  "We explore",
  "We look at",
  "Discover how",
  "Read about",
  "Learn about",
];

/** Passive, magazine-narrator verbs that produce third-person "being
 * described" voice instead of the advertiser speaking directly. */
export const DEFAULT_BANNED_PASSIVE_VERBS: string[] = [
  "is designed to",
  "was created to",
  "aims to",
  "seeks to",
  "is committed to",
  "strives to",
  "endeavors to",
  "is dedicated to",
];

/** Matches `DEFAULT_MAX_LENGTHS.subject_hint` in `angle-to-inputs.ts` so the
 * prompt's stated limit and the parser's enforced cap agree. */
export const DEFAULT_SUBJECT_HINT_MAX = 160;

/** Matches `DEFAULT_MAX_LENGTHS.headline/body/cta` in `angle-to-inputs.ts`
 * for the same reason — the rule text and the enforced cap should agree. */
export const DEFAULT_RULES: AngleToInputsRules = {
  headlineRule:
    "concise, active voice, ≤80 characters, names the advertiser or the concrete offer — never a generic tagline",
  bodyRule:
    "one sentence, concrete and specific to this business, ≤220 characters — never a summary of the article",
  ctaRule:
    'a short imperative action (2-4 words) specific to the business — never the literal phrase "Learn More"',
};
