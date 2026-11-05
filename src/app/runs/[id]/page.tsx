"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { api, usd } from "@/lib/client/api";
import type { StorySummary } from "@/lib/runs/summary";

interface RunStory {
  runStoryId: number;
  storyId: number;
  sponsor: string | null;
  headline: string | null;
  status: string;
  cursor: number;
  failedStep: string | null;
  error: string | null;
  cost: number;
  seconds: number | null;
  summary: StorySummary | null;
}
interface Run {
  id: number;
  status: string;
  author: string;
  note: string | null;
  version: { id: number; label: string } | null;
  storyCount: number;
  concurrency: number;
  estimatedCost: number | null;
  cost: number;
  createdAt: string;
  finishedAt: string | null;
  counts: Record<string, number>;
  stories: RunStory[];
}

const PLATFORMS = ["facebook", "instagram", "linkedin", "x"];

function Post({ p, post }: { p: string; post: { content: string; characters: number } | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!post) return <span className="text-stone-300">—</span>;
  return (
    <button className="block text-left text-xs" onClick={() => setOpen(!open)} title="Open the full post">
      {open ? <span className="whitespace-pre-wrap">{post.content}</span> : <span className="line-clamp-2">{post.content}</span>}
      <span className="text-stone-400">
        {" "}
        {post.characters} ch{p === "x" && post.characters > 280 ? " (over 280)" : ""}
      </span>
    </button>
  );
}

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await api<Run>(`/api/runs/${id}`);
        if (stop) return;
        setRun(r);
        if (!r.finishedAt) setTimeout(load, 4000);
      } catch (e) {
        setError((e as Error).message);
      }
    };
    load();
    return () => {
      stop = true;
    };
  }, [id]);

  const cancel = async () => {
    if (!confirm("Cancel this run? Stories that have not started will not run.")) return;
    setRun(await api<Run>(`/api/runs/${id}/cancel`, { method: "POST" }));
  };

  if (error) return <p className="text-red-700">{error}</p>;
  if (!run) return <p className="text-stone-500">Loading…</p>;
  const hasChecks = run.stories.some((s) => s.summary?.checks);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            Run {run.id}: {run.version?.label}
          </h1>
          <p className="text-sm text-stone-600">
            By {run.author} · {run.storyCount} stories · at most {run.concurrency} at a time · started {run.createdAt.slice(0, 16)} UTC{run.note ? ` · “${run.note}”` : ""}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <a className="btn" href={`/api/runs/${run.id}/results?format=csv`}>
            CSV
          </a>
          <a className="btn" href={`/api/runs/${run.id}/results?format=md`}>
            Markdown
          </a>
          <a className="btn" href={`/api/runs/${run.id}/results?format=json`}>
            JSON (all traces)
          </a>
          {!run.finishedAt && (
            <button className="btn text-red-700" onClick={cancel}>
              Cancel the run
            </button>
          )}
        </div>
      </div>
      <div className="card flex flex-wrap gap-6 p-3 text-sm">
        <div>
          Status: <b>{run.status}</b>
        </div>
        <div>
          Done {run.counts.done} · failed {run.counts.failed} · running {run.counts.running} · waiting {run.counts.pending} · cancelled {run.counts.cancelled}
        </div>
        <div>
          Real cost <b>{usd(run.cost, 4)}</b> (estimate {usd(run.estimatedCost, 2)})
        </div>
        {!run.finishedAt && <div className="text-sky-700">The table updates by itself while the run works. You can close this page.</div>}
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl w-full">
          <thead>
            <tr>
              <th>Story</th>
              <th>Status</th>
              <th className="min-w-[200px]">Article</th>
              <th className="min-w-[320px]">Social posts (click to open)</th>
              <th className="min-w-[170px]">Ad copy</th>
              {hasChecks && <th>Checks</th>}
              <th>Cost · time</th>
            </tr>
          </thead>
          <tbody>
            {run.stories.map((s) => (
              <tr key={s.runStoryId} className="hover:bg-stone-50">
                <td className="max-w-[180px]">
                  <Link className="font-medium text-blue-700 hover:underline" href={`/flow/${s.runStoryId}`}>
                    {s.sponsor}
                  </Link>
                  <div className="line-clamp-2 text-xs text-stone-500">{s.headline}</div>
                  <Link className="text-xs text-stone-400 hover:underline" href={`/stories/${s.storyId}`}>
                    story {s.storyId}
                  </Link>
                </td>
                <td className="text-xs">
                  <Link href={`/flow/${s.runStoryId}`} className={s.status === "failed" ? "font-semibold text-red-700" : s.status === "done" ? "text-emerald-700" : "text-stone-600"}>
                    {s.status}
                  </Link>
                  {s.status === "running" && <div className="text-stone-400">step {s.cursor + 1}</div>}
                  {s.failedStep && (
                    <div className="mt-1 max-w-[160px] text-red-700">
                      at <b>{s.failedStep}</b>: {s.error?.slice(0, 160)}
                    </div>
                  )}
                </td>
                <td>
                  {s.summary?.article ? (
                    <div className="text-xs">
                      <div className="text-sm font-semibold">{s.summary.article.title}</div>
                      {s.summary.article.subtitle && <div className="italic text-stone-600">{s.summary.article.subtitle}</div>}
                      <div className="text-stone-500">{s.summary.article.word_count} words</div>
                    </div>
                  ) : (
                    <span className="text-stone-300">—</span>
                  )}
                </td>
                <td className="max-w-[340px]">
                  {Object.keys(s.summary?.social ?? {}).length ? (
                    <div className="space-y-1">
                      {[...PLATFORMS, ...Object.keys(s.summary?.social ?? {}).filter((k) => !PLATFORMS.includes(k))].map((p) =>
                        s.summary?.social && p in s.summary.social ? (
                          <div key={p} className="flex gap-1.5">
                            <span className="w-14 shrink-0 text-[11px] font-semibold uppercase text-stone-500">{p}</span>
                            <Post p={p} post={s.summary.social[p]} />
                          </div>
                        ) : null,
                      )}
                    </div>
                  ) : (
                    <span className="text-stone-300">—</span>
                  )}
                </td>
                <td className="text-xs">
                  {s.summary?.ad ? (
                    <>
                      <div className="font-semibold">{s.summary.ad.headline}</div>
                      <div className="text-stone-600">{s.summary.ad.subheadline}</div>
                      <div className="mt-0.5 inline-block rounded bg-stone-900 px-1.5 py-0.5 text-white">{s.summary.ad.cta}</div>
                    </>
                  ) : (
                    <span className="text-stone-300">—</span>
                  )}
                </td>
                {hasChecks && (
                  <td className="text-xs">
                    {s.summary?.checks?.map((c) => (
                      <div key={c.option} title={c.flags.join("\n")}>
                        {c.option}: <span className={c.blockers ? "font-semibold text-red-700" : ""}>{c.blockers} blockers</span>, {c.flags.length} flags
                      </div>
                    ))}
                  </td>
                )}
                <td className="whitespace-nowrap text-xs">
                  {usd(s.cost, 4)}
                  <div className="text-stone-500">{s.seconds !== null ? `${s.seconds} s` : ""}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
