import { body, fail, json, options } from "@/lib/http";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseFilter } from "@/lib/engine/filter";

export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function GET() {
  try {
    return json({ filters: await db().select().from(schema.savedFilters).orderBy(desc(schema.savedFilters.id)) });
  } catch (e) {
    return fail(e);
  }
}
/** POST /api/saved-filters { name, filter, author } */
export async function POST(req: Request) {
  try {
    const b = await body<{ name?: string; filter?: unknown; author?: string }>(req);
    if (!b.name?.trim()) return json({ error: "A name is needed." }, 400);
    const [row] = await db().insert(schema.savedFilters).values({ name: b.name.trim(), filter: parseFilter(b.filter) as never, author: b.author || "api" }).returning();
    return json(row, 201);
  } catch (e) {
    return fail(e);
  }
}
