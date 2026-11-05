import { fail, json, notFound, options } from "@/lib/http";
import { versionGet } from "@/lib/service";

export const dynamic = "force-dynamic";
export const OPTIONS = options;
/** The version's full definition as one JSON file (the only export, spec 4). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const v = await versionGet(Number((await params).id));
    if (!v) return notFound("version");
    const name = v.label.replace(/[^A-Za-z0-9.]+/g, "-").replace(/-+$/, "");
    return json(
      { id: v.id, label: v.label, family: v.family, number: v.number, author: v.author, parentId: v.parentId, note: v.note, createdAt: v.createdAt, definition: v.definition },
      200,
      { "Content-Disposition": `attachment; filename="${name}.json"` },
    );
  } catch (e) {
    return fail(e);
  }
}
