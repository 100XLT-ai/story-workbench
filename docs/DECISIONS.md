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

**D11. Runnable rules.** `runnable_production` = the candidate has a description and the job has a sponsor name. `armAPayload` builds `InitiativeDetails` from the description; without it the article has no subject. `runnable_v3` = at least one page (linked pages, else `source_page_extract_id`), as the harness loads them. 202 winners are runnable by v3 (139 + 63), as the spec says.

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
