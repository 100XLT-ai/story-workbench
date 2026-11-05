import { fail, json, options } from "@/lib/http";
import { usage } from "@/lib/usage";

export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function GET() {
  try {
    return json({ ok: true, ...(await usage()) });
  } catch (e) {
    return fail(e);
  }
}
