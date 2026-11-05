/**
 * Creates the three seed families and versions when they do not exist (§2.1, §3.2).
 *   pnpm seed
 * It never changes a version that exists.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { db, schema, sql } from "../src/db";
import { checkDefinition } from "../src/lib/versions";
import { loadSeedPrompts } from "../src/lib/seeds/load";
import { SEED_FAMILIES } from "../src/lib/seeds/seeds";

async function main() {
  const prompts = loadSeedPrompts();
  for (const fam of SEED_FAMILIES) {
    let [f] = await db().select().from(schema.families).where(eq(schema.families.name, fam.name));
    if (!f) [f] = await db().insert(schema.families).values({ name: fam.name, description: fam.description }).returning();
    const existing = await db().select().from(schema.versions).where(eq(schema.versions.familyId, f.id));
    if (existing.some((v) => v.major === fam.major && v.minor === 0)) {
      console.log(`${fam.name} ${fam.major}.0 exists; left as it is`);
      continue;
    }
    const def = checkDefinition(fam.build(prompts));
    await db().insert(schema.versions).values({ familyId: f.id, major: fam.major, minor: 0, author: "seed", parentId: null, note: fam.note, definition: def as never });
    console.log(`created ${fam.name} ${fam.major}.0 (${def.steps.length} steps)`);
  }
  await sql().end();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
