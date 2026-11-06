# Decisions

Each decision says what the build chose, why, and the option it rejected.
Source of the ported code: longtale-core branch `claude/story-v3-writer-try`,
commit `136fa4ac` (pushed).

## Hosting and platform

**D1. Public repo.** The repo is `100XLT-ai/story-workbench`, public (spec §10b). Vercel Hobby cannot deploy a private organization repo. No secret is in the repo. Rejected: a private repo under `alan100xlt`.

**D2. Vercel Git integration.** A push to `main` deploys production. The CLI linked the project to the repo. Rejected: deploys from GitHub Actions (kept as the fallback in §10b; not needed).

**D3. Deployment protection off.** The project's `ssoProtection` is `null` (spec P7, §8). The production domain is `story-workbench-longtale-hq.vercel.app`; `story-workbench.vercel.app` belongs to another account. Rejected: protection on previews only (P7 says no security anywhere).

**D4. Node 24.** The project's Node version is `24.x`, the same as the brief. Vercel's default was 26.

**D5. The database is blocked on the Neon terms.** `vercel integration add neon` stops with `integration_terms_acceptance_required`. Accepting terms is the owner's act, so the build does not do it. The build uses a local Postgres (`story_workbench`) and records the step in `docs/STATUS.md`. Rejected: another provider (the owner chose Neon) and accepting the terms by browser automation.

**D6. Hobby limits accepted.** Neon free has 0.5 GB; the snapshot uses about 125 MB. Vercel Workflow on Hobby has about 50,000 events a month; a story uses about 4 events per model call, so a 500-story run uses about 20,000 events. A few large runs a month fit. The owner accepts this (§10b).

**D7. Recorded risk: open API, unlimited credit.** Anyone who finds the URL can start runs and spend OpenRouter credit. The owner accepted this (§10b, P3, P7).

## Data

**D8. Read only, enforced.** The import opens `longtale_dv2` with `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` and a `BEGIN READ ONLY` transaction.

**D9. Two ledgers at import.** The import builds each story's fact ledger with the app's port and with longtale-core's own `buildFactLedger` (from the worktree). It stops if the counts differ. They are equal for all 15,051 stories. `data/expected-counts.json` comes from longtale-core's ledger. Cost: the import takes about 23 minutes.

**D10. Counts.** `fact_count` = ledger claims of kind `fact`; `impact_count` = claims of kind `impact`; `quote_count` = ledger quotes (after `dedupePages` and quote de-duplication). The ledger's generation date is the job's run date.

**D11. Runnable rules.** `runnable_production` = the candidate has a description and the job has a sponsor name. `armAPayload` builds `InitiativeDetails` from the description; without it the article has no subject. `runnable_v3` was first "at least one page (linked pages, else `source_page_extract_id`)", which gave 202 winners. D42 replaces that rule.

**D12. Story title and summary.** Production sets `Story.title` and `Story.summary` from the ranked idea (`discovery_ranked_ideas.title`, `.description`) at story creation (`auto-fire-orchestrator.service.ts` `_createStory`). The snapshot copies them per candidate. The short social title and the ad angle read them.

**D13. Ranking columns.** All of `rank`, `winner`, `weighted_score`, `total`, `tier_impact`, `tier_recency`, `tier_reach`, `tier_evidence`, `tier_attribution`, `tier_market`, `tier_image`, `tiebreak_reasoning`, `deal_grade`, `confidence` and `score_components` exist in the source and are columns.

**D14. Mastheads and sponsor names.** `data/mastheads.json` maps Spokesman Review → The Spokesman-Review and WEHCO → Arkansas Democrat-Gazette (the harness values); other markets use their names. `data/sponsor-names.json` holds the harness aliases and programs by domain.

**D15. Page order.** Prisma reads without `ORDER BY` give the heap order. The app and the goldens order pages by id, which is the heap order for these insert-only tables.

## Seeds and fidelity

**D16. Prompts as git blobs.** The prompt files are CRLF in the Windows checkout but LF in git; production runs on Linux. The app holds the LF blobs (`prompts/`), and the golden script reads longtale-core's prompt files with CRLF turned to LF.

**D17. Golden method.** `scripts/make-goldens.ts` runs from longtale-core's `apps/api` folder, so tsx uses its tsconfig (decorators, `@/`). It calls longtale-core's own code: `harness.loadStory`, `prepareStory`, `buildSelectionMessages`, `buildWriterMessages`, `callJson`, `OpenRouterService.generateStatistics`, `StoryService.enforceArticleTitleLimit` and `generateShortStoryTitle`, `OrganicSocialService.buildPromptData`, `generateWithAI` and `applyFacebookTextRules`, the organic `PromptHelper`, and `AdCopyGeneratorService.generateCopy` with its three signal sources. A fake Prisma over `pg` (read only) and a fake model capture the requests. `runArmA` and `runArmC` are not exported, so the script repeats their option literals from `run.ts` (lines 236–330). The first run called OpenRouter once per step with longtale-core's exact request and saved the replies; later runs reuse them.

**D18. Fixtures.** Winners of jobs 1104, 1100, 1107 and 1099 (1099 has a null impact value, so `statistics` runs). Generation date pinned to 2026-10-29, the jobs' run date and the app's default. None of the four stories is thin after labelling, so the re-crawl branch is not in the goldens; its code is the harness code, line for line.

**D19. Exact settings (cited).**
- write: temperature 0.7, max tokens 16384, reasoning "medium" (`run.ts` 314–318); select: 0.3, 16384, "high" (`run.ts` 299–303); label: 0, 8192, no reasoning field (`story-writer.pipeline.ts` 54–58).
- Word targets 425 / 325 / 600 (`run.ts` 359–366, `story-writer.config.ts`).
- Reasoning levels resolve per model with the ported `resolveReasoningOption` (`llm-reasoning.ts`): Gemini 3 gets `{effort}`; a budget model gets `{max_tokens}`; `null` sends nothing.
- statistics: model `google/gemini-3-flash-preview` (`OPENROUTER_DEFAULT_MODEL` in `apps/api/.env.example`; the code has no other default), max tokens 2000 (`OPENROUTER_MAX_TOKENS` or 2000), temperature 0.3, `response_format: json_object` (`openrouter.service.ts` 589–628). Inputs as `run.ts` 241–245: event type = headline or description, location "", mission "".
- headline_shorten: `GENERATION_MODELS.title` = `google/gemini-3.5-flash`, reasoning "minimal", 1536, temperature 0.3; limit 45 characters after stripping `*_~\``; the heading must open the markdown; the word-boundary cap (`story.service.ts` 313–403).
- Social: `GENERATION_MODELS.organic` = `google/gemini-3.5-flash`, temperature 0.7, max tokens max(6144, 800), reasoning "low", one user message (`organic-social.service.ts` 437–452, 955–962).
- Ad copy: `GENERATION_MODELS.displayCopy` = `google/gemini-3.5-flash`, temperature 0.7 (`getTemperature()` default), 2048, reasoning "minimal", `json_object` (`ad-copy-generator.service.ts` 272–278).

**D20. Production seed order.** The spec lists `payload` before `statistics`, but `armAPayload` reads the statistics. The seed runs `statistics_input` → `statistics` (when the impact value is empty) → `parse_statistics` → `payload` → `article` → `split` → headline fit. The card says it is arm A plus the headline call.

**D21. Headline fit in every seed.** Production applies `enforceArticleTitleLimit` to every stored article, also the one-call writer's (`story.service.ts` 2112). So the Staged and One-call seeds also run `title_check` → `headline_shorten` → `fit_title` before the social steps, which read the stored article.

**D22. Social: one step per platform.** Production builds one prompt for the requested platform list (`buildMultiPlatformPrompt`). Auto-fire asks for Facebook only. Each seed step renders the prompt for one platform, as production does when `AUTOFIRE_ORGANIC_PLATFORMS` names that platform. The templates are code-step parameters, so a person edits them in the app.

**D23. Social data comes from production's path.** The social prompt reads `storyData` (the 13 production fields, built here by `production_payload`), the TipTap title (the article title), the stored article markdown, `Story.title`, and `Story.shortStoryTitle`. The short title is a production model call at story creation (`generateShortStoryTitle`), so it is a seed step with a `when`. The Facebook handle comes from the brand profile (`facebookNameOf`); the limit is the market default 400 (no market config overrides it).

**D24. Facebook rules.** Emoji strip, empty hashtags, the length count and the one retry when the post is over 400 characters (`applyFacebookTextRules`) are code and prompt steps.

**D25. X posts that production drops.** The output schema says `"x (twitter)"`, and the model often copies it. Production drops a post whose platform it does not recognise (`organic-social.service.ts` 971–977), so production saves no X post then. The app keeps the post visible and marks it "Production does not recognise it and would drop this post." Rejected: hiding the post (the team wants to see it).

**D26. Ad copy does not read the article.** Production's display ad copy reads `Story.summary` (else `Story.title`) as the angle, plus the business, brand voice and crawl-fact blocks (`ad-draft-generation.service.ts` 200–215). It never reads the article. P5 wins: the seed does the same, and the flow view shows the ad steps' real inputs. AC-06b's "the ad steps visibly read that run's article" holds for the social steps only; a person can change the `ad_input` step or the ad prompt to read `{{article...}}`. The ad copy runs once per story: production runs it three times (one per ad style) with the same prompt.

**D27. Template filters.** `{{x|json}}`, `|json1`, `|json2` are `JSON.stringify(v)`, `(v, null, 1)`, `(v, null, 2)`. Rendering is one pass; inserted text is never scanned again (the rule of `fillTemplate` and `substituteTokens`).

**D28. A skipped step.** It writes `null` only to names that no earlier step wrote, so the re-crawl branch never hides the first ledger.

**D29. Output formats.** `json` sends `response_format: json_object` and parses (bad JSON fails the step); `json_raw` sends it and keeps the text (the statistics and ad parsers are lenient, as in production); `text` sends no `response_format`.

## Runs

**D30. One Vercel Workflow per story.** `storyWorkflow(runStoryId)`: `advanceStep` runs code steps inline and stops at the next model call; `modelCallStep` makes one call. Steps pass the run-story id, not the context. The context state is gzip JSON in `run_stories.state`; story inputs are rebuilt from the snapshot, never stored. Rejected: one workflow per run (§10b asks for one per story).

**D31. Concurrency by claims.** A run starts `concurrency` story workflows (default 8, a setting). When a story ends, its last step claims the next pending story (`FOR UPDATE SKIP LOCKED`) and starts its workflow.

**D32. Retries.** A model call retries once on bad JSON, 5xx, 429 or a network error (§5.2). Production's recovery layers are kept: a model that mandates reasoning gets the request again without it; a reply cut at `max_tokens` is retried once at a larger budget.

**D33. Cost.** The real cost is OpenRouter's `usage.cost` (or `cost_details.upstream_inference_cost` for a BYOK key, as `llm-call.ts`). The estimate uses the mean real cost of past traces of the same step and model; a new step uses the price list and the template size. Steps with a `when` count in full.

**D34. Traces.** One row per step with status, reason, model, tokens, cost and error; the messages, request, raw response, inputs and outputs are gzip JSON. The app never deletes a trace.

## Web app, API and MCP

**D35. Client pages over the open API.** Every page reads the same REST API that Claude uses, so the web app and the API cannot drift. The React lint rule `react-hooks/set-state-in-effect` is off for this reason.

**D36. "Decided" lines are code.** `src/lib/flow/decided.ts` writes one fixed line per known output (§10b). No model writes them.

**D37. Lineage.** For each step and each name it reads (declared inputs, template tokens, `when` fields), the flow view finds the latest earlier step that wrote it. The connector between two cards names those values; a value from the card just above is blue.

**D38. MCP.** `mcp-handler` 2 (MCP SDK v2) at `/mcp`, stateless Streamable HTTP, CORS open. `/.well-known/oauth-protected-resource` answers 404, so no client starts an auth flow. There is no middleware.

**D39. Ask box.** A model call (setting `ask_model`, default `google/gemini-3-flash-preview`) returns filter clauses; unknown fields are dropped; the count comes from the same query as the table.

**D40. Prompt editor.** Default model `anthropic/claude-opus-4.6` (§4.1). It returns `{changes, reason}`; the app applies the changes, shows the diff and the validation issues, and saves only on a click.

**D41. Claude Code test.** Claude Code cannot start inside the build session (it refuses nested sessions). The build checked the connection with `claude mcp add` + `claude mcp list` (✓ Connected) and ran the tool flow with `scripts/mcp-smoke.ts`, which speaks the same protocol. The QA session can run Claude Code directly.

## Review fixes

**D42. `runnable_v3` = the story's own fact ledger is not empty.** The rule is `fact_count + impact_count + quote_count > 0`. Reason: the v3 writer never sends raw page text to a model. `buildFactLedger` makes claims only from each page's stored `facts`, `cause_signal` impacts and `quotes`; it reads `scraped_markdown` only to find spans and speaker names (`fact-ledger.ts`). The label, select and write prompts read the ledger blocks (`writer_input`: FACTS, COMPANY, QUOTES). `sourceTextFor` (raw text) feeds only longtale-core's judge (`run.ts` 466), not a writer. So a page that was never scraped, or a scraped page with nothing extracted, gives the writer nothing. Nothing stops such a run: production's `writeArticle` returns null only when there is no page (`story-writer.service.ts` 128), so D11's rule copied that guard. Before: 13,461 stories, 202 winners, 122 winners with `quote_count` ≤ 1. After: 13,192, 177 and 97.
- Of the 106 winners with an empty ledger: 81 have no page, 15 have only a page that was never scraped (for example 1918), and 10 have a scraped page with nothing extracted. A further winner (3556) has a scraped page with no facts or quotes but 7 impacts, so it stays runnable.
- `text_page_count` (new) counts the story's pages whose `scraped_markdown` has a character that is not white space. In this snapshot no page without text has facts, impacts or quotes, so `text_page_count` 0 always means an empty ledger. The story page shows the reason when a story is not runnable.
- Migration `0001_runnable_v3_ledger_and_score_parts` adds the column and recomputes both values with SQL, so the hosted database needs no re-import. Its page set is the import's: linked pages, else the source page, without a filter on `deleted` (the harness `loadStory` reads linked pages without one). The snapshot has 0 deleted pages, so this choice changes no count.
- Rejected: "at least one page with text". Text without extracted facts gives the ledger nothing (10 winners). Rejected: counting the thin-story re-crawl. An empty ledger is always thin, so the Staged and One-call seeds re-crawl; for 5 of the 15 unscraped winners (1918, 1949, 2073, 2318, 2502) it adds other pages of the job. Those pages are not the story discovery linked, the re-crawl is a harness stand-in that production does not run, and `recrawlPages` cannot run in SQL. The story page lists the pages the re-crawl would add.

**D43. Score parts as generated columns.** `score_attribution`, `score_evidence_completeness`, `score_beneficiary_interest`, `score_amount`, `score_recency` and `score_attendance` are Postgres generated columns over `score_components`. The field registry sorts and filters plain columns, so the Ask box, the API and MCP get them with no new query code, and the import needs no change. `total` equals the sum of the six parts for all 15,051 stories (checked with SQL), so the story page draws each part as a share of the total. The app shows these values only; it adds no score (P1). Rejected: JSON path expressions in the registry (every filter op would need a second code path).

## Data gaps and scoring (2026-11-06)

**D44. Why 1,590 stories have no page.** They are the ranked stories of 106 jobs (ids 555 to 772) that ran from 2026-06-03 to 2026-08-14. In `longtale_dv2` each of them has no `discovery_candidate_pages` row and a null `source_page_extract_id`, and their jobs have no `discovery_page_extracts` row at all (SELECT only, 2026-11-06). The page rows were deleted from the source database, not lost by the import:
- `discovery_page_extracts` ids start at 11,793, and the first extract is from 2026-08-17 (job 785). longtale-core created the table on 2026-05-31 (73252f90), so the June jobs did have extracts once.
- The candidate's `source_page_extract_id` foreign key is `ON DELETE SET NULL`, and `discovery_candidate_pages` cascades on delete. A hard delete of the extract rows leaves exactly this state.
- The jobs' image rows (2,157) are still there, and 1,185 of the 1,590 stories keep an `evidence_quote`. Neither feeds a writer.
- No import fix is possible: the rows are not in the source. The app marks these stories "old pipeline: no pages saved" on the table and the story page, adds a "Has source data" quick chip (`page_count > 0`), and shows a coverage panel per ranking system (`GET /api/stories/coverage`).

**D45. Default order: the newest job first, then rank.** The stories list sorted by id. Ids 183 to 1,917 come first, and most are the page-less stories of D44, so the first screens showed only empty data. The default is now `run_date desc, job_id desc, rank asc, id asc`. A click on a column header still sorts by that column; "Newest job first" goes back. A run started from a filter takes the first 500 stories in the same order.

**D46. `ranking_system` column.** A generated column, `coalesce(raw->>'weighted_version', 'untagged')` (migration `0002_ranking_system`). The values: `untagged` (2,328 stories, 168 jobs, run 2026-06-03 to 2026-10-23), `weighted-grade@v2` (3,920, 41 jobs), `weighted-grade@v1` (12, 1 job), `simple-score@v1` (8,791, 98 jobs). Every story also carries `scoring_version` `cause-score@v1`, the six score parts and `total`. Part 2 of the 2026-11-06 work adds what each system stores and where.

**D47. "Preview inputs": every prompt's full input, with no model call.** `POST /api/preview-inputs` (and the MCP tool `preview_inputs`) renders each step of a version for one story, on the story page and in the Run dialog. Rules:
- A code step runs when all its inputs are known: the code steps are deterministic, so the preview shows their real output (for example the fact ledger).
- A value that a model step makes is a named slot, `⟦selection: from step 11 "Choose the story"⟧`. A code step that reads a slot makes slots too, and names the model step it waits on (`⟦writer_input: from step 9 "Writer input", after model step 3 "Label the facts"⟧`). A `when` that reads a slot shows "runs only if a model output allows".
- Tokens are an estimate: 4 characters per token, for the rendered text only. A slot's real size is not counted. The page says so.
- Page text: no seed prompt has a `{{pages…}}` or `{{other_pages…}}` token. Only code steps read the pages (`ledger_input`, `recrawl`), and the Production writer's payload has no page text. The preview counts such tokens for any version, so a new version that sends page text shows it at once. Alan agreed to keep page text out of the writer.
- Rejected: running the model steps with a cheap model to fill the slots. It costs money and shows another model's output, not the input the real run sends.

**D48. Scoring: each system's raw input next to its score, with longtale-core's own functions.** Facts (longtale-core git, read 2026-11-06; checked in SQL):
- Untagged stories are weighted-grade@v1 stories written before the version column existed (`f644e7e8`, 2026-10-25). The v1 formula gives the stored score for 2,316 of 2,316. Jobs 555 and 556 (12 stories, 2026-06-03) came before weighted-grade@v1 (`9dc7dc3c`, 2026-06-05) and ranked by the cause-score total.
- For simple-score@v1 stories, `weighted_score` holds the simple points and `deal_grade` the simple grade, but the `tier_*` columns hold the weighted-grade@v2 tiers, which longtale-core computes for every row. The five simple parts are stored nowhere.
- longtale-core renamed `weighted_version` to `grade_version` on 2026-11-02 (`00e40ff0`). `ranking_system` reads both (migration `0003`), so a new import keeps working.

How the app shows it:
- `cause-score.ts` and `parse-recency.ts` are copied verbatim from origin/main into `src/lib/scoring/upstream/`; the small v1, v2 and simple tier, grade and point functions are copied into `upstream/tiers.ts` (bodies unchanged; `impactPoints` takes plain value and unit pairs). Re-copy, never edit.
- `src/lib/scoring/explain.ts` runs them on the stored fields at request time and marks each value "matches", "differs", "rebuilt" (not stored by longtale-core) or "not stored". The story page shows the table; `GET /api/stories?explain=1` adds it to each row; `docs/SCORING.md` is the guide page.
- Inputs that the old path did not store come back from the stored part: USD = 10^(amount ÷ 20) − 1, people = 10^(attendance ÷ 15) − 1 (exact up to rounding). `raw.amount`, `raw.attendees` and `raw.attribution` (the source URL) are used when present. The rank time is `raw.created_at`.
- Results over all 15,051 stories (`scripts/check-scoring.ts`): cause-score parts match on 12,711 of 12,711 v2 and simple stories and on 2,326 of 2,340 others (14 differ in beneficiary interest because the snapshot keeps only ranked candidates). The v1 score and grade match on 2,328 of 2,328, the v2 score and grade on 3,920 of 3,920, the v2 impact tier on 12,586 of 12,711 (the v2 merge can join impacts from pages the snapshot does not keep). Rebuilt simple points fit on 8,711 of 8,791. The simple grade matches on 8,059; 715 of the others are A or B by the rule but stored as C, because the story names no place (not stored).
- `test/scoring.test.ts` checks the copied cause-score, v1 recency tier, deal grade and confidence against longtale-core's 12 golden jobs (trimmed copies in `test/goldens/scoring/`).
- The app adds no score of its own (P1). It labels the ranking score with its system everywhere ("weighted-grade@v2 score", "simple points").
- Rejected: storing the explanations in a column. It needs a backfill script on the hosted database, and a request-time call over one page of rows is fast (two queries).

**D49. The stories table uses TanStack Table and TanStack Virtual.** The same libraries and major versions as longtale-core's `packages/ui` (`@tanstack/react-table` 8.21.3, `@tanstack/react-virtual` 3.x; 9.x is out but longtale-core pins 8).
- Sort and filter stay on the server, through the field registry (`manualSorting`), so the API, the Ask box and MCP see the same columns. TanStack holds the column definitions, the column groups (Story, Ranking, Sponsor and job, Evidence, Runnable), the visibility and the pinning.
- Smooth scrolling over every row: the virtualizer renders only the visible rows (about 35) and loads them in chunks of 200 from `GET /api/stories` as you scroll. Pages of 50 rows with Previous and Next are gone.
- Story id and headline (and the select box) are pinned on the left with `position: sticky`.
- The **Scoring system** selector adds one column group per system (D48): each cell shows the score above the raw input, with a "differs" or "not stored" badge. The rows then load with `explain=1`. "Only stories it ranked" adds the `ranking_system` filter, because the ranking score means something else in each system (a weighted score, or the simple points).
- Column visibility is saved per browser (`story-workbench:visibility-v2`); the older column list is not read.
- Rejected: loading all 15,051 rows at once (several MB with the scoring explanations) and TanStack's client-side sorting (it would bypass the field registry).
