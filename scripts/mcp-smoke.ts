/**
 * Drives the MCP server over Streamable HTTP, the way an MCP client does
 * (AC-21, AC-22, AC-23). No login, no token.
 *
 *   pnpm exec tsx scripts/mcp-smoke.ts https://<host>/mcp [ac21|ac22]
 *
 * ac21: initialize, tools/list, query_stories, start_run, get_run (until done), get_trace.
 * ac22: create_version from a parent plus one prompt change, run it on 3 stories,
 *       compare a trace with the parent's trace.
 */
const url = process.argv[2] ?? "http://localhost:3100/mcp";
const mode = process.argv[3] ?? "ac21";
let id = 0;

async function rpc(method: string, params: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const text = await res.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  const msg = JSON.parse(line ? line.slice(6) : text) as { result?: unknown; error?: { message: string } };
  if (msg.error) throw new Error(`${method}: ${msg.error.message}`);
  return msg.result;
}

async function tool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const r = (await rpc("tools/call", { name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  const text = r.content[0]?.text ?? "";
  if (r.isError) throw new Error(`${name}: ${text}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitRun(runId: number) {
  for (let i = 0; i < 120; i++) {
    const r = await tool<{ status: string; counts: Record<string, number>; cost: number }>("get_run", { run_id: runId });
    process.stdout.write(`  run ${runId}: ${r.status} ${JSON.stringify(r.counts)}\n`);
    if (r.status !== "running") return r;
    await sleep(15000);
  }
  throw new Error("the run did not end in 30 minutes");
}

async function main() {
  const init = (await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mcp-smoke", version: "1" } })) as { serverInfo: { name: string } };
  console.log(`initialize: ${init.serverInfo.name}`);
  const tools = (await rpc("tools/list", {})) as { tools: { name: string }[] };
  console.log(`tools/list: ${tools.tools.length} tools: ${tools.tools.map((t) => t.name).join(", ")}`);
  const res = (await rpc("resources/read", { uri: "workbench://guide" })) as { contents: { text: string }[] };
  console.log(`resources/read workbench://guide: ${res.contents[0].text.length} characters`);
  const versions = await tool<{ id: number; label: string }[]>("list_versions", {});
  const staged = versions.find((v) => v.label.startsWith("Staged writer 3.0"));
  if (!staged) throw new Error("no Staged writer 3.0");
  const q = await tool<{ total: number; rows: { id: number }[] }>("query_stories", {
    filter: [
      { field: "winner", op: "eq", value: true },
      { field: "runnable_v3", op: "eq", value: true },
      { field: "quote_count", op: "lte", value: 1 },
    ],
    limit: 3,
  });
  console.log(`query_stories: total ${q.total}, ids ${q.rows.map((r) => r.id).join(", ")}`);

  if (mode === "ac21") {
    const start = await tool<{ run_id: number }>("start_run", { version_id: staged.id, story_ids: [q.rows[0].id], author: "mcp-smoke", note: "AC-21" });
    console.log(`start_run: run ${start.run_id}`);
    await waitRun(start.run_id);
    const t = await tool<{ status: string; steps: { stepId: string; status: string; decided: string }[] }>("get_trace", { run_id: start.run_id, story_id: q.rows[0].id });
    console.log(`get_trace: ${t.status}, ${t.steps.length} steps; fit_title: ${t.steps.find((s) => s.stepId === "fit_title")?.decided}`);
    return;
  }

  // AC-22
  const v = await tool<{ id: number; label: string; diff: unknown[] }>("create_version", {
    parent_id: staged.id,
    author: "mcp-smoke",
    note: "AC-22: the writer must open with the people who were helped",
    changes: [{ step_id: "write", field: "user", new_value: `${(await tool<{ definition: { steps: { id: string; user?: string }[] } }>("get_version", { version_id: staged.id })).definition.steps.find((s) => s.id === "write")?.user}\n\nOPENING RULE: the first sentence names the people who were helped.` }],
  });
  console.log(`create_version: ${v.label} (${v.diff.length} changed field)`);
  const ids = q.rows.map((r) => r.id);
  const child = await tool<{ run_id: number }>("start_run", { version_id: v.id, story_ids: ids, author: "mcp-smoke", note: "AC-22 child" });
  const parent = await tool<{ run_id: number }>("start_run", { version_id: staged.id, story_ids: ids, author: "mcp-smoke", note: "AC-22 parent" });
  console.log(`start_run: child run ${child.run_id}, parent run ${parent.run_id}`);
  await waitRun(child.run_id);
  await waitRun(parent.run_id);
  const cmp = await tool<{ steps: { stepId: string; same: boolean }[] }>("compare_traces", { run_a: parent.run_id, run_b: child.run_id, story_id: ids[0] });
  console.log(`compare_traces: ${cmp.steps.length} steps, differ: ${cmp.steps.filter((s) => !s.same).map((s) => s.stepId).join(", ")}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
