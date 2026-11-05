/**
 * Copies the fixed snapshot from longtale_dv2 (read only) into the app tables.
 *
 *   pnpm import            # reads SOURCE_DATABASE_URL, writes DATABASE_URL
 *
 * Safe to run again: it replaces the snapshot tables whole and never touches
 * families, versions, runs, traces, saved filters or settings. It also writes
 * data/expected-counts.json, computed with longtale-core's own buildFactLedger
 * (LONGTALE_CORE_DIR), and stops if the app's port gives other numbers.
 */
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import postgres from "postgres";
import { buildFactLedger } from "../src/lib/writer/ledger/fact-ledger";
import { impactsFromCauseSignal, ledgerInputFor, type LoadedPage } from "../src/lib/writer/harness";

config({ path: ".env.local" });

const SOURCE = process.env.SOURCE_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/longtale_dv2";
const TARGET = process.env.IMPORT_DATABASE_URL ?? process.env.DATABASE_URL;
const CORE =
  process.env.LONGTALE_CORE_DIR ?? "C:/dev/a-empath-ai/longtale-core/.claude/worktrees/beautiful-lumiere-d74efc";

if (!TARGET) throw new Error("DATABASE_URL is not set");
if (!/longtale_dv2/.test(SOURCE)) throw new Error("SOURCE_DATABASE_URL must point at longtale_dv2");

type Row = Record<string, unknown>;
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const day = (v: unknown): string | null => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "string" ? v.slice(0, 10) : null);
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

async function main() {
  const src = new pg.Client({ connectionString: SOURCE });
  await src.connect();
  // Read only, enforced by the server for this session.
  await src.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
  await src.query("BEGIN READ ONLY");
  // Timestamps without time zone: read them as text so no local time zone moves a date.
  pg.types.setTypeParser(1114, (v: string) => v);
  const q = async (sql: string, params: unknown[] = []) => (await src.query(sql, params)).rows as Row[];

  const mastheads = JSON.parse(fs.readFileSync("data/mastheads.json", "utf8")) as Record<string, string>;
  const sponsorNames = JSON.parse(fs.readFileSync("data/sponsor-names.json", "utf8")) as Record<string, { aliases: string[]; programs: string[] }>;

  console.log("reading the source…");
  const candidates = await q(`select * from discovery_cause_candidates where rank is not null and deleted_at is null order by id`);
  const jobIds = [...new Set(candidates.map((c) => Number(c.job_id)))];
  const jobs = await q(
    `select j.id, j.domain, j.url, j.organization_id, j.market_id, j.created_at, j.status::text as status, o.name as org_name, m.name as market_name
       from workflow_jobs j left join organizations o on o.id = j.organization_id left join markets m on m.id = j.market_id
      where j.id = any($1::bigint[])`,
    [jobIds],
  );
  const orgIds = [...new Set(jobs.map((j) => j.organization_id).filter((x) => x !== null).map(Number))];
  const orgs = await q(
    `select id, name, description, org_type::text as org_type, industry, business_type, website, city, state, country, business_address
       from organizations where id = any($1::bigint[])`,
    [orgIds],
  );
  const brands = await q(`select * from organization_brand_profiles where organization_id = any($1::bigint[]) and deleted_at is null order by id`, [orgIds]);
  const ideas = await q(
    `select distinct on (discovery_cause_candidate_id) discovery_cause_candidate_id, title, description
       from discovery_ranked_ideas where discovery_cause_candidate_id is not null and deleted_at is null
      order by discovery_cause_candidate_id, attempt_number, id`,
  );
  const pagesRows = await q(
    `select id, job_id, source_url, source_title, page_type, published_date, text_published_date, extractor_version, summary,
            facts, quotes, cause_signal, scraped_markdown, deleted_at is not null as deleted
       from discovery_page_extracts where job_id = any($1::bigint[]) order by id`,
    [jobIds],
  );
  const candIds = candidates.map((c) => Number(c.id));
  const links = await q(`select id, candidate_id, page_extract_id, role from discovery_candidate_pages where candidate_id = any($1::bigint[]) order by id`, [candIds]);
  const candImages = await q(`select id, candidate_id, image_id, rank from discovery_candidate_images where candidate_id = any($1::bigint[]) order by id`, [candIds]);
  const images = await q(
    `select i.id, i.job_id, i.image_url, i.usable, i.confidence, i.classification, i.classifier_version,
            (select min(pi.page_extract_id) from discovery_page_images pi where pi.image_id = i.id) as page_extract_id
       from discovery_page_extract_images i where i.job_id = any($1::bigint[]) and i.deleted_at is null`,
    [jobIds],
  );
  await src.query("COMMIT");
  await src.end();
  console.log(`source: ${candidates.length} stories, ${jobs.length} jobs, ${pagesRows.length} pages, ${images.length} images`);

  // ---------------------------------------------------------------- derive
  const jobById = new Map(jobs.map((j) => [Number(j.id), j]));
  const orgById = new Map(orgs.map((o) => [Number(o.id), o]));
  const brandByOrg = new Map<number, Row>();
  for (const b of brands) if (!brandByOrg.has(Number(b.organization_id))) brandByOrg.set(Number(b.organization_id), b);
  const ideaByCand = new Map(ideas.map((i) => [Number(i.discovery_cause_candidate_id), i]));
  const pageById = new Map(pagesRows.map((p) => [Number(p.id), p]));
  const linksByCand = new Map<number, Row[]>();
  for (const l of links) {
    const k = Number(l.candidate_id);
    linksByCand.set(k, [...(linksByCand.get(k) ?? []), l]);
  }
  const imageById = new Map(images.map((i) => [Number(i.id), i]));
  const imgsByCand = new Map<number, Row[]>();
  for (const l of candImages) {
    const k = Number(l.candidate_id);
    imgsByCand.set(k, [...(imgsByCand.get(k) ?? []), l]);
  }

  const toPage = (row: Row, role: "primary" | "support"): LoadedPage => ({
    pageId: String(row.id),
    url: String(row.source_url),
    title: (row.source_title as string | null) ?? null,
    role,
    facts: strings(row.facts),
    quotes: strings(row.quotes),
    impacts: impactsFromCauseSignal(row.cause_signal),
    markdown: (row.scraped_markdown as string | null) ?? null,
    publishedDate: day(row.published_date),
  });

  /** The harness loadStory page rule: linked pages, else the source page. */
  const storyPagesOf = (c: Row): { pages: LoadedPage[]; rows: Row[] } => {
    const ls = linksByCand.get(Number(c.id)) ?? [];
    let rows = ls.map((l) => pageById.get(Number(l.page_extract_id))).filter((x): x is Row => !!x);
    let pages = ls
      .map((l) => {
        const row = pageById.get(Number(l.page_extract_id));
        return row ? toPage(row, l.role === "primary" ? "primary" : "support") : null;
      })
      .filter((x): x is LoadedPage => !!x);
    if (!pages.length && c.source_page_extract_id) {
      const row = pageById.get(Number(c.source_page_extract_id));
      if (row) {
        pages = [toPage(row, "primary")];
        rows = [row];
      }
    }
    return { pages, rows };
  };

  // longtale-core's own ledger, for data/expected-counts.json.
  const coreLedgerPath = path.join(CORE, "apps/api/src/api/modules/story-writer/ledger/fact-ledger.ts");
  const core = (await import(pathToFileURL(coreLedgerPath).href)) as { buildFactLedger: typeof buildFactLedger };

  console.log("deriving columns…");
  const storyRows: Row[] = [];
  const mismatches: string[] = [];
  let n = 0;
  for (const c of candidates) {
    const job = jobById.get(Number(c.job_id));
    const org = job?.organization_id ? orgById.get(Number(job.organization_id)) : undefined;
    const sponsor = (org?.name as string | undefined) ?? (job?.org_name as string | undefined) ?? "";
    const names = sponsorNames[String(job?.domain ?? "")] ?? { aliases: [], programs: [] };
    const runDate = day(job?.created_at) ?? "2026-10-29";
    const { pages, rows } = storyPagesOf(c);
    const input = ledgerInputFor(sponsor, names.aliases, names.programs, runDate, pages);
    const ledger = buildFactLedger(input);
    const coreLedger = core.buildFactLedger(input);
    const facts = ledger.claims.filter((x) => x.kind === "fact").length;
    const impactsN = ledger.claims.filter((x) => x.kind === "impact").length;
    const quotes = ledger.quotes.length;
    if (
      coreLedger.quotes.length !== quotes ||
      coreLedger.claims.filter((x) => x.kind === "fact").length !== facts ||
      coreLedger.claims.filter((x) => x.kind === "impact").length !== impactsN
    )
      mismatches.push(String(c.id));
    const dates = pages.map((p) => p.publishedDate).filter((x): x is string => !!x).sort();
    const usable = (imgsByCand.get(Number(c.id)) ?? []).filter((l) => imageById.get(Number(l.image_id))?.usable === true).length;
    const idea = ideaByCand.get(Number(c.id));
    const market = (job?.market_name as string | null) ?? null;
    storyRows.push({
      id: Number(c.id),
      job_id: Number(c.job_id),
      rank: c.rank,
      winner: c.winner_flag === true,
      weighted_score: c.weighted_score,
      total: c.total,
      tier_impact: c.tier_impact,
      tier_recency: c.tier_recency,
      tier_reach: c.tier_reach,
      tier_evidence: c.tier_evidence,
      tier_attribution: c.tier_attribution,
      tier_market: c.tier_market,
      tier_image: c.tier_image,
      tiebreak_reasoning: c.tiebreak_reasoning,
      deal_grade: c.deal_grade,
      confidence: c.confidence,
      score_components: c.score_components,
      story_headline: c.story_headline,
      story_angle: c.story_angle,
      description: c.description,
      beneficiary: c.beneficiary,
      evidence_quote: c.evidence_quote,
      impact_type_primary: c.impact_type_primary,
      impact_value_raw: c.impact_value_raw,
      impact_value_unit: c.impact_value_unit,
      signal_type: c.signal_type,
      source_page_extract_id: num(c.source_page_extract_id),
      idea_title: idea?.title ?? null,
      idea_description: idea?.description ?? null,
      raw: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v])),
      domain: job?.domain ?? null,
      sponsor_name: sponsor,
      publisher_name: market ? (mastheads[market] ?? market) : null,
      market_name: market,
      run_date: job?.created_at ?? null,
      page_count: pages.length,
      fact_count: facts,
      quote_count: quotes,
      impact_count: impactsN,
      usable_image_count: usable,
      newest_page_date: dates.at(-1) ?? null,
      oldest_page_date: dates[0] ?? null,
      extractor_versions: [...new Set(rows.map((r) => r.extractor_version).filter(Boolean))].sort().join(", ") || null,
      has_angle: !!(c.story_angle as string | null)?.trim(),
      runnable_production: !!(c.description as string | null)?.trim() && !!sponsor,
      runnable_v3: pages.length > 0,
    });
    if (++n % 2000 === 0) console.log(`  ${n}/${candidates.length}`);
  }
  if (mismatches.length) throw new Error(`the ported ledger differs from longtale-core for ${mismatches.length} stories: ${mismatches.slice(0, 10).join(", ")}`);

  // ---------------------------------------------------------------- expected counts
  const dist = (key: string) => {
    const m: Record<string, number> = {};
    for (const r of storyRows) {
      const v = r[key];
      const k = v === null || v === undefined ? "null" : String(v);
      m[k] = (m[k] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(m).sort((a, b) => (isNaN(Number(a[0])) || isNaN(Number(b[0])) ? a[0].localeCompare(b[0]) : Number(a[0]) - Number(b[0]))));
  };
  const expected = {
    _note: "Computed by scripts/import-snapshot.ts from longtale_dv2 with longtale-core's own buildFactLedger (136fa4ac). AC-01 and AC-02 compare the app with this file.",
    total: storyRows.length,
    winners: storyRows.filter((r) => r.winner).length,
    with_story_fields: storyRows.filter((r) => r.story_headline !== null).length,
    jobs: jobIds.length,
    sponsor_domains: new Set(storyRows.map((r) => r.domain)).size,
    runnable_production: storyRows.filter((r) => r.runnable_production).length,
    runnable_v3: storyRows.filter((r) => r.runnable_v3).length,
    winners_runnable_v3: storyRows.filter((r) => r.winner && r.runnable_v3).length,
    has_angle: storyRows.filter((r) => r.has_angle).length,
    rank_3_or_5_and_quote_count_lte_1: storyRows.filter((r) => (r.rank === 3 || r.rank === 5) && Number(r.quote_count) <= 1).length,
    winners_quote_count_lte_1: storyRows.filter((r) => r.winner && Number(r.quote_count) <= 1).length,
    winners_runnable_v3_quote_count_lte_1: storyRows.filter((r) => r.winner && r.runnable_v3 && Number(r.quote_count) <= 1).length,
    distributions: Object.fromEntries(
      ["rank", "page_count", "fact_count", "quote_count", "impact_count", "usable_image_count", "has_angle", "runnable_production", "runnable_v3", "winner", "publisher_name", "deal_grade", "confidence"].map((k) => [k, dist(k)]),
    ),
  };
  fs.writeFileSync("data/expected-counts.json", JSON.stringify(expected, null, 2) + "\n");
  console.log("wrote data/expected-counts.json");

  // ---------------------------------------------------------------- write
  const sql = postgres(TARGET as string, { prepare: false, max: 4 });
  const insert = async (table: string, rows: Row[], chunk = 500) => {
    for (let i = 0; i < rows.length; i += chunk) {
      const part = rows.slice(i, i + chunk);
      await sql`insert into ${sql(table)} ${sql(part as Record<string, postgres.ParameterOrJSON<never>>[])}`;
    }
    console.log(`  ${table}: ${rows.length}`);
  };
  console.log("writing the snapshot…");
  await sql`truncate jobs, organizations, stories, pages, story_pages, images, story_images`;
  const json = (v: unknown) => (v === null || v === undefined ? null : sql.json(v as never));
  await insert(
    "jobs",
    jobs.map((j) => ({
      id: Number(j.id),
      domain: j.domain,
      url: j.url,
      organization_id: num(j.organization_id),
      sponsor_name: (orgById.get(Number(j.organization_id))?.name as string | undefined) ?? j.org_name ?? null,
      market_id: num(j.market_id),
      market_name: j.market_name,
      publisher_name: j.market_name ? (mastheads[String(j.market_name)] ?? j.market_name) : null,
      run_date: j.created_at,
      status: j.status,
    })),
  );
  await insert(
    "organizations",
    orgs.map((o) => {
      const b = brandByOrg.get(Number(o.id));
      return {
        id: Number(o.id),
        name: o.name,
        description: o.description,
        org_type: o.org_type,
        industry: o.industry,
        business_type: o.business_type,
        website: o.website,
        city: o.city,
        state: o.state,
        country: o.country,
        business_address: o.business_address,
        brand: b ? json(Object.fromEntries(Object.entries(b).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v]))) : null,
      };
    }),
  );
  await insert(
    "stories",
    storyRows.map((r) => ({ ...r, score_components: json(r.score_components), raw: json(r.raw) })),
  );
  await insert(
    "pages",
    pagesRows.map((p) => ({
      id: Number(p.id),
      job_id: Number(p.job_id),
      source_url: p.source_url,
      title: p.source_title,
      page_type: p.page_type,
      published_date: day(p.published_date),
      text_published_date: day(p.text_published_date),
      extractor_version: p.extractor_version,
      summary: p.summary,
      facts: json(p.facts),
      quotes: json(p.quotes),
      cause_signal: json(p.cause_signal),
      scraped_markdown: p.scraped_markdown,
      deleted: p.deleted === true,
    })),
    200,
  );
  await insert(
    "story_pages",
    links.map((l) => ({ link_id: Number(l.id), candidate_id: Number(l.candidate_id), page_extract_id: Number(l.page_extract_id), role: l.role })),
  );
  await insert(
    "images",
    images.map((i) => ({
      id: Number(i.id),
      job_id: num(i.job_id),
      page_extract_id: num(i.page_extract_id),
      url: i.image_url,
      usable: i.usable,
      confidence: i.confidence,
      classification: json(i.classification),
      classifier_version: i.classifier_version,
    })),
  );
  await insert(
    "story_images",
    candImages.map((l) => ({ link_id: Number(l.id), candidate_id: Number(l.candidate_id), image_id: Number(l.image_id), rank: l.rank })),
  );
  const [{ count }] = await sql<{ count: string }[]>`select count(*) from stories`;
  console.log(`done: ${count} stories in the app database`);
  await sql.end();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
