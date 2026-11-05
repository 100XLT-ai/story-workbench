"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DiffList, type FieldDiff } from "@/components/diff-view";
import { api } from "@/lib/client/api";
import { authorName } from "@/lib/client/name";
import type { Step } from "@/lib/engine/types";

interface Proposal {
  changes: { step_id: string; field: string; new_value: unknown }[];
  reason: string;
  diff: FieldDiff[];
  issues: { message: string }[];
  error: string | null;
  model: string;
}

export const DRAFT_KEY = (id: number) => `story-workbench:draft:${id}`;

/** A comment to the prompt editor (§4 way 2): it returns changed prompt text and a reason; the person saves, edits or drops it. */
export function CommentBox({ versionId, steps, onEditFirst }: { versionId: number; steps: Step[]; onEditFirst?: (changes: Proposal["changes"]) => void }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [stepId, setStepId] = useState("");
  const [traceId, setTraceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [p, setP] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setBusy(true);
    setError(null);
    setP(null);
    try {
      setP(await api<Proposal>("/api/propose-edit", { body: { version_id: versionId, step_id: stepId || null, comment, trace: traceId ? { run_story_id: Number(traceId) } : null, author: authorName() } }));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  const save = async () => {
    if (!p) return;
    setBusy(true);
    try {
      const v = await api<{ id: number }>("/api/versions", { body: { parent_id: versionId, changes: p.changes, note: comment, author: authorName() } });
      router.push(`/versions/${v.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="card space-y-2 p-4">
      <h2 className="font-semibold">Comment: ask the prompt editor for a change</h2>
      <p className="text-sm text-stone-600">Write what you want, for example “Headlines must be 8 words or fewer”. A model proposes the changed prompt text and a reason. Nothing is saved until you save it.</p>
      <textarea className="input h-20 w-full" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Make the headlines shorter" aria-label="Comment" />
      <div className="flex flex-wrap items-center gap-2">
        <select className="input" value={stepId} onChange={(e) => setStepId(e.target.value)} aria-label="Target step">
          <option value="">All steps</option>
          {steps
            .filter((s) => s.kind === "prompt")
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.id})
              </option>
            ))}
        </select>
        <input className="input w-56" value={traceId} onChange={(e) => setTraceId(e.target.value.replace(/\D/g, ""))} placeholder="Trace that shows the problem (run story id, optional)" />
        <button className="btn-primary" onClick={ask} disabled={busy || !comment.trim()}>
          {busy && !p ? "Asking the prompt editor…" : "Propose a change"}
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {p && (
        <div className="space-y-2 border-t border-stone-100 pt-2">
          <div className="text-sm">
            <span className="label mr-2">Reason</span>
            {p.reason || "(no reason given)"} <span className="text-xs text-stone-500">({p.model})</span>
          </div>
          {p.error && <p className="text-sm text-red-700">{p.error}</p>}
          {p.issues.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-red-700">
              {p.issues.map((i, k) => (
                <li key={k}>{i.message}</li>
              ))}
            </ul>
          )}
          <DiffList diff={p.diff} />
          <div className="flex gap-2">
            <button className="btn-primary" onClick={save} disabled={busy || !!p.error || p.issues.length > 0 || p.changes.length === 0}>
              Save as a new version
            </button>
            <button
              className="btn"
              onClick={() => {
                if (onEditFirst) onEditFirst(p.changes);
                else {
                  try {
                    sessionStorage.setItem(DRAFT_KEY(versionId), JSON.stringify({ changes: p.changes, note: comment }));
                  } catch {
                    /* ignore */
                  }
                  router.push(`/versions/${versionId}/edit?draft=1`);
                }
              }}
              disabled={p.changes.length === 0}
            >
              Edit it first
            </button>
            <button className="btn" onClick={() => setP(null)}>
              Drop it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
