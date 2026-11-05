"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { readableFor, type ClaimIndex } from "@/components/readable";
import { api, usd } from "@/lib/client/api";
import { describeClause } from "@/lib/engine/filter";
import { templateTokens } from "@/lib/engine/template";
import type { Step, VersionDefinition } from "@/lib/engine/types";

interface TraceStep {
  stepIndex: number;
  stepId: string;
  stepName: string;
  kind: string;
  status: string;
  reason: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  tokensReasoning: number | null;
  cost: number | null;
  error: string | null;
  seconds: number | null;
  decided: string;
  body: { messages?: { role: string; content: string }[]; request?: Record<string, unknown>; text?: string; notes?: string[]; input?: Record<string, unknown>; output?: Record<string, unknown>; response?: unknown } | null;
}
interface Trace {
  runId: number;
  runStoryId: number;
  storyId: number;
  status: string;
  error: string | null;
  failedStep: string | null;
  cost: number;
  version: { id: number; label: string } | null;
  definition: VersionDefinition | null;
  steps: TraceStep[];
}
interface StoryInfo {
  story: { storyHeadline: string | null; storyAngle: string | null; description: string | null; sponsorName: string | null; rank: number | null; winner: boolean };
  settings: Record<string, unknown>;
  runs: { runStoryId: number; runId: number; version: string; status: string }[];
}

const INPUTS = new Set(["story", "org", "brand", "pages", "other_pages", "crawl_rows", "settings"]);
const PARTS: { key: Step["part"]; title: string; text: string }[] = [
  { key: "article", title: "1. The article", text: "From the story's facts to the title, subtitle and content." },
  { key: "social", title: "2. The social posts", text: "Each post reads this run's article." },
  { key: "ad", title: "3. The ad copy", text: "Headline, subheadline and CTA for the display ad." },
  { key: "other", title: "4. Other steps", text: "Steps a person added." },
];

function readsOf(step: Step): string[] {
  const names = new Set(step.inputs.map((i) => i.split(".")[0]));
  for (const c of step.when ?? []) names.add(c.field.split(".")[0]);
  if (step.kind === "prompt") for (const t of [...templateTokens(step.system ?? ""), ...templateTokens(step.user)]) names.add(t.root);
  return [...names];
}

function statusBadge(s: string) {
  const cls =
    s === "done" ? "bg-emerald-100 text-emerald-800" : s === "skipped" ? "bg-stone-200 text-stone-600" : s === "failed" ? "bg-red-100 text-red-800" : s === "running" ? "bg-sky-100 text-sky-800" : "bg-stone-100 text-stone-400";
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${cls}`}>{s}</span>;
}

function Highlight({ text }: { text: string }) {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("{{") ? (
          <span key={i} className="token">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}

function Card({ step, index, trace, producers, claims, sponsor, onJump }: { step: Step; index: number; trace?: TraceStep; producers: Map<string, number>; claims: ClaimIndex; sponsor?: string; onJump: (i: number) => void }) {
  const status = trace?.status ?? "not run";
  const output = trace?.body?.output ?? {};
  const readable = step.outputs.map((o) => ({ name: o, node: readableFor(o, output[o], claims, sponsor) })).filter((x) => x.node);
  const [tab, setTabRaw] = useState<string>(readable.length ? "readable" : "");
  // Clicking the open tab closes it, so long prompts and JSON stay out of the way.
  const setTab = (t: string) => setTabRaw(tab === t ? "" : t);
  const reads = readsOf(step);
  return (
    <div id={`step-${index}`} className={`card scroll-mt-20 ${status === "skipped" || status === "not run" ? "opacity-80" : ""}`}>
      <div className="flex flex-wrap items-start gap-2 border-b border-stone-100 px-4 py-2.5">
        <span className="mt-0.5 font-mono text-xs text-stone-400">#{index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{step.name}</h3>
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${step.kind === "prompt" ? "bg-violet-100 text-violet-800" : "bg-stone-100 text-stone-700"}`}>{step.kind === "prompt" ? "model call" : "code"}</span>
            {statusBadge(status)}
            <span className="font-mono text-xs text-stone-400">{step.id}</span>
          </div>
          <p className="mt-0.5 text-sm text-stone-600">{step.purpose}</p>
        </div>
        <div className="text-right text-xs text-stone-500">
          {step.kind === "prompt" && <div className="font-mono text-stone-700">{trace?.model ?? step.model}</div>}
          {trace && (
            <div>
              {trace.cost !== null ? usd(trace.cost, 5) : ""} {trace.seconds !== null ? `· ${trace.seconds.toFixed(1)} s` : ""}
              {trace.tokensIn ? ` · ${trace.tokensIn}→${trace.tokensOut} tok${trace.tokensReasoning ? ` (${trace.tokensReasoning} thinking)` : ""}` : ""}
            </div>
          )}
        </div>
      </div>
      <div className="space-y-2 px-4 py-2.5">
        <div className="text-sm">
          <span className="label mr-2">Decided</span>
          <span className={status === "failed" ? "text-red-700" : "text-stone-900"}>{status === "not run" ? "This step did not run (an earlier step stopped the story, or the run is still working)." : trace?.decided}</span>
        </div>
        {step.when?.length ? (
          <div className="text-xs text-stone-600">
            <span className="label mr-2">Runs only when</span>
            {step.when.map(describeClause).join(" and ")}
            {trace?.reason && <span className="ml-2 text-stone-500">→ {trace.reason}</span>}
          </div>
        ) : null}
        {trace?.error && <pre className="pre border border-red-200 bg-red-50 text-red-800">{trace.error}</pre>}
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="label mr-1">Reads</span>
          {reads.map((r) => {
            const from = producers.get(`${index}:${r}`);
            return from !== undefined ? (
              <button key={r} className="chip hover:bg-stone-100" onClick={() => onJump(from)} title={`Made by step #${from + 1}`}>
                {r} ← #{from + 1}
              </button>
            ) : (
              <span key={r} className="chip border-amber-300 bg-amber-50" title="A fixed story input">
                {r} (story input)
              </span>
            );
          })}
          <span className="label ml-3 mr-1">Writes</span>
          {step.outputs.map((o) => (
            <span key={o} className="chip border-sky-300 bg-sky-50">
              {o}
            </span>
          ))}
        </div>
        {trace && (
          <div>
            <div className="mb-2 flex items-center gap-1">
              {!tab && <span className="mr-1 text-xs text-stone-400">Open:</span>}
              {readable.length > 0 && (
                <button className={tab === "readable" ? "tab-on" : "tab"} onClick={() => setTab("readable")}>
                  Readable
                </button>
              )}
              {step.kind === "prompt" && (
                <button className={tab === "prompt" ? "tab-on" : "tab"} onClick={() => setTab("prompt")}>
                  Prompt
                </button>
              )}
              <button className={tab === "input" ? "tab-on" : "tab"} onClick={() => setTab("input")}>
                Input
              </button>
              <button className={tab === "output" ? "tab-on" : "tab"} onClick={() => setTab("output")}>
                Output
              </button>
              {step.kind === "prompt" && (
                <button className={tab === "raw" ? "tab-on" : "tab"} onClick={() => setTab("raw")}>
                  Raw
                </button>
              )}
              {step.kind === "prompt" && (
                <button className={tab === "template" ? "tab-on" : "tab"} onClick={() => setTab("template")}>
                  Template
                </button>
              )}
            </div>
            {tab === "readable" &&
              readable.map((r) => (
                <div key={r.name} className="mb-3">
                  {readable.length > 1 && <div className="label mb-1">{r.name}</div>}
                  {r.node}
                </div>
              ))}
            {tab === "prompt" && (
              <div className="space-y-2">
                {(trace.body?.messages ?? []).map((m, i) => (
                  <div key={i}>
                    <div className="label mb-0.5">
                      {m.role} message · {[...m.content].length.toLocaleString()} characters
                    </div>
                    <pre className="pre">{m.content}</pre>
                  </div>
                ))}
                {trace.body?.request && (
                  <div className="text-xs text-stone-600">
                    <span className="label mr-2">Sent with</span>
                    <span className="font-mono">{JSON.stringify(trace.body.request)}</span>
                  </div>
                )}
                {trace.body?.notes?.length ? <div className="text-xs text-amber-800">{trace.body.notes.join("; ")}</div> : null}
                {!trace.body?.messages && <p className="text-sm text-stone-500">No prompt: the step was skipped.</p>}
              </div>
            )}
            {tab === "input" && <pre className="pre">{JSON.stringify(trace.body?.input ?? {}, null, 2)}</pre>}
            {tab === "output" && <pre className="pre">{JSON.stringify(output, null, 2)}</pre>}
            {tab === "raw" && <pre className="pre">{trace.body?.text ?? JSON.stringify(trace.body?.response ?? null, null, 2)}</pre>}
            {tab === "template" && step.kind === "prompt" && (
              <div className="space-y-2">
                {step.system && (
                  <div>
                    <div className="label mb-0.5">system template</div>
                    <pre className="pre">
                      <Highlight text={step.system} />
                    </pre>
                  </div>
                )}
                <div>
                  <div className="label mb-0.5">user template</div>
                  <pre className="pre">
                    <Highlight text={step.user} />
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Connector({ names }: { names: { name: string; from: number; direct: boolean }[] }) {
  return (
    <div className="flex items-stretch gap-2 pl-8">
      <div className="flex w-4 flex-col items-center">
        <div className="w-px flex-1 bg-stone-300" />
        <div className="text-[10px] leading-none text-stone-400">▼</div>
      </div>
      <div className="flex flex-wrap items-center gap-1 py-1.5">
        {names.length ? (
          names.map((n) => (
            <span key={n.name} className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${n.direct ? "bg-sky-100 text-sky-900" : "bg-stone-100 text-stone-600"}`} title={`made by step #${n.from + 1}`}>
              {n.name}
              {n.direct ? "" : ` ← #${n.from + 1}`}
            </span>
          ))
        ) : (
          <span className="text-[11px] text-stone-400">reads only the story inputs</span>
        )}
      </div>
    </div>
  );
}

export default function FlowPage({ params }: { params: Promise<{ runStoryId: string }> }) {
  const { runStoryId } = use(params);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [story, setStory] = useState<StoryInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const t = await api<Trace>(`/api/run-stories/${runStoryId}`);
        if (stop) return;
        setTrace(t);
        if (!story) setStory(await api<StoryInfo>(`/api/stories/${t.storyId}`));
        if (["running", "queued", "pending"].includes(t.status)) setTimeout(load, 4000);
      } catch (e) {
        setError((e as Error).message);
      }
    };
    load();
    return () => {
      stop = true;
    };
  }, [runStoryId, story]);

  const def = trace?.definition;
  const byIndex = useMemo(() => {
    const m = new Map<number, TraceStep>();
    for (const s of trace?.steps ?? []) m.set(s.stepIndex, s);
    return m;
  }, [trace]);

  // Lineage: for each step and each name it reads, the latest earlier step that wrote that name.
  const producers = useMemo(() => {
    const m = new Map<string, number>();
    if (!def) return m;
    const last = new Map<string, number>();
    def.steps.forEach((s, i) => {
      for (const r of readsOf(s)) if (!INPUTS.has(r) && last.has(r)) m.set(`${i}:${r}`, last.get(r) as number);
      for (const o of s.outputs) {
        const t = byIndex.get(i);
        if (!t || t.status !== "skipped" || !last.has(o)) last.set(o, i);
      }
    });
    return m;
  }, [def, byIndex]);

  const claims: ClaimIndex = useMemo(() => {
    const map = new Map<string, { text: string; speaker?: string | null }>();
    for (const s of trace?.steps ?? []) {
      const p = s.body?.output?.prepared as { ledger?: { claims?: { id: string; text: string }[]; quotes?: { id: string; text: string; speaker?: string | null }[] } } | undefined;
      for (const c of p?.ledger?.claims ?? []) map.set(c.id, { text: c.text });
      for (const q of p?.ledger?.quotes ?? []) map.set(q.id, { text: `“${q.text}”`, speaker: q.speaker });
    }
    return map;
  }, [trace]);

  if (error) return <p className="text-red-700">{error}</p>;
  if (!trace || !def) return <p className="text-stone-500">Loading the flow…</p>;

  const angleRead = def.steps.some((s) => s.kind === "prompt" && /story\.storyAngle/.test(`${s.system ?? ""} ${s.user}`));
  const jump = (i: number) => document.getElementById(`step-${i}`)?.scrollIntoView({ behavior: "smooth" });
  const others = (story?.runs ?? []).filter((r) => r.runStoryId !== trace.runStoryId);
  const article = [...trace.steps].reverse().find((s) => s.body?.output?.article)?.body?.output?.article as { title?: string } | undefined;

  return (
    <div className="grid grid-cols-[1fr_220px] gap-5">
      <div className="min-w-0 space-y-3">
        <div className="card p-4">
          <div className="text-xs text-stone-500">
            <Link href={`/runs/${trace.runId}`} className="hover:underline">
              Run {trace.runId}
            </Link>{" "}
            · {trace.version?.label} · story{" "}
            <Link href={`/stories/${trace.storyId}`} className="hover:underline">
              {trace.storyId}
            </Link>
          </div>
          <h1 className="mt-1 text-xl font-semibold">{story?.story.sponsorName}: {story?.story.storyHeadline ?? story?.story.description?.slice(0, 100)}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
            {statusBadge(trace.status)}
            <span>Real cost {usd(trace.cost, 4)}</span>
            {article?.title && <span>Article: “{article.title}”</span>}
            {trace.failedStep && <span className="text-red-700">Stopped at {trace.failedStep}: {trace.error}</span>}
          </div>
          {story && (
            <div className="mt-3 grid gap-x-6 gap-y-1 text-xs text-stone-600 sm:grid-cols-2">
              <div>
                <span className="label mr-1">Publisher</span>
                {String(story.settings.publisher)}
              </div>
              <div>
                <span className="label mr-1">Sponsor</span>
                {String(story.settings.sponsor)}
              </div>
              <div>
                <span className="label mr-1">Generation date</span>
                {String(story.settings.generation_date)}
              </div>
              <div>
                <span className="label mr-1">Rank</span>
                {story.story.rank} {story.story.winner ? "(winner)" : ""}
              </div>
              <div className="sm:col-span-2">
                <span className="label mr-1">Discovery angle</span>
                {story.story.storyAngle ?? "none"}{" "}
                {!angleRead && <span className="rounded bg-amber-100 px-1 text-amber-900">not read by this version</span>}
              </div>
            </div>
          )}
          {others.length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="label">Compare with</span>
              {others.slice(0, 6).map((o) => (
                <Link key={o.runStoryId} className="btn btn-sm" href={`/compare?a=${trace.runStoryId}&b=${o.runStoryId}`}>
                  {o.version} (run {o.runId})
                </Link>
              ))}
            </div>
          )}
        </div>
        {PARTS.map((part) => {
          const steps = def.steps.map((s, i) => ({ s, i })).filter(({ s }) => (s.part ?? "other") === part.key);
          if (!steps.length) return null;
          return (
            <section key={part.key} className="space-y-0">
              <div id={`part-${part.key}`} className="scroll-mt-20 pb-2 pt-3">
                <h2 className="text-base font-semibold">{part.title}</h2>
                <p className="text-sm text-stone-600">{part.text}</p>
              </div>
              {steps.map(({ s, i }, k) => {
                const prev = k > 0 ? steps[k - 1].s : null;
                const prevIndex = k > 0 ? steps[k - 1].i : -1;
                const flowing = readsOf(s)
                  .map((r) => ({ name: r, from: producers.get(`${i}:${r}`) }))
                  .filter((x): x is { name: string; from: number } => x.from !== undefined)
                  .map((x) => ({ ...x, direct: x.from === prevIndex }))
                  .sort((a, b) => Number(b.direct) - Number(a.direct));
                return (
                  <div key={s.id}>
                    {prev && <Connector names={flowing} />}
                    <Card step={s} index={i} trace={byIndex.get(i)} producers={producers} claims={claims} sponsor={story?.story.sponsorName ?? undefined} onJump={jump} />
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      <aside className="sticky top-4 h-fit max-h-[90vh] overflow-auto text-sm">
        <div className="label mb-2">Steps</div>
        <ol className="space-y-0.5">
          {def.steps.map((s, i) => {
            const t = byIndex.get(i);
            return (
              <li key={s.id}>
                <button className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-stone-100" onClick={() => jump(i)}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${t?.status === "done" ? "bg-emerald-500" : t?.status === "failed" ? "bg-red-500" : t?.status === "skipped" ? "bg-stone-300" : "bg-stone-200"}`} />
                  <span className={`truncate ${s.kind === "prompt" ? "font-medium" : "text-stone-600"}`}>{s.name}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}
