# QA report: self-check (build session)

Date: 2026-11-05. Checked by the build session, not by an independent reviewer.

**Where.** The hosted database does not exist yet (the Neon terms need a
person; see `docs/STATUS.md`). So every test below ran on the **local** app
(`http://localhost:3100`, `next dev`, local Postgres with the same import, the
real OpenRouter key, Vercel Workflow's local world). The live URL builds and
deploys, but answers 503 "database not connected" until the database exists.
After the database step, the tests marked "repeat live" must run again on
`https://story-workbench-longtale-hq.vercel.app`.

| AC | Result (local) | Evidence |
|---|---|---|
| AC-01 | pass | `GET /api/stories?limit=1` total 15,051; filter `winner eq true` → 283; `story_headline not_null` → 1,144; all equal `data/expected-counts.json`. |
| AC-02 | pass | `rank in [3,5] and quote_count lte 1` → 458 = `expected-counts.json` `rank_3_or_5_and_quote_count_lte_1`. The counts come from longtale-core's own `buildFactLedger` (D9). |
| AC-03 | pass | `/stories/15157` (job 1104 winner): pages 32106, 32145, 32104, 32127 with facts 5/5/5/5, quotes 5/2/1/5, impacts 7/3/12/8, dates 2026-10-15, 2024-07-17, 2024-06-06, 2023-10-09, 2 images; the same as a SELECT on `longtale_dv2`. |
| AC-04 | pass | Story 1918, Staged 3.0, runs 2 and 9: the `label` messages have the same SHA-256 (a7c9a442…). Unit test "code steps are deterministic". |
| AC-05 | pass | `/workflows`: Production writer 1.0 (30 steps), Staged writer 3.0 (39), One-call writer 3.0 (38); each ends with Facebook, Instagram, LinkedIn and X steps, then the ad copy steps. |
| AC-06 | pass | `pnpm test`: 12 of 12 fidelity tests (3 seeds × jobs 1104, 1100, 1107, 1099), messages and settings equal to longtale-core's builders. |
| AC-06b | pass, with D26 | Run 1 (Staged 3.0, story 14807): article "STCU Gives School Supplies at Unity Event" (334 words), 4 posts, ad "STCU Sponsors 32nd Annual Unity in the Community" / subheadline / CTA "Support Local Events". The social steps read `article ← #17` (the run's own article) in the flow. The ad steps read the story summary, as production does (D26). |
| AC-07 | pass | Run 1: 39 traces, each with prompt (model steps), input, output, tokens and cost. |
| AC-08 | pass | `/flow/1`: one card per step, connectors named by context values, readable views for story type, selection, plan (paragraph by paragraph with claim texts), article, checks, posts and ad. |
| AC-09 | pass | Run 5 (Production 1.0, story 14807): `statistics` "skipped: needs story.impactValueRaw is empty (value: 30000)"; `headline_shorten` "skipped: needs title_check.over_limit is true (value: false)". Job 1099 golden shows `statistics` running. |
| AC-10 | pass | Run 7: 50 stories, all 50 in the table; 23 done; 27 failed, each "parse: writer output has no article body" (the writer refuses stories with no usable facts, as production would). The run went on with no browser open. |
| AC-11 | pass (local); repeat live | Run 2, story 1918: the `write` call took 126.4 s and completed. Run 3 (job 1099 story, `write` effort high, 16384) took 22.7 s. On Vercel each model call is its own workflow step (max duration 300 s on Hobby). |
| AC-12 | pass | The run dialog shows the estimate before the start; run page shows real cost per story and per run (run 7: estimate $7.25, real $2.26). |
| AC-13 | pass | Run 1: `results?format=csv` (5 KB), `md` (5 KB), `json` (1.4 MB, every trace), each with `Content-Disposition: attachment`. |
| AC-14 | pass | Browser, name "Noah": edit of `write` → save dialog with diff → "Staged writer 3.1 (Noah)", parent 3.0, note "Shorter headlines: 10 words or fewer". 3.0 unchanged (versions are immutable rows). |
| AC-15 | pass | Comment "Headlines must be 8 words or fewer" on 3.0 → proposal changed the `write` system prompt ("6 to 10 words" → "8 words or fewer") with a reason → saved as "Staged writer 3.3 (Noah)" with the comment as note (3.2 was taken by the AC-11 test version locally). |
| AC-16 | pass | `POST /api/versions` with `{{nope}}` → 422 "the token {{nope}} in the user prompt is unknown". The editor marks the token red. |
| AC-17 | pass | Version 3.4 adds "Extra social post" after "Final article" (reads `article`, writes `social_post`); run 4 shows it in the flow and in the results table. |
| AC-18 | pass | `/compare?a=1&b=6` (3.0 vs 3.1, story 14807): 23 of 39 steps differ, changed words marked red and green. |
| AC-19 | pass | `/versions/4`: View as JSON; Download JSON → `Staged-writer-3.1-Noah.json`. |
| AC-20 | pass | 19 endpoints answer 200 with no login; `/api/openapi.json` passes `swagger-cli validate`. |
| AC-21 | partial (local) | `claude mcp add --transport http story-workbench http://localhost:3100/mcp` → `claude mcp list`: ✓ Connected. Claude Code cannot run tools inside the build session (it refuses nested sessions, D41), so `scripts/mcp-smoke.ts ac21` ran the same calls: 16 tools, `query_stories` (total 122), `start_run` (run 2), `get_run` until done, `get_trace` (39 steps). The QA session should repeat it in Claude Code. |
| AC-22 | pass (local) | `scripts/mcp-smoke.ts ac22`: `create_version` "Staged writer 3.5 (mcp-smoke)" (1 changed field), runs 8 and 9 on 3 stories, `compare_traces` lists the steps that differ. |
| AC-23 | pass (local); repeat live | `initialize` and `tools/list` over plain HTTP with no header but `Accept`; `/.well-known/oauth-protected-resource` → 404 (not 401). |
| AC-24 | pass | No page, route or MCP tool checks a login or a token; there is no middleware. |
| AC-25 | pass (repo, build); repeat live logs | The key value and its prefix: 0 hits in tracked files, 0 in git history, 0 in `.next`. |
| AC-26 | pass | The runtime talks only to its own Postgres, OpenRouter and OpenRouter's model list. No longtale-core host or database string is in `src/`. |
| AC-27 | pass | `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/TEAM-GUIDE.md`, `docs/SPEC.md`. |
| AC-28 | pending | The first CI runs failed on `LayoutProps` (generated types); fixed with `next typegen` in `pnpm typecheck`. See the latest run on GitHub Actions. |
| AC-29 | pass (local, by the builder) | The tour clicks work: Winners, Runnable by v3, quote_count ≤ 1 → 122; Facts header; 3 rows; Run with…; Staged 3.0; flow. A first-time reader must still time it (QA). |
| AC-30 | pass | At 1280 × 800, `scrollWidth == clientWidth` on /stories, /stories/15157, /workflows, /versions/2, /versions/2/edit, /runs, /runs/7, /flow/1, /compare, /settings, /connect. The table pages 50 rows at a time. |
| AC-31 | pass | Ask "rank 3 or 5, no quotes" → chips `rank in [3,5]`, `quote_count eq 0`, count 403; the API with the same filter → 403. |

Model spend in these checks: about $2.89 (app runs and prompt-editor calls) plus about $1.10 to record the goldens.
