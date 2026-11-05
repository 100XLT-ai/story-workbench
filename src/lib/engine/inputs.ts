import type { LoadedPage } from "../writer/harness";
import type { CrawlRow } from "../ad/signals";

/** The fixed inputs of one story. The context starts with these roots. */
export interface StoryInputs {
  story: {
    id: string;
    jobId: number;
    rank: number | null;
    winner: boolean;
    description: string | null;
    beneficiary: string | null;
    evidenceQuote: string | null;
    impactTypePrimary: string | null;
    impactValueRaw: number | null;
    impactValueUnit: string | null;
    storyHeadline: string | null;
    storyAngle: string | null;
    attribution: string | null;
    /** discovery_ranked_ideas.title: production's Story.title. */
    ideaTitle: string | null;
    /** discovery_ranked_ideas.description: production's Story.summary. */
    ideaDescription: string | null;
  };
  org: {
    name: string;
    description: string | null;
    orgType: string | null;
    industry: string | null;
    businessType: string | null;
    website: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    businessAddress: string | null;
  };
  brand: {
    facebookHandle: string | null;
    facebookUrl: string | null;
    brandPersonalityTraits: string[];
    toneOfVoice: string | null;
    brandVoice: string | null;
    tagline: string | null;
    missionStatement: string | null;
    industryTags: string[];
    primaryColor: string | null;
  } | null;
  /** The story's own pages (candidate pages, or its source page). */
  pages: LoadedPage[];
  /** The job's other pages: the offline re-crawl source. */
  other_pages: LoadedPage[];
  /** The job's first five page extracts (by id): the ad copy's crawl facts. */
  crawl_rows: CrawlRow[];
  settings: {
    publisher: string;
    sponsor: string;
    aliases: string[];
    programs: string[];
    generation_date: string;
    target_words: number;
    min_words: number;
    max_words: number;
    facebook_char_limit: number;
  };
}

export const INPUT_ROOTS = ["story", "org", "brand", "pages", "other_pages", "crawl_rows", "settings"] as const;

export const INPUT_DESCRIPTIONS: Record<(typeof INPUT_ROOTS)[number], string> = {
  story: "The ranked story: the candidate fields, the angle and the ranked idea title and summary.",
  org: "The sponsor organization.",
  brand: "The sponsor's brand profile (handles, voice), or null.",
  pages: "The story's source pages with facts, quotes, impacts and text.",
  other_pages: "The job's other pages (used by the thin-story re-crawl).",
  crawl_rows: "The job's first five pages (read by the ad copy).",
  settings: "Publisher, sponsor names, generation date and word targets for this run.",
};

export interface RunOverrides {
  generation_date?: string;
  publisher?: string;
  sponsor?: string;
  aliases?: string[];
  programs?: string[];
}
