import fs from "node:fs";
import path from "node:path";
import type { SeedPrompts } from "./seeds";

/** Reads the production prompt files (copied from longtale-core 136fa4ac as git blobs, LF). Scripts and tests only. */
export function loadSeedPrompts(root = path.resolve(__dirname, "../../../prompts")): SeedPrompts {
  const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
  return {
    article: read("long-article-generation-prompt.md"),
    base: read("base/general-context.md"),
    platforms: {
      facebook: read("platforms/facebook.md"),
      instagram: read("platforms/instagram.md"),
      linkedin: read("platforms/linkedin.md"),
      x: read("platforms/x.md"),
    },
    apStyle: read("style/ap-style.md"),
    outputSchema: JSON.parse(read("output-schema.json")) as unknown,
  };
}
