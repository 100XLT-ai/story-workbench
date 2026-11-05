import type { FactLedger, LedgerClaim } from "../ledger/ledger.types";
import type { ClaimLabel } from "./claim-labeller";
import type { StoryType } from "./story-type";

export interface WriterSettings {
  publisher: string;
  sponsor: string;
  sponsorPrograms: string[];
  targetWords: number;
  minWords: number;
  maxWords: number;
}

export interface WriterInput {
  storyType: StoryType;
  facts: string;
  company: string;
  quotes: string;
  risks: string;
  thin: string;
  conflictClaimIds: Set<string>;
  companyClaimIds: Set<string>;
}

export const MAX_COMPANY_FACTS = 2;

function factLine(
  c: LedgerClaim,
  l: ClaimLabel | undefined,
  note: string | null,
): string {
  const tags = [
    l?.state,
    c.date,
    l && l.actor !== "other" ? `actor: ${l.actor}` : null,
    l && l.mechanism !== "none" ? l.mechanism : null,
    l?.namedThing ? `named: ${l.namedThing}` : null,
    l?.claimedBy ? `claimed by: ${l.claimedBy}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return `${c.id} [${tags}] ${c.text}${note ? ` (${note})` : ""}`;
}

/** Turns the ledger and its labels into the text blocks the writer reads. */
export function buildWriterInput(
  ledger: FactLedger,
  labels: Map<string, ClaimLabel>,
  storyType: StoryType,
): WriterInput {
  const conflictClaimIds = new Set(
    ledger.conflicts
      .filter((c) => c.kind === "conflict")
      .flatMap((c) => c.values.map((v) => v.claimId)),
  );
  const companyAll = ledger.claims.filter(
    (c) => labels.get(c.id)?.material === "company",
  );
  const companyClaimIds = new Set(companyAll.map((c) => c.id));
  const expired = new Map(
    ledger.datedFacts
      .filter((d) => d.isOffer && d.status !== "future")
      .map((d) => [d.claimId, d]),
  );

  const facts = ledger.claims
    .filter((c) => !companyClaimIds.has(c.id))
    .map((c) => {
      const offer = expired.get(c.id);
      const note = conflictClaimIds.has(c.id)
        ? "CONFLICT: a figure here disagrees with another fact. Use the fact without that figure, or not at all"
        : offer
          ? `OFFER ENDS ${offer.date}, before or near publication: past tense only, never in the CTA`
          : null;
      return factLine(c, labels.get(c.id), note);
    })
    .join("\n");
  const company =
    companyAll
      .slice(0, MAX_COMPANY_FACTS)
      .map((c) => factLine(c, labels.get(c.id), null))
      .join("\n") || "(none)";
  const quotes =
    ledger.quotes
      .map(
        (q) =>
          `${q.id} - ${q.speaker}${q.role ? ` (${q.role})` : ""} [${q.isSponsorVoice ? "sponsor voice" : "outside voice"}]: "${q.text}"`,
      )
      .join("\n") || "(none: write no quotes)";

  const risks: string[] = [];
  for (const c of ledger.conflicts.filter((x) => x.kind === "conflict")) {
    risks.push(
      `conflict: ${c.values.map((v) => `${v.claimId} says ${v.raw}`).join("; ")} (${c.key}). Never print any of these figures.`,
    );
  }
  for (const d of ledger.datedFacts.filter(
    (x) => x.isOffer && x.status !== "future",
  )) {
    risks.push(
      `expiring_offer: ${d.claimId} ends ${d.date}; the piece runs after ${ledger.generationDate}. Never write it as open.`,
    );
  }
  for (const d of ledger.datedFacts.filter((x) => x.status === "window")) {
    risks.push(
      `window: ${d.claimId} is dated ${d.date}, between generation and publication. Do not write it as upcoming or as done.`,
    );
  }
  for (const [id, l] of labels)
    if (l.claimedBy)
      risks.push(
        `attribution: ${id} is a claim by ${l.claimedBy}. Say it is theirs.`,
      );
  const thisYear = Number(ledger.generationDate.slice(0, 4));
  for (const [id, l] of labels) {
    if (l.state !== "promised") continue;
    const claim = ledger.claims.find((c) => c.id === id);
    const years = [...(claim?.text ?? "").matchAll(/\b(20\d{2})\b/g)].map((m) =>
      Number(m[1]),
    );
    if (years.length && Math.max(...years) < thisYear)
      risks.push(
        `stale_plan: ${id} was a plan for ${Math.max(...years)}. Never write it in the future tense; say only what was planned then.`,
      );
    else
      risks.push(
        `promise: ${id} is promised, not done. Never write it as done.`,
      );
  }

  const thin = ledger.thin.isThin
    ? `THIN: ${ledger.thin.reasons.join("; ")}`
    : "OK";
  return {
    storyType,
    facts,
    company,
    quotes,
    risks: risks.join("\n") || "(none)",
    thin,
    conflictClaimIds,
    companyClaimIds,
  };
}
