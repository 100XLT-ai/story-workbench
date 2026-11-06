import { fail, json, options } from "@/lib/http";
import { storyCoverage } from "@/lib/service";

export const dynamic = "force-dynamic";
export const OPTIONS = options;
/** GET /api/stories/coverage -> { systems: [{ rankingSystem, stories, jobs, noPage, noText, emptyLedger, firstRun, lastRun }] } */
export async function GET() {
  try {
    return json(await storyCoverage());
  } catch (e) {
    return fail(e);
  }
}
