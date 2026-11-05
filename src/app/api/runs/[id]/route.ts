import { fail, json, notFound, options } from "@/lib/http";
import { getRun } from "@/lib/service";

export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const r = await getRun(Number((await params).id));
    return r ? json(r) : notFound("run");
  } catch (e) {
    return fail(e);
  }
}
