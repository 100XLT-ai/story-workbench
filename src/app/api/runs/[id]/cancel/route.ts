import { fail, json, options } from "@/lib/http";
import { getRun, runCancel } from "@/lib/service";

export const OPTIONS = options;
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    await runCancel(id);
    return json(await getRun(id));
  } catch (e) {
    return fail(e);
  }
}
