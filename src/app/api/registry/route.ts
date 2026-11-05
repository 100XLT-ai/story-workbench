import { json, options } from "@/lib/http";
import { registry } from "@/lib/service";

export const OPTIONS = options;
export async function GET() {
  return json({ functions: registry() });
}
