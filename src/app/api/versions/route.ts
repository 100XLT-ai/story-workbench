import { body, fail, json, num, options } from "@/lib/http";
import { versionCreate, versionsList } from "@/lib/service";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

export async function GET(req: Request) {
  try {
    return json({ versions: await versionsList(num(new URL(req.url).searchParams.get("family_id"))) });
  } catch (e) {
    return fail(e);
  }
}

/**
 * POST /api/versions
 * { author, note, parent_id, changes: [{ step_id, field, new_value }], edits: [{ op, step, after, step_id }] }
 * or { author, note, parent_id?, family_id?, definition: { steps, settings } }
 * or with new_family: "Name" to copy into a new family at 1.0.
 */
export async function POST(req: Request) {
  try {
    return json(await versionCreate(await body(req)), 201);
  } catch (e) {
    return fail(e);
  }
}
