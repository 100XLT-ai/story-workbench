import Link from "next/link";
import { MarkdownDoc } from "@/components/markdown-doc";
import { GUIDE_DOCS, listHeadings, readGuideDoc, type GuideDoc } from "@/lib/guide-docs";

export function GuideView({ doc }: { doc: GuideDoc }) {
  const markdown = readGuideDoc(doc);
  const headings = listHeadings(markdown);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1">
        {Object.values(GUIDE_DOCS).map((d) => (
          <Link key={d.href} href={d.href} className={d.href === doc.href ? "tab-on" : "tab"}>
            {d.label}
          </Link>
        ))}
        <span className="ml-2 text-xs text-stone-500">
          Source: <code className="font-mono">{doc.file}</code>
        </span>
      </div>
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="On this page" className="lg:sticky lg:top-4 lg:self-start">
          <div className="card p-3">
            <div className="label mb-2">On this page</div>
            <ul className="space-y-1 text-sm">
              {headings.map((h) => (
                <li key={h.id} className={h.depth === 3 ? "pl-3 text-xs" : ""}>
                  <a href={`#${h.id}`} className="text-stone-700 hover:text-stone-950 hover:underline">
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
        <article className="card max-w-4xl px-6 py-5">
          <MarkdownDoc markdown={markdown} file={doc.file} />
        </article>
      </div>
    </div>
  );
}
