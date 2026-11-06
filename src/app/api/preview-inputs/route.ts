import { body, fail, json, options } from "@/lib/http";
import { previewInputs } from "@/lib/service";
import type { RunOverrides } from "@/lib/engine/inputs";

export const dynamic = "force-dynamic";
export const OPTIONS = options;
/** POST /api/preview-inputs { version_id | definition, story_id, overrides? } -> every step's rendered messages. No model call. */
export async function POST(req: Request) {
  try {
    return json(await previewInputs(await body<{ version_id?: number; definition?: unknown; story_id: number; overrides?: RunOverrides }>(req)));
  } catch (e) {
    return fail(e);
  }
}
