"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { RunDialog } from "@/components/run-dialog";
import { api, usd } from "@/lib/client/api";

type Obj = Record<string, unknown>;
interface Page {
  id: number;
  sourceUrl: string;
  title: string | null;
  role: string | null;
  pageType: string | null;
  publishedDate: string | null;
  textPublishedDate: string | null;
  extractorVersion: string | null;
  facts: unknown;
  quotes: unknown;
  impacts: Obj[];
  scrapedMarkdown: string | null;
  summary: string | null;
}
interface Story {
  story: Obj;
  job: Obj | null;
  organization: Obj | null;
  settings: Obj;
  brand: Obj | null;
  pages: Page[];
  images: Obj[];
  runs: { runId: number; runStoryId: number; version: string; status: string; cost: number; createdAt: string }[];
  v3: { runnable: boolean; reason: string | null; recrawlUrls: string[] };
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "string" ? v : typeof v === "number" ? String(v) : typeof v === "boolean" ? (v ? "yes" : "no") : JSON.stringify(v));

function KV({ data, keys }: { data: Obj; keys: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[170px_1fr] gap-x-3 gap-y-1 text-sm">
      {keys.map(([k, label]) => (
        <div key={k} className="contents">
          <dt className="text-stone-500">{label}</dt>
          <dd className="break-words">{s(data[k])}</dd>
        </div>
      ))}
    </dl>
  );
}

const SCORE_PARTS: [string, string][] = [
  ["attribution", "Attribution"],
  ["evidenceCompleteness", "Evidence completeness"],
  ["beneficiaryInterest", "Beneficiary interest"],
  ["amount", "Amount"],
  ["recency", "Recency"],
  ["attendance", "Attendance"],
];
const TIERS: [string, string][] = [
  ["tierImpact", "Impact"],
  ["tierRecency", "Recency"],
  ["tierReach", "Reach"],
  ["tierEvidence", "Evidence"],
  ["tierAttribution", "Attribution"],
  ["tierMarket", "Market"],
  ["tierImage", "Image"],
];
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const fmt = (v: number | null) => (v === null ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(2));

/** The page-text warning, or null. */
function textWarning(st: Obj): string | null {
  if (n(st.pageCount) === 0) return "This story has no page, so the writer has no source text.";
  if (n(st.textPageCount) === 0)
    return n(st.pageCount) === 1 ? "This story's page was never scraped, so the writer has no source text." : "This story's pages were never scraped, so the writer has no source text.";
  return null;
}

function WhyRank({ st, v3 }: { st: Obj; v3: Story["v3"] }) {
  const parts = (st.scoreComponents ?? {}) as Obj;
  const total = n(st.total);
  const warning = textWarning(st);
  const counts: [string, unknown][] = [
    ["Pages", st.pageCount],
    ["Text pages", st.textPageCount],
    ["Facts", st.factCount],
    ["Impacts", st.impactCount],
    ["Quotes", st.quoteCount],
  ];
  return (
    <section className="card p-3" aria-labelledby="why-rank">
      <h2 id="why-rank" className="mb-2 font-semibold">
        Why this rank
      </h2>
      {(warning || v3.reason) && (
        <div className="mb-3 space-y-1 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          {warning && <p className="font-medium">{warning}</p>}
          {v3.reason && <p>Not runnable by v3: {v3.reason}. The v3 writer reads only the facts, impacts and quotes of the story&apos;s pages.</p>}
          {v3.reason && v3.recrawlUrls.length > 0 && (
            <p>
              The thin-story re-crawl in the Staged and One-call seeds can still add {v3.recrawlUrls.length} other page{v3.recrawlUrls.length === 1 ? "" : "s"} of the job: {v3.recrawlUrls.join(", ")}.
            </p>
          )}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <div>
          <div className="flex items-baseline gap-4">
            <div>
              <div className="label">Weighted score</div>
              <div className="text-2xl font-semibold">{fmt(n(st.weightedScore))}</div>
            </div>
            <div>
              <div className="label">Total</div>
              <div className="text-2xl font-semibold">{fmt(total)}</div>
            </div>
            <div>
              <div className="label">Rank</div>
              <div className="text-2xl font-semibold">{s(st.rank)}</div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <span className="chip">deal grade {s(st.dealGrade)}</span>
            <span className="chip">confidence {s(st.confidence)}</span>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-1 text-center text-xs">
            {counts.map(([label, v]) => (
              <div key={label} className={`rounded border p-1 ${v === 0 ? "border-amber-300 bg-amber-50" : "border-stone-200"}`}>
                <div className="text-stone-500">{label}</div>
                <div className="text-sm font-semibold">{s(v)}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="label mb-1">Score parts (the total is their sum)</div>
          <table className="w-full text-sm">
            <tbody>
              {SCORE_PARTS.map(([k, label]) => {
                const v = n(parts[k]);
                const pct = v !== null && total ? Math.max(0, Math.min(100, (v / total) * 100)) : 0;
                return (
                  <tr key={k}>
                    <td className="w-40 py-0.5 pr-2 text-stone-600">{label}</td>
                    <td className="py-0.5">
                      <div className="h-2.5 w-full rounded bg-stone-100" title={`${pct.toFixed(0)}% of the total`}>
                        <div className="h-2.5 rounded bg-blue-500" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td className="w-14 py-0.5 pl-2 text-right tabular-nums">{fmt(v)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div>
          <div className="label mb-1">Tiers</div>
          <div className="grid grid-cols-4 gap-1 text-center text-xs">
            {TIERS.map(([k, label]) => (
              <div key={k} className="rounded border border-stone-200 p-1">
                <div className="text-stone-500">{label}</div>
                <div className="text-sm font-semibold">{s(st[k])}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3">
        <div className="label mb-1">Tiebreak reasoning</div>
        {st.tiebreakReasoning ? <p className="whitespace-pre-wrap text-sm">{s(st.tiebreakReasoning)}</p> : <p className="text-sm text-stone-500">No tiebreak reasoning for this story.</p>}
      </div>
    </section>
  );
}

function PageCard({ p }: { p: Page }) {
  const [open, setOpen] = useState(false);
  const facts = arr(p.facts);
  const quotes = arr(p.quotes);
  return (
    <div className="card p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="chip">{p.role}</span>
        <a className="font-medium text-blue-700 hover:underline" href={p.sourceUrl} target="_blank" rel="noreferrer">
          {p.title ?? p.sourceUrl}
        </a>
      </div>
      <div className="mt-1 text-xs text-stone-500">
        page {p.id} · {p.pageType ?? "type unknown"} · published {p.publishedDate ?? "—"} · date in text {p.textPublishedDate ?? "—"} · extractor {p.extractorVersion ?? "—"}
      </div>
      <div className="mt-2 grid gap-3 lg:grid-cols-3">
        <div>
          <div className="label mb-1">Facts ({facts.length})</div>
          <ul className="list-disc space-y-0.5 pl-4 text-sm">
            {facts.map((f, i) => (
              <li key={i}>{s(f)}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="label mb-1">Quotes ({quotes.length})</div>
          <ul className="space-y-1 text-sm">
            {quotes.map((q, i) => (
              <li key={i} className="border-l-2 border-stone-300 pl-2">
                {s(q)}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="label mb-1">Impacts ({p.impacts.length})</div>
          <ul className="space-y-1 text-sm">
            {p.impacts.map((im, i) => (
              <li key={i}>
                <b>{s(im.typePrimary)}</b> {im.valueRaw !== null ? `${s(im.valueRaw)} ${im.valueUnit ?? ""}` : ""} · {s(im.activity)} · {s(im.beneficiary)} · {s(im.eventDate)}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <button className="btn btn-sm mt-2" onClick={() => setOpen(!open)}>
        {open ? "Hide" : "Show"} the page text ({(p.scrapedMarkdown ?? "").length.toLocaleString()} characters)
      </button>
      {open && <pre className="pre mt-2">{p.scrapedMarkdown}</pre>}
    </div>
  );
}

export default function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Story | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);
  useEffect(() => {
    api<Story>(`/api/stories/${id}`).then(setData).catch((e: Error) => setError(e.message));
  }, [id]);
  if (error) return <p className="text-red-700">{error}</p>;
  if (!data) return <p className="text-stone-500">Loading…</p>;
  const st = data.story;
  const raw = (st.raw ?? {}) as Obj;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-stone-500">
            Story {s(st.id)} · job {s(st.jobId)} · {s(st.domain)}
          </div>
          <h1 className="text-xl font-semibold">{s(st.storyHeadline ?? st.description)}</h1>
          <div className="mt-1 flex flex-wrap gap-2 text-sm">
            <span className="chip">rank {s(st.rank)}</span>
            {st.winner ? <span className="chip border-emerald-300 bg-emerald-50">winner</span> : null}
            <span className="chip">{st.runnableProduction ? "runnable by Production" : "not runnable by Production"}</span>
            <span className={`chip ${data.v3.runnable ? "" : "border-amber-300 bg-amber-50"}`}>{data.v3.runnable ? "runnable by v3" : `not runnable by v3: ${data.v3.reason ?? "its ledger is empty"}`}</span>
          </div>
        </div>
        <button className="btn-primary" onClick={() => setDialog(true)}>
          Run this story…
        </button>
      </div>
      <WhyRank st={st} v3={data.v3} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-3">
          <h2 className="mb-2 font-semibold">Sponsor settings (the writer&apos;s inputs)</h2>
          <KV
            data={{ ...data.settings, aliases: arr(data.settings.aliases).join(", ") || "none", programs: arr(data.settings.programs).join(", ") || "none" }}
            keys={[
              ["sponsor", "Sponsor name"],
              ["publisher", "Publisher (masthead)"],
              ["aliases", "Aliases"],
              ["programs", "Program names"],
              ["generation_date", "Generation date"],
            ]}
          />
          <h3 className="mb-1 mt-3 text-sm font-semibold">Brand profile fields the social and ad steps read</h3>
          {data.brand ? (
            <KV
              data={{ ...data.brand, brandPersonalityTraits: arr(data.brand.brandPersonalityTraits).join(", ") }}
              keys={[
                ["facebookHandle", "Facebook handle"],
                ["facebookUrl", "Facebook URL"],
                ["brandPersonalityTraits", "Personality traits"],
                ["toneOfVoice", "Tone of voice"],
                ["brandVoice", "Brand voice"],
              ]}
            />
          ) : (
            <p className="text-sm text-stone-500">The organization has no brand profile.</p>
          )}
          <h3 className="mb-1 mt-3 text-sm font-semibold">Organization</h3>
          {data.organization && (
            <KV
              data={data.organization}
              keys={[
                ["name", "Name"],
                ["description", "Description"],
                ["industry", "Industry"],
                ["businessType", "Business type"],
                ["orgType", "Type"],
                ["city", "City"],
                ["state", "State"],
              ]}
            />
          )}
        </div>
        <div className="card p-3">
          <h2 className="mb-2 font-semibold">Candidate fields</h2>
          <KV
            data={{ ...st, attribution: raw.attribution, amount: raw.amount, signal_date: raw.signal_date }}
            keys={[
              ["description", "Description"],
              ["beneficiary", "Beneficiary"],
              ["evidenceQuote", "Evidence quote"],
              ["impactTypePrimary", "Impact type"],
              ["impactValueRaw", "Impact value"],
              ["impactValueUnit", "Impact unit"],
              ["storyAngle", "Discovery angle"],
              ["ideaTitle", "Idea title (Story.title)"],
              ["ideaDescription", "Idea summary (Story.summary)"],
              ["attribution", "Attribution"],
              ["signal_date", "Signal date"],
              ["pageCount", "Pages"],
              ["textPageCount", "Pages with text"],
              ["factCount", "Facts (ledger)"],
              ["quoteCount", "Quotes (ledger)"],
              ["impactCount", "Impacts (ledger)"],
            ]}
          />
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-stone-600">Score components and every candidate column</summary>
            <pre className="pre mt-1">{JSON.stringify({ score_components: st.scoreComponents, ...raw }, null, 2)}</pre>
          </details>
        </div>
      </div>
      <div className="card p-3">
        <h2 className="mb-2 font-semibold">Runs of this story</h2>
        {data.runs.length ? (
          <table className="tbl w-full">
            <thead>
              <tr>
                <th>Version</th>
                <th>Run</th>
                <th>Status</th>
                <th>Cost</th>
                <th>Flow</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((r) => (
                <tr key={r.runStoryId}>
                  <td>{r.version}</td>
                  <td>
                    <Link className="text-blue-700 hover:underline" href={`/runs/${r.runId}`}>
                      Run {r.runId}
                    </Link>
                  </td>
                  <td>{r.status}</td>
                  <td>{usd(r.cost)}</td>
                  <td>
                    <Link className="text-blue-700 hover:underline" href={`/flow/${r.runStoryId}`}>
                      Open the flow
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-stone-500">No run yet.</p>
        )}
      </div>
      <div>
        <h2 className="mb-2 font-semibold">Pages ({data.pages.length})</h2>
        <div className="space-y-3">
          {data.pages.map((p) => (
            <PageCard key={p.id} p={p} />
          ))}
          {data.pages.length === 0 && <p className="text-sm text-stone-500">This story has no page, so the writer has no source text.</p>}
        </div>
      </div>
      <div>
        <h2 className="mb-2 font-semibold">Images ({data.images.length})</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {data.images.map((im, i) => (
            <figure key={i} className="card overflow-hidden text-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s(im.url)} alt="" className="h-28 w-full bg-stone-100 object-cover" loading="lazy" />
              <figcaption className="p-1.5 text-stone-600">
                rank {s(im.rank)} · {im.usable ? "usable" : "not usable"} · conf {typeof im.confidence === "number" ? im.confidence.toFixed(2) : "—"}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
      {dialog && <RunDialog storyIds={[Number(id)]} count={1} onClose={() => setDialog(false)} />}
    </div>
  );
}
