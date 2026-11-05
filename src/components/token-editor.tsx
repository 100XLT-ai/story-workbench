"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";

export interface TokenEditorHandle {
  insert: (text: string) => void;
}

/** A textarea that marks every {{token}} (a highlighted layer under a transparent textarea). */
export const TokenEditor = forwardRef<TokenEditorHandle, { value: string; onChange: (v: string) => void; rows?: number; onFocus?: () => void; label: string; known?: Set<string> }>(function TokenEditor(
  { value, onChange, rows = 10, onFocus, label, known },
  ref,
) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const layer = useRef<HTMLPreElement>(null);
  useImperativeHandle(ref, () => ({
    insert: (text: string) => {
      const el = ta.current;
      if (!el) return onChange(value + text);
      const s = el.selectionStart ?? value.length;
      const e = el.selectionEnd ?? value.length;
      onChange(value.slice(0, s) + text + value.slice(e));
      requestAnimationFrame(() => {
        el.focus();
        el.selectionStart = el.selectionEnd = s + text.length;
      });
    },
  }));
  const parts = value.split(/(\{\{[^}]*\}\})/g);
  const cls = "m-0 w-full whitespace-pre-wrap break-words p-2 font-mono text-xs leading-5";
  return (
    <div className="relative rounded-md border border-stone-300 bg-white focus-within:border-stone-500" style={{ height: `${rows * 1.25 + 1}rem` }}>
      <pre ref={layer} aria-hidden className={`${cls} pointer-events-none absolute inset-0 overflow-hidden text-stone-800`}>
        {parts.map((p, i) => {
          if (!p.startsWith("{{")) return <span key={i}>{p}</span>;
          const root = p.slice(2, -2).trim().split(/[.|]/)[0];
          const bad = known && !known.has(root);
          return (
            <span key={i} className={bad ? "rounded bg-red-200 text-red-900" : "token"}>
              {p}
            </span>
          );
        })}
        {"\n"}
      </pre>
      <textarea
        ref={ta}
        aria-label={label}
        spellCheck={false}
        className={`${cls} absolute inset-0 h-full resize-none overflow-auto bg-transparent text-transparent caret-stone-900 outline-none`}
        value={value}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (layer.current) layer.current.scrollTop = e.currentTarget.scrollTop;
        }}
      />
    </div>
  );
});
