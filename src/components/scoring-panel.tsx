"use client";

import Link from "next/link";
import { useState } from "react";
import type { Part, StoryScoring } from "@/lib/scoring/explain";
import type { SystemId } from "@/lib/scoring/systems";

const CHECK: Record<string, { text: string; cls: string; title: string }> = {
  match: { text: "matches", cls: "border-emerald-300 bg-emerald-50 text-emerald-800", title: "longtale-core's own function, run on the stored inputs, gives the stored value." },
  differs: { text: "differs", cls: "border-amber-300 bg-amber-50 text-amber-900", title: "The recomputed value is not the stored value. The note says why (most often an input the snapshot does not keep)." },
  rebuilt: { text: "rebuilt", cls: "border-sky-300 bg-sky-50 text-sky-900", title: "longtale-core did not store this value. The app rebuilt it from stored fields." },
  "not stored": { text: "not stored", cls: "border-stone-300 bg-stone-50 text-stone-600", title: "The snapshot has no stored value to compare with." },
};

export const fmtVal = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? "—" : typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(v < 1 ? 3 : 2)) : v);

export function CheckBadge({ check }: { check: Part["check"] }) {
  if (!check) return null;
  const c = CHECK[check];
  return (
    <span className={`chip whitespace-nowrap text-[11px] ${c.cls}`} title={c.title}>
      {c.text}
    </span>
  );
}

function Row({ p, strong = false }: { p: Part; strong?: boolean }) {
  return (
    <tr className={strong ? "bg-stone-50 font-medium" : ""}>
      <td className="whitespace-nowrap pr-2 align-top">{p.label}</td>
      <td className="align-top text-stone-700">
        {p.input}
        {p.note && <div className="text-xs text-stone-500">{p.note}</div>}
      </td>
      <td className="align-top text-xs text-stone-500">{p.band ?? ""}</td>
      <td className="whitespace-nowrap text-right align-top tabular-nums">{fmtVal(p.computed)}</td>
      <td className="whitespace-nowrap text-right align-top tabular-nums">{fmtVal(p.stored)}</td>
      <td className="align-top">
        <CheckBadge check={p.check} />
      </td>
    </tr>
  );
}

/** Each ranking system's raw inputs next to its scores, for one story (Part 2, D48). */
export function ScoringPanel({ scoring }: { scoring: StoryScoring | null | undefined }) {
  const ids = scoring ? (Object.keys(scoring.systems) as SystemId[]) : [];
  const [tab, setTab] = useState<SystemId | null>(scoring?.rankedBy ?? null);
  if (!scoring) return null;
  const e = scoring.systems[tab ?? scoring.rankedBy] ?? scoring.systems["cause-score@v1"];
  if (!e) return null;
  return (
    <section className="card p-3" aria-labelledby="scoring">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 id="scoring" className="font-semibold">
          Scoring: inputs and scores
        </h2>
        <span className="text-xs text-stone-500">
          Ranked by <b>{scoring.rankedBy}</b>
          {scoring.rankingSystem === "untagged" && scoring.rankedBy === "weighted-grade@v1" ? " (untagged: the job ran before the version column existed)" : ""} · rank time {scoring.rankTime ?? "?"} ·{" "}
          <Link href="/guide/scoring" className="text-blue-700 hover:underline">
            how each system works
          </Link>
        </span>
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        {ids.map((id) => (
          <button key={id} className={id === e.system ? "tab-on" : "tab"} onClick={() => setTab(id)}>
            {id}
            {scoring.systems[id]?.ranked ? " (ranked this job)" : ""}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="tbl w-full text-sm">
          <thead>
            <tr>
              <th>Part</th>
              <th>Raw input</th>
              <th>Band or rule</th>
              <th className="text-right" title="The value longtale-core's own function gives on the stored inputs">Recomputed</th>
              <th className="text-right">Stored</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {e.parts.map((p) => (
              <Row key={p.key} p={p} />
            ))}
            {e.score && <Row p={e.score} strong />}
            {e.grade && <Row p={e.grade} strong />}
            {e.confidence && <Row p={e.confidence} />}
          </tbody>
        </table>
      </div>
    </section>
  );
}
