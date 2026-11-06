# Story Workbench: specification

Version: 1.0. Date: 2026-11-04. Owner: the 100XLT team (anyone on it).
Status: approved for build. This file is the single source of truth for the
build session and the QA session.

---

## 0. Purpose

Longtale's discovery crawl finds a sponsor's cause stories, ranks them and gives
each one an angle. A writer then turns a ranked story into content. Today the
team cannot see what the writer does between "ranked story" and "finished
article".

Story Workbench is a standalone web app, an API and an MCP server. It:

1. shows every ranked story from a fixed database, in one table that people filter;
2. runs a writer workflow on one story or on many stories. A workflow makes three outputs:
   - **the article:** title, subtitle and content;
   - **the social posts:** each full post;
   - **the ad copy:** headline, subheadline and CTA (call to action);
3. shows each step of the workflow: its prompt, its exact input, its output, and what the step decided, in a flow from top to bottom;
4. lets anyone change any prompt, model or step, and saves each change as a named, numbered version ("Staged writer 3.1 (Noah)").

### Principles

| # | Principle | Effect |
|---|---|---|
| P1 | **Show, do not judge.** | No judge, no score, no "best version". The app shows outputs. People decide. |
| P2 | **The inputs are fixed.** | The data is a one-time copy of `longtale_dv2`. It never changes. A run on the same story always gets the same inputs. |
| P3 | **Everything is open.** | No real security. Anyone can read, run, edit and connect. Nothing in the app is secret except the OpenRouter key, which stays on the server. |
| P4 | **The team owns it.** | A team repo. Every prompt, model, step and setting can be changed in the app, through the API or MCP, or in the code. Nobody needs Alan. |
| P5 | **Today's writers first, exactly.** | The first versions reproduce today's prompts byte for byte, so the team starts from the truth. |
| P6 | **Nothing goes back to production.** | The app never writes to longtale-core or its databases. It has no export path to production. A person copies a winning prompt by hand. |
| P7 | **It just works.** | No login, no token, no rate limit, no spending limit in the app. If a platform limit stops it, the app says so clearly. |

---

## 1. Users and access

- **Users:** anyone at 100XLT (editors, account leads, engineers) and their own Claude (Claude Code, Claude Desktop, claude.ai).
- **No login anywhere.** The web app, the API and the MCP server are open. CORS is open to all origins. No token is needed. (The owner's decision: "Don't put any authentication, security, anything on it.")
- **Names:** on first visit the app asks "Your name?" and keeps it in the browser. Every version, comment and run stores the author name. The API and MCP take an `author` field (default `"api"`).
- **Spending:** the app uses one OpenRouter key on the server (P3). No limits in the app. Each run shows its estimated cost before it starts and its real cost after it ends.

---

## 2. Data

### 2.1 Source and copy

- **Source:** the local Postgres database `longtale_dv2` at `postgresql://postgres:postgres@127.0.0.1:5432/longtale_dv2`. Read with SELECT only.
- **Copy:** an import script in the repo (`scripts/import-snapshot.ts`) reads the source once and writes the app's own tables in the hosted database. It runs from the builder's computer. It is safe to run again: it replaces the snapshot tables whole and **never touches versions, runs or traces**.
- **Seeds:** a separate script (`scripts/seed-versions.ts`) creates the seed versions only when they do not exist.
- **Size:** about 220 MB in the source. The app needs about 90 MB (page extracts, candidates, links, images). Verified 2026-11-04.

### 2.2 What a story is

A **story** is one ranked cause candidate (`discovery_cause_candidates` row with `rank` not null, `deleted_at` null). There are 15,051 ranked candidates in 308 jobs over 69 sponsor domains. 1,144 of them (the top 5 of each job) have a story headline and an angle, and 283 are winners (`winner_flag`). Verified 2026-11-04.

A story is **runnable** by a workflow when it has the inputs that workflow reads:
- **Production:** the fields that `armAPayload` reads (description, beneficiary, evidence quote, impact, organization). It does not read the story headline or the angle. Compute "runnable" from the fields that the payload cannot do without, and record the rule.
- **v3:** the story's own fact ledger is not empty (`fact_count + impact_count + quote_count > 0`), over its pages from `discovery_candidate_pages` **or** the candidate's `source_page_extract_id` (the harness falls back to it). The v3 writer reads only the ledger, never the raw page text (DECISIONS D42). Verified 2026-11-05: 139 of 283 winners have linked pages, 63 more have only `source_page_extract_id`, and 81 have no page. Of the 202 with a page, 177 have a ledger that is not empty; 15 have only a page that was never scraped, and 10 have a scraped page with nothing extracted.

The table shows every ranked story. Filters "runnable by Production" and "runnable by v3" hide the others, and the team guide uses them.

**The angle.** Discovery's `story_angle` is an input no seed reads today. The story page and the flow view show it, marked "not read by this version" when the version does not use it. A person can add it to a prompt with a token.

**"Top ranked".** 308 stories have rank 1, but only 283 are winners, because 25 jobs have no winner. The table shows both `rank` and `winner`.

### 2.3 App tables (minimum)

| Table | Content |
|---|---|
| `jobs` | job id, sponsor domain, organization (sponsor) name, market (publisher) name, run date (`created_at`), status |
| `stories` | candidate id, job id, rank, weighted score, score components (JSON), winner flag, story headline, story angle, description, every other candidate column as raw JSON, and the derived columns below |
| `pages` | page extract id, job id, source URL, title, page type, published date, text published date, extractor version, facts (array), quotes (array), cause signal (JSON), scraped markdown |
| `story_pages` | candidate id, page extract id, role |
| `images` | image id, page extract id, URL, usable, confidence, classification (JSON), classifier version |
| `story_images` | candidate id, image id, rank |

Keep the source IDs. Add nothing that the source does not hold, except the derived columns.

### 2.4 Derived columns (computed by the import, fixed)

Sponsor name, publisher name, run date, page count, text page count (pages whose scraped text is not empty), fact count, quote count (quotes over the story's pages, after longtale-core's `dedupePages` and quote de-duplication), impact count, usable image count, newest page date, oldest page date, extractor versions, `has_angle`, `runnable_production`, `runnable_v3`.

**Ranking as columns** (so people see "how it was ranked" and can filter on it): `rank`, `winner`, `weighted_score`, `total`, every `tier_*` field (`tier_impact`, `tier_recency`, `tier_reach`, `tier_evidence`, `tier_attribution`, `tier_market`, `tier_image`, as the source holds them), `tiebreak_reasoning`, `deal_grade`, `confidence`, and the score components (also one generated column per part: `score_attribution`, `score_evidence_completeness`, `score_beneficiary_interest`, `score_amount`, `score_recency`, `score_attendance`; DECISIONS D43). Use the columns that exist in the source; record any that do not.

**Expected counts.** The import writes the count of every derived column (for example, how many stories have `quote_count` 0, 1, 2…) to `data/expected-counts.json` in the repo, computed from the source with longtale-core's own functions. AC-01 and AC-02 compare the app with this file.

### 2.5 Sponsor settings for the writer

- Sponsor name = the organization name of the job.
- Publisher = the masthead the writer uses. The database's market names are not mastheads ("WEHCO", "Spokesman Review"); the harness uses "Arkansas Democrat-Gazette" and "The Spokesman-Review". Keep a market-to-masthead map in `data/mastheads.json`: take the harness's `publisher` values for the markets it covers, and the market name for the rest (Howard County, WBEZ, Star Tribune and any other). The team edits this file.
- Aliases and program names: from the `STORIES` and `RUN2_STORIES` lists in longtale-core `apps/api/scripts/story-writer-test/harness.lib.ts`, matched by domain. Else empty.
- Generation date of a story = its job's run date. A run can override it.

These are inputs. They are fixed per story, and they are shown on the story page.

---

## 3. Workflows, steps and context

### 3.1 The model

- A **workflow family** is a named writer, for example "Staged writer".
- A **version** is one complete, frozen workflow: an ordered list of steps plus settings.
- A **step** has: `id`, `name`, `kind` (`prompt` or `code`), `inputs` (names of context values it reads), `outputs` (names it writes), an optional `when` condition, and kind-specific fields.
  - `prompt` step: system template, user template, model, temperature, max tokens, reasoning (`null`, a level, or `{effort}`), output format (`json` or `text`), and the output name.
  - `code` step: the name of a function from the code registry (§3.3), plus optional JSON parameters.
- The **context** is a bag of named values. It starts with the story inputs (§2) and the run settings. Each step reads its inputs from the context and writes its outputs into it.
- **Templates** use `{{name}}` and `{{name.path}}` tokens that read context values. A value that is not text needs a filter: `{{name|json}}` (compact, as `JSON.stringify(v)`), `{{name|json1}}` (indent 1), `{{name|json2}}` (indent 2). Production sends compact JSON (`Generate story:\n${JSON.stringify(payload)}`), and the staged writer gets the selection with indent 1, so the seeds need these exact forms. A code step may also produce the exact string. A token that no earlier step (or the story inputs) declares stops the save, with a clear message.
- **Lineage:** because each step declares its inputs and outputs, the app knows which output feeds which step. The flow view (§6.4) draws these links.

### 3.2 Seed versions (made by the import, frozen)

Each seed reproduces today's code byte for byte (P5). The source is the longtale-core worktree at `C:\dev\a-empath-ai\longtale-core\.claude\worktrees\beautiful-lumiere-d74efc` (branch `claude/story-v3-writer-try`).

Each seed is one complete workflow with three parts, in this order: the **article** steps, then the **social** steps, then the **ad copy** steps. The social and ad steps read the article that the article steps made, and any other value that production reads (see "Social and ad steps" below).

| Family | Seed | Steps (in order) | Source |
|---|---|---|---|
| Production writer | 1.0 | `payload` (code: the 13 production fields from the candidate) → `statistics` (prompt, only when the impact value is empty) → `article` (prompt: `long-article-generation-prompt.md`) → `split` (code: headline, subhead, body from the markdown) → `headline_shorten` (prompt, only when the headline is over 45 characters) | `harness.lib.ts` `armAPayload`, `splitMarkdown`; `src/common/prompts/long-article-generation-prompt.md`; `openrouter.service.ts` `generateStatistics`; `story.service.ts` prompt `generation.articleTitle` |
| Staged writer | 3.0 | `ledger` (code: fact ledger with de-duplication) → `label` (prompt: claim labeller) → `apply_labels` (code) → `story_type` (code: focus, time, sponsor role, mechanisms) → `writer_input` (code) → `modules` (code: the story-type modules text) → `select` (prompt: selection, Prompt 1) → `write` (prompt: staged writer, Prompt 2) → `parse` (code) → `checks` (code: the code checks) | `src/api/modules/story-writer/` (ledger, writer, checks); `harness.lib.ts` `buildSelectionMessages`, `ledgerInputFor` |
| One-call writer | 3.0 | as Staged, without `select`; `write` uses the one-call prompt | as above |

**Social and ad steps (the same in all three seeds, after the article steps):**

| Part | Steps | Source in longtale-core (find the live code path; record it in `docs/DECISIONS.md`) |
|---|---|---|
| Social posts | One prompt step per platform that production supports: Facebook (live in auto-fire), Instagram, LinkedIn, X. Each makes the full post text (and the hashtags, if production makes them). | `apps/api/src/api/modules/organic-social/` (`organic-social.service.ts`, `organic-social.prompt.helper.ts`, `ap-style-rules.ts`, `facebook-text-rules.ts`) and `apps/api/src/common/prompts/organic-social/`, `platforms/`, `base/`, `style/` |
| Ad copy | The display ad copy step: headline, subheadline (the body line) and CTA. | `apps/api/src/api/modules/story/ad-copy/` and `story/ad-style/angle-to-inputs.ts` (`buildAngleToInputsPrompt`), `copy-generation-defaults.ts` |

Rules for porting them:
- Port the prompt builders as code steps that render the messages, then a prompt step that sends them. Production's text must come out byte for byte (P5).
- Trace every value these prompts read to its source. A value that a production step makes (for example a story summary) becomes a step in the seed. A value that comes from the database (for example the brand profile: mission, handles, colors, industry tags) is added to the snapshot (§2.3), for the story's organization.
- The social and ad steps read the article from the workflow's own article steps, not from production's stored article. So a change to the article shows in the posts and the ads.
- Drop image prompts and image generation (§9). Keep only the text.
- `rules/social-organic.md` and `rules/paid-ads.md` in `.plan/story-v3/` list these prompts with their file lines. Use them as a map.

Models in the seeds are today's: `google/gemini-3-flash-preview` for the writers, `google/gemini-2.5-flash` for labels, and the production default for statistics and the headline call. Reasoning levels are today's: write medium, select high, label none.

**Fidelity test (required):** an export script in longtale-core renders the messages of every prompt step (article, social and ad steps) for 3 fixture stories (job 1104 winner, job 1100 winner, job 1107 winner) with longtale-core's own builders. The app renders the same steps from its seed versions. The texts must be equal. This test runs in CI.

### 3.3 Code registry

Port the pure TypeScript from longtale-core into the app as plain modules (no NestJS): the ledger (`fact-ledger`, `figures`, `quote-speaker`, `source-span`, `text-utils`, `ledger.types`), the writer helpers (`claim-labeller` parse, `story-type`, `writer-input`, `writer-modules`, `writer-output`, `writer-prompt`), `code-checks`, and the harness helpers listed above. Replace the `@/api/modules/openrouter` types with the app's own types. Keep the logic the same; the fidelity test proves it.

Each registry function has a name, a description, its input and output names, and a JSON-schema of its parameters. The editor lists them, so a person can add a code step to a version.

### 3.4 What people can change in a new version

- any prompt text, model, temperature, max tokens, reasoning, output format, `when` condition;
- add, remove, reorder and rename steps (prompt steps freely; code steps from the registry);
- add steps after the article, for example a social-post prompt that reads `article`.

A new code function needs a change to the repo (P4: the team owns it).

---

## 4. Versions

- A version never changes after it is saved. A change makes a new version.
- Fields: id, family, number, author, parent version, note (why), created date, steps, settings.
- **Numbers:** the seed is `1.0` (Production) or `3.0` (Staged, One-call). Each new version in a family takes the next free minor number: `3.1`, `3.2`, … The label is `<family> <number> (<author>)`, for example "Staged writer 3.1 (Noah)". The parent is shown, so branches are clear.
- A person can copy any version into a new family (new name, number `1.0`).
- **Three ways to make a version:**
  1. **Direct edit** in the editor. Save shows a side-by-side diff of every changed field, then asks for a note.
  2. **Comment.** The person picks a version, optionally one step, and writes a comment ("make the headlines shorter", "never use the sponsor's mission statement"). A model (the "prompt editor", §4.1) returns the changed prompt text(s) and a one-paragraph reason. The app shows the diff. The person saves it, edits it first, or drops it.
  3. **API or MCP:** create a version from a full JSON definition, or from a parent plus a list of step changes, or ask the prompt editor through `propose_edit`.
- **View as JSON:** each version's full definition shows as JSON and downloads as one file. There is no other export (P6).

### 4.1 The prompt editor

- A prompt step that the app owns. Its system prompt, model (default `anthropic/claude-opus-4.6`) and settings are editable on the Settings page. Each change of it is stored with author and date.
- Input: the whole version (all steps), the target step (or all), the comment, and, if the person chose one, a trace (§5.3) that shows the problem.
- Output JSON: `{ "changes": [ { "step_id", "field", "new_value" } ], "reason": "" }`. It changes prompt fields only, unless the comment asks for a model or a step change.

---

## 5. Runs

### 5.1 Starting a run

- Pick a version and one or more stories (from the table, a saved filter, or "the current filter"). Optional overrides: generation date, the sponsor settings.
- Before it starts, the app shows: the number of stories, the steps, and an estimated cost (from the model prices that OpenRouter's public model list gives, and the input size).
- A run can hold 1 to 500 stories.

### 5.2 Execution

- Runs execute on the server, in the background. Closing the browser does not stop a run.
- Each story runs on its own. One story's failure does not stop the others.
- Each model call is its own unit of work, so a long call (60 s or more) never hits a request time limit. Use the platform's durable workflow or queue feature (Vercel Workflow is the recommendation).
- At most 8 stories run at the same time (a setting).
- A failed model call retries once (for bad JSON or a 5xx). Then the step fails with its error, and the story stops at that step.
- A person can cancel a run.

### 5.3 Traces

For each story and each step, store: step id and name, kind, start and end time, status, the rendered system and user messages (prompt steps), the model and settings sent, the raw response, the parsed output, the tokens in, out and reasoning, the cost (from OpenRouter's `usage`), and the error if any. For code steps store the input and output values.

A trace is never deleted by the app.

### 5.4 Results

- The run page shows a table: one row per story, with status, the article title, subtitle and word count, each social post (short, with full text on open), the ad headline, subheadline and CTA, the check flags (when the version has a `checks` step), cost and time. It updates while the run works.
- Each row opens the story's flow (§6.4).
- Download the results as CSV, as Markdown (one section per story, in the layout of `.plan/story-v3/story-writer-arms-gemini-stories.md` in longtale-core), and as JSON (all traces).

---

## 6. Web app

| # | Page | What it does |
|---|---|---|
| 6.1 | **Stories** | A table of every ranked story with the columns in §2.3 and §2.4. Sort and filter on every column (numbers by range, text by contains, flags by yes/no). Save a filter with a name. Select rows and "Run with…". A count of the matching stories. |
| 6.2 | **Story** | The fixed inputs of one story: the sponsor settings, the brand profile fields that the social and ad steps read, the candidate fields and scores, every linked page with its facts, quotes, impacts, dates and text, and the images. Also every run of this story, by version. |
| 6.3 | **Workflows and versions** | The families, their versions as a tree (parent and child), each version's author, note and date. Open a version in the editor. Compare any two versions as a diff. |
| 6.4 | **Flow (one story, one run)** | The heart of the app. A top-to-bottom flow of step cards. Each card shows: the step name and kind, model and cost, a short "what this step decided" line, and tabs for **Prompt** (rendered messages), **Input** (the context values it read), **Output** (parsed, with a raw tab). Lines between cards show which output names feed which step, with the name on the line. Known outputs get a readable view: the story type (focus, time, role, mechanisms, in words: "multi-year", "an event"), the selection (angle, chosen facts and quotes, the facts left out and why), the plan (paragraph by paragraph, with claim IDs), the article (headline, subhead, body, CTA, with each claim span marked), the checks (each flag), each social post (as it would look on its platform, with its character count), and the ad copy (headline, subheadline, CTA, with lengths). Other outputs show as formatted JSON. |
| 6.5 | **Compare** | The same story, two runs (for example version 3.0 and 3.1) side by side, step by step. Changed text is marked. |
| 6.6 | **Editor** | Edit a version's steps: the prompt texts (a code editor with `{{token}}` highlight and a token list from the context), models (a search box over OpenRouter's model list), settings, `when`, and the step order. Add a prompt step or a code step. A "Comment" box asks the prompt editor (§4.1). Save shows the diff and asks for a note. |
| 6.7 | **Runs** | Every run: version, author, story count, status, cost, date. Open a run's results table. |
| 6.8 | **Settings** | The prompt editor's prompt and model, the run concurrency, the default models list. |
| 6.9 | **Connect** | The API base URL, a link to the OpenAPI document, and the copy-ready MCP setup for Claude Code, Claude Desktop and claude.ai, with a short "what you can ask Claude" list. |

The flow view must read well for a person who has never seen the writer: short plain labels, the step's purpose in one sentence on each card.

---

## 7. API and MCP

### 7.1 REST API (open)

`/api/stories` (GET with filter, sort and paging), `/api/stories/:id`, `/api/families`, `/api/versions` (GET, POST), `/api/versions/:id`, `/api/versions/:id/export`, `/api/propose-edit` (POST), `/api/runs` (GET, POST), `/api/runs/:id`, `/api/runs/:id/results`, `/api/runs/:id/cancel`, `/api/traces/:runId/:storyId`, `/api/registry` (code functions), `/api/models`. An OpenAPI 3 document at `/api/openapi.json`.

**Filter format** (shared by the API, MCP and saved filters): a list of `{ field, op, value }` with ops `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `in`, `contains`, `is_null`, `not_null`, all joined by AND. Example: rank in [3, 5] and quote_count lte 1.

### 7.2 MCP server (open)

- Streamable HTTP at `/mcp`. No login, so claude.ai custom connectors, Claude Desktop and Claude Code connect with the URL alone.
- Tools: `list_story_fields`, `query_stories` (filter, sort, limit), `get_story`, `list_families`, `list_versions`, `get_version`, `create_version` (full or as changes to a parent), `propose_edit` (comment → proposed changes), `estimate_run`, `start_run`, `get_run`, `get_trace` (one story, one step or all), `compare_traces`, `export_run`, `list_registry`.
- Each tool has a clear description and a JSON schema, so a model can use it without the docs.
- A resource `workbench://guide` holds the team guide text.

---

## 8. Architecture and hosting

```mermaid
flowchart LR
  SRC[("longtale_dv2<br/>local, read only")] -- "import script, once" --> DB[("Hosted Postgres<br/>snapshot + versions + runs + traces")]
  subgraph APP["Vercel project: story-workbench"]
    UI["Next.js web app<br/>open, no login"]
    API["/api REST, open"]
    MCP["/mcp MCP server, open"]
    WF["Background runs<br/>one unit per model call"]
  end
  UI & API & MCP --> DB
  API & MCP --> WF
  UI --> API
  WF --> DB
  WF -- "chat completions" --> OR["OpenRouter"]
  CC["Claude Code / Desktop / claude.ai"] --> MCP
```

- **Repo:** `100XLT-ai/story-workbench` on GitHub, **public** (see §10b), team-owned. If the account cannot create a repo in the organization, create it under `alan100xlt` and record it.
- **Stack (recommendation; the build may change it with a reason in `docs/DECISIONS.md`):** Next.js (App Router, TypeScript), a hosted Postgres from the Vercel Marketplace (Neon), Drizzle ORM, Vercel Workflow for runs, the MCP TypeScript SDK (or `mcp-handler`) for `/mcp`, OpenRouter through `fetch`.
- **Hosting:** the Vercel team "Longtale" (`longtale-hq`). The production URL is public (no Vercel deployment protection on production).
- **Secrets:** `OPENROUTER_API_KEY` from `C:\dev\a-empath-ai\longtale-core\apps\api\env.lakshay`, set as a Vercel environment variable. Never committed, never printed, never sent to the browser. `DATABASE_URL` from the database integration.
- **CI:** GitHub Actions: type-check, lint, unit tests, the fidelity test. Vercel deploys `main` to production.

---

## 9. Not in scope

A judge or any automatic score (P1). Logins, tokens, user accounts or roles (P7). Writing to longtale-core or its databases, or any export path to production (P6). A data refresh from newer discovery runs (the data is fixed). Photos, image prompts and image generation. Paid social captions (only the display ad copy: headline, subheadline, CTA).

---

## 10. Acceptance tests

Each test has an ID. The QA session checks each one on the **live** URL and records pass or fail with evidence.

### Data
- **AC-01** The Stories table shows 15,051 ranked stories, and the counts per filter match the source: 1,144 with story fields and 283 winners.
- **AC-02** A filter `rank in [3, 5] and quote_count lte 1` returns stories that all match. The count equals the same query on the source database.
- **AC-03** The story page of the job 1104 winner shows its pages, facts, quotes, impacts, page dates and images, and they match the source rows.
- **AC-04** Two runs of the same story with the same version get the same inputs (the rendered prompts are equal, except values that the version itself changes).

### Seeds and fidelity
- **AC-05** The three families exist with seeds Production 1.0, Staged 3.0 and One-call 3.0, with the article steps in §3.2, then a social step for each of Facebook, Instagram, LinkedIn and X, then the ad copy step.
- **AC-06** The fidelity test passes: every rendered prompt of the seeds (article, social and ad steps) equals longtale-core's output for the 3 fixture stories.
- **AC-06b** One run of Staged 3.0 on the job 1100 winner gives an article (title, subtitle, content), four social posts and one ad copy (headline, subheadline, CTA). The social and ad steps visibly read that run's article in the flow view.

### Runs and flow
- **AC-07** A run of Staged 3.0 on the job 1100 winner finishes. Every step has a trace with prompt, input, output, tokens and cost.
- **AC-08** The flow view of that run shows every step as a card, with the links between steps named by the context values, and readable views for the story type, the selection, the plan, the article and the checks.
- **AC-09** A run of Production 1.0 on the same story finishes, and the `statistics` and `headline_shorten` steps run or skip according to their `when` conditions, with the reason shown.
- **AC-10** A run of 50 stories finishes in the background. Closing the browser does not stop it. The results table shows all 50. Failed stories show their failing step and error.
- **AC-11** A model call that takes over 60 seconds completes without a time-out.
- **AC-12** The cost estimate appears before a run, and the real cost per story and per run appears after it.
- **AC-13** CSV, Markdown and JSON downloads of a run open and hold every story.

### Versions
- **AC-14** A direct edit of the `write` prompt of Staged 3.0, saved by "Noah", creates "Staged writer 3.1 (Noah)" with parent 3.0, a note and a diff. Version 3.0 is unchanged.
- **AC-15** A comment ("Headlines must be 8 words or fewer") on Staged 3.0 returns a proposed change and a reason. Saving it creates 3.2 with the comment as its note.
- **AC-16** A token that does not exist (`{{nope}}`) stops the save with a message that names the token.
- **AC-17** A new prompt step added after `write` (it reads `article` and writes `social_post`) runs and appears in the flow.
- **AC-18** The compare view shows the runs of 3.0 and 3.1 on one story side by side, with changed text marked.
- **AC-19** A version's full definition shows as JSON and downloads as one file.

### API and MCP
- **AC-20** Every endpoint in §7.1 answers without a login, and `/api/openapi.json` is valid OpenAPI 3.
- **AC-21** Claude Code connects with `claude mcp add --transport http story-workbench <url>/mcp`, lists the tools, and runs `query_stories`, `start_run`, `get_run` and `get_trace` to completion.
- **AC-22** Through MCP alone, a client creates a version from a parent plus one prompt change, runs it on 3 stories, and compares a trace with the parent's trace.
- **AC-23** The MCP server works as a claude.ai custom connector with the URL alone (checked by the protocol handshake and tool list over HTTP, if a claude.ai test is not possible).

### Access, safety and ownership
- **AC-24** No page, API call or MCP call asks for a login or a token.
- **AC-25** The OpenRouter key appears in no response, page, log line, commit or file in the repo.
- **AC-26** The app makes no request to any longtale-core service or database at run time.
- **AC-27** The repo has `README.md` (run, deploy, import), `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/TEAM-GUIDE.md` and this spec as `docs/SPEC.md`. A new developer can run it locally from the README.
- **AC-28** CI passes on `main`: type-check, lint, unit tests and the fidelity test.

### Usability
- **AC-29** A person who has never seen the app can, from the Stories page, filter to "winners with no quotes", run Staged 3.0 on 3 of them, and open one flow, in under 5 minutes, with the team guide only. (The QA session follows the guide step by step in a browser.)
- **AC-30** Every page works at 1280 px wide without a horizontal scroll, and the Stories table stays usable with 15,051 rows (paging or virtual rows).

---

## 10b. Review fixes (binding; they win over earlier text)

An independent review on 2026-11-05 found these problems. Each fix below is a requirement.

**Hosting (§8).**
- Vercel Hobby cannot deploy a **private** repo owned by a GitHub organization. Make `100XLT-ai/story-workbench` **public** (the owner said nothing in it is proprietary; no secret goes in the repo). Use Vercel's Git integration, so a push to `main` deploys.
- If the Git integration still fails, deploy from GitHub Actions with `vercel deploy --prebuilt --prod`. Record what you did.
- The owner does not care about plan limits. Record the Hobby limits you meet in `docs/DECISIONS.md` and go on.

**Fidelity (§3.2, AC-06, AC-28).**
- longtale-core source: branch `claude/story-v3-writer-try`, commit `136fa4ac` (pushed). Record the SHA.
- A **golden script in the workbench repo** (`scripts/make-goldens.ts`) runs only on the builder's computer. It imports longtale-core's builders from the local worktree path, reads `longtale_dv2`, and writes golden message files to `test/goldens/`.
- For steps after a model call, it uses **recorded upstream outputs** (saved with the goldens) as fixed inputs, so both sides render from the same values.
- CI compares the app's rendered messages with the committed goldens. CI never needs longtale-core or the database.
- **Fixtures:** the winners of jobs 1104, 1100 and 1107, plus job **1099 or 1106** (null impact value, so the `statistics` step runs). Pin the generation date in each fixture. The harness used `2026-10-28`; the job dates are 2026-10-29.

**Exact seed settings.** Port these exactly, from the code, and cite each one in `docs/DECISIONS.md`:
- **Temperatures:** write 0.7, select 0.3, label 0.
- **Max tokens:** 16384 for write and select, 8192 for label.
- **Word targets:** 425 target, 325 minimum, 600 maximum.
- **Reasoning:** port `llm-reasoning.ts` `resolveReasoningOption` into the registry. The label call sends **no** reasoning field, which is not the same as "none".
- **`statistics`:** the model is the value of `OPENROUTER_DEFAULT_MODEL` in longtale-core's config defaults, with its max tokens (`OPENROUTER_MAX_TOKENS`, or 2000) and `response_format: json_object`. Find the real values.
- **`headline_shorten`:** `GENERATION_MODELS.title` (today `google/gemini-3.5-flash`, reasoning "minimal", 1536 max tokens, temperature 0.3). The 45-character limit is measured after stripping markdown marks. Keep the word-boundary fallback cap. The source is `story.service.ts` near lines 313–403.
- **The production seed** is the harness's arm A plus the `headline_shorten` call from `story.service.ts`. Say so on its card.
- **Staged and One-call** include the **thin-story re-crawl**. When the ledger is thin, add the job's other pages (`recrawlPages`) and label again (`run.ts` near lines 369–377). It is a code step and a second `label` step with a `when`.

**Runs and storage (§5).**
- One durable workflow run **per story**, with one step per model call. Code steps run inline. Pass IDs between steps, not the whole context.
- Store a story's inputs once, by reference. Compress large trace values.
- Show the database size and the workflow usage on the Settings page.
- The free tiers (Neon 0.5 GB; Vercel Workflow on Hobby, about 50,000 events a month) allow only a few 500-story runs a month. Record this. The owner accepts it.

**Middleware.** There is no auth middleware. If any middleware exists, it must never answer `/api/*`, `/mcp`, or `/.well-known/*` with a 401. MCP clients probe `/.well-known/oauth-protected-resource`, and a 401 starts an auth flow.

**Stories page.**
- Add an **"Ask" box**. A person types "top ranked stories with one quote or none", and a model call turns it into filter chips that the person can edit. This prompt is editable on the Settings page.
- The ranking columns (§2.4) are first-class columns, and filterable.

**Flow view.** The "what this step decided" line is a fixed summary per known output type, made by code. It is never a model call (P1).

**Acceptance test changes.**
- **AC-01:** compare with `data/expected-counts.json`, not with "1,144 with story fields".
- **AC-02:** compare with `data/expected-counts.json`.
- **AC-04:** replace it. Two runs of the same story and version give byte-identical rendered messages for every step before the first model call. Every code step is deterministic: the same input gives the same output (unit test).
- **AC-11:** the test call is the job 1099 (or 1106) story on the staged `write` step, with effort high and 16384 max tokens. Read its duration from the trace.
- **AC-25:** grep the repo, the built output and the Vercel runtime logs for the key's prefix and its value, without printing either.
- **AC-29:** the guide's tour uses "winner", "runnable by v3" and "quote_count ≤ 1".
- **New AC-31:** the Ask box turns "rank 3 or 5, no quotes" into the right chips, and the count matches the API's count for the same filter.

**Recorded risk.** The API is open and the OpenRouter credit is unlimited, so anyone who finds the URL can start runs. The owner accepted this. Record it in `docs/DECISIONS.md`.

## 11. Deliverables

1. The live URL.
2. The repo, with CI passing.
3. `docs/TEAM-GUIDE.md`: what the app is, the 5-minute tour, how versions work, how to connect Claude, what each step of each seed does.
4. `docs/QA-REPORT.md`: the result of each acceptance test, with evidence.
