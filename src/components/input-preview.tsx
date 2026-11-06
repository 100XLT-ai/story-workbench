"use client";

import { Fragment, useState } from "react";
import { api } from "@/lib/client/api";

interface PreviewStep {
  index: number;
  id: string;
  name: string;
  kind: "prompt" | "code";
  status: "ready" | "slots" | "skipped" | "waits" | "error";
  reason: string;
  model?: string;
  reasoning?: Record<string, unknown> | null;
  temperature?: number | null;
  maxTokens?: number | null;
  messages?: { role: string; content: string }[];
  tokens?: number;
  slots: { name: string; fromStep: number; fromName: string }[];
  error?: string;
}
interface Preview {
  version: string | null;
  steps: PreviewStep[];
  model_steps: number;
  tokens_known: number;
  tokens_all_rendered: number;
  page_text_tokens: { stepId: string; token: string }[];
  note: string;
}

const STATUS: Record<PreviewStep["status"], string> = {
  ready: "every value known",
  slots: "has model-output slots",
  skipped: "skipped",
  waits: "runs only if a model output allows",
  error: "fails on these inputs",
};

export const thinking = (r: Record<string, unknown> | null | undefined) => {
  if (!r) return "no reasoning field";
  if (r.enabled === false || r.effort === "none") return "thinking off";
  if (typeof r.effort === "string") return `effort ${r.effort}`;
  if (typeof r.max_tokens === "number") return `budget ${r.max_tokens} tokens`;
  return JSON.stringify(r);
};

/** Marks ⟦slots⟧ inside a rendered message. */
function Marked({ text }: { text: string }) {
  const parts = text.split(/(⟦[^⟧]*⟧)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("⟦") ? (
          <mark key={i} className="rounded bg-sky-100 px-0.5 text-sky-900">
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/** "Preview inputs": what every step receives for one story. Free: no model call (Part 4, D47). */
export function InputPreview({ versionId, storyId, generationDate, compact = false }: { versionId: number | null; storyId: number | null; generationDate?: string; compact?: boolean }) {
  const [data, setData] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyModels, setOnlyModels] = useState(true);

  const load = async () => {
    if (!versionId || !storyId) return;
    setBusy(true);
    setError(null);
    try {
      setData(await api<Preview>("/api/preview-inputs", { body: { version_id: versionId, story_id: storyId, overrides: generationDate ? { generation_date: generationDate } : undefined } }));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  const steps = (data?.steps ?? []).filter((s) => !onlyModels || s.kind === "prompt");
  return (
    <div className={compact ? "text-sm" : "card p-4 text-sm"}>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-sm" onClick={load} disabled={busy || !versionId || !storyId}>
          {busy ? "Rendering…" : data ? "Preview again" : "Preview inputs (free, no model call)"}
        </button>
        {data && (
          <>
            <span className="text-xs text-stone-600">
              {data.model_steps} model steps · about {data.tokens_all_rendered.toLocaleString()} tokens of rendered text
              {data.page_text_tokens.length ? ` · ${data.page_text_tokens.length} prompt tokens read raw page text` : " · no prompt reads raw page text"}
            </span>
            <label className="ml-auto flex items-center gap-1 text-xs">
              <input type="checkbox" checked={onlyModels} onChange={(e) => setOnlyModels(e.target.checked)} /> Model steps only
            </label>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-red-700">{error}</p>}
      {data && (
        <>
          <p className="mt-2 text-xs text-stone-500">
            {data.note} <mark className="rounded bg-sky-100 px-0.5 text-sky-900">⟦name: from step N⟧</mark> marks a slot.
          </p>
          <div className="mt-2 space-y-1">
            {steps.map((s) => (
              <details key={s.id} className="rounded border border-stone-200">
                <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-2 px-2 py-1">
                  <span className="text-stone-400">{s.index}</span>
                  <b>{s.name}</b>
                  <span className="font-mono text-xs text-stone-500">{s.id}</span>
                  {s.kind === "prompt" && (
                    <span className="text-xs text-stone-600">
                      {s.model} · {thinking(s.reasoning)}
                      {s.maxTokens ? ` · max ${s.maxTokens}` : ""}
                    </span>
                  )}
                  <span className={`chip text-[11px] ${s.status === "error" ? "border-red-300 bg-red-50" : s.status === "slots" || s.status === "waits" ? "border-sky-300 bg-sky-50" : ""}`}>{STATUS[s.status]}</span>
                  {s.tokens ? <span className="ml-auto text-xs text-stone-500">~{s.tokens.toLocaleString()} tokens</span> : null}
                </summary>
                <div className="space-y-2 border-t border-stone-100 p-2">
                  <p className="text-xs text-stone-600">{s.reason}</p>
                  {s.error && <p className="text-xs text-red-700">{s.error}</p>}
                  {s.messages?.map((m, i) => (
                    <div key={i}>
                      <div className="label">{m.role}</div>
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-stone-50 p-2 font-mono text-xs">
                        <Marked text={m.content} />
                      </pre>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
