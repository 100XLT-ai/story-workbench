"use client";

import { diffLines, diffWords } from "diff";

const text = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v, null, 2));

/** Two texts side by side; removed words in red on the left, added words in green on the right. */
export function SideBySide({ before, after, height = "28rem" }: { before: unknown; after: unknown; height?: string }) {
  const a = text(before);
  const b = text(after);
  const parts = a.length + b.length > 60000 ? diffLines(a, b) : diffWords(a, b);
  return (
    <div className="grid grid-cols-2 gap-2">
      <pre className="pre" style={{ maxHeight: height }}>
        {parts.map((p, i) => (p.added ? null : <span key={i} className={p.removed ? "bg-red-100 text-red-900 line-through decoration-red-300" : ""}>{p.value}</span>))}
      </pre>
      <pre className="pre" style={{ maxHeight: height }}>
        {parts.map((p, i) => (p.removed ? null : <span key={i} className={p.added ? "bg-emerald-100 text-emerald-900" : ""}>{p.value}</span>))}
      </pre>
    </div>
  );
}

export interface FieldDiff {
  step_id: string;
  field: string;
  before: unknown;
  after: unknown;
}

export function DiffList({ diff }: { diff: FieldDiff[] }) {
  if (!diff.length) return <p className="text-sm text-stone-500">No field changed.</p>;
  return (
    <div className="space-y-3">
      {diff.map((d, i) => (
        <div key={i}>
          <div className="mb-1 text-sm">
            <span className="font-mono font-semibold">{d.step_id}</span> · <span className="font-mono">{d.field}</span>
          </div>
          <SideBySide before={d.before} after={d.after} height="18rem" />
        </div>
      ))}
    </div>
  );
}
