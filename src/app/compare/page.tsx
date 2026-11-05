"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { SideBySide } from "@/components/diff-view";
import { api, usd } from "@/lib/client/api";

interface Side {
  prompt: string | null;
  output: string;
  status: string;
  decided: string;
  cost: number | null;
}
interface Comparison {
  a: { runStoryId: number; storyId: number; version: { label: string } | null };
  b: { runStoryId: number; storyId: number; version: { label: string } | null };
  steps: { stepId: string; name: string; a: Side | null; b: Side | null; same: boolean }[];
}

function Compare() {
  const sp = useSearchParams();
  const a = sp.get("a");
  const b = sp.get("b");
  const [c, setC] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyChanged, setOnlyChanged] = useState(true);
  const [what, setWhat] = useState<"output" | "prompt">("output");
  useEffect(() => {
    if (!a || !b) return;
    api<Comparison>(`/api/traces/compare?a=${a}&b=${b}`).then(setC).catch((e: Error) => setError(e.message));
  }, [a, b]);
  if (!a || !b) return <p className="text-sm text-stone-600">Open a flow and choose “Compare with”, or give ?a= and ?b= run-story ids.</p>;
  if (error) return <p className="text-red-700">{error}</p>;
  if (!c) return <p className="text-stone-500">Loading…</p>;
  const steps = onlyChanged ? c.steps.filter((s) => !s.same) : c.steps;
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Compare two runs of story {c.a.storyId}</h1>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Link className="card p-2 hover:bg-stone-50" href={`/flow/${c.a.runStoryId}`}>
          <b>Left:</b> {c.a.version?.label}
        </Link>
        <Link className="card p-2 hover:bg-stone-50" href={`/flow/${c.b.runStoryId}`}>
          <b>Right:</b> {c.b.version?.label}
        </Link>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> Only steps that differ ({c.steps.filter((s) => !s.same).length} of {c.steps.length})
        </label>
        <div className="flex gap-1">
          <button className={what === "output" ? "tab-on" : "tab"} onClick={() => setWhat("output")}>
            Outputs
          </button>
          <button className={what === "prompt" ? "tab-on" : "tab"} onClick={() => setWhat("prompt")}>
            Prompts
          </button>
        </div>
      </div>
      {steps.map((s) => (
        <div key={s.stepId} className="card p-3">
          <div className="mb-1 flex flex-wrap items-baseline gap-2">
            <h2 className="font-semibold">{s.name}</h2>
            <span className="font-mono text-xs text-stone-400">{s.stepId}</span>
            {s.same && <span className="chip">same</span>}
          </div>
          <div className="mb-2 grid grid-cols-2 gap-2 text-xs text-stone-600">
            <div>
              {s.a ? `${s.a.status} · ${s.a.decided} · ${usd(s.a.cost, 5)}` : "not in the left run"}
            </div>
            <div>
              {s.b ? `${s.b.status} · ${s.b.decided} · ${usd(s.b.cost, 5)}` : "not in the right run"}
            </div>
          </div>
          {what === "output" ? <SideBySide before={s.a?.output ?? ""} after={s.b?.output ?? ""} /> : <SideBySide before={s.a?.prompt ?? "(no prompt)"} after={s.b?.prompt ?? "(no prompt)"} />}
        </div>
      ))}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Compare />
    </Suspense>
  );
}
