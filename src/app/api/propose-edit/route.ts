import { body, fail, json, options } from "@/lib/http";
import { proposeEdit } from "@/lib/service";

export const OPTIONS = options;
export const maxDuration = 300;
/** POST /api/propose-edit { version_id, step_id?, comment, trace?: { run_story_id, step_id? } } */
export async function POST(req: Request) {
  try {
    return json(await proposeEdit(await body(req)));
  } catch (e) {
    return fail(e);
  }
}
