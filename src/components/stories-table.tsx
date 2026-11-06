"use client";

import Link from "next/link";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type VisibilityState } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import type { FilterClause } from "@/lib/engine/types";
import type { Part, StoryScoring } from "@/lib/scoring/explain";
import type { SystemId } from "@/lib/scoring/systems";
import type { Field } from "./filter-bar";
import { NoPagesBadge } from "./no-pages-badge";
import { CheckBadge, fmtVal } from "./scoring-panel";

type Row = Record<string, unknown> & { id: number; scoring?: StoryScoring | null; __empty?: true };

const CHUNK = 200;
const ROW_H = 52;
const camel = (s: string) => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

export const DEFAULT_VISIBLE = ["sponsor_name", "run_date", "ranking_system", "rank", "winner", "weighted_score", "deal_grade", "quote_count", "fact_count", "page_count", "text_page_count", "runnable_v3", "publisher_name"];
const PINNED = ["select", "id", "story_headline"];
const GROUP_LABEL: Record<string, string> = { story: "Story", ranking: "Ranking (stored)", sponsor: "Sponsor and job", evidence: "Evidence", runnable: "Runnable" };

/** Column sets per scoring system: the explainer part key, a header, and the stored field it sorts by (if any). */
export const SYSTEM_COLUMNS: Record<SystemId, { key: string; label: string; sort?: string; from?: "score" | "grade" | "confidence" }[]> = {
  "cause-score@v1": [
    { key: "recency", label: "Recency", sort: "score_recency" },
    { key: "amount", label: "Amount", sort: "score_amount" },
    { key: "attendance", label: "Attendance", sort: "score_attendance" },
    { key: "attribution", label: "Attribution", sort: "score_attribution" },
    { key: "beneficiaryInterest", label: "Beneficiary interest", sort: "score_beneficiary_interest" },
    { key: "evidenceCompleteness", label: "Evidence completeness", sort: "score_evidence_completeness" },
    { key: "total", label: "Total", sort: "total", from: "score" },
  ],
  "weighted-grade@v1": [
    { key: "tier_impact", label: "Impact tier", sort: "tier_impact" },
    { key: "tier_recency", label: "Recency tier", sort: "tier_recency" },
    { key: "tier_reach", label: "Reach tier", sort: "tier_reach" },
    { key: "tier_evidence", label: "Evidence tier", sort: "tier_evidence" },
    { key: "tier_attribution", label: "Attribution tier", sort: "tier_attribution" },
    { key: "tier_image", label: "Image tier (rebuilt)" },
    { key: "nudge", label: "Nudge" },
    { key: "weighted_score", label: "v1 score", sort: "weighted_score", from: "score" },
    { key: "deal_grade", label: "Deal grade", sort: "deal_grade", from: "grade" },
    { key: "confidence", label: "Confidence", sort: "confidence", from: "confidence" },
  ],
  "weighted-grade@v2": [
    { key: "tier_impact", label: "Impact tier", sort: "tier_impact" },
    { key: "tier_recency", label: "Recency tier", sort: "tier_recency" },
    { key: "tier_market", label: "Market tier", sort: "tier_market" },
    { key: "tier_evidence", label: "Evidence tier", sort: "tier_evidence" },
    { key: "tier_attribution", label: "Attribution tier", sort: "tier_attribution" },
    { key: "tier_image", label: "Image tier", sort: "tier_image" },
    { key: "nudge", label: "Nudge" },
    { key: "weighted_score", label: "v2 score", sort: "weighted_score", from: "score" },
    { key: "deal_grade", label: "Deal grade", sort: "deal_grade", from: "grade" },
    { key: "confidence", label: "Confidence", sort: "confidence", from: "confidence" },
  ],
  "simple-score@v1": [
    { key: "recency", label: "Recency (rebuilt)" },
    { key: "local", label: "Local (rebuilt)" },
    { key: "impact", label: "Impact (rebuilt)" },
    { key: "proof", label: "Proof (rebuilt)" },
    { key: "photo", label: "Photo (rebuilt)" },
    { key: "weighted_score", label: "Points", sort: "weighted_score", from: "score" },
    { key: "deal_grade", label: "Deal grade", sort: "deal_grade", from: "grade" },
    { key: "confidence", label: "Confidence", sort: "confidence", from: "confidence" },
  ],
};

/** The stories that each system ranked, as a ranking_system filter clause. */
export const SYSTEM_FILTER: Record<SystemId, FilterClause | null> = {
  "cause-score@v1": null,
  "weighted-grade@v1": { field: "ranking_system", op: "in", value: ["untagged", "weighted-grade@v1"] },
  "weighted-grade@v2": { field: "ranking_system", op: "eq", value: "weighted-grade@v2" },
  "simple-score@v1": { field: "ranking_system", op: "eq", value: "simple-score@v1" },
};

function plain(v: unknown, type: Field["type"] | undefined) {
  if (v === null || v === undefined || v === "") return <span className="text-stone-300">—</span>;
  if (type === "boolean") return v ? <span className="text-emerald-700">yes</span> : <span className="text-stone-400">no</span>;
  if (type === "date") return String(v).slice(0, 10);
  if (typeof v === "number") return Number.isInteger(v) ? v : v.toFixed(2);
  const s = String(v);
  return s.length > 90 ? `${s.slice(0, 89)}…` : s;
}

function partOf(row: Row, system: SystemId, col: (typeof SYSTEM_COLUMNS)[SystemId][number]): Part | null {
  const e = row.scoring?.systems[system];
  if (!e) return null;
  if (col.from === "score") return e.score ?? null;
  if (col.from === "grade") return e.grade ?? null;
  if (col.from === "confidence") return e.confidence ?? null;
  return e.parts.find((p) => p.key === col.key) ?? null;
}

function ScoreCell({ p }: { p: Part | null }) {
  if (!p) return <span className="text-stone-300" title="This system did not rank this story">—</span>;
  const value = p.stored ?? p.computed;
  return (
    <div className="leading-tight" title={[p.input, p.band, p.note].filter(Boolean).join("\n")}>
      <div className="flex items-center gap-1">
        <b className="tabular-nums">{fmtVal(value)}</b>
        {p.check && p.check !== "match" && p.check !== "rebuilt" && <CheckBadge check={p.check} />}
      </div>
      <div className="truncate text-[11px] text-stone-500">{p.input}</div>
    </div>
  );
}

export interface StoriesTableProps {
  fields: Field[];
  filter: FilterClause[];
  sort: string;
  dir: "asc" | "desc";
  onSort: (name: string) => void;
  system: SystemId | null;
  selected: Set<number>;
  onSelect: (s: Set<number>) => void;
  onTotal: (n: number | null) => void;
}

/** The stories table: TanStack columns, server-side sort and filter, virtual scrolling over every row (Part 3, D49). */
export function StoriesTable({ fields, filter, sort, dir, onSort, system, selected, onSelect, onTotal }: StoriesTableProps) {
  const [total, setTotal] = useState<number | null>(null);
  const [chunks, setChunks] = useState<Map<number, Row[]>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const loading = useRef(new Set<number>());
  const gen = useRef(0);
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const [showCols, setShowCols] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Column visibility: saved per browser.
  useEffect(() => {
    try {
      const v = localStorage.getItem("story-workbench:visibility-v2");
      if (v) setVisibility(JSON.parse(v) as VisibilityState);
    } catch {
      /* ignore */
    }
  }, []);
  const saveVisibility = (v: VisibilityState) => {
    setVisibility(v);
    try {
      localStorage.setItem("story-workbench:visibility-v2", JSON.stringify(v));
    } catch {
      /* ignore */
    }
  };

  const key = JSON.stringify({ filter, sort, dir, explain: !!system });
  const loadChunk = useCallback(
    async (i: number, g: number) => {
      if (loading.current.has(i)) return;
      loading.current.add(i);
      try {
        const q = new URLSearchParams({ filter: JSON.stringify(filter), sort, dir, limit: String(CHUNK), offset: String(i * CHUNK) });
        if (system) q.set("explain", "1");
        const r = await api<{ total: number; rows: Row[] }>(`/api/stories?${q}`);
        if (g !== gen.current) return;
        setTotal(r.total);
        onTotal(r.total);
        setChunks((m) => new Map(m).set(i, r.rows));
      } catch (e) {
        if (g === gen.current) setError((e as Error).message);
      } finally {
        loading.current.delete(i);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  // A new filter, sort or explain setting starts over at the top.
  useEffect(() => {
    gen.current += 1;
    loading.current.clear();
    setChunks(new Map());
    setTotal(null);
    setError(null);
    onTotal(null);
    scrollRef.current?.scrollTo({ top: 0 });
    loadChunk(0, gen.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const data = useMemo<Row[]>(() => {
    const n = total ?? 0;
    const out: Row[] = new Array(n);
    for (let i = 0; i < n; i++) out[i] = chunks.get(Math.floor(i / CHUNK))?.[i % CHUNK] ?? { id: -1 - i, __empty: true };
    return out;
  }, [total, chunks]);

  const fieldOf = useCallback((n: string) => fields.find((f) => f.name === n), [fields]);

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    const sortable = (name: string, label: string) => (
      <button className="text-left leading-tight hover:underline" onClick={() => onSort(name)} title={fieldOf(name)?.description}>
        {label} {sort === name ? (dir === "asc" ? "▲" : "▼") : ""}
      </button>
    );
    const base: ColumnDef<Row>[] = [
      {
        id: "select",
        size: 36,
        enableHiding: false,
        header: () => null,
        cell: ({ row }) =>
          row.original.__empty ? null : (
            <input
              type="checkbox"
              aria-label={`Select story ${row.original.id}`}
              checked={selected.has(row.original.id)}
              onChange={(e) => {
                const s = new Set(selected);
                if (e.target.checked) s.add(row.original.id);
                else s.delete(row.original.id);
                onSelect(s);
              }}
            />
          ),
      },
      {
        id: "id",
        size: 70,
        enableHiding: false,
        header: () => sortable("id", "Story id"),
        cell: ({ row }) =>
          row.original.__empty ? null : (
            <Link className="text-blue-700 hover:underline" href={`/stories/${row.original.id}`}>
              {row.original.id}
            </Link>
          ),
      },
      {
        id: "story_headline",
        size: 300,
        enableHiding: false,
        header: () => sortable("story_headline", "Headline"),
        cell: ({ row }) =>
          row.original.__empty ? (
            <span className="text-stone-300">loading…</span>
          ) : (
            <div className="line-clamp-2 leading-tight">
              <Link className="hover:underline" href={`/stories/${row.original.id}`}>
                {String(row.original.storyHeadline ?? row.original.description ?? "—")}
              </Link>
              {row.original.pageCount === 0 && <NoPagesBadge className="ml-1" />}
            </div>
          ),
      },
    ];
    const groups = new Map<string, Field[]>();
    for (const f of fields) {
      if (["id", "story_headline"].includes(f.name)) continue;
      groups.set(f.group, [...(groups.get(f.group) ?? []), f]);
    }
    const fieldGroups: ColumnDef<Row>[] = [...groups].map(([g, fs]) => ({
      id: `group:${g}`,
      header: GROUP_LABEL[g] ?? g,
      columns: fs.map<ColumnDef<Row>>((f) => ({
        id: f.name,
        size: f.type === "text" ? (["description", "story_angle", "tiebreak_reasoning", "idea_title"].includes(f.name) ? 260 : 150) : f.type === "date" ? 100 : 90,
        header: () => sortable(f.name, f.label),
        cell: ({ row }) => (row.original.__empty ? null : plain(row.original[camel(f.name)], f.type)),
      })),
    }));
    const scoring: ColumnDef<Row>[] = system
      ? [
          {
            id: `group:system`,
            header: `Scoring: ${system} (score above, raw input below)`,
            columns: SYSTEM_COLUMNS[system].map<ColumnDef<Row>>((col) => ({
              id: `sys:${col.key}`,
              size: 170,
              enableHiding: false,
              header: () => (col.sort ? sortable(col.sort, col.label) : <span className="leading-tight">{col.label}</span>),
              cell: ({ row }) => (row.original.__empty ? null : <ScoreCell p={partOf(row.original, system, col)} />),
            })),
          },
        ]
      : [];
    return [...base, ...scoring, ...fieldGroups];
  }, [fields, sort, dir, onSort, system, selected, onSelect, fieldOf]);

  // Default visibility: DEFAULT_VISIBLE on, the other registry fields off.
  const effectiveVisibility = useMemo<VisibilityState>(() => {
    const v: VisibilityState = {};
    for (const f of fields) if (!["id", "story_headline"].includes(f.name)) v[f.name] = visibility[f.name] ?? DEFAULT_VISIBLE.includes(f.name);
    return v;
  }, [fields, visibility]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (r) => String(r.id),
    state: { columnVisibility: effectiveVisibility, columnPinning: { left: PINNED } },
    onColumnVisibilityChange: (u) => saveVisibility(typeof u === "function" ? u(effectiveVisibility) : u),
    manualSorting: true,
    manualFiltering: true,
    columnResizeMode: "onChange",
  });

  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 12 });
  const items = virtualizer.getVirtualItems();

  // Load the chunks that the visible rows need.
  useEffect(() => {
    const need = new Set(items.map((it) => Math.floor(it.index / CHUNK)));
    for (const c of need) if (!chunks.has(c)) loadChunk(c, gen.current);
  }, [items, chunks, loadChunk]);

  const leafs = table.getVisibleLeafColumns();
  const left = (id: string) => {
    const i = PINNED.indexOf(id);
    if (i < 0) return undefined;
    return PINNED.slice(0, i).reduce((t, p) => t + (table.getColumn(p)?.getSize() ?? 0), 0);
  };
  const width = leafs.reduce((t, c) => t + c.getSize(), 0);
  const padTop = items[0]?.start ?? 0;
  const padBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0;
  const loaded = [...chunks.values()].flat();
  const allLoadedSelected = loaded.length > 0 && loaded.every((r) => selected.has(r.id));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-stone-600">
          <input
            type="checkbox"
            checked={allLoadedSelected}
            onChange={(e) => {
              const s = new Set(selected);
              for (const r of loaded) {
                if (e.target.checked) s.add(r.id);
                else s.delete(r.id);
              }
              onSelect(s);
            }}
          />
          Select the {loaded.length.toLocaleString()} loaded rows
        </label>
        <div className="relative ml-auto">
          <button className="btn btn-sm" onClick={() => setShowCols(!showCols)}>
            Columns ({leafs.length - PINNED.length})
          </button>
          {showCols && (
            <div className="card absolute right-0 z-30 mt-1 max-h-[28rem] w-80 overflow-auto p-2 shadow-lg">
              {[...new Set(fields.map((f) => f.group))].map((g) => (
                <div key={g} className="mb-2">
                  <div className="label mb-1">{GROUP_LABEL[g] ?? g}</div>
                  {fields
                    .filter((f) => f.group === g && !["id", "story_headline"].includes(f.name))
                    .map((f) => (
                      <label key={f.name} className="flex items-center gap-2 py-0.5 text-sm" title={f.description}>
                        <input type="checkbox" checked={effectiveVisibility[f.name] ?? false} onChange={(e) => saveVisibility({ ...effectiveVisibility, [f.name]: e.target.checked })} />
                        {f.label}
                      </label>
                    ))}
                </div>
              ))}
              <button className="btn btn-sm" onClick={() => saveVisibility({})}>
                Reset
              </button>
            </div>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div ref={scrollRef} className="card relative h-[calc(100vh-260px)] min-h-[420px] overflow-auto" data-testid="stories-scroll">
        <table className="tbl" style={{ width, tableLayout: "fixed" }}>
          <colgroup>
            {leafs.map((c) => (
              <col key={c.id} style={{ width: c.getSize() }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-20 bg-white">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const pinned = !h.isPlaceholder && h.subHeaders.length === 0 ? left(h.column.id) : undefined;
                  return (
                    <th
                      key={h.id}
                      colSpan={h.colSpan}
                      className={`${h.subHeaders.length ? "border-b border-stone-200 text-center text-[11px] uppercase tracking-wide text-stone-500" : "align-bottom"} ${pinned !== undefined ? "sticky z-10 bg-white" : ""}`}
                      style={pinned !== undefined ? { left: pinned } : undefined}
                    >
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {padTop > 0 && (
              <tr>
                <td colSpan={leafs.length} style={{ height: padTop, padding: 0, border: 0 }} />
              </tr>
            )}
            {items.map((it) => {
              const row = rows[it.index];
              const on = selected.has(row.original.id);
              return (
                <tr key={row.id} style={{ height: ROW_H }} className={on ? "bg-amber-50" : "hover:bg-stone-50"}>
                  {row.getVisibleCells().map((cell) => {
                    const pinned = left(cell.column.id);
                    return (
                      <td key={cell.id} className={`overflow-hidden ${pinned !== undefined ? `sticky z-[5] ${on ? "bg-amber-50" : "bg-white"}` : ""}`} style={pinned !== undefined ? { left: pinned } : undefined}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {padBottom > 0 && (
              <tr>
                <td colSpan={leafs.length} style={{ height: padBottom, padding: 0, border: 0 }} />
              </tr>
            )}
            {total === 0 && (
              <tr>
                <td colSpan={leafs.length} className="py-6 text-center text-stone-500">
                  No story matches this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-500">
        {total === null ? "Loading…" : `${total.toLocaleString()} stories · ${loaded.length.toLocaleString()} loaded · scroll to load more`}
      </p>
    </div>
  );
}
