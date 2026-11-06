# Story Workbench: team guide

## What the app is

Longtale's discovery crawl finds a sponsor's cause stories, ranks them and
gives each an angle. A writer then turns one ranked story into three outputs:

- **the article** (title, subtitle, content);
- **the social posts** (Facebook, Instagram, LinkedIn, X);
- **the ad copy** (headline, subheadline, CTA).

Story Workbench shows every step of that writer: the prompt, the exact input,
the output, and what the step decided. You can change any prompt, model or step.
Each change saves as a new numbered version, for example "Staged writer 3.1
(Noah)". The app never scores or judges an output: you decide.

The data is a fixed copy of the database `longtale_dv2` (15,051 ranked stories
in 308 jobs). It never changes, so the same story always gets the same inputs.
Nothing goes back to production. To use a better prompt in production, copy it
by hand.

There is no login. The first time you open the app, it asks "Your name?". Every
version and run you make stores that name.

## The 5-minute tour

Goal: run the staged writer on 3 winners that have one quote or none, and open
one flow.

1. Open the app. The [**Stories**](/stories) page opens. Type your name if it asks, and
   click **Save**.
2. Under **Quick**, click **Winners**. A chip "Winner" appears.
3. Click **Runnable by v3**. A second chip appears. (v3 needs at least one fact,
   impact or quote from the story's own pages. A story whose page was never
   scraped has none, so the filter hides it. The **Text pages** column shows
   how many of a story's pages have scraped text.)
4. Click **quote_count ≤ 1**. A third chip "Quotes ≤ 1" appears. The count on the
   right says how many stories match (97).
   - You can also type "winners runnable by v3 with one quote or none" in the
     **Ask** box and click **Ask**. The chips appear the same way, and you can edit them.
5. Click the **Facts** column header once. The stories with the most facts come
   first. (A story with no facts often makes the writer refuse; the run then
   shows the failing step.) Tick the boxes of the first 3 rows.
6. Click **Run with… (3 selected)**.
7. In **Version**, choose **Staged writer 3.0 (seed)**. Read the estimated cost
   (about $0.10 per story). Click **Start the run**.
8. The run page opens. The table updates by itself. A story takes about 2 to 4
   minutes. You can close the browser: the run goes on.
9. When a row says **done**, click the sponsor name (or the status). The
   **flow** opens: one card per step, from top to bottom.
10. On each card, read the **Decided** line. Click **Readable**, **Prompt**,
    **Input** or **Output** to see more. The blue chips between cards name the
    values that flow from one step to the next.

## How versions work

- A **family** is one writer (Production writer, Staged writer, One-call writer).
- A **version** is a frozen list of steps plus settings. It never changes.
- The seeds are **Production writer 1.0**, **Staged writer 3.0** and
  **One-call writer 3.0**. They reproduce today's longtale-core prompts byte for
  byte (a test in the repo proves it).
- A change makes the next number in the family: 3.0 → 3.1 → 3.2. The label
  shows the author: "Staged writer 3.1 (Noah)". The parent stays as it was.

Three ways to make a version:

1. **Edit.** Open [**Workflows**](/workflows), click **Edit** next to a version. Choose a step
   on the left. Change the prompt, the model, the temperature, the reasoning,
   the `when` condition, or the step order. Click a token under the prompt to
   insert it, for example `{{article.title}}`. A red token is unknown, and the
   save stops on it. Click **Save as a new version…**, read the side-by-side
   diff, write a note, click **Save**.
2. **Comment.** Open a version. In **Comment**, write what you want, for
   example "Headlines must be 8 words or fewer". Click **Propose a change**. A
   model (the prompt editor) returns the changed prompt and a reason. Click
   **Save as a new version**, **Edit it first**, or **Drop it**.
3. **Claude or the API.** `create_version` takes a parent and a list of
   changes; `propose_edit` asks the prompt editor.

Other actions on a version page: **View as JSON**, **Download JSON**, **Copy
to a new family** (the copy starts at 1.0). On **Workflows**, **Compare two
versions** shows every changed field.

To add a step that writes something new, for example an extra social post, open
the editor, select **Final article**, click **+ Add a prompt step after this
one**, and write a prompt that reads `{{article.title}}` and
`{{article.content}}`. Its output appears in the flow and in the results table.

To compare two runs of the same story (for example 3.0 and 3.1), open a flow and
click a version under **Compare with**. Changed text is marked red and green.

## See what each prompt receives (free)

On a story page, under **What each prompt receives**, choose a version and click
**Preview inputs**. The Run dialog has the same button for the selected stories.
No model is called and nothing is charged.

- Each step shows its model, its thinking level, its maximum tokens and an
  estimate of its input tokens. Click a step to read its full messages.
- A blue ⟦slot⟧ stands for a value that a model makes during a real run, for
  example ⟦selection: from step 11 "Choose the story"⟧.
- The line at the top says whether any prompt reads the raw page text. No seed
  does: the writer reads the fact ledger only.

## Downloads

On a run page: **CSV** (one row per story), **Markdown** (one section per
story) and **JSON** (every trace).

## Connect Claude

The [**Connect Claude**](/connect) page has the copy-ready text. In short:

- **Claude Code:** `claude mcp add --transport http story-workbench https://story-workbench-longtale-hq.vercel.app/mcp`
- **Claude Desktop and claude.ai:** Settings → Connectors → Add custom connector,
  URL `https://story-workbench-longtale-hq.vercel.app/mcp`. No OAuth.

Then ask, for example: "Find the winners with no quotes that v3 can run, run
Staged writer 3.0 on three of them, and show me what the select step decided."

## What each step does

### Production writer 1.0

Today's production article (the harness "arm A" plus the headline-shorten call
from `story.service.ts`), then the social posts and the ad copy.

| Step | What it does, in plain words |
|---|---|
| Statistics inputs | Prepares the background-statistics call from the story headline. |
| Background statistics | Only when the story has no impact number: a model returns 1–2 statistics. |
| Read the statistics | Reads that reply; bad JSON gives an empty list. |
| Production payload | Puts 13 fields together: brand, partner, initiative, quote, statistics. |
| Write the article | One large prompt writes the whole article as markdown. |
| Split the article | Separates the headline from the body. |
| Measure the headline | Counts the headline's characters. |
| Shorten the headline | Only when the headline is over 45 characters: a model shortens it. |
| Final article | Puts the short headline back. This is the article. |
| Check the story title | Production makes a short title at story creation when the idea title is over 35 characters. |
| Short story title | Only then: a model writes that short title. |
| Social post data | Collects what the social prompts read: the article, the brand name, the Facebook handle. |
| Facebook / Instagram / LinkedIn / X prompt | Renders production's prompt for that platform (the templates are editable parameters). |
| … post | A model writes the post. |
| Facebook rules | Removes emojis and hashtags and counts characters (limit 400). |
| Facebook length retry | Only when the post is too long: a model writes it again, shorter. |
| Facebook final post | Keeps the shorter post. |
| … final post (Instagram, LinkedIn, X) | Reads the post from the reply. If the model wrote "x (twitter)" as the platform, the card says production would drop the post. |
| Ad copy inputs | Collects what the display ad reads: business fields, brand voice, crawl facts and the story summary. It does not read the article (production does not). |
| Ad copy prompt | Renders production's ad prompt with its rules and banned words. |
| Ad copy | A model writes the headline, the subheadline and the CTA. |
| Ad copy check | Checks the lengths and that there is no URL or HTML. |

### Staged writer 3.0

The v3 writer: code turns the pages into facts first, then two model calls
choose and write. The headline fit, the social posts and the ad copy are the
same as above (plus "Production story data", which the social prompt reads).

| Step | What it does, in plain words |
|---|---|
| Ledger input | Collects the story's pages, the sponsor names and the generation date. |
| Fact ledger | Turns the pages into numbered facts (C1, C2…) and quotes (Q1…), removes duplicates, finds figures that disagree, and flags a thin story. |
| Label the facts | A cheap model labels each fact: about the company or about the cause, done or promised, who did it, how. |
| Apply the labels | Marks the company facts and checks again if the story is thin. |
| Thin-story re-crawl | Only for a thin story: adds up to 3 other pages of the job that name the beneficiary. |
| Label the re-crawled facts / Apply the new labels | Only when the re-crawl added pages. |
| Story type | Code decides what the story is about (an event, a grant…), when (upcoming, recent, multi-year), and the sponsor's role. |
| Writer input | Writes the FACTS, COMPANY, QUOTES and RISKS blocks that the models read. |
| Story-type modules | Picks the writing rules for this story type. |
| Choose the story | An editor model chooses the angle, the facts to use and to leave out (with reasons), the quotes and the risks. |
| Write the article | The writer model writes two options, grounded and upbeat, with a claim ID on every fact. |
| Read the writer reply | Reads the plan and both options. The grounded option becomes the article, as in production. |
| Code checks | Code checks each option: length, figures, quotes, dates, sponsor naming, claim IDs. |

### One-call writer 3.0

The same as the staged writer, without **Choose the story**: one writer call
plans the story and writes both options.

## Good to know

- The **Stories** table shows the newest job first, then rank. Click a column
  header to sort by it; click **Newest job first** to go back. Scroll down to
  see every story: the table loads more rows as you go. Story id and headline
  stay on the left when you scroll sideways. **Columns** shows or hides
  columns, by group.
- **Scoring system** above the table adds one column group for a ranking
  system. Each cell shows the score, and under it the raw input (for example
  the date and its age). Click **Only stories it ranked** to keep that
  system's stories.
- **Scores name their system.** Four ranking systems ranked the jobs over time.
  The **Ranking system** column says which one ranked a story, and the
  **Ranking score** is that system's score (a weighted score, or the simple
  points). On a story page, **Scoring: inputs and scores** shows each part:
  the raw input (for example the date and its age), the band, the value that
  longtale-core's own code gives, and the stored value. The **Guide → Scoring**
  page explains each system.
- **Old jobs have no pages.** 1,590 stories from jobs that ran before
  2026-08-17 show "old pipeline: no pages saved". The source database lost
  their page rows, so the writer has nothing to read. Click **Has source data**
  under **Quick** to hide them. The **Data coverage** panel above the filter
  counts them for each ranking system.
- The **angle** that discovery wrote is not read by any seed. The story page
  and the flow show it, marked "not read by this version". Add
  `{{story.storyAngle}}` to a prompt to use it.
- [**Settings**](/settings) holds the prompt editor's prompt and model, the Ask box prompt,
  the run concurrency (8) and the database and workflow usage.
- The API is open and the OpenRouter credit has no limit. Anyone with the URL
  can start runs. The owner accepted this.
