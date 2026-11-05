import { body, fail, json, options } from "@/lib/http";
import { askFilter } from "@/lib/service";

export const OPTIONS = options;
export const maxDuration = 120;

/** POST /api/stories/ask { text } -> { filter, explanation, count } */
export async function POST(req: Request) {
  try {
    const b = await body<{ text?: string }>(req);
    return json(await askFilter(b.text ?? ""));
  } catch (e) {
    return fail(e);
  }
}
