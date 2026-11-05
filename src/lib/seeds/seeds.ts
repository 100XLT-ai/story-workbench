// The three seed versions (§3.2, §10b). Each reproduces today's code byte for
// byte; the fidelity test proves it against longtale-core's own builders.
// Source: longtale-core branch claude/story-v3-writer-try, commit 136fa4ac.
import { ANGLE_TO_INPUTS_TEMPLATE } from "../ad/angle-to-inputs";
import {
  DEFAULT_BANNED_BODY_OPENERS,
  DEFAULT_BANNED_PASSIVE_VERBS,
  DEFAULT_RULES,
  DEFAULT_SUBJECT_HINT_MAX,
  DEFAULT_TONE_PREAMBLE,
} from "../ad/copy-generation-defaults";
import type { CodeStep, PromptStep, Step, VersionDefinition } from "../engine/types";
import { SOCIAL_PLATFORMS, type PlatformType } from "../social/social";
import {
  ARTICLE_TITLE_INSTRUCTION,
  ARTICLE_TITLE_SYSTEM,
  SHORT_TITLE_INSTRUCTION,
  SHORT_TITLE_SYSTEM,
  selectionSystemTemplate,
  statisticsTemplate,
} from "../writer/harness";
import { LABELLER_SYSTEM } from "../writer/writer/claim-labeller";
import { writerSystemTemplate, type WriterMode } from "../writer/writer/writer-prompt";

export interface SeedPrompts {
  /** src/common/prompts/long-article-generation-prompt.md */
  article: string;
  /** src/common/prompts/base/general-context.md */
  base: string;
  /** src/common/prompts/platforms/<platform>.md */
  platforms: Record<PlatformType, string>;
  /** src/common/prompts/style/ap-style.md */
  apStyle: string;
  /** src/common/prompts/output-schema.json, parsed */
  outputSchema: unknown;
}

/** Today's models (§3.2, §10b). */
export const MODELS = {
  writer: "google/gemini-3-flash-preview", // GENERATION_MODELS.narrative
  labeller: "google/gemini-2.5-flash", // claimLabellerModel()
  statistics: "google/gemini-3-flash-preview", // OPENROUTER_DEFAULT_MODEL (.env.example)
  content: "google/gemini-3.5-flash", // GENERATION_MODELS.title / organic / displayCopy
} as const;

export const SEED_SETTINGS = {
  target_words: 425,
  min_words: 325,
  max_words: 600,
  facebook_char_limit: 400,
};

const code = (s: Omit<CodeStep, "kind">): CodeStep => ({ kind: "code", ...s });
const prompt = (s: Omit<PromptStep, "kind">): PromptStep => ({ kind: "prompt", ...s });

/** Production's article title fit (story.service.ts enforceArticleTitleLimit), as three steps. */
function titleFitSteps(part: Step["part"]): Step[] {
  return [
    code({
      id: "title_check",
      name: "Measure the headline",
      purpose: "Measures the article headline without markdown marks; production shortens it when it is over 45 characters.",
      part,
      fn: "title_check",
      params: { max: 45 },
      inputs: ["article_markdown"],
      outputs: ["title_check"],
    }),
    prompt({
      id: "headline_shorten",
      name: "Shorten the headline",
      purpose: "Asks a model to rewrite a long headline in at most 45 characters (production prompt generation.articleTitle).",
      part,
      inputs: ["title_check"],
      outputs: ["headline_shorten"],
      when: [{ field: "title_check.over_limit", op: "eq", value: true }],
      system: ARTICLE_TITLE_SYSTEM,
      user: `${ARTICLE_TITLE_INSTRUCTION}"{{title_check.title}}"`,
      model: MODELS.content,
      temperature: 0.3,
      maxTokens: 1536,
      reasoning: "minimal",
      format: "text",
    }),
    code({
      id: "fit_title",
      name: "Final article",
      purpose: "Puts the short headline into the article (or cuts at a word boundary) and makes the final title, subtitle and content.",
      part,
      fn: "fit_title",
      inputs: ["article_markdown", "article_parts", "title_check", "headline_shorten"],
      outputs: ["article"],
    }),
  ];
}

function socialSteps(p: SeedPrompts, withPayload: boolean): Step[] {
  const steps: Step[] = [];
  if (withPayload) {
    steps.push(
      code({
        id: "payload",
        name: "Production story data",
        purpose: "Builds the 13 production fields (getDataForLLM) that the social prompt reads: brand name and overview.",
        part: "social",
        fn: "production_payload",
        inputs: ["story", "org"],
        outputs: ["payload"],
      }),
    );
  }
  steps.push(
    code({
      id: "short_title_check",
      name: "Check the story title",
      purpose: "Production makes a short title (at most 35 characters) from the ranked idea title when the story is created; this checks if it must.",
      part: "social",
      fn: "short_title_check",
      inputs: ["story"],
      outputs: ["short_title_check"],
    }),
    prompt({
      id: "short_title",
      name: "Short story title",
      purpose: "Asks a model for the short story title (production prompt generation.title). Social posts use it when the article title is long.",
      part: "social",
      inputs: ["short_title_check"],
      outputs: ["short_title"],
      when: [{ field: "short_title_check.needed", op: "eq", value: true }],
      system: SHORT_TITLE_SYSTEM,
      user: `${SHORT_TITLE_INSTRUCTION}"{{short_title_check.title}}"`,
      model: MODELS.content,
      temperature: 0.3,
      maxTokens: 1536,
      reasoning: "minimal",
      format: "text",
    }),
    code({
      id: "social_data",
      name: "Social post data",
      purpose: "Collects what the social templates read: this run's article title and text, the brand name, the overview and the Facebook handle.",
      part: "social",
      fn: "social_data",
      inputs: ["payload", "article", "story", "brand", "settings", "short_title"],
      outputs: ["social_data"],
    }),
  );
  const label: Record<PlatformType, string> = { facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", x: "X" };
  for (const platform of SOCIAL_PLATFORMS) {
    const L = label[platform];
    steps.push(
      code({
        id: `social_${platform}_prompt`,
        name: `${L} prompt`,
        purpose: `Renders production's ${L} post prompt from the templates in the parameters and the social data.`,
        part: "social",
        fn: "social_prompt",
        params: {
          platform,
          base: p.base,
          platform_template: p.platforms[platform],
          ap_style: platform === "facebook" ? p.apStyle : null,
          output_schema: p.outputSchema,
        },
        inputs: ["social_data"],
        outputs: [`social_${platform}_prompt`],
      }),
      prompt({
        id: `social_${platform}_write`,
        name: `${L} post`,
        purpose: `Writes the ${L} post (production organic social call: one user message, JSON array reply).`,
        part: "social",
        inputs: [`social_${platform}_prompt`],
        outputs: [`social_${platform}_raw`],
        system: null,
        user: `{{social_${platform}_prompt}}`,
        model: MODELS.content,
        temperature: 0.7,
        maxTokens: 6144,
        reasoning: "low",
        format: "text",
      }),
    );
    if (platform === "facebook") {
      steps.push(
        code({
          id: "social_facebook_parse",
          name: "Facebook rules",
          purpose: "Parses the post, strips every emoji, removes hashtags and counts the characters against the limit (400).",
          part: "social",
          fn: "social_parse",
          params: { platform },
          inputs: ["social_facebook_raw", "social_facebook_prompt", "settings"],
          outputs: ["social_facebook_first"],
        }),
        prompt({
          id: "social_facebook_retry",
          name: "Facebook length retry",
          purpose: "When the post is too long, production asks once more for a shorter post.",
          part: "social",
          inputs: ["social_facebook_first"],
          outputs: ["social_facebook_retry_raw"],
          when: [{ field: "social_facebook_first.over_limit", op: "eq", value: true }],
          system: null,
          user: "{{social_facebook_first.retry_prompt}}",
          model: MODELS.content,
          temperature: 0.7,
          maxTokens: 6144,
          reasoning: "low",
          format: "text",
        }),
        code({
          id: "social_facebook_final",
          name: "Facebook final post",
          purpose: "Keeps the retry post only when it is shorter; else keeps the first post.",
          part: "social",
          fn: "facebook_final",
          inputs: ["social_facebook_first", "social_facebook_retry_raw"],
          outputs: ["social_facebook"],
        }),
      );
    } else {
      steps.push(
        code({
          id: `social_${platform}_parse`,
          name: `${L} final post`,
          purpose: `Parses the ${L} reply (a JSON array) and keeps the ${L} post.`,
          part: "social",
          fn: "social_parse",
          params: { platform },
          inputs: [`social_${platform}_raw`],
          outputs: [`social_${platform}`],
        }),
      );
    }
  }
  return steps;
}

function adSteps(): Step[] {
  return [
    code({
      id: "ad_input",
      name: "Ad copy inputs",
      purpose: "Collects what the display ad copy reads: the vertical, the business fields, the brand voice, the crawl facts and the story summary as the angle.",
      part: "ad",
      fn: "ad_input",
      params: { density: "standard" },
      inputs: ["org", "brand", "crawl_rows", "story"],
      outputs: ["ad_input"],
    }),
    code({
      id: "ad_prompt",
      name: "Ad copy prompt",
      purpose: "Renders production's ad copy prompt (appendix K template) with the tone, the copy rules and the banned word lists.",
      part: "ad",
      fn: "ad_prompt",
      params: {
        template: ANGLE_TO_INPUTS_TEMPLATE,
        tone_preamble: DEFAULT_TONE_PREAMBLE,
        rules: DEFAULT_RULES,
        banned_body_openers: DEFAULT_BANNED_BODY_OPENERS,
        banned_passive_verbs: DEFAULT_BANNED_PASSIVE_VERBS,
        subject_hint_max: DEFAULT_SUBJECT_HINT_MAX,
      },
      inputs: ["ad_input"],
      outputs: ["ad_prompt"],
    }),
    prompt({
      id: "ad_copy",
      name: "Ad copy",
      purpose: "Writes the display ad headline, subheadline (body) and CTA as JSON (production displayCopy call).",
      part: "ad",
      inputs: ["ad_prompt"],
      outputs: ["ad_raw"],
      system: null,
      user: "{{ad_prompt}}",
      model: MODELS.content,
      temperature: 0.7,
      maxTokens: 2048,
      reasoning: "minimal",
      format: "json_raw",
    }),
    code({
      id: "ad_parse",
      name: "Ad copy check",
      purpose: "Checks the ad JSON: no URL or HTML, spaces collapsed, each field capped (headline 80, body 220, CTA 30).",
      part: "ad",
      fn: "ad_parse",
      inputs: ["ad_raw", "ad_input"],
      outputs: ["ad"],
    }),
  ];
}

export function productionSeed(p: SeedPrompts): VersionDefinition {
  const steps: Step[] = [
    code({
      id: "statistics_input",
      name: "Statistics inputs",
      purpose: "Prepares the background-statistics call: the story headline is the event type; location and mission are empty (harness arm A).",
      part: "article",
      fn: "statistics_input",
      inputs: ["story"],
      outputs: ["statistics_input"],
    }),
    prompt({
      id: "statistics",
      name: "Background statistics",
      purpose: "When the story has no impact value, asks a model for 1-2 background statistics (production generateStatistics).",
      part: "article",
      inputs: ["statistics_input"],
      outputs: ["statistics_raw"],
      when: [{ field: "story.impactValueRaw", op: "is_null" }],
      system: null,
      user: statisticsTemplate(),
      model: MODELS.statistics,
      temperature: 0.3,
      maxTokens: 2000,
      reasoning: null,
      format: "json_raw",
    }),
    code({
      id: "parse_statistics",
      name: "Read the statistics",
      purpose: "Reads the statistics reply as production does; bad JSON gives an empty list.",
      part: "article",
      fn: "parse_statistics",
      inputs: ["statistics_raw"],
      outputs: ["statistics"],
    }),
    code({
      id: "payload",
      name: "Production payload",
      purpose: "Builds the 13 production fields from the candidate: brand, partner, initiative, quote and statistics (harness armAPayload).",
      part: "article",
      fn: "production_payload",
      inputs: ["story", "org", "statistics"],
      outputs: ["payload"],
    }),
    prompt({
      id: "article",
      name: "Write the article",
      purpose: "Writes the article in one call with the production prompt (long-article-generation-prompt.md); the reply is JSON with markdown content.",
      part: "article",
      inputs: ["payload"],
      outputs: ["article_raw"],
      system: p.article,
      user: "Generate story:\n{{payload|json}}",
      model: MODELS.writer,
      temperature: 0.7,
      maxTokens: 16384,
      reasoning: "medium",
      format: "json",
    }),
    code({
      id: "split",
      name: "Split the article",
      purpose: "Splits the markdown into headline, subhead and body.",
      part: "article",
      fn: "split_markdown",
      inputs: ["article_raw"],
      outputs: ["article_markdown", "article_parts"],
    }),
    ...titleFitSteps("article"),
    ...socialSteps(p, false),
    ...adSteps(),
  ];
  return { steps, settings: { ...SEED_SETTINGS } };
}

function v3Steps(p: SeedPrompts, mode: WriterMode): Step[] {
  const writerSystem = writerSystemTemplate(mode)
    .replaceAll("{{publisher}}", "{{settings.publisher}}")
    .replaceAll("{{sponsor}}", "{{settings.sponsor}}")
    .replaceAll("{{targetWords}}", "{{settings.target_words}}")
    .replaceAll("{{minWords}}", "{{settings.min_words}}")
    .replaceAll("{{maxWords}}", "{{settings.max_words}}");
  const writerUser = [
    "SETTINGS\nPublisher: {{settings.publisher}}\nSponsor (approved short name): {{settings.sponsor}}\nSponsor's own program or foundation names: {{writer_input.programs}}",
    "STORY TYPE (set by code): {{writer_input.story_type_line}}. Status: {{writer_input.thin}}.",
    mode === "staged" ? "STORY (from the selection step):\n{{selection|json1}}" : null,
    `${mode === "staged" ? "FACTS (USE and RESERVE are named in the STORY)" : "FACTS"}:\n{{writer_input.facts}}`,
    "COMPANY (at most one clause in the piece):\n{{writer_input.company}}",
    "QUOTES (word for word, with speaker and role):\n{{writer_input.quotes}}",
    "RISKS:\n{{writer_input.risks}}",
  ]
    .filter((x): x is string => !!x)
    .join("\n\n");

  const steps: Step[] = [
    code({
      id: "ledger_input",
      name: "Ledger input",
      purpose: "Collects the story's pages with the sponsor names and the generation date.",
      part: "article",
      fn: "ledger_input",
      inputs: ["settings", "pages"],
      outputs: ["ledger_input"],
    }),
    code({
      id: "ledger",
      name: "Fact ledger",
      purpose: "Turns the pages into numbered facts and quotes, removes duplicates, finds figure conflicts and dates, and flags a thin story.",
      part: "article",
      fn: "build_ledger",
      inputs: ["ledger_input"],
      outputs: ["raw_ledger", "label_input"],
    }),
    prompt({
      id: "label",
      name: "Label the facts",
      purpose: "A cheap model labels each fact: company or cause, done or promised, who did it and how.",
      part: "article",
      inputs: ["label_input"],
      outputs: ["labels_raw"],
      system: LABELLER_SYSTEM,
      user: "{{label_input|json}}",
      model: MODELS.labeller,
      temperature: 0,
      maxTokens: 8192,
      reasoning: null,
      format: "json",
    }),
    code({
      id: "apply_labels",
      name: "Apply the labels",
      purpose: "Marks the company facts and checks again if the story is thin on cause facts.",
      part: "article",
      fn: "apply_labels",
      inputs: ["labels_raw", "raw_ledger", "ledger_input"],
      outputs: ["prepared"],
    }),
    code({
      id: "recrawl",
      name: "Thin-story re-crawl",
      purpose: "When the story is thin, adds up to 3 of the job's other pages that name the beneficiary and builds a new ledger.",
      part: "article",
      fn: "recrawl",
      params: { limit: 3 },
      when: [{ field: "prepared.ledger.thin.isThin", op: "eq", value: true }],
      inputs: ["story", "pages", "other_pages", "settings", "prepared"],
      outputs: ["recrawl"],
    }),
    prompt({
      id: "label_recrawl",
      name: "Label the re-crawled facts",
      purpose: "Labels the facts again when the re-crawl added pages.",
      part: "article",
      inputs: ["recrawl"],
      outputs: ["labels_recrawl_raw"],
      when: [{ field: "recrawl.count", op: "gt", value: 0 }],
      system: LABELLER_SYSTEM,
      user: "{{recrawl.label_input|json}}",
      model: MODELS.labeller,
      temperature: 0,
      maxTokens: 8192,
      reasoning: null,
      format: "json",
    }),
    code({
      id: "apply_recrawl_labels",
      name: "Apply the new labels",
      purpose: "Uses the re-crawled, labelled ledger from here on.",
      part: "article",
      fn: "apply_recrawl_labels",
      when: [{ field: "recrawl.count", op: "gt", value: 0 }],
      inputs: ["recrawl", "labels_recrawl_raw"],
      outputs: ["prepared"],
    }),
    code({
      id: "story_type",
      name: "Story type",
      purpose: "Code decides the story type: what it is about, when it happened, the sponsor's role and how the help works.",
      part: "article",
      fn: "story_type",
      inputs: ["prepared"],
      outputs: ["story_type"],
    }),
    code({
      id: "writer_input",
      name: "Writer input",
      purpose: "Writes the FACTS, COMPANY, QUOTES and RISKS blocks that the models read.",
      part: "article",
      fn: "writer_input",
      inputs: ["prepared", "story_type", "settings"],
      outputs: ["writer_input"],
    }),
    code({
      id: "modules",
      name: "Story-type modules",
      purpose: "Picks the writing rules for this story type (focus, time, mechanisms, sponsor role).",
      part: "article",
      fn: "modules",
      inputs: ["story_type"],
      outputs: ["modules"],
    }),
  ];
  if (mode === "staged") {
    steps.push(
      prompt({
        id: "select",
        name: "Choose the story",
        purpose: "An editor model chooses the angle, the walkaway, the facts and quotes to use, and the risks (Prompt 1).",
        part: "article",
        inputs: ["settings", "story_type", "writer_input"],
        outputs: ["selection"],
        system: selectionSystemTemplate()
          .replaceAll("{{publisher}}", "{{settings.publisher}}")
          .replaceAll("{{sponsor}}", "{{settings.sponsor}}")
          .replaceAll("{{focus}}", "{{story_type.focus}}")
          .replaceAll("{{time}}", "{{story_type.time}}")
          .replaceAll("{{role}}", "{{story_type.role}}"),
        user: [
          "GENERATION_DATE: {{writer_input.generation_date}}\nPUBLICATION_DATE: {{writer_input.publication_date}}\nStatus: {{writer_input.thin}}",
          "FACTS:\n{{writer_input.facts}}",
          "COMPANY:\n{{writer_input.company}}",
          "QUOTES:\n{{writer_input.quotes}}",
          "RISKS (from code):\n{{writer_input.risks}}",
        ].join("\n\n"),
        model: MODELS.writer,
        temperature: 0.3,
        maxTokens: 16384,
        reasoning: "high",
        format: "json",
      }),
    );
  }
  steps.push(
    prompt({
      id: "write",
      name: mode === "staged" ? "Write the article" : "Plan and write the article",
      purpose:
        mode === "staged"
          ? "The writer model writes two options (grounded and upbeat) from the editor's choices, with a claim ID on each fact (Prompt 2)."
          : "One writer call plans the story and writes two options (grounded and upbeat), with a claim ID on each fact.",
      part: "article",
      inputs: mode === "staged" ? ["settings", "modules", "writer_input", "selection"] : ["settings", "modules", "writer_input"],
      outputs: ["writer_raw"],
      system: writerSystem,
      user: writerUser,
      model: MODELS.writer,
      temperature: 0.7,
      maxTokens: 16384,
      reasoning: "medium",
      format: "json",
    }),
    code({
      id: "parse",
      name: "Read the writer reply",
      purpose: "Reads the plan and both options; the grounded option becomes the article, as in production.",
      part: "article",
      fn: "parse_writer",
      params: { option: "grounded" },
      inputs: ["writer_raw"],
      outputs: ["writer_output", "article_markdown", "article_parts"],
    }),
    code({
      id: "checks",
      name: "Code checks",
      purpose: "Code checks each option: length, figures, quotes, dates, sponsor naming and claim IDs.",
      part: "article",
      fn: "code_checks",
      inputs: ["writer_output", "prepared", "writer_input", "settings"],
      outputs: ["checks"],
    }),
    ...titleFitSteps("article"),
  );
  return [...steps, ...socialSteps(p, true), ...adSteps()];
}

export function stagedSeed(p: SeedPrompts): VersionDefinition {
  return { steps: v3Steps(p, "staged"), settings: { ...SEED_SETTINGS } };
}

export function oneCallSeed(p: SeedPrompts): VersionDefinition {
  return { steps: v3Steps(p, "one_call"), settings: { ...SEED_SETTINGS } };
}

export const SEED_FAMILIES = [
  {
    name: "Production writer",
    description:
      "Today's production article: the harness arm A (one large prompt, plus a statistics call) and the headline-shorten call from story.service.ts, then the social posts and the ad copy.",
    major: 1,
    build: productionSeed,
    note: "Seed: production writer as of longtale-core 136fa4ac (harness arm A + generation.articleTitle).",
  },
  {
    name: "Staged writer",
    description: "The v3 writer: fact ledger, labels, story type, a selection call (Prompt 1), then the writer (Prompt 2), then the social posts and the ad copy.",
    major: 3,
    build: stagedSeed,
    note: "Seed: staged v3 writer (arm C) as of longtale-core 136fa4ac.",
  },
  {
    name: "One-call writer",
    description: "The v3 writer without the selection call: the writer plans and writes in one call (arm B), then the social posts and the ad copy.",
    major: 3,
    build: oneCallSeed,
    note: "Seed: one-call v3 writer (arm B) as of longtale-core 136fa4ac.",
  },
] as const;
