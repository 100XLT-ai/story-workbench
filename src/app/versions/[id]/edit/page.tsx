"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useMemo, useRef, useState } from "react";
import { CommentBox, DRAFT_KEY } from "@/components/comment-box";
import { DiffList, type FieldDiff } from "@/components/diff-view";
import { TokenEditor, type TokenEditorHandle } from "@/components/token-editor";
import { api } from "@/lib/client/api";
import { authorName } from "@/lib/client/name";
import { applyChanges } from "@/lib/version-logic";
import type { CodeStep, FilterClause, PromptStep, ReasoningSetting, Step, VersionDefinition } from "@/lib/engine/types";

interface Version {
  id: number;
  label: string;
  family: string;
  definition: VersionDefinition;
}
interface Fn {
  name: string;
  description: string;
  inputs: string[];
  outputs: string[];
  params: Record<string, unknown>;
}
interface ModelInfo {
  id: string;
  prompt: number;
  completion: number;
}

const INPUT_TOKENS: Record<string, string[]> = {
  story: ["story.description", "story.beneficiary", "story.evidenceQuote", "story.storyHeadline", "story.storyAngle", "story.impactTypePrimary", "story.impactValueRaw", "story.ideaTitle", "story.ideaDescription"],
  org: ["org.name", "org.description", "org.industry"],
  brand: ["brand.facebookHandle", "brand.toneOfVoice", "brand.brandVoice"],
  settings: ["settings.publisher", "settings.sponsor", "settings.generation_date", "settings.target_words", "settings.min_words", "settings.max_words"],
  pages: ["pages|json"],
};
const ROOTS = ["story", "org", "brand", "pages", "other_pages", "crawl_rows", "settings"];
const REASONING: { label: string; value: string }[] = [
  { label: "none sent", value: "null" },
  { label: "off", value: '"off"' },
  { label: "minimal", value: '"minimal"' },
  { label: "low", value: '"low"' },
  { label: "medium", value: '"medium"' },
  { label: "high", value: '"high"' },
];

function newPromptStep(id: string, after: Step | undefined): PromptStep {
  return {
    kind: "prompt",
    id,
    name: "New prompt step",
    purpose: "Say in one sentence what this step does.",
    part: after?.part ?? "other",
    inputs: ["article"],
    outputs: [id],
    system: null,
    user: "Write a short social post about this article.\n\nTitle: {{article.title}}\n\n{{article.content}}",
    model: "google/gemini-3.5-flash",
    temperature: 0.7,
    maxTokens: 2000,
    reasoning: null,
    format: "text",
  };
}

function Editor({ id }: { id: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [base, setBase] = useState<Version | null>(null);
  const [def, setDef] = useState<VersionDefinition | null>(null);
  const [sel, setSel] = useState(0);
  const [fns, setFns] = useState<Fn[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [saving, setSaving] = useState<null | { diff: FieldDiff[]; issues: { message: string }[] }>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paramsText, setParamsText] = useState("");
  const [paramsError, setParamsError] = useState<string | null>(null);
  const [settingsText, setSettingsText] = useState("");
  const focused = useRef<"system" | "user">("user");
  const sysRef = useRef<TokenEditorHandle>(null);
  const userRef = useRef<TokenEditorHandle>(null);

  useEffect(() => {
    api<Version>(`/api/versions/${id}`).then((v) => {
      setBase(v);
      let d = structuredClone(v.definition);
      if (sp.get("draft")) {
        try {
          const raw = sessionStorage.getItem(DRAFT_KEY(v.id));
          if (raw) {
            const draft = JSON.parse(raw) as { changes: Parameters<typeof applyChanges>[1]; note: string };
            d = applyChanges(d, draft.changes);
            setNote(draft.note);
          }
        } catch {
          /* ignore */
        }
      }
      setDef(d);
      setSettingsText(JSON.stringify(d.settings, null, 2));
    });
    api<{ functions: Fn[] }>("/api/registry").then((r) => setFns(r.functions));
    api<{ models: ModelInfo[] }>("/api/models").then((r) => setModels(r.models));
  }, [id, sp]);

  const step = def?.steps[sel];
  useEffect(() => {
    if (step?.kind === "code") setParamsText(JSON.stringify(step.params ?? {}, null, 2));
    setParamsError(null);
  }, [sel, step?.id, step?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const available = useMemo(() => {
    const out = new Set<string>(ROOTS);
    def?.steps.slice(0, sel).forEach((s) => s.outputs.forEach((o) => out.add(o)));
    return out;
  }, [def, sel]);

  if (!def || !base || !step) return <p className="text-stone-500">Loading the editor…</p>;

  const update = (patch: Partial<PromptStep> | Partial<CodeStep>) => {
    const steps = def.steps.map((s, i) => (i === sel ? ({ ...s, ...patch } as Step) : s));
    setDef({ ...def, steps });
  };
  const move = (d: -1 | 1) => {
    const to = sel + d;
    if (to < 0 || to >= def.steps.length) return;
    const steps = [...def.steps];
    [steps[sel], steps[to]] = [steps[to], steps[sel]];
    setDef({ ...def, steps });
    setSel(to);
  };
  const remove = () => {
    if (!confirm(`Remove the step "${step.name}"?`)) return;
    setDef({ ...def, steps: def.steps.filter((_, i) => i !== sel) });
    setSel(Math.max(0, sel - 1));
  };
  const uniqueId = (stem: string) => {
    let n = 1;
    while (def.steps.some((s) => s.id === `${stem}_${n}`)) n++;
    return `${stem}_${n}`;
  };
  const addPrompt = () => {
    const sid = uniqueId("extra");
    const s = newPromptStep(sid, step);
    const steps = [...def.steps];
    steps.splice(sel + 1, 0, s);
    setDef({ ...def, steps });
    setSel(sel + 1);
  };
  const addCode = (fnName: string) => {
    const fn = fns.find((f) => f.name === fnName);
    if (!fn) return;
    const s: CodeStep = { kind: "code", id: uniqueId(fn.name), name: fn.name, purpose: fn.description, part: step.part ?? "other", fn: fn.name, params: {}, inputs: fn.inputs, outputs: fn.outputs };
    const steps = [...def.steps];
    steps.splice(sel + 1, 0, s);
    setDef({ ...def, steps });
    setSel(sel + 1);
  };
  const insertToken = (t: string) => (focused.current === "system" ? sysRef : userRef).current?.insert(`{{${t}}}`);

  const openSave = async () => {
    setError(null);
    let settings: Record<string, unknown>;
    try {
      settings = JSON.parse(settingsText) as Record<string, unknown>;
    } catch {
      setError("The settings are not valid JSON.");
      return;
    }
    const next = { ...def, settings };
    setDef(next);
    try {
      setSaving(await api<{ diff: FieldDiff[]; issues: { message: string }[] }>("/api/versions/preview", { body: { parent_id: base.id, definition: next } }));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const v = await api<{ id: number }>("/api/versions", { body: { parent_id: base.id, definition: def, note, author: authorName() } });
      try {
        sessionStorage.removeItem(DRAFT_KEY(base.id));
      } catch {
        /* ignore */
      }
      router.push(`/versions/${v.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const tokenList = [...available].flatMap((r) => (INPUT_TOKENS[r] ? INPUT_TOKENS[r] : [r]));
  const priceOf = (m: string) => models.find((x) => x.id === m);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-xs text-stone-500">
            <Link href={`/versions/${base.id}`} className="hover:underline">
              {base.label}
            </Link>{" "}
            / editor
          </div>
          <h1 className="text-xl font-semibold">Edit {base.label}</h1>
          <p className="text-sm text-stone-600">Your changes become a new version in {base.family}. The version you edit stays as it is.</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Link className="btn" href={`/versions/${base.id}`}>
            Cancel
          </Link>
          <button className="btn-primary" onClick={openSave}>
            Save as a new version…
          </button>
        </div>
      </div>
      {error && <p className="whitespace-pre-wrap text-sm text-red-700">{error}</p>}
      <div className="grid grid-cols-[260px_1fr] gap-4">
        <div className="card h-fit p-2">
          <div className="label px-1 pb-1">Steps</div>
          <ol className="max-h-[70vh] overflow-auto">
            {def.steps.map((s, i) => (
              <li key={`${s.id}-${i}`}>
                <button className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-sm ${i === sel ? "bg-stone-900 text-white" : "hover:bg-stone-100"}`} onClick={() => setSel(i)}>
                  <span className="w-5 text-right text-[11px] opacity-60">{i + 1}</span>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.kind === "prompt" ? "bg-violet-500" : "bg-stone-400"}`} />
                  <span className="truncate">{s.name}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-2 space-y-1.5 border-t border-stone-100 pt-2">
            <div className="flex gap-1">
              <button className="btn btn-sm" onClick={() => move(-1)} disabled={sel === 0}>
                ↑ Up
              </button>
              <button className="btn btn-sm" onClick={() => move(1)} disabled={sel === def.steps.length - 1}>
                ↓ Down
              </button>
              <button className="btn btn-sm text-red-700" onClick={remove}>
                Remove
              </button>
            </div>
            <button className="btn btn-sm w-full" onClick={addPrompt}>
              + Add a prompt step after this one
            </button>
            <select className="input w-full text-xs" value="" onChange={(e) => addCode(e.target.value)} aria-label="Add a code step">
              <option value="">+ Add a code step after this one…</option>
              {fns.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="min-w-0 space-y-3">
          <div className="card space-y-3 p-4">
            <div className="grid grid-cols-[1fr_200px_140px] gap-3">
              <label className="text-sm">
                <span className="label block">Name</span>
                <input className="input mt-1 w-full" value={step.name} onChange={(e) => update({ name: e.target.value })} />
              </label>
              <label className="text-sm">
                <span className="label block">Id (context name)</span>
                <input className="input mt-1 w-full font-mono" value={step.id} onChange={(e) => update({ id: e.target.value.replace(/[^\w]/g, "_") })} />
              </label>
              <label className="text-sm">
                <span className="label block">Part</span>
                <select className="input mt-1 w-full" value={step.part ?? "other"} onChange={(e) => update({ part: e.target.value as Step["part"] })}>
                  <option value="article">article</option>
                  <option value="social">social</option>
                  <option value="ad">ad</option>
                  <option value="other">other</option>
                </select>
              </label>
            </div>
            <label className="block text-sm">
              <span className="label block">Purpose (one sentence on the flow card)</span>
              <input className="input mt-1 w-full" value={step.purpose} onChange={(e) => update({ purpose: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="label block">Inputs (comma list)</span>
                <input className="input mt-1 w-full font-mono text-xs" value={step.inputs.join(", ")} onChange={(e) => update({ inputs: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
              </label>
              <label className="text-sm">
                <span className="label block">Outputs (comma list)</span>
                <input className="input mt-1 w-full font-mono text-xs" value={step.outputs.join(", ")} onChange={(e) => update({ outputs: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
              </label>
            </div>
            <WhenEditor key={`${sel}-${step.id}`} when={step.when ?? []} onChange={(w) => update({ when: w.length ? w : undefined })} />
          </div>
          {step.kind === "prompt" ? (
            <div className="card space-y-3 p-4">
              <div className="grid grid-cols-[1fr_110px_110px_130px_120px] gap-3">
                <label className="text-sm">
                  <span className="label block">Model</span>
                  <input className="input mt-1 w-full font-mono text-xs" list="models" value={step.model} onChange={(e) => update({ model: e.target.value })} />
                  <datalist id="models">
                    {models.map((m) => (
                      <option key={m.id} value={m.id} />
                    ))}
                  </datalist>
                  <span className="text-[11px] text-stone-500">{priceOf(step.model) ? `$${(priceOf(step.model)!.prompt * 1e6).toFixed(2)} in / $${(priceOf(step.model)!.completion * 1e6).toFixed(2)} out per million tokens` : models.length ? "not in OpenRouter's list" : ""}</span>
                </label>
                <label className="text-sm">
                  <span className="label block">Temperature</span>
                  <input className="input mt-1 w-full" type="number" step="0.1" value={step.temperature ?? ""} onChange={(e) => update({ temperature: e.target.value === "" ? null : Number(e.target.value) })} />
                </label>
                <label className="text-sm">
                  <span className="label block">Max tokens</span>
                  <input className="input mt-1 w-full" type="number" value={step.maxTokens ?? ""} onChange={(e) => update({ maxTokens: e.target.value === "" ? null : Number(e.target.value) })} />
                </label>
                <label className="text-sm">
                  <span className="label block">Reasoning</span>
                  <select className="input mt-1 w-full" value={JSON.stringify(step.reasoning)} onChange={(e) => update({ reasoning: JSON.parse(e.target.value) as ReasoningSetting })}>
                    {REASONING.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                    {!REASONING.some((r) => r.value === JSON.stringify(step.reasoning)) && <option value={JSON.stringify(step.reasoning)}>{JSON.stringify(step.reasoning)}</option>}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="label block">Output format</span>
                  <select className="input mt-1 w-full" value={step.format} onChange={(e) => update({ format: e.target.value as PromptStep["format"] })}>
                    <option value="json">json (parsed)</option>
                    <option value="json_raw">json (text kept)</option>
                    <option value="text">text</option>
                  </select>
                </label>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <span className="label">System prompt</span>
                  {step.system === null ? (
                    <button className="text-xs underline" onClick={() => update({ system: "" })}>
                      Add a system prompt
                    </button>
                  ) : (
                    <button className="text-xs underline" onClick={() => update({ system: null })}>
                      Send no system message
                    </button>
                  )}
                </div>
                {step.system !== null && <TokenEditor ref={sysRef} label="System prompt" value={step.system} onChange={(v) => update({ system: v })} rows={14} onFocus={() => (focused.current = "system")} known={available} />}
              </div>
              <div>
                <span className="label">User prompt</span>
                <TokenEditor ref={userRef} label="User prompt" value={step.user} onChange={(v) => update({ user: v })} rows={10} onFocus={() => (focused.current = "user")} known={available} />
              </div>
              <div>
                <span className="label">Tokens you can use here (click to insert)</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {tokenList.map((t) => (
                    <button key={t} className="chip font-mono hover:bg-amber-50" onClick={() => insertToken(t)}>
                      {`{{${t}}}`}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-stone-500">A value that is not text needs a filter: |json (compact), |json1 or |json2. A red token is unknown here, and the save stops on it.</p>
              </div>
            </div>
          ) : (
            <div className="card space-y-2 p-4">
              <label className="block text-sm">
                <span className="label block">Code function</span>
                <select className="input mt-1" value={step.fn} onChange={(e) => update({ fn: e.target.value })}>
                  {fns.map((f) => (
                    <option key={f.name} value={f.name}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-sm text-stone-600">{fns.find((f) => f.name === step.fn)?.description}</p>
              <span className="label block">Parameters (JSON)</span>
              <textarea
                className="input h-72 w-full font-mono text-xs"
                value={paramsText}
                onChange={(e) => {
                  setParamsText(e.target.value);
                  try {
                    update({ params: JSON.parse(e.target.value) as Record<string, unknown> });
                    setParamsError(null);
                  } catch {
                    setParamsError("Not valid JSON yet.");
                  }
                }}
              />
              {paramsError && <p className="text-xs text-red-700">{paramsError}</p>}
              <details className="text-xs">
                <summary className="cursor-pointer text-stone-600">Parameter schema</summary>
                <pre className="pre mt-1">{JSON.stringify(fns.find((f) => f.name === step.fn)?.params ?? {}, null, 2)}</pre>
              </details>
            </div>
          )}
          <div className="card p-4">
            <span className="label block">Version settings (JSON: word targets, Facebook limit)</span>
            <textarea className="input mt-1 h-28 w-full font-mono text-xs" value={settingsText} onChange={(e) => setSettingsText(e.target.value)} />
          </div>
          <CommentBox
            versionId={base.id}
            steps={def.steps}
            onEditFirst={(changes) => {
              try {
                setDef(applyChanges(def, changes));
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
        </div>
      </div>
      {saving && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onClick={() => setSaving(null)}>
          <div className="card max-h-[90vh] w-[1000px] overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold">Save as a new version of {base.family}</h2>
            <p className="text-sm text-stone-600">Every changed field, side by side. Removed text is red; added text is green.</p>
            {saving.issues.length > 0 && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <b>The save stops:</b>
                <ul className="list-disc pl-5">
                  {saving.issues.map((i, k) => (
                    <li key={k}>{i.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-3">
              <DiffList diff={saving.diff} />
            </div>
            <label className="mt-3 block text-sm">
              <span className="label block">Note (why this version)</span>
              <input className="input mt-1 w-full" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: shorter headlines" />
            </label>
            {error && <p className="mt-2 whitespace-pre-wrap text-sm text-red-700">{error}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button className="btn" onClick={() => setSaving(null)}>
                Back to the editor
              </button>
              <button className="btn-primary" onClick={save} disabled={busy || saving.issues.length > 0 || !note.trim() || saving.diff.length === 0}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WhenEditor({ when, onChange }: { when: FilterClause[]; onChange: (w: FilterClause[]) => void }) {
  const [text, setText] = useState(JSON.stringify(when));
  const [bad, setBad] = useState(false);
  return (
    <label className="block text-sm">
      <span className="label block">Runs only when (filter clauses on the context; [] = always)</span>
      <input
        className={`input mt-1 w-full font-mono text-xs ${bad ? "border-red-400" : ""}`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const v = JSON.parse(e.target.value || "[]") as FilterClause[];
            if (!Array.isArray(v)) throw new Error();
            setBad(false);
            onChange(v);
          } catch {
            setBad(true);
          }
        }}
        placeholder='[{"field":"story.impactValueRaw","op":"is_null"}]'
      />
    </label>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <Editor id={id} />
    </Suspense>
  );
}
