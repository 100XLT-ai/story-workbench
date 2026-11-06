# How discovery scores and ranks stories

Discovery gives every story scores, then ranks the stories of each job. Four
systems did this over time. Each job used one of them. This page says, for each
system, when it started, what it ranks on, its formula, its deal-grade bounds
and its confidence rule. All facts come from longtale-core's code and git
history (read on 2026-11-06). The app checks them against the stored values:
see "How sure is this?" at the end.

On a story page, **Scoring: inputs and scores** shows each part of each system
with its raw input, the band that applied, the value longtale-core's own code
gives on the stored inputs, and the stored value.

## Which system ranked a story

The column **Ranking system** (`ranking_system`) says it.

| Ranking system | Stories | Jobs | Job run dates | The system that ranked them |
|---|---|---|---|---|
| `untagged` | 2,328 | 168 | 2026-06-03 to 2026-10-23 | weighted-grade@v1. The version column did not exist yet (it came on 2026-10-25). Jobs 555 and 556 (12 stories, 2026-06-03) ranked by the cause-score total. |
| `weighted-grade@v1` | 12 | 1 | 2026-10-27 | weighted-grade@v1 |
| `weighted-grade@v2` | 3,920 | 41 | 2026-10-24 to 2026-10-28 | weighted-grade@v2 |
| `simple-score@v1` | 8,791 | 98 | 2026-10-28 to 2026-10-29 | simple-score@v1 |

Every story also has the **cause score** (cause-score@v1): six parts and a
total.

## What the score columns hold

| Column | untagged and weighted-grade@v1 | weighted-grade@v2 | simple-score@v1 |
|---|---|---|---|
| Ranking score (`weighted_score`) | the v1 weighted score (1.75 to 7.15) | the v2 weighted score (1.7 to 7.8) | the simple **points** (15 to 100) |
| Tiers (`tier_*`) | the v1 tiers; reach is always 3; no market or image tier | the v2 tiers | the **v2** tiers, not the simple parts |
| Deal grade | the v1 grade | the v2 grade | the **simple** grade |
| Confidence (winner only) | from the cause-score attribution | from the v2 attribution tier | from the v2 attribution tier |
| Cause score total and parts | cause-score@v1 | cause-score@v1 (beneficiary interest is always 0) | cause-score@v1 (beneficiary interest is always 0) |

longtale-core did not store the five simple-score parts. The app rebuilds them
from stored fields and marks them "rebuilt".

## cause-score@v1

Started 2026-05-31 (commit `73252f90`; last change `d9fb2a8a`, 2026-06-03).
Code: `ranking/cause-score.ts`. Every story has it. It decided the rank only in
jobs 555 and 556. Later it is the second sort key of weighted-grade@v1.

- **Amount** = log10(USD + 1) × 20. 0 when there is no USD value. On v2 and
  simple stories the value counts only when the unit is exactly "usd" (a unit
  of "dollars" gives 0).
- **Attendance** = log10(people + 1) × 15.
- **Recency** = factor ÷ 100 × 25. The factor is 100 under 30 days (or in the
  future), 50 under 180 days, 10 under 365 days, else 0. No date gives 0. The
  age runs from the signal date to the rank time.
- **Beneficiary interest** = min(count ÷ 5, 1) × 20. The count is the job's
  candidates with the same beneficiary. The v2 and simple pipelines pass an
  empty map, so this part is 0 there.
- **Evidence completeness** = 20 × (quote 0.25 + USD value 0.25 + named
  beneficiary 0.25, or a common-noun beneficiary 0.125 + signal date 0.25).
- **Attribution**: an off-domain source gives 0. An on-domain source gives 25
  when its host is the advertiser's host or a subdomain, and 12 when the
  advertiser's brand stem (4 or more letters) is in the host or the path.
- **Total** = the sum of the six parts.
- No deal grade, no confidence.

## weighted-grade@v1

Started 2026-06-05 (commits `9dc7dc3c` for the score, `6b21378a` for the deal
grade and confidence). Removed from longtale-core's main branch on 2026-11-01
(`878be743`, `162c7559`). Code: `ranking/weighted-score.ts` at `162c7559^`.

- **Weighted score** = (30·fib(impact) + 20·fib(recency) + 10·fib(reach) +
  15·fib(evidence) + 15·fib(attribution) + 10·fib(image)) ÷ 100 + nudge.
  fib(tier) is 1, 2, 3, 5, 8 for tiers 1 to 5. The nudge is +0.25 for a named
  beneficiary and −0.15 for a generic one.
- **Impact tier**: the quintile of the impact value among the job's candidates
  of the same impact type.
- **Recency tier**: under 90 days 5; under 180 days 4; under 365 days 3; under
  730 days 2; else 1; no date 3.
- **Reach tier**: always 3 (a stub).
- **Evidence tier**: the quintile of (quote + a description of 200 or more
  characters + an editorial photo) among the job's candidates.
- **Attribution tier**: cause-score attribution 25 gives 5 when another source
  page names the beneficiary, else 4. 12 gives 3 or 2. Else 1.
- **Image tier**: the quintile of the editorial photo count. Not stored; the
  app gets it back from the stored score.
- **Rank**: weighted score, then the cause-score total, then the number of
  impact types. An LLM picks the winner from the top 5, so the winner is not
  always rank 1.
- **Deal grade**: from the weighted score. A ≥ 6.6, B ≥ 5.55, C ≥ 4.5, else D.
- **Confidence** (winner only): cause-score attribution ≥ 25 high, ≥ 12 medium,
  else verify.

## weighted-grade@v2

Started 2026-10-25 (commit `f644e7e8`). Market rules changed on 2026-10-27
(`5c1d44a7`, `43f6e8a7`); market points and the C cap came with `95eb019f`
(2026-10-27) and show in jobs from 2026-10-28. Code:
`ranking/weighted-score-v2.ts`.

- **Weighted score** = (25·fib(impact) + 20·fib(recency) + 15·M +
  15·fib(evidence) + 10·fib(attribution) + 15·fib(image)) ÷ 100 + nudge.
  From 2026-10-28, M is the market points: tier 4 or 5 gives 5, tier 2 or 3
  gives 3, tier 1 gives 0. Before that, M = fib(market tier).
- **Impact tier**: for each value, 1 + the number of bands it reaches. USD
  bands: 500, 5,000, 25,000, 100,000. People: 25, 100, 500, 2,000. Hours: 20,
  100, 500, 2,000. No value or no known unit gives 3. The best value counts,
  +1 when the story has more than one impact type, at most 5.
- **Recency tier**: from the newest impact date. Under 90 days (or in the
  future) 5; under 180 days 4; under 365 days 3; under 730 days 2; else 1;
  no date 3.
- **Market tier**: from the places the pages name. The primary city or county
  gives 5; the region or another city in the area gives 4; a city outside the
  area gives 2 or 1.
- **Evidence tier**: one point each for a verbatim quote, a named
  beneficiary, an event date, a value and a long activity. List pages get 2 at
  most.
- **Attribution tier**: on-site and off-site pages 5; on-site pages only 4;
  else 4 or 3 by the pages about the advertiser.
- **Image tier**: a hero photo 5; two or more editorial photos 4; one
  editorial photo or a brand photo 3; else 1.
- **Rank**: deal grade (from 2026-10-28), then weighted score, then the number
  of impact types, then the earlier date.
- **Deal grade**: from the weighted score. A ≥ 5.5, B ≥ 4.1, C ≥ 2.75, else D.
  From 2026-10-28, an A or B story with market tier below 4 becomes C.
- **Confidence** (winner only): attribution tier 4 or 5 high, 3 medium, else
  verify.

## simple-score@v1

Started 2026-10-27 (commit `121ee294`). Changed on 2026-10-28 (`54a48523`,
R40: the event date first, the no-place cap). From 2026-10-29 the winner is
rank 1 (`329e114b`). Code: `ranking/simple-score.ts`.

- **Points** = recency + local + impact + proof + photo (15 to 100).
- **Recency**: age under 183 days 30; under 365 days 22; under 730 days 10;
  else 0; no date 5. The date is the newest event date, else the newest page
  date.
- **Local**: market tier 4 or 5 gives 25, else 10.
- **Impact**: 10 when a value in USD or people is stated; +5 when it is USD
  25,000 or more, or 500 people or more.
- **Proof**: 10 when an off-site page that is not a social site is about the
  advertiser; +5 when an on-site page is.
- **Photo**: a hero photo 15; an editorial photo 8; else 0.
- **Rank**: grade, then points, then the newer date.
- **Deal grade**: A when points ≥ 75, the age is under 365 days and the market
  tier is 4 or 5. B when points ≥ 55 and the age is under 730 days. C when
  points ≥ 35. Else D. A story that names no city or county gets C at most.
- **Confidence** (winner only): the v2 attribution tier 4 or 5 high, 3 medium,
  else verify.

## How sure is this?

The app recomputes each value with longtale-core's own functions, copied
unchanged into `src/lib/scoring/upstream/`, and compares the result with the
stored value (`scripts/check-scoring.ts`, 2026-11-06):

| Check | Stories that match |
|---|---|
| cause-score parts and total, v2 and simple stories | 12,711 of 12,711 |
| cause-score parts and total, untagged and v1 stories | 2,326 of 2,340 (14 differ in beneficiary interest: the snapshot keeps only the ranked candidates, the rank phase counted every candidate) |
| weighted-grade@v1 score, deal grade, recency and attribution tiers | 2,328 of 2,328 |
| weighted-grade@v2 score and deal grade | 3,920 of 3,920 |
| weighted-grade@v2 impact tier | 12,586 of 12,711 (the v2 merge can join impacts from pages the snapshot does not keep) |
| simple-score points, rebuilt from stored fields | 8,711 of 8,791 |
| simple-score deal grade | 8,059 of 8,791 (715 of the 732 others are A or B by the rule but stored as C: the story names no place, which is not stored) |

The app shows these values only. It does not make a new score.
