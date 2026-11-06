# Story Workbench: status

Updated: 2026-11-06 (build session).

## Live URL

- Production: https://story-workbench-longtale-hq.vercel.app (also https://story-workbench-self.vercel.app). It serves the full snapshot (15,051 stories) from Neon.
- Repo: https://github.com/100XLT-ai/story-workbench (public). Every push to `main` deploys to production.
- Database: Neon `story-workbench-db` (Vercel Marketplace, team Longtale), one database for production, preview and development. 145 MB of 512 MB.
- Local: `pnpm dev -p 3100`. `vercel env pull` writes the Neon `DATABASE_URL` to `.env.local`, so local dev uses the hosted database too. To use a local Postgres, set `DATABASE_URL` to it.

## Needs a person

Nothing blocks the app. Two checks need a person:

1. **AC-21 in Claude Code itself.** Claude Code connects to the live `/mcp` (✓ Connected), and a script ran the same tool calls. A person should type the tour request into Claude Code once (see `docs/TEAM-GUIDE.md`, "Connect Claude").
2. **AC-29 timing.** A first-time reader should do the 5-minute tour and time it.
3. **Two leftover folders.** `C:\dev\a-empath-ai\story-workbench-guide` and `C:\dev\a-empath-ai\story-workbench-rankfix` are no longer git worktrees (both branches are merged and deleted), but Windows did not let `git worktree remove` delete the folders. Everything in them is in git. Delete them by hand.

## Changes after the self-check

| Date | Commit | Change |
|---|---|---|
| 2026-11-06 | 21a1448 | Merged `feat/guide-page`: the /guide page (team guide and README), a nav link and a "New here?" line on Stories. |
| 2026-11-06 | 19366a6 | Merged `fix/runnable-and-rank-why`: `runnable_v3` now means the story's fact ledger is not empty (D42); "Why this rank" on the story page; a Text pages column and six score-part columns. Migration 0001 ran on Neon before the push. |

After D42 the counts changed: "Runnable by v3" gives 13,192 (was 13,461), and the tour filter (winners, runnable by v3, quote_count ≤ 1) gives 97 (was 122). Checked on the live URL on 2026-11-06. The QA report's AC-29 row shows the old count of 122. The Neon `settings` table has no saved rows, so the code defaults (including the new Ask-box rules) apply.

## How the database was set up (done 2026-11-06)

```
npx vercel@latest integration add neon --name story-workbench-db --scope longtale-hq
pnpm db:migrate                       # reads DATABASE_URL from .env.local
FROM_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/story_workbench TO_DATABASE_URL=<Neon unpooled URL> bash scripts/copy-snapshot.sh
pnpm seed
npx vercel@latest redeploy <latest production URL> --target production --scope longtale-hq
```

## Phases

| Phase | State | Commit | Notes |
|---|---|---|---|
| 0 Repo, project, database, secrets | done | 23f5739 | Neon added 2026-11-06 after Alan accepted the Marketplace terms. |
| 1 Port, goldens, fidelity test | done | 7b79899 | 12 of 12 fidelity tests pass (3 seeds × 4 fixtures). |
| 2 Data import | done | 7b79899 | 15,051 stories, locally and on Neon. |
| 3 Engine and runs | done | 8cee4ad | One Vercel Workflow per story. A 140.6 s model call completes on Vercel. |
| 4 Web app | done | 8cee4ad | All pages of spec §6. |
| 5 API and MCP | done | 7b79899 | REST + OpenAPI; MCP at /mcp. |
| 6 Deploy and self-check | done | 084dd17 | Live self-check: see QA-REPORT.md. Three small fixes from it. |
| 7 Docs | done | 814eb6f | README, ARCHITECTURE, DECISIONS, TEAM-GUIDE, QA-REPORT. |

## Acceptance tests

All 31 pass on the live URL. AC-21 has one limit (above). See `docs/QA-REPORT.md`.

## Model spend so far

- Goldens recording (once): about $1.10.
- Local self-check: about $2.89.
- Live self-check: $3.29 in runs, plus about $0.30 for one prompt-editor call and one Ask call (estimated).
- Total: about $7.60.
