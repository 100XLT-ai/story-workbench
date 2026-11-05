import { body, fail, json, options } from "@/lib/http";
import { versionPreview } from "@/lib/service";

export const OPTIONS = options;
/** POST /api/versions/preview { parent_id, definition } -> { issues, diff } (nothing is saved). */
export async function POST(req: Request) {
  try {
    return json(await versionPreview(await body(req)));
  } catch (e) {
    return fail(e);
  }
}
