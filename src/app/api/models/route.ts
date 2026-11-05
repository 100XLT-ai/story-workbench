import { fail, json, options } from "@/lib/http";
import { models } from "@/lib/service";

export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function GET(req: Request) {
  try {
    const q = (new URL(req.url).searchParams.get("q") ?? "").toLowerCase();
    const all = await models();
    return json({ models: q ? all.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)) : all });
  } catch (e) {
    return fail(e);
  }
}
