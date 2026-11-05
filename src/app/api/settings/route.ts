import { body, fail, json, options } from "@/lib/http";
import { getAllSettings, setSetting, settingHistory } from "@/lib/settings";
import { usage } from "@/lib/usage";

export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function GET(req: Request) {
  try {
    const key = new URL(req.url).searchParams.get("history");
    if (key) return json({ history: await settingHistory(key) });
    return json({ settings: await getAllSettings(), usage: await usage() });
  } catch (e) {
    return fail(e);
  }
}
/** POST /api/settings { key, value, author } - each change is stored with author and date. */
export async function POST(req: Request) {
  try {
    const b = await body<{ key: string; value: unknown; author?: string }>(req);
    await setSetting(b.key, b.value, b.author ?? "api");
    return json({ settings: await getAllSettings() });
  } catch (e) {
    return fail(e);
  }
}
