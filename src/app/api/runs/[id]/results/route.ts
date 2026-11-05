import { CORS, fail, json, notFound, options } from "@/lib/http";
import { getRun } from "@/lib/service";
import { runCsv, runJson, runMarkdown } from "@/lib/runs/export";

export const dynamic = "force-dynamic";
export const OPTIONS = options;
export const maxDuration = 120;

/** GET /api/runs/:id/results?format=json|csv|md (json holds every trace). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    const run = await getRun(id);
    if (!run) return notFound("run");
    const format = new URL(req.url).searchParams.get("format") ?? "json";
    if (format === "csv")
      return new Response(runCsv(run), { headers: { ...CORS, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="run-${id}.csv"` } });
    if (format === "md")
      return new Response(await runMarkdown(run), { headers: { ...CORS, "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="run-${id}.md"` } });
    return json(await runJson(run), 200, { "Content-Disposition": `attachment; filename="run-${id}.json"` });
  } catch (e) {
    return fail(e);
  }
}
