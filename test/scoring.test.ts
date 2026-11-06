/**
 * Part 2 (2026-11-06, D48): the scoring functions copied from longtale-core give the values of
 * its own golden files (test/goldens/scoring, trimmed copies of
 * apps/api/src/api/modules/discovery/pipeline/__tests__/__golden__/job-6xx.golden.json).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildBeneficiaryInterest, scoreCandidate } from "../src/lib/scoring/upstream/cause-score";
import { computeConfidence, computeDealGrade, computeRecencyTier, REACH_STUB } from "../src/lib/scoring/upstream/tiers";
import { rankedBy } from "../src/lib/scoring/systems";

interface Candidate {
  id: string;
  sourceUrl: string;
  onDomain: boolean;
  amountUsd: number | null;
  attendees: number | null;
  signalDate: string | null;
  hasQuote: boolean;
  beneficiary: string | null;
  expected: {
    scoreComponents: Record<string, number>;
    total: number;
    tierRecency: number | null;
    tierReach: number | null;
    weightedScore: number | null;
    dealGrade: string | null;
    confidence: string | null;
    winnerFlag: boolean;
  };
}
interface Golden {
  meta: { jobId: string; now: string; advertiserHost: string };
  cohortExtras: { beneficiary: string | null }[];
  candidates: Candidate[];
}

const DIR = path.resolve(__dirname, "goldens", "scoring");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"));

describe("scoring: longtale-core's golden jobs", () => {
  it("has the 12 golden jobs", () => expect(files.length).toBe(12));
  for (const f of files) {
    const g = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as Golden;
    const now = new Date(g.meta.now);
    // The interest map counts every harvested candidate: the scored ones plus the cohort extras.
    const interest = buildBeneficiaryInterest([...g.candidates.map((c) => c.beneficiary), ...g.cohortExtras.map((c) => c.beneficiary)]);
    it(`job ${g.meta.jobId}: cause-score parts, v1 recency and reach tiers, deal grade, confidence`, () => {
      for (const c of g.candidates) {
        const r = scoreCandidate(
          { amountUsd: c.amountUsd, attendees: c.attendees, signalDate: c.signalDate ? new Date(c.signalDate) : null, evidenceQuote: c.hasQuote ? "q" : null, beneficiary: c.beneficiary, sourceUrl: c.sourceUrl, onDomain: c.onDomain },
          { advertiserHost: g.meta.advertiserHost, beneficiaryInterest: interest },
          now,
        );
        for (const [k, v] of Object.entries(c.expected.scoreComponents)) expect(r.components[k as keyof typeof r.components], `${c.id} ${k}`).toBeCloseTo(v, 6);
        expect(r.total).toBeCloseTo(c.expected.total, 6);
        if (c.expected.tierRecency !== null) expect(computeRecencyTier(c.signalDate ? new Date(c.signalDate) : null, now), `${c.id} recency tier`).toBe(c.expected.tierRecency);
        if (c.expected.tierReach !== null) expect(c.expected.tierReach).toBe(REACH_STUB);
        expect(computeDealGrade(c.expected.weightedScore), `${c.id} grade`).toBe(c.expected.dealGrade);
        if (c.expected.winnerFlag && c.expected.confidence) expect(computeConfidence(r.components.attribution)).toBe(c.expected.confidence);
      }
    });
  }

  it("names the system that ranked a story", () => {
    expect(rankedBy("untagged", 5.2)).toBe("weighted-grade@v1");
    expect(rankedBy("untagged", null)).toBe("cause-score@v1");
    expect(rankedBy("simple-score@v1", 70)).toBe("simple-score@v1");
    expect(rankedBy("weighted-grade@v2", 4.1)).toBe("weighted-grade@v2");
  });
});
