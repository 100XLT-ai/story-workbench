import { fail, json, notFound, options } from "@/lib/http";
import { getTrace } from "@/lib/service";

export const dynamic = "force-dynamic";
export const OPTIONS = options;
/** GET /api/run-stories/:id?step=<id> - the trace of one story in one run, by its run-story id. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const t = await getTrace(Number((await params).id), new URL(req.url).searchParams.get("step") ?? undefined);
    return t ? json(t) : notFound("run story");
  } catch (e) {
    return fail(e);
  }
}
