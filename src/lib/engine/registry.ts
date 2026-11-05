// The code registry (§3.3). Each function is pure and deterministic: the same
// context and parameters give the same output. A new function needs a change
// to this file (P4).
import { runCodeChecks, type CodeCheckReport } from "../writer/checks/code-checks";
import { applyMaterialLabels, buildFactLedger } from "../writer/ledger/fact-ledger";
import type { FactLedger, LedgerInput } from "../writer/ledger/ledger.types";
import { parseLabels, type ClaimLabel } from "../writer/writer/claim-labeller";
import { classifyStory, type StoryType } from "../writer/writer/story-type";
import { buildWriterInput } from "../writer/writer/writer-input";
import { modulesFor } from "../writer/writer/writer-modules";
import { optionToMarkdown, parseWriterOutput, type WriterOutput } from "../writer/writer/writer-output";
import { wordCount } from "../writer/ledger/text-utils";
import {
  ARTICLE_TITLE_MAX_LEN,
  SHORT_STORY_TITLE_MAX_LEN,
  armAPayload,
  articleHeading,
  capTitle,
  cleanTitleReply,
  ledgerInputFor,
  parseStatistics,
  recrawlPages,
  replaceHeading,
  splitMarkdown,
  type LoadedPage,
} from "../writer/harness";
import {
  buildMultiPlatformPrompt,
  buildPromptData,
  facebookNameOf,
  facebookRetryPrompt,
  parseMultiPlatformResponse,
  plainLength,
  stripEmojis,
  type PlatformType,
  type SocialPost,
} from "../social/social";
import { brandVoiceBlock, composeBlocks, crawlFactsBlock, formatBasicBusinessBlock, resolveBasicBusinessFields } from "../ad/signals";
import { mapVertical } from "../ad/vertical-mapper";
import { parseAngleConverterResponse, type AngleToInputsRules } from "../ad/angle-to-inputs";
import { substituteTokens } from "../ad/substitute";
import { getPath } from "./template";
import type { Context } from "./types";
import type { StoryInputs } from "./inputs";

export interface CodeFn {
  name: string;
  description: string;
  inputs: string[];
  outputs: string[];
  /** JSON schema of the parameters. */
  params: Record<string, unknown>;
  run: (ctx: Context, params: Record<string, unknown>) => Record<string, unknown>;
}

const asInputs = (ctx: Context) => ctx as unknown as StoryInputs & Context;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

interface Prepared {
  ledger: FactLedger;
  labels: Record<string, ClaimLabel>;
}

const labelMap = (p: Prepared) => new Map(Object.entries(p.labels));

function prepared(ctx: Context): Prepared {
  const p = ctx.prepared as Prepared | undefined;
  if (!p) throw new Error("prepared (the labelled ledger) is missing");
  return p;
}

function labelInputOf(raw: FactLedger): Record<string, unknown> {
  // buildLabellerMessages user content, as an object: the template sends it with |json.
  return {
    sponsor: raw.sponsorName,
    sponsor_names: raw.sponsorAliases,
    claims: raw.claims.map((c) => ({ id: c.id, text: c.text, date: c.date })),
  };
}

function applyLabels(rawJson: unknown, raw: FactLedger, ledgerIn: LedgerInput): Prepared {
  const labels = parseLabels(rawJson, raw);
  const company = new Set([...labels.values()].filter((l) => l.material === "company").map((l) => l.id));
  const ledger = applyMaterialLabels(raw, company, ledgerIn.thinLimits);
  return { ledger, labels: Object.fromEntries(labels) };
}

const VALID_PLATFORMS = ["x", "facebook", "instagram", "linkedin", "youtube", "tiktok", "pinterest"];

/**
 * Picks the platform's post. Production keeps only posts whose platform it
 * recognises (organic-social.service.ts 971-977). When the model writes an
 * unknown platform (for example "x (twitter)", copied from the schema), the
 * post is still shown here, marked as dropped by production.
 */
function socialPick(posts: SocialPost[], platform: string): SocialPost & { dropped_by_production?: string } {
  const valid = posts.filter((p) => VALID_PLATFORMS.includes(p.platform));
  const post = valid.find((p) => p.platform === platform) ?? valid[0];
  if (post) return post;
  const any = posts[0];
  if (!any) throw new Error(`the reply holds no ${platform} post`);
  return { ...any, dropped_by_production: `The model wrote platform "${any.platform}". Production does not recognise it and would drop this post.` };
}

const fns: CodeFn[] = [
  // ---------------------------------------------------------------- production
  {
    name: "statistics_input",
    description: "The inputs of production's generateStatistics call: event_type is the story headline (or the description); location and mission are empty, as in the harness.",
    inputs: ["story"],
    outputs: ["statistics_input"],
    params: { type: "object", properties: {} },
    run: (ctx) => {
      const s = asInputs(ctx).story;
      return { statistics_input: { event_type: s.storyHeadline ?? s.description ?? "", location: "", mission_goals: "" } };
    },
  },
  {
    name: "parse_statistics",
    description: "Parses the statistics reply the way generateStatistics does (a JSON array, or data/statistics/results). Bad JSON gives []. Null when the step was skipped.",
    inputs: ["statistics_raw"],
    outputs: ["statistics"],
    params: { type: "object", properties: {} },
    run: (ctx) => ({ statistics: ctx.statistics_raw === null || ctx.statistics_raw === undefined ? null : parseStatistics(str(ctx.statistics_raw)) }),
  },
  {
    name: "production_payload",
    description: "The 13 production fields (getDataForLLM) from the candidate, the organization and the statistics: harness armAPayload.",
    inputs: ["story", "org", "statistics"],
    outputs: ["payload"],
    params: { type: "object", properties: {} },
    run: (ctx) => {
      const i = asInputs(ctx);
      const w = i.story;
      return {
        payload: armAPayload(
          { name: i.org.name, description: i.org.description },
          {
            id: w.id,
            description: w.description,
            beneficiary: w.beneficiary,
            evidenceQuote: w.evidenceQuote,
            impactTypePrimary: w.impactTypePrimary,
            impactValueRaw: w.impactValueRaw,
            impactValueUnit: w.impactValueUnit,
            storyHeadline: w.storyHeadline,
          },
          ctx.statistics ?? null,
        ),
      };
    },
  },
  {
    name: "split_markdown",
    description: "Reads the article JSON's `content` markdown and splits it into headline, subhead and body (harness splitMarkdown).",
    inputs: ["article_raw"],
    outputs: ["article_markdown", "article_parts"],
    params: { type: "object", properties: {} },
    run: (ctx) => {
      const raw = ctx.article_raw;
      const content =
        typeof raw === "object" && raw !== null && typeof (raw as { content?: unknown }).content === "string"
          ? (raw as { content: string }).content
          : "";
      const parts = splitMarkdown(content);
      return { article_markdown: content, article_parts: { subtitle: parts.subhead, content: parts.body, cta: null } };
    },
  },
  {
    name: "title_check",
    description: `Measures the # headline of the article markdown without markdown marks. Production shortens it when it is over ${ARTICLE_TITLE_MAX_LEN} characters.`,
    inputs: ["article_markdown"],
    outputs: ["title_check"],
    params: { type: "object", properties: { max: { type: "number", default: ARTICLE_TITLE_MAX_LEN } } },
    run: (ctx, params) => {
      const max = typeof params.max === "number" ? params.max : ARTICLE_TITLE_MAX_LEN;
      const h = articleHeading(str(ctx.article_markdown) ?? "");
      return {
        title_check: {
          heading_found: !!h,
          title: h?.title ?? "",
          characters: h?.title.length ?? 0,
          max,
          over_limit: !!h && h.title.length > max,
        },
      };
    },
  },
  {
    name: "fit_title",
    description: "Puts the shortened headline (or a word-boundary cut when the model gave nothing) into the markdown, as enforceArticleTitleLimit does. Writes the final article.",
    inputs: ["article_markdown", "article_parts", "title_check", "headline_shorten"],
    outputs: ["article"],
    params: { type: "object", properties: {} },
    run: (ctx) => {
      const markdown = str(ctx.article_markdown) ?? "";
      const check = ctx.title_check as { over_limit: boolean; title: string; max: number } | undefined;
      const parts = (ctx.article_parts ?? {}) as { subtitle?: string; content?: string; cta?: string | null };
      let finalMarkdown = markdown;
      let title = check?.title ?? articleHeading(markdown)?.title ?? "";
      let how = "the headline fits";
      if (check?.over_limit) {
        const shortened = cleanTitleReply(str(ctx.headline_shorten), check.max);
        const fitted = shortened ?? capTitle(check.title, check.max);
        how = shortened ? "the model shortened the headline" : "cut at a word boundary";
        finalMarkdown = replaceHeading(markdown, fitted);
        title = fitted;
      }
      const content = parts.content ?? "";
      return {
        article: {
          title,
          subtitle: parts.subtitle ?? "",
          content,
          cta: parts.cta ?? null,
          markdown: finalMarkdown,
          word_count: wordCount(content),
          title_note: how,
        },
      };
    },
  },
  // ---------------------------------------------------------------- staged / one-call
  {
    name: "ledger_input",
    description: "The fact-ledger input: sponsor, sponsor names (aliases and programs), generation date and the story's pages (harness ledgerInputFor).",
    inputs: ["settings", "pages"],
    outputs: ["ledger_input"],
    params: { type: "object", properties: {} },
    run: (ctx) => {
      const i = asInputs(ctx);
      return { ledger_input: ledgerInputFor(i.settings.sponsor, i.settings.aliases, i.settings.programs, i.settings.generation_date, i.pages) };
    },
  },
  {
    name: "build_ledger",
    description: "Builds the fact ledger: claims and quotes from the pages, with de-duplication, figure conflicts, dates and the thin flag (buildFactLedger).",
    inputs: ["ledger_input"],
    outputs: ["raw_ledger", "label_input"],
    params: { type: "object", properties: {} },
    run: (ctx) => {
      const raw = buildFactLedger(ctx.ledger_input as LedgerInput);
      return { raw_ledger: raw, label_input: labelInputOf(raw) };
    },
  },
  {
    name: "apply_labels",
    description: "Parses the labeller reply and marks the company facts; recomputes the thin flag on the cause facts (parseLabels, applyMaterialLabels).",
    inputs: ["labels_raw", "raw_ledger", "ledger_input"],
    outputs: ["prepared"],
    params: { type: "object", properties: {} },
    run: (ctx) => ({ prepared: applyLabels(ctx.labels_raw, ctx.raw_ledger as FactLedger, ctx.ledger_input as LedgerInput) }),
  },
  {
    name: "recrawl",
    description: "Thin-story re-crawl: adds up to 3 of the job's other pages that name the beneficiary, and builds a new ledger from all pages (harness recrawlPages, run.ts 369-377).",
    inputs: ["story", "pages", "other_pages", "settings"],
    outputs: ["recrawl"],
    params: { type: "object", properties: { limit: { type: "number", default: 3 } } },
    run: (ctx, params) => {
      const i = asInputs(ctx);
      const extra = recrawlPages(i.story.beneficiary, i.other_pages, typeof params.limit === "number" ? params.limit : 3);
      if (!extra.length) return { recrawl: { count: 0, urls: [] } };
      const pages: LoadedPage[] = [...i.pages, ...extra];
      const ledgerIn = ledgerInputFor(i.settings.sponsor, i.settings.aliases, i.settings.programs, i.settings.generation_date, pages);
      const raw = buildFactLedger(ledgerIn);
      return { recrawl: { count: extra.length, urls: extra.map((p) => p.url), ledger_input: ledgerIn, raw_ledger: raw, label_input: labelInputOf(raw) } };
    },
  },
  {
    name: "apply_recrawl_labels",
    description: "Parses the second labeller reply on the re-crawled ledger and replaces the prepared ledger.",
    inputs: ["recrawl", "labels_recrawl_raw"],
    outputs: ["prepared"],
    params: { type: "object", properties: {} },
    run: (ctx) => {
      const r = ctx.recrawl as { raw_ledger: FactLedger; ledger_input: LedgerInput };
      return { prepared: applyLabels(ctx.labels_recrawl_raw, r.raw_ledger, r.ledger_input) };
    },
  },
  {
    name: "story_type",
    description: "Sets the story type in code: focus, time, sponsor role and mechanisms (classifyStory).",
    inputs: ["prepared"],
    outputs: ["story_type"],
    params: { type: "object", properties: {} },
    run: (ctx) => {
      const p = prepared(ctx);
      return { story_type: classifyStory(p.ledger, labelMap(p)) };
    },
  },
  {
    name: "writer_input",
    description: "Turns the ledger and labels into the text blocks the writer reads: FACTS, COMPANY, QUOTES, RISKS and the status line (buildWriterInput).",
    inputs: ["prepared", "story_type", "settings"],
    outputs: ["writer_input"],
    params: { type: "object", properties: {} },
    run: (ctx) => {
      const p = prepared(ctx);
      const t = ctx.story_type as StoryType;
      const wi = buildWriterInput(p.ledger, labelMap(p), t);
      const s = asInputs(ctx).settings;
      return {
        writer_input: {
          facts: wi.facts,
          company: wi.company,
          quotes: wi.quotes,
          risks: wi.risks,
          thin: wi.thin,
          conflictClaimIds: [...wi.conflictClaimIds],
          companyClaimIds: [...wi.companyClaimIds],
          programs: s.programs.join(", ") || "(none)",
          story_type_line: `focus ${t.focus}, time ${t.time}, sponsor role ${t.role}, mechanisms ${t.mechanisms.join(", ") || "none"}${t.windowRisk ? ", window risk" : ""}`,
          generation_date: p.ledger.generationDate,
          publication_date: p.ledger.publicationDate,
        },
      };
    },
  },
  {
    name: "modules",
    description: "Picks the story-type modules text for the writer: focus, time, mechanism and role notes (modulesFor).",
    inputs: ["story_type"],
    outputs: ["modules"],
    params: { type: "object", properties: {} },
    run: (ctx) => {
      const t = ctx.story_type as StoryType;
      return { modules: modulesFor(t.focus, t.time, t.role, t.mechanisms) };
    },
  },
  {
    name: "parse_writer",
    description: "Parses the writer JSON: the plan and the grounded and upbeat options. The grounded option becomes the article (production writeArticle).",
    inputs: ["writer_raw"],
    outputs: ["writer_output", "article_markdown", "article_parts"],
    params: { type: "object", properties: { option: { type: "string", enum: ["grounded", "upbeat"], default: "grounded" } } },
    run: (ctx, params) => {
      const out = parseWriterOutput(ctx.writer_raw);
      const want = params.option === "upbeat" ? "upbeat" : "grounded";
      const chosen = out.options.find((o) => o.option === want) ?? out.options[0];
      return {
        writer_output: out,
        article_markdown: chosen ? optionToMarkdown(chosen) : "",
        article_parts: chosen ? { subtitle: chosen.subhead, content: chosen.body, cta: chosen.cta, claims: chosen.claims, option: chosen.option } : { subtitle: "", content: "", cta: null },
      };
    },
  },
  {
    name: "code_checks",
    description: "Runs the code checks on every option: length, figures, quotes, dates, sponsor naming and claim IDs (checkOutput).",
    inputs: ["writer_output", "prepared", "writer_input", "settings"],
    outputs: ["checks"],
    params: { type: "object", properties: {} },
    run: (ctx) => {
      const out = ctx.writer_output as WriterOutput;
      const p = prepared(ctx);
      const s = asInputs(ctx).settings;
      const wi = ctx.writer_input as { companyClaimIds: string[] };
      const checks: Record<string, CodeCheckReport> = {};
      for (const o of out.options) {
        checks[o.option] = runCodeChecks(
          { headline: o.headline, subhead: o.subhead, body: o.body, cta: o.cta, claims: o.claims },
          p.ledger,
          { sponsorNames: [s.sponsor, ...s.programs], minWords: s.min_words, maxWords: s.max_words, companyClaimIds: new Set(wi.companyClaimIds) },
        );
      }
      return { checks };
    },
  },
  // ---------------------------------------------------------------- social
  {
    name: "short_title_check",
    description: `Production makes a short story title (at most ${SHORT_STORY_TITLE_MAX_LEN} characters) from the ranked idea title when the story is created. This checks if that call is needed.`,
    inputs: ["story"],
    outputs: ["short_title_check"],
    params: { type: "object", properties: {} },
    run: (ctx) => {
      // Story.title = selectedIdea.title || "Untitled Story"; generateShortStoryTitle reads selectedIdea.title.
      const title = asInputs(ctx).story.ideaTitle?.trim() ?? "";
      return { short_title_check: { title, characters: title.length, max: SHORT_STORY_TITLE_MAX_LEN, needed: title.length > SHORT_STORY_TITLE_MAX_LEN } };
    },
  },
  {
    name: "social_data",
    description: "Builds the data the social templates read, as buildPromptData does: brand name, the article title and markdown, the overview, the Facebook handle and limit.",
    inputs: ["payload", "article", "story", "brand", "settings", "short_title"],
    outputs: ["social_data"],
    params: { type: "object", properties: {} },
    run: (ctx) => {
      const i = asInputs(ctx);
      const payload = (ctx.payload ?? {}) as Record<string, unknown>;
      const article = ctx.article as { title: string; markdown: string };
      return {
        social_data: buildPromptData({
          storyData: {
            brandName: str(payload.BrandName),
            initiativeDetails: str(payload.InitiativeDetails),
            keyThemesToEmphasize: str(payload.KeyThemesToEmphasize),
            callToActionLink: str(payload.CallToActionLink),
          },
          tiptapTitle: article.title || null,
          articleMarkdown: article.markdown || null,
          storyTitle: i.story.ideaTitle || "Untitled Story",
          shortStoryTitle: cleanTitleReply(str(ctx.short_title), SHORT_STORY_TITLE_MAX_LEN),
          facebook: { name: facebookNameOf(i.brand?.facebookHandle, i.brand?.facebookUrl), characterLimit: i.settings.facebook_char_limit },
        }),
      };
    },
  },
  {
    name: "social_prompt",
    description: "Renders production's social prompt for one platform: the base template, the platform rules (Facebook adds AP style), the output schema, filled from social_data (buildMultiPlatformPrompt).",
    inputs: ["social_data"],
    outputs: ["social_prompt"],
    params: {
      type: "object",
      required: ["platform", "base", "platform_template", "output_schema"],
      properties: {
        platform: { type: "string", enum: ["facebook", "instagram", "linkedin", "x"] },
        base: { type: "string", description: "base/general-context.md" },
        platform_template: { type: "string", description: "platforms/<platform>.md" },
        ap_style: { type: ["string", "null"], description: "style/ap-style.md (Facebook only)" },
        output_schema: { description: "output-schema.json" },
      },
    },
    run: (ctx, params) => {
      const platform = params.platform as PlatformType;
      const prompt = buildMultiPlatformPrompt([platform], ctx.social_data, {
        [platform]: {
          base: String(params.base ?? ""),
          platform: String(params.platform_template ?? ""),
          outputSchema: params.output_schema,
          apStyle: str(params.ap_style),
        },
      });
      return { [`social_${platform}_prompt`]: prompt };
    },
  },
  {
    name: "social_parse",
    description: "Parses the platform's JSON array reply (parseMultiPlatformResponse) and keeps that platform's post. Facebook: strips emojis, empties hashtags and checks the length.",
    inputs: ["social_raw"],
    outputs: ["social_post"],
    params: { type: "object", required: ["platform"], properties: { platform: { type: "string" } } },
    run: (ctx, params) => {
      const platform = String(params.platform);
      const raw = str(ctx[`social_${platform}_raw`]) ?? "";
      const post = socialPick(parseMultiPlatformResponse(raw), platform);
      if (platform !== "facebook")
        return { [`social_${platform}`]: { ...post, characters: plainLength(post.content), note: post.dropped_by_production ?? null } };
      const s = asInputs(ctx).settings;
      const content = stripEmojis(post.content);
      const count = plainLength(content);
      const limit = s.facebook_char_limit;
      return {
        social_facebook_first: {
          ...post,
          content,
          hashtags: [],
          characters: count,
          limit,
          over_limit: count > limit,
          retry_prompt: count > limit ? facebookRetryPrompt(str(ctx.social_facebook_prompt) ?? "", count, limit) : null,
        },
      };
    },
  },
  {
    name: "facebook_final",
    description: "Keeps the retry post only when it is shorter than the first one; a failed retry keeps the first post (applyFacebookTextRules).",
    inputs: ["social_facebook_first", "social_facebook_retry_raw"],
    outputs: ["social_facebook"],
    params: { type: "object", properties: {} },
    run: (ctx) => {
      const first = ctx.social_facebook_first as SocialPost & { characters: number; limit: number };
      let content = first.content;
      let note = first.characters > first.limit ? "the retry was not shorter; kept the first post" : "fits the limit";
      const retry = str(ctx.social_facebook_retry_raw);
      if (retry) {
        try {
          const second = parseMultiPlatformResponse(retry).find((p) => p.platform === "facebook");
          const secondContent = second ? stripEmojis(second.content) : null;
          if (secondContent && plainLength(secondContent) < first.characters) {
            content = secondContent;
            note = "kept the shorter retry post";
          }
        } catch {
          note = "the retry reply did not parse; kept the first post";
        }
      }
      return {
        social_facebook: { platform: "facebook", content, urls: first.urls, hashtags: [], characters: plainLength(content), limit: first.limit, note },
      };
    },
  },
  // ---------------------------------------------------------------- ad copy
  {
    name: "ad_input",
    description: "The display ad copy inputs, as AdDraftGenerationService and AdCopyGeneratorService build them: the vertical, the business fields, the blended signals (basic business, brand voice, crawl facts) and the angle (Story.summary, else Story.title).",
    inputs: ["org", "brand", "crawl_rows", "story"],
    outputs: ["ad_input"],
    params: { type: "object", properties: { density: { type: "string", enum: ["standard", "minimal"], default: "standard" } } },
    run: (ctx, params) => {
      const i = asInputs(ctx);
      const basic = resolveBasicBusinessFields(i.org);
      const personality = composeBlocks([
        formatBasicBusinessBlock(basic),
        brandVoiceBlock(i.brand ? { brandPersonalityTraits: i.brand.brandPersonalityTraits, toneOfVoice: i.brand.toneOfVoice, brandVoice: i.brand.brandVoice } : null),
        crawlFactsBlock(i.crawl_rows, {
          description: i.story.description,
          beneficiary: i.story.beneficiary,
          evidenceQuote: i.story.evidenceQuote,
          attribution: i.story.attribution,
        }),
      ]);
      return {
        ad_input: {
          content_type: "Cause_Marketing",
          vertical: mapVertical({ industry: i.org.industry, businessType: i.org.businessType, orgType: i.org.orgType }),
          density: params.density === "minimal" ? "minimal" : "standard",
          name: basic.name,
          category: basic.category,
          location: basic.location,
          personality,
          angle: i.story.ideaDescription?.trim() || i.story.ideaTitle?.trim() || "",
        },
      };
    },
  },
  {
    name: "ad_prompt",
    description: "Renders the ad copy prompt (buildAngleToInputsPrompt) from the template, the tone, the copy rules and the banned lists in the parameters.",
    inputs: ["ad_input"],
    outputs: ["ad_prompt"],
    params: {
      type: "object",
      required: ["template", "tone_preamble", "rules", "banned_body_openers", "banned_passive_verbs", "subject_hint_max"],
      properties: {
        template: { type: "string" },
        tone_preamble: { type: "string" },
        rules: { type: "object", properties: { headlineRule: { type: "string" }, bodyRule: { type: "string" }, ctaRule: { type: "string" } } },
        banned_body_openers: { type: "array", items: { type: "string" } },
        banned_passive_verbs: { type: "array", items: { type: "string" } },
        subject_hint_max: { type: "number" },
      },
    },
    run: (ctx, params) => {
      const a = ctx.ad_input as Record<string, string>;
      const rules = params.rules as AngleToInputsRules;
      const density = a.density === "minimal" ? "minimal" : "standard";
      const render = { minimal: "render HEADLINE ONLY, body+cta empty", standard: "render headline + body + cta" };
      return {
        ad_prompt: substituteTokens(String(params.template), {
          "{content_type}": a.content_type,
          "{vertical}": a.vertical,
          "{density}": density,
          "{render HEADLINE ONLY, body+cta empty | render headline + body + cta}": render[density],
          "{tonePreamble: editorial | brand | direct-response}": String(params.tone_preamble),
          "{rules.headlineRule}": rules.headlineRule,
          "{rules.bodyRule}": rules.bodyRule,
          "{rules.ctaRule}": rules.ctaRule,
          "{BANNED_BODY_OPENERS}": strArr(params.banned_body_openers).join(", "),
          "{BANNED_PASSIVE_VERBS}": strArr(params.banned_passive_verbs).join(", "),
          "{SUBJECT_HINT_MAX}": String(params.subject_hint_max),
          "{name}": a.name,
          "{category}": a.category,
          "{location}": a.location,
          "{personality?}": a.personality ?? "",
          "{angle}": a.angle,
        }),
      };
    },
  },
  {
    name: "ad_parse",
    description: "Parses and checks the ad copy JSON (parseAngleConverterResponse): headline, body (the subheadline) and CTA, with no URL or HTML, collapsed and capped.",
    inputs: ["ad_raw", "ad_input"],
    outputs: ["ad"],
    params: { type: "object", properties: {} },
    run: (ctx) => {
      const a = ctx.ad_input as { density: string };
      const r = parseAngleConverterResponse(str(ctx.ad_raw) ?? "", { density: a.density === "minimal" ? "minimal" : "standard" });
      return { ad: { headline: r.headline, subheadline: r.body, cta: r.cta, subject_hint: r.subject_hint } };
    },
  },
  // ---------------------------------------------------------------- general
  {
    name: "pick",
    description: "Copies one context value to a new name (for example to feed an added step).",
    inputs: [],
    outputs: ["value"],
    params: { type: "object", required: ["from", "to"], properties: { from: { type: "string" }, to: { type: "string" } } },
    run: (ctx, params) => ({ [String(params.to)]: getPath(ctx, String(params.from)) ?? null }),
  },
];

export const REGISTRY: Record<string, CodeFn> = Object.fromEntries(fns.map((f) => [f.name, f]));

export function registryList() {
  return fns.map(({ run: _run, ...rest }) => rest);
}
