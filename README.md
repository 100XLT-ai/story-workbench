# Story Workbench

See, edit and run every step that turns a ranked Longtale story into an
article, social posts and ad copy. A web app, an open REST API and an open MCP
server, on a fixed copy of `longtale_dv2`.

- Live: https://story-workbench-longtale-hq.vercel.app (status in `docs/STATUS.md`)
- Team guide: [docs/TEAM-GUIDE.md](docs/TEAM-GUIDE.md)
- Spec: [docs/SPEC.md](docs/SPEC.md) · Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Decisions: [docs/DECISIONS.md](docs/DECISIONS.md)

## Run it locally

Needs Node 24, pnpm 10 and a Postgres.

```bash
pnpm install
createdb story_workbench            # or any empty Postgres database
```

Make `.env.local`:

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/story_workbench
SOURCE_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/longtale_dv2
OPENROUTER_API_KEY=<the team's OpenRouter key; never commit it>
```

Then:

```bash
pnpm db:migrate        # creates the tables
pnpm run import        # copies the snapshot from longtale_dv2 (about 25 minutes)
pnpm seed              # creates the three seed versions if they do not exist
pnpm dev               # http://localhost:3000
```

The import needs `longtale_dv2` and the longtale-core worktree
(`LONGTALE_CORE_DIR`, default
`C:/dev/a-empath-ai/longtale-core/.claude/worktrees/beautiful-lumiere-d74efc`),
because it checks the ported fact ledger against longtale-core's own. A copy of
the app database (`pg_dump`) is a faster start if you only want to run the app.

## Tests

```bash
pnpm typecheck
pnpm lint
pnpm test              # engine unit tests and the fidelity test (no network, no database)
```

The fidelity test compares the seeds' rendered prompts with goldens that
longtale-core's own builders made. To make the goldens again (builder's
computer only):

```bash
cd <longtale-core>/apps/api
<story-workbench>/node_modules/.bin/tsx <story-workbench>/scripts/make-goldens.ts
cd <story-workbench> && pnpm exec tsx scripts/export-fixture-inputs.ts
```

## Deploy

Vercel project `story-workbench` in the team "Longtale" (`longtale-hq`). A push
to `main` deploys production. Environment variables: `OPENROUTER_API_KEY`
(set), and `DATABASE_URL` from the Neon integration (`story-workbench-db`,
one database for all environments). The hosted database was loaded with
`pnpm db:migrate`, `scripts/copy-snapshot.sh` (from a local import) and
`pnpm seed`; see `docs/STATUS.md`. `vercel env pull` puts the Neon URL in
`.env.local`, so local dev then uses the hosted database.

## Import again

`pnpm run import` replaces the snapshot tables whole and never touches
versions, runs, traces, saved filters or settings. It writes
`data/expected-counts.json`. Edit `data/mastheads.json` or
`data/sponsor-names.json` first to change the publisher or sponsor names.

## MCP smoke test

```bash
pnpm exec tsx scripts/mcp-smoke.ts https://story-workbench-longtale-hq.vercel.app/mcp ac21
```
