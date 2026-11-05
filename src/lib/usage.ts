import { sql as dsql } from "drizzle-orm";
import { db } from "@/db";

/** Database size and run counts for the Settings page (§10b). */
export async function usage() {
  const rows = (await db().execute(dsql`
    select pg_database_size(current_database())::bigint as db_bytes,
           (select count(*) from runs)::int as runs,
           (select count(*) from run_stories)::int as run_stories,
           (select count(*) from traces)::int as traces,
           (select count(*) from traces where kind = 'prompt' and status = 'done')::int as model_calls,
           (select coalesce(sum(cost),0) from run_stories)::float as spend,
           (select count(*) from run_stories where started_at > now() - interval '30 days')::int as stories_30d`)) as unknown as {
    db_bytes: string | number;
    runs: number;
    run_stories: number;
    traces: number;
    model_calls: number;
    spend: number;
    stories_30d: number;
  }[];
  const r = rows[0];
  // Each story workflow writes about 4 events per model call plus a few for the code steps.
  const events = Math.round(r.model_calls * 4 + r.run_stories * 6);
  return {
    databaseMb: Math.round(Number(r.db_bytes) / 1e5) / 10,
    databaseLimitMb: 512,
    runs: r.runs,
    storiesRun: r.run_stories,
    traces: r.traces,
    modelCalls: r.model_calls,
    spendUsd: Math.round(r.spend * 10000) / 10000,
    storiesLast30Days: r.stories_30d,
    workflowEventsEstimate: events,
    workflowEventsNote: "Estimated from the traces (about 4 events per model call). Vercel Hobby includes about 50,000 workflow events a month.",
  };
}
