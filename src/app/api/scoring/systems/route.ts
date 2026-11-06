import { json, options } from "@/lib/http";
import { scoringSystems } from "@/lib/service";

export const OPTIONS = options;
/** GET /api/scoring/systems -> each ranking system: date, commit, formula, deal-grade bounds, confidence rule, columns. */
export async function GET() {
  return json({ systems: scoringSystems });
}
