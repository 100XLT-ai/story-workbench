/**
 * Writes the app's own story inputs for the fixture stories to
 * test/goldens/inputs/ (from the snapshot), so the fidelity test runs in CI
 * without a database.  pnpm fixtures
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import { and, eq } from "drizzle-orm";
import { db, schema, sql } from "../src/db";
import { loadStoryInputs } from "../src/lib/data/story-inputs";
import { SEED_SETTINGS } from "../src/lib/seeds/seeds";

const JOBS = [1104, 1100, 1107, 1099];

async function main() {
  fs.mkdirSync("test/goldens/inputs", { recursive: true });
  for (const job of JOBS) {
    const [w] = await db().select().from(schema.stories).where(and(eq(schema.stories.jobId, job), eq(schema.stories.winner, true)));
    const inputs = await loadStoryInputs(w.id, SEED_SETTINGS);
    fs.writeFileSync(`test/goldens/inputs/job-${job}.json`, JSON.stringify(inputs, null, 1) + "\n");
    console.log(`job ${job}: story ${w.id}, ${inputs.pages.length} pages, ${inputs.other_pages.length} other pages`);
  }
  await sql().end();
}
main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
