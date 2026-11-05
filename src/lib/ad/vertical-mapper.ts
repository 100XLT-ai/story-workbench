/**
 * Deterministic advertiser-vertical mapper.
 *
 * Net-new — no appendix source (see .plan/ad-generator/01-spec.md Slice 1,
 * Architecture "New module" table: `vertical-mapper.ts | mapVertical,
 * DEFAULT_VERTICAL, VERTICAL_KEYWORDS | net-new (no appendix)`).
 *
 * RULE: vertical classification reuses existing crawl output — never a new
 * LLM call. `mapVertical` is synchronous and pure: no I/O, no Promise.
 *
 * Resolution order (spec §Slice 1 "Data Model" bullet):
 *   1. `orgType === "NONPROFIT"` -> `"Nonprofit_Community"`.
 *   2. Else keyword match: lowercase `industry` + `businessType` against
 *      `VERTICAL_KEYWORDS`. Verticals are tested in `VERTICAL_KEYWORDS`'s
 *      key order, which is deliberately ordered most-specific first so a
 *      narrow vertical (e.g. "restaurant") never loses a hit to a broader
 *      catch-all vertical that happens to be checked first.
 *   3. No hit -> `DEFAULT_VERTICAL`.
 */

/** The 12 appendix-M verticals (matrix.ts:STYLE_MATRIX / fallback.ts:FALLBACK keys). */
export type Vertical =
  | "Tech_SaaS"
  | "CPG_Physical"
  | "Restaurant_QSR"
  | "Finance_Fintech"
  | "Healthcare_Wellness"
  | "Fashion_Apparel"
  | "Automotive"
  | "Real_Estate"
  | "Entertainment_Gaming"
  | "Travel_Hospitality"
  | "Nonprofit_Community"
  | "Government_Civic";

/**
 * Exported named constant (not inlined) so the fallback vertical moves
 * without editing `mapVertical`'s logic.
 */
export const DEFAULT_VERTICAL: Vertical = "Nonprofit_Community";

export interface VerticalMapperInput {
  industry?: string | null;
  businessType?: string | null;
  orgType?: string | null;
}

/**
 * Keyword lists tested in this object's key order — most-specific verticals
 * first, broad catch-alls (`Tech_SaaS`, `CPG_Physical`, `Nonprofit_Community`)
 * last, so a specific match always wins over a generic one.
 */
export const VERTICAL_KEYWORDS: Record<Vertical, string[]> = {
  Restaurant_QSR: [
    "restaurant",
    "cafe",
    "café",
    "diner",
    "qsr",
    "bakery",
    "coffee shop",
    "food truck",
    "pizzeria",
    "bar & grill",
    "eatery",
  ],
  Automotive: [
    "automotive",
    "auto repair",
    "car dealership",
    "car dealer",
    "auto body",
    "tire shop",
    "mechanic",
    "auto parts",
  ],
  Healthcare_Wellness: [
    "health",
    "clinic",
    "wellness",
    "medical",
    "dental",
    "dentist",
    "hospital",
    "therapy",
    "chiropractic",
    "pharmacy",
    "urgent care",
  ],
  Real_Estate: [
    "real estate",
    "realtor",
    "realty",
    "property management",
    "brokerage",
  ],
  Finance_Fintech: [
    "bank",
    "banking",
    "credit union",
    "fintech",
    "insurance",
    "financial advisor",
    "lending",
    "investment",
  ],
  Fashion_Apparel: [
    "apparel",
    "clothing",
    "clothing boutique",
    "fashion",
    "footwear",
    "jewelry",
  ],
  Travel_Hospitality: [
    "hotel",
    "resort",
    "travel agency",
    "hospitality",
    "airline",
    "tourism",
    "bed and breakfast",
  ],
  Entertainment_Gaming: [
    "entertainment",
    "gaming",
    "arcade",
    "esports",
    "theater",
    "theatre",
    "cinema",
    "amusement",
  ],
  Government_Civic: [
    "government",
    "municipal",
    "city hall",
    "civic",
    "county",
    "public works",
    "township",
  ],
  Tech_SaaS: [
    "saas",
    "software",
    "tech startup",
    "technology company",
    "app developer",
    "it services",
  ],
  CPG_Physical: [
    "cpg",
    "consumer goods",
    "manufacturer",
    "retail brand",
    "packaged goods",
  ],
  Nonprofit_Community: [
    "nonprofit",
    "non-profit",
    "charity",
    "community organization",
    "foundation",
    "ngo",
  ],
};

/**
 * Resolves an advertiser's vertical from free-text org fields. Synchronous
 * and pure — see the module doc comment for the resolution order.
 */
export function mapVertical(input: VerticalMapperInput): Vertical {
  if (input.orgType === "NONPROFIT") {
    return "Nonprofit_Community";
  }

  const haystack =
    `${input.industry ?? ""} ${input.businessType ?? ""}`.toLowerCase();
  if (haystack.trim().length === 0) {
    return DEFAULT_VERTICAL;
  }

  for (const vertical of Object.keys(VERTICAL_KEYWORDS) as Vertical[]) {
    const keywords = VERTICAL_KEYWORDS[vertical];
    if (keywords.some((keyword) => haystack.includes(keyword))) {
      return vertical;
    }
  }

  return DEFAULT_VERTICAL;
}
