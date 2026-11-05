"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, usd } from "@/lib/client/api";

interface RunRow {
  id: number;
  version: string;
  author: string;
  status: string;
  storyCount: number;
  done: number;
  failed: number;
  cost: number;
  estimatedCost: number | null;
  createdAt: string;
  finishedAt: string | null;
}

export default function RunsPage() {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  useEffect(() => {
    const load = () => api<{ runs: RunRow[] }>("/api/runs").then((r) => setRuns(r.runs));
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Runs</h1>
      <p className="text-sm text-stone-600">Every run, newest first. Open a run to see its results table.</p>
      <div className="card overflow-x-auto">
        <table className="tbl w-full">
          <thead>
            <tr>
              <th>Run</th>
              <th>Version</th>
              <th>Author</th>
              <th>Stories</th>
              <th>Status</th>
              <th>Cost (estimate)</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {(runs ?? []).map((r) => (
              <tr key={r.id} className="hover:bg-stone-50">
                <td>
                  <Link className="text-blue-700 hover:underline" href={`/runs/${r.id}`}>
                    Run {r.id}
                  </Link>
                </td>
                <td>{r.version}</td>
                <td>{r.author}</td>
                <td>
                  {r.done + r.failed}/{r.storyCount}
                  {r.failed ? <span className="ml-1 text-red-700">({r.failed} failed)</span> : null}
                </td>
                <td>{r.status}</td>
                <td>
                  {usd(r.cost, 4)} <span className="text-xs text-stone-500">({usd(r.estimatedCost, 2)})</span>
                </td>
                <td className="whitespace-nowrap text-xs">{r.createdAt.slice(0, 16).replace("T", " ")} UTC</td>
              </tr>
            ))}
            {runs?.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-stone-500">
                  No runs yet. Start one from the Stories page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
