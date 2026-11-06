import Link from "next/link";
import Markdown, { type Components } from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { resolveDocLink } from "@/lib/guide-docs";

/** Renders one repo markdown file. Server component: no client JavaScript. */
export function MarkdownDoc({ markdown, file }: { markdown: string; file: string }) {
  const components: Components = {
    a: ({ href, children }) => {
      const link = resolveDocLink(href ?? "", file);
      if (link.kind === "app") return <Link href={link.href}>{children}</Link>;
      if (link.kind === "anchor") return <a href={link.href}>{children}</a>;
      return (
        <a href={link.href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
    table: ({ children }) => (
      <div className="card my-4 overflow-x-auto">
        <table>{children}</table>
      </div>
    ),
  };
  return (
    <div className="md">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={components}>
        {markdown}
      </Markdown>
    </div>
  );
}
