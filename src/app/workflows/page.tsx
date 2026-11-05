"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DiffList, type FieldDiff } from "@/components/diff-view";
import { api } from "@/lib/client/api";
import { diffDefinitions } from "@/lib/version-logic";
import type { VersionDefinition } from "@/lib/engine/types";

interface VersionRow {
  id: number;
  familyId: number;
  family: string;
  number: string;
  label: string;
  author: string;
  parentId: number | null;
  note: string | null;
  createdAt: string;
  stepCount: number;
}
interface Family {
  id: number;
  name: string;
  description: string | null;
  versions: VersionRow[];
}

function Tree({ versions, parentId, depth }: { versions: VersionRow[]; parentId: number | null; depth: number }) {
  const ids = new Set(versions.map((v) => v.id));
  const kids = versions.filter((v) => (parentId === null ? v.parentId === null || !ids.has(v.parentId) : v.parentId === parentId));
  return (
    <>
      {kids.map((v) => (
        <div key={v.id}>
          <div className="flex items-baseline gap-2 border-b border-stone-100 py-1.5 text-sm" style={{ paddingLeft: depth * 22 }}>
            {depth > 0 && <span className="text-stone-300">└</span>}
            <Link className="font-medium text-blue-700 hover:underline" href={`/versions/${v.id}`}>
              {v.label}
            </Link>
            <span className="text-xs text-stone-500">
              {v.stepCount} steps · {v.createdAt.slice(0, 10)}
            </span>
            <span className="truncate text-xs text-stone-600">{v.note}</span>
            <span className="ml-auto flex shrink-0 gap-1">
              <Link className="btn btn-sm" href={`/versions/${v.id}/edit`}>
                Edit
              </Link>
            </span>
          </div>
          <Tree versions={versions} parentId={v.id} depth={depth + 1} />
        </div>
      ))}
    </>
  );
}

export default function WorkflowsPage() {
  const [families, setFamilies] = useState<Family[] | null>(null);
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const [diff, setDiff] = useState<FieldDiff[] | null>(null);
  useEffect(() => {
    api<{ families: Family[] }>("/api/families").then((r) => setFamilies(r.families));
  }, []);
  const all = (families ?? []).flatMap((f) => f.versions);
  const compare = async () => {
    if (!a || !b) return;
    const [va, vb] = await Promise.all([api<{ definition: VersionDefinition }>(`/api/versions/${a}`), api<{ definition: VersionDefinition }>(`/api/versions/${b}`)]);
    setDiff(diffDefinitions(va.definition, vb.definition));
  };
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Workflows and versions</h1>
        <p className="text-sm text-stone-600">A family is one writer. A version is one frozen set of steps. A change always makes a new version; the parent stays as it was.</p>
      </div>
      {(families ?? []).map((f) => (
        <div key={f.id} className="card p-4">
          <h2 className="font-semibold">{f.name}</h2>
          {f.description && <p className="mb-2 text-sm text-stone-600">{f.description}</p>}
          <Tree versions={f.versions} parentId={null} depth={0} />
        </div>
      ))}
      <div className="card p-4">
        <h2 className="font-semibold">Compare two versions</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select className="input" value={a ?? ""} onChange={(e) => setA(Number(e.target.value))} aria-label="Version A">
            <option value="">Version A…</option>
            {all.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          <span>and</span>
          <select className="input" value={b ?? ""} onChange={(e) => setB(Number(e.target.value))} aria-label="Version B">
            <option value="">Version B…</option>
            {all.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          <button className="btn" onClick={compare} disabled={!a || !b}>
            Compare
          </button>
        </div>
        {diff && (
          <div className="mt-3">
            <DiffList diff={diff} />
          </div>
        )}
      </div>
    </div>
  );
}
