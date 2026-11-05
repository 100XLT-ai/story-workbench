#!/usr/bin/env bash
# Copies the snapshot tables from a local app database (made by `pnpm run import`)
# to another database, for example the hosted Neon one. Much faster than a new
# import (no ledger check). It replaces the snapshot tables only.
#
#   FROM_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/story_workbench \
#   TO_DATABASE_URL=<neon url> scripts/copy-snapshot.sh
set -euo pipefail
: "${FROM_DATABASE_URL:?set FROM_DATABASE_URL}"
: "${TO_DATABASE_URL:?set TO_DATABASE_URL}"
TABLES=(jobs organizations stories pages story_pages images story_images)
psql "$TO_DATABASE_URL" -v ON_ERROR_STOP=1 -c "truncate ${TABLES[*]// /, }" >/dev/null 2>&1 || psql "$TO_DATABASE_URL" -v ON_ERROR_STOP=1 -c "truncate jobs, organizations, stories, pages, story_pages, images, story_images"
ARGS=()
for t in "${TABLES[@]}"; do ARGS+=(-t "public.$t"); done
pg_dump "$FROM_DATABASE_URL" --data-only --no-owner --no-privileges "${ARGS[@]}" | psql "$TO_DATABASE_URL" -v ON_ERROR_STOP=1 -q
for t in "${TABLES[@]}"; do echo "$t: $(psql "$TO_DATABASE_URL" -At -c "select count(*) from $t")"; done
