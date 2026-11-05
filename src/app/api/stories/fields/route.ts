import { json, options } from "@/lib/http";
import { listStoryFields } from "@/lib/service";

export const OPTIONS = options;
export async function GET() {
  return json(listStoryFields());
}
