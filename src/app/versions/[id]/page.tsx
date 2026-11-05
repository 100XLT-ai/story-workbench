"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { CommentBox } from "@/components/comment-box";
import { api } from "@/lib/client/api";
import { authorName } from "@/lib/client/name";
import { describeClause } from "@/lib/engine/filter";
import type { VersionDefinition } from "@/lib/engine/types";

interface Version {
  id: number;
  label: string;
  family: string;
  number: string;
  author: string;
  parentId: number | null;
  note: string | null;
  createdAt: string;
  definition: VersionDefinition;
}

export default function VersionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [v, setV] = useState<Version | null>(null);
  const [parent, setParent] = useState<Version | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Version>(`/api/versions/${id}`)
      .then(async (x) => {
        setV(x);
        if (x.parentId) setParent(await api<Version>(`/api/versions/${x.parentId}`));
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  const copy = async () => {
    const name = prompt("Name of the new family (the copy starts at 1.0):");
    if (!name) return;
    try {
      const nv = await api<{ id: number }>("/api/versions", { body: { parent_id: Number(id), changes: [], new_family: name, note: `Copy of ${v?.label}`, author: authorName() } });
      router.push(`/versions/${nv.id}`);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  if (error) return <p className="text-red-700">{error}</p>;
  if (!v) return <p className="text-stone-500">Loading…</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-stone-500">
            <Link href="/workflows" className="hover:underline">
              Workflows
            </Link>{" "}
            / {v.family}
          </div>
          <h1 className="text-xl font-semibold">{v.label}</h1>
          <p className="text-sm text-stone-600">
            Saved {v.createdAt.slice(0, 16)} UTC by {v.author}.{" "}
            {parent ? (
              <>
                Parent:{" "}
                <Link className="text-blue-700 hover:underline" href={`/versions/${parent.id}`}>
                  {parent.label}
                </Link>
                .
              </>
            ) : (
              "A seed or the first version of its family."
            )}
          </p>
          {v.note && <p className="mt-1 text-sm">Note: “{v.note}”</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-primary" href={`/versions/${v.id}/edit`}>
            Edit (makes a new version)
          </Link>
          <button className="btn" onClick={() => setShowJson(!showJson)}>
            {showJson ? "Hide" : "View as"} JSON
          </button>
          <a className="btn" href={`/api/versions/${v.id}/export`} download>
            Download JSON
          </a>
          <button className="btn" onClick={copy}>
            Copy to a new family
          </button>
        </div>
      </div>
      {showJson && <pre className="pre max-h-[40rem]">{JSON.stringify(v.definition, null, 2)}</pre>}
      <CommentBox versionId={v.id} steps={v.definition.steps} />
      <div className="card p-4">
        <h2 className="mb-2 font-semibold">Steps ({v.definition.steps.length})</h2>
        <table className="tbl w-full">
          <thead>
            <tr>
              <th>#</th>
              <th>Step</th>
              <th>Kind</th>
              <th>Model or function</th>
              <th>Runs when</th>
              <th>Reads → writes</th>
            </tr>
          </thead>
          <tbody>
            {v.definition.steps.map((s, i) => (
              <tr key={s.id}>
                <td className="text-xs text-stone-400">{i + 1}</td>
                <td>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-stone-600">{s.purpose}</div>
                </td>
                <td className="text-xs">{s.kind === "prompt" ? "model call" : "code"}</td>
                <td className="font-mono text-xs">
                  {s.kind === "prompt" ? (
                    <>
                      {s.model}
                      <div className="text-stone-500">
                        temp {s.temperature ?? "—"} · max {s.maxTokens ?? "—"} · reasoning {s.reasoning === null ? "none sent" : JSON.stringify(s.reasoning)} · {s.format}
                      </div>
                    </>
                  ) : (
                    s.fn
                  )}
                </td>
                <td className="text-xs">{s.when?.length ? s.when.map(describeClause).join(" and ") : "always"}</td>
                <td className="font-mono text-xs">
                  {s.inputs.join(", ")} → {s.outputs.join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 text-sm">
          <span className="label mr-2">Settings</span>
          <span className="font-mono text-xs">{JSON.stringify(v.definition.settings)}</span>
        </div>
      </div>
    </div>
  );
}
