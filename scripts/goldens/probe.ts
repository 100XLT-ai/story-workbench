import "reflect-metadata";
const CORE = "C:/dev/a-empath-ai/longtale-core/.claude/worktrees/beautiful-lumiere-d74efc/apps/api";
async function main() {
  for (const m of [
    "/scripts/story-writer-test/harness.lib",
    "/src/api/modules/story-writer/story-writer.pipeline",
    "/src/api/modules/openrouter/openrouter.service",
    "/src/api/modules/organic-social/organic-social.prompt.helper",
    "/src/api/modules/organic-social/organic-social.service",
    "/src/api/modules/story/story.service",
    "/src/api/modules/story/ad-copy/ad-copy-generator.service",
  ]) {
    try { const mod = require(CORE + m) as Record<string, unknown>; console.log("ok", m, Object.keys(mod).slice(0, 8).join(",")); }
    catch (e) { console.log("FAIL", m, (e as Error).message.slice(0, 300)); }
  }
}
main();
