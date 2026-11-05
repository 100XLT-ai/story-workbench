"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { authorName } from "@/lib/client/name";
import type { FilterClause, FilterOp } from "@/lib/engine/types";

export interface Field {
  name: string;
  label: string;
  type: "number" | "text" | "boolean" | "date";
  group: string;
  description: string;
}

const OPS: { op: FilterOp; label: string; types: Field["type"][] }[] = [
  { op: "eq", label: "=", types: ["number", "text", "boolean", "date"] },
  { op: "ne", label: "≠", types: ["number", "text", "boolean", "date"] },
  { op: "lt", label: "<", types: ["number", "date", "text"] },
  { op: "lte", label: "≤", types: ["number", "date", "text"] },
  { op: "gt", label: ">", types: ["number", "date", "text"] },
  { op: "gte", label: "≥", types: ["number", "date", "text"] },
  { op: "in", label: "is one of", types: ["number", "text"] },
  { op: "contains", label: "contains", types: ["text", "date"] },
  { op: "is_null", label: "is empty", types: ["number", "text", "boolean", "date"] },
  { op: "not_null", label: "is not empty", types: ["number", "text", "boolean", "date"] },
];
const OP_LABEL = Object.fromEntries(OPS.map((o) => [o.op, o.label]));

export function chipText(c: FilterClause, fields: Field[]) {
  const f = fields.find((x) => x.name === c.field);
  const name = f?.label ?? c.field;
  if (c.op === "is_null" || c.op === "not_null") return `${name} ${OP_LABEL[c.op]}`;
  if (f?.type === "boolean" && c.op === "eq") return c.value === true || c.value === "true" ? name : `not ${name}`;
  const v = Array.isArray(c.value) ? c.value.join(" or ") : String(c.value);
  return `${name} ${OP_LABEL[c.op]} ${v}`;
}

interface Saved {
  id: number;
  name: string;
  author: string;
  filter: FilterClause[];
}

export function FilterBar({ fields, filter, onChange, count }: { fields: Field[]; filter: FilterClause[]; onChange: (f: FilterClause[]) => void; count: number | null }) {
  const [field, setField] = useState("winner");
  const [op, setOp] = useState<FilterOp>("eq");
  const [value, setValue] = useState("true");
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState(false);
  const [askNote, setAskNote] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [saveName, setSaveName] = useState("");

  const f = fields.find((x) => x.name === field);
  const ops = OPS.filter((o) => (f ? o.types.includes(f.type) : true));

  useEffect(() => {
    api<{ filters: Saved[] }>("/api/saved-filters").then((r) => setSaved(r.filters)).catch(() => {});
  }, []);

  const add = () => {
    if (!f) return;
    let v: unknown = value;
    if (op === "is_null" || op === "not_null") v = undefined;
    else if (op === "in") v = value.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (f.type === "number" ? Number(s) : s));
    else if (f.type === "number") v = Number(value);
    else if (f.type === "boolean") v = value === "true";
    onChange([...filter, { field, op, value: v }]);
  };

  const runAsk = async () => {
    setAsking(true);
    setAskNote(null);
    try {
      const r = await api<{ filter: FilterClause[]; explanation: string; count: number }>("/api/stories/ask", { body: { text: ask } });
      onChange(r.filter);
      setAskNote(`${r.explanation} (${r.count.toLocaleString()} stories)`);
    } catch (e) {
      setAskNote(`Error: ${(e as Error).message}`);
    }
    setAsking(false);
  };

  const save = async () => {
    if (!saveName.trim()) return;
    const row = await api<Saved>("/api/saved-filters", { body: { name: saveName, filter, author: authorName() } });
    setSaved([row, ...saved]);
    setSaveName("");
  };

  return (
    <div className="card space-y-3 p-3">
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder='Ask: for example "top ranked stories with one quote or none"'
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask.trim() && runAsk()}
          aria-label="Ask"
        />
        <button className="btn" onClick={runAsk} disabled={asking || !ask.trim()}>
          {asking ? "Asking…" : "Ask"}
        </button>
      </div>
      {askNote && <p className="text-xs text-stone-600">{askNote} The chips below are editable.</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label mr-1">Filter</span>
        {filter.length === 0 && <span className="text-xs text-stone-500">All ranked stories</span>}
        {filter.map((c, i) => (
          <span key={i} className="chip" data-testid="filter-chip">
            {chipText(c, fields)}
            <button className="ml-0.5 text-stone-400 hover:text-stone-900" onClick={() => onChange(filter.filter((_, j) => j !== i))} aria-label="Remove">
              ×
            </button>
          </span>
        ))}
        {filter.length > 0 && (
          <button className="text-xs text-stone-500 underline" onClick={() => onChange([])}>
            Clear
          </button>
        )}
        <span className="ml-auto text-sm">
          <b data-testid="story-count">{count === null ? "…" : count.toLocaleString()}</b> {count === 1 ? "story" : "stories"} match
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input"
          value={field}
          onChange={(e) => {
            setField(e.target.value);
            const nf = fields.find((x) => x.name === e.target.value);
            setOp("eq");
            setValue(nf?.type === "boolean" ? "true" : "");
          }}
          aria-label="Field"
        >
          {["ranking", "evidence", "runnable", "story", "sponsor"].map((g) => (
            <optgroup key={g} label={g}>
              {fields
                .filter((x) => x.group === g)
                .map((x) => (
                  <option key={x.name} value={x.name}>
                    {x.label} ({x.name})
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <select className="input" value={op} onChange={(e) => setOp(e.target.value as FilterOp)} aria-label="Operator">
          {ops.map((o) => (
            <option key={o.op} value={o.op}>
              {o.label}
            </option>
          ))}
        </select>
        {op !== "is_null" && op !== "not_null" &&
          (f?.type === "boolean" ? (
            <select className="input" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Value">
              <option value="true">yes</option>
              <option value="false">no</option>
            </select>
          ) : (
            <input
              className="input w-44"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder={op === "in" ? "3, 5" : f?.type === "number" ? "a number" : "text"}
              aria-label="Value"
            />
          ))}
        <button className="btn" onClick={add}>
          Add
        </button>
        <span className="mx-2 h-5 w-px bg-stone-200" />
        <span className="label">Quick</span>
        <button className="btn btn-sm" onClick={() => onChange([...filter, { field: "winner", op: "eq", value: true }])}>
          Winners
        </button>
        <button className="btn btn-sm" onClick={() => onChange([...filter, { field: "runnable_v3", op: "eq", value: true }])}>
          Runnable by v3
        </button>
        <button className="btn btn-sm" onClick={() => onChange([...filter, { field: "runnable_production", op: "eq", value: true }])}>
          Runnable by Production
        </button>
        <button className="btn btn-sm" onClick={() => onChange([...filter, { field: "quote_count", op: "lte", value: 1 }])}>
          quote_count ≤ 1
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-2">
        <span className="label">Saved filters</span>
        <select
          className="input"
          value=""
          onChange={(e) => {
            const s = saved.find((x) => x.id === Number(e.target.value));
            if (s) onChange(s.filter);
          }}
          aria-label="Saved filters"
        >
          <option value="">Open a saved filter…</option>
          {saved.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.author})
            </option>
          ))}
        </select>
        <input className="input w-48" placeholder="Name this filter" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
        <button className="btn btn-sm" onClick={save} disabled={!saveName.trim()}>
          Save filter
        </button>
      </div>
    </div>
  );
}
