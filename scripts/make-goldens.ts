/**
 * Writes the fidelity goldens (§3.2, §10b): every prompt step's rendered
 * messages and settings, made by longtale-core's OWN builders at 136fa4ac,
 * for the four fixture stories and the three seeds.
 *
 * Runs only on the builder's computer. It needs the longtale-core worktree
 * and longtale_dv2 (read only). CI never runs it; CI compares the app with
 * the committed files in test/goldens/.
 *
 * A step after a model call needs that call's reply. The first time, the
 * script calls OpenRouter once with longtale-core's exact request and saves
 * the reply in the golden file ("recorded"). Later runs reuse the recorded
 * replies, so both sides always render from the same values.
 *
 * Run it from the longtale-core apps/api folder, so tsx uses that tsconfig
 * (decorators, the @/ alias):
 *   cd <core>/apps/api
 *   <workbench>/node_modules/.bin/tsx <workbench>/scripts/make-goldens.ts
 */
import "reflect-metadata";
import fs from "node:fs";
import path from "node:path";

const WORKBENCH = path.resolve(__dirname, "..");
const CORE = process.env.LONGTALE_CORE_DIR ?? "C:/dev/a-empath-ai/longtale-core/.claude/worktrees/beautiful-lumiere-d74efc";
const API = path.join(CORE, "apps/api");
const FIXTURE_JOBS = [1104, 1100, 1107, 1099];
const GENERATION_DATE = "2026-10-29"; // the jobs' run date; the app uses the same default (§10b: pinned).

// The prompt files on disk are CRLF on this Windows checkout, but git stores
// them LF and production runs on Linux. Read them as the git blob holds them.
const realRead = fs.readFileSync;
(fs as { readFileSync: typeof fs.readFileSync }).readFileSync = ((p: fs.PathOrFileDescriptor, opts?: unknown) => {
  const out = (realRead as (p: fs.PathOrFileDescriptor, o?: unknown) => string | Buffer)(p, opts);
  if (typeof p === "string" && /common[\\/]prompts/.test(p) && typeof out === "string") return out.replace(/\r\n/g, "\n");
  return out;
}) as typeof fs.readFileSync;

process.env.STORY_WRITER_GENERATION_DATE = GENERATION_DATE;
// .env.example values (§10b: generateStatistics reads these); production has no other default.
process.env.OPENROUTER_DEFAULT_MODEL = "google/gemini-3-flash-preview";
delete process.env.OPENROUTER_MAX_TOKENS;

type Any = Record<string, unknown>;
const req = (p: string) => require(path.join(API, p)) as Any;

/* eslint-disable @typescript-eslint/no-require-imports */
const pg = require(path.join(WORKBENCH, "node_modules/pg")) as typeof import("pg");
const harness = req("scripts/story-writer-test/harness.lib") as unknown as typeof import("../../longtale-core/.claude/worktrees/beautiful-lumiere-d74efc/apps/api/scripts/story-writer-test/harness.lib");
const pipeline = req("src/api/modules/story-writer/story-writer.pipeline") as unknown as typeof import("../../longtale-core/.claude/worktrees/beautiful-lumiere-d74efc/apps/api/src/api/modules/story-writer/story-writer.pipeline");
const llmCall = req("src/api/modules/story-writer/writer/llm-call") as unknown as typeof import("../../longtale-core/.claude/worktrees/beautiful-lumiere-d74efc/apps/api/src/api/modules/story-writer/writer/llm-call");
const writerPrompt = req("src/api/modules/story-writer/writer/writer-prompt") as unknown as typeof import("../../longtale-core/.claude/worktrees/beautiful-lumiere-d74efc/apps/api/src/api/modules/story-writer/writer/writer-prompt");
const writerOutput = req("src/api/modules/story-writer/writer/writer-output") as unknown as typeof import("../../longtale-core/.claude/worktrees/beautiful-lumiere-d74efc/apps/api/src/api/modules/story-writer/writer/writer-output");
const reasoningMod = req("src/api/modules/openrouter/llm-reasoning") as unknown as typeof import("../../longtale-core/.claude/worktrees/beautiful-lumiere-d74efc/apps/api/src/api/modules/openrouter/llm-reasoning");
const genModels = req("src/api/modules/generation/generation-models") as unknown as typeof import("../../longtale-core/.claude/worktrees/beautiful-lumiere-d74efc/apps/api/src/api/modules/generation/generation-models");
const openrouter = req("src/api/modules/openrouter/openrouter.service") as unknown as typeof import("../../longtale-core/.claude/worktrees/beautiful-lumiere-d74efc/apps/api/src/api/modules/openrouter/openrouter.service");
const promptHelper = (req("src/api/modules/organic-social/organic-social.prompt.helper") as Any).default as { buildMultiPlatformPrompt: (p: string[], d: unknown) => string };
const fbRules = req("src/api/modules/organic-social/facebook-text-rules") as unknown as typeof import("../../longtale-core/.claude/worktrees/beautiful-lumiere-d74efc/apps/api/src/api/modules/organic-social/facebook-text-rules");
const { OrganicSocialService } = req("src/api/modules/organic-social/organic-social.service") as { OrganicSocialService: { prototype: Any } };
const { StoryService } = req("src/api/modules/story/story.service") as { StoryService: { prototype: Any } };
const { AdCopyGeneratorService } = req("src/api/modules/story/ad-copy/ad-copy-generator.service") as { AdCopyGeneratorService: new (...a: unknown[]) => { generateCopy: (i: Any) => Promise<unknown> } };
const { BasicBusinessSignalSource } = req("src/api/modules/story/ad-copy/basic-business.signal-source") as { BasicBusinessSignalSource: new (p: unknown) => unknown };
const { BrandVoiceSignalSource } = req("src/api/modules/story/ad-copy/brand-voice.signal-source") as { BrandVoiceSignalSource: new (p: unknown) => unknown };
const { CrawlFactsSignalSource } = req("src/api/modules/story/ad-copy/crawl-facts.signal-source") as { CrawlFactsSignalSource: new (p: unknown, r: unknown) => unknown };
const { BlendedCopyComposer } = req("src/api/modules/story/ad-copy/copy-context-composer") as { BlendedCopyComposer: new () => unknown };
const { mapVertical } = req("src/api/modules/story/ad-style/vertical-mapper") as { mapVertical: (i: Any) => string };
const { CAUSE_MARKETING_CONTENT_TYPE } = req("src/api/modules/story/ad-style/content-type") as { CAUSE_MARKETING_CONTENT_TYPE: string };
const { getMarketDefault } = req("src/common/config/market-defaults") as { getMarketDefault: (k: string) => number };
/* eslint-enable @typescript-eslint/no-require-imports */

// ---------------------------------------------------------------- the source database (read only)

const src = new pg.Client({ connectionString: process.env.SOURCE_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/longtale_dv2" });
pg.types.setTypeParser(1114, (v: string) => new Date(`${v.replace(" ", "T")}Z`));
pg.types.setTypeParser(20, (v: string) => BigInt(v));
const q = async (sql: string, params: unknown[] = []) => (await src.query(sql, params)).rows as Any[];
const camel = (row: Any): Any => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase()), v]));
const first = async (sql: string, params: unknown[]) => {
  const r = await q(sql, params);
  return r[0] ? camel(r[0]) : null;
};

/** The parts of PrismaClient that harness.loadStory and the ad signal sources read, over pg. */
const fakePrisma = {
  workflowJob: {
    findUniqueOrThrow: async ({ where }: { where: { id: bigint } }) => {
      const r = await first("select * from workflow_jobs where id = $1", [where.id]);
      if (!r) throw new Error("job not found");
      return r;
    },
  },
  organization: {
    findUnique: async ({ where }: { where: { id: bigint } }) => first("select * from organizations where id = $1", [where.id]),
    findFirst: async ({ where }: { where: { id: bigint } }) => first("select * from organizations where id = $1 and deleted_at is null", [where.id]),
  },
  organizationBrandProfile: {
    findFirst: async ({ where }: { where: { organizationId: bigint } }) =>
      first("select * from organization_brand_profiles where organization_id = $1 and deleted_at is null order by id limit 1", [where.organizationId]),
  },
  discoveryCauseCandidate: {
    findFirst: async ({ where, orderBy }: { where: Any; orderBy?: unknown }) => {
      if (where.id) return first("select * from discovery_cause_candidates where id = $1 and job_id = $2 and deleted_at is null", [where.id, where.jobId]);
      if (where.winnerFlag) return first("select * from discovery_cause_candidates where job_id = $1 and winner_flag and deleted_at is null order by id limit 1", [where.jobId]);
      void orderBy;
      return first("select * from discovery_cause_candidates where job_id = $1 and deleted_at is null order by rank asc nulls last limit 1", [where.jobId]);
    },
    findFirstOrThrow: async ({ where }: { where: Any }) => {
      const r = await first("select * from discovery_cause_candidates where job_id = $1 and deleted_at is null order by rank asc nulls last limit 1", [where.jobId]);
      if (!r) throw new Error("no candidate");
      return r;
    },
  },
  discoveryCandidatePage: {
    findMany: async ({ where }: { where: { candidateId: bigint } }) => {
      const links = await q("select * from discovery_candidate_pages where candidate_id = $1 order by id", [where.candidateId]);
      const out: Any[] = [];
      for (const l of links) out.push({ ...camel(l), pageExtract: await first("select * from discovery_page_extracts where id = $1", [l.page_extract_id]) });
      return out;
    },
  },
  discoveryPageExtract: {
    findUnique: async ({ where }: { where: { id: bigint } }) => first("select * from discovery_page_extracts where id = $1", [where.id]),
    findMany: async ({ where, take }: { where: { jobId: bigint }; take?: number }) =>
      (await q(`select * from discovery_page_extracts where job_id = $1 and deleted_at is null order by id ${take ? `limit ${take}` : ""}`, [where.jobId])).map(camel),
  },
  story: {
    findUnique: async ({ where }: { where: { id: bigint } }) => ({ discoveryCauseCandidateId: where.id, discoveryRankedIdeaId: null }),
  },
};

// ---------------------------------------------------------------- the model, recorded

interface Captured {
  id: string;
  messages: { role: string; content: string }[];
  options: Any;
}

const envKey = (() => {
  const line = realRead(path.join(WORKBENCH, ".env.local"), "utf8").split(/\r?\n/).find((l) => l.startsWith("OPENROUTER_API_KEY="));
  return line ? line.slice("OPENROUTER_API_KEY=".length).trim() : "";
})();

class Recorder {
  current = "";
  captured: Captured[] = [];
  constructor(public recorded: Record<string, string>) {}

  async reply(messages: Captured["messages"], options: Any): Promise<string> {
    const id = this.current;
    if (!id) throw new Error("a model call with no step id");
    const { retries: _r, ...opts } = options;
    this.captured.push({ id, messages: structuredClone(messages), options: structuredClone(opts) });
    this.current = "";
    if (id in this.recorded) return this.recorded[id];
    if (!envKey) throw new Error(`no recorded reply for ${id} and no OPENROUTER_API_KEY in .env.local`);
    console.log(`  calling OpenRouter for ${id} (${String(opts.model)})…`);
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${envKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: opts.model, messages, stream: false, ...opts }),
      signal: AbortSignal.timeout(600_000),
    });
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (!res.ok || body.error) throw new Error(`OpenRouter: ${body.error?.message ?? res.status}`);
    const text = body.choices?.[0]?.message?.content ?? "";
    this.recorded[id] = text;
    return text;
  }

  /** The OpenRouterService shape the longtale code calls. */
  llm(): Any {
    const chat = async (messages: Captured["messages"], options: Any = {}) => ({
      choices: [{ message: { content: await this.reply(messages, options) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    });
    return {
      chat,
      generate: async (prompt: string, options: Any = {}) => (await chat([{ role: "user", content: prompt }], options)).choices[0].message.content,
    };
  }
}

// ---------------------------------------------------------------- one fixture, one seed

type Seed = "production" | "staged" | "one_call";

async function render(jobId: number, seed: Seed, rec: Recorder) {
  const cfg = harness.RUN2_STORIES.find((s) => s.jobId === jobId);
  if (!cfg) throw new Error(`job ${jobId} is not a harness story`);
  const story = await harness.loadStory(fakePrisma as never, cfg);
  const llm = rec.llm();
  const job = await first("select * from workflow_jobs where id = $1", [BigInt(jobId)]);
  const orgId = job?.organizationId as bigint;
  const winnerId = BigInt(story.winner.id);
  const idea = await first(
    "select title, description from discovery_ranked_ideas where discovery_cause_candidate_id = $1 and deleted_at is null order by attempt_number, id limit 1",
    [winnerId],
  );
  let markdown: string;

  if (seed === "production") {
    // run.ts runArmA (lines 236-284): statistics only when the impact value is null.
    let stats: unknown = null;
    if (story.winner.impactValueRaw === null) {
      const svc = openrouter.createOpenRouterService({ apiKey: "recorded", appName: "goldens" }) as unknown as Any;
      svc.chat = (llm.chat as (m: unknown, o: unknown) => Promise<unknown>);
      rec.current = "statistics";
      stats = await (svc.generateStatistics as (e: string, l: string, m: string) => Promise<unknown>).call(svc, story.winner.storyHeadline ?? story.winner.description ?? "", "", "");
    }
    const payload = harness.armAPayload(story, stats as string | null);
    const armAModel = genModels.GENERATION_MODELS.narrative;
    rec.current = "article";
    const { json } = await llmCall.callJson(
      llm as never,
      "write",
      [
        { role: "system", content: harness.loadProductionPrompt(API) },
        { role: "user", content: `Generate story:\n${JSON.stringify(payload)}` },
      ],
      { model: armAModel, temperature: 0.7, max_tokens: 16384, reasoning: reasoningMod.resolveReasoningOption("medium", armAModel) },
    );
    markdown = typeof json === "object" && json !== null && typeof (json as Any).content === "string" ? ((json as Any).content as string) : "";
  } else {
    const writer = genModels.GENERATION_MODELS.narrative;
    const models = { writer, labeller: "google/gemini-2.5-flash", writerReasoning: reasoningMod.resolveReasoningOption("medium", writer) };
    let pages = story.pages;
    rec.current = "label";
    const prepared0 = await pipeline.prepareStory(llm as never, harness.ledgerInputFor(story, pages), models);
    let prepared = prepared0;
    if (prepared0.ledger.thin.isThin) {
      const extra = harness.recrawlPages(story);
      if (extra.length) {
        pages = [...pages, ...extra];
        rec.current = "label_recrawl";
        prepared = await pipeline.prepareStory(llm as never, harness.ledgerInputFor(story, pages), models);
      }
    }
    const settings = { publisher: cfg.publisher, sponsor: cfg.sponsor, sponsorPrograms: cfg.programs, targetWords: 425, minWords: 325, maxWords: 600 };
    let staged: string | undefined;
    if (seed === "staged") {
      // run.ts runArmC (lines 286-330).
      rec.current = "select";
      const sel = await llmCall.callJson(llm as never, "select", harness.buildSelectionMessages(prepared, settings.publisher, settings.sponsor), {
        model: writer,
        temperature: 0.3,
        max_tokens: 16384,
        reasoning: reasoningMod.resolveReasoningOption("high", writer),
      });
      staged = JSON.stringify(sel.json, null, 1);
    }
    rec.current = "write";
    const write = await llmCall.callJson(llm as never, "write", writerPrompt.buildWriterMessages(prepared.input, settings, seed === "staged" ? "staged" : "one_call", staged), {
      model: writer,
      temperature: 0.7,
      max_tokens: 16384,
      reasoning: reasoningMod.resolveReasoningOption("medium", writer),
    });
    const out = writerOutput.parseWriterOutput(write.json);
    const grounded = out.options.find((o) => o.option === "grounded") ?? out.options[0];
    markdown = writerOutput.optionToMarkdown(grounded);
  }

  // story.service.ts markGenerationCompleted → enforceArticleTitleLimit (lines 365-403).
  const storySvc = Object.create(StoryService.prototype) as Any;
  rec.current = "headline_shorten";
  const finalMarkdown = (await (storySvc.enforceArticleTitleLimit as (m: string, l: unknown) => Promise<string>).call(storySvc, markdown, llm)) as string;
  if (rec.current === "headline_shorten") rec.current = ""; // no call: the title fits

  // auto-fire _createStory → generateShortStoryTitle(selectedIdea.title) (story.service.ts 276-310).
  storySvc.resolveLlm = () => llm;
  rec.current = "short_title";
  const shortTitle = (await (storySvc.generateShortStoryTitle as (t: string | null) => Promise<string | null>).call(storySvc, (idea?.title as string | null) ?? null)) as string | null;
  if (rec.current === "short_title") rec.current = "";

  // organic-social.service.ts generateMultiplePlatforms (lines 806-985), one platform per call.
  const social = Object.create(OrganicSocialService.prototype) as Any;
  const brand = await first("select * from organization_brand_profiles where organization_id = $1 and deleted_at is null order by id limit 1", [orgId]);
  const payload = harness.armAPayload(story, null);
  const heading = /^(#{1,6})[ \t]+([^\r\n]*)/.exec(finalMarkdown);
  const tiptapTitle = heading?.[2].replace(/[*_~`]/g, "").trim() ?? null;
  const context = {
    storyData: {
      brandName: payload.BrandName,
      initiativeDetails: payload.InitiativeDetails,
      keyThemesToEmphasize: payload.KeyThemesToEmphasize,
      callToActionLink: payload.CallToActionLink,
      brandCoreBusiness: payload.BrandCoreBusiness,
    },
    tiptapDocument: { title: tiptapTitle, generatedContent: finalMarkdown },
    articleMarkdown: finalMarkdown,
  };
  const facebook = {
    name: fbRules.facebookNameOf(brand?.facebookHandle as string | null, brand?.facebookUrl as string | null),
    characterLimit: getMarketDefault("socialPostFacebookAiCharacterLimit"),
  };
  const promptData = (social.buildPromptData as (...a: unknown[]) => unknown).call(social, context, (idea?.title as string | null) || "Untitled Story", shortTitle, facebook);
  const maxTokens = Math.max(genModels.GENERATION_MAX_TOKENS.organic, 1 * 800);
  for (const platform of ["facebook", "instagram", "linkedin", "x"]) {
    const finalPrompt = promptHelper.buildMultiPlatformPrompt([platform], promptData);
    rec.current = `social_${platform}_write`;
    const aiResponse = (await (social.generateWithAI as (p: string, m: number, l: unknown) => Promise<string>).call(social, finalPrompt, maxTokens, llm)) as string;
    if (platform === "facebook") {
      const parsed = ((social.parseMultiPlatformResponse as (r: string) => { platform: string }[]).call(social, aiResponse)).filter((pc) =>
        ["x", "facebook", "instagram", "linkedin", "youtube", "tiktok", "pinterest"].includes(pc.platform),
      );
      await (social.applyFacebookTextRules as (...a: unknown[]) => Promise<unknown>).call(
        social,
        parsed,
        facebook.characterLimit,
        (retryPrompt: string) => {
          rec.current = "social_facebook_retry";
          return (social.generateWithAI as (p: string, m: number, l: unknown) => Promise<string>).call(social, retryPrompt, maxTokens, llm);
        },
        finalPrompt,
      );
    }
  }

  // ad-draft-generation.service.ts (lines 200-215) → AdCopyGeneratorService.generateCopy.
  const org = await first("select * from organizations where id = $1", [orgId]);
  const sources = [new BasicBusinessSignalSource(fakePrisma), new BrandVoiceSignalSource(fakePrisma), new CrawlFactsSignalSource(fakePrisma, { resolveDiscoveryJobId: async () => BigInt(jobId) })];
  const ad = new AdCopyGeneratorService(sources, new BlendedCopyComposer(), fakePrisma, { get: () => llm }, undefined);
  rec.current = "ad_copy";
  await ad.generateCopy({
    organizationId: orgId,
    storyId: winnerId,
    style: "golden",
    vertical: mapVertical({ industry: org?.industry ?? null, businessType: org?.businessType ?? null, orgType: org?.orgType ?? null }),
    contentType: CAUSE_MARKETING_CONTENT_TYPE,
    density: "standard",
    angle: (idea?.description as string | null)?.trim() || (idea?.title as string | null)?.trim() || "",
  });
}

async function main() {
  await src.connect();
  await src.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
  const outDir = path.join(WORKBENCH, "test/goldens");
  for (const seed of ["production", "staged", "one_call"] as Seed[]) {
    fs.mkdirSync(path.join(outDir, seed), { recursive: true });
    for (const jobId of FIXTURE_JOBS) {
      const file = path.join(outDir, seed, `job-${jobId}.json`);
      const old = fs.existsSync(file) ? (JSON.parse(realRead(file, "utf8")) as { recorded: Record<string, string> }) : { recorded: {} };
      const rec = new Recorder(old.recorded);
      console.log(`${seed} job ${jobId}`);
      await render(jobId, seed, rec);
      fs.writeFileSync(
        file,
        JSON.stringify(
          {
            _note: "Made by scripts/make-goldens.ts with longtale-core's own builders (136fa4ac). Do not edit by hand.",
            seed,
            jobId,
            generationDate: GENERATION_DATE,
            steps: rec.captured,
            recorded: rec.recorded,
          },
          null,
          1,
        ) + "\n",
      );
      console.log(`  ${rec.captured.length} prompt steps: ${rec.captured.map((c) => c.id).join(", ")}`);
    }
  }
  await src.end();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
