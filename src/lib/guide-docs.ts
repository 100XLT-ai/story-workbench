import fs from "node:fs";
import path from "node:path";
import GithubSlugger from "github-slugger";

export interface GuideDoc {
  /** Repo-relative path of the markdown file, for example "docs/TEAM-GUIDE.md". */
  file: string;
  /** In-app route that shows the file. */
  href: string;
  label: string;
}

export const GUIDE_DOCS = {
  team: { file: "docs/TEAM-GUIDE.md", href: "/guide", label: "Team guide" },
  developers: { file: "README.md", href: "/guide/developers", label: "For developers" },
} satisfies Record<string, GuideDoc>;

export const REPO_BLOB_URL = "https://github.com/100XLT-ai/story-workbench/blob/main/";

/**
 * Reads the markdown at render time. The guide pages are static, so this runs
 * during `next build` and the text is baked into the HTML. next.config.ts also
 * traces both files for the /guide routes in case a route ever renders on demand.
 */
export function readGuideDoc(doc: GuideDoc): string {
  // Literal paths on purpose: a variable path makes Turbopack trace the whole
  // project into the server bundle.
  switch (doc.file) {
    case "docs/TEAM-GUIDE.md":
      return fs.readFileSync(path.join(process.cwd(), "docs/TEAM-GUIDE.md"), "utf8");
    case "README.md":
      return fs.readFileSync(path.join(process.cwd(), "README.md"), "utf8");
    default:
      throw new Error(`Unknown guide doc: ${doc.file}`);
  }
}

export interface Heading {
  depth: 2 | 3;
  text: string;
  id: string;
}

const inlineText = (s: string) =>
  s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();

/**
 * Lists the h2 and h3 headings for the table of contents. The ids come from
 * github-slugger, the same slugger that rehype-slug uses for the heading ids,
 * and the slugger sees every heading (h1 to h6) in order, so the duplicate
 * suffixes match too.
 */
export function listHeadings(markdown: string): Heading[] {
  const slugger = new GithubSlugger();
  const out: Heading[] = [];
  let fence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const text = inlineText(m[2]);
    const id = slugger.slug(text);
    const depth = m[1].length;
    if (depth === 2 || depth === 3) out.push({ depth, text, id });
  }
  return out;
}

/** Where a link in a guide doc goes: an in-app route, a page anchor or an external URL. */
export function resolveDocLink(href: string, docFile: string): { kind: "app" | "anchor" | "external"; href: string } {
  if (href.startsWith("#")) return { kind: "anchor", href };
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { kind: "external", href };
  if (href.startsWith("/")) return { kind: "app", href };
  const [target, hash] = href.split("#", 2);
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(docFile), target));
  const suffix = hash ? `#${hash}` : "";
  const doc = Object.values(GUIDE_DOCS).find((d) => d.file === resolved);
  if (doc) return { kind: "app", href: `${doc.href}${suffix}` };
  return { kind: "external", href: `${REPO_BLOB_URL}${resolved}${suffix}` };
}
