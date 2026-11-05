import { body, fail, json, options } from "@/lib/http";
import { listRuns, runStart } from "@/lib/service";

export const dynamic = "force-dynamic";
export const OPTIONS = options;
export const maxDuration = 120;

export async function GET() {
  try {
    return json({ runs: await listRuns() });
  } catch (e) {
    return fail(e);
  }
}

/** POST /api/runs { version_id, story_ids? | filter?, author?, overrides?: { generation_date, publisher, sponsor, aliases, programs }, note? } */
export async function POST(req: Request) {
  try {
    return json(await runStart(await body(req)), 201);
  } catch (e) {
    return fail(e);
  }
}
