"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, usd } from "@/lib/client/api";
import { authorName } from "@/lib/client/name";
import type { FilterClause } from "@/lib/engine/types";

interface VersionRow {
  id: number;
  label: string;
  family: string;
  number: string;
}
interface Estimate {
  stories: number;
  steps: { id: string; name: string; kind: string; when: boolean }[];
  promptSteps: { stepId: string; model: string; basis: string; costPerStory: number }[];
  costPerStory: number;
  total: number;
  note: string;
}

/** Pick a version, see the steps and the cost estimate, then start the run (§5.1). */
export function RunDialog({ storyIds, filter, count, onClose, defaultVersion }: { storyIds?: number[]; filter?: FilterClause[]; count: number; onClose: () => void; defaultVersion?: number }) {
  const router = useRouter();
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [versionId, setVersionId] = useState<number | null>(defaultVersion ?? null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ versions: VersionRow[] }>("/api/versions").then((r) => {
      setVersions(r.versions);
      if (!versionId) setVersionId(r.versions.find((v) => v.family === "Staged writer")?.id ?? r.versions[0]?.id ?? null);
    });
  }, [versionId]);

  useEffect(() => {
    if (!versionId) return;
    setEstimate(null);
    api<Estimate>("/api/runs/estimate", { body: { version_id: versionId, story_ids: storyIds, filter: storyIds?.length ? undefined : filter } })
      .then(setEstimate)
      .catch((e: Error) => setError(e.message));
  }, [versionId, storyIds, filter]);

  const start = async () => {
    if (!versionId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ runId: number }>("/api/runs", {
        body: { version_id: versionId, story_ids: storyIds?.length ? storyIds : undefined, filter: storyIds?.length ? undefined : filter, author: authorName(), note: note || undefined, overrides: date ? { generation_date: date } : undefined },
      });
      router.push(`/runs/${r.runId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const tooMany = count > 500;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="card max-h-[90vh] w-[640px] overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold">Run {count} {count === 1 ? "story" : "stories"}</h2>
        <p className="mt-1 text-sm text-stone-600">The run works on the server. You can close this page; it goes on.</p>
        <label className="label mt-4 block">Version</label>
        <select className="input mt-1 w-full" value={versionId ?? ""} onChange={(e) => setVersionId(Number(e.target.value))}>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="label block">Generation date (optional)</label>
            <input type="date" className="input mt-1 w-full" value={date} onChange={(e) => setDate(e.target.value)} />
            <p className="mt-1 text-xs text-stone-500">Empty: each story uses its job&apos;s run date.</p>
          </div>
          <div>
            <label className="label block">Note (optional)</label>
            <input className="input mt-1 w-full" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this run" />
          </div>
        </div>
        <div className="mt-4 rounded-md bg-stone-50 p-3 text-sm">
          {estimate ? (
            <>
              <div className="flex items-baseline justify-between">
                <span>
                  Estimated cost: <b>{usd(estimate.total, 2)}</b> ({usd(estimate.costPerStory, 4)} per story)
                </span>
                <span className="text-xs text-stone-500">{estimate.note}</span>
              </div>
              <div className="mt-2 text-xs text-stone-600">
                {estimate.steps.length} steps, {estimate.promptSteps.length} model calls:{" "}
                {estimate.promptSteps.map((s) => `${s.stepId} (${s.model.split("/")[1] ?? s.model}, ${usd(s.costPerStory, 4)}${s.basis === "past traces" ? ", from past runs" : ""})`).join(" · ")}
              </div>
            </>
          ) : (
            <span className="text-stone-500">Computing the estimate…</span>
          )}
        </div>
        {tooMany && <p className="mt-3 text-sm text-red-700">A run holds 1 to 500 stories. Narrow the filter or select rows.</p>}
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={start} disabled={busy || !versionId || tooMany || count === 0}>
            {busy ? "Starting…" : "Start the run"}
          </button>
        </div>
      </div>
    </div>
  );
}
