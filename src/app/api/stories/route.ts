import { body, fail, json, num, options } from "@/lib/http";
import { findStories } from "@/lib/service";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

/** GET /api/stories?filter=[...]&sort=rank&dir=asc&limit=50&offset=0&explain=1 (explain adds each ranking system's inputs and scores per row) */
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const dir = u.searchParams.get("dir");
    return json(
      await findStories({
        filter: u.searchParams.get("filter") ?? undefined,
        sort: u.searchParams.get("sort") ?? undefined,
        dir: dir === "desc" ? "desc" : "asc",
        limit: num(u.searchParams.get("limit")),
        offset: num(u.searchParams.get("offset")),
        explain: ["1", "true", "yes"].includes(u.searchParams.get("explain") ?? ""),
      }),
    );
  } catch (e) {
    return fail(e);
  }
}

/** POST /api/stories with { filter, sort, dir, limit, offset } (the same query, in a body). */
export async function POST(req: Request) {
  try {
    return json(await findStories(await body(req)));
  } catch (e) {
    return fail(e);
  }
}
