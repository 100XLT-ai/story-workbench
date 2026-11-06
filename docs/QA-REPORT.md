# QA report: self-check (build session)

Date: 2026-11-06. Checked by the build session, not by an independent reviewer.

**Where.** Every test below ran on the **live** app,
`https://story-workbench-longtale-hq.vercel.app` (Vercel production, Neon
Postgres, Vercel Workflow), unless the row says otherwise. The first pass on
2026-11-05 ran on the local app (`http://localhost:3100`). Its evidence is in
the git history of this file (commit 1594ced).

Live runs made by this check: 1 to 10 (author "QA live" or "mcp-smoke").
Live versions made by this check: 3.1 (mcp-smoke), 3.2, 3.3, 3.4, 3.5 (QA live).

| AC | Result | Evidence (live unless marked) |
|---|---|---|
| AC-01 | pass | `/api/stories` total 15,051; `winner eq true` → 283; `story_headline not_null` → 1,144. All equal `data/expected-counts.json`. |
| AC-02 | pass | `rank in [3,5] and quote_count lte 1` → 458 = `rank_3_or_5_and_quote_count_lte_1`. |
| AC-03 | pass | `/api/stories/15157`: pages 32106, 32145, 32104, 32127 with facts 5/5/5/5 and quotes 5/2/1/5; 2 images. The same as the local check against `longtale_dv2`. |
| AC-04 | pass | Story 1918, runs 3, 5 and 8: the `label` messages have the same SHA-256 (a7c9a442…), and the `writer_input` output too (8f9ce8c7…). Local runs gave the same label SHA. |
| AC-05 | pass | `/api/versions`: Production writer 1.0 (30 steps), Staged writer 3.0 (39), One-call writer 3.0 (38). |
| AC-06 | pass (CI) | `pnpm test`: 12 of 12 fidelity tests. CI passes on GitHub Actions. |
| AC-06b | pass, with D26 | Run 1 (Staged 3.0, story 14807): article "Spokane families get school and culture aid" (261 words), 4 posts, ad copy. `social_data`: "Social posts use the title … and this run's article". The ad steps read the story summary, as production does (D26). |
| AC-07 | pass | Run 1: 39 traces, each with a body (prompt for model steps, input, output, tokens, cost). |
| AC-08 | pass | `/flow/1`: one card per step with the Decided line, connectors and readable views (screenshot checked). |
| AC-09 | pass | Run 2 (Production 1.0, story 14807): `statistics` "skipped: needs story.impactValueRaw is empty (value: 30000)"; `headline_shorten` "skipped: needs title_check.over_limit is true (value: false)"; `short_title` and `social_facebook_retry` skipped with reasons. |
| AC-10 | pass | Run 4: 50 stories, all 50 in the table. 27 done, 23 failed, each "writer output has no article body". The run ended with no browser open. Note: this run took the 50 winners with the **fewest** facts (a wrong sort parameter in the test call), so the refusals are expected (see Findings). |
| AC-11 | pass | Run 8 (version 3.2, the `write` step on Opus 4.6 with reasoning high, story 1918): the `write` call took **140.6 s** and completed. Each model call is its own workflow step on Vercel. |
| AC-12 | pass | The run dialog shows the estimate before the start ($0.19 for 3 stories). Run 4: estimate $14.70, real $2.18. The estimate is high on purpose: it counts every conditional step as if it runs, and 23 stories failed before the social and ad steps. |
| AC-13 | pass | Run 1: `results?format=csv`, `md`, `json`: 200, each with `Content-Disposition: attachment; filename="run-1.<ext>"`. |
| AC-14 | pass | Browser, name "QA live": editor → `write` temperature 0.7 → 0.5 → save dialog shows only `write · temperature` → saved "Staged writer 3.4 (QA live)", parent 3.0, note "Cooler writer: temperature 0.5". The stored value is the number 0.5. |
| AC-15 | pass | Browser: comment "Headlines must be 8 words or fewer" on 3.0 → the prompt editor (Opus 4.6) changed "6 to 10 words" to "8 words or fewer" in the `write` system prompt, with a reason → "Save as a new version" → "Staged writer 3.3 (QA live)", note = the comment. |
| AC-16 | pass | `POST /api/versions` with `{{nope}}` → 422 "step 12 "write": the token {{nope}} in the user prompt is unknown." |
| AC-17 | pass | Version 3.5 inserts "Extra social post" after `fit_title` (reads `article`, writes `social_post`). Run 10: the step wrote a 262-character post; the run page shows it as "POST"; the CSV has a `social_post` column (added in 084dd17). |
| AC-18 | pass | `/compare?a=3&b=61` (3.0 vs 3.2, story 1918): "Only steps that differ (26 of 39)", changed words red and green. |
| AC-19 | pass | `/api/versions/7/export` → `Staged-writer-3.4-QA-live.json` as an attachment. The version page has View as JSON and Download JSON. |
| AC-20 | pass | 19 GET endpoints answer 200 with no login. The live `/api/openapi.json` passes `swagger-cli validate`. |
| AC-21 | pass, with one limit | `claude mcp add --transport http story-workbench-live https://story-workbench-longtale-hq.vercel.app/mcp` → `claude mcp list`: "✓ Connected". The tool calls ran through `scripts/mcp-smoke.ts ac21` against the live `/mcp`: 16 tools, `query_stories` (total 122), `start_run` (run 5), `get_run` until done, `get_trace` (39 steps). Limit: Claude Code does not start inside the build session (D41), so no person typed the request into Claude Code. |
| AC-22 | pass | `scripts/mcp-smoke.ts ac22` on live: `create_version` "Staged writer 3.1 (mcp-smoke)" (1 changed field), child run 6 and parent run 7 on 3 stories, `compare_traces` lists the steps that differ. |
| AC-23 | pass | `initialize` (server story-workbench), `tools/list` (16), `resources/read workbench://guide` over plain HTTP with no login; `/.well-known/oauth-protected-resource` → 404. |
| AC-24 | pass | No page, route or MCP tool checks a login or a token. |
| AC-25 | pass | The key and its first 12 characters: 0 hits in 1.8 MB of live pages, API replies (settings, health, runs, the JSON export) and JS bundles; 0 hits in the live runtime logs (Hobby keeps 30 minutes); 0 in tracked files, git history and `.next` (first pass). |
| AC-26 | pass | The runtime talks only to its own Postgres (Neon), OpenRouter and OpenRouter's model list. |
| AC-27 | pass | `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/TEAM-GUIDE.md`, `docs/SPEC.md`. |
| AC-28 | pass | GitHub Actions: type-check, lint, unit tests and the fidelity test pass. |
| AC-29 | pass (by the builder) | Live tour: name → Winners → Runnable by v3 → quote_count ≤ 1 → "122 stories match" → Facts header (desc) → 3 rows → Run with… → Staged 3.0, estimate $0.19 → run 9. A first-time reader must still time it. |
| AC-30 | pass | At 1280 × 800, `scrollWidth == clientWidth` on /stories, /stories/15157, /workflows, /versions/2, /versions/2/edit, /runs, /runs/1, /runs/4, /flow/1, /compare, /settings, /connect. |
| AC-31 | pass | Ask "rank 3 or 5, no quotes" → filter `rank in [3,5]`, `quote_count eq 0`, count 403; the API with the same filter → 403. |

## Findings

1. **Writer refusals on thin stories (expected).** In run 4, 23 of 50 stories
   failed at `parse`. The trace of story 1927 shows 0 facts in the ledger. The
   select and write models return empty plans, and the writer's
   `short_reason` says why ("…contains no facts…"). Since 084dd17 the error
   in the run table adds that reason.
2. **Label call cut at the token limit (production rule).** Run 9, story 3399
   (13 facts, plus 2 re-crawled pages): `label_recrawl` had 204 facts to label.
   The reply was cut at 8,192 tokens, retried once at 16,384 (the ported
   production recovery rule), and was cut again. The story failed with
   "output truncated (finish_reason=length)". A version with a larger
   `maxTokens` on that step avoids it.
3. **Fixed in 084dd17.** `POST /api/versions/preview` without `parent_id`
   answered 500; it now answers 400.

## Model spend

- This live check: $3.29 in runs (Settings → Model spend), plus one
  prompt-editor call and one Ask call that the figure does not count (about
  $0.30, estimated).
- First pass (local): about $2.89, plus about $1.10 to record the goldens.
- Total: about $7.60.
