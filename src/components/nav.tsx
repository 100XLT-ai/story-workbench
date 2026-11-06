"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getName, setName } from "@/lib/client/name";

const LINKS = [
  { href: "/stories", label: "Stories" },
  { href: "/workflows", label: "Workflows" },
  { href: "/runs", label: "Runs" },
  { href: "/settings", label: "Settings" },
  { href: "/connect", label: "Connect Claude" },
  { href: "/guide", label: "Guide" },
];

export function Nav() {
  const path = usePathname();
  const [name, setNameState] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const n = getName();
    setNameState(n);
    if (!n) setAsking(true);
  }, []);

  const save = () => {
    const n = draft.trim();
    if (!n) return;
    setName(n);
    setNameState(n);
    setAsking(false);
  };

  return (
    <>
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-4 py-2.5">
          <Link href="/stories" className="text-sm font-semibold tracking-tight">
            Story Workbench
          </Link>
          <nav className="flex gap-1">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={path?.startsWith(l.href) ? "tab-on" : "tab"}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-xs text-stone-500">
            <span>
              You are <b className="text-stone-800">{name ?? "…"}</b>
            </span>
            <button
              className="btn btn-sm"
              onClick={() => {
                setDraft(name ?? "");
                setAsking(true);
              }}
            >
              Change
            </button>
          </div>
        </div>
      </header>
      {asking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="card w-[380px] p-5">
            <h2 className="text-base font-semibold">Your name?</h2>
            <p className="mt-1 text-sm text-stone-600">Every version, comment and run you make stores this name. The app keeps it in this browser. There is no login.</p>
            <input
              autoFocus
              className="input mt-3 w-full"
              placeholder="For example Noah"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
            <div className="mt-3 flex justify-end gap-2">
              {name && (
                <button className="btn" onClick={() => setAsking(false)}>
                  Cancel
                </button>
              )}
              <button className="btn-primary" onClick={save} disabled={!draft.trim()}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
