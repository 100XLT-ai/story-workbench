import { fail, json, notFound, options } from "@/lib/http";
import { compareTraces } from "@/lib/service";

export const dynamic = "force-dynamic";
export const OPTIONS = options;
/** GET /api/traces/compare?a=<run_story_id>&b=<run_story_id> */
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const c = await compareTraces(Number(u.searchParams.get("a")), Number(u.searchParams.get("b")));
    return c ? json(c) : notFound("trace");
  } catch (e) {
    return fail(e);
  }
}
