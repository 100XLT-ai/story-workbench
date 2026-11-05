"use client";

// Readable views for the known outputs (§6.4). Anything else shows as JSON.
import type { ReactNode } from "react";
import { FOCUS_WORDS, MECH_WORDS, ROLE_WORDS, TIME_WORDS } from "@/lib/flow/decided";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : JSON.stringify(v));
const chars = (s: unknown) => [...str(s)].length;
const words = (s: unknown) => str(s).trim().split(/\s+/).filter(Boolean).length;

export interface ClaimIndex {
  get(id: string): { text: string; speaker?: string | null } | undefined;
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-3 border-b border-stone-100 py-1.5 text-sm last:border-0">
      <div className="text-stone-500">{k}</div>
      <div>{children}</div>
    </div>
  );
}

function ClaimList({ ids, claims, reasons }: { ids: unknown[]; claims: ClaimIndex; reasons?: Map<string, string> }) {
  if (!ids.length) return <span className="text-stone-400">none</span>;
  return (
    <ul className="space-y-1">
      {ids.map((raw, i) => {
        const id = str(raw);
        const c = claims.get(id);
        return (
          <li key={i} className="text-sm">
            <span className="mr-1.5 rounded bg-stone-100 px-1 font-mono text-xs">{id}</span>
            {c ? c.text : <span className="text-stone-400">(not in the ledger)</span>}
            {c?.speaker && <span className="text-stone-500"> — {c.speaker}</span>}
            {reasons?.get(id) && <span className="ml-1 text-xs text-amber-800">left out: {reasons.get(id)}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Marks each claim span in the body and shows its claim IDs on hover. */
export function MarkedBody({ body, claims }: { body: string; claims?: { span: string; claim_ids: string[] }[] | null }) {
  if (!claims?.length) return <div className="whitespace-pre-wrap text-sm leading-relaxed">{body}</div>;
  const marks: { start: number; end: number; ids: string[] }[] = [];
  for (const c of claims) {
    if (!c.span) continue;
    const at = body.indexOf(c.span);
    if (at >= 0 && !marks.some((m) => at < m.end && at + c.span.length > m.start)) marks.push({ start: at, end: at + c.span.length, ids: c.claim_ids });
  }
  marks.sort((a, b) => a.start - b.start);
  const parts: ReactNode[] = [];
  let pos = 0;
  marks.forEach((m, i) => {
    if (m.start > pos) parts.push(body.slice(pos, m.start));
    parts.push(
      <mark key={i} className="rounded bg-sky-100 px-0.5 text-inherit" title={m.ids.join(", ")}>
        {body.slice(m.start, m.end)}
        <sup className="ml-0.5 font-mono text-[10px] text-sky-800">{m.ids.join(",")}</sup>
      </mark>,
    );
    pos = m.end;
  });
  parts.push(body.slice(pos));
  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed">
      {parts}
      <p className="mt-2 text-xs text-stone-500">
        {marks.length} of {claims.length} claim spans found in the body (marked in blue, with their claim IDs).
      </p>
    </div>
  );
}

function StoryType({ v }: { v: Obj }) {
  return (
    <div>
      <Row k="About">{FOCUS_WORDS[str(v.focus)] ?? str(v.focus)}</Row>
      <Row k="When">{TIME_WORDS[str(v.time)] ?? str(v.time)}</Row>
      <Row k="Sponsor role">{ROLE_WORDS[str(v.role)] ?? str(v.role)}</Row>
      <Row k="How the help works">{arr(v.mechanisms).map((m) => MECH_WORDS[str(m)] ?? str(m)).join(", ") || "none"}</Row>
      <Row k="Date risk">{v.windowRisk ? "Yes: a dated fact falls between generation and publication." : "No"}</Row>
      {arr(v.missing).length > 0 && <Row k="Missing">{arr(v.missing).map(str).join("; ")}</Row>}
    </div>
  );
}

function Selection({ v, claims }: { v: Obj; claims: ClaimIndex }) {
  const left = new Map(arr(v.left_out).filter(isObj).map((x) => [str(x.claim_id), str(x.reason)]));
  const why = isObj(v.why_now) ? v.why_now : null;
  return (
    <div>
      <Row k="Angles considered">
        <ul className="list-disc pl-4">
          {arr(v.angles).map((a, i) => (
            <li key={i}>{str(a)}</li>
          ))}
        </ul>
      </Row>
      <Row k="Chosen angle">
        <b>{str(v.angle)}</b>
        <div className="text-stone-600">{str(v.angle_reason)}</div>
      </Row>
      <Row k="Walkaway">{str(v.walkaway)}</Row>
      <Row k="Why now">{why ? `${str(why.text)} (${str(why.claim_id)})` : "none (no fact makes it timely)"}</Row>
      <Row k={`Facts to use (${arr(v.use_facts).length})`}>
        <ClaimList ids={arr(v.use_facts)} claims={claims} />
      </Row>
      <Row k={`Reserve (${arr(v.reserve_facts).length})`}>
        <ClaimList ids={arr(v.reserve_facts)} claims={claims} />
      </Row>
      <Row k={`Left out (${left.size})`}>
        <ClaimList ids={[...left.keys()]} claims={claims} reasons={left} />
      </Row>
      <Row k="Quotes">
        <ul className="space-y-1">
          {arr(v.quotes)
            .filter(isObj)
            .map((q, i) => (
              <li key={i}>
                <span className="mr-1 rounded bg-stone-100 px-1 font-mono text-xs">{str(q.claim_id)}</span>
                <span className="mr-1 text-xs uppercase text-stone-500">{str(q.place)}</span>
                {str(q.speaker)}: {claims.get(str(q.claim_id))?.text ?? ""}
              </li>
            ))}
        </ul>
      </Row>
      <Row k="Grounded vs upbeat">
        <div>Grounded: {str(v.option_grounded)}</div>
        <div>Upbeat: {str(v.option_upbeat)}</div>
      </Row>
      <Row k="Risks">
        {arr(v.risks).length ? (
          <ul className="list-disc pl-4">
            {arr(v.risks)
              .filter(isObj)
              .map((r, i) => (
                <li key={i}>
                  <b>{str(r.type)}</b> ({arr(r.claim_ids).map(str).join(", ")}): {str(r.note)}
                </li>
              ))}
          </ul>
        ) : (
          "none"
        )}
      </Row>
    </div>
  );
}

function Plan({ plan, claims }: { plan: Obj; claims: ClaimIndex }) {
  // The writer returns plan.grounded / plan.upbeat ({ intro_type, paragraphs: [[claim ids]] }); older shapes use plan.options.
  const options: Obj[] = [
    ...["grounded", "upbeat"].filter((k) => isObj(plan[k])).map((k) => ({ option: k, ...(plan[k] as Obj) })),
    ...arr(plan.options).filter(isObj),
  ];
  const known = new Set(["angle", "angles", "angle_reason", "theme", "walkaway", "why_now", "use_facts", "grounded", "upbeat", "options"]);
  const why = isObj(plan.why_now) ? plan.why_now : null;
  return (
    <div>
      {arr(plan.angles).length > 0 && (
        <Row k="Angles considered">
          <ul className="list-disc pl-4">
            {arr(plan.angles).map((a, i) => (
              <li key={i}>{str(a)}</li>
            ))}
          </ul>
        </Row>
      )}
      {plan.angle !== undefined && (
        <Row k="Angle">
          <b>{str(plan.angle)}</b>
          {plan.angle_reason !== undefined && <div className="text-stone-600">{str(plan.angle_reason)}</div>}
        </Row>
      )}
      {plan.theme !== undefined && <Row k="Theme">{str(plan.theme)}</Row>}
      {plan.walkaway !== undefined && <Row k="Walkaway">{str(plan.walkaway)}</Row>}
      {"why_now" in plan && <Row k="Why now">{why ? `${str(why.text)} (${str(why.claim_id)})` : "none"}</Row>}
      {arr(plan.use_facts).length > 0 && (
        <Row k="Facts to use">
          <ClaimList ids={arr(plan.use_facts)} claims={claims} />
        </Row>
      )}
      {options.map((o, i) => (
        <Row key={i} k={`${str(o.option)}: paragraph plan`}>
          <div className="text-stone-600">Opening type: {str(o.intro_type)}</div>
          <ol className="mt-1 list-decimal space-y-1.5 pl-5">
            {arr(o.paragraphs).map((p, j) => {
              const ids = isObj(p) ? arr(p.claim_ids ?? p.claims) : arr(p);
              return (
                <li key={j}>
                  {ids.map((id) => (
                    <div key={str(id)} className="text-sm">
                      <span className="mr-1 rounded bg-stone-100 px-1 font-mono text-xs">{str(id)}</span>
                      {claims.get(str(id))?.text ?? ""}
                    </div>
                  ))}
                  {ids.length === 0 && <span className="text-stone-400">(no claim)</span>}
                </li>
              );
            })}
          </ol>
        </Row>
      ))}
      {Object.keys(plan).filter((k) => !known.has(k)).length > 0 && (
        <Row k="Other plan fields">
          <span className="font-mono text-xs">{JSON.stringify(Object.fromEntries(Object.entries(plan).filter(([k]) => !known.has(k))))}</span>
        </Row>
      )}
    </div>
  );
}

function Article({ v }: { v: Obj }) {
  const claims = Array.isArray(v.claims) ? (v.claims as { span: string; claim_ids: string[] }[]) : null;
  return (
    <div className="max-w-3xl">
      <h3 className="text-lg font-semibold leading-snug">{str(v.title ?? v.headline)}</h3>
      <div className="text-xs text-stone-500">
        {chars(v.title ?? v.headline)} characters{v.word_count !== undefined ? ` · ${str(v.word_count)} words` : ` · ${words(v.body)} words`}
        {v.title_note ? ` · ${str(v.title_note)}` : ""}
      </div>
      {str(v.subtitle ?? v.subhead) && <p className="mt-1 italic text-stone-700">{str(v.subtitle ?? v.subhead)}</p>}
      <div className="mt-3">
        <MarkedBody body={str(v.content ?? v.body)} claims={claims} />
      </div>
      {str(v.cta) && (
        <p className="mt-3 text-sm">
          <b>CTA:</b> {str(v.cta)}
        </p>
      )}
    </div>
  );
}

function WriterOutput({ v, claims }: { v: Obj; claims: ClaimIndex }) {
  const options = arr(v.options).filter(isObj);
  return (
    <div className="space-y-4">
      <div>
        <div className="label mb-1">The plan</div>
        <Plan plan={isObj(v.plan) ? v.plan : {}} claims={claims} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {options.map((o, i) => (
          <div key={i} className="rounded-md border border-stone-200 p-3">
            <div className="label mb-1">
              {str(o.option)} option{str(o.option) === "grounded" ? " (production keeps this one)" : ""}
            </div>
            <Article v={{ ...o, title: o.headline, subtitle: o.subhead, content: o.body }} />
          </div>
        ))}
      </div>
      {arr(v.conflicts).length > 0 && <Row k="Conflicts the writer found">{arr(v.conflicts).map(str).join("; ")}</Row>}
      {v.shortReason ? <Row k="Short reason">{str(v.shortReason)}</Row> : null}
    </div>
  );
}

function Checks({ v }: { v: Obj }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {Object.entries(v).map(([opt, rep]) => {
        const r = isObj(rep) ? rep : {};
        return (
          <div key={opt} className="rounded-md border border-stone-200 p-2">
            <div className="label mb-1">
              {opt}: {str(r.blockers)} blockers
            </div>
            <table className="w-full text-sm">
              <tbody>
                {arr(r.results)
                  .filter(isObj)
                  .map((c, i) => (
                    <tr key={i} className="border-b border-stone-100 last:border-0">
                      <td className="py-1 pr-2">
                        <span className={c.result === "fail" ? (c.severity === "blocker" ? "font-semibold text-red-700" : "text-amber-700") : c.result === "pass" ? "text-emerald-700" : "text-stone-400"}>
                          {c.result === "fail" ? "✗" : c.result === "pass" ? "✓" : "–"} {str(c.check)}
                        </span>
                      </td>
                      <td className="py-1 pr-2 text-xs text-stone-500">{str(c.severity)}</td>
                      <td className="py-1 text-xs text-stone-600">{arr(c.detail).map(str).join("; ")}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

const PLATFORM: Record<string, { label: string; limit: number; color: string }> = {
  facebook: { label: "Facebook", limit: 400, color: "#1877f2" },
  instagram: { label: "Instagram", limit: 2200, color: "#c13584" },
  linkedin: { label: "LinkedIn", limit: 3000, color: "#0a66c2" },
  x: { label: "X", limit: 280, color: "#111111" },
};

export function SocialPost({ platform, v, sponsor }: { platform: string; v: Obj; sponsor?: string }) {
  const p = PLATFORM[platform] ?? { label: platform, limit: 0, color: "#555" };
  const n = typeof v.characters === "number" ? v.characters : chars(v.content);
  const over = p.limit > 0 && n > (typeof v.limit === "number" ? v.limit : p.limit);
  const tags = arr(v.hashtags).map(str);
  return (
    <div className="max-w-xl rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-7 w-7 rounded-full" style={{ background: p.color }} />
        <div className="text-sm">
          <div className="font-semibold">{sponsor ?? "The publisher"}</div>
          <div className="text-xs text-stone-500">{p.label} · sponsored story</div>
        </div>
      </div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed">{str(v.content)}</div>
      {tags.length > 0 && <div className="mt-2 text-sm" style={{ color: p.color }}>{tags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ")}</div>}
      <div className={`mt-2 text-xs ${over ? "font-semibold text-red-700" : "text-stone-500"}`}>
        {n} characters{p.limit ? ` (limit ${typeof v.limit === "number" ? v.limit : p.limit})` : ""}
        {v.note ? ` · ${str(v.note)}` : ""}
      </div>
    </div>
  );
}

function Ad({ v }: { v: Obj }) {
  return (
    <div className="flex flex-wrap gap-4">
      <div className="flex h-[250px] w-[300px] flex-col justify-end rounded-md bg-gradient-to-br from-stone-700 to-stone-900 p-4 text-white">
        <div className="text-lg font-bold leading-tight">{str(v.headline)}</div>
        <div className="mt-1 text-xs leading-snug opacity-90">{str(v.subheadline)}</div>
        <div className="mt-3 self-start rounded bg-white px-3 py-1 text-xs font-semibold text-stone-900">{str(v.cta)}</div>
      </div>
      <div className="min-w-[280px] flex-1">
        <Row k="Headline">
          {str(v.headline)} <span className="text-xs text-stone-500">({chars(v.headline)}/80)</span>
        </Row>
        <Row k="Subheadline">
          {str(v.subheadline)} <span className="text-xs text-stone-500">({chars(v.subheadline)}/220)</span>
        </Row>
        <Row k="CTA">
          {str(v.cta)} <span className="text-xs text-stone-500">({chars(v.cta)}/30)</span>
        </Row>
        <Row k="Image subject">{str(v.subject_hint)}</Row>
      </div>
    </div>
  );
}

function Ledger({ v }: { v: Obj }) {
  const ledger = isObj(v.ledger) ? v.ledger : v;
  const labels = isObj(v.labels) ? v.labels : {};
  const claimsL = arr(ledger.claims).filter(isObj);
  const quotes = arr(ledger.quotes).filter(isObj);
  return (
    <div className="space-y-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-stone-500">
            <th className="py-1 pr-2">ID</th>
            <th className="py-1 pr-2">Fact</th>
            <th className="py-1 pr-2">Date</th>
            <th className="py-1">Label</th>
          </tr>
        </thead>
        <tbody>
          {claimsL.map((c) => {
            const l = isObj(labels[str(c.id)]) ? (labels[str(c.id)] as Obj) : null;
            return (
              <tr key={str(c.id)} className="border-t border-stone-100 align-top">
                <td className="py-1 pr-2 font-mono text-xs">{str(c.id)}</td>
                <td className="py-1 pr-2">{str(c.text)}</td>
                <td className="py-1 pr-2 whitespace-nowrap text-xs">{str(c.date)}</td>
                <td className="py-1 text-xs text-stone-600">{l ? [l.material, l.state, l.actor, l.mechanism].map(str).join(" · ") : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {quotes.length > 0 && (
        <div>
          <div className="label mb-1">Quotes</div>
          <ul className="space-y-1 text-sm">
            {quotes.map((q) => (
              <li key={str(q.id)}>
                <span className="mr-1 rounded bg-stone-100 px-1 font-mono text-xs">{str(q.id)}</span>“{str(q.text)}” — {str(q.speaker) || "no speaker"}
                {q.isSponsorVoice ? <span className="ml-1 text-xs text-amber-700">(sponsor voice)</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function KeyValues({ v }: { v: Obj }) {
  return (
    <div>
      {Object.entries(v).map(([k, val]) => (
        <Row key={k} k={k}>
          {typeof val === "string" ? val : <span className="font-mono text-xs">{JSON.stringify(val)}</span>}
        </Row>
      ))}
    </div>
  );
}

/** The readable view for one output name, or null when there is none. */
export function readableFor(name: string, value: unknown, claims: ClaimIndex, sponsor?: string): ReactNode | null {
  if (value === null || value === undefined) return null;
  if (name === "story_type" && isObj(value)) return <StoryType v={value} />;
  if (name === "selection" && isObj(value)) return <Selection v={value} claims={claims} />;
  if (name === "writer_output" && isObj(value)) return <WriterOutput v={value} claims={claims} />;
  if (name === "article" && isObj(value)) return <Article v={value} />;
  if (name === "article_parts" && isObj(value) && str(value.content)) return <Article v={{ ...value, title: "(before the headline fit)" }} />;
  if (name === "checks" && isObj(value)) return <Checks v={value} />;
  if (name === "ad" && isObj(value)) return <Ad v={value} />;
  if ((name === "prepared" || name === "raw_ledger") && isObj(value)) return <Ledger v={value} />;
  if (name === "payload" && isObj(value)) return <KeyValues v={value} />;
  if (name === "ad_input" && isObj(value)) return <KeyValues v={value} />;
  if (name === "social_facebook_first" && isObj(value)) return <SocialPost platform="facebook" v={value} sponsor={sponsor} />;
  const m = /^social_(facebook|instagram|linkedin|x)$/.exec(name);
  if (m && isObj(value)) return <SocialPost platform={m[1]} v={value} sponsor={sponsor} />;
  if (name === "statistics" && Array.isArray(value))
    return (
      <ul className="list-disc pl-5 text-sm">
        {value.filter(isObj).map((s, i) => (
          <li key={i}>
            {str(s.statistic)}: <b>{str(s.value)}</b> ({str(s.year)}, {str(s.scope)}, {str(s.source)})
          </li>
        ))}
        {value.length === 0 && <li>No statistics (production then sends an empty list).</li>}
      </ul>
    );
  if (typeof value === "string" && name !== "modules" && !name.endsWith("_prompt")) return <div className="whitespace-pre-wrap text-sm">{value}</div>;
  return null;
}
