import { normalizeText } from "./text-utils";

export interface ParsedQuote {
  text: string;
  speaker: string | null;
  role: string | null;
  reason:
    | "ok"
    | "no_speaker"
    | "pronoun_speaker"
    | "headline_or_dateline"
    | "empty";
}

const SPEECH_VERBS =
  "said|says|added|adds|explained|explains|noted|notes|continued|stated|states|recalled|recalls|shared|shares|wrote|writes|told|tells|remarked|commented|emphasized";
const NAME_TOKEN =
  "(?:Dr\\.|Mr\\.|Mrs\\.|Ms\\.|Rev\\.|[A-Z][a-zA-Z'\\-]+|[A-Z]\\.)";
const NAME = `${NAME_TOKEN}(?:\\s+${NAME_TOKEN}){0,3}`;
const PRONOUNS = new Set(["he", "she", "they", "we", "i", "it", "you"]);
const NOT_NAMES = new Set(
  (
    "The A An This That Monday Tuesday Wednesday Thursday Friday Saturday Sunday " +
    "January February March April May June July August September October November December Today Yesterday"
  ).split(" "),
);

const AFTER_VERB = new RegExp(
  `\\b(?:${SPEECH_VERBS})\\s+(${NAME})(?:,\\s*([^."]{3,120}))?`,
);
const BEFORE_VERB = new RegExp(
  `(${NAME}),?(?:\\s*,\\s*([^,."]{3,120}),)?\\s+(?:${SPEECH_VERBS})\\b`,
);
const TITLE_THEN_NAME = new RegExp(
  String.raw`\b(?:${SPEECH_VERBS})\s+((?:(?:[A-Z][\w&.'\-]*|and|of|the)\s+){1,8}?)([A-Z][a-z'\-]+\s+[A-Z][a-z'\-]+)(?=\s*[.,|]|\s*$)`,
);
const OPENS_WITH_ATTRIBUTION = new RegExp(
  String.raw`^[,.]?\s*(?:(?:${SPEECH_VERBS})\b|[A-Z][a-z'\-]+(?:\s+[A-Z][a-z'\-]+)?\s+(?:${SPEECH_VERBS})\b)`,
);
const ACCORDING = new RegExp(
  `\\baccording to\\s+(${NAME})(?:,\\s*([^."]{3,120}))?`,
);
const PRONOUN_VERB = new RegExp(
  `\\b(?:${SPEECH_VERBS})\\s+(he|she|they)\\b|\\b(he|she|they)\\s+(?:${SPEECH_VERBS})\\b`,
  "i",
);

const TITLES = new Set(
  "CEO President Director Executive Manager Officer Major Chief Board Chair Principal Superintendent Coordinator Pastor Mayor Senator Commissioner Corps".split(
    " ",
  ),
);
const ORG_ENDINGS =
  /\b(County|Department|School|Health|Foundation|Bank|Church|Center|Centre|Inc|Company|Association|Society|District|Council|Club|Fund|Tasting|Brewhouse|Army|Shield)$/;

function cleanName(raw: string): string | null {
  const tokens = raw.trim().split(/\s+/);
  // why: "said May" names a person (May) far more often than the month here, so May is kept.
  while (
    tokens.length > 1 &&
    ((NOT_NAMES.has(tokens[0]) && tokens[0] !== "May") || TITLES.has(tokens[0]))
  )
    tokens.shift();
  if (!tokens.length || (tokens.length === 1 && TITLES.has(tokens[0])))
    return null;
  const name = tokens.join(" ");
  if (ORG_ENDINGS.test(name)) return null;
  if (PRONOUNS.has(name.toLowerCase())) return null;
  return name;
}

function findAttribution(attribution: string): {
  speaker: string | null;
  role: string | null;
  pronoun: boolean;
} {
  const titled = attribution.match(TITLE_THEN_NAME);
  if (
    titled &&
    !NOT_NAMES.has(titled[2].split(" ")[0]) &&
    !ORG_ENDINGS.test(titled[2])
  ) {
    return { speaker: titled[2], role: titled[1].trim(), pronoun: false };
  }
  for (const re of [AFTER_VERB, ACCORDING, BEFORE_VERB]) {
    const m = attribution.match(re);
    const speaker = m ? cleanName(m[1]) : null;
    if (m && speaker)
      return {
        speaker,
        role: m[2]?.trim().replace(/\s+(?:said|says)$/, "") || null,
        pronoun: false,
      };
  }
  return { speaker: null, role: null, pronoun: PRONOUN_VERB.test(attribution) };
}

/**
 * Splits one stored quote string into the quoted words and the speaker.
 * `context` is page text around the quote, used when the string has no attribution.
 */
export function parseQuote(raw: string, context = ""): ParsedQuote {
  let text = normalizeText(raw);
  // why: the extractor often drops the opening or closing mark ('Words," said X. "More').
  const firstMark = text.indexOf('"');
  const closesFirst =
    /^[^“"]*”/.test(raw) ||
    (firstMark > 0 && OPENS_WITH_ATTRIBUTION.test(text.slice(firstMark + 1)));
  if (firstMark > 0 && !text.startsWith('"') && closesFirst) text = `"${text}`;
  if ((text.match(/"/g) ?? []).length % 2 === 1) text = `${text}"`;
  if (!text) return { text: "", speaker: null, role: null, reason: "empty" };
  const passages = [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim());
  const words = passages.length
    ? passages.join(" ")
    : text.replace(/^"|"$/g, "");
  if (!passages.length && /^[A-Z][A-Z .,'-]{2,40}(?:\(|,|\s-\s)/.test(text)) {
    return {
      text: words,
      speaker: null,
      role: null,
      reason: "headline_or_dateline",
    };
  }
  // why: a string with no quote marks is all quote words, so only the page around it can name the speaker.
  const outside = passages.length ? text.replace(/"[^"]*"/g, " | ") : "";
  let found = outside
    ? findAttribution(outside)
    : { speaker: null, role: null, pronoun: false };
  if (!found.speaker && context)
    found = findAttribution(normalizeText(context).replace(/"[^"]*"/g, " | "));
  if (!found.speaker)
    return {
      text: words,
      speaker: null,
      role: null,
      reason: found.pronoun ? "pronoun_speaker" : "no_speaker",
    };
  return {
    text: words,
    speaker: found.speaker,
    role: found.role,
    reason: "ok",
  };
}

/** Text of the page around the quote words, for a string with no attribution. */
export function quoteContext(
  markdown: string | null,
  quoteWords: string,
  radius = 220,
): string {
  if (!markdown) return "";
  const page = normalizeText(markdown);
  const probe = normalizeText(quoteWords).slice(0, 60);
  const at = probe ? page.indexOf(probe) : -1;
  if (at < 0) return "";
  return page.slice(
    Math.max(0, at - radius),
    at + probe.length + quoteWords.length + radius,
  );
}

/** The last name of a speaker, used to match the speaker near a quote. */
export function surnameOf(speaker: string): string {
  const tokens = speaker
    .split(/\s+/)
    .filter((t) => !/^(Dr|Mr|Mrs|Ms|Rev)\.$/.test(t));
  return tokens[tokens.length - 1] ?? speaker;
}
