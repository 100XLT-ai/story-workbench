import type { FactLedger } from "../ledger/ledger.types";
import type { ClaimLabel, Mechanism } from "./claim-labeller";

export type Focus =
  | "program"
  | "event"
  | "gift_grant"
  | "giving_record"
  | "contest_award"
  | "community_response";
export type TimeValue = "upcoming" | "latest" | "this_year" | "multi_year";
export type SponsorRole = "funder" | "doer" | "one_of_many";

export interface StoryType {
  focus: Focus;
  time: TimeValue;
  role: SponsorRole;
  mechanisms: Mechanism[];
  /** A dated claim falls between generation and publication. */
  windowRisk: boolean;
  missing: string[];
}

export const RECENCY_LIMIT_DAYS = 183;
const CRISIS =
  /\b(fire|wildfire|flood|tornado|hurricane|storm|disaster|relief|crisis|emergency|shooting|outage)\b/i;
const CONTEST =
  /\b(contest|nominat\w*|winners?|scholarship|award(?:s|ed|ees)?|prize|grant recipients?|honorees?)\b/i;

function daysBetween(a: string, b: string): number {
  return (
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000
  );
}

/** Code steps A to E of "Story Types and Writer Modules": focus, time, role and required facts. */
export function classifyStory(
  ledger: FactLedger,
  labels: Map<string, ClaimLabel>,
): StoryType {
  const cause = ledger.claims.filter(
    (c) => labels.get(c.id)?.material !== "company",
  );
  const primary = cause.filter((c) => c.pageRole === "primary");
  const core = primary.length ? primary : cause;
  const lab = (id: string) => labels.get(id);
  const text = core.map((c) => c.text).join(" ");

  const named = core
    .map((c) => lab(c.id))
    .filter((l): l is ClaimLabel => !!l && l.namedThingType !== "none");
  const partnersGiving = new Set(
    cause
      .filter(
        (c) =>
          lab(c.id)?.actor === "partner" && lab(c.id)?.mechanism !== "none",
      )
      .map((c) => lab(c.id)?.namedThing ?? c.beneficiary ?? c.id),
  );
  const datedCore = core.filter((c) => c.date);
  const sponsorActions = cause.filter(
    (c) =>
      ["sponsor", "staff"].includes(lab(c.id)?.actor ?? "") &&
      lab(c.id)?.mechanism !== "none",
  );

  let focus: Focus;
  if (named.some((l) => l.namedThingType === "contest") || CONTEST.test(text))
    focus = "contest_award";
  else if (CRISIS.test(text) && partnersGiving.size >= 1)
    focus = "community_response";
  else if (named.some((l) => l.namedThingType === "event") && datedCore.length)
    focus = "event";
  else if (
    named.some(
      (l) => l.namedThingType === "program" || l.namedThingType === "fund",
    )
  )
    focus = "program";
  else if (
    core.some((c) => c.figures.some((f) => f.unit === "USD") && c.beneficiary)
  )
    focus = "gift_grant";
  else focus = sponsorActions.length >= 3 ? "giving_record" : "program";

  const dates = cause
    .map((c) => c.date)
    .filter((d): d is string => !!d)
    .sort();
  const newest = dates[dates.length - 1] ?? null;
  const years = new Set(
    cause
      .flatMap((c) =>
        [...c.text.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map((m) => m[1]),
      )
      .concat(dates.map((d) => d.slice(0, 4))),
  );
  const windowRisk = ledger.datedFacts.some((d) => d.status === "window");
  let time: TimeValue;
  if (newest && newest > ledger.publicationDate) time = "upcoming";
  else if (
    newest &&
    daysBetween(newest, ledger.generationDate) <= RECENCY_LIMIT_DAYS
  )
    time = "latest";
  else if (years.size >= 2) time = "multi_year";
  else time = "this_year";
  if (focus === "giving_record" && (time === "upcoming" || time === "latest"))
    time = years.size >= 2 ? "multi_year" : "this_year";
  if (focus === "community_response" && time === "upcoming") time = "latest";

  const actors = cause.map((c) => lab(c.id)?.actor);
  const role: SponsorRole =
    partnersGiving.size >= 2
      ? "one_of_many"
      : actors.filter((a) => a === "staff").length >
          actors.filter((a) => a === "sponsor").length
        ? "doer"
        : "funder";
  const mechanisms = [
    ...new Set(
      cause
        .map((c) => lab(c.id)?.mechanism)
        .filter((m): m is Mechanism => !!m && m !== "none"),
    ),
  ];

  const missing: string[] = [];
  const hasBeneficiary = cause.some((c) => c.beneficiary);
  const hasFigure = cause.some((c) => c.figures.length);
  if (!hasBeneficiary) missing.push("who it helps");
  if (focus === "gift_grant" && !hasFigure) missing.push("amount or goods");
  if (focus === "event" && time === "upcoming" && !datedCore.length)
    missing.push("date");
  if (focus === "giving_record" && sponsorActions.length < 3)
    missing.push("three or more actions");
  if (time === "multi_year" && !hasFigure)
    missing.push("figures marked annual or cumulative");
  return { focus, time, role, mechanisms, windowRisk, missing };
}
