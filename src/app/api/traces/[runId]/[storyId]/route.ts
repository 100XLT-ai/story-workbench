import { fail, json, notFound, options } from "@/lib/http";
import { getTrace, runStoryFor } from "@/lib/service";

export const dynamic = "force-dynamic";
export const OPTIONS = options;
/** GET /api/traces/:runId/:storyId?step=write - one story's traces in one run. */
export async function GET(req: Request, { params }: { params: Promise<{ runId: string; storyId: string }> }) {
  try {
    const p = await params;
    const rs = await runStoryFor(Number(p.runId), Number(p.storyId));
    if (!rs) return notFound("trace");
    const t = await getTrace(rs, new URL(req.url).searchParams.get("step") ?? undefined);
    return t ? json(t) : notFound("trace");
  } catch (e) {
    return fail(e);
  }
}
