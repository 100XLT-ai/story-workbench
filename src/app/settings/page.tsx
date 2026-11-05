"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { authorName } from "@/lib/client/name";

interface Usage {
  databaseMb: number;
  databaseLimitMb: number;
  runs: number;
  storiesRun: number;
  traces: number;
  modelCalls: number;
  spendUsd: number;
  storiesLast30Days: number;
  workflowEventsEstimate: number;
  workflowEventsNote: string;
}
interface HistoryRow {
  id: number;
  author: string;
  createdAt: string;
  value: unknown;
}

const FIELDS: { key: string; label: string; help: string; kind: "text" | "line" | "number" | "list" }[] = [
  { key: "prompt_editor_system", label: "Prompt editor: system prompt", help: "The model that turns a comment into changed prompt text reads this.", kind: "text" },
  { key: "prompt_editor_model", label: "Prompt editor: model", help: "Default anthropic/claude-opus-4.6.", kind: "line" },
  { key: "ask_system", label: "Ask box: system prompt", help: "Turns a plain request into filter chips. {{fields}} becomes the list of story fields.", kind: "text" },
  { key: "ask_model", label: "Ask box: model", help: "", kind: "line" },
  { key: "run_concurrency", label: "Run concurrency", help: "At most this many stories of one run work at the same time.", kind: "number" },
  { key: "default_models", label: "Default models list (one per line)", help: "Shown first in the editor's model search.", kind: "list" },
];

function Field({ f, value, onSaved }: { f: (typeof FIELDS)[number]; value: unknown; onSaved: () => void }) {
  const toText = (v: unknown) => (f.kind === "list" ? (Array.isArray(v) ? v.join("\n") : "") : String(v ?? ""));
  const [draft, setDraft] = useState(toText(value));
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(toText(value)), [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    setBusy(true);
    const v = f.kind === "number" ? Number(draft) : f.kind === "list" ? draft.split("\n").map((x) => x.trim()).filter(Boolean) : draft;
    await api("/api/settings", { body: { key: f.key, value: v, author: authorName() } });
    setBusy(false);
    onSaved();
  };
  return (
    <div className="card p-4">
      <div className="flex items-baseline gap-2">
        <h2 className="font-semibold">{f.label}</h2>
        <button className="ml-auto text-xs underline" onClick={async () => setHistory((await api<{ history: HistoryRow[] }>(`/api/settings?history=${f.key}`)).history)}>
          History
        </button>
      </div>
      {f.help && <p className="text-sm text-stone-600">{f.help}</p>}
      {f.kind === "text" || f.kind === "list" ? (
        <textarea className="input mt-2 h-48 w-full font-mono text-xs" value={draft} onChange={(e) => setDraft(e.target.value)} />
      ) : (
        <input className="input mt-2 w-96 font-mono text-sm" value={draft} onChange={(e) => setDraft(e.target.value)} type={f.kind === "number" ? "number" : "text"} />
      )}
      <div className="mt-2">
        <button className="btn-primary" onClick={save} disabled={busy || draft === toText(value)}>
          Save
        </button>
      </div>
      {history && (
        <ul className="mt-2 space-y-1 text-xs text-stone-600">
          {history.length === 0 && <li>No change yet: the built-in default is in use.</li>}
          {history.map((h) => (
            <li key={h.id}>
              {h.createdAt.slice(0, 16)} UTC by <b>{h.author}</b>: <span className="font-mono">{JSON.stringify(h.value).slice(0, 140)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [data, setData] = useState<{ settings: Record<string, unknown>; usage: Usage } | null>(null);
  const load = () => api<{ settings: Record<string, unknown>; usage: Usage }>("/api/settings").then(setData);
  useEffect(() => {
    load();
  }, []);
  if (!data) return <p className="text-stone-500">Loading…</p>;
  const u = data.usage;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <div className="card grid gap-3 p-4 text-sm sm:grid-cols-4">
        <div>
          <div className="label">Database</div>
          <b>{u.databaseMb} MB</b> of {u.databaseLimitMb} MB (Neon free tier)
        </div>
        <div>
          <div className="label">Runs</div>
          {u.runs} runs · {u.storiesRun} stories · {u.modelCalls} model calls
        </div>
        <div>
          <div className="label">Model spend</div>
          <b>${u.spendUsd.toFixed(4)}</b> in all runs
        </div>
        <div>
          <div className="label">Workflow usage</div>
          about <b>{u.workflowEventsEstimate.toLocaleString()}</b> events · {u.storiesLast30Days} stories in 30 days
          <div className="text-xs text-stone-500">{u.workflowEventsNote}</div>
        </div>
      </div>
      {FIELDS.map((f) => (
        <Field key={f.key} f={f} value={data.settings[f.key]} onSaved={load} />
      ))}
    </div>
  );
}
