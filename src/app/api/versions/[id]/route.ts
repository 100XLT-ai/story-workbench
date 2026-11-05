import { fail, json, notFound, options } from "@/lib/http";
import { versionGet } from "@/lib/service";

export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const v = await versionGet(Number((await params).id));
    return v ? json(v) : notFound("version");
  } catch (e) {
    return fail(e);
  }
}
