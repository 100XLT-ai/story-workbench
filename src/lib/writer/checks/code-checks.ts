import type { FactLedger } from "../ledger/ledger.types";
import { extractFigures } from "../ledger/figures";
import {
  normalizeText,
  quotedPassages,
  splitSentences,
  stripQuoted,
  wordCount,
} from "../ledger/text-utils";

export interface CheckedArticle {
  headline: string;
  subhead?: string | null;
  body: string;
  cta?: string | null;
  /** Writer claims; null when the arm does not emit them (arm A). */
  claims: { span: string; claim_ids: string[] }[] | null;
}

export interface CheckSettings {
  /** Approved short name and own program names; each counts as one headline word. */
  sponsorNames: string[];
  minWords: number;
  maxWords: number;
  /** Claim ids the labeller marked as company material. */
  companyClaimIds?: Set<string>;
}

export type CheckSeverity = "blocker" | "flag" | "log";

export interface CheckResult {
  check: string;
  severity: CheckSeverity;
  result: "pass" | "fail" | "n/a";
  detail: string[];
}

export interface CodeCheckReport {
  results: CheckResult[];
  blockers: number;
  flags: number;
  wordCount: number;
  padded: boolean | null;
  paddedWords: number | null;
}

const STOCK_CHEER =
  /\b(game[- ]changing|game[- ]changer|transformative|making a difference|make a difference|giving back|gives back|truly|more than ever|heartwarming|vibrant)\b/i;
const RELATIVE_TIME =
  /\b(recently|yesterday|today|tonight|this weekend|last week|last month|this week|this month|this year|next week|next month|soon|upcoming|currently)\b/i;
const APPEALS =
  /^(?:visit|learn more|donate|give|support|join|sign up|register|call)\b|\b(?:please|you can|consider|be sure to)\s+(?:visit|donate|support|give|join)\b/i;
const BAD_OPENINGS =
  /^(?:for (?:more than|over|nearly) \d+ years|since \d{4})\b/i;
const NEVER_PATTERNS: [RegExp, string][] = [
  [/—|\s--\s/, "em dash"],
  [/\bit'?s not just\b[^.]*\.\s*it'?s\b/i, "\"It's not just X. It's Y.\""],
  [/\bcontinues to (?:evolve|grow)\b/i, '"continues to evolve" closer'],
];
const ACTION_VERBS =
  /\b(gave|gives|give|donated|donates|donate|funded|funds|fund|raised|raises|served|serves|built|builds|awarded|awards|opened|opens|launched|launches|provided|provides|delivered|delivers|invested|invests|pledged|pledges|committed|commits|granted|grants|distributed|distributes|hosted|hosts|collected|collects|helped|helps|volunteered|sponsored|sponsors|matched|matches|surprised|gifted|transferred|paid|pays)\b/i;
const FUTURE_OR_PRESENT =
  /\b(will|can|runs|run|through|until|ends|open|opens|accepting|bring)\b/i;

const norm = (s: string) => normalizeText(s).toLowerCase();

function headlineWords(headline: string, names: string[]): number {
  let h = normalizeText(headline);
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    if (name.trim())
      h = h.replace(
        new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
        "SPONSORNAME",
      );
  }
  return wordCount(h);
}

function sentencesOf(body: string): string[] {
  return body.split(/\n{2,}/).flatMap((p) => splitSentences(p));
}

function checkQuotes(
  article: CheckedArticle,
  ledger: FactLedger,
): CheckResult[] {
  const sentences = sentencesOf(article.body);
  const records = ledger.quotes.map((q) => ({ ...q, n: norm(q.text) }));
  const match: string[] = [];
  const speaker: string[] = [];
  sentences.forEach((sentence, i) => {
    for (const passage of quotedPassages(sentence)) {
      const words = norm(passage).replace(/^[.,;:\s]+|[.,;:\s]+$/g, "");
      if (words.split(" ").length < 4) continue;
      const record = records.find((r) => r.n.includes(words));
      if (!record) {
        match.push(`no quote record: "${passage.slice(0, 80)}"`);
        continue;
      }
      const near =
        `${sentences[i - 1] ?? ""} ${sentence} ${sentences[i + 1] ?? ""}`.toLowerCase();
      if (!near.includes(record.surname.toLowerCase()))
        speaker.push(
          `${record.id} (${record.speaker}) not named in the sentence before, the same or the next`,
        );
    }
  });
  return [
    {
      check: "quote_matches_record",
      severity: "blocker",
      result: match.length ? "fail" : "pass",
      detail: match,
    },
    {
      check: "quote_speaker_near",
      severity: "blocker",
      result: speaker.length ? "fail" : "pass",
      detail: speaker,
    },
  ];
}

function checkClaims(
  article: CheckedArticle,
  ledger: FactLedger,
): CheckResult[] {
  if (!article.claims) {
    return [
      {
        check: "claim_spans",
        severity: "blocker",
        result: "n/a",
        detail: ["arm emits no claims"],
      },
      {
        check: "action_sentences_claimed",
        severity: "flag",
        result: "n/a",
        detail: [],
      },
    ];
  }
  const ids = new Set(
    ledger.claims.map((c) => c.id).concat(ledger.quotes.map((q) => q.id)),
  );
  const body = norm(article.body);
  const bad: string[] = [];
  for (const c of article.claims) {
    if (!body.includes(norm(c.span)))
      bad.push(`span not in body: "${c.span.slice(0, 70)}"`);
    const unknown = c.claim_ids.filter((id) => !ids.has(id));
    if (unknown.length) bad.push(`unknown ids ${unknown.join(",")}`);
    if (!c.claim_ids.length) bad.push(`no ids: "${c.span.slice(0, 70)}"`);
  }
  const spans = article.claims.map((c) => norm(c.span));
  const uncovered = sentencesOf(article.body)
    .filter((s) => ACTION_VERBS.test(stripQuoted(s)))
    .filter((s) => {
      const n = norm(s);
      return !spans.some(
        (span) => n.includes(span) || span.includes(n.slice(0, 40)),
      );
    })
    .map((s) => s.slice(0, 90));
  return [
    {
      check: "claim_spans",
      severity: "blocker",
      result: bad.length ? "fail" : "pass",
      detail: bad,
    },
    {
      check: "action_sentences_claimed",
      severity: "flag",
      result: uncovered.length ? "fail" : "pass",
      detail: uncovered,
    },
  ];
}

function checkNarratorWords(article: CheckedArticle): CheckResult[] {
  const paragraphs = article.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const words: string[] = [];
  const appeals: string[] = [];
  const never: string[] = [];
  const sentences = sentencesOf(article.body);
  for (const sentence of sentences) {
    const narrator = stripQuoted(sentence);
    const cheer = narrator.match(STOCK_CHEER);
    if (cheer) words.push(`stock cheer "${cheer[0]}"`);
    const rel = narrator.match(RELATIVE_TIME);
    if (rel) words.push(`relative time "${rel[0]}"`);
    if (APPEALS.test(narrator.trim()))
      appeals.push(narrator.trim().slice(0, 80));
    for (const [re, label] of NEVER_PATTERNS)
      if (re.test(narrator)) never.push(label);
  }
  if (paragraphs[0] && BAD_OPENINGS.test(paragraphs[0]))
    never.push('opening "For more than X years" / "Since 19xx"');
  return [
    {
      check: "narrator_words",
      severity: "flag",
      result: words.length ? "fail" : "pass",
      detail: words,
    },
    {
      check: "body_appeal",
      severity: "flag",
      result: appeals.length ? "fail" : "pass",
      detail: appeals,
    },
    {
      check: "never_list",
      severity: "flag",
      result: never.length ? "fail" : "pass",
      detail: [...new Set(never)],
    },
  ];
}

function checkConflicts(
  article: CheckedArticle,
  ledger: FactLedger,
): CheckResult {
  const real = ledger.conflicts.filter((c) => c.kind === "conflict");
  const used = extractFigures(
    `${article.headline}. ${article.subhead ?? ""}. ${stripQuoted(article.body)}`,
  );
  const hits: string[] = [];
  for (const conflict of real) {
    for (const v of conflict.values) {
      const unit = conflict.key.includes(":")
        ? conflict.key.split(":")[0]
        : null;
      const hit = used.find(
        (f) =>
          f.value === v.value &&
          (unit ? f.unit === unit : f.unit !== "USD" && f.unit !== "%"),
      );
      if (hit && (hit.noun === null || conflict.key.endsWith(hit.noun)))
        hits.push(`${hit.raw} (conflict ${conflict.key}, ${v.claimId})`);
    }
  }
  return {
    check: "conflict_values",
    severity: "blocker",
    result: hits.length ? "fail" : "pass",
    detail: [...new Set(hits)],
  };
}

function monthDay(iso: string): RegExp {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const m = months[Number(iso.slice(5, 7)) - 1];
  const day = String(Number(iso.slice(8, 10)));
  return new RegExp(
    `\\b${m.slice(0, 3)}[a-z]*\\.?\\s+${day}\\b|\\b${m}\\b`,
    "i",
  );
}

function checkDatedOffers(
  article: CheckedArticle,
  ledger: FactLedger,
): CheckResult {
  const expiring = ledger.datedFacts.filter(
    (d) => d.isOffer && d.status !== "future",
  );
  const hits: string[] = [];
  for (const offer of expiring) {
    const claim = ledger.claims.find((c) => c.id === offer.claimId);
    if (!claim) continue;
    const date = monthDay(offer.date);
    const cited =
      article.claims?.some((c) => c.claim_ids.includes(offer.claimId)) ?? false;
    // why: a CTA can name the same fund as an expired match without pointing at the match; only its date ties them.
    if (article.cta && date.test(article.cta))
      hits.push(`CTA points at ${offer.claimId} (ends ${offer.date})`);
    for (const sentence of sentencesOf(stripQuoted(article.body))) {
      const linked =
        date.test(sentence) ||
        (cited &&
          article.claims?.some(
            (c) =>
              c.claim_ids.includes(offer.claimId) &&
              norm(sentence).includes(norm(c.span)),
          ));
      if (linked && FUTURE_OR_PRESENT.test(sentence))
        hits.push(
          `present/future tense for ${offer.claimId}: "${sentence.slice(0, 80)}"`,
        );
    }
  }
  return {
    check: "dated_offers",
    severity: "blocker",
    result: hits.length ? "fail" : "pass",
    detail: hits,
  };
}

function checkHeadline(
  article: CheckedArticle,
  names: string[],
): CheckResult[] {
  const h = normalizeText(article.headline);
  const words = headlineWords(h, names);
  const detail: string[] = [];
  if (words < 6 || words > 10)
    detail.push(`${words} words (6 to 10, sponsor name as one)`);
  if (h.length >= 70) detail.push(`${h.length} characters (under 70)`);
  if (h.includes(":")) detail.push("colon");
  const named = names.some((n) => n.trim() && norm(h).includes(norm(n)));
  return [
    {
      check: "headline_form",
      severity: "flag",
      result: detail.length ? "fail" : "pass",
      detail,
    },
    {
      check: "headline_names_sponsor",
      severity: "flag",
      result: named ? "pass" : "fail",
      detail: named ? [] : ["no sponsor or program name"],
    },
  ];
}

/** Words in sentences backed only by company claims or by no claim at all. */
function paddedWords(
  article: CheckedArticle,
  company: Set<string>,
): number | null {
  if (!article.claims) return null;
  let padded = 0;
  for (const sentence of sentencesOf(article.body)) {
    const n = norm(sentence);
    const backing = article.claims.filter(
      (c) => n.includes(norm(c.span)) || norm(c.span).includes(n.slice(0, 40)),
    );
    const ids = backing.flatMap((c) => c.claim_ids);
    const quoteOnly = quotedPassages(sentence).length > 0;
    if (!quoteOnly && (!ids.length || ids.every((id) => company.has(id))))
      padded += wordCount(sentence);
  }
  return padded;
}

/** Runs the Fix 5 code checks on one article against its fact ledger. */
export function runCodeChecks(
  article: CheckedArticle,
  ledger: FactLedger,
  settings: CheckSettings,
): CodeCheckReport {
  const words = wordCount(article.body);
  const lengthDetail: string[] = [];
  if (words < settings.minWords)
    lengthDetail.push(`${words} words (floor ${settings.minWords})`);
  if (words > settings.maxWords)
    lengthDetail.push(`${words} words (ceiling ${settings.maxWords})`);
  const results: CheckResult[] = [
    {
      check: "length",
      severity: "flag",
      result: lengthDetail.length ? "fail" : "pass",
      detail: lengthDetail,
    },
    ...checkHeadline(article, settings.sponsorNames),
    ...checkQuotes(article, ledger),
    ...checkClaims(article, ledger),
    ...checkNarratorWords(article),
    checkConflicts(article, ledger),
    checkDatedOffers(article, ledger),
  ];
  const pw = paddedWords(article, settings.companyClaimIds ?? new Set());
  const padded =
    pw === null
      ? null
      : words - pw < settings.minWords && words >= settings.minWords;
  results.push({
    check: "padded",
    severity: "log",
    result: pw === null ? "n/a" : padded ? "fail" : "pass",
    detail: pw === null ? [] : [`${pw} unbacked or company-only words`],
  });
  return {
    results,
    blockers: results.filter(
      (r) => r.severity === "blocker" && r.result === "fail",
    ).length,
    flags: results.filter((r) => r.severity === "flag" && r.result === "fail")
      .length,
    wordCount: words,
    padded,
    paddedWords: pw,
  };
}
