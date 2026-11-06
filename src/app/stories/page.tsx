"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { FilterBar, type Field } from "@/components/filter-bar";
import { RunDialog } from "@/components/run-dialog";
import { api } from "@/lib/client/api";
import type { FilterClause } from "@/lib/engine/types";

type Row = Record<string, unknown>;
interface Result {
  total: number;
  rows: Row[];
}

const camel = (s: string) => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const DEFAULT_COLS = ["id", "sponsor_name", "story_headline", "rank", "winner", "weighted_score", "quote_count", "fact_count", "page_count", "usable_image_count", "runnable_production", "runnable_v3", "publisher_name"];
const PAGE = 50;

function cell(v: unknown, type: Field["type"] | undefined) {
  if (v === null || v === undefined || v === "") return <span className="text-stone-300">—</span>;
  if (type === "boolean") return v ? <span className="text-emerald-700">yes</span> : <span className="text-stone-400">no</span>;
  if (typeof v === "number") return Number.isInteger(v) ? v : v.toFixed(2);
  const s = String(v);
  return s.length > 90 ? `${s.slice(0, 89)}…` : s;
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
  const [sort, setSort] = useState(sp.get("sort") ?? "id");
  const [dir, setDir] = useState<"asc" | "desc">(sp.get("dir") === "desc" ? "desc" : "asc");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [cols, setCols] = useState<string[]>(DEFAULT_COLS);
  const [showCols, setShowCols] = useState(false);
  const [dialog, setDialog] = useState<null | "selected" | "filter">(null);

  useEffect(() => {
    api<{ fields: Field[] }>("/api/stories/fields").then((r) => setFields(r.fields));
    try {
      const c = localStorage.getItem("story-workbench:cols");
      if (c) setCols(JSON.parse(c) as string[]);
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const q = new URLSearchParams({ filter: JSON.stringify(filter), sort, dir, limit: String(PAGE), offset: String(offset) });
      setData(await api<Result>(`/api/stories?${q}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [filter, sort, dir, offset]);

  useEffect(() => {
    load();
    const q = new URLSearchParams();
    if (filter.length) q.set("f", JSON.stringify(filter));
    if (sort !== "id") q.set("sort", sort);
    if (dir === "desc") q.set("dir", dir);
    router.replace(`/stories${q.size ? `?${q}` : ""}`, { scroll: false });
  }, [load, filter, sort, dir, router]);

  const changeFilter = (f: FilterClause[]) => {
    setFilter(f);
    setOffset(0);
  };
  const toggleSort = (name: string) => {
    if (sort === name) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(name);
      setDir(["rank", "id", "sponsor_name", "story_headline"].includes(name) ? "asc" : "desc");
    }
    setOffset(0);
  };
  const setColumns = (c: string[]) => {
    setCols(c);
    try {
      localStorage.setItem("story-workbench:cols", JSON.stringify(c));
    } catch {
      /* ignore */
    }
  };
  const fieldOf = (n: string) => fields.find((f) => f.name === n);
  const rows = data?.rows ?? [];
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(Number(r.id)));

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
      <FilterBar fields={fields} filter={filter} onChange={changeFilter} count={data?.total ?? null} />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={selected.size === 0} onClick={() => setDialog("selected")}>
          Run with… ({selected.size} selected)
        </button>
        <button className="btn" disabled={!data || data.total === 0} onClick={() => setDialog("filter")} title="Run every story that matches the filter (1 to 500)">
          Run the current filter ({data?.total.toLocaleString() ?? "…"})
        </button>
        {selected.size > 0 && (
          <button className="text-xs text-stone-500 underline" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        )}
        <div className="relative ml-auto">
          <button className="btn btn-sm" onClick={() => setShowCols(!showCols)}>
            Columns ({cols.length})
          </button>
          {showCols && (
            <div className="card absolute right-0 z-30 mt-1 max-h-96 w-72 overflow-auto p-2 shadow-lg">
              {fields.map((f) => (
                <label key={f.name} className="flex items-center gap-2 py-0.5 text-sm">
                  <input type="checkbox" checked={cols.includes(f.name)} onChange={(e) => setColumns(e.target.checked ? [...cols, f.name] : cols.filter((c) => c !== f.name))} />
                  {f.label}
                </label>
              ))}
              <button className="btn btn-sm mt-2" onClick={() => setColumns(DEFAULT_COLS)}>
                Reset
              </button>
            </div>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="card overflow-x-auto">
        <table className="tbl w-full">
          <thead>
            <tr>
              <th className="w-8">
                <input
                  type="checkbox"
                  aria-label="Select the page"
                  checked={allOnPage}
                  onChange={(e) => {
                    const s = new Set(selected);
                    for (const r of rows) e.target.checked ? s.add(Number(r.id)) : s.delete(Number(r.id));
                    setSelected(s);
                  }}
                />
              </th>
              {cols.map((c) => (
                <th key={c} className="cursor-pointer select-none leading-tight" onClick={() => toggleSort(c)} title={fieldOf(c)?.description}>
                  {fieldOf(c)?.label ?? c} {sort === c ? (dir === "asc" ? "▲" : "▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const id = Number(r.id);
              return (
                <tr key={id} className={selected.has(id) ? "bg-amber-50" : "hover:bg-stone-50"}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select story ${id}`}
                      checked={selected.has(id)}
                      onChange={(e) => {
                        const s = new Set(selected);
                        e.target.checked ? s.add(id) : s.delete(id);
                        setSelected(s);
                      }}
                    />
                  </td>
                  {cols.map((c) => (
                    <td key={c} className={c === "story_headline" || c === "description" ? "min-w-[220px]" : c === "sponsor_name" ? "max-w-[170px]" : "whitespace-nowrap"}>
                      {c === "id" ? (
                        <Link className="text-blue-700 hover:underline" href={`/stories/${id}`}>
                          {id}
                        </Link>
                      ) : c === "story_headline" ? (
                        <Link className="hover:underline" href={`/stories/${id}`}>
                          {cell(r.storyHeadline ?? r.description, "text")}
                        </Link>
                      ) : (
                        cell(r[camel(c)], fieldOf(c)?.type)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
            {data && rows.length === 0 && (
              <tr>
                <td colSpan={cols.length + 1} className="py-6 text-center text-stone-500">
                  No story matches this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <button className="btn btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
          ← Previous
        </button>
        <span>
          {data ? `${(offset + 1).toLocaleString()}–${Math.min(offset + PAGE, data.total).toLocaleString()} of ${data.total.toLocaleString()}` : "…"}
        </span>
        <button className="btn btn-sm" disabled={!data || offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>
          Next →
        </button>
      </div>
      {dialog && (
        <RunDialog
          storyIds={dialog === "selected" ? [...selected] : undefined}
          filter={dialog === "filter" ? filter : undefined}
          count={dialog === "selected" ? selected.size : (data?.total ?? 0)}
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
