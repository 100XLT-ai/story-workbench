"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { InputPreview } from "./input-preview";

interface VersionRow {
  id: number;
  label: string;
  family: string;
}

/** The story page's "What each prompt receives": choose a version, then preview (no model call). */
export function StoryInputPreview({ storyId }: { storyId: number }) {
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [versionId, setVersionId] = useState<number | null>(null);
  useEffect(() => {
    api<{ versions: VersionRow[] }>("/api/versions").then((r) => {
      setVersions(r.versions);
      setVersionId(r.versions.find((v) => v.family === "Staged writer")?.id ?? r.versions[0]?.id ?? null);
    });
  }, []);
  return (
    <div className="card p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">What each prompt receives</h2>
        <select className="input py-0.5 text-sm" value={versionId ?? ""} onChange={(e) => setVersionId(Number(e.target.value))} aria-label="Version to preview">
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      <InputPreview key={`${versionId}`} versionId={versionId} storyId={storyId} compact />
    </div>
  );
}
