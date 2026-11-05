import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { impactsFromCauseSignal, type LoadedPage } from "../writer/harness";
import type { RunOverrides, StoryInputs } from "../engine/inputs";
import { MAX_PAGE_EXTRACT_ROWS } from "../ad/signals";
import { SEED_SETTINGS } from "../seeds/seeds";
import sponsorNames from "../../../data/sponsor-names.json";

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const s = (v: unknown): string | null => (typeof v === "string" ? v : null);

type PageRow = typeof schema.pages.$inferSelect;

function toPage(row: PageRow, role: "primary" | "support"): LoadedPage {
  return {
    pageId: String(row.id),
    url: row.sourceUrl,
    title: row.title,
    role,
    facts: strings(row.facts),
    quotes: strings(row.quotes),
    impacts: impactsFromCauseSignal(row.causeSignal),
    markdown: row.scrapedMarkdown,
    publishedDate: row.publishedDate,
  };
}

export class NotFound extends Error {}

/**
 * Builds the fixed inputs of one story from the snapshot (§2): the harness
 * loadStory rules (linked pages, else the source page; the job's other
 * non-deleted pages) plus the sponsor settings (§2.5). Version settings and
 * run overrides are applied on top.
 */
export async function loadStoryInputs(
  storyId: number,
  versionSettings: Record<string, unknown> = {},
  overrides: RunOverrides = {},
): Promise<StoryInputs> {
  const d = db();
  const [st] = await d.select().from(schema.stories).where(eq(schema.stories.id, storyId));
  if (!st) throw new NotFound(`story ${storyId} is not in the snapshot`);
  const [job] = await d.select().from(schema.jobs).where(eq(schema.jobs.id, st.jobId));
  const [org] = job?.organizationId
    ? await d.select().from(schema.organizations).where(eq(schema.organizations.id, job.organizationId))
    : [];
  const links = await d
    .select()
    .from(schema.storyPages)
    .where(eq(schema.storyPages.candidateId, storyId))
    .orderBy(asc(schema.storyPages.linkId));
  const jobPages = await d.select().from(schema.pages).where(eq(schema.pages.jobId, st.jobId)).orderBy(asc(schema.pages.id));
  const byId = new Map(jobPages.map((p) => [p.id, p]));
  let pages: LoadedPage[] = [];
  if (links.length) {
    const missing = links.filter((l) => !byId.has(l.pageExtractId)).map((l) => l.pageExtractId);
    if (missing.length) {
      for (const p of await d.select().from(schema.pages).where(inArray(schema.pages.id, missing))) byId.set(p.id, p);
    }
    pages = links
      .map((l) => {
        const row = byId.get(l.pageExtractId);
        return row ? toPage(row, l.role === "primary" ? "primary" : "support") : null;
      })
      .filter((x): x is LoadedPage => !!x);
  }
  if (!pages.length && st.sourcePageExtractId) {
    const row = byId.get(st.sourcePageExtractId) ?? (await d.select().from(schema.pages).where(eq(schema.pages.id, st.sourcePageExtractId)))[0];
    if (row) pages = [toPage(row, "primary")];
  }
  const used = new Set(pages.map((p) => p.pageId));
  const live = jobPages.filter((p) => !p.deleted);
  const brand = (org?.brand ?? null) as Record<string, unknown> | null;
  const names = (sponsorNames as Record<string, { aliases: string[]; programs: string[] } | string>)[st.domain ?? ""];
  const aliasCfg = typeof names === "object" ? names : { aliases: [], programs: [] };
  const raw = st.raw as Record<string, unknown>;
  const num = (k: string, d: number) => (typeof versionSettings[k] === "number" ? (versionSettings[k] as number) : d);

  return {
    story: {
      id: String(st.id),
      jobId: st.jobId,
      rank: st.rank,
      winner: st.winner,
      description: st.description,
      beneficiary: st.beneficiary,
      evidenceQuote: st.evidenceQuote,
      impactTypePrimary: st.impactTypePrimary,
      impactValueRaw: st.impactValueRaw,
      impactValueUnit: st.impactValueUnit,
      storyHeadline: st.storyHeadline,
      storyAngle: st.storyAngle,
      attribution: s(raw.attribution),
      ideaTitle: st.ideaTitle,
      ideaDescription: st.ideaDescription,
    },
    org: {
      name: org?.name ?? st.sponsorName ?? "",
      description: org?.description ?? null,
      orgType: org?.orgType ?? null,
      industry: org?.industry ?? null,
      businessType: org?.businessType ?? null,
      website: org?.website ?? null,
      city: org?.city ?? null,
      state: org?.state ?? null,
      country: org?.country ?? null,
      businessAddress: org?.businessAddress ?? null,
    },
    brand: brand
      ? {
          facebookHandle: s(brand.facebook_handle),
          facebookUrl: s(brand.facebook_url),
          brandPersonalityTraits: strings(brand.brand_personality_traits),
          toneOfVoice: s(brand.tone_of_voice),
          brandVoice: s(brand.brand_voice),
          tagline: s(brand.tagline),
          missionStatement: s(brand.mission_statement),
          industryTags: strings(brand.industry_tags),
          primaryColor: s(brand.primary_color),
        }
      : null,
    pages,
    other_pages: live.filter((p) => !used.has(String(p.id))).map((p) => toPage(p, "support")),
    crawl_rows: live.slice(0, MAX_PAGE_EXTRACT_ROWS).map((p) => ({ facts: p.facts, quotes: p.quotes, summary: p.summary })),
    settings: {
      publisher: overrides.publisher ?? st.publisherName ?? "the local newspaper",
      sponsor: overrides.sponsor ?? org?.name ?? st.sponsorName ?? "the sponsor",
      aliases: overrides.aliases ?? aliasCfg.aliases,
      programs: overrides.programs ?? aliasCfg.programs,
      generation_date: overrides.generation_date ?? (st.runDate ?? job?.runDate ?? "2026-10-29").slice(0, 10),
      target_words: num("target_words", SEED_SETTINGS.target_words),
      min_words: num("min_words", SEED_SETTINGS.min_words),
      max_words: num("max_words", SEED_SETTINGS.max_words),
      facebook_char_limit: num("facebook_char_limit", SEED_SETTINGS.facebook_char_limit),
    },
  };
}
