import { body, fail, json, options } from "@/lib/http";
import { runEstimate } from "@/lib/service";

export const OPTIONS = options;
/** POST /api/runs/estimate { version_id, story_ids? | filter? } */
export async function POST(req: Request) {
  try {
    return json(await runEstimate(await body(req)));
  } catch (e) {
    return fail(e);
  }
}
