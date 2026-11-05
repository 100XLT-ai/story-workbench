import { fail, json, options } from "@/lib/http";
import { listFamilies } from "@/lib/service";

export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function GET() {
  try {
    return json({ families: await listFamilies() });
  } catch (e) {
    return fail(e);
  }
}
