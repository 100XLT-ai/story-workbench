"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { FilterBar, type Field } from "@/components/filter-bar";
import { StoriesTable, SYSTEM_FILTER } from "@/components/stories-table";
import { SYSTEMS, type SystemId } from "@/lib/scoring/systems";
import { RunDialog } from "@/components/run-dialog";
import { api } from "@/lib/client/api";
import type { FilterClause } from "@/lib/engine/types";

interface Coverage {
  rankingSystem: string;
  stories: number;
  jobs: number;
  noPage: number;
  noText: number;
  emptyLedger: number;
  firstRun: string;
  lastRun: string;
}

/** Per ranking system: how much source data the stories have. */
function CoveragePanel() {
  const [rows, setRows] = useState<Coverage[] | null>(null);
  useEffect(() => {
    api<{ systems: Coverage[] }>("/api/stories/coverage")
      .then((r) => setRows(r.systems))
      .catch(() => setRows([]));
  }, []);
  if (!rows?.length) return null;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  return (
    <details className="card p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Data coverage: {rows.reduce((t, r) => t + r.noPage, 0).toLocaleString()} stories have no saved page
      </summary>
      <p className="mt-2 text-xs text-stone-600">
        Jobs that ran before 2026-08-17 lost their page rows in the source database, so those stories have no source text and an empty fact ledger. Use the &quot;Has source data&quot; chip to hide them.
      </p>
      <table className="tbl mt-2">
        <thead>
          <tr>
            <th>Ranking system</th>
            <th>Job run dates</th>
            <th>Jobs</th>
            <th>Stories</th>
            <th>No page</th>
            <th>Pages, no text</th>
            <th>Empty fact ledger</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rankingSystem}>
              <td className="font-mono text-xs">{r.rankingSystem}</td>
              <td className="whitespace-nowrap">
                {r.firstRun} to {r.lastRun}
              </td>
              <td>{r.jobs.toLocaleString()}</td>
              <td>{r.stories.toLocaleString()}</td>
              <td>
                {r.noPage.toLocaleString()} <span className="text-stone-400">({pct(r.noPage, r.stories)})</span>
              </td>
              <td>{r.noText.toLocaleString()}</td>
              <td>
                {r.emptyLedger.toLocaleString()} <span className="text-stone-400">({pct(r.emptyLedger, r.stories)})</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function StoriesPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [fields, setFields] = useState<Field[]>([]);
  const initial = useMemo<FilterClause[]>(() => {
    try {
      return JSON.parse(sp.get("f") ?? "[]") as FilterClause[];
    } catch {
      return [];
    }
  }, [sp]);
  const [filter, setFilter] = useState<FilterClause[]>(initial);
  const [sort, setSort] = useState(sp.get("sort") ?? "default");
  const [dir, setDir] = useState<"asc" | "desc">(sp.get("dir") === "desc" ? "desc" : "asc");
  const [system, setSystem] = useState<SystemId | null>((sp.get("system") as SystemId | null) ?? null);
  const [total, setTotal] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<null | "selected" | "filter">(null);

  useEffect(() => {
    api<{ fields: Field[] }>("/api/stories/fields").then((r) => setFields(r.fields));
  }, []);

  useEffect(() => {
    const q = new URLSearchParams();
    if (filter.length) q.set("f", JSON.stringify(filter));
    if (sort !== "default") q.set("sort", sort);
    if (sort !== "default" && dir === "desc") q.set("dir", dir);
    if (system) q.set("system", system);
    router.replace(`/stories${q.size ? `?${q}` : ""}`, { scroll: false });
  }, [filter, sort, dir, system, router]);

  const toggleSort = useCallback(
    (name: string) => {
      if (sort === name) setDir(dir === "asc" ? "desc" : "asc");
      else {
        setSort(name);
        setDir(["rank", "id", "sponsor_name", "story_headline"].includes(name) ? "asc" : "desc");
      }
    },
    [sort, dir],
  );
  const fieldOf = (n: string) => fields.find((f) => f.name === n);
  const systemClause = system ? SYSTEM_FILTER[system] : null;
  const hasSystemClause = !!systemClause && filter.some((c) => c.field === "ranking_system");

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Stories</h1>
          <p className="text-sm text-stone-600">Every ranked story from the fixed copy of longtale_dv2. Filter, select, then run a writer version.</p>
          <p className="text-xs text-stone-500">
            New here?{" "}
            <Link href="/guide" className="text-blue-700 hover:underline">
              Read the guide
            </Link>
            .
          </p>
        </div>
      </div>
      <CoveragePanel />
      <FilterBar fields={fields} filter={filter} onChange={setFilter} count={total} />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={selected.size === 0} onClick={() => setDialog("selected")}>
          Run with… ({selected.size} selected)
        </button>
        <button className="btn" disabled={!total} onClick={() => setDialog("filter")} title="Run every story that matches the filter (1 to 500)">
          Run the current filter ({total?.toLocaleString() ?? "…"})
        </button>
        {selected.size > 0 && (
          <button className="text-xs text-stone-500 underline" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        )}
        <span className="text-xs text-stone-500">
          {sort === "default" ? (
            "Order: newest job first, then rank."
          ) : (
            <>
              Order: {fieldOf(sort)?.label ?? sort} {dir === "asc" ? "▲" : "▼"}.{" "}
              <button
                className="underline"
                onClick={() => {
                  setSort("default");
                  setDir("asc");
                }}
              >
                Newest job first
              </button>
            </>
          )}
        </span>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="label">Scoring system</span>
          <select className="input py-0.5" value={system ?? ""} onChange={(e) => setSystem((e.target.value || null) as SystemId | null)} aria-label="Scoring system">
            <option value="">(none: stored columns only)</option>
            {SYSTEMS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} · {s.created}
              </option>
            ))}
          </select>
          {systemClause && !hasSystemClause && (
            <button className="btn btn-sm" onClick={() => setFilter([...filter, systemClause])} title="Add a filter: the stories this system ranked">
              Only stories it ranked
            </button>
          )}
          <Link href="/guide/scoring" className="text-xs text-blue-700 hover:underline">
            How each system works
          </Link>
        </label>
      </div>
      {fields.length > 0 && <StoriesTable fields={fields} filter={filter} sort={sort} dir={dir} onSort={toggleSort} system={system} selected={selected} onSelect={setSelected} onTotal={setTotal} />}
      {dialog && (
        <RunDialog
          storyIds={dialog === "selected" ? [...selected] : undefined}
          filter={dialog === "filter" ? filter : undefined}
          count={dialog === "selected" ? selected.size : (total ?? 0)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <StoriesPage />
    </Suspense>
  );
}
