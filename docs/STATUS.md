# Story Workbench: status

Updated: 2026-11-05 (build session).

## Live URL

- Production domain: https://story-workbench-longtale-hq.vercel.app
- State: the app builds and deploys from `main` (Vercel Git integration). It cannot serve data yet, because the hosted database does not exist. See "Needs a person".
- Local URL (fully working, all tests below): http://localhost:3100 (`pnpm dev -p 3100`, local Postgres `story_workbench`).
- Repo: https://github.com/100XLT-ai/story-workbench (public).

## Needs a person

1. **Accept the Neon terms on the Vercel Marketplace** (one click in a browser, team "Longtale"):
   https://vercel.com/longtale-hq/~/integrations/accept-terms/neon?source=cli
   The CLI stops with `integration_terms_acceptance_required`. An AI session must not accept terms for the owner.
   After that, run from the repo folder:
   ```
   npx vercel@latest integration add neon --name story-workbench-db --scope longtale-hq
   npx vercel@latest env pull .env.vercel --scope longtale-hq
   DATABASE_URL=<the DATABASE_URL from .env.vercel> pnpm db:migrate
   FROM_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/story_workbench TO_DATABASE_URL=<same> bash scripts/copy-snapshot.sh
   DATABASE_URL=<same> pnpm seed
   npx vercel@latest --prod --scope longtale-hq
   ```

## Phases

| Phase | State | Commit | Notes |
|---|---|---|---|
| 0 Repo, project, database, secrets | partial | 23f5739 | Repo public; Vercel project linked to Git; deployment protection off; `OPENROUTER_API_KEY` set (production, preview, development). Neon blocked on terms. |
| 1 Port, goldens, fidelity test | done | 7b79899 | 12 of 12 fidelity tests pass (3 seeds × 4 fixtures). |
| 2 Data import | done (local) | 7b79899 | 15,051 stories; ported ledger equals longtale-core's on every story. |
| 3 Engine and runs | done (local) | 8cee4ad | One Vercel Workflow per story; Staged 3.0 on the job 1100 winner: 39 steps, $0.105. |
| 4 Web app | done (local) | 8cee4ad | All pages of spec §6. |
| 5 API and MCP | done (local) | 7b79899 | REST + OpenAPI; MCP at /mcp. |
| 6 Deploy and self-check | local done; live blocked | — | Self-check on the local app: see QA-REPORT.md. Live needs the database (above). |
| 7 Docs | done | 814eb6f | README, ARCHITECTURE, DECISIONS, TEAM-GUIDE, QA-REPORT. |

## Acceptance tests

See `docs/QA-REPORT.md` for the evidence of each test.

## Model spend so far

- Goldens recording (longtale-core requests, once): about $1.10.
- App runs and prompt-editor calls in the local self-check: about $2.89 (Settings → Model spend).
- Total so far: about $4.00.
