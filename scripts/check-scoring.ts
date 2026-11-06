/**
 * Runs the scoring explainer over every story and counts, per system and part, how often the
 * value recomputed with longtale-core's own functions equals the stored value (DECISIONS D48).
 *   DATABASE_URL=<local> pnpm exec tsx scripts/check-scoring.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { asc } from "drizzle-orm";

async function main() {
  const { db, schema } = await import("../src/db");
  const { scoringForJob } = await import("../src/lib/data/scoring");
  const jobs = await db().selectDistinct({ id: schema.stories.jobId }).from(schema.stories).orderBy(asc(schema.stories.jobId));
  const tally = new Map<string, Record<string, number>>();
  const add = (k: string, check: string | null) => {
    const t = tally.get(k) ?? {};
    t[check ?? "shown"] = (t[check ?? "shown"] ?? 0) + 1;
    tally.set(k, t);
  };
  for (const j of jobs) {
    for (const s of await scoringForJob(j.id)) {
      for (const [sys, e] of Object.entries(s.systems)) {
        if (!e) continue;
        const tag = `${s.rankingSystem === "untagged" ? "untagged" : s.rankingSystem} › ${sys}${e.ranked ? "" : " (not ranking)"}`;
        for (const p of [...e.parts, e.score, e.grade, e.confidence]) if (p) add(`${tag} › ${p.key}`, p.check);
        if (e.grade?.check === "differs") add(`${tag} › deal_grade differs: computed ${e.grade.computed} → stored ${e.grade.stored}`, null);
      }
    }
  }
  for (const [k, v] of [...tally].sort()) console.log(k.padEnd(80), JSON.stringify(v));
  process.exit(0);
}
main();
