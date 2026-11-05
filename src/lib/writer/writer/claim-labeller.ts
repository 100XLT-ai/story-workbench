import type { IChatMessage } from "../llm-types";
import type { FactLedger } from "../ledger/ledger.types";

export type Material = "cause" | "company";
export type ClaimState = "done" | "promised" | "ongoing" | "expired";
export type Actor = "sponsor" | "partner" | "staff" | "customers" | "other";
export type Mechanism =
  | "money"
  | "cause_purchase"
  | "matching"
  | "fundraising"
  | "volunteering"
  | "in_kind"
  | "none";
export type NamedThingType = "program" | "event" | "fund" | "contest" | "none";

export interface ClaimLabel {
  id: string;
  material: Material;
  state: ClaimState;
  actor: Actor;
  mechanism: Mechanism;
  namedThing: string | null;
  namedThingType: NamedThingType;
  claimedBy: string | null;
}

export const LABELLER_PROMPT_VERSION = "claim-labels@v1";

export const LABELLER_SYSTEM = `You label facts about a sponsor's community work. You do not rewrite them.
For each claim, return:
- material: "company" if the claim is about who the sponsor is in general (what it sells, how it is owned, its history, mission or size), else "cause".
- state: "done", "promised" (a pledge or plan), "ongoing" (a program that continues) or "expired" (an offer or event that is over).
- actor: who did it: "sponsor", "partner" (another organization), "staff" (the sponsor's employees as volunteers), "customers", or "other".
- mechanism: "money", "cause_purchase", "matching", "fundraising", "volunteering", "in_kind" or "none".
- named_thing: the named program, event, fund or contest the claim belongs to, exactly as written, or null.
- named_thing_type: "program", "event", "fund", "contest" or "none".
- claimed_by: when the claim states a first, a record, a prediction or an outcome, the organization or person that claims it; else null.
Use only the claim text. Return JSON only: {"labels":[{"id","material","state","actor","mechanism","named_thing","named_thing_type","claimed_by"}]}`;

/** Messages for the one cheap labelling call over the ledger claims. */
export function buildLabellerMessages(
  ledger: FactLedger,
  system: string = LABELLER_SYSTEM,
): IChatMessage[] {
  const claims = ledger.claims.map((c) => ({
    id: c.id,
    text: c.text,
    date: c.date,
  }));
  return [
    { role: "system", content: system },
    {
      role: "user",
      content: JSON.stringify({
        sponsor: ledger.sponsorName,
        sponsor_names: ledger.sponsorAliases,
        claims,
      }),
    },
  ];
}

function pick<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/** Parses the labeller JSON; unknown or missing claims get safe defaults. */
export function parseLabels(
  raw: unknown,
  ledger: FactLedger,
): Map<string, ClaimLabel> {
  const list =
    typeof raw === "object" &&
    raw !== null &&
    Array.isArray((raw as { labels?: unknown }).labels)
      ? (raw as { labels: unknown[] }).labels
      : [];
  const byId = new Map<string, ClaimLabel>();
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const id = str(o.id);
    if (!id) continue;
    byId.set(id, {
      id,
      material: pick(o.material, ["cause", "company"] as const, "cause"),
      state: pick(
        o.state,
        ["done", "promised", "ongoing", "expired"] as const,
        "done",
      ),
      actor: pick(
        o.actor,
        ["sponsor", "partner", "staff", "customers", "other"] as const,
        "other",
      ),
      mechanism: pick(
        o.mechanism,
        [
          "money",
          "cause_purchase",
          "matching",
          "fundraising",
          "volunteering",
          "in_kind",
          "none",
        ] as const,
        "none",
      ),
      namedThing: str(o.named_thing),
      namedThingType: pick(
        o.named_thing_type,
        ["program", "event", "fund", "contest", "none"] as const,
        "none",
      ),
      claimedBy: str(o.claimed_by),
    });
  }
  for (const c of ledger.claims) {
    if (!byId.has(c.id)) {
      byId.set(c.id, {
        id: c.id,
        material: "cause",
        state: "done",
        actor: "other",
        mechanism: "none",
        namedThing: null,
        namedThingType: "none",
        claimedBy: null,
      });
    }
  }
  return byId;
}
