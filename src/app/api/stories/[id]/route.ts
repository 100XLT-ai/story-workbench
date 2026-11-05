import { fail, json, notFound, options } from "@/lib/http";
import { getStory } from "@/lib/service";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await getStory(Number((await params).id));
    return s ? json(s) : notFound("story");
  } catch (e) {
    return fail(e);
  }
}
