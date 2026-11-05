"use client";

import { useEffect, useState } from "react";

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="relative">
      <pre className="pre pr-16">{text}</pre>
      <button
        className="btn btn-sm absolute right-2 top-2"
        onClick={() => {
          navigator.clipboard?.writeText(text).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          });
        }}
      >
        {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export default function ConnectPage() {
  const [origin, setOrigin] = useState("https://story-workbench.vercel.app");
  useEffect(() => setOrigin(window.location.origin), []);
  const mcp = `${origin}/mcp`;
  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">Connect Claude and other tools</h1>
      <p className="text-sm text-stone-600">The API and the MCP server are open: no login and no token. Anyone with the URL can read, run and edit.</p>
      <div className="card space-y-2 p-4">
        <h2 className="font-semibold">REST API</h2>
        <p className="text-sm">
          Base URL: <code className="font-mono">{origin}/api</code> · OpenAPI document:{" "}
          <a className="text-blue-700 hover:underline" href="/api/openapi.json">
            /api/openapi.json
          </a>
        </p>
        <Copy text={`curl "${origin}/api/stories?filter=%5B%7B%22field%22%3A%22winner%22%2C%22op%22%3A%22eq%22%2C%22value%22%3Atrue%7D%5D&limit=5"`} />
      </div>
      <div className="card space-y-2 p-4">
        <h2 className="font-semibold">Claude Code</h2>
        <Copy text={`claude mcp add --transport http story-workbench ${mcp}`} />
      </div>
      <div className="card space-y-2 p-4">
        <h2 className="font-semibold">Claude Desktop</h2>
        <p className="text-sm">Settings → Connectors → Add custom connector, with the URL below. Or add this to claude_desktop_config.json:</p>
        <Copy text={JSON.stringify({ mcpServers: { "story-workbench": { command: "npx", args: ["-y", "mcp-remote", mcp] } } }, null, 2)} />
      </div>
      <div className="card space-y-2 p-4">
        <h2 className="font-semibold">claude.ai</h2>
        <p className="text-sm">Settings → Connectors → Add custom connector. Name: Story Workbench. URL:</p>
        <Copy text={mcp} />
        <p className="text-xs text-stone-500">No OAuth: leave the advanced settings empty.</p>
      </div>
      <div className="card space-y-2 p-4">
        <h2 className="font-semibold">What you can ask Claude</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>“Find the winners with no quotes that v3 can run.”</li>
          <li>“Run Staged writer 3.0 on three of them and tell me when it ends.”</li>
          <li>“Show me what the select step decided for story 14807 in run 1.”</li>
          <li>“Make a version of Staged writer 3.0 whose headlines have 8 words or fewer, run it on the same stories and compare the traces.”</li>
          <li>“Which step costs the most in run 12?”</li>
          <li>“Read the workbench guide (workbench://guide) and explain the One-call writer.”</li>
        </ul>
        <p className="text-sm text-stone-600">
          Tools: list_story_fields, query_stories, ask_stories, get_story, list_families, list_versions, get_version, create_version, propose_edit, estimate_run, start_run, get_run, get_trace, compare_traces, export_run, list_registry. Resource: workbench://guide.
        </p>
      </div>
    </div>
  );
}
